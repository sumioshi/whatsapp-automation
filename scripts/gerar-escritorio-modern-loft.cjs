const fs = require('fs');
const path = require('path');

const COLS = 48;
const ROWS = 32;

// Tile types: WALL=0, FLOOR_1=1, FLOOR_2=2, FLOOR_3=3, FLOOR_4=4, FLOOR_5=5, FLOOR_6=6, FLOOR_7=7
const WALL = 0;
const FLOOR_CIRCULACAO = 1; // Ardósia escura nas circulações
const FLOOR_DEV_OAK = 2;    // Carvalho nobre quente nas baias de dev
const FLOOR_REUNIAO = 3;    // Carpete executivo creme na sala de reuniões
const FLOOR_COPA = 6;       // Cerâmica acolhedora na copa/lounge

// Cores HSB para cada tipo de piso
const COR_PAREDE = { h: 220, s: 25, b: -75, c: 10 };
const COR_CIRCULACAO = { h: 220, s: 18, b: -58, c: 8 };
const COR_DEV_OAK = { h: 32, s: 42, b: -18, c: 6 };
const COR_REUNIAO = { h: 42, s: 35, b: -15, c: 8 };
const COR_COPA = { h: 18, s: 38, b: -22, c: 8 };

const tiles = new Array(COLS * ROWS).fill(FLOOR_CIRCULACAO);
const tileColors = new Array(COLS * ROWS).fill(COR_CIRCULACAO);

function setTile(col, row, type, color) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const idx = row * COLS + col;
  tiles[idx] = type;
  tileColors[idx] = color;
}

// 1. Preenche pisos base por setor
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (r < 7) {
      if (c < 14) {
        // Sala de Reunião & Contratos
        setTile(c, r, FLOOR_REUNIAO, COR_REUNIAO);
      } else if (c > 33) {
        // Cafeteria / Lounge Barista
        setTile(c, r, FLOOR_COPA, COR_COPA);
      } else {
        // Recepção Central
        setTile(c, r, FLOOR_CIRCULACAO, COR_CIRCULACAO);
      }
    } else {
      // Área de Desenvolvimento Aberto
      if ((c >= 2 && c <= 21) || (c >= 26 && c <= 45)) {
        setTile(c, r, FLOOR_DEV_OAK, COR_DEV_OAK);
      } else {
        // Boulevard Central e corredores
        setTile(c, r, FLOOR_CIRCULACAO, COR_CIRCULACAO);
      }
    }
  }
}

// 2. Paredes de perímetro
for (let c = 0; c < COLS; c++) {
  setTile(c, 0, WALL, COR_PAREDE);
  setTile(c, ROWS - 1, WALL, COR_PAREDE);
}
for (let r = 0; r < ROWS; r++) {
  setTile(0, r, WALL, COR_PAREDE);
  setTile(COLS - 1, r, WALL, COR_PAREDE);
}

// 3. Parede divisória superior (row 7) com portas/vãos amplos
for (let c = 1; c < COLS - 1; c++) {
  // Aberturas nas portas:
  // Porta Reunião: col 7..8
  // Porta Recepção: col 22..25
  // Porta Copa: col 38..39
  const ehPortaReuniao = c >= 7 && c <= 8;
  const ehPortaRecepcao = c >= 22 && c <= 25;
  const ehPortaCopa = c >= 38 && c <= 39;
  if (!ehPortaReuniao && !ehPortaRecepcao && !ehPortaCopa) {
    setTile(c, 7, WALL, COR_PAREDE);
  }
}

// Paredes divisórias verticais das salas superiores
for (let r = 1; r < 7; r++) {
  setTile(14, r, WALL, COR_PAREDE); // Divisória Reunião / Recepção
  setTile(33, r, WALL, COR_PAREDE); // Divisória Recepção / Copa
}

// 4. Móveis
const furniture = [];

function addFurniture(uid, type, col, row, color = null) {
  const item = { uid, type, col, row };
  if (color) item.color = color;
  furniture.push(item);
}

// --- SALA DE REUNIÕES & CONTRATOS (col 1..13, row 1..6) ---
// Mesa de conferência central grande (2x4)
addFurniture('conf-table-1', 'ASSET_27_A', 6, 2);
addFurniture('conf-table-2', 'ASSET_27_A', 8, 2);
// Cadeiras de conferência ao redor da mesa
addFurniture('conf-chair-1', 'ASSET_32', 5, 2);
addFurniture('conf-chair-2', 'ASSET_32', 5, 3);
addFurniture('conf-chair-3', 'ASSET_32', 5, 4);
addFurniture('conf-chair-4', 'ASSET_32', 10, 2);
addFurniture('conf-chair-5', 'ASSET_32', 10, 3);
addFurniture('conf-chair-6', 'ASSET_32', 10, 4);
// Lousa de vidro / Whiteboard
addFurniture('conf-whiteboard', 'whiteboard', 6, 1);
// Estante de livros executiva
addFurniture('conf-books-1', 'bookshelf', 2, 1);
addFurniture('conf-books-2', 'bookshelf', 3, 1);
addFurniture('conf-plant-1', 'ASSET_140', 1, 6);
addFurniture('conf-plant-2', 'ASSET_141', 13, 6);

// --- RECEPÇÃO & DIRETORIA (col 15..32, row 1..6) ---
// Balcão de atendimento da recepção
addFurniture('recep-desk-1', 'ASSET_4', 21, 2);
addFurniture('recep-desk-2', 'ASSET_4', 24, 2);
addFurniture('recep-chair', 'ASSET_35', 23, 1);
addFurniture('recep-laptop', 'ASSET_108', 23, 2);
addFurniture('recep-plant-l', 'ASSET_142', 16, 1);
addFurniture('recep-plant-r', 'ASSET_142', 31, 1);
// Sofá de espera no lobby
addFurniture('recep-sofa-l', 'ASSET_NEW_108', 16, 4);
addFurniture('recep-sofa-r', 'ASSET_NEW_109', 29, 4);
addFurniture('recep-table-mid', 'ASSET_50_0_0', 23, 4);
addFurniture('recep-mat', 'ASSET_150', 23, 5);

// --- CAFETERIA, COFFEE LAB & LOUNGE BARISTA (col 34..46, row 1..6) ---
// Balcão de café
addFurniture('cafe-counter-1', 'ASSET_15', 35, 1);
addFurniture('cafe-counter-2', 'ASSET_15', 38, 1);
addFurniture('cafe-maker', 'ASSET_55', 36, 1);
addFurniture('cafe-mug-1', 'ASSET_51', 37, 1);
addFurniture('cafe-mug-2', 'ASSET_51', 39, 1);
addFurniture('cafe-water', 'ASSET_7', 41, 1);
addFurniture('cafe-vending', 'cooler', 43, 1);
addFurniture('cafe-plant-corner', 'ASSET_140', 45, 1);
// Sofás aconchegantes em L para o descanso
addFurniture('cafe-sofa-top', 'ASSET_NEW_108', 36, 4);
addFurniture('cafe-table-lounge', 'ASSET_NEW_112', 39, 4);
addFurniture('cafe-sofa-bot', 'ASSET_NEW_109', 42, 4);
addFurniture('cafe-rug', 'ASSET_148', 39, 5);
addFurniture('cafe-stool-1', 'ASSET_49', 35, 3);
addFurniture('cafe-stool-2', 'ASSET_49', 38, 3);

// --- ESTÚDIOS DE DESENVOLVIMENTO: 28 BAIAS ESPAÇADAS ---
// Configuração das baias com respiro amplo (4 a 5 tiles)
// Cada baia tem:
// - Mesa de madeira executiva (ASSET_NEW_106, 3x2)
// - Cadeira giratória (ASSET_35, 1x1) com ID rigoroso chair-ws-N
// - Monitor com café (ASSET_90 ou ASSET_108)

const BAIAS_CONFIG = [
  // ALA OESTE: Squad SaaS & AI Core (Baias 1 a 14)
  // Pod 1 (Noroeste)
  { num: 1,  col: 3,  row: 10 },
  { num: 2,  col: 11, row: 10 },
  { num: 3,  col: 3,  row: 15 },
  { num: 4,  col: 11, row: 15 },

  // Pod 2 (Sudoeste Alto)
  { num: 5,  col: 3,  row: 20 },
  { num: 6,  col: 11, row: 20 },
  { num: 7,  col: 3,  row: 25 },
  { num: 8,  col: 11, row: 25 },

  // Pod 3 (Oeste Centro-Corredor)
  { num: 9,  col: 17, row: 10 },
  { num: 10, col: 17, row: 15 },
  { num: 11, col: 17, row: 20 },
  { num: 12, col: 17, row: 25 },
  { num: 13, col: 7,  row: 28 },
  { num: 14, col: 14, row: 28 },

  // ALA LESTE: Squad Operações & Automação (Baias 15 a 28)
  // Pod 4 (Leste Centro-Corredor)
  { num: 15, col: 28, row: 10 },
  { num: 16, col: 28, row: 15 },
  { num: 17, col: 28, row: 20 },
  { num: 18, col: 28, row: 25 },

  // Pod 5 (Nordeste)
  { num: 19, col: 35, row: 10 },
  { num: 20, col: 42, row: 10 },
  { num: 21, col: 35, row: 15 },
  { num: 22, col: 42, row: 15 },

  // Pod 6 (Sudeste)
  { num: 23, col: 35, row: 20 },
  { num: 24, col: 42, row: 20 },
  { num: 25, col: 35, row: 25 },
  { num: 26, col: 42, row: 25 },
  { num: 27, col: 31, row: 28 },
  { num: 28, col: 39, row: 28 },
];

for (const b of BAIAS_CONFIG) {
  const deskUid = `desk-ws-${b.num}`;
  const chairUid = `chair-ws-${b.num}`;
  const pcUid = `pc-ws-${b.num}`;

  // Mesa executiva de madeira (largura 3, altura 2)
  addFurniture(deskUid, 'ASSET_NEW_106', b.col, b.row, { h: -10, s: 42, b: -48, c: 6 });

  // Cadeira no centro da mesa, 1 tile abaixo da borda da mesa (face UP para o computador)
  addFurniture(chairUid, 'ASSET_35', b.col + 1, b.row + 1);

  // Monitor e xícara de café sobre a mesa
  addFurniture(pcUid, 'ASSET_90', b.col + 1, b.row);
}

// 5. Decoração paisagística entre os pods para criar sensação de estúdio moderno
const DECORACOES = [
  // Divisórias verdes no corredor central (Boulevard)
  { type: 'ASSET_140', col: 23, row: 10 },
  { type: 'ASSET_141', col: 24, row: 14 },
  { type: 'ASSET_142', col: 23, row: 19 },
  { type: 'ASSET_140', col: 24, row: 24 },
  { type: 'ASSET_141', col: 23, row: 29 },

  // Estantes e plantas nas extremidades
  { type: 'bookshelf', col: 1, row: 12 },
  { type: 'bookshelf', col: 1, row: 17 },
  { type: 'bookshelf', col: 1, row: 22 },
  { type: 'ASSET_140', col: 1, row: 27 },

  { type: 'bookshelf', col: 46, row: 12 },
  { type: 'bookshelf', col: 46, row: 17 },
  { type: 'bookshelf', col: 46, row: 22 },
  { type: 'ASSET_140', col: 46, row: 27 },

  // Tapetes decorativos nos pods
  { type: 'ASSET_145', col: 6, row: 13 },
  { type: 'ASSET_145', col: 6, row: 23 },
  { type: 'ASSET_145', col: 38, row: 13 },
  { type: 'ASSET_145', col: 38, row: 23 },
];

DECORACOES.forEach((d, idx) => {
  addFurniture(`decor-${idx}`, d.type, d.col, d.row);
});

const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  tiles,
  tileColors,
  furniture,
};

const targetPath = path.resolve(__dirname, '../web/public/assets/default-layout.json');
fs.writeFileSync(targetPath, JSON.stringify(layout, null, 2), 'utf8');
console.log(`Layout 48x32 salvo com sucesso em: ${targetPath}`);
console.log(`Total de móveis: ${furniture.length}`);
console.log(`Baias criadas: ${BAIAS_CONFIG.length}`);
