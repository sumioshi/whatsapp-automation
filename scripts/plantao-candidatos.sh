#!/bin/sh
# Candidatos de chat pro plantão: ranqueia os chats da nuvem por similaridade
# com os tokens dados (ex.: nome do projeto/pasta) e por atividade recente.
# Uso: plantao-candidatos.sh [token ...]     (sem token = mais ativos)
# Saída: até 4 linhas "slug | nome | ultima_msg", melhor primeiro.
# Requer WAC_CLOUD_URL/USER/PASS no .env da raiz do repo (ou no ambiente).

set -u
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

curl -s -u "$WAC_CLOUD_USER:$WAC_CLOUD_PASS" "$WAC_CLOUD_URL/api/groups/summary" |
  python3 -c '
import json, sys, unicodedata
from difflib import SequenceMatcher

def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "".join(c if c.isalnum() else " " for c in s).strip()

tokens = [norm(t) for t in sys.argv[1:] if norm(t)]
chats = json.load(sys.stdin)

def score(g):
    alvo = norm(str(g.get("name", ""))) + " " + norm(g.get("slug", ""))
    s = 0.0
    for t in tokens:
        if t and t in alvo:
            s += 100
        s += max(
            (SequenceMatcher(None, t, p).ratio() for p in alvo.split() or [""]),
            default=0,
        ) * 50
    if not g.get("slug", "").startswith("dm-"):
        s += 5  # leve preferência por grupo sobre DM
    return s

# similaridade manda; atividade recente desempata (e vira o critério sem tokens)
chats.sort(key=lambda g: (score(g) if tokens else 0, g.get("lastTimestamp") or ""), reverse=True)
for g in chats[:4]:
    print(g.get("slug"), "|", g.get("name"), "|", (g.get("lastTimestamp") or "?")[:16])
' "$@"
