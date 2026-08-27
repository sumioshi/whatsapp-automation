#!/usr/bin/env python3
"""
Extrai o perfil de escrita do operador a partir do histórico coletado.

A ideia: em vez de descrever a própria voz de memória (que sempre sai idealizada),
medir como você REALMENTE escreve, nas suas mensagens já enviadas. O relatório que
sai daqui preenche a SKILL.md desta pasta.

Recorte importante — passe --antes com a data em que a automação começou a enviar
por você. Depois dessa data as mensagens `fromMe` são da IA, e incluí-las faz o
perfil aprender o próprio eco.

Uso:
    python3 extrair-voz.py --data data --antes 2026-06-01
    python3 extrair-voz.py --data data --antes 2026-06-01 --chats dm-5511999 grupo-x
"""

import argparse
import collections
import datetime
import json
import pathlib
import re

EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
RISO = re.compile(r"k{2,}|(?:ha){2,}|rs+", re.I)
GIRIA = re.compile(
    r"\b(mano|cara|po|vlw|tmj|bora|top|massa|show|blz|beleza|opa|eita|vish|"
    r"pqp|mds|slk|foda|caraca|nossa|uai|oxe|pera)\b",
    re.I,
)
TRABALHO = re.compile(
    r"\b(projeto|cliente|deploy|prazo|orçamento|proposta|contrato|entrega|"
    r"sistema|plataforma|pagamento|reunião|fatura)\b",
    re.I,
)


def carregar(data_dir, antes, chats):
    """Devolve {slug: [mensagens minhas com texto]} dentro do recorte."""
    por_chat = {}
    for msgs in sorted(pathlib.Path(data_dir).glob("*/messages.jsonl")):
        slug = msgs.parent.name
        if chats and slug not in chats:
            continue
        minhas = []
        for linha in msgs.open(errors="ignore"):
            try:
                m = json.loads(linha)
            except json.JSONDecodeError:
                continue  # linha truncada
            ts = m.get("timestamp") or ""
            if not ts or (antes and ts >= antes) or not m.get("fromMe"):
                continue
            texto = (m.get("text") or "").strip()
            if texto:
                minhas.append({"ts": ts, "t": texto})
        if minhas:
            minhas.sort(key=lambda x: x["ts"])
            por_chat[slug] = minhas
    return por_chat


def proporcao(textos, teste):
    return sum(1 for t in textos if teste(t)) / len(textos) * 100


def registro(textos):
    """Score alto = informal (risada, gíria, balão curto). Baixo = registro de trabalho."""
    n = len(textos)
    riso = sum(1 for t in textos if RISO.search(t)) / n
    giria = sum(1 for t in textos if GIRIA.search(t)) / n
    trab = sum(1 for t in textos if TRABALHO.search(t)) / n
    curta = sum(1 for t in textos if len(t) < 20) / n
    return round(riso * 3 + giria * 1.5 + curta * 1.5 - trab * 4, 2)


def triagem(por_chat, minimo):
    print(f"\n{'='*70}\nTRIAGEM — separe os chats por registro antes de extrair\n{'='*70}")
    print("Score alto = pessoal/informal. Score baixo = trabalho.")
    print("Rode de novo com --chats <slugs> para extrair cada grupo separado.\n")
    print(f"{'score':>6} {'msgs':>6} {'médio':>6}  chat")
    linhas = []
    for slug, msgs in por_chat.items():
        if len(msgs) < minimo:
            continue
        textos = [m["t"] for m in msgs]
        medio = sum(len(t) for t in textos) // len(textos)
        linhas.append((registro(textos), len(textos), medio, slug))
    for score, n, medio, slug in sorted(linhas, reverse=True):
        print(f"{score:>6} {n:>6} {medio:>6}  {slug}")
    print(f"\n{len(linhas)} chats com pelo menos {minimo} mensagens suas.")


def rajadas(por_chat, gap=90):
    """Balões consecutivos do mesmo remetente contam como uma rajada."""
    tamanhos = collections.Counter()
    for msgs in por_chat.values():
        corrente = 1
        for a, b in zip(msgs, msgs[1:]):
            ta = datetime.datetime.fromisoformat(a["ts"].replace("Z", "+00:00"))
            tb = datetime.datetime.fromisoformat(b["ts"].replace("Z", "+00:00"))
            if (tb - ta).total_seconds() < gap:
                corrente += 1
            else:
                tamanhos[corrente] += 1
                corrente = 1
        tamanhos[corrente] += 1
    return tamanhos


def perfil(por_chat):
    textos = [m["t"] for msgs in por_chat.values() for m in msgs]
    n = len(textos)
    if not n:
        print("Nenhuma mensagem no recorte. Confira --data e --antes.")
        return

    print(f"\n{'='*70}\nPERFIL — {n} mensagens suas, {len(por_chat)} chats\n{'='*70}")

    tam = sorted(len(t) for t in textos)
    print(f"\n## Tamanho do balão")
    print(f"  mediana {tam[n//2]} · p25 {tam[n//4]} · p75 {tam[3*n//4]} · p95 {tam[int(.95*n)]}")

    r = rajadas(por_chat)
    total_r = sum(r.values())
    media_r = sum(k * v for k, v in r.items()) / total_r
    print(f"\n## Rajada (balões seguidos, gap < 90s)")
    print(f"  média {media_r:.2f} balões · " + " · ".join(
        f"{k}: {v/total_r*100:.0f}%" for k, v in sorted(r.items())[:5]))

    print(f"\n## Pontuação e caixa (preencha a tabela da SKILL.md com isto)")
    for rotulo, teste in [
        ("sem pontuação final", lambda t: t[-1] not in ".?!…"),
        ("ponto final", lambda t: t.endswith(".") and not t.endswith("...")),
        ("interrogação", lambda t: t.endswith("?")),
        ("vírgula", lambda t: "," in t),
        ("maiúscula inicial", lambda t: t[:1].isupper()),
        ("tudo minúsculo", lambda t: t == t.lower() and any(c.isalpha() for c in t)),
        ("emoji", lambda t: bool(EMOJI.search(t))),
        ("risada", lambda t: bool(RISO.search(t))),
        ("multi-linha", lambda t: "\n" in t),
    ]:
        print(f"  {rotulo:>22}: {proporcao(textos, teste):.0f}%")

    print(f"\n## Abreviação — conte os dois lados antes de escolher um")
    baixo = [t.lower() for t in textos]
    def conta(p):
        return sum(len(re.findall(rf"\b{p}\b", t)) for t in baixo)
    for a, b in [("vc", "você"), ("q", "que"), ("pra", "para"), ("pq", "porque"),
                 ("tb", "também"), ("n", "não"), ("to", "estou"), ("ta", "está")]:
        print(f"  {a}={conta(a):<5} {b}={conta(b)}")

    print(f"\n## Teto de frequência — nenhum marcador deve virar bordão")
    primeiras = collections.Counter()
    for t in textos:
        w = re.split(r"[\s,!?.]+", t.strip().lower())[0][:12]
        if w:
            primeiras[w] += 1
    total_p = sum(primeiras.values())
    topo, qtd = primeiras.most_common(1)[0]
    print(f"  {len(primeiras)} aberturas distintas · a mais comum ('{topo}') é só {qtd/total_p*100:.1f}%")
    print("  top 15: " + " · ".join(f"{k} {v/total_p*100:.1f}%" for k, v in primeiras.most_common(15)))

    print(f"\n## Abertura: primeiro contato vs continuação")
    prim, cont = [], []
    for msgs in por_chat.values():
        prim.append(msgs[0]["t"])
        cont.extend(m["t"] for m in msgs[1:])
    for rotulo, pool in [("1º contato", prim), ("continuação", cont)]:
        if not pool:
            continue
        marca = {p: proporcao(pool, lambda t, p=p: t.lower().startswith(p))
                 for p in ("opa", "olá", "ola", "oi", "bom dia", "boa tarde", "boa noite", "fala")}
        print(f"  {rotulo:>12} (n={len(pool)}): " +
              " · ".join(f"{k} {v:.0f}%" for k, v in marca.items() if v >= 1))

    print(f"\n## Emoji usado (a paleta é fechada — fora dela entrega)")
    emo = collections.Counter(e for t in textos for e in EMOJI.findall(t))
    print("  " + (" ".join(f"{k}×{v}" for k, v in emo.most_common(12)) or "(nenhum)"))

    print(f"\n## Risada, exatamente como você escreve")
    riso = collections.Counter(r for t in textos for r in RISO.findall(t.lower()))
    print("  " + (" · ".join(f"'{k}' ×{v}" for k, v in riso.most_common(8)) or "(nenhuma)"))

    print(f"\n## Palavras mais usadas")
    palavras = collections.Counter()
    for t in baixo:
        palavras.update(re.findall(r"[a-zà-ú0-9']+", t))
    print("  " + ", ".join(f"{k}({v})" for k, v in palavras.most_common(40)))

    print(f"\n## Mensagens que você mais repete")
    repetidas = collections.Counter(t.lower() for t in textos if len(t) < 40)
    print("  " + ", ".join(f'"{k}"×{v}' for k, v in repetidas.most_common(15)))

    print("\nAgora leia 30–40 rajadas suas de verdade antes de escrever a SKILL.md —")
    print("estatística dá as proporções, mas o ritmo e o jeito de virar uma frase")
    print("só aparecem lendo. Copie exemplos REAIS pra skill, não invente frases.\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data", help="diretório do coletor (default: data)")
    ap.add_argument("--antes", default=None, metavar="YYYY-MM-DD",
                    help="use só mensagens ANTERIORES a esta data — a data em que a "
                         "automação começou a enviar por você")
    ap.add_argument("--chats", nargs="*", default=None,
                    help="restringe a estes slugs (use depois da triagem)")
    ap.add_argument("--min", type=int, default=25,
                    help="mínimo de mensagens suas pra um chat entrar na triagem")
    ap.add_argument("--triagem", action="store_true",
                    help="só lista os chats por registro, sem extrair o perfil")
    args = ap.parse_args()

    por_chat = carregar(args.data, args.antes, set(args.chats) if args.chats else None)
    if not por_chat:
        print(f"Nada encontrado em {args.data}/*/messages.jsonl dentro do recorte.")
        return
    if args.triagem or not args.chats:
        triagem(por_chat, args.min)
    if not args.triagem:
        perfil(por_chat)


if __name__ == "__main__":
    main()
