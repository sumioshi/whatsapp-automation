#!/usr/bin/env bash
# PreToolUse das tools de ESCRITA do whatsapp-collector.
#
# Instruções em prompt (server instructions, description de tool) são lembrete: o
# agente pode passar reto. Este hook é a trava — nega a primeira tentativa de envio
# quando a skill de voz não foi carregada na sessão, e o próprio agente se corrige
# carregando a skill e chamando de novo.
#
# Dois fail-opens deliberados: sem a skill instalada, ou sem transcript legível, ele
# não atrapalha. E depois de 2 avisos na mesma sessão ele libera — a trava é pra
# lembrar, não pra travar o operador num loop.
set -uo pipefail

# Nomes de skill que contam como "voz carregada". O molde versionado é o
# voz-do-operador; quem preenche o próprio perfil costuma guardá-lo fora do repo
# com outro nome — liste os seus em WAC_SKILLS_VOZ, separados por espaço.
SKILLS=${WAC_SKILLS_VOZ:-"voz-do-operador"}

# Sem nenhuma delas instalada, o hook não tem o que exigir.
INSTALADA=0
for nome in $SKILLS; do
  [ -f "$HOME/.claude/skills/$nome/SKILL.md" ] && INSTALADA=1
  [ -f ".claude/skills/$nome/SKILL.md" ] && INSTALADA=1
done
[ "$INSTALADA" = 1 ] || exit 0

IN=$(cat)
command -v jq >/dev/null 2>&1 || exit 0

TP=$(printf '%s' "$IN" | jq -r '.transcript_path // empty')
SID=$(printf '%s' "$IN" | jq -r '.session_id // "sem-id"')
[ -n "$TP" ] && [ -f "$TP" ] || exit 0

# Já carregou nesta sessão? O transcript registra a chamada da tool Skill.
for nome in $SKILLS; do
  grep -Eq "\"skill\" *: *\"$nome\"" "$TP" && exit 0
done

CONTA="${TMPDIR:-/tmp}/wac-exigir-voz-$SID"
N=$(( $(cat "$CONTA" 2>/dev/null || echo 0) + 1 ))
printf '%s' "$N" > "$CONTA"
[ "$N" -gt 2 ] && exit 0

jq -n --arg skills "$SKILLS" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ("Skill de voz do operador (" + $skills + ") não foi carregada nesta sessão. Carregue com a tool Skill, reescreva o texto na voz do operador (modo profissional se for cliente) e chame esta tool de novo.")
  }
}'
