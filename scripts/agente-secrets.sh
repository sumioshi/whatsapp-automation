#!/bin/sh
# Grava um secret do GitHub Actions em TODOS os repositórios vinculados a grupo (campo
# `github` do índice de links da nuvem) e no whatsapp-automation. O valor vem do stdin,
# nunca de argumento (não fica no histórico do shell nem em log).
#   printf '%s' "$TOKEN" | scripts/agente-secrets.sh CLAUDE_CODE_OAUTH_TOKEN
set -eu
NOME="${1:?uso: agente-secrets.sh <NOME_DO_SECRET>  (valor pelo stdin)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVFILE="$ROOT/.env"
if [ -f "$ENVFILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENVFILE"
  set +a
fi
: "${WAC_CLOUD_URL:?WAC_CLOUD_URL não configurado}"
: "${WAC_CLOUD_USER:?}" "${WAC_CLOUD_PASS:?}"

VALOR=$(cat)
[ -n "$VALOR" ] || { echo "valor vazio no stdin" >&2; exit 2; }

REPOS=$(curl -sS --fail -u "$WAC_CLOUD_USER:$WAC_CLOUD_PASS" "$WAC_CLOUD_URL/api/links" \
  | python3 -c 'import sys, json
links = json.load(sys.stdin)["links"]
vistos = set()
for v in links.values():
    g = v.get("github")
    if g and g not in vistos:
        vistos.add(g); print(g)')
REPOS="$REPOS
sumioshi/whatsapp-automation"

ok=0; erro=0
for R in $REPOS; do
  if printf '%s' "$VALOR" | gh secret set "$NOME" --repo "$R" >/dev/null 2>&1; then
    echo "$R: ok"; ok=$((ok + 1))
  else
    echo "$R: ERRO" >&2; erro=$((erro + 1))
  fi
done
echo "$ok gravados, $erro com erro"
[ "$erro" = 0 ]
