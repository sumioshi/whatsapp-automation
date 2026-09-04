#!/bin/sh
# Instala o chamador do executor de PR num repositório de cliente ABRINDO UM PR
# (nunca push na branch padrão). Idempotente: se o chamador já estiver igual, não faz nada.
#   scripts/agente-pr-instalar.sh [--dry-run] <owner/repo> [<owner/repo> ...]
set -eu

DRY=0
if [ "${1:-}" = "--dry-run" ]; then DRY=1; shift; fi
[ $# -ge 1 ] || { echo "uso: agente-pr-instalar.sh [--dry-run] <owner/repo> [...]" >&2; exit 2; }

# Qualquer argumento que comece com "--" além do --dry-run inicial é opção não
# reconhecida, não repositório — recusa em vez de deixar virar parte de uma URL
# do git (ex.: "git@host:--algo.git" é interpretado como flag pelo git/ssh).
for A in "$@"; do
  case "$A" in
    --*) echo "uso: agente-pr-instalar.sh [--dry-run] <owner/repo> [...]" >&2; exit 2 ;;
  esac
done

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

# Instala num único repositório. Roda em subshell (o `(` abre um processo filho)
# pra isolar erro e limpeza: se algo aqui falhar sob `set -e`, só este repositório
# aborta — o `trap` local apaga o clone temporário na saída (sucesso ou erro) sem
# derrubar o restante do lote, e o `for` principal segue pro próximo repositório.
instalar_em() (
  # `set -eu` explícito aqui dentro: quando o chamador precisa desarmar o -e pra
  # capturar o código de saída (POSIX ignora -e num comando que é a própria
  # condição de um if/while/&&/||), o subshell herdaria +e do ambiente externo
  # se não reafirmasse a sua própria regra — sem isso, um git que falha no meio
  # da instalação não aborta o subshell, some o erro e o repositório é contado
  # como sucesso.
  set -eu
  REPO="$1"
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT

  git clone -q --depth 1 "git@github.com-personal:$REPO.git" "$TMP"
  BASE=$(git -C "$TMP" symbolic-ref --short HEAD)

  if git -C "$TMP" ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
    # Já existe um PR em aberto dessa instalação: busca só essa branch (clone
    # raso trouxe apenas a branch padrão) e decide em cima dela, não da padrão.
    git -C "$TMP" fetch -q --depth 1 origin "$BRANCH"
    git -C "$TMP" checkout -q -b "$BRANCH" FETCH_HEAD
    if [ -f "$TMP/$ARQUIVO" ] && [ "$(cat "$TMP/$ARQUIVO")" = "$CHAMADOR" ]; then
      echo "$REPO: PR já aberto: $(gh pr view "$BRANCH" --repo "$REPO" --json url -q .url)"
      return 0
    fi
    mkdir -p "$TMP/.github/workflows"
    printf '%s\n' "$CHAMADOR" > "$TMP/$ARQUIVO"
    git -C "$TMP" add "$ARQUIVO"
    git -C "$TMP" -c commit.gpgsign=false commit -q -m "ci: executor de PR do despacho (label claude abre PR draft)"
    # Estamos em cima do HEAD remoto da própria branch (acabou de vir do fetch):
    # push reto, sem --force-with-lease (não é uma reescrita, é um avanço normal).
    git -C "$TMP" push -q -u origin "$BRANCH"
  else
    if [ -f "$TMP/$ARQUIVO" ] && [ "$(cat "$TMP/$ARQUIVO")" = "$CHAMADOR" ]; then
      echo "$REPO: chamador já instalado"
      return 0
    fi
    git -C "$TMP" checkout -q -b "$BRANCH"
    mkdir -p "$TMP/.github/workflows"
    printf '%s\n' "$CHAMADOR" > "$TMP/$ARQUIVO"
    git -C "$TMP" add "$ARQUIVO"
    git -C "$TMP" -c commit.gpgsign=false commit -q -m "ci: executor de PR do despacho (label claude abre PR draft)"
    # Branch nova, ninguém mais escreve nela: push reto também.
    git -C "$TMP" push -q -u origin "$BRANCH"
  fi

  ERRLOG=$(mktemp)
  if URL=$(gh pr create --repo "$REPO" --base "$BASE" --head "$BRANCH" \
    --title "ci: executor de PR do despacho" \
    --body "Quando uma issue recebe a label \`claude\` (aplicada pelo despacho com \`ok N\`), o workflow reutilizável \`minha-org/agentes\` roda o Claude, implementa só o que a issue pede e abre um PR draft com \`Closes #n\`.

Requer o secret \`CLAUDE_CODE_OAUTH_TOKEN\` neste repositório (\`scripts/agente-secrets.sh\` no whatsapp-automation grava em lote)." 2>"$ERRLOG"); then
    rm -f "$ERRLOG"
  elif URL=$(gh pr view "$BRANCH" --repo "$REPO" --json url -q .url 2>>"$ERRLOG"); then
    rm -f "$ERRLOG"
  else
    echo "$REPO: falha ao abrir/consultar o PR:" >&2
    cat "$ERRLOG" >&2
    rm -f "$ERRLOG"
    return 1
  fi
  echo "$REPO: $URL"
)

if [ "$DRY" = 1 ]; then
  for REPO in "$@"; do
    echo "[dry-run] $REPO: criaria $ARQUIVO na branch $BRANCH e abriria PR"
  done
  exit 0
fi

ok=0; erro=0
for REPO in "$@"; do
  # `instalar_em` não pode ser a condição direta de um if/&&/||: POSIX ignora o
  # -e do subshell em qualquer comando usado como condição (recursivamente, pra
  # tudo dentro dele) — um git que falhasse no meio não abortaria a instalação,
  # e o repositório seria contado como sucesso. Por isso: desarma o -e só em
  # volta da chamada simples, captura o código de saída, rearma o -e depois.
  set +e
  instalar_em "$REPO"
  rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    ok=$((ok + 1))
  else
    echo "$REPO: ERRO" >&2
    erro=$((erro + 1))
  fi
done
echo "$ok instalados, $erro com erro"
[ "$erro" = 0 ] || exit 1
