# Design

Sistema visual **"Signal Room"** — central de triagem grau-terminal. Ancorado em referências reais (Warp + Langbase = base terminal/command-center; Vapi = motivo de sinal de áudio). Tokens em `web/app/globals.css` via `@theme`; primitivos em `web/app/components/ui/`.

## Theme

Dark, sempre. Cena física: dev olhando o Mac o dia todo, em ambiente de trabalho, triando sinal entre muito ruído — escuro reduz fadiga e faz o acento ember "acender" como sinal.

## Color

Estratégia: **restrained** (neutros graphite + um acento ember ≤ ~10% da superfície). Sem verde-WhatsApp de marca.

| Papel | Token | Valor |
|---|---|---|
| Canvas | `--color-bg` | `#0d0d0f` |
| Superfície | `--color-surface` / `-2` / `--color-elevated` | `#151518` / `#1b1b20` / `#212128` |
| Borda hairline | `--color-line` / `-2` | `#232327` / `#2e2e35` |
| Texto | `--color-fg` / `-dim` / `-faint` | `#f4f4f3` / `#8c8c93` / `#5a5a62` |
| **Acento (ember)** | `--color-accent` / `-2` / `-ink` | `#ff7a2d` / `#ff9a5c` / `#1a0f06` |
| Status OK (conexão) | `--color-ok` | `#3fb950` |
| Erro | `--color-danger` | `#f85149` |
| Info (handles/menção) | `--color-info` | `#4da3ff` |

Regras de papel: ember só em ação primária, item ativo, "você", menção a você, equalizer. Verde só no dot de conexão. Info azul nos nomes de remetente e menções a terceiros.

## Typography

- **Geist Sans** (UI) + **Geist Mono** (rótulos técnicos) — pareadas no eixo de contraste sans/mono, não duas sans parecidas.
- `.mono` = Geist Mono + `letter-spacing: -0.02em` + `tnum`. Usado em timestamps, tipo de mídia, contadores, wordmark, separadores de data.
- Corpo de mensagem em sans, `leading-relaxed`.

## Components (`web/app/components/ui/`)

`Button` (primary/ghost/subtle/danger · sm/md · loading), `IconButton`, `Input`, `Textarea`, `Select`, `Field` (label mono + hint/erro), `Card`/`CardHeader`/`SectionLabel`, `Badge`, `Toggle`, `Spinner`, `EmptyState`, helper `cn`. Raio: `--radius-card` 12px, `--radius-control` 8px.

## Layout

- App shell: sidebar (w-80, grupos + busca + status) | main (header + timeline + composer).
- Timeline sobre `.signal-grid` (grid de terminal 32px sutil). Bolhas: "você" com tint ember à direita, terceiros graphite com borda hairline à esquerda. Separadores de data em pílula mono.
- Mídia em molduras com `border-line`; áudio num painel com a assinatura do equalizer.

## Motion

- Curvas ease-out (quart/expo), sem bounce/elastic. Durações curtas (120–260ms).
- **Assinatura:** equalizer dos áudios reage ao playback real (Web Audio analyser), com fallback CSS.
- Entradas de mensagem nova sutis (fade+rise só na recém-chegada), reveals de transcrição/documento por expand+fade, foco do composer com anel ember, hover de bolha realça borda.
- `prefers-reduced-motion: reduce` → equalizer estático e entradas viram crossfade/instantâneo.

## Signature move

O **equalizer de áudio** (barras ember) é o elemento memorável — amarra o visual ao que o produto mais tem (voz) e reage ao conteúdo tocando, em vez de só decorar.
