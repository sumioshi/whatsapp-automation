#!/usr/bin/env node
/**
 * Gera a planta arquitetônica V4 inspirada no AIOffice (50 × 36 tiles):
 * - 8 salas arquitetônicas com paredes norte 3D (2 tiles de altura), rodapés, janelas, quadros kanban,
 *   relógios, posters, pinturas emolduradas, placas de identificação e tapetes com franja:
 *   1. Copa & Café (ladrilho bistrô, máquina de espresso, geladeira inox, vending machine, pia, micro-ondas, mesas bistrô)
 *   2. Lavabo / WC (azulejo branco, cabines, pias e espelhos)
 *   3. Recepção & Hub (piso em placas de mármore, 2 elevadores sociais, balcão de recepção, bancos de espera)
 *   4. Lounge & Games (piso de madeira carvalho, mesa de Ping-Pong, 2 fliperamas Arcade, Smart TV, sofá, poltronas e puffs)
 *   5. Estúdio SaaS & AI (Baias 1–7 + recanto colaborativo)
 *   6. Estúdio Operações (Baias 8–14 + recanto colaborativo)
 *   7. Estúdio Saúde & Edu (Baias 15–21 + mesa de reunião)
 *   8. Estúdio FinTech & Web (Baias 22–28 + lounge colaborativo)
 */
const fs = require('node:fs');
const path = require('node:path');

const COLS = 50;
const ROWS = 36;

const VOID = 8;
const WALL = 0;
const MARBLE = 1;
const WOOD = 2;
const CARPET = 3;
const TILE_CHECK = 5;
const TILE_WHITE = 6;

const bundlePath = path.join(__dirname, '..', 'web', 'public', 'assets', 'office-sprites-bundle.json');
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const bgRowsByType = new Map();
for (const entry of bundle.catalog) {
  bgRowsByType.set(entry.id, entry.backgroundTiles || 0);
}

const tiles = new Array(COLS * ROWS).fill(MARBLE);
const tileColors = new Array(COLS * ROWS).fill(null);

function setTile(c, r, t, color = null) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
  tiles[r * COLS + c] = t;
  tileColors[r * COLS + c] = color;
}

function fillRect(c0, r0, w, h, t, color = null) {
  for (let r = r0; r < r0 + h; r++) {
    for (let c = c0; c < c0 + w; c++) {
      setTile(c, r, t, color);
    }
  }
}

// 1. Base piso de mármore em todo o edifício
fillRect(1, 2, 48, 33, MARBLE);
fillRect(1, 2, 12, 6, TILE_CHECK);
fillRect(13, 2, 6, 6, TILE_WHITE);
fillRect(32, 2, 17, 6, WOOD);

// 2. Paredes perimetrais externas (Oeste col 0, Leste col 49, Norte rows 0..1, Sul row 35)
fillRect(0, 0, 1, ROWS, WALL);
fillRect(COLS - 1, 0, 1, ROWS, WALL);
fillRect(0, 0, COLS, 2, WALL);
fillRect(0, ROWS - 1, 23, 1, WALL);
fillRect(27, ROWS - 1, 23, 1, WALL); // Entrada Sul aberta nas cols 23..26

// 3. Divisórias verticais e parede sul das 4 Salas Superiores (rows 0..8)
fillRect(13, 0, 1, 8, WALL);
fillRect(19, 0, 1, 8, WALL);
fillRect(32, 0, 1, 8, WALL);

// Parede sul das salas superiores (row 8) com portas para o Boulevard:
// Portas: Copa (cols 5..7), Lavabo (cols 15..16), Recepção (cols 23..26), Lounge (cols 38..40)
fillRect(1, 8, 4, 1, WALL);
fillRect(8, 8, 7, 1, WALL);
fillRect(17, 8, 6, 1, WALL);
fillRect(27, 8, 11, 1, WALL);
fillRect(41, 8, 8, 1, WALL);

// 4. Paredes Norte 3D (2 tiles de altura) dos 4 Estúdios de Projetos
// Estúdio 1 (Noroeste, rows 11..12, cols 1..22) — Porta em cols 10..12
fillRect(1, 11, 9, 2, WALL);
fillRect(13, 11, 10, 2, WALL);

// Estúdio 2 (Nordeste, rows 11..12, cols 27..48) — Porta em cols 36..38
fillRect(27, 11, 9, 2, WALL);
fillRect(39, 11, 10, 2, WALL);

// Estúdio 3 (Sudoeste, rows 23..24, cols 1..22) — Porta em cols 10..12
fillRect(1, 23, 9, 2, WALL);
fillRect(13, 23, 10, 2, WALL);

// Estúdio 4 (Sudeste, rows 23..24, cols 27..48) — Porta em cols 36..38
fillRect(27, 23, 9, 2, WALL);
fillRect(39, 23, 10, 2, WALL);

const furniture = [];
function addFloor(uid, type, col, floorRow) {
  const bg = bgRowsByType.get(type) || 0;
  furniture.push({ uid, type, col, row: floorRow - bg });
}
function addWall(uid, type, col, wallTopRow) {
  furniture.push({ uid, type, col, row: wallTopRow });
}

// ============================================================================
// SALA 1: COPA & COFFEE LAB (cols 1..12, rows 0..8)
// ============================================================================
addWall('copa-shelf', 'AIO_SHELF_WALL', 2, 0);
addWall('copa-poster', 'AIO_POSTER_COFFEE', 9, 0);
addWall('copa-clock', 'AIO_CLOCK', 11, 0);

addFloor('copa-fridge', 'AIO_FRIDGE', 1, 2);
addFloor('copa-cnt-1', 'AIO_COUNTER_DRAWERS', 2, 2);
addFloor('copa-coffee', 'AIO_COFFEE_MACHINE', 3, 2);
addFloor('copa-sink', 'AIO_COUNTER_SINK', 4, 2);
addFloor('copa-micro', 'AIO_MICROWAVE', 5, 2);
addFloor('copa-cnt-2', 'AIO_COUNTER_PLAIN', 6, 2);
addFloor('copa-vending', 'AIO_VENDING', 8, 2);
addFloor('copa-cooler', 'AIO_WATER_COOLER', 10, 2);
addFloor('copa-plant-1', 'AIO_PLANT_MONSTERA', 11, 2);

// Mesas de bistrô na Copa
addFloor('copa-tbl-1', 'AIO_CAFE_TABLE', 3, 5);
addFloor('copa-ch-1a', 'AIO_CAFE_CHAIR_RIGHT', 2, 5);
addFloor('copa-ch-1b', 'AIO_CAFE_CHAIR_LEFT', 4, 5);

addFloor('copa-tbl-2', 'AIO_CAFE_TABLE', 9, 5);
addFloor('copa-ch-2a', 'AIO_CAFE_CHAIR_RIGHT', 8, 5);
addFloor('copa-ch-2b', 'AIO_CAFE_CHAIR_LEFT', 10, 5);
addFloor('copa-plant-2', 'AIO_PLANT_FERN', 1, 7);

// ============================================================================
// SALA 2: LAVABO / WC (cols 13..18, rows 0..8)
// ============================================================================
addWall('wc-mirror-1', 'AIO_MIRROR', 14, 0);
addWall('wc-mirror-2', 'AIO_MIRROR', 17, 0);
addFloor('wc-sink-1', 'AIO_BATH_SINK', 14, 2);
addFloor('wc-sink-2', 'AIO_BATH_SINK', 17, 2);
addFloor('wc-stall-1', 'AIO_TOILET_STALL', 14, 5);
addFloor('wc-plant', 'AIO_PLANT_SUCCULENT', 18, 7);

// ============================================================================
// SALA 3: RECEPÇÃO & HUB (cols 19..31, rows 0..8)
// ============================================================================
addWall('rec-elev-1', 'AIO_ELEVATOR', 20, 0);
addWall('rec-painting', 'AIO_PAINTING_0', 27, 0);
addWall('rec-elev-2', 'AIO_ELEVATOR', 29, 0);

addFloor('rec-palm-1', 'AIO_PLANT_PALM', 20, 2);
addFloor('rec-desk', 'AIO_RECEPTION_DESK', 24, 4);
addFloor('chair-reception-npc', 'AIO_CHAIR_FRONT_BLACK', 25, 3);
addFloor('rec-bench-1', 'AIO_BENCH', 20, 6);
addFloor('rec-bench-2', 'AIO_BENCH', 29, 6);
addFloor('rec-palm-2', 'AIO_PLANT_FICUS', 31, 2);

// ============================================================================
// SALA 4: LOUNGE, DESCOMPRESSÃO & GAMES (cols 32..48, rows 0..8)
// ============================================================================
addWall('lng-tv', 'AIO_TV', 35, 0);
addWall('lng-win-1', 'AIO_WINDOW', 42, 0);
addWall('lng-poster-1', 'AIO_POSTER_ROCKET', 45, 0);
addWall('lng-poster-2', 'AIO_POSTER_CAT', 47, 0);

// Nook do Sofá & TV
addFloor('lng-bonsai', 'AIO_PLANT_BONSAI', 33, 2);
addFloor('lng-sofa', 'AIO_SOFA_DOWN', 34, 3);
addFloor('lng-ctbl', 'AIO_COFFEE_TABLE', 34, 5);
addFloor('lng-arm-l', 'AIO_ARMCHAIR_RIGHT', 33, 5);
addFloor('lng-arm-r', 'AIO_ARMCHAIR_LEFT', 37, 5);
addFloor('lng-bean-1', 'AIO_BEANBAG_YELLOW', 35, 7);
addFloor('lng-lamp', 'AIO_FLOOR_LAMP', 38, 2);

// Arena de Ping-Pong & Fliperamas Arcade
addFloor('lng-pingpong', 'AIO_PINGPONG', 42, 4);
addFloor('lng-arcade-1', 'AIO_ARCADE', 46, 2);
addFloor('lng-arcade-2', 'AIO_ARCADE', 47, 2);
addFloor('lng-bean-2', 'AIO_BEANBAG_RED', 46, 6);
addFloor('lng-bean-3', 'AIO_BEANBAG_BLUE', 47, 7);
addFloor('lng-plant', 'AIO_PLANT_MONSTERA', 48, 2);

// ============================================================================
// BOULEVARD CENTRAL & PROMENADE (rows 9..10 & cols 23..26)
// ============================================================================
addFloor('blv-plant-1', 'AIO_PLANT_FICUS', 12, 9);
addFloor('blv-plant-2', 'AIO_PLANT_MONSTERA', 18, 9);
addFloor('blv-plant-3', 'AIO_PLANT_MONSTERA', 31, 9);
addFloor('blv-plant-4', 'AIO_PLANT_PALM', 48, 9);
addFloor('prom-plant-1', 'AIO_PLANT_FLOWER', 23, 16);
addFloor('prom-plant-2', 'AIO_PLANT_FLOWER', 26, 16);
addFloor('prom-plant-3', 'AIO_PLANT_FERN', 23, 28);
addFloor('prom-plant-4', 'AIO_PLANT_FERN', 26, 28);

// ============================================================================
// 4 ESTÚDIOS DE PROJETOS — 28 ESTAÇÕES DE TRABALHO (chair-ws-1 .. chair-ws-28)
// ============================================================================
let wsIndex = 1;

function addWorkstation(col, deskFloorRow, deskType, chairType) {
  const idx = wsIndex++;
  addFloor(`desk-ws-${idx}`, deskType, col, deskFloorRow);
  addFloor(`chair-ws-${idx}`, chairType, col, deskFloorRow + 1);
}

// --- ESTÚDIO 1 (Noroeste, cols 1..22, rows 11..22): SaaS & AI Core (Baias 1–7) ---
addWall('est1-wb', 'AIO_WHITEBOARD', 2, 11);
addWall('est1-win-1', 'AIO_WINDOW', 14, 11);
addWall('est1-paint', 'AIO_PAINTING_0', 17, 11);
addWall('est1-poster', 'AIO_POSTER_CODE', 20, 11);
addWall('est1-clock', 'AIO_CLOCK', 21, 11);

addFloor('est1-shelf', 'AIO_BOOKSHELF_0', 1, 13);
addFloor('est1-plant-n', 'AIO_PLANT_MONSTERA', 21, 13);

const est1Desks = ['AIO_DESK_WOOD_0', 'AIO_DESK_WOOD_1', 'AIO_DESK_WOOD_2', 'AIO_DESK_WOOD_0'];
[2, 6, 10, 14].forEach((c, i) => {
  addWorkstation(c, 15, est1Desks[i], 'AIO_CHAIR_BACK_BLACK');
});
[3, 8, 13].forEach((c, i) => {
  addWorkstation(c, 19, est1Desks[i], 'AIO_CHAIR_BACK_BLUE');
});

// Recanto colaborativo Estúdio 1 (cols 18..21)
addFloor('est1-printer', 'AIO_PRINTER', 21, 15);
addFloor('est1-binder', 'AIO_BINDER_SHELF', 21, 17);
addFloor('est1-bean-1', 'AIO_BEANBAG_RED', 19, 19);
addFloor('est1-bean-2', 'AIO_BEANBAG_YELLOW', 20, 20);
addFloor('est1-lamp', 'AIO_FLOOR_LAMP', 21, 21);

// --- ESTÚDIO 2 (Nordeste, cols 27..48, rows 11..22): Operações & Automação (Baias 8–14) ---
addWall('est2-wb', 'AIO_WHITEBOARD', 28, 11);
addWall('est2-win-1', 'AIO_WINDOW', 40, 11);
addWall('est2-paint', 'AIO_PAINTING_1', 43, 11);
addWall('est2-poster', 'AIO_POSTER_SHIP', 46, 11);
addWall('est2-clock', 'AIO_CLOCK', 47, 11);

addFloor('est2-shelf', 'AIO_BOOKSHELF_1', 27, 13);
addFloor('est2-plant-n', 'AIO_PLANT_PALM', 47, 13);

const est2Desks = ['AIO_DESK_WHITE_0', 'AIO_DESK_WHITE_1', 'AIO_DESK_WHITE_0', 'AIO_DESK_WHITE_1'];
[28, 32, 36, 40].forEach((c, i) => {
  addWorkstation(c, 15, est2Desks[i], 'AIO_CHAIR_BACK_BLUE');
});
[29, 34, 39].forEach((c, i) => {
  addWorkstation(c, 19, est2Desks[i], 'AIO_CHAIR_BACK_BLACK');
});

// Recanto colaborativo Estúdio 2 (cols 44..47)
addFloor('est2-filing', 'AIO_FILING_CABINET', 47, 15);
addFloor('est2-ctbl', 'AIO_CAFE_TABLE', 45, 19);
addFloor('est2-stool-1', 'AIO_STOOL', 44, 19);
addFloor('est2-stool-2', 'AIO_STOOL', 46, 19);
addFloor('est2-lamp', 'AIO_FLOOR_LAMP', 47, 21);

// --- ESTÚDIO 3 (Sudoeste, cols 1..22, rows 23..34): Saúde, Clínicas & Educação (Baias 15–21) ---
addWall('est3-wb', 'AIO_WHITEBOARD', 2, 23);
addWall('est3-win-1', 'AIO_WINDOW', 14, 23);
addWall('est3-paint', 'AIO_PAINTING_0', 17, 23);
addWall('est3-poster', 'AIO_POSTER_CAT', 20, 23);
addWall('est3-clock', 'AIO_CLOCK', 21, 23);

addFloor('est3-shelf', 'AIO_BOOKSHELF_0', 1, 25);
addFloor('est3-plant-n', 'AIO_PLANT_FICUS', 21, 25);

[2, 6, 10, 14].forEach((c, i) => {
  addWorkstation(c, 27, est1Desks[i], 'AIO_CHAIR_BACK_GREEN');
});
[3, 8, 13].forEach((c, i) => {
  addWorkstation(c, 31, est1Desks[i], 'AIO_CHAIR_BACK_BLACK');
});

// Recanto de Reunião Estúdio 3 (cols 18..21)
addFloor('est3-mtbl', 'AIO_MEETING_TABLE', 18, 29);
addFloor('est3-stool-1', 'AIO_STOOL', 18, 28);
addFloor('est3-stool-2', 'AIO_STOOL', 20, 28);
addFloor('est3-lamp', 'AIO_FLOOR_LAMP', 21, 33);

// --- ESTÚDIO 4 (Sudeste, cols 27..48, rows 23..34): FinTech, iGaming & Web (Baias 22–28) ---
addWall('est4-wb', 'AIO_WHITEBOARD', 28, 23);
addWall('est4-win-1', 'AIO_WINDOW', 40, 23);
addWall('est4-paint', 'AIO_PAINTING_1', 43, 23);
addWall('est4-poster', 'AIO_POSTER_ROCKET', 46, 23);
addWall('est4-clock', 'AIO_CLOCK', 47, 23);

addFloor('est4-shelf', 'AIO_BOOKSHELF_1', 27, 25);
addFloor('est4-plant-n', 'AIO_PLANT_BONSAI', 47, 25);

const est4Desks = ['AIO_DESK_DARK_0', 'AIO_DESK_WOOD_1', 'AIO_DESK_DARK_0', 'AIO_DESK_WOOD_2'];
[28, 32, 36, 40].forEach((c, i) => {
  addWorkstation(c, 27, est4Desks[i], 'AIO_CHAIR_BACK_RED');
});
[29, 34, 39].forEach((c, i) => {
  addWorkstation(c, 31, est4Desks[i], 'AIO_CHAIR_BACK_BLACK');
});

// Recanto Lounge Estúdio 4 (cols 44..47)
addFloor('est4-ctbl', 'AIO_COFFEE_TABLE', 45, 29);
addFloor('est4-arm', 'AIO_ARMCHAIR_LEFT', 47, 29);
addFloor('est4-bean-1', 'AIO_BEANBAG_GREEN', 44, 31);
addFloor('est4-bean-2', 'AIO_BEANBAG_BLUE', 46, 31);
addFloor('est4-lamp', 'AIO_FLOOR_LAMP', 47, 33);

const layout = {
  version: 4,
  cols: COLS,
  rows: ROWS,
  tiles,
  tileColors,
  furniture,
};

const targets = [
  path.join(__dirname, '..', 'web', 'public', 'assets', 'default-layout.json'),
  path.join(__dirname, '..', '.escritorio-layout.json'),
  path.join(__dirname, '..', 'web', '.escritorio-layout.json'),
];

for (const t of targets) {
  try {
    fs.writeFileSync(t, JSON.stringify(layout, null, 2));
    console.log('Saved V4 layout to', t);
  } catch {
    // ignore
  }
}
console.log(`Total workstations generated: ${wsIndex - 1}`);
