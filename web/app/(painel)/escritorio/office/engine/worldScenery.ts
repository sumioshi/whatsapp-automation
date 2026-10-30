import { TILE_SIZE } from '../types';

export interface WorldSceneryOptions {
  faseIluminacao?: 'dia' | 'tarde' | 'noite';
  natalAtivo?: boolean;
}

interface CarSpec {
  lane: 'eastbound' | 'westbound';
  speedTilesPerSec: number;
  phaseOffset: number;
  bodyColor: string;
  roofColor: string;
  lengthTiles: number;
  type: 'sedan' | 'suv' | 'van' | 'taxi';
}

const CARS: CarSpec[] = [
  {
    lane: 'eastbound',
    speedTilesPerSec: 4.2,
    phaseOffset: 0,
    bodyColor: '#e5484d',
    roofColor: '#f87171',
    lengthTiles: 2.4,
    type: 'sedan',
  },
  {
    lane: 'eastbound',
    speedTilesPerSec: 3.5,
    phaseOffset: 24,
    bodyColor: '#f59e0b',
    roofColor: '#fbbf24',
    lengthTiles: 2.3,
    type: 'taxi',
  },
  {
    lane: 'eastbound',
    speedTilesPerSec: 4.8,
    phaseOffset: 52,
    bodyColor: '#3b82f6',
    roofColor: '#60a5fa',
    lengthTiles: 2.5,
    type: 'suv',
  },
  {
    lane: 'eastbound',
    speedTilesPerSec: 3.8,
    phaseOffset: 83,
    bodyColor: '#10b981',
    roofColor: '#34d399',
    lengthTiles: 2.6,
    type: 'van',
  },
  {
    lane: 'westbound',
    speedTilesPerSec: 4.0,
    phaseOffset: 11,
    bodyColor: '#f8fafc',
    roofColor: '#cbd5e1',
    lengthTiles: 2.6,
    type: 'van',
  },
  {
    lane: 'westbound',
    speedTilesPerSec: 4.6,
    phaseOffset: 39,
    bodyColor: '#8b5cf6',
    roofColor: '#a78bfa',
    lengthTiles: 2.4,
    type: 'sedan',
  },
  {
    lane: 'westbound',
    speedTilesPerSec: 3.6,
    phaseOffset: 68,
    bodyColor: '#06b6d4',
    roofColor: '#22d3ee',
    lengthTiles: 2.5,
    type: 'suv',
  },
  {
    lane: 'westbound',
    speedTilesPerSec: 4.3,
    phaseOffset: 95,
    bodyColor: '#eab308',
    roofColor: '#fde047',
    lengthTiles: 2.3,
    type: 'taxi',
  },
];

interface TreeSpec {
  col: number;
  row: number;
  kind: 'pine' | 'oak' | 'cherry' | 'xmas_pine';
  scale: number;
}

// Árvores posicionadas ao redor do campus (o prédio ocupa col 0..47, row 0..31)
const EXTERIOR_TREES: TreeSpec[] = [
  // Bosque Oeste (Campo & Riacho)
  { col: -14, row: -4, kind: 'pine', scale: 1.2 },
  { col: -10, row: -6, kind: 'oak', scale: 1.15 },
  { col: -6, row: -5, kind: 'xmas_pine', scale: 1.1 },
  { col: -15, row: 3, kind: 'oak', scale: 1.25 },
  { col: -11, row: 6, kind: 'pine', scale: 1.0 },
  { col: -4, row: 4, kind: 'xmas_pine', scale: 1.1 },
  { col: -14, row: 12, kind: 'pine', scale: 1.2 },
  { col: -5, row: 11, kind: 'oak', scale: 1.05 },
  { col: -12, row: 19, kind: 'xmas_pine', scale: 1.15 },
  { col: -4, row: 18, kind: 'cherry', scale: 1.1 },
  { col: -15, row: 26, kind: 'oak', scale: 1.2 },
  { col: -5, row: 25, kind: 'pine', scale: 1.1 },
  { col: -11, row: 31, kind: 'xmas_pine', scale: 1.15 },

  // Alameda Norte (Atrás do Campus, entre o prédio e a vila/colinas)
  { col: 3, row: -4, kind: 'xmas_pine', scale: 1.1 },
  { col: 11, row: -4, kind: 'oak', scale: 1.15 },
  { col: 19, row: -4, kind: 'xmas_pine', scale: 1.15 },
  { col: 28, row: -4, kind: 'xmas_pine', scale: 1.15 },
  { col: 36, row: -4, kind: 'oak', scale: 1.1 },
  { col: 44, row: -4, kind: 'xmas_pine', scale: 1.1 },

  // Jardim & Pomar Leste (Ao lado da Cafeteria/Lounge)
  { col: 51, row: -4, kind: 'pine', scale: 1.15 },
  { col: 56, row: -2, kind: 'oak', scale: 1.2 },
  { col: 52, row: 4, kind: 'xmas_pine', scale: 1.1 },
  { col: 58, row: 7, kind: 'cherry', scale: 1.15 },
  { col: 52, row: 13, kind: 'oak', scale: 1.1 },
  { col: 57, row: 16, kind: 'xmas_pine', scale: 1.2 },
  { col: 52, row: 22, kind: 'pine', scale: 1.05 },
  { col: 58, row: 25, kind: 'oak', scale: 1.2 },
  { col: 52, row: 30, kind: 'xmas_pine', scale: 1.15 },

  // Calçada Arborizada Sul (Ao longo da Avenida Principal)
  { col: -8, row: 34, kind: 'xmas_pine', scale: 1.1 },
  { col: 2, row: 34, kind: 'oak', scale: 1.05 },
  { col: 9, row: 34, kind: 'xmas_pine', scale: 1.15 },
  { col: 16, row: 34, kind: 'xmas_pine', scale: 1.2 },
  { col: 31, row: 34, kind: 'xmas_pine', scale: 1.2 },
  { col: 38, row: 34, kind: 'xmas_pine', scale: 1.15 },
  { col: 45, row: 34, kind: 'oak', scale: 1.05 },
  { col: 54, row: 34, kind: 'xmas_pine', scale: 1.1 },

  // Parque Sul (Depois da Avenida)
  { col: -6, row: 44, kind: 'oak', scale: 1.2 },
  { col: 5, row: 45, kind: 'pine', scale: 1.15 },
  { col: 14, row: 44, kind: 'xmas_pine', scale: 1.1 },
  { col: 29, row: 45, kind: 'oak', scale: 1.2 },
  { col: 37, row: 44, kind: 'xmas_pine', scale: 1.15 },
  { col: 48, row: 45, kind: 'pine', scale: 1.2 },
];

interface TownBuildingSpec {
  col: number;
  row: number;
  wTiles: number;
  hTiles: number;
  wallColor: string;
  roofColor: string;
  name?: string;
  windowRows: number;
  windowCols: number;
}

// Vila Tech & Cidadezinha ao Norte e Leste do Campus
const TOWN_BUILDINGS: TownBuildingSpec[] = [
  {
    col: -14,
    row: -13,
    wTiles: 7,
    hTiles: 6,
    wallColor: '#8c4a3e',
    roofColor: '#5c2d24',
    windowRows: 2,
    windowCols: 3,
  },
  {
    col: -5,
    row: -14,
    wTiles: 8,
    hTiles: 7,
    wallColor: '#475569',
    roofColor: '#334155',
    windowRows: 3,
    windowCols: 3,
  },
  {
    col: 5,
    row: -13,
    wTiles: 9,
    hTiles: 6,
    wallColor: '#b45309',
    roofColor: '#78350f',
    windowRows: 2,
    windowCols: 4,
  },
  {
    col: 16,
    row: -15,
    wTiles: 10,
    hTiles: 8,
    wallColor: '#3b4d6b',
    roofColor: '#1e293b',
    windowRows: 3,
    windowCols: 4,
  },
  {
    col: 28,
    row: -13,
    wTiles: 8,
    hTiles: 6,
    wallColor: '#7c5238',
    roofColor: '#4e3220',
    windowRows: 2,
    windowCols: 3,
  },
  {
    col: 38,
    row: -14,
    wTiles: 9,
    hTiles: 7,
    wallColor: '#4f5d73',
    roofColor: '#2c3545',
    windowRows: 3,
    windowCols: 4,
  },
  {
    col: 49,
    row: -13,
    wTiles: 8,
    hTiles: 6,
    wallColor: '#9a4e40',
    roofColor: '#632e24',
    windowRows: 2,
    windowCols: 3,
  },
];

const FAIRY_COLORS = ['#fde047', '#f87171', '#4ade80', '#60a5fa', '#f472b6'];

/**
 * Renderiza o mundo exterior vivo ao redor do escritório:
 * - Gramado de campo com flores silvestres e caminhos de pedra
 * - Riacho sinuoso a oeste com ponte de madeira
 * - Vila & Horizonte de cidade + colinas ao norte
 * - Pátio e Praça Central na entrada sul (com Árvore de Natal iluminada e fonte)
 * - Avenida movimentada ao sul com faixa de pedestres, postes de luz e carros passando
 * - Guirlandas e pisca-piscas natalinos acolhedores
 */
export function renderWorldScenery(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
  cols: number,
  rows: number,
  options?: WorldSceneryOptions,
): void {
  const fase = options?.faseIluminacao ?? 'dia';
  const natal = options?.natalAtivo ?? true;
  const s = TILE_SIZE * zoom;
  const nowSec = performance.now() / 1000;

  ctx.save();

  // 1. Fundo base de gramado campestre que cobre 100% do canvas
  const grassBase =
    fase === 'noite' ? '#162c24' : fase === 'tarde' ? '#2e5438' : '#3a6b44';
  const grassAlt =
    fase === 'noite' ? '#1a332a' : fase === 'tarde' ? '#355e3f' : '#43774e';

  ctx.fillStyle = grassBase;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Padrão de tiles de grama visíveis na tela (checkerboard sutil + tufos de grama e florzinhas)
  const startCol = Math.floor(-offsetX / s) - 1;
  const endCol = Math.ceil((canvasWidth - offsetX) / s) + 1;
  const startRow = Math.floor(-offsetY / s) - 1;
  const endRow = Math.ceil((canvasHeight - offsetY) / s) + 1;

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      // Pula o interior do prédio (que será desenhado por renderTileGrid)
      if (c >= 0 && c < cols && r >= 0 && r < rows) continue;

      const tx = Math.round(offsetX + c * s);
      const ty = Math.round(offsetY + r * s);

      if ((c + r) % 2 === 0) {
        ctx.fillStyle = grassAlt;
        ctx.fillRect(tx, ty, Math.ceil(s), Math.ceil(s));
      }

      // Hash determinístico para tufos de grama e pequenas flores do campo
      const h = Math.abs(Math.imul(c * 73856093, r * 19349663)) % 97;
      if (h < 14 && r > -10 && (r < 35 || r > 42)) {
        ctx.fillStyle =
          fase === 'noite' ? '#224235' : fase === 'tarde' ? '#44744d' : '#528c5c';
        const px = Math.max(1, Math.round(zoom * 1.5));
        ctx.fillRect(tx + s * 0.3, ty + s * 0.4, px, px * 2);
        ctx.fillRect(tx + s * 0.45, ty + s * 0.3, px, px * 2);
      } else if (h === 15 && r > -8 && (r < 34 || r > 42)) {
        // Florzinha silvestre
        ctx.fillStyle = h % 2 === 0 ? '#fde047' : '#f9a8d4';
        const px = Math.max(2, Math.round(zoom * 1.8));
        ctx.fillRect(tx + s * 0.5, ty + s * 0.5, px, px);
      }
    }
  }

  // 2. Riacho Campestre a Oeste (col -9..-7) com água corrente animada e ponte de madeira
  const riverWater =
    fase === 'noite' ? '#164e63' : fase === 'tarde' ? '#0284c7' : '#0ea5e9';
  const riverFoam =
    fase === 'noite' ? '#0e7490' : fase === 'tarde' ? '#38bdf8' : '#7dd3fc';

  for (let r = startRow; r <= endRow; r++) {
    // Curva suave do riacho
    const curve = Math.sin(r * 0.25) * 1.2;
    const riverCol = -8.5 + curve;
    const rx = offsetX + riverCol * s;
    const ry = offsetY + r * s;
    const rw = s * 2.4;

    // Margem de areia/pedrinhas
    ctx.fillStyle = fase === 'noite' ? '#334155' : '#94a3b8';
    ctx.fillRect(rx - zoom * 3, ry, rw + zoom * 6, Math.ceil(s) + 1);

    // Água
    ctx.fillStyle = riverWater;
    ctx.fillRect(rx, ry, rw, Math.ceil(s) + 1);

    // Brilho de correnteza animada
    const waveShift = ((r * 3 + nowSec * 2.5) % 4) / 4;
    ctx.fillStyle = riverFoam;
    ctx.fillRect(
      rx + rw * (0.25 + waveShift * 0.4),
      ry + s * 0.35,
      Math.max(2, zoom * 3),
      Math.max(1, zoom * 1.2),
    );
  }

  // Ponte de madeira sobre o riacho (row 16..18)
  {
    const bx = offsetX - 10 * s;
    const by = offsetY + 16 * s;
    const bw = 4.2 * s;
    const bh = 2.2 * s;
    ctx.fillStyle = '#78350f';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#92400e';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(bx + i * (bw / 6), by + zoom * 2, bw / 6 - zoom, bh - zoom * 4);
    }
    // Guarda-corpo da ponte
    ctx.fillStyle = '#451a03';
    ctx.fillRect(bx, by, bw, zoom * 2);
    ctx.fillRect(bx, by + bh - zoom * 2, bw, zoom * 2);
  }

  // 3. Pátio de Madeira Leste (Deck externo da Cafeteria, cols 48..51, rows 1..10)
  {
    const dx = offsetX + cols * s;
    const dy = offsetY + 1 * s;
    const dw = 3.5 * s;
    const dh = 9 * s;
    ctx.fillStyle = fase === 'noite' ? '#3e2723' : '#6d4c41';
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, zoom * 0.5);
    for (let r = 1; r <= 10; r++) {
      const ly = offsetY + r * s;
      ctx.beginPath();
      ctx.moveTo(dx, ly);
      ctx.lineTo(dx + dw, ly);
      ctx.stroke();
    }
    // Mesinhas de bistrô com guarda-sol no deck externo
    const umbrellaColors = ['#e5484d', '#10b981', '#f59e0b'];
    [2.5, 5.5, 8.5].forEach((rOff, idx) => {
      const ux = dx + 1.7 * s;
      const uy = offsetY + rOff * s;
      // Sombra
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.arc(ux + zoom * 2, uy + zoom * 2, s * 0.75, 0, Math.PI * 2);
      ctx.fill();
      // Guarda-sol
      ctx.fillStyle = umbrellaColors[idx % umbrellaColors.length];
      ctx.beginPath();
      ctx.arc(ux, uy, s * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ux, uy, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 4. Praça Central de Entrada (Sul do Prédio: cols 18..30, rows 32..35)
  {
    const px = offsetX + 18 * s;
    const py = offsetY + rows * s;
    const pw = 12 * s;
    const ph = 3.5 * s;
    ctx.fillStyle = fase === 'noite' ? '#334155' : '#94a3b8';
    ctx.fillRect(px, py, pw, ph);

    // Ladrilhos decorativos na praça
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let c = 18; c <= 30; c++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + c * s, py);
      ctx.lineTo(offsetX + c * s, py + ph);
      ctx.stroke();
    }

    // Grande Árvore de Natal / Pinheiro Iluminado na Praça de Entrada (col 24, row 33.4)
    if (natal) {
      drawGrandChristmasTree(ctx, offsetX + 20.2 * s, offsetY + 33.4 * s, zoom, nowSec);
      drawGrandChristmasTree(ctx, offsetX + 27.8 * s, offsetY + 33.4 * s, zoom, nowSec);
    }
  }

  // 5. Vila Tech & Prédios da Cidadezinha ao Norte (rows -15..-7)
  for (const b of TOWN_BUILDINGS) {
    const bx = offsetX + b.col * s;
    const by = offsetY + b.row * s;
    const bw = b.wTiles * s;
    const bh = b.hTiles * s;

    // Sombra do prédio
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(bx + zoom * 3, by + zoom * 3, bw, bh);

    // Corpo do prédio
    ctx.fillStyle = fase === 'noite' ? shadeHex(b.wallColor, -35) : b.wallColor;
    ctx.fillRect(bx, by, bw, bh);

    // Telhado
    ctx.fillStyle = b.roofColor;
    ctx.fillRect(bx - zoom * 2, by, bw + zoom * 4, s * 1.1);

    // Pisca-piscas natalinos no beiral dos prédios da vila
    if (natal) {
      const numLights = b.wTiles * 2;
      for (let i = 0; i < numLights; i++) {
        const lx = bx + (i + 0.5) * (bw / numLights);
        const ly = by + s * 1.15;
        const colorIdx = (i + Math.floor(nowSec * 2)) % FAIRY_COLORS.length;
        ctx.fillStyle = FAIRY_COLORS[colorIdx];
        ctx.fillRect(lx, ly, Math.max(2, zoom * 1.6), Math.max(2, zoom * 1.6));
      }
    }

    // Janelas iluminadas
    const winW = s * 0.9;
    const winH = s * 0.9;
    for (let wr = 0; wr < b.windowRows; wr++) {
      for (let wc = 0; wc < b.windowCols; wc++) {
        const wx = bx + ((wc + 0.6) * bw) / (b.windowCols + 0.2);
        const wy = by + s * 1.6 + wr * (s * 1.45);
        const isLit = fase !== 'dia' || (wr + wc + b.col) % 2 === 0;
        ctx.fillStyle = isLit
          ? fase === 'noite'
            ? '#fde047'
            : '#fef08a'
          : '#1e293b';
        ctx.fillRect(wx, wy, winW, winH);
      }
    }
  }

  // 6. Avenida Urbana Sul (Calçadas + Ciclovia + Pista Dupla + Faixa de Pedestres + Carros)
  const roadTopRow = rows + 3.2; // row 35.2
  const roadHeightTiles = 5.2;
  const roadY = offsetY + roadTopRow * s;
  const roadH = roadHeightTiles * s;

  // Calçada superior e inferior
  const sidewalkColor = fase === 'noite' ? '#334155' : '#94a3b8';
  ctx.fillStyle = sidewalkColor;
  ctx.fillRect(0, roadY - s * 0.9, canvasWidth, s * 0.9);
  ctx.fillRect(0, roadY + roadH, canvasWidth, s * 0.9);

  // Asfalto da avenida
  ctx.fillStyle = fase === 'noite' ? '#1e2430' : '#2d3542';
  ctx.fillRect(0, roadY, canvasWidth, roadH);

  // Linha divisória central tracejada amarela
  ctx.fillStyle = '#eab308';
  const dashW = s * 1.5;
  const dashGap = s * 1.2;
  for (let c = startCol; c <= endCol; c += 3) {
    const dx = offsetX + c * s;
    ctx.fillRect(dx, roadY + roadH / 2 - zoom, dashW, Math.max(2, zoom * 2));
  }

  // Faixa de pedestres em frente à entrada principal (cols 22..26)
  ctx.fillStyle = fase === 'noite' ? '#cbd5e1' : '#f8fafc';
  const crossX = offsetX + 22.2 * s;
  const crossW = 3.6 * s;
  for (let i = 0; i < 6; i++) {
    const stripeY = roadY + (i + 0.35) * (roadH / 6.3);
    ctx.fillRect(crossX, stripeY, crossW, roadH / 11);
  }

  // Carros passando suavemente nos dois sentidos
  const trackSpanTiles = 110; // de col -30 até col +80
  const minTrackCol = -30;

  for (const car of CARS) {
    const dist = (nowSec * car.speedTilesPerSec + car.phaseOffset) % trackSpanTiles;
    const carCol =
      car.lane === 'eastbound'
        ? minTrackCol + dist
        : minTrackCol + trackSpanTiles - dist;
    const laneRow =
      car.lane === 'eastbound'
        ? roadTopRow + roadHeightTiles * 0.68
        : roadTopRow + roadHeightTiles * 0.28;

    const cx = offsetX + carCol * s;
    const cy = offsetY + laneRow * s;
    const cw = car.lengthTiles * s;
    const ch = 1.35 * s;

    // Pula se estiver fora da tela
    if (cx + cw < -s * 4 || cx - cw > canvasWidth + s * 4) continue;

    drawPixelCar(
      ctx,
      cx,
      cy,
      cw,
      ch,
      car.bodyColor,
      car.roofColor,
      car.lane === 'eastbound' ? 1 : -1,
      car.type,
      fase !== 'dia',
      zoom,
    );
  }

  // 7. Árvores do Campo, Pinheiros de Natal e Postes de Iluminação
  for (const t of EXTERIOR_TREES) {
    const tx = offsetX + t.col * s;
    const ty = offsetY + t.row * s;
    if (tx < -s * 4 || tx > canvasWidth + s * 4 || ty < -s * 4 || ty > canvasHeight + s * 4) {
      continue;
    }
    drawExteriorTree(ctx, tx, ty, s * t.scale, t.kind, natal, nowSec, zoom);
  }

  // 8. Guirlandas e Luzes de Natal no Beiral do Próprio Escritório (col 0..cols, row 0 e row rows)
  if (natal) {
    const bx = offsetX;
    const byTop = offsetY + zoom * 2;
    const byBot = offsetY + rows * s - zoom * 2;
    const totalBulbs = cols * 2;
    for (let i = 0; i <= totalBulbs; i++) {
      const lx = bx + (i / totalBulbs) * (cols * s);
      const wave = Math.sin(i * 0.9) * zoom * 2;
      const color = FAIRY_COLORS[(i + Math.floor(nowSec * 2.5)) % FAIRY_COLORS.length];

      ctx.fillStyle = color;
      const bulbSize = Math.max(2, Math.round(zoom * 1.8));
      ctx.fillRect(lx, byTop + wave, bulbSize, bulbSize);
      ctx.fillRect(lx, byBot + wave, bulbSize, bulbSize);
    }
  }

  ctx.restore();
}

function drawPixelCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bodyColor: string,
  roofColor: string,
  dir: 1 | -1,
  type: 'sedan' | 'suv' | 'van' | 'taxi',
  lightsOn: boolean,
  zoom: number,
): void {
  const left = x - w / 2;
  const top = y - h / 2;

  // Feixe dos faróis à noite/entardecer
  if (lightsOn) {
    ctx.save();
    const beamLen = w * 1.6;
    const beamX = dir === 1 ? left + w : left;
    const grad = ctx.createLinearGradient(beamX, y, beamX + dir * beamLen, y);
    grad.addColorStop(0, 'rgba(254, 240, 138, 0.42)');
    grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(beamX, top + h * 0.15);
    ctx.lineTo(beamX + dir * beamLen, top - h * 0.45);
    ctx.lineTo(beamX + dir * beamLen, top + h * 1.45);
    ctx.lineTo(beamX, top + h * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Sombra embaixo do carro
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(left + zoom, top + zoom * 2, w, h);

  // Rodas pixeladas
  ctx.fillStyle = '#0f172a';
  const wheelW = w * 0.2;
  const wheelH = Math.max(2, zoom * 2.2);
  ctx.fillRect(left + w * 0.14, top - wheelH * 0.5, wheelW, wheelH);
  ctx.fillRect(left + w * 0.66, top - wheelH * 0.5, wheelW, wheelH);
  ctx.fillRect(left + w * 0.14, top + h - wheelH * 0.5, wheelW, wheelH);
  ctx.fillRect(left + w * 0.66, top + h - wheelH * 0.5, wheelW, wheelH);

  // Lataria principal
  ctx.fillStyle = bodyColor;
  ctx.fillRect(left, top, w, h);

  // Para-brisas / janelas escuras
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(left + w * 0.16, top + h * 0.12, w * 0.68, h * 0.76);

  // Teto do carro
  ctx.fillStyle = roofColor;
  const roofW = type === 'van' ? w * 0.62 : w * 0.46;
  const roofLeft =
    dir === 1 ? left + w * 0.22 : left + w - roofW - w * 0.22;
  ctx.fillRect(roofLeft, top + h * 0.16, roofW, h * 0.68);

  // Letreiro luminoso se for táxi
  if (type === 'taxi') {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(
      left + w * 0.42,
      top + h * 0.32,
      w * 0.16,
      h * 0.36,
    );
  }

  // Faróis dianteiros e lanternas traseiras
  const frontX = dir === 1 ? left + w - zoom * 2 : left;
  const rearX = dir === 1 ? left : left + w - zoom * 2;
  const lightW = Math.max(2, zoom * 2);
  const lightH = Math.max(2, h * 0.22);

  ctx.fillStyle = '#fef08a';
  ctx.fillRect(frontX, top + h * 0.1, lightW, lightH);
  ctx.fillRect(frontX, top + h * 0.68, lightW, lightH);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(rearX, top + h * 0.1, lightW, lightH);
  ctx.fillRect(rearX, top + h * 0.68, lightW, lightH);
}

function drawExteriorTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  kind: 'pine' | 'oak' | 'cherry' | 'xmas_pine',
  natal: boolean,
  nowSec: number,
  zoom: number,
): void {
  // Sombra no chão
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.45, size * 0.55, size * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tronco
  ctx.fillStyle = '#5c3a21';
  ctx.fillRect(x - size * 0.14, y, size * 0.28, size * 0.45);

  if (kind === 'pine' || kind === 'xmas_pine') {
    // Camadas de pinheiro em pixel-art
    const layers = [
      { yOff: -size * 0.1, w: size * 1.1, h: size * 0.45, color: '#1b4d3e' },
      { yOff: -size * 0.42, w: size * 0.86, h: size * 0.42, color: '#22634f' },
      { yOff: -size * 0.72, w: size * 0.58, h: size * 0.38, color: '#2d7a61' },
    ];
    for (const l of layers) {
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.moveTo(x, y + l.yOff - l.h);
      ctx.lineTo(x - l.w / 2, y + l.yOff);
      ctx.lineTo(x + l.w / 2, y + l.yOff);
      ctx.closePath();
      ctx.fill();
    }

    // Se modo natal estiver ativo e for xmas_pine, desenha luzinhas piscantes e estrela no topo
    if (natal && kind === 'xmas_pine') {
      // Estrela dourada no topo
      ctx.fillStyle = '#fde047';
      const starS = Math.max(3, zoom * 2.6);
      ctx.fillRect(x - starS / 2, y - size * 1.15, starS, starS);

      // Luzinhas coloridas
      const ornaments = [
        { dx: -0.22, dy: -0.22 },
        { dx: 0.18, dy: -0.26 },
        { dx: -0.12, dy: -0.52 },
        { dx: 0.15, dy: -0.55 },
        { dx: 0.0, dy: -0.78 },
        { dx: -0.28, dy: -0.15 },
        { dx: 0.26, dy: -0.16 },
      ];
      ornaments.forEach((o, idx) => {
        const c =
          FAIRY_COLORS[(idx + Math.floor(nowSec * 2 + x * 0.01)) % FAIRY_COLORS.length];
        ctx.fillStyle = c;
        const b = Math.max(2, zoom * 1.8);
        ctx.fillRect(x + o.dx * size, y + o.dy * size, b, b);
      });
    }
  } else {
    // Copa arredondada frondosa (Carvalho / Cerejeira)
    const mainColor = kind === 'cherry' ? '#db2777' : '#2e6f40';
    const topColor = kind === 'cherry' ? '#f472b6' : '#3d8b52';

    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.arc(x, y - size * 0.35, size * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.arc(x - size * 0.15, y - size * 0.48, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGrandChristmasTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  nowSec: number,
): void {
  const size = TILE_SIZE * zoom * 1.75;
  // Halo dourado acolhedor no chão
  const glow = ctx.createRadialGradient(x, y, size * 0.1, x, y, size * 1.1);
  glow.addColorStop(0, 'rgba(250, 204, 21, 0.28)');
  glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, size * 1.1, 0, Math.PI * 2);
  ctx.fill();

  drawExteriorTree(ctx, x, y, size, 'xmas_pine', true, nowSec, zoom);

  // Presentinhos coloridos na base da árvore
  const boxS = Math.max(3, zoom * 3.2);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x - size * 0.32, y + size * 0.22, boxS, boxS);
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(x + size * 0.16, y + size * 0.24, boxS, boxS);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(x - size * 0.06, y + size * 0.28, boxS * 0.85, boxS * 0.85);
}

function shadeHex(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
