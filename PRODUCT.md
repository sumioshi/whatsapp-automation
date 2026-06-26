# Product

## Register

product

## Users

o operador (dev/founder, usuário único) e técnico. Usa o painel **no Mac, o dia todo, em paralelo ao trabalho**, pra triar muitos grupos de WhatsApp de clientes sem garimpar manualmente. Contexto de uso: foco dividido, sessões rápidas ("o que chegou? o que preciso responder?"), e uso conjunto com a IA (Claude via MCP).

## Product Purpose

Central de triagem dos grupos de WhatsApp: o coletor captura tudo (áudio/vídeo/gif/imagem/documento/texto), o painel exibe/transcreve/lê documentos, e dá pra responder o cliente (texto e mídia, com @menção). Sucesso = reduzir a zero o tempo gasto garimpando conteúdo de grupo e responder mais rápido e com contexto.

## Brand Personality

Preciso, denso, "command-center". Três palavras: **terminal, vivo, no-nonsense.** Sensação de instrumento profissional de quem sabe o que faz — não de app de mensagem fofo. A energia ("vivo") vem do acento ember e do sinal de áudio, não de decoração.

## Anti-references

- **Verde-WhatsApp como cor de marca / bolha verde** — é o que estamos fugindo; vira clone do WhatsApp.
- **AI slop**: cream/sand body bg, eyebrows uppercase em toda seção, marcadores numerados 01/02/03, hero-metric template, grids de cards idênticos, gradient text, side-stripe borders, glassmorphism decorativo.
- Dashboards SaaS genéricos "indigo/violet" e ilustrações mascote.

## Design Principles

1. **Densidade legível** — é ferramenta de triagem; informação por pixel importa, mas nunca às custas de contraste/legibilidade.
2. **Acento é sinal, não enfeite** — o ember (#ff7a2d) só marca o que pede atenção/ação (você, ativo, primário, menção, equalizer). Verde só pra status semântico.
3. **Mono carrega o "grau-terminal"** — rótulos técnicos (timestamps, tipo, contadores, handles) em mono com tracking apertado.
4. **Motion com significado** — microinterações que refletem estado real (áudio tocando, mensagem chegando, conexão), nunca reveal genérico uniforme.
5. **A assinatura é o áudio** — o produto é cheio de voz; o equalizer é o momento memorável e deve reagir ao conteúdo, não só decorar.

## Accessibility & Inclusion

Uso pessoal (1 usuário), mas manter o básico sólido: contraste de corpo ≥ 4.5:1 sobre o canvas escuro, foco visível (anel ember), `prefers-reduced-motion` respeitado em toda animação (equalizer e entradas caem pra estado estático/crossfade).
