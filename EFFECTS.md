# EFFECTS — efeitos & microinterações premium ("UAU sem AI slop")

Spec de motion para elevar o painel **Signal Room** ao nível de instrumento profissional. Cada efeito é copy-paste-ready, reusa os tokens/keyframes que já existem em `web/app/globals.css`, comunica um **estado real** (nunca decora), respeita a régua 120–260ms / ease-out / sem bounce, e traz variante `prefers-reduced-motion`.

## Como ler isto

- **Não duplicar:** já existem `.eq-bar`/`.eq-live-bar`, `.msg-in`, `.reveal`, `.pop-in`/`.overlay-in`, `.frost`, `.atmosphere-ember`, `.kbd`, `.accent-glow`, `.focus-ring`, `.signal-grid`, `.mono`, `--ease-out-quint` (`cubic-bezier(0.23,1,0.32,1)`), `--shadow-key`. Os efeitos abaixo **estendem** isso.
- **Tokens usados:** `--color-accent` (#ff7a2d), `--color-accent-2`, `--color-accent-ink`, `--color-ok`, `--color-line`/`-2`, `--color-fg-dim`/`-faint`, `--color-surface`/`-2`/`--color-elevated`.
- **Régua de gosto (herdada do DESIGN/PRODUCT):** ember só é sinal (você / ativo / menção / primário / áudio). Verde só status. Sem gradient-text, sem side-stripe, sem glass decorativo (glass só em overlay). Motion conveys state.

### Referências âncora (validadas no Refero, mesma família visual)

| Produto | Por que é referência aqui |
|---|---|
| **Axiom** (`axiom.co`) | "Dark Matter Console": near-black + **um laranja único (#DA5C2C) como spotlight de precisão**, depth por tonal shift (não shadow), mono Berkeley. É o Signal Room num site. Regra explícita: laranja **nunca** decorativo, só ação/ênfase. |
| **Three.tools** (`three.tools`) | "Midnight Command Center" com **ember-glow (#ff4300) exclusivo pra CTA/accent**, surfaces flat, depth por mudança de background. Mesma disciplina de acento que o nosso ember. |
| **Linear** (`linear.app`) | Elevation por **layering de superfícies** + acento (lime) restrito a ação; shadows contidos e nítidos (`rgba(0,0,0,0.4) 0 2px 4px`), nunca difusos. Referência canônica de UI otimista. |
| **Warp** (`warp.dev`) | Terminal-native; depth por surface shift; scanline/scan textures. Base do nosso "scan-line". |
| **Vercel** / **Cron (Notion Calendar)** | Number tickers sóbrios; Cron usa **laranja** como nosso. |
| **Vapi** (`vapi.ai`) | Sinal de áudio como protagonista — origem da assinatura do equalizer. |

---

## 1. Envio otimista + reconciliação — *Linear / Things*

Ao enviar, a bolha aparece **na hora** com estado "enviando" (leve dim + uma régua fina ember de progresso indeterminado), e reconcilia (some o dim, some a régua) quando o poll traz a mensagem real do coletor. Em falha: a bolha vira estado de erro com botão "tentar de novo".

**Estado que comunica:** "sua ação foi registrada agora" (responsividade de instrumento). Hoje o composer faz `setTimeout(onSent, 1000)` + refetch — parece formulário, não instrumento. O "responder rápido" é metade do propósito do produto.

**Por que encaixa:** Linear é a referência canônica de optimistic UI; a régua de progresso usa o ember como **sinal de "em trânsito"** (não decoração). Combina com o `.msg-in` que já existe.

**Spec (CSS):**
```css
/* Bolha sua em trânsito: dim sutil + régua ember indeterminada no rodapé. */
.msg-sending {
  opacity: 0.62;
  transition: opacity 180ms ease-out;
}
.msg-sending::after {
  content: "";
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 4px;
  height: 1.5px;
  border-radius: 9999px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--color-accent) 45%,
    var(--color-accent-2) 55%,
    transparent
  );
  background-size: 40% 100%;
  background-repeat: no-repeat;
  animation: sending-sweep 900ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes sending-sweep {
  0%   { background-position: -40% 0; }
  100% { background-position: 140% 0; }
}

/* Reconciliada: opacity volta a 1 (transition já cobre). Sem keyframe extra. */
.msg-failed {
  opacity: 1;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-danger) 45%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .msg-sending::after { animation: none; opacity: 0.5; background-position: 0 0; }
  .msg-sending { transition: none; }
}
```
**React (esqueleto):** a bolha recebe `status: "sending" | "sent" | "failed"` de um estado otimista local; dedup com a mensagem real do poll por um `clientId` temporário. Classe condicional `cn(status === "sending" && "msg-sending relative", status === "failed" && "msg-failed")`.

**Onde aplicar:** Composer → Timeline (bolha "você"). **Esforço:** M · **Risco:** médio (dedup com o poll; reverter em falha).

---

## 2. Spotlight ember scroll-to-message — *Notion peek / Arc*

Ao clicar num resultado de busca, item da inbox ou citação (reply), rolar até a mensagem e dar um **flash ember que decai** (~1.2s) ancorado naquela bolha — não só posicionar o scroll.

**Estado que comunica:** "é **esta** aqui" num feed denso. Ember = "olhe aqui" já é a regra de cor do projeto; usar o acento como holofote temporário é literalmente "acento é sinal".

**Por que encaixa:** Notion faz isso ao linkar pra um bloco; em timeline densa evita perder o alvo. Reusa a lógica de glow do `.accent-glow` mas temporal.

**Spec (CSS):**
```css
@keyframes spotlight-ember {
  0% {
    background-color: color-mix(in oklab, var(--color-accent) 22%, transparent);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--color-accent) 50%, transparent);
  }
  100% {
    background-color: transparent;
    box-shadow: 0 0 0 1px transparent;
  }
}
.spotlight {
  animation: spotlight-ember 1200ms var(--ease-out-quint) both;
  border-radius: var(--radius-card);
}
@media (prefers-reduced-motion: reduce) {
  /* Highlight estático que some por timeout via JS (sem animação). */
  .spotlight {
    animation: none;
    background-color: color-mix(in oklab, var(--color-accent) 14%, transparent);
  }
}
```
**JS:** `el.scrollIntoView({ behavior: "smooth", block: "center" })`, depois `el.classList.add("spotlight")` e remover no `animationend` (ou `setTimeout(1200)` no modo reduzido). Depende de âncora estável `id={m.id}` na bolha (ver IDEAS 2.3).

**Onde aplicar:** Timeline (alvo de busca/inbox/reply). **Esforço:** P · **Risco:** baixo (alvo pode não estar no DOM se virar timeline virtualizada).

---

## 3. Number tickers / count-up — *Vercel / Cron (Notion Calendar)*

Contadores ("3 precisam resposta", "12 hoje", badges de não-lidas) fazem um tween curto de count-up ao **mudar de valor**, com `tnum` (já no `.mono`) pra não dançar largura.

**Estado que comunica:** "algo mudou" sem precisar de toast. A inbox/sidebar vivem de contadores; um count-up sutil é feedback de delta.

**Por que encaixa:** Vercel/Cron usam tickers com sobriedade; Cron usa **laranja** como nós. O `.mono` com `tnum` já existe — meio caminho andado. Mantém-se dentro de ≤220ms.

**React (hook copy-paste):**
```tsx
import { useEffect, useRef, useState } from "react";

const prefersReduced =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Count-up curto (≤220ms) entre o valor anterior e o novo. tnum evita reflow. */
export function useTicker(value: number, ms = 220) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReduced || from.current === value) {
      setDisplay(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const a = from.current;
    const b = value;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      // outQuint, casa com --ease-out-quint
      const eased = 1 - Math.pow(1 - t, 5);
      setDisplay(Math.round(a + (b - a) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, ms]);

  return display;
}
```
Uso: `<span className="mono tabular-nums">{useTicker(awaitingCount)}</span>`.

**Onde aplicar:** badge de não-lidas/precisa-resposta na Sidebar (IDEAS 1.1), contadores da inbox futura (1.2), header do grupo. **Esforço:** P · **Risco:** baixo (manter ≤220ms; reduced-motion = troca seca, já tratado).

---

## 4. Skeleton "scan-line" terminal — *Warp / Linear*

Enquanto transcreve áudio, lê documento ou carrega a inbox, em vez de spinner: placeholder em mono com uma **linha de varredura ember** percorrendo de cima a baixo (sweep), sobre blocos hairline que imitam linhas de texto.

**Estado que comunica:** "processando sinal" — coerente com grau-terminal (Warp é referência declarada). A transcrição local demora; é o momento certo de um skeleton que parece um terminal trabalhando, não um spinner genérico.

**Por que encaixa:** Warp/terminal-native; o sweep é uma linha fina ember (sinal de atividade), não um shimmer colorido. Substitui o `Spinner` nos momentos longos.

**Spec (CSS + esqueleto):**
```css
/* Blocos placeholder (linhas de "texto" em hairline). */
.scan-row {
  height: 10px;
  border-radius: 4px;
  background: color-mix(in oklab, var(--color-line-2) 70%, transparent);
}

/* Varredura terminal: faixa ember fina descendo sobre o container. */
.scan {
  position: relative;
  overflow: hidden;
}
.scan::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    transparent,
    color-mix(in oklab, var(--color-accent) 14%, transparent) 48%,
    color-mix(in oklab, var(--color-accent) 22%, transparent) 50%,
    transparent
  );
  background-size: 100% 60%;
  background-repeat: no-repeat;
  animation: scan-sweep 1100ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes scan-sweep {
  0%   { background-position: 0 -60%; }
  100% { background-position: 0 160%; }
}
@media (prefers-reduced-motion: reduce) {
  .scan::after { animation: none; background: none; }
  /* Cai pra uma barra de progresso estática indeterminada ou texto "transcrevendo…". */
}
```
```tsx
// <ScanShimmer rows={3} /> — 3 linhas mono placeholder sob varredura.
function ScanShimmer({ rows = 3 }: { rows?: number }) {
  return (
    <div className="scan flex flex-col gap-2 p-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="scan-row" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
```
**Onde aplicar:** painel de transcrição, leitor de PDF/docx, loading da inbox. **Esforço:** P · **Risco:** baixo (não exagerar nº de linhas — custo de paint).

---

## 5. Connection heartbeat — refinamento do ConnectionDot — *(status, não decoração)*

O dot de conexão ganha comportamento por estado:
- `open` → **pulso lento** de halo verde (respiração ~2.4s, bem discreto);
- `connecting` → **shimmer** ember-neutro (busca sinal);
- `close`/queda → para o pulso, fica vermelho estático + toast discreto "reconectando…".

**Estado que comunica:** "o coletor está vivo" — importa porque ele roda 24/7 e o operador depende dele. Verde só status (regra respeitada).

**Por que encaixa:** "vivo" e "no-nonsense" são valores de marca. O pulso é respiração lenta (não piscada chamativa) — sinal de vida, não decoração. Axiom/Linear usam status marks sóbrios assim.

**Spec (CSS):**
```css
/* open: respiração lenta do halo (verde = status). */
@keyframes heartbeat {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-ok) 40%, transparent); }
  50%      { box-shadow: 0 0 0 4px color-mix(in oklab, var(--color-ok) 0%, transparent); }
}
.dot-open {
  background: var(--color-ok);
  animation: heartbeat 2400ms ease-in-out infinite;
}

/* connecting: shimmer de busca (ember-neutro, opacidade pulsa). */
@keyframes seeking {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 1; }
}
.dot-connecting {
  background: var(--color-accent);
  animation: seeking 900ms ease-in-out infinite;
}
.dot-closed { background: var(--color-danger); }

@media (prefers-reduced-motion: reduce) {
  .dot-open, .dot-connecting { animation: none; }
  .dot-open { box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-ok) 25%, transparent); }
}
```
**Onde aplicar:** `ConnectionDot` na sidebar/header (status já vem de `/api/status`). **Esforço:** P · **Risco:** baixo (manter pulso lento; reduced-motion = halo estático).

---

## 6. Eco do equalizer na sidebar — evolução da assinatura — *Vapi*

A assinatura (equalizer reativo) só vive na bolha de áudio hoje. Levar um **eco discreto** pra sidebar:
- grupo com áudio **tocando agora** → micro-equalizer ember (3–4 barras) no item da sidebar, reusando `.eq-live-bar`/`.eq-bar`;
- **chegou áudio novo** num grupo → um único **pulso de 1 barra** (sobe e desce uma vez), não loop.

**Estado que comunica:** "tem voz acontecendo aqui" / "chegou voz". Amarra a assinatura ("o produto é voz") ao momento de triagem (a sidebar). Movimento sempre reflete estado real — tocando vs chegou.

**Por que encaixa:** Vapi trata o sinal de áudio como protagonista. Reusa keyframe `eq` que já existe; o pulso único é uma variante one-shot.

**Spec (CSS):**
```css
/* Micro-eq na sidebar: 3 barras, reusa o keyframe `eq` existente com delays. */
.eq-mini { display: inline-flex; align-items: flex-end; gap: 2px; height: 12px; }
.eq-mini > i {
  width: 2px;
  height: 100%;
  border-radius: 1px;
  background: var(--color-accent);
  transform-origin: bottom;
  animation: eq 1.1s ease-in-out infinite;
}
.eq-mini > i:nth-child(2) { animation-delay: 0.18s; }
.eq-mini > i:nth-child(3) { animation-delay: 0.36s; }

/* Pulso único ao chegar áudio novo (one-shot, não loop). */
@keyframes eq-pulse-once {
  0%   { transform: scaleY(0.3); }
  40%  { transform: scaleY(1); }
  100% { transform: scaleY(0.3); }
}
.eq-pulse { animation: eq-pulse-once 520ms var(--ease-out-quint) 1 both; }

@media (prefers-reduced-motion: reduce) {
  .eq-mini > i { animation: none; transform: scaleY(0.7); }
  .eq-pulse { animation: none; }
}
```
**Onde aplicar:** item de grupo na Sidebar. Reusa `LiveAudio`/keyframe `eq`. **Esforço:** P–M · **Risco:** baixo (não deixar loop em todos os grupos — só o que toca; já tem fallback no CSS).

---

## 7. Hover/press premium em botões e itens — expandir o bevel de tecla — *Raycast / Linear*

O `--shadow-key` (bevel de tecla pressionável) só vive no `.kbd`. Estender o vocabulário tátil pra botões e itens de lista/sidebar:
- **hover:** lift de 1px de borda (tonal, não cor) + leve clareamento do surface — depth por tonal shift, jeito Linear;
- **press:** `translateY(0.5px)` + inset shadow curtinho (afunda como tecla).

**Estado que comunica:** "isto é clicável / você apertou" — affordance tátil. Sem cor: só borda/superfície/profundidade (ember fica reservado pro primário).

**Por que encaixa:** Raycast trata cada item como tecla física; Linear faz depth por layering de surface, não por glow. Mantém o ember como sinal, não como hover genérico.

**Spec (CSS):**
```css
/* Item/botão tátil (ghost/subtle). Depth por surface + borda, sem cor. */
.tactile {
  transition:
    background-color 120ms ease-out,
    border-color 120ms ease-out,
    transform 90ms ease-out;
  border: 1px solid transparent;
}
.tactile:hover {
  background-color: color-mix(in oklab, var(--color-elevated) 60%, transparent);
  border-color: var(--color-line-2);
}
.tactile:active {
  transform: translateY(0.5px);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
}
/* Botão primário (ember): press afunda + ganha o bevel-key herdado. */
.btn-primary:active {
  transform: translateY(0.5px);
  box-shadow: var(--shadow-key);
}
@media (prefers-reduced-motion: reduce) {
  .tactile, .btn-primary:active { transition: none; transform: none; }
}
```
**Onde aplicar:** `Button` (ghost/subtle), itens da Sidebar, itens da command palette, pílulas de filtro. **Esforço:** P · **Risco:** baixo.

---

## 8. Stagger de entrada da timeline ao abrir grupo — *Linear list-in*

Ao **abrir um grupo**, as últimas N bolhas visíveis entram com um stagger curtíssimo (cascata de ~24ms entre itens, cada uma com o `.msg-in` existente). Só na **troca de grupo** — não no poll (mensagem nova continua usando `.msg-in` isolado).

**Estado que comunica:** "este contexto carregou agora" — dá peso de "entrei numa sala". Diferencia trocar de grupo (carga) de receber mensagem (evento pontual).

**Por que encaixa:** Linear faz list-in com stagger discreto ao montar listas; aqui é one-shot no mount do grupo. Reusa `.msg-in`, só adiciona delay incremental e teto (não animar 200 bolhas).

**Spec (CSS + uso):**
```css
/* Stagger só nas últimas ~8 bolhas no mount do grupo. */
.timeline-mount > .msg-in:nth-last-child(-n + 8) {
  animation-delay: calc((8 - var(--i, 0)) * -24ms); /* opcional via --i por item */
}
```
**Uso pragmático (sem CSS var por item):** ao montar, aplicar `style={{ animationDelay: `${Math.min(idxFromBottom, 7) * 24}ms` }}` só nas últimas 8 bolhas; remover a classe `timeline-mount` após o primeiro paint pra não re-disparar no poll.

```css
@media (prefers-reduced-motion: reduce) {
  .timeline-mount > .msg-in { animation: none; }
}
```
**Onde aplicar:** Timeline no `key={groupId}` (remonta ao trocar grupo). **Esforço:** P–M · **Risco:** médio (cuidar pra não disparar no poll; teto de 8 itens; reduced-motion = instantâneo).

---

## 9. Filtro/segmented control com indicador deslizante — *Arc / Linear tabs*

As pílulas de filtro por tipo de mídia (`tudo · áudio · imagem · doc · vídeo · 🔗`, IDEAS 1.4) usam um **indicador que desliza** entre as opções (shared-element), em vez de cada pílula acender sozinha.

**Estado que comunica:** "este é o filtro ativo" com continuidade espacial (o olho segue o pill). O fundo ativo desliza; o texto ativo vira fg cheio.

**Por que encaixa:** Arc/Linear usam segmented controls com indicador contínuo; ember **só na borda/sublinhado fino** do ativo (sinal), fundo do indicador é surface elevada (não ember sólido, pra não gritar). Transform-only = barato.

**Spec (esqueleto React + CSS):**
```css
.seg { position: relative; display: inline-flex; gap: 2px; }
.seg-thumb {
  position: absolute;
  top: 0; bottom: 0;
  border-radius: var(--radius-control);
  background: var(--color-elevated);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-accent) 30%, transparent);
  transition: transform 200ms var(--ease-out-quint), width 200ms var(--ease-out-quint);
  z-index: 0;
}
.seg-item { position: relative; z-index: 1; transition: color 140ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .seg-thumb { transition: none; }
}
```
**React:** medir o `offsetLeft`/`offsetWidth` do item ativo (ref + `useLayoutEffect`) e setar `transform: translateX(x)` + `width` no `.seg-thumb`. O thumb desliza; itens só trocam cor.

**Onde aplicar:** barra de filtros da Timeline, toggle de densidade (IDEAS 4.7), abas da inbox futura. **Esforço:** M · **Risco:** baixo (re-medir em resize; reduced-motion = salto seco).

---

## 10. Command palette — entrada + navegação de teclado polida — *Raycast / Linear*

A ⌘K (IDEAS 4.1) já teria `.frost` + `.overlay-in`/`.pop-in`. O que falta de craft é o **realce do item selecionado** ao navegar por teclado: o highlight **desliza** entre itens (shared-element, igual ao Raycast) e a query filtra com reordenação suave.

**Estado que comunica:** "este é o item sob o cursor de teclado" — navegação puramente por teclado, que é o caso de uso (dev no teclado o dia todo).

**Por que encaixa:** Raycast é a referência canônica; o highlight deslizante é a assinatura tátil dela. Reusa `.frost`/`.pop-in` (já existem) e o `.seg-thumb` do efeito 9 (mesma técnica de shared-element, na vertical).

**Spec (CSS):**
```css
/* Highlight do item ativo da palette desliza no eixo Y. */
.cmd-cursor {
  position: absolute;
  left: 6px; right: 6px;
  height: var(--cmd-item-h, 40px);
  border-radius: var(--radius-control);
  background: color-mix(in oklab, var(--color-elevated) 80%, transparent);
  box-shadow: inset 0 0 0 1px var(--color-line-2);
  transform: translateY(var(--cmd-y, 0));
  transition: transform 140ms var(--ease-out-quint);
  z-index: 0;
}
.cmd-item[aria-selected="true"] { color: var(--color-fg); }
.cmd-item[aria-selected="true"] .cmd-hint { color: var(--color-accent); } /* atalho em ember = sinal */
@media (prefers-reduced-motion: reduce) {
  .cmd-cursor { transition: none; }
}
```
**JS:** ao mudar o índice selecionado (↑/↓), setar `--cmd-y` = `index * itemHeight`. Itens viram `aria-selected`.

**Onde aplicar:** Command palette (⌘K). **Esforço:** M (palette inteira) / P (só o cursor deslizante, se a palette já existir) · **Risco:** baixo.

---

## 11. Badge de atenção: aparecimento com "ping" único — *Linear / iOS unread*

O dot ember de "precisa resposta / mencionado" na sidebar (IDEAS 1.1) **não pode só aparecer** — ao surgir (nova menção/cliente aguardando), dá um **ping único** (anel ember que expande e some uma vez), depois fica estático.

**Estado que comunica:** "isto acabou de exigir atenção" — diferencia "badge que já estava lá" de "acabou de chegar". O ping é one-shot (não loop) pra não virar ruído.

**Por que encaixa:** ember como sinal de atenção é a regra de cor. O ping único é o padrão clássico de unread (iOS/Linear) sem a piscada infinita que viraria decoração.

**Spec (CSS):**
```css
.attn-dot {
  width: 7px; height: 7px; border-radius: 9999px;
  background: var(--color-accent);
  position: relative;
}
@keyframes attn-ping {
  0%   { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-accent) 55%, transparent); }
  100% { box-shadow: 0 0 0 7px color-mix(in oklab, var(--color-accent) 0%, transparent); }
}
.attn-dot.is-new::after {
  content: "";
  position: absolute; inset: 0; border-radius: inherit;
  animation: attn-ping 600ms var(--ease-out-quint) 1 both;
}
@media (prefers-reduced-motion: reduce) {
  .attn-dot.is-new::after { animation: none; }
}
```
**JS:** aplicar `is-new` só quando o badge transiciona de ausente→presente (diff no poll), remover após `animationend`.

**Onde aplicar:** Sidebar (item de grupo). **Esforço:** P · **Risco:** baixo (detectar a transição, não aplicar a cada render).

---

## 12. Divisor "mensagens novas" que desliza pra fora — *Slack / WhatsApp unread divider*

A linha "▸ mensagens novas" (IDEAS 2.5) entra com um `.reveal`, e quando o operador rola além dela e marca como visto, ela **desliza pra fora** (fade + translateY) em vez de sumir seco.

**Estado que comunica:** "daqui pra baixo é novo" → "ok, você viu". A saída suave confirma a transição de estado (não-lido → lido).

**Por que encaixa:** padrão consagrado de Slack/WhatsApp; aqui a régua/rótulo usa mono + ember fino (sinal de fronteira temporal). Reusa `.reveal` na entrada.

**Spec (CSS):**
```css
.unread-divider {
  display: flex; align-items: center; gap: 8px;
  /* régua hairline com tick ember no rótulo */
}
.unread-divider .rule {
  height: 1px; flex: 1;
  background: color-mix(in oklab, var(--color-accent) 35%, transparent);
}
.unread-divider .label {
  /* usar .mono + text-accent no JSX */
  font-size: 11px;
}
@keyframes divider-out {
  to { opacity: 0; transform: translateY(-6px); }
}
.unread-divider.is-seen {
  animation: divider-out 220ms ease-out both;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .unread-divider.is-seen { animation: none; opacity: 0; }
}
```
**Onde aplicar:** Timeline (entre a última vista e a primeira nova). **Esforço:** P (depende do `lastSeen`/`dados`) · **Risco:** baixo.

---

## Top 6 pra aplicar primeiro

Ordenado por impacto-na-percepção ÷ esforço, priorizando o que reforça a identidade Signal Room e o propósito ("triar e responder rápido"):

1. **Envio otimista + reconciliação (#1)** — M. O efeito que mais muda a *sensação* de "instrumento responsivo". Ataca direto "responder rápido" (metade do propósito). Referência Linear, encaixa com `.msg-in`.
2. **Spotlight ember scroll-to-message (#2)** — P. Maior retorno por esforço: um keyframe + `scrollIntoView`. Faz busca/inbox/reply "levarem até a mensagem" — exatamente "acento é sinal". Habilita o valor de várias features de triagem.
3. **Skeleton scan-line terminal (#4)** — P. Coerência de marca pura (grau-terminal/Warp) num momento que já existe e demora (transcrição). Troca spinner genérico por algo que parece um terminal trabalhando.
4. **Connection heartbeat (#5)** — P. "Vivo" + confiança no coletor 24/7 com baixíssimo custo. Verde só status (regra respeitada). Refina um componente que já existe.
5. **Number tickers (#3)** — P. Hook pequeno, reaproveita `tnum`. Dá feedback de delta na sidebar/inbox sem toast — sóbrio, jeito Vercel/Cron.
6. **Hover/press tátil em botões e itens (#7)** — P. Eleva *todo* clique do painel (affordance), reusando o vocabulário do `--shadow-key`. Base que faz o resto parecer caro, sem gastar o ember.

> Sequência sugerida: **#7 (base tátil) → #4 + #5 (coerência/identidade, baratos) → #2 (habilita triagem) → #3 (feedback de delta) → #1 (a estrela, mais arriscada)**. Depois: #6 (eco do eq), #11/#12 (badges/divisor) quando a sidebar de atenção e o `lastSeen` existirem; #9/#10 (segmented + palette) junto das features 1.4/4.1.

### Notas de disciplina (não esquecer ao implementar)

- **Tudo transform/opacity/box-shadow** — nada que dispare layout (exceto `width` do `.seg-thumb`, medido). `tnum` no `.mono` evita reflow dos tickers.
- **Ember só sinal:** nos hover/press (#7), no thumb do segmented (#9) e no cursor da palette (#10) o **fundo** é surface elevada; o ember aparece só como **borda/sublinhado/atalho** — sinal, não preenchimento decorativo.
- **One-shot vs loop:** pings/pulsos de "chegou" (#6 pulso, #11) são `1 both`, nunca infinite. Só `open`/`tocando` (#5, #6 mini-eq) e estados indeterminados (#1, #4) fazem loop — porque são estados *contínuos* reais.
- **`prefers-reduced-motion`** está em todos; o padrão é cair pra estado estático equivalente (não sumir o feedback, só tirar o movimento).
