// PNG layout: 112×96px, 7 frames × 3 directions.
// Frame 1 (idle/standing) of DOWN direction starts at x=16, y=0.
export function CharSprite({ charIndex, size = 28 }: { charIndex: number; size?: number }) {
  const scale = size / 16;
  const bgW = Math.round(112 * scale);
  const bgH = Math.round(96 * scale);
  const offX = -Math.round(16 * scale); // frame 1
  const spriteH = Math.round(32 * scale);
  const offsetY = Math.round((size - spriteH) / 2);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: 'var(--sidebar-accent)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: offsetY,
          left: 0,
          width: size,
          height: spriteH,
          backgroundImage: `url(/assets/characters/char_${charIndex}.png)`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${bgW}px ${bgH}px`,
          backgroundPosition: `${offX}px 0px`,
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
}
