import type { FaseIluminacao } from '../../lib/timeCycle';
import { TILE_SIZE } from '../types';

/**
 * Cenário Exterior Ensolarado estilo Cofounder / Ghibli + AIOffice Props + 2D Shaders:
 * - Paleta de grama viva e feliz (verde-limão ensolarado #9be068 → #82c864 → #6cab57 → #569447)
 *   com manchas orgânicas suaves (zero grade quadriculada!), flores silvestres e trilhas de terra batida/pedra.
 * - Horizonte norte com céu azul vibrante, nuvens cumulus volumosas em pixel-art e skyline distante em perspectiva atmosférica.
 * - Sprites procedurais sombreados do AIOffice (árvores frondosas, cerejeiras, pinheiros, arbustos floridos,
 *   sebes podadas, bancos de madeira, guarda-sóis de pátio e postes de jardim).
 * - Shaders 2D em tempo real: Feixes de Sol diagonais (God-Rays) pelas janelas e pelo bosque,
 *   halos quentes de iluminação e partículas de pólen dourado / vaga-lumes noturnos.
 */

function hash2d(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise(x: number, y: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const n00 = hash2d(x0, y0, seed);
  const n10 = hash2d(x0 + 1, y0, seed);
  const n01 = hash2d(x0, y0 + 1, seed);
  const n11 = hash2d(x0 + 1, y0 + 1, seed);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

// ── AIOffice Procedural Exterior Props (1x Pixel Art Canvases) ──

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) ctx.fillRect(x, y, 1, 1);
    }
  }
}

const propCache = new Map<string, HTMLCanvasElement>();

function getTreeSprite(variant: number): HTMLCanvasElement {
  const key = `tree-${variant}`;
  const hit = propCache.get(key);
  if (hit) return hit;

  // Paletas vibrantes inspiradas na arte Cofounder + AIOffice
  const palettes = [
    // 0: Carvalho Esmeralda Ensolarado (Cofounder hero tree)
    { deep: '#2b5e38', dark: '#3a7a47', mid: '#569e54', bright: '#7ec860', spec: '#a8e874', fruit: '#f7d154' },
    // 1: Ipê / Cerejeira Rosada
    { deep: '#6b3052', dark: '#96456e', mid: '#c46892', bright: '#eb94b8', spec: '#ffd1e3', fruit: '#ffffff' },
    // 2: Carvalho Dourado de Sol
    { deep: '#4a6b2c', dark: '#668f38', mid: '#86b846', bright: '#abdb5c', spec: '#cdf279', fruit: '#ff9fb2' },
  ];
  const p = palettes[variant % palettes.length];
  const [c, g] = makeCanvas(40, 48);

  // Sombra elíptica suave no gramado
  disc(g, 20, 42, 15, 4.5, 'rgba(26, 48, 30, 0.28)');
  disc(g, 20, 42, 10, 3, 'rgba(26, 48, 30, 0.22)');

  // Raízes e tronco robusto com casca texturizada
  dot(g, 15, 40, 10, 2, '#543824');
  dot(g, 16, 26, 8, 15, '#6b472e');
  dot(g, 17, 26, 3, 14, '#875c3d');
  dot(g, 18, 28, 1, 11, '#9e6f4b');
  dot(g, 22, 27, 2, 14, '#472e1d');

  // Copa volumosa multi-domos (estilo Ghibli / Cofounder)
  const blobs = [
    [12, 22, 9, 8],
    [28, 22, 9, 8],
    [20, 24, 12, 8],
    [13, 15, 9, 8],
    [27, 15, 9, 8],
    [20, 13, 11, 9],
  ] as const;

  for (const [bx, by, rx, ry] of blobs) {
    disc(g, bx, by + 1, rx + 1, ry + 1, '#1f3d28');
  }
  for (const [bx, by, rx, ry] of blobs) {
    disc(g, bx, by + 1, rx, ry, p.deep);
  }
  for (const [bx, by, rx, ry] of blobs) {
    disc(g, bx, by, rx - 0.5, ry - 0.5, p.dark);
  }
  for (const [bx, by, rx, ry] of blobs) {
    disc(g, bx - 1, by - 1, rx - 1.5, ry - 1.5, p.mid);
  }
  // Luz do sol batendo no topo/esquerda da copa
  disc(g, 16, 11, 7, 5, p.bright);
  disc(g, 11, 17, 5, 4, p.bright);
  disc(g, 24, 12, 5, 4, p.bright);
  disc(g, 14, 9, 4, 2.5, p.spec);
  disc(g, 10, 15, 2.5, 2, p.spec);

  // Pequenos frutos / flores brilhando na copa
  for (const [fx, fy] of [[12, 11], [23, 10], [9, 19], [26, 18], [18, 16]] as const) {
    dot(g, fx, fy, 2, 2, p.fruit);
  }

  propCache.set(key, c);
  return c;
}

function getPineSprite(): HTMLCanvasElement {
  const key = 'pine';
  const hit = propCache.get(key);
  if (hit) return hit;

  const [c, g] = makeCanvas(28, 40);
  disc(g, 14, 36, 10, 3, 'rgba(26, 48, 30, 0.28)');
  dot(g, 12, 29, 4, 7, '#5c3c24');
  dot(g, 13, 29, 2, 7, '#785032');

  const tiers = [
    { topY: 4, h: 10, halfW: 6 },
    { topY: 10, h: 11, halfW: 9 },
    { topY: 17, h: 13, halfW: 11 },
  ];
  for (const t of tiers) {
    for (let dy = 0; dy < t.h; dy++) {
      const k = (dy + 1) / t.h;
      const w = Math.max(1, Math.round(k * t.halfW));
      const y = t.topY + dy;
      dot(g, 14 - w - 1, y, w * 2 + 2, 1, '#1d3b2a');
      dot(g, 14 - w, y, w * 2, 1, dy > t.h - 3 ? '#265239' : '#346e4b');
      dot(g, 14 - w, y, Math.max(1, Math.round(w * 0.95)), 1, '#4d945a');
      if (w >= 2 && dy < t.h - 2) {
        dot(g, 14 - w + 1, y, Math.max(1, Math.round(w * 0.5)), 1, '#74bd68');
      }
    }
  }
  propCache.set(key, c);
  return c;
}

function getBushSprite(flowering: boolean): HTMLCanvasElement {
  const key = `bush-${flowering ? 1 : 0}`;
  const hit = propCache.get(key);
  if (hit) return hit;

  const [c, g] = makeCanvas(18, 14);
  disc(g, 9, 11, 7.5, 2.2, 'rgba(26, 48, 30, 0.25)');
  for (const [bx, by, rx, ry] of [
    [6, 8, 4.5, 3.8],
    [12, 8, 4.5, 3.8],
    [9, 6.5, 5, 4.2],
  ] as const) {
    disc(g, bx, by, rx + 0.7, ry + 0.7, '#22442c');
    disc(g, bx, by, rx, ry, '#3b7a49');
    disc(g, bx - 0.6, by - 0.8, rx * 0.72, ry * 0.7, '#5ca858');
  }
  disc(g, 7.5, 4.8, 2.5, 1.6, '#8ae06c');
  if (flowering) {
    for (const [fx, fy, col] of [
      [5, 6, '#ff8fab'],
      [10, 5, '#ffd166'],
      [12, 8, '#ff8fab'],
      [7, 8, '#ffffff'],
    ] as const) {
      dot(g, fx, fy, 2, 2, col);
    }
  }
  propCache.set(key, c);
  return c;
}

function getBenchSprite(): HTMLCanvasElement {
  const key = 'bench';
  const hit = propCache.get(key);
  if (hit) return hit;

  const [c, g] = makeCanvas(32, 16);
  disc(g, 16, 13, 14, 2, 'rgba(26, 48, 30, 0.25)');
  dot(g, 3, 2, 26, 10, '#2c221b');
  dot(g, 4, 3, 24, 2, '#cf9459');
  dot(g, 4, 3, 24, 1, '#e3ad74');
  dot(g, 4, 5, 24, 2, '#b57b43');
  dot(g, 3, 8, 26, 3, '#c78c52');
  dot(g, 3, 8, 26, 1, '#dead76');
  dot(g, 3, 10, 26, 1, '#8f5d2e');
  dot(g, 3, 6, 2, 6, '#383d4a');
  dot(g, 27, 6, 2, 6, '#383d4a');
  dot(g, 5, 11, 2, 4, '#272b36');
  dot(g, 25, 11, 2, 4, '#272b36');
  propCache.set(key, c);
  return c;
}

function getParasolSprite(variant: number): HTMLCanvasElement {
  const key = `parasol-${variant}`;
  const hit = propCache.get(key);
  if (hit) return hit;

  const colors = [
    ['#e05a47', '#fbf7ee'],
    ['#3b82c4', '#fbf7ee'],
    ['#439c68', '#fef9e7'],
  ];
  const [c1, c2] = colors[variant % colors.length];
  const [c, g] = makeCanvas(36, 36);
  disc(g, 18, 29, 13, 4.5, 'rgba(26, 48, 30, 0.26)');
  // Mesa redonda + cadeiras sob o guarda-sol
  disc(g, 18, 26, 7, 4, '#f4efe6');
  disc(g, 18, 25, 6, 3, '#ffffff');
  dot(g, 17, 16, 2, 13, '#6b4c35');
  // Copa do guarda-sol listrada
  disc(g, 18, 12, 14, 7.5, '#272b3b');
  for (let y = 5; y <= 19; y++) {
    for (let x = 4; x <= 32; x++) {
      const dx = (x - 18) / 13.2;
      const dy = (y - 12) / 6.8;
      if (dx * dx + dy * dy <= 1) {
        const sector = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) & 1;
        dot(g, x, y, 1, 1, sector ? c1 : c2);
      }
    }
  }
  disc(g, 15, 9, 4, 2, 'rgba(255,255,255,0.35)');
  propCache.set(key, c);
  return c;
}

function getLampSprite(): HTMLCanvasElement {
  const key = 'lamp';
  const hit = propCache.get(key);
  if (hit) return hit;

  const [c, g] = makeCanvas(12, 28);
  disc(g, 6, 25, 4, 1.5, 'rgba(26, 48, 30, 0.28)');
  dot(g, 4, 23, 4, 3, '#2b303c');
  dot(g, 5, 8, 2, 16, '#394050');
  dot(g, 3, 4, 6, 5, '#2b303c');
  dot(g, 4, 5, 4, 3, '#ffe896');
  dot(g, 5, 6, 2, 2, '#ffffff');
  propCache.set(key, c);
  return c;
}

// ── Static World Scenery Canvas Cache ──

let cachedWorldCanvas: HTMLCanvasElement | null = null;
let cachedWorldKey = '';

const PAD_LEFT_TILES = 18;
const PAD_RIGHT_TILES = 18;
const PAD_TOP_TILES = 16;
const PAD_BOTTOM_TILES = 16;

export function renderWorldScenery(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  fase: FaseIluminacao,
  natalAtivo = true,
): void {
  if (typeof document === 'undefined') return;

  const totalCols = cols + PAD_LEFT_TILES + PAD_RIGHT_TILES;
  const totalRows = rows + PAD_TOP_TILES + PAD_BOTTOM_TILES;
  const key = `${cols}x${rows}-z${zoom}-${fase}-n${natalAtivo ? 1 : 0}-v5`;

  if (!cachedWorldCanvas || cachedWorldKey !== key) {
    const w1x = totalCols * TILE_SIZE;
    const h1x = totalRows * TILE_SIZE;
    const [c1x, g] = makeCanvas(w1x, h1x);

    const bx0 = PAD_LEFT_TILES * TILE_SIZE;
    const by0 = PAD_TOP_TILES * TILE_SIZE;
    const bw = cols * TILE_SIZE;
    const bh = rows * TILE_SIZE;

    // ========================================================================
    // 1. GRAMA ENSOLARADA ESTILO COFOUNDER / GHIBLI (Sem grade quadriculada!)
    // ========================================================================
    // Renderizamos em blocos de 2x2px no canvas 1x usando ruído suave multi-oitava
    for (let py = 0; py < h1x; py += 2) {
      for (let px = 0; px < w1x; px += 2) {
        const n1 = smoothNoise(px, py, 68, 101);
        const n2 = smoothNoise(px, py, 24, 202) * 0.35;
        const val = n1 * 0.72 + n2;

        // Luz do sol vem da direita/topo (como na referência Cofounder)
        const sunGrad = (px / w1x) * 0.12 - (py / h1x) * 0.06;
        const v = val + sunGrad;

        let col: string;
        if (v > 0.66) {
          col = '#9be068'; // Verde-limão iluminado pelo sol
        } else if (v > 0.5) {
          col = '#82c864'; // Verde vibrante Cofounder
        } else if (v > 0.34) {
          col = '#6cab57'; // Verde médio fresco
        } else {
          col = '#569447'; // Sombra suave de colina
        }
        g.fillStyle = col;
        g.fillRect(px, py, 2, 2);

        // Tufos de grama e trevos orgânicos (como no primeiro plano da imagem Cofounder)
        const tuft = hash2d(px >> 1, py >> 1, 303);
        if (tuft < 0.045) {
          g.fillStyle = v > 0.5 ? '#b4f07e' : '#437a3b';
          g.fillRect(px, py, 2, 1);
          g.fillRect(px + 1, py - 1, 1, 2);
        } else if (tuft > 0.992) {
          // Florzinhas silvestres espalhadas pelo campo
          const fc =
            tuft > 0.997 ? '#fff380' : tuft > 0.9945 ? '#ff9fb2' : '#ffffff';
          g.fillStyle = fc;
          g.fillRect(px, py, 2, 2);
        }
      }
    }

    // ========================================================================
    // 2. HORIZONTE NORTE COFOUNDER: CÉU AZUL, NUVENS CUMULUS & SKYLINE DISTANTE
    // ========================================================================
    const skyH = (PAD_TOP_TILES - 4) * TILE_SIZE; // Primeiros 12 tiles do topo
    for (let py = 0; py < skyH; py++) {
      const k = py / skyH;
      const col =
        k < 0.28
          ? '#4da3e8'
          : k < 0.55
            ? '#6ebaf2'
            : k < 0.8
              ? '#96d2fa'
              : '#c2e8ff';
      g.fillStyle = col;
      g.fillRect(0, py, w1x, 1);
    }

    // Nuvens Cumulus Gigantes estilo Cofounder / Ghibli
    const clouds = [
      { cx: 180, cy: 85, rx: 95, ry: 48 },
      { cx: 310, cy: 70, rx: 110, ry: 56 },
      { cx: 470, cy: 60, rx: 130, ry: 64 },
      { cx: 640, cy: 55, rx: 145, ry: 68 },
      { cx: 820, cy: 68, rx: 120, ry: 58 },
      { cx: 980, cy: 82, rx: 105, ry: 50 },
    ];
    for (const cl of clouds) {
      disc(g, cl.cx, cl.cy + 8, cl.rx, cl.ry, '#b9def7');
      disc(g, cl.cx - 6, cl.cy + 2, cl.rx * 0.92, cl.ry * 0.9, '#dff1fd');
      disc(g, cl.cx - 12, cl.cy - 4, cl.rx * 0.8, cl.ry * 0.78, '#ffffff');
    }

    // Skyline Distante em Perspectiva Atmosférica (exatamente como no fundo da Cofounder!)
    const horizonY = skyH - 8;
    const skylineBuildings = [
      { x: 220, w: 22, h: 34, c: '#8ab4d6' },
      { x: 246, w: 18, h: 26, c: '#9bc2e0' },
      { x: 268, w: 28, h: 42, c: '#7ea8cc' },
      { x: 300, w: 20, h: 30, c: '#95bddc' },
      { x: 325, w: 32, h: 46, c: '#7a9ec2' },
      // Torre Art-Deco escalonada icônica da imagem Cofounder!
      { x: 372, w: 24, h: 68, c: '#d8d5cc', spire: true },
      { x: 404, w: 26, h: 38, c: '#86b0d1' },
      { x: 436, w: 30, h: 48, c: '#78a1c4' },
      { x: 472, w: 22, h: 32, c: '#94bcdb' },
      { x: 502, w: 28, h: 40, c: '#83add0' },
      { x: 760, w: 26, h: 36, c: '#89b3d4' },
      { x: 792, w: 32, h: 46, c: '#78a2c4' },
      { x: 830, w: 22, h: 30, c: '#96bede' },
    ];

    for (const bld of skylineBuildings) {
      const by = horizonY - bld.h;
      dot(g, bld.x, by, bld.w, bld.h, bld.c);
      // Brilho solar na face esquerda/topo do prédio
      dot(g, bld.x, by, 3, bld.h, '#cbe5f8');
      dot(g, bld.x, by, bld.w, 2, '#e3f2fd');
      // Janelinhas sutis em pixel art
      for (let wy = by + 5; wy < horizonY - 4; wy += 4) {
        for (let wx = bld.x + 4; wx < bld.x + bld.w - 3; wx += 4) {
          dot(g, wx, wy, 2, 2, 'rgba(255, 255, 255, 0.35)');
        }
      }
      if (bld.spire) {
        dot(g, bld.x + 4, by - 12, bld.w - 8, 12, '#e6e3da');
        dot(g, bld.x + 8, by - 22, bld.w - 16, 10, '#f2efe6');
        dot(g, bld.x + 11, by - 32, 2, 10, '#ffffff');
      }
    }

    // Colinas verdes suaves na transição entre o skyline e o gramado
    for (let px = 0; px < w1x; px++) {
      const hillH = Math.round(
        10 +
          Math.sin(px * 0.012) * 6 +
          Math.cos(px * 0.028 + 1.4) * 4,
      );
      const hy = horizonY - hillH + 8;
      dot(g, px, hy, 1, hillH + 8, '#5ca052');
      dot(g, px, hy, 1, 3, '#7ec464');
    }

    // ========================================================================
    // 3. TRILHA ORGÂNICA DO PARQUE & CALÇADA AO REDOR DO PRÉDIO
    // ========================================================================
    // Trilha de terra batida / cascalho dourado (como na imagem Cofounder!)
    for (let px = 40; px < w1x - 40; px += 2) {
      const curveY =
        by0 -
        36 +
        Math.round(Math.sin(px * 0.009) * 14 + Math.cos(px * 0.02) * 5);
      dot(g, px, curveY - 1, 2, 12, '#b8986c');
      dot(g, px, curveY, 2, 10, '#dbbe93');
      dot(g, px, curveY + 2, 2, 6, '#ead2ad');
    }

    // Calçada de pedra clara ao redor do edifício + Pátio de Madeira a Leste
    const swPad = 24;
    dot(
      g,
      bx0 - swPad - 2,
      by0 - swPad - 2,
      bw + swPad * 2 + 4,
      bh + swPad * 2 + 4,
      '#9e9a90',
    );
    dot(
      g,
      bx0 - swPad,
      by0 - swPad,
      bw + swPad * 2,
      bh + swPad * 2,
      '#d9d5cc',
    );
    // Juntas das placas da calçada
    g.fillStyle = '#c4bfb4';
    for (let x = bx0 - swPad; x < bx0 + bw + swPad; x += 16) {
      g.fillRect(x, by0 - swPad, 1, bh + swPad * 2);
    }
    for (let y = by0 - swPad; y < by0 + bh + swPad; y += 16) {
      g.fillRect(bx0 - swPad, y, bw + swPad * 2, 1);
    }

    // Pátio de Madeira (Deck Bistrô) a Leste do prédio
    const deckX = bx0 + bw + 8;
    const deckY = by0 + 48;
    const deckW = 96;
    const deckH = 192;
    dot(g, deckX - 2, deckY - 2, deckW + 4, deckH + 4, '#5c3f28');
    for (let py = deckY; py < deckY + deckH; py += 4) {
      dot(g, deckX, py, deckW, 3, ((py >> 2) & 1) ? '#c78f56' : '#bd844c');
      dot(g, deckX, py + 3, deckW, 1, '#8c5d32');
    }

    // Alameda de Entrada Sul (conectando a porta sul cols 23..26 ao parque sul)
    const southWalkX = bx0 + 22.5 * TILE_SIZE;
    const southWalkY = by0 + bh;
    const southWalkW = 5 * TILE_SIZE;
    const southWalkH = PAD_BOTTOM_TILES * TILE_SIZE;
    dot(g, southWalkX - 2, southWalkY, southWalkW + 4, southWalkH, '#9e9a90');
    dot(g, southWalkX, southWalkY, southWalkW, southWalkH, '#e3dfd6');

    // Riacho Cristalino a Oeste com Ponte de Madeira
    for (let py = skyH + 8; py < h1x; py += 2) {
      const rx =
        Math.round(bx0 * 0.42 + Math.sin(py * 0.018) * 22);
      dot(g, rx - 20, py, 40, 2, '#5ba872');
      dot(g, rx - 16, py, 32, 2, '#3a8fd9');
      dot(g, rx - 10, py, 20, 2, '#5cb3f5');
      if (((py >> 2) & 3) === 0) {
        dot(g, rx - 4 + ((py * 3) % 8), py, 6, 1, '#bce3ff');
      }
    }
    // Ponte de madeira sobre o riacho oeste
    const bridgeY = by0 + Math.round(bh * 0.48);
    const bridgeX = Math.round(bx0 * 0.42 + Math.sin(bridgeY * 0.018) * 22) - 24;
    dot(g, bridgeX, bridgeY - 2, 48, 20, '#543822');
    for (let x = bridgeX + 2; x < bridgeX + 46; x += 4) {
      dot(g, x, bridgeY, 3, 16, '#c48b52');
    }

    // Sombra projetada pelo edifício sobre a calçada Leste e Sul
    g.fillStyle = 'rgba(26, 36, 52, 0.22)';
    g.fillRect(bx0 + bw, by0 + 6, 10, bh);
    g.fillRect(bx0 + 6, by0 + bh, bw, 10);

    // ========================================================================
    // 4. SPRITES PROCEDURAIS DO AIOFFICE (Árvores, Arbustos, Bancos, Guarda-sóis)
    // ========================================================================
    // Sebes floridas contornando a calçada do prédio
    const bushFlw = getBushSprite(true);
    const bushPlain = getBushSprite(false);
    for (let x = bx0 - 16; x < bx0 + bw + 8; x += 22) {
      if (x > southWalkX - 18 && x < southWalkX + southWalkW + 10) continue;
      g.drawImage(
        ((x / 22) & 1) ? bushFlw : bushPlain,
        x,
        by0 - swPad - 10,
      );
      g.drawImage(
        ((x / 22) & 1) ? bushPlain : bushFlw,
        x,
        by0 + bh + swPad - 6,
      );
    }

    // Guarda-sóis no Pátio de Madeira Leste
    g.drawImage(getParasolSprite(0), deckX + 12, deckY + 18);
    g.drawImage(getParasolSprite(1), deckX + 48, deckY + 78);
    g.drawImage(getParasolSprite(2), deckX + 14, deckY + 136);

    // Bancos de madeira na trilha norte e na alameda sul (como na referência Cofounder!)
    const bench = getBenchSprite();
    g.drawImage(bench, bx0 + 80, by0 - 52);
    g.drawImage(bench, bx0 + bw - 120, by0 - 50);
    g.drawImage(bench, southWalkX - 48, by0 + bh + 44);
    g.drawImage(bench, southWalkX + southWalkW + 16, by0 + bh + 44);

    // Postes de jardim
    const lamp = getLampSprite();
    g.drawImage(lamp, bx0 - 20, by0 - 38);
    g.drawImage(lamp, bx0 + bw + 10, by0 - 38);
    g.drawImage(lamp, southWalkX - 16, by0 + bh + 18);
    g.drawImage(lamp, southWalkX + southWalkW + 4, by0 + bh + 18);
    g.drawImage(lamp, southWalkX - 16, by0 + bh + 96);
    g.drawImage(lamp, southWalkX + southWalkW + 4, by0 + bh + 96);

    // Bosques de Árvores Frondosas e Pinheiros (ordenadas por Y para profundidade correta)
    const treePlacements: Array<{ x: number; y: number; kind: 'tree' | 'pine'; v: number }> = [
      // Bosque Norte (entre o horizonte e a trilha)
      { x: 45, y: by0 - 95, kind: 'tree', v: 0 },
      { x: 115, y: by0 - 82, kind: 'tree', v: 2 },
      { x: 210, y: by0 - 88, kind: 'tree', v: 1 },
      { x: 540, y: by0 - 90, kind: 'tree', v: 0 },
      { x: 640, y: by0 - 80, kind: 'tree', v: 2 },
      { x: 890, y: by0 - 92, kind: 'tree', v: 0 },
      { x: 980, y: by0 - 78, kind: 'tree', v: 1 },
      { x: 1060, y: by0 - 88, kind: 'pine', v: 0 },

      // Bosque Oeste (margens do riacho)
      { x: 28, y: by0 + 20, kind: 'tree', v: 0 },
      { x: 180, y: by0 + 55, kind: 'tree', v: 2 },
      { x: 42, y: by0 + 140, kind: 'pine', v: 0 },
      { x: 190, y: by0 + 190, kind: 'tree', v: 1 },
      { x: 35, y: by0 + 340, kind: 'tree', v: 0 },
      { x: 185, y: by0 + 410, kind: 'tree', v: 2 },
      { x: 55, y: by0 + 510, kind: 'pine', v: 0 },

      // Jardim Leste (além do deck de madeira)
      { x: bx0 + bw + 122, y: by0 + 16, kind: 'tree', v: 0 },
      { x: bx0 + bw + 178, y: by0 + 70, kind: 'tree', v: 1 },
      { x: bx0 + bw + 130, y: by0 + 150, kind: 'tree', v: 2 },
      { x: bx0 + bw + 185, y: by0 + 230, kind: 'pine', v: 0 },
      { x: bx0 + bw + 125, y: by0 + 310, kind: 'tree', v: 0 },
      { x: bx0 + bw + 175, y: by0 + 410, kind: 'tree', v: 2 },
      { x: bx0 + bw + 115, y: by0 + 500, kind: 'tree', v: 1 },

      // Parque Sul (ao redor da Alameda de Entrada)
      { x: bx0 + 40, y: by0 + bh + 45, kind: 'tree', v: 2 },
      { x: bx0 + 140, y: by0 + bh + 85, kind: 'tree', v: 0 },
      { x: bx0 + 250, y: by0 + bh + 55, kind: 'tree', v: 1 },
      { x: bx0 + bw - 280, y: by0 + bh + 55, kind: 'tree', v: 0 },
      { x: bx0 + bw - 160, y: by0 + bh + 90, kind: 'tree', v: 2 },
      { x: bx0 + bw - 60, y: by0 + bh + 48, kind: 'pine', v: 0 },
    ];

    treePlacements.sort((a, b) => a.y - b.y);
    for (const tp of treePlacements) {
      const spr = tp.kind === 'pine' ? getPineSprite() : getTreeSprite(tp.v);
      g.drawImage(spr, tp.x, tp.y);
    }

    // Escala 1x -> zoom com pixel-art nítido
    const [cZoom, zCtx] = makeCanvas(
      Math.round(w1x * zoom),
      Math.round(h1x * zoom),
    );
    zCtx.drawImage(c1x, 0, 0, cZoom.width, cZoom.height);

    cachedWorldCanvas = cZoom;
    cachedWorldKey = key;
  }

  const drawX = Math.round(offsetX - PAD_LEFT_TILES * TILE_SIZE * zoom);
  const drawY = Math.round(offsetY - PAD_TOP_TILES * TILE_SIZE * zoom);
  ctx.drawImage(cachedWorldCanvas, drawX, drawY);
}

// ============================================================================
// SHADERS 2D EM TEMPO REAL: GOD-RAYS (FEIXES DE SOL), HALOS QUENTES & VAGA-LUMES
// ============================================================================

export function renderWorldAtmosphereAndTraffic(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  fase: FaseIluminacao,
  natalAtivo = true,
): void {
  const now = typeof performance !== 'undefined' ? performance.now() * 0.001 : 0;
  const mapW = cols * TILE_SIZE * zoom;
  const mapH = rows * TILE_SIZE * zoom;

  ctx.save();

  // --------------------------------------------------------------------------
  // SHADER 1: SOMBRAS DE NUVENS PASSEANDO SUAVEMENTE PELO GRAMADO (DIA / TARDE)
  // --------------------------------------------------------------------------
  if (fase === 'dia' || fase === 'tarde') {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const cx =
        offsetX +
        (((now * 14 + i * 340) % (mapW + 500)) - 250) * 1;
      const cy = offsetY + ((i * 210 - 80) % (mapH + 200));
      const rx = 140 * zoom;
      const ry = 55 * zoom;
      const grad = ctx.createRadialGradient(cx, cy, rx * 0.1, cx, cy, rx);
      grad.addColorStop(0, 'rgba(20, 45, 30, 0.07)');
      grad.addColorStop(1, 'rgba(20, 45, 30, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, -0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // SHADER 2: GOD-RAYS / FEIXES DE LUZ SOLAR DIAGONAIS (Estilo Cofounder!)
  // --------------------------------------------------------------------------
  if (fase === 'dia' || fase === 'tarde') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // 2a. Feixes de sol diagonais atravessando o parque e as copas das árvores
    const sunColor =
      fase === 'tarde' ? '255, 195, 110' : '255, 250, 200';
    const rays = [
      { x: -120, y: -180, w: 95, len: 520, phase: 0.0 },
      { x: 180, y: -180, w: 130, len: 620, phase: 1.3 },
      { x: 520, y: -180, w: 110, len: 580, phase: 2.6 },
      { x: 820, y: -180, w: 145, len: 680, phase: 3.8 },
    ];

    for (const r of rays) {
      const pulse = 0.055 + 0.02 * Math.sin(now * 0.7 + r.phase);
      const x0 = offsetX + r.x * zoom;
      const y0 = offsetY + r.y * zoom;
      const dx = -r.len * 0.42 * zoom;
      const dy = r.len * zoom;
      const w = r.w * zoom;

      const grad = ctx.createLinearGradient(x0, y0, x0 + dx, y0 + dy);
      grad.addColorStop(0, `rgba(${sunColor}, ${pulse * 1.4})`);
      grad.addColorStop(0.55, `rgba(${sunColor}, ${pulse})`);
      grad.addColorStop(1, `rgba(${sunColor}, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + w, y0);
      ctx.lineTo(x0 + w + dx, y0 + dy);
      ctx.lineTo(x0 + dx, y0 + dy);
      ctx.closePath();
      ctx.fill();
    }

    // 2b. Feixes de luz solar entrando pelas janelas norte dos Estúdios!
    const windows = [
      { col: 42, row: 2 },
      { col: 14, row: 13 },
      { col: 40, row: 13 },
      { col: 14, row: 25 },
      { col: 40, row: 25 },
    ];
    for (const win of windows) {
      const wx = offsetX + win.col * TILE_SIZE * zoom;
      const wy = offsetY + win.row * TILE_SIZE * zoom;
      const ww = 2 * TILE_SIZE * zoom;
      const beamLen = 5.5 * TILE_SIZE * zoom;
      const skewX = -1.8 * TILE_SIZE * zoom;

      const wGrad = ctx.createLinearGradient(wx, wy, wx + skewX, wy + beamLen);
      wGrad.addColorStop(0, `rgba(${sunColor}, 0.16)`);
      wGrad.addColorStop(0.6, `rgba(${sunColor}, 0.07)`);
      wGrad.addColorStop(1, `rgba(${sunColor}, 0)`);

      ctx.fillStyle = wGrad;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + ww, wy);
      ctx.lineTo(wx + ww + skewX, wy + beamLen);
      ctx.lineTo(wx + skewX, wy + beamLen);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // SHADER 3: HALOS DE LUZ QUENTE (Luminárias de Piso, Postes & Árvore)
  // --------------------------------------------------------------------------
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const haloAlpha = fase === 'noite' ? 0.24 : fase === 'tarde' ? 0.14 : 0.06;

  const warmLights = [
    // Luminárias internas dos estúdios e lounge
    { col: 38.5, row: 2.5, r: 4.5, c: '255, 210, 130' },
    { col: 21.5, row: 21.5, r: 4.5, c: '255, 210, 130' },
    { col: 47.5, row: 21.5, r: 4.5, c: '255, 210, 130' },
    { col: 21.5, row: 33.5, r: 4.5, c: '255, 210, 130' },
    { col: 47.5, row: 33.5, r: 4.5, c: '255, 210, 130' },
    { col: 25, row: 4, r: 5.5, c: '255, 225, 160' },
    // Postes externos do jardim
    { col: -1, row: -2, r: 5, c: '255, 215, 120' },
    { col: cols + 1, row: -2, r: 5, c: '255, 215, 120' },
    { col: 21.5, row: rows + 1.5, r: 5, c: '255, 215, 120' },
    { col: 28.5, row: rows + 1.5, r: 5, c: '255, 215, 120' },
  ];

  for (const l of warmLights) {
    const lx = offsetX + l.col * TILE_SIZE * zoom;
    const ly = offsetY + l.row * TILE_SIZE * zoom;
    const lr = l.r * TILE_SIZE * zoom;
    const g = ctx.createRadialGradient(lx, ly, lr * 0.05, lx, ly, lr);
    g.addColorStop(0, `rgba(${l.c}, ${haloAlpha})`);
    g.addColorStop(0.5, `rgba(${l.c}, ${haloAlpha * 0.45})`);
    g.addColorStop(1, `rgba(${l.c}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // --------------------------------------------------------------------------
  // SHADER 4: PARTÍCULAS DE PÓLEN DOURADO AO SOL / VAGA-LUMES À NOITE
  // --------------------------------------------------------------------------
  ctx.save();
  const particleCount = 28;
  for (let i = 0; i < particleCount; i++) {
    const seedX = hash2d(i, 1, 777);
    const seedY = hash2d(i, 2, 777);
    const px =
      offsetX +
      ((seedX * (cols + 20) - 10 + Math.sin(now * 0.4 + i) * 1.8) *
        TILE_SIZE *
        zoom);
    const py =
      offsetY +
      ((seedY * (rows + 16) - 8 + Math.cos(now * 0.35 + i * 1.7) * 1.4) *
        TILE_SIZE *
        zoom);
    const blink = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 2.2 + i * 2.1));
    const size = Math.max(2, Math.round(1.6 * zoom));

    ctx.fillStyle =
      fase === 'noite'
        ? `rgba(190, 255, 120, ${blink * 0.85})`
        : `rgba(255, 250, 190, ${blink * 0.55})`;
    ctx.fillRect(px, py, size, size);
  }
  ctx.restore();

  // Cordão de luzinhas aconchegantes no beiral se natalAtivo estiver ligado
  if (natalAtivo) {
    const colors = ['#ff6b6b', '#ffd166', '#54d688', '#6bc5ff'];
    for (let c = 1; c < cols - 1; c += 2) {
      const lx = offsetX + (c + 0.5) * TILE_SIZE * zoom;
      const ly = offsetY + 2 * zoom;
      const col = colors[(c + Math.floor(now * 2)) % colors.length];
      ctx.fillStyle = col;
      ctx.fillRect(lx, ly, Math.max(2, Math.round(2 * zoom)), Math.max(2, Math.round(2 * zoom)));
    }
  }

  ctx.restore();
}
