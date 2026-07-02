#!/bin/sh
# Plantão de mensagens de um chat via SSE da nuvem (/api/events).
# Uso: scripts/plantao-stream.sh <slug>
# Imprime UMA linha por mensagem nova ("Fulano: texto"), pulando as suas
# (fromMe) — feito pra ser o command de um Monitor persistente do harness:
# cada linha impressa acorda o agente. Reconecta sozinho se a conexão cair;
# o servidor manda ": ping" a cada 25s como keep-alive (ignorado aqui).
# Requer WAC_CLOUD_URL/USER/PASS no .env da raiz do repo (ou no ambiente).

set -u
SLUG="${1:?uso: plantao-stream.sh <slug>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

: "${WAC_CLOUD_URL:?WAC_CLOUD_URL não configurado (defina no .env da raiz)}"
: "${WAC_CLOUD_USER:?WAC_CLOUD_USER não configurado}"
: "${WAC_CLOUD_PASS:?WAC_CLOUD_PASS não configurado}"

while :; do
  curl -sN -u "$WAC_CLOUD_USER:$WAC_CLOUD_PASS" \
    "$WAC_CLOUD_URL/api/events?slug=$SLUG" |
    while IFS= read -r line; do
      case "$line" in
      "data: "*)
        printf '%s\n' "${line#data: }" | python3 -c 'import sys, json
m = json.loads(sys.stdin.read())
if not m.get("fromMe"):
    quem = m.get("senderName") or m.get("sender") or "?"
    texto = (m.get("text") or "").strip() or "[" + m.get("type", "") + "]"
    print(f"{quem}: {texto}", flush=True)'
        ;;
      esac
    done
  sleep 5
done
