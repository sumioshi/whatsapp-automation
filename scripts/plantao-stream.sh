#!/bin/sh
# Plantão de mensagens via SSE da nuvem (/api/events).
# Uso: plantao-stream.sh <slug> [slug...]   |   plantao-stream.sh --alertar
#
# Imprime UMA linha por evento (cada linha acorda o agente quando este script é o
# command de um Monitor persistente do harness):
#   Fulano: texto                    mensagem recebida
#   Você (celular): texto            o operador respondeu na mão (celular ou web)
#   Painel (ana): texto             alguém da equipe respondeu pelo painel (contexto)
#   IA da Meta (sua conta): texto    resposta gerada pela Meta em nome da conta
#   Entrega interrompida (mensagem nova, 1/3 saiu) — releia o chat e responda de novo
#                                    uma entrega humanizada agendada não saiu (ou saiu pela
#                                    metade); entregas concluídas ficam em silêncio
# O eco do agente/MCP fica em silêncio (o servidor oculta com `ocultar=coletor`, e uma
# fromMe sem `origem`, de coletor antigo, também); envio de uma pessoa pelo painel aparece
# como Painel (login).
# Com mais de uma conversa, a linha vem com [slug] na frente.
#
# Reconecta sozinho e retoma de onde parou (guarda o último `id:` e reenvia em
# Last-Event-ID); o servidor manda ": ping" a cada 25s como keep-alive. Um lock por
# conjunto de conversas impede plantão em duplicata (segunda instância sai com 3).
# Variáveis de ambiente vencem o .env da raiz (WAC_CLOUD_URL/USER/PASS).
# PLANTAO_CLOUD=pessoal troca pro coletor PESSOAL (trio WAC_PESSOAL_URL/USER/PASS).
# PLANTAO_STATE_DIR (lock/cursor; default $TMPDIR ou /tmp), PLANTAO_RETRY_S (default 5).

set -u
[ $# -ge 1 ] || { echo "uso: plantao-stream.sh <slug> [slug...] | --alertar" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -z "${WAC_CLOUD_URL:-}" ] && [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

CLOUD="${PLANTAO_CLOUD:-principal}"
if [ "$CLOUD" = "pessoal" ]; then
  : "${WAC_PESSOAL_URL:?WAC_PESSOAL_URL não configurado (trio do coletor pessoal no .env da raiz)}"
  WAC_CLOUD_URL="$WAC_PESSOAL_URL"
  WAC_CLOUD_USER="${WAC_PESSOAL_USER:?WAC_PESSOAL_USER não configurado}"
  WAC_CLOUD_PASS="${WAC_PESSOAL_PASS:?WAC_PESSOAL_PASS não configurado}"
fi
: "${WAC_CLOUD_URL:?WAC_CLOUD_URL não configurado (defina no .env da raiz)}"
: "${WAC_CLOUD_USER:?WAC_CLOUD_USER não configurado}"
: "${WAC_CLOUD_PASS:?WAC_CLOUD_PASS não configurado}"

if [ "$1" = "--alertar" ]; then
  QUERY="alertar=1"
  KEY="alertar"
  MULTI=1
else
  SLUGS=$(printf '%s,' "$@")
  SLUGS=${SLUGS%,}
  QUERY="slug=$SLUGS"
  KEY=$(printf '%s' "$SLUGS" | tr -c 'A-Za-z0-9_-' '_')
  if [ $# -gt 1 ]; then MULTI=1; else MULTI=0; fi
fi
QUERY="$QUERY&ocultar=coletor"

STATE="${PLANTAO_STATE_DIR:-${TMPDIR:-/tmp}}"
if [ "$CLOUD" != "principal" ]; then KEY="$CLOUD-$KEY"; fi
LOCK="$STATE/plantao-$KEY.pid"
CURSOR="$STATE/plantao-$KEY.cursor"
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "plantão já ativo pra $KEY (pid $(cat "$LOCK")) — não armei outro" >&2
  exit 3
fi
printf '%s' "$$" > "$LOCK"
# Plantão novo começa em "agora": só a reconexão dentro desta execução retoma.
rm -f "$CURSOR"
trap 'rm -f "$LOCK" "$CURSOR"' EXIT INT TERM

conectar() {
  if [ -s "$CURSOR" ]; then
    curl -sN -u "$WAC_CLOUD_USER:$WAC_CLOUD_PASS" -H "Last-Event-ID: $(cat "$CURSOR")" \
      "$WAC_CLOUD_URL/api/events?$QUERY"
  else
    curl -sN -u "$WAC_CLOUD_USER:$WAC_CLOUD_PASS" "$WAC_CLOUD_URL/api/events?$QUERY"
  fi
}

EVENTO=""
while :; do
  conectar | while IFS= read -r line; do
    case "$line" in
    "id: "*) printf '%s' "${line#id: }" > "$CURSOR" ;;
    "event: "*) EVENTO="${line#event: }" ;;
    "data: "*)
      if [ "$EVENTO" = "entrega" ]; then
        EVENTO=""
        printf '%s\n' "${line#data: }" | MULTI="$MULTI" python3 -c 'import sys, json, os
m = json.loads(sys.stdin.read())
if m.get("estado") == "interrompido":
    pre = "[" + str(m.get("slug", "?")) + "] " if os.environ.get("MULTI") == "1" else ""
    motivos = {"mensagem_nova": "mensagem nova", "operador_respondeu": "operador respondeu na mão", "reinicio": "coletor reiniciou", "falha": "falha no envio"}
    motivo = motivos.get(m.get("motivo"), str(m.get("motivo")))
    saiu = str(m.get("enviados", 0)) + "/" + str(m.get("total", "?"))
    print(f"{pre}Entrega interrompida ({motivo}, {saiu} saiu) — releia o chat e responda de novo", flush=True)'
        continue
      fi
      EVENTO=""
      printf '%s\n' "${line#data: }" | MULTI="$MULTI" python3 -c 'import sys, json, os
m = json.loads(sys.stdin.read())
pre = "[" + str(m.get("slug", "?")) + "] " if os.environ.get("MULTI") == "1" else ""
texto = (m.get("text") or "").strip() or "[" + str(m.get("type", "")) + "]"
if m.get("fromMe"):
    o = m.get("origem")
    if m.get("ator") == "painel":
        login = m.get("usuario") or "?"
        print(f"{pre}Painel ({login}): {texto}", flush=True)
    elif o in ("celular", "web"):
        print(f"{pre}Você ({o}): {texto}", flush=True)
    elif o == "ia_meta":
        print(f"{pre}IA da Meta (sua conta): {texto}", flush=True)
else:
    quem = m.get("senderName") or m.get("sender") or "?"
    print(f"{pre}{quem}: {texto}", flush=True)'
      ;;
    esac
  done
  sleep "${PLANTAO_RETRY_S:-5}"
done
