export const dynamic = "force-dynamic";

// Alturas fixas das 5 barras do equalizer — estado estático (sem áudio tocando).
// As alturas variadas preservam a silhueta de sinal sem animar no vazio.
const EQ_HEIGHTS = [0.4, 0.85, 0.55, 1, 0.65];

export default function Home() {
  return (
    <div className="signal-grid grid flex-1 place-items-center px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-end justify-center gap-1 rounded-[14px] border border-line bg-surface p-3 accent-glow">
          {EQ_HEIGHTS.map((h, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: barras estáticas decorativas
              key={i}
              className="eq-live-bar w-1 rounded-full bg-accent"
              style={{ transform: `scaleY(${h})` }}
            />
          ))}
        </div>
        <h2 className="mono text-[13px] tracking-wide text-fg-dim">Central de triagem</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg-dim text-pretty">
          Selecione um grupo à esquerda para ler as mensagens, ouvir e transcrever áudios,
          ler documentos e responder o cliente.
        </p>
        <p className="mono mt-5 text-[11px] uppercase tracking-wider text-fg-faint">
          capturar · transcrever · responder
        </p>
      </div>
    </div>
  );
}
