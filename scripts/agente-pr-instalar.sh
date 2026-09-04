#!/bin/sh
# Instala o chamador do executor de PR num repositório de cliente ABRINDO UM PR
# (nunca push na branch padrão). Idempotente: se o chamador já estiver igual, não faz nada.
#   scripts/agente-pr-instalar.sh [--dry-run] <owner/repo> [<owner/repo> ...]
set -eu

DRY=0
if [ "${1:-}" = "--dry-run" ]; then DRY=1; shift; fi
[ $# -ge 1 ] || { echo "uso: agente-pr-instalar.sh [--dry-run] <owner/repo> [...]" >&2; exit 2; }

ARQUIVO=".github/workflows/agente-pr.yml"
BRANCH="agente/executor-pr"
CHAMADOR='name: Agente — issue vira PR
on:
  issues:
    types: [labeled]
jobs:
  executar:
    if: github.event.label.name == '"'"'claude'"'"'
    uses: minha-org/agentes/.github/workflows/agente-pr.yml@main
    secrets: inherit
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read'

for REPO in "$@"; do
  if [ "$DRY" = 1 ]; then
    echo "[dry-run] $REPO: criaria $ARQUIVO na branch $BRANCH e abriria PR"
    continue
  fi
  TMP=$(mktemp -d)
  git clone -q --depth 1 "git@github.com-personal:$REPO.git" "$TMP"
  BASE=$(git -C "$TMP" symbolic-ref --short HEAD)
  if [ -f "$TMP/$ARQUIVO" ] && [ "$(cat "$TMP/$ARQUIVO")" = "$CHAMADOR" ]; then
    echo "$REPO: chamador já instalado"
    rm -rf "$TMP"
    continue
  fi
  git -C "$TMP" checkout -q -b "$BRANCH"
  mkdir -p "$TMP/.github/workflows"
  printf '%s\n' "$CHAMADOR" > "$TMP/$ARQUIVO"
  git -C "$TMP" add "$ARQUIVO"
  git -C "$TMP" -c commit.gpgsign=false commit -q -m "ci: executor de PR do despacho (label claude abre PR draft)"
  git -C "$TMP" push -q -u origin "$BRANCH" --force-with-lease
  URL=$(gh pr create --repo "$REPO" --base "$BASE" --head "$BRANCH" \
    --title "ci: executor de PR do despacho" \
    --body "Quando uma issue recebe a label \`claude\` (aplicada pelo despacho com \`ok N\`), o workflow reutilizável \`minha-org/agentes\` roda o Claude, implementa só o que a issue pede e abre um PR draft com \`Closes #n\`.

Requer o secret \`CLAUDE_CODE_OAUTH_TOKEN\` neste repositório (\`scripts/agente-secrets.sh\` no whatsapp-automation grava em lote)." 2>/dev/null || gh pr view "$BRANCH" --repo "$REPO" --json url -q .url)
  echo "$REPO: $URL"
  rm -rf "$TMP"
done
