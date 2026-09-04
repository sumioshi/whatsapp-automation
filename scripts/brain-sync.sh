#!/bin/sh
# Espelha a memória e as skills do Claude Code do operador num repositório git
# privado (o "brain"), pra agentes na nuvem lerem o mesmo contexto do Mac.
# Uma via (Mac → brain). Só commita quando há mudança; nunca reescreve histórico.
#   BRAIN_DIR (default ~/brain)  BRAIN_REPO (default git@github.com:<org>/brain.git)
set -eu
BRAIN_DIR="${BRAIN_DIR:-$HOME/brain}"
BRAIN_REPO="${BRAIN_REPO:-git@github.com:<org>/brain.git}"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"

if [ ! -d "$BRAIN_DIR/.git" ]; then
  git clone -q "$BRAIN_REPO" "$BRAIN_DIR"
fi
cd "$BRAIN_DIR"
git pull -q --rebase --autostash || true

mkdir -p projects skills
# memória por projeto: só o subdiretório memory/ de cada projeto
rsync -a --delete --prune-empty-dirs \
  --include='*/' --include='*/memory/***' --exclude='*' \
  "$CLAUDE_DIR/projects/" projects/
# skills globais inteiras (podem conter contexto pessoal; o repo é privado).
# -L: várias skills são symlink pra fora de ~/.claude (outro repo local, ou
# .agents/skills/ deste mesmo projeto) — sem -L o link fica quebrado no brain,
# que não tem esses caminhos; -L copia o conteúdo apontado.
rsync -aL --delete --exclude='.DS_Store' "$CLAUDE_DIR/skills/" skills/
# algumas dessas skills são o próprio checkout de um repo git (ex: symlink pra
# um projeto em ~/Developer); sem isto o .git copiado junto vira gitlink
# (160000) no commit do brain — um ponteiro vazio, não o conteúdo do arquivo.
find skills -mindepth 2 -maxdepth 2 -type d -name .git -exec rm -rf {} +
# uma vez que um caminho vira gitlink no índice, `git add -A` sozinho não o
# reabsorve como árvore normal mesmo depois do .git sumir do disco — destrava
# aqui pra o sync se autocorrigir sem depender de intervenção manual.
STALE_GITLINKS="$(git ls-files -s -- skills | awk '$1=="160000"{print $4}')"
if [ -n "$STALE_GITLINKS" ]; then
  echo "$STALE_GITLINKS" | xargs -I{} git rm -r --cached --quiet -- {}
fi

if [ ! -f README.md ]; then
  cat > README.md <<'MD'
# brain

Espelho da memória (`projects/<projeto>/memory/`) e das skills (`skills/`) do Claude Code
do operador. Gerado por `scripts/brain-sync.sh` do repositório whatsapp-automation.
Consumido pelos workflows de triagem como contexto de leitura. Privado.
MD
fi

git add -A
if git diff --cached --quiet; then
  exit 0
fi
git -c commit.gpgsign=false commit -q -m "sync $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -q -u origin HEAD
