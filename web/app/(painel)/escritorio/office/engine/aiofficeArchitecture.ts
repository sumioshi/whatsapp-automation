import { TILE_SIZE } from '../types';

// ── Color & Hash Utilities (ported from AIOffice art/core/color.ts) ──

type RGBA = readonly [number, number, number, number];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, '0');

function toHex(r: number, g: number, b: number, a = 255): string {
  return a >= 255
    ? `#${hex2(r)}${hex2(g)}${hex2(b)}`
    : `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}

function parseHex(c: string): RGBA {
  const s = c.trim().replace(/^#/, '');
  if (s.length === 3) {
    return [
      parseInt(s[0] + s[0], 16),
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16),
      255,
    ];
  }
  return [
    parseInt(s.slice(0, 2), 16) || 0,
    parseInt(s.slice(2, 4), 16) || 0,
    parseInt(s.slice(4, 6), 16) || 0,
    s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255,
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [
    Math.round(ch(hh + 1 / 3) * 255),
    Math.round(ch(hh) * 255),
    Math.round(ch(hh - 1 / 3) * 255),
  ];
}

function towardHue(h: number, target: number, deg: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < deg) return target;
  d = Math.sign(d) * deg;
  return (h + d + 360) % 360;
}

export function shade(c: string, k: number): string {
  if (k === 0) return c;
  const [r, g, b, a] = parseHex(c);
  let [h, s, l] = rgbToHsl(r, g, b);
  const amt = Math.abs(k);
  if (k < 0) {
    h = towardHue(h, 235, amt * 55 * Math.min(1, s * 2 + 0.2));
    s = clamp01(s + amt * 0.12);
  } else {
    h = towardHue(h, 48, amt * 35 * Math.min(1, s * 2 + 0.2));
    s = clamp01(s - amt * 0.05);
  }
  l = clamp01(l + k);
  const [nr, ng, nb] = hslToRgb(h, s, l);
  return toHex(nr, ng, nb, a);
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const u = clamp01(t);
  return toHex(
    ca[0] + (cb[0] - ca[0]) * u,
    ca[1] + (cb[1] - ca[1]) * u,
    ca[2] + (cb[2] - ca[2]) * u,
    ca[3] + (cb[3] - ca[3]) * u,
  );
}

function hash2d(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ── Lightweight 1x Pixel Buffer for Seamless Surfaces & Rugs ──

class SurfaceBuf {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  set(x: number, y: number, hex: string): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const [r, g, b, a] = parseHex(hex);
    const i = (yi * this.w + xi) * 4;
    if (a >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
    } else if (a > 0) {
      const sa = a / 255;
      const da = this.data[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      this.data[i] = (r * sa + this.data[i] * da * (1 - sa)) / oa;
      this.data[i + 1] = (g * sa + this.data[i + 1] * da * (1 - sa)) / oa;
      this.data[i + 2] = (b * sa + this.data[i + 2] * da * (1 - sa)) / oa;
      this.data[i + 3] = oa * 255;
    }
  }

  rect(x: number, y: number, w: number, h: number, hex: string): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.set(xx, yy, hex);
      }
    }
  }

  hline(x0: number, x1: number, y: number, hex: string): void {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) this.set(x, y, hex);
  }

  vline(x: number, y0: number, y1: number, hex: string): void {
    const a = Math.min(y0, y1);
    const b = Math.max(y0, y1);
    for (let y = a; y <= b; y++) this.set(x, y, hex);
  }
}

// ── AIOffice Floor Tile Renderers (Seamless 16×16 tiles) ──

export type AioFloorKind = 'marble' | 'wood' | 'tile_check' | 'tile_white' | 'concrete' | 'carpet';

function drawFloorTile(
  b: SurfaceBuf,
  ox: number,
  oy: number,
  kind: AioFloorKind,
  tx: number,
  ty: number,
  seed: number,
  tint?: string,
): void {
  const T = TILE_SIZE;
  switch (kind) {
    case 'marble': {
      // Placas nobres 32x32 (2x2 tiles) com junta sutil e veio diagonal suave
      const base = tint ? mix('#edeae2', tint, 0.08) : '#edeae2';
      const slabX = tx >> 1;
      const slabY = ty >> 1;
      const sh = (hash2d(slabX, slabY, seed) - 0.5) * 0.025;
      const col = shade(base, sh);
      const grout = shade(base, -0.075);
      const hi = shade(base, 0.045);
      const vein1 = shade(base, -0.045);
      const vein2 = shade(base, -0.025);
      b.rect(ox, oy, T, T, col);
      if ((tx & 1) === 0) {
        b.vline(ox, oy, oy + T - 1, grout);
        b.vline(ox + 1, oy, oy + T - 1, hi);
      }
      if ((ty & 1) === 0) {
        b.hline(ox, ox + T - 1, oy, grout);
        b.hline(ox, ox + T - 1, oy + 1, hi);
      }
      const vh = hash2d(slabX, slabY, seed + 9);
      if (vh < 0.72) {
        const dir = vh < 0.36 ? 1 : -1;
        const startY = Math.floor(vh * 40) % 24;
        const lx0 = (tx & 1) * T;
        const ly0 = (ty & 1) * T;
        for (let lx = 0; lx < T; lx++) {
          const gx = lx0 + lx;
          const gy =
            startY +
            Math.floor(gx * 0.45 * dir + Math.sin((gx + slabX * 7) * 0.35) * 2);
          const ly = gy - ly0;
          if (ly >= 1 && ly < T - 1 && gx > 1 && gx < 31) {
            b.set(ox + lx, oy + ly, vein1);
            if (ly + 1 < T - 1) b.set(ox + lx, oy + ly + 1, vein2);
          }
        }
      }
      break;
    }
    case 'wood': {
      // Tábuas horizontais de carvalho mel (4px de altura) com emendas desencontradas
      const base = tint ? mix('#c9935b', tint, 0.15) : '#c9935b';
      const seam = shade(base, -0.18);
      for (let row = 0; row < 4; row++) {
        const py = oy + row * 4;
        const jointPeriod = 2;
        const offset = (row * 1 + (ty & 1)) % jointPeriod;
        const plankIdx = Math.floor((tx + offset) / jointPeriod);
        const plankTone =
          (hash2d(plankIdx, ty * 4 + row, seed) - 0.5) * 0.08;
        const c = shade(base, plankTone);
        const cHi = shade(c, 0.045);
        const cGrain = shade(c, -0.04);
        b.rect(ox, py, T, 3, c);
        b.hline(ox, ox + T - 1, py, cHi);
        b.hline(ox, ox + T - 1, py + 3, seam);
        for (let x = 0; x < T; x++) {
          if (hash2d(tx * T + x, ty * 4 + row, seed + 5) < 0.18) {
            b.set(ox + x, py + 1 + (x & 1), cGrain);
          }
        }
        if ((tx + offset) % jointPeriod === 0) {
          const jx = ox + ((row * 5 + ty * 3) % 6);
          b.vline(jx, py, py + 2, seam);
          if (jx + 1 < ox + T) b.vline(jx + 1, py, py + 2, cHi);
        }
      }
      break;
    }
    case 'tile_check': {
      // Ladrilho bistrô (8x8px por ladrilho, 2x2 por tile)
      const light = '#f2ede1';
      const dark = tint ? mix('#d6c6ae', tint, 0.35) : '#d8c5ab';
      const grout = '#bfb29c';
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const isDark = ((tx * 2 + sx + ty * 2 + sy) & 1) === 1;
          const col = isDark ? dark : light;
          const x0 = ox + sx * 8;
          const y0 = oy + sy * 8;
          b.rect(x0, y0, 8, 8, col);
          b.hline(x0, x0 + 7, y0, shade(col, 0.04));
          b.hline(x0, x0 + 7, y0 + 7, grout);
          b.vline(x0 + 7, y0, y0 + 7, grout);
        }
      }
      break;
    }
    case 'tile_white': {
      // Azulejo claro de lavabo (8x8px por ladrilho)
      const base = '#eef4f8';
      const grout = '#cfdbe4';
      const hi = '#f9fcfe';
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const v =
            (hash2d(tx * 2 + sx, ty * 2 + sy, seed) - 0.5) * 0.03;
          const col = shade(base, v);
          const x0 = ox + sx * 8;
          const y0 = oy + sy * 8;
          b.rect(x0, y0, 8, 8, col);
          b.hline(x0, x0 + 6, y0, hi);
          b.vline(x0, y0, y0 + 6, hi);
          b.hline(x0, x0 + 7, y0 + 7, grout);
          b.vline(x0 + 7, y0, y0 + 7, grout);
        }
      }
      break;
    }
    case 'concrete': {
      const base = '#dbd9d2';
      const sh = (hash2d(tx, ty, seed) - 0.5) * 0.025;
      const col = shade(base, sh);
      const seam = shade(base, -0.06);
      const hi = shade(base, 0.04);
      b.rect(ox, oy, T, T, col);
      b.hline(ox, ox + T - 1, oy, hi);
      b.vline(ox, oy, oy + T - 1, hi);
      b.hline(ox, ox + T - 1, oy + T - 1, seam);
      b.vline(ox + T - 1, oy, oy + T - 1, seam);
      break;
    }
    case 'carpet': {
      const c1 = tint ?? '#7c92ab';
      const c2 = shade(c1, -0.05);
      const isAlt = ((tx + ty) & 1) === 1;
      const base = isAlt ? c2 : c1;
      const l = shade(base, 0.03);
      const d = shade(base, -0.03);
      b.rect(ox, oy, T, T, base);
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          if (((x + y) & 1) === 0) {
            const h = hash2d(tx * T + x, ty * T + y, seed);
            b.set(ox + x, oy + y, h < 0.5 ? l : d);
          }
        }
      }
      break;
    }
  }
}

// ── AIOffice Woven Fringed Rug Renderer (ported from art/surfaces/rug.ts) ──

function drawRug(
  b: SurfaceBuf,
  rx: number,
  ry: number,
  w: number,
  h: number,
  color: string,
  seed: number,
): void {
  if (w < 8 || h < 8) return;
  const base = color;
  const trim = shade(color, -0.2);
  const inner = shade(color, 0.14);
  const med = shade(color, 0.22);
  const fringe = '#e8e0cf';
  const fringeDk = '#c8beaa';

  // Sombra sutil sob a borda sul/leste
  b.hline(rx + 2, rx + w - 2, ry + h, '#1e22342e');
  b.vline(rx + w - 2, ry + 1, ry + h - 1, '#1e223426');

  // Franjas nas pontas oeste e leste
  for (let y = 1; y < h - 1; y++) {
    const c = (y & 1) === 0 ? fringe : fringeDk;
    b.set(rx, ry + y, c);
    b.set(rx + 1, ry + y, (y & 1) === 0 ? fringeDk : fringe);
    b.set(rx + w - 1, ry + y, c);
    b.set(rx + w - 2, ry + y, (y & 1) === 0 ? fringeDk : fringe);
  }

  const bx = rx + 2;
  const bw = w - 4;
  b.rect(bx, ry, bw, h, base);

  // Trama sutil no miolo
  const weaveLt = shade(base, 0.035);
  const weaveDk = shade(base, -0.035);
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < bw - 3; x++) {
      if (((x + y) & 3) === 0) {
        b.set(
          bx + x,
          ry + y,
          hash2d(x, y, seed) < 0.5 ? weaveLt : weaveDk,
        );
      }
    }
  }

  // Borda externa escura
  b.hline(bx, bx + bw - 1, ry, trim);
  b.hline(bx, bx + bw - 1, ry + h - 1, trim);
  b.vline(bx, ry, ry + h - 1, trim);
  b.vline(bx + bw - 1, ry, ry + h - 1, trim);

  // Moldura interna clara com cantos geométricos
  if (bw >= 10 && h >= 10) {
    b.hline(bx + 2, bx + bw - 3, ry + 2, inner);
    b.hline(bx + 2, bx + bw - 3, ry + h - 3, inner);
    b.vline(bx + 2, ry + 2, ry + h - 3, inner);
    b.vline(bx + bw - 3, ry + 2, ry + h - 3, inner);
    for (const [cx, cy] of [
      [bx + 3, ry + 3],
      [bx + bw - 4, ry + 3],
      [bx + 3, ry + h - 4],
      [bx + bw - 4, ry + h - 4],
    ] as const) {
      b.set(cx, cy, med);
    }
  }

  // Losango central discreto em tapetes maiores
  if (bw >= 24 && h >= 20) {
    const cx = bx + Math.floor(bw / 2);
    const cy = ry + Math.floor(h / 2);
    const r = Math.min(5, Math.floor(Math.min(bw, h) / 6));
    for (let dy = -r; dy <= r; dy++) {
      const span = r - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const edge = Math.abs(dx) + Math.abs(dy) === r;
        b.set(cx + dx, cy + dy, edge ? med : inner);
      }
    }
  }
}

// ── AIOffice 3D Wall Face Renderer (2-tile tall North Wall with Cap, Pattern & Baseboard) ──

export type AioWallPattern = 'plain' | 'stripes' | 'tiles' | 'wood_panel' | 'marble';

export interface AioWallSpan {
  col: number;
  row: number; // Top row of the 2-tile tall north wall face (occupies row and row+1)
  wTiles: number;
  base: string;
  trim: string;
  pattern: AioWallPattern;
  doorways?: Array<{ colOffset: number; wTiles: number }>;
  plaque?: { colOffset: number; title: string; accent: string };
}

export interface AioWallCapRect {
  col: number;
  row: number;
  wTiles: number;
  hTiles: number;
  trim?: string;
}

function drawWallFaceSpan(b: SurfaceBuf, span: AioWallSpan): void {
  const T = TILE_SIZE;
  const WALL_CAP_H = 4;
  const WALL_FACE_H = T * 2; // 32px
  const BASEBOARD_H = 3;

  const doorTiles = new Set<number>();
  for (const d of span.doorways ?? []) {
    for (let c = d.colOffset; c < d.colOffset + d.wTiles; c++) {
      doorTiles.add(c);
    }
  }

  const topCap = '#363c4f';
  const topCapHi = '#485068';
  const topCapEdge = '#272b3b';

  const base = span.base;
  const baseTop = shade(base, 0.04);
  const baseBot = shade(base, -0.04);
  const trim = span.trim;
  const trimHi = shade(trim, 0.07);
  const trimDk = shade(trim, -0.12);

  for (let tc = 0; tc < span.wTiles; tc++) {
    if (doorTiles.has(tc)) {
      // Draw threshold shadow on floor at doorway
      const dx = (span.col + tc) * T;
      const dy = (span.row + 2) * T - 2;
      b.hline(dx, dx + T - 1, dy, '#1e223422');
      continue;
    }

    const ox = (span.col + tc) * T;
    const oy = span.row * T;

    // 1. Dark 3D Wall Cap (top 4px)
    b.rect(ox, oy, T, WALL_CAP_H, topCap);
    b.hline(ox, ox + T - 1, oy, topCapHi);
    b.hline(ox, ox + T - 1, oy + WALL_CAP_H - 1, topCapEdge);

    // 2. Wall Face Body (y = 4..28) with subtle vertical gradient
    const bodyTop = oy + WALL_CAP_H;
    const bodyBot = oy + WALL_FACE_H - BASEBOARD_H;
    const bodyH = bodyBot - bodyTop;
    for (let y = 0; y < bodyH; y++) {
      const k = y / Math.max(1, bodyH - 1);
      const col = k < 0.35 ? baseTop : k > 0.78 ? baseBot : base;
      b.hline(ox, ox + T - 1, bodyTop + y, col);
    }
    // Crown shadow right below cap
    b.hline(ox, ox + T - 1, bodyTop, shade(base, -0.08));

    // 3. Pattern
    if (span.pattern === 'stripes') {
      const stripe = shade(base, -0.035);
      for (let x = 2; x < T; x += 4) {
        b.vline(ox + x, bodyTop + 1, bodyBot - 1, stripe);
      }
    } else if (span.pattern === 'tiles') {
      const grout = shade(base, -0.08);
      const hi = shade(base, 0.04);
      for (let y = bodyTop + 4; y < bodyBot; y += 6) {
        b.hline(ox, ox + T - 1, y, grout);
        if (y + 1 < bodyBot) b.hline(ox, ox + T - 1, y + 1, hi);
      }
      for (let x = 0; x < T; x += 8) {
        b.vline(ox + x, bodyTop + 1, bodyBot - 1, grout);
      }
    } else if (span.pattern === 'wood_panel') {
      // Wainscoting wood paneling on lower half of wall
      const wainTop = bodyTop + Math.floor(bodyH * 0.48);
      const wood = '#b98550';
      const woodHi = shade(wood, 0.08);
      const woodDk = shade(wood, -0.12);
      b.rect(ox, wainTop, T, bodyBot - wainTop, wood);
      b.hline(ox, ox + T - 1, wainTop, woodHi);
      b.hline(ox, ox + T - 1, wainTop + 1, woodDk);
      for (let x = 0; x < T; x += 8) {
        b.vline(ox + x, wainTop + 2, bodyBot - 1, woodDk);
        b.vline(ox + x + 1, wainTop + 2, bodyBot - 1, woodHi);
      }
    } else if (span.pattern === 'marble') {
      const vein = shade(base, -0.05);
      const seam = shade(base, -0.07);
      b.vline(ox + T - 1, bodyTop + 1, bodyBot - 1, seam);
      b.hline(ox, ox + T - 1, bodyTop + Math.floor(bodyH / 2), seam);
      for (let x = 0; x < T; x++) {
        const y = bodyTop + 3 + ((x * 5) % (bodyH - 6));
        b.set(ox + x, y, vein);
      }
    }

    // 4. Baseboard (rodapé 3px na base da parede + sombra projetada no piso)
    const bbY = oy + WALL_FACE_H - BASEBOARD_H;
    b.rect(ox, bbY, T, BASEBOARD_H, trim);
    b.hline(ox, ox + T - 1, bbY, trimHi);
    b.hline(ox, ox + T - 1, bbY + BASEBOARD_H - 1, trimDk);
    // Floor contact shadow below wall
    b.hline(ox, ox + T - 1, oy + WALL_FACE_H, '#1e223438');
    b.hline(ox, ox + T - 1, oy + WALL_FACE_H + 1, '#1e22341c');

    // If adjacent tile is a doorway, draw crisp door jamb trim!
    if (doorTiles.has(tc + 1)) {
      b.vline(ox + T - 2, oy + WALL_CAP_H, oy + WALL_FACE_H - 1, '#f4f2ee');
      b.vline(ox + T - 1, oy + WALL_CAP_H, oy + WALL_FACE_H - 1, '#272b3b');
    }
    if (doorTiles.has(tc - 1)) {
      b.vline(ox, oy + WALL_CAP_H, oy + WALL_FACE_H - 1, '#272b3b');
      b.vline(ox + 1, oy + WALL_CAP_H, oy + WALL_FACE_H - 1, '#f4f2ee');
    }
  }
}

function drawWallCap(b: SurfaceBuf, cap: AioWallCapRect): void {
  const T = TILE_SIZE;
  const ox = cap.col * T;
  const oy = cap.row * T;
  const w = cap.wTiles * T;
  const h = cap.hTiles * T;
  const topCap = '#363c4f';
  const topCapHi = '#485068';
  const topCapEdge = '#272b3b';

  b.rect(ox, oy, w, h, topCap);
  b.hline(ox, ox + w - 1, oy, topCapHi);
  b.vline(ox, oy, oy + h - 1, topCapHi);
  b.hline(ox, ox + w - 1, oy + h - 1, topCapEdge);
  b.vline(ox + w - 1, oy, oy + h - 1, topCapEdge);
  // Subtle drop shadow south of horizontal divider walls
  if (cap.wTiles > cap.hTiles) {
    b.hline(ox, ox + w - 1, oy + h, '#1e223430');
  }
}

// ── Complete Multi-Room Building Blueprint (50 × 36 tiles) ──

interface FloorZone {
  col: number;
  row: number;
  wTiles: number;
  hTiles: number;
  kind: AioFloorKind;
  seed: number;
  tint?: string;
}

interface RugZone {
  col: number;
  row: number;
  wTiles: number;
  hTiles: number;
  color: string;
  seed: number;
}

const FLOOR_ZONES: FloorZone[] = [
  // Base marble across entire building interior (cols 0..49, rows 0..35)
  { col: 0, row: 0, wTiles: 50, hTiles: 36, kind: 'marble', seed: 101 },

  // Sala 1: Copa & Coffee Lab (cols 1..12, rows 2..7) -> Bistro checkerboard
  { col: 1, row: 2, wTiles: 12, hTiles: 6, kind: 'tile_check', seed: 202, tint: '#d49b72' },

  // Sala 2: WC / Lavabo (cols 13..18, rows 2..7) -> Glazed white ceramic tile
  { col: 13, row: 2, wTiles: 6, hTiles: 6, kind: 'tile_white', seed: 303 },

  // Sala 3: Recepção & Hub (cols 19..31, rows 2..7) -> Warm ivory marble
  { col: 19, row: 2, wTiles: 13, hTiles: 6, kind: 'marble', seed: 404, tint: '#f5e6c8' },

  // Sala 4: Lounge, Descompressão & Ping-Pong (cols 32..48, rows 2..7) -> Warm honey oak wood
  { col: 32, row: 2, wTiles: 17, hTiles: 6, kind: 'wood', seed: 505 },

  // Boulevard Central Leste-Oeste (cols 1..48, rows 9..10) & Promenade Norte-Sul (cols 23..26, rows 9..34)
  { col: 1, row: 9, wTiles: 48, hTiles: 2, kind: 'marble', seed: 606 },
  { col: 23, row: 9, wTiles: 4, hTiles: 26, kind: 'marble', seed: 607 },

  // Estúdio 1 (Noroeste, cols 1..22, rows 13..21) — SaaS & AI Core (Marble + Wood Nook)
  { col: 1, row: 13, wTiles: 22, hTiles: 9, kind: 'marble', seed: 701, tint: '#f3d9ce' },
  { col: 18, row: 14, wTiles: 4, hTiles: 7, kind: 'wood', seed: 702 },

  // Estúdio 2 (Nordeste, cols 27..48, rows 13..21) — Operações & Automação (Marble + Wood Nook)
  { col: 27, row: 13, wTiles: 22, hTiles: 9, kind: 'marble', seed: 801, tint: '#d4e7f2' },
  { col: 44, row: 14, wTiles: 4, hTiles: 7, kind: 'wood', seed: 802 },

  // Estúdio 3 (Sudoeste, cols 1..22, rows 25..34) — Clínicas, Saúde & Educação
  { col: 1, row: 25, wTiles: 22, hTiles: 10, kind: 'marble', seed: 901, tint: '#d8ecdf' },
  { col: 18, row: 26, wTiles: 4, hTiles: 8, kind: 'wood', seed: 902 },

  // Estúdio 4 (Sudeste, cols 27..48, rows 25..34) — FinTech, iGaming & E-Commerce
  { col: 27, row: 25, wTiles: 22, hTiles: 10, kind: 'marble', seed: 951, tint: '#e4dcf2' },
  { col: 44, row: 26, wTiles: 4, hTiles: 8, kind: 'wood', seed: 952 },
];

const RUG_ZONES: RugZone[] = [
  // Recepção: Tapete de boas-vindas azul-real
  { col: 21, row: 3.5, wTiles: 8, hTiles: 3.5, color: '#3d638c', seed: 11 },
  // Copa: Tapete passadeira terracota
  { col: 2, row: 3, wTiles: 5, hTiles: 1.5, color: '#c4684f', seed: 12 },
  // Lounge: Tapete sob o sofá + Tapete sob a arena de Ping-Pong
  { col: 33, row: 3.2, wTiles: 6, hTiles: 3.8, color: '#3b7a78', seed: 13 },
  { col: 40.5, row: 3.2, wTiles: 6, hTiles: 4, color: '#c87a4b', seed: 14 },

  // Estúdio 1 (Noroeste — Terracota & Coral): Tapetes sob as 7 estações de trabalho
  { col: 1.5, row: 14.2, wTiles: 15.5, hTiles: 3.1, color: '#c26953', seed: 21 },
  { col: 2.2, row: 18.2, wTiles: 13.5, hTiles: 3.1, color: '#b55e49', seed: 22 },
  // Doormat Estúdio 1
  { col: 9.8, row: 12.9, wTiles: 3.4, hTiles: 1.1, color: '#8f4f3f', seed: 23 },

  // Estúdio 2 (Nordeste — Ocean Teal): Tapetes sob as 7 estações de trabalho
  { col: 27.5, row: 14.2, wTiles: 15.5, hTiles: 3.1, color: '#497d96', seed: 31 },
  { col: 28.2, row: 18.2, wTiles: 13.5, hTiles: 3.1, color: '#3f6f87', seed: 32 },
  // Doormat Estúdio 2
  { col: 35.8, row: 12.9, wTiles: 3.4, hTiles: 1.1, color: '#33596d', seed: 33 },

  // Estúdio 3 (Sudoeste — Sage Emerald): Tapetes sob as 7 estações de trabalho
  { col: 1.5, row: 26.2, wTiles: 15.5, hTiles: 3.1, color: '#538768', seed: 41 },
  { col: 2.2, row: 30.2, wTiles: 13.5, hTiles: 3.1, color: '#48785b', seed: 42 },
  // Doormat Estúdio 3
  { col: 9.8, row: 24.9, wTiles: 3.4, hTiles: 1.1, color: '#396149', seed: 43 },

  // Estúdio 4 (Sudeste — Royal Plum): Tapetes sob as 7 estações de trabalho
  { col: 27.5, row: 26.2, wTiles: 15.5, hTiles: 3.1, color: '#765f96', seed: 51 },
  { col: 28.2, row: 30.2, wTiles: 13.5, hTiles: 3.1, color: '#685287', seed: 52 },
  // Doormat Estúdio 4
  { col: 35.8, row: 24.9, wTiles: 3.4, hTiles: 1.1, color: '#52406b', seed: 53 },

  // Tapete de entrada sul (Portal do Parque)
  { col: 22.5, row: 33.2, wTiles: 5, hTiles: 1.6, color: '#b85248', seed: 61 },
];

const NORTH_WALL_SPANS: AioWallSpan[] = [
  // Parede Norte das 4 Salas Superiores (rows 0..1)
  {
    col: 1,
    row: 0,
    wTiles: 12,
    base: '#f5efe4',
    trim: '#d6c6b2',
    pattern: 'tiles',
    plaque: { colOffset: 4.5, title: 'COPA & CAFÉ', accent: '#c4684f' },
  },
  {
    col: 13,
    row: 0,
    wTiles: 6,
    base: '#e8f1f6',
    trim: '#c5d6e2',
    pattern: 'tiles',
    plaque: { colOffset: 1.8, title: 'LAVABO', accent: '#4b869c' },
  },
  {
    col: 19,
    row: 0,
    wTiles: 13,
    base: '#f4efe6',
    trim: '#c99b5e',
    pattern: 'marble',
    plaque: { colOffset: 4.8, title: 'RECEPÇÃO', accent: '#3d638c' },
  },
  {
    col: 32,
    row: 0,
    wTiles: 17,
    base: '#f2ece1',
    trim: '#8c6239',
    pattern: 'wood_panel',
    plaque: { colOffset: 6.5, title: 'LOUNGE & GAMES', accent: '#3b7a78' },
  },

  // Paredes Sul das Salas Superiores com Passagens para o Boulevard (row 8 — 1 tile mureta; usamos face nas divisórias dos Estúdios rows 11..12)
  // Estúdio 1 (Noroeste, rows 11..12, cols 1..22) — Porta em cols 10..12
  {
    col: 1,
    row: 11,
    wTiles: 22,
    base: '#f5ede6',
    trim: '#c9886b',
    pattern: 'wood_panel',
    doorways: [{ colOffset: 9, wTiles: 3 }],
    plaque: { colOffset: 5, title: 'ESTÚDIO SAAS & AI', accent: '#c26953' },
  },
  // Estúdio 2 (Nordeste, rows 11..12, cols 27..48) — Porta em cols 36..38 (offset 9..11)
  {
    col: 27,
    row: 11,
    wTiles: 22,
    base: '#ebf2f7',
    trim: '#7da4b8',
    pattern: 'stripes',
    doorways: [{ colOffset: 9, wTiles: 3 }],
    plaque: { colOffset: 5, title: 'ESTÚDIO OPERAÇÕES', accent: '#497d96' },
  },

  // Estúdio 3 (Sudoeste, rows 23..24, cols 1..22) — Porta em cols 10..12 (offset 9..11)
  {
    col: 1,
    row: 23,
    wTiles: 22,
    base: '#edf4ef',
    trim: '#7ca389',
    pattern: 'plain',
    doorways: [{ colOffset: 9, wTiles: 3 }],
    plaque: { colOffset: 4.8, title: 'ESTÚDIO SAÚDE & EDU', accent: '#538768' },
  },
  // Estúdio 4 (Sudeste, rows 23..24, cols 27..48) — Porta em cols 36..38 (offset 9..11)
  {
    col: 27,
    row: 23,
    wTiles: 22,
    base: '#f1edf7',
    trim: '#9581b0',
    pattern: 'stripes',
    doorways: [{ colOffset: 9, wTiles: 3 }],
    plaque: { colOffset: 4.8, title: 'ESTÚDIO FINTECH & WEB', accent: '#765f96' },
  },
];

const WALL_CAPS: AioWallCapRect[] = [
  // Outer West & East perimeter walls
  { col: 0, row: 0, wTiles: 1, hTiles: 36 },
  { col: 49, row: 0, wTiles: 1, hTiles: 36 },
  // Outer South perimeter wall with wide entrance at cols 23..26
  { col: 0, row: 35, wTiles: 23, hTiles: 1 },
  { col: 27, row: 35, wTiles: 23, hTiles: 1 },

  // Vertical dividers between North rooms (rows 0..8)
  { col: 12.75, row: 0, wTiles: 0.5, hTiles: 8.5 },
  { col: 18.75, row: 0, wTiles: 0.5, hTiles: 8.5 },
  { col: 31.75, row: 0, wTiles: 0.5, hTiles: 8.5 },

  // South wall of North rooms (row 8) with doorways into Copa (5..7), WC (15..16), Recepção (23..26), Lounge (38..40)
  { col: 1, row: 8, wTiles: 4, hTiles: 0.6 },
  { col: 8, row: 8, wTiles: 7, hTiles: 0.6 },
  { col: 17, row: 8, wTiles: 6, hTiles: 0.6 },
  { col: 27, row: 8, wTiles: 11, hTiles: 0.6 },
  { col: 41, row: 8, wTiles: 8, hTiles: 0.6 },

  // Inner corridor side walls for Estúdio 1, 2, 3, 4 (with side doorways to the Central Promenade at rows 17..18 and 29..30)
  { col: 22.5, row: 11, wTiles: 0.5, hTiles: 6 },
  { col: 22.5, row: 19, wTiles: 0.5, hTiles: 10 },
  { col: 22.5, row: 31, wTiles: 0.5, hTiles: 4 },

  { col: 26.5, row: 11, wTiles: 0.5, hTiles: 6 },
  { col: 26.5, row: 19, wTiles: 0.5, hTiles: 10 },
  { col: 26.5, row: 31, wTiles: 0.5, hTiles: 4 },
];

// ── Cached Offscreen Canvas of the Entire Building Architecture ──

let cachedArchCanvas: HTMLCanvasElement | null = null;
let cachedArchZoom = 0;
let cachedArchCols = 0;
let cachedArchRows = 0;

export function renderAiofficeArchitecture(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (typeof document === 'undefined') return;

  if (
    !cachedArchCanvas ||
    cachedArchZoom !== zoom ||
    cachedArchCols !== cols ||
    cachedArchRows !== rows
  ) {
    const w1x = cols * TILE_SIZE;
    const h1x = rows * TILE_SIZE;
    const buf = new SurfaceBuf(w1x, h1x);

    // 1. Paint all seamless floor zones
    for (const z of FLOOR_ZONES) {
      for (let ty = z.row; ty < z.row + z.hTiles; ty++) {
        for (let tx = z.col; tx < z.col + z.wTiles; tx++) {
          if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
          drawFloorTile(
            buf,
            tx * TILE_SIZE,
            ty * TILE_SIZE,
            z.kind,
            tx,
            ty,
            z.seed,
            z.tint,
          );
        }
      }
    }

    // 2. Paint all woven fringed rugs
    for (const rug of RUG_ZONES) {
      drawRug(
        buf,
        Math.round(rug.col * TILE_SIZE),
        Math.round(rug.row * TILE_SIZE),
        Math.round(rug.wTiles * TILE_SIZE),
        Math.round(rug.hTiles * TILE_SIZE),
        rug.color,
        rug.seed,
      );
    }

    // 3. Paint all 3D North Wall Faces (2 tiles tall with cap, pattern, baseboard & doorway trims)
    for (const span of NORTH_WALL_SPANS) {
      drawWallFaceSpan(buf, span);
    }

    // 4. Paint all Wall Caps & Room Dividers
    for (const cap of WALL_CAPS) {
      drawWallCap(buf, cap);
    }

    // Transfer 1x PixelBuf to a 1x canvas, then scale crisp to zoom canvas
    const c1x = document.createElement('canvas');
    c1x.width = w1x;
    c1x.height = h1x;
    const ctx1x = c1x.getContext('2d')!;
    const imgData = new ImageData(new Uint8ClampedArray(buf.data), w1x, h1x);
    ctx1x.putImageData(imgData, 0, 0);

    const cZoom = document.createElement('canvas');
    cZoom.width = Math.round(w1x * zoom);
    cZoom.height = Math.round(h1x * zoom);
    const zCtx = cZoom.getContext('2d')!;
    zCtx.imageSmoothingEnabled = false;
    zCtx.drawImage(c1x, 0, 0, cZoom.width, cZoom.height);

    // 5. Render crisp AIOffice-style Room Plaques mounted on North Walls
    for (const span of NORTH_WALL_SPANS) {
      if (!span.plaque) continue;
      const px = Math.round((span.col + span.plaque.colOffset) * TILE_SIZE * zoom);
      const py = Math.round((span.row * TILE_SIZE + 6) * zoom);
      const pw = Math.round(4.6 * TILE_SIZE * zoom);
      const ph = Math.round(11 * zoom);

      // Outer navy/brass frame
      zCtx.fillStyle = '#272b3b';
      zCtx.fillRect(px - Math.round(zoom), py - Math.round(zoom), pw + Math.round(2 * zoom), ph + Math.round(2 * zoom));
      zCtx.fillStyle = '#3a4256';
      zCtx.fillRect(px, py, pw, ph);
      // Warm parchment inner plate
      const pad = Math.max(1, Math.round(zoom));
      zCtx.fillStyle = '#f7f3e8';
      zCtx.fillRect(px + pad, py + pad, pw - pad * 2, ph - pad * 2);
      // Accent bar on left
      zCtx.fillStyle = span.plaque.accent;
      zCtx.fillRect(px + pad, py + pad, Math.max(2, Math.round(2.5 * zoom)), ph - pad * 2);

      // Room title text
      const fontSize = Math.max(8, Math.round(5.5 * zoom));
      zCtx.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      zCtx.fillStyle = '#262b3d';
      zCtx.textAlign = 'center';
      zCtx.textBaseline = 'middle';
      zCtx.fillText(span.plaque.title, px + pw / 2 + Math.round(zoom), py + ph / 2 + 0.5);
    }

    cachedArchCanvas = cZoom;
    cachedArchZoom = zoom;
    cachedArchCols = cols;
    cachedArchRows = rows;
  }

  ctx.drawImage(cachedArchCanvas, Math.round(offsetX), Math.round(offsetY));
}
