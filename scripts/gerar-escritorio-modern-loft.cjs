const fs = require('fs');
const path = require('path');

const COLS = 48;
const ROWS = 32;

// Tile types: WALL=0, FLOOR_1=1, FLOOR_2=2, FLOOR_3=3, FLOOR_4=4, FLOOR_5=5, FLOOR_6=6, FLOOR_7=7
const WALL = 0;
const FLOOR_CIRCULACAO = 2; // Slate tech escuro sofisticado na circulação e corredores
const FLOOR_BOULEVARD = 1;  // Ardósia lisa clara na passarela central
const FLOOR_DEV_WOOD = 4;   // Parquet carvalho escandinavo nas ilhas de baias
const FLOOR_REUNIAO = 3;    // Carpete executivo petróleo na sala de reuniões
const FLOOR_COPA = 6;       // Cerâmica acolhedora menta/bistrô no lounge

// Paleta HSB elegante e desaturada (sem mostarda estridente)
const COR_PAREDE = { h: 218, s: 28, b: -68, c: 10 };
const COR_CIRCULACAO = { h: 212, s: 22, b: -12, c: 10 }; // Slate tech suave
const COR_BOULEVARD = { h: 215, s: 18, b: 10, c: 6 };     // Ardósia clara
const COR_DEV_WOOD = { h: 32, s: 24, b: 4, c: 6 };        // Carvalho suave
const COR_REUNIAO = { h: 220, s: 28, b: -8, c: 8 };       // Petróleo executivo
const COR_COPA = { h: 168, s: 22, b: 6, c: 6 };           // Menta acolhedora

const tiles = new Array(COLS * ROWS).fill(FLOOR_CIRCULACAO);
const tileColors = new Array(COLS * ROWS).fill(COR_CIRCULACAO);

function setTile(col, row, type, color) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  const idx = row * COLS + col;
  tiles[idx] = type;
  tileColors[idx] = color;
}

// 1. Preenchimento de base por zonas
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (r < 7) {
      if (c < 14) {
        // Sala de Reunião & Contratos (Noroeste)
        setTile(c, r, FLOOR_REUNIAO, COR_REUNIAO);
      } else if (c > 33) {
        // Cafeteria & Lounge Barista (Nordeste)
        setTile(c, r, FLOOR_COPA, COR_COPA);
      } else {
        // Recepção Central & Diretoria
        setTile(c, r, FLOOR_BOULEVARD, COR_BOULEVARD);
      }
    } else {
      // Área de Desenvolvimento Aberto (Rows 8..31)
      if (c >= 21 && c <= 26) {
        // Boulevard Central (passarela ampla)
        setTile(c, r, FLOOR_BOULEVARD, COR_BOULEVARD);
      } else {
        // Circulação geral em slate tech
        setTile(c, r, FLOOR_CIRCULACAO, COR_CIRCULACAO);
      }
    }
  }
}

// 2. Paredes de perímetro (com Portaria Sul, Porta do Deck Leste e Passarela do Riacho Oeste)
for (let c = 0; c < COLS; c++) {
  setTile(c, 0, WALL, COR_PAREDE);
  const ehEntradaPrincipalSul = c >= 22 && c <= 25;
  if (ehEntradaPrincipalSul) {
    setTile(c, ROWS - 1, FLOOR_BOULEVARD, COR_BOULEVARD);
  } else {
    setTile(c, ROWS - 1, WALL, COR_PAREDE);
  }
}
for (let r = 0; r < ROWS; r++) {
  const ehPassarelaRiachoOeste = r >= 16 && r <= 17;
  if (ehPassarelaRiachoOeste) {
    setTile(0, r, FLOOR_CIRCULACAO, COR_CIRCULACAO);
  } else {
    setTile(0, r, WALL, COR_PAREDE);
  }

  const ehPortaDeckCafeLeste = r >= 4 && r <= 5;
  if (ehPortaDeckCafeLeste) {
    setTile(COLS - 1, r, FLOOR_COPA, COR_COPA);
  } else {
    setTile(COLS - 1, r, WALL, COR_PAREDE);
  }
}

// 3. Parede divisória superior (row 7) com portas amplas
for (let c = 1; c < COLS - 1; c++) {
  const ehPortaReuniao = c >= 7 && c <= 8;
  const ehPortaRecepcao = c >= 22 && c <= 25;
  const ehPortaCopa = c >= 39 && c <= 40;
  if (!ehPortaReuniao && !ehPortaRecepcao && !ehPortaCopa) {
    setTile(c, 7, WALL, COR_PAREDE);
  }
}

// Paredes verticais das salas superiores
for (let r = 1; r < 7; r++) {
  setTile(14, r, WALL, COR_PAREDE); // Divisória Reunião / Recepção
  setTile(33, r, WALL, COR_PAREDE); // Divisória Recepção / Copa
}

// 4. Móveis do escritório
const furniture = [];

function addFurniture(uid, type, col, row, color = null) {
  const item = { uid, type, col, row };
  if (color) item.color = color;
  furniture.push(item);
}

// --- SALA DE REUNIÕES & CONTRATOS (col 1..13, row 1..6) ---
addFurniture('conf-table-1', 'ASSET_27_A', 6, 2);
addFurniture('conf-table-2', 'ASSET_27_A', 8, 2);
addFurniture('conf-chair-1', 'ASSET_32', 5, 2);
addFurniture('conf-chair-2', 'ASSET_32', 5, 3);
addFurniture('conf-chair-3', 'ASSET_32', 5, 4);
addFurniture('conf-chair-4', 'ASSET_32', 10, 2);
addFurniture('conf-chair-5', 'ASSET_32', 10, 3);
addFurniture('conf-chair-6', 'ASSET_32', 10, 4);
addFurniture('conf-whiteboard', 'whiteboard', 6, 1);
addFurniture('conf-books-1', 'bookshelf', 2, 1);
addFurniture('conf-books-2', 'bookshelf', 3, 1);
addFurniture('conf-plant-1', 'ASSET_140', 1, 6);
addFurniture('conf-plant-2', 'ASSET_141', 13, 6);

// --- RECEPÇÃO & DIRETORIA (col 15..32, row 1..6) ---
addFurniture('recep-desk-1', 'ASSET_4', 21, 2);
addFurniture('recep-desk-2', 'ASSET_4', 24, 2);
addFurniture('recep-chair', 'ASSET_35', 23, 1);
addFurniture('recep-laptop', 'ASSET_108', 23, 2);
addFurniture('recep-plant-l', 'ASSET_142', 16, 1);
addFurniture('recep-plant-r', 'ASSET_142', 31, 1);
addFurniture('recep-sofa-l', 'ASSET_NEW_108', 16, 4);
addFurniture('recep-sofa-r', 'ASSET_NEW_109', 29, 4);
addFurniture('recep-table-mid', 'ASSET_50_0_0', 23, 4);
addFurniture('recep-mat', 'ASSET_150', 23, 5);

// --- CAFETERIA, COFFEE LAB & LOUNGE (col 34..46, row 1..6) ---
addFurniture('cafe-counter-1', 'ASSET_15', 35, 1);
addFurniture('cafe-counter-2', 'ASSET_15', 38, 1);
addFurniture('cafe-maker', 'ASSET_55', 36, 1);
addFurniture('cafe-mug-1', 'ASSET_51', 37, 1);
addFurniture('cafe-mug-2', 'ASSET_51', 39, 1);
addFurniture('cafe-water', 'ASSET_7', 41, 1);
addFurniture('cafe-vending', 'cooler', 43, 1);
addFurniture('cafe-plant-corner', 'ASSET_140', 45, 1);
addFurniture('cafe-sofa-top', 'ASSET_NEW_108', 36, 4);
addFurniture('cafe-table-lounge', 'ASSET_NEW_112', 39, 4);
addFurniture('cafe-sofa-bot', 'ASSET_NEW_109', 42, 4);
addFurniture('cafe-stool-1', 'ASSET_49', 35, 3);
addFurniture('cafe-stool-2', 'ASSET_49', 38, 3);

// --- 28 BAIAS ESPAÇADAS E PERFEITAMENTE SIMÉTRICAS ---
// Cada baia:
// - Mesa ASSET_NEW_106 (largura 3, altura 2)
//   - row é a linha de trás (background / caminhável)
//   - row + 1 é a linha do tampo da mesa (bloqueada)
// - Cadeira ASSET_35 (largura 1, altura 1) posicionada em: (col + 1, row)
// - Computador ASSET_108 (laptop on) ou ASSET_90 no tampo em: (col + 1, row + 1)
// - Ilha de piso de madeira (FLOOR_DEV_WOOD) desenhada ao redor de cada mesa

const BAIAS_CONFIG = [
  // ALA OESTE: Squad SaaS & AI Core (Baias 1 a 14)
  // Fileira 1 (row 10)
  { num: 1,  col: 4,  row: 10 },
  { num: 2,  col: 10, row: 10 },
  { num: 3,  col: 16, row: 10 },

  // Fileira 2 (row 15)
  { num: 4,  col: 4,  row: 15 },
  { num: 5,  col: 10, row: 15 },
  { num: 6,  col: 16, row: 15 },

  // Fileira 3 (row 20)
  { num: 7,  col: 4,  row: 20 },
  { num: 8,  col: 10, row: 20 },
  { num: 9,  col: 16, row: 20 },

  // Fileira 4 (row 25)
  { num: 10, col: 4,  row: 25 },
  { num: 11, col: 10, row: 25 },
  { num: 12, col: 16, row: 25 },

  // Fileira Especial / Foco Executivo (row 29)
  { num: 13, col: 6,  row: 29 },
  { num: 14, col: 14, row: 29 },

  // ALA LESTE: Squad Operações & Automação (Baias 15 a 28)
  // Fileira 1 (row 10)
  { num: 15, col: 29, row: 10 },
  { num: 16, col: 35, row: 10 },
  { num: 17, col: 41, row: 10 },

  // Fileira 2 (row 15)
  { num: 18, col: 29, row: 15 },
  { num: 19, col: 35, row: 15 },
  { num: 20, col: 41, row: 15 },

  // Fileira 3 (row 20)
  { num: 21, col: 29, row: 20 },
  { num: 22, col: 35, row: 20 },
  { num: 23, col: 41, row: 20 },

  // Fileira 4 (row 25)
  { num: 24, col: 29, row: 25 },
  { num: 25, col: 35, row: 25 },
  { num: 26, col: 41, row: 25 },

  // Fileira Especial / Foco Executivo (row 29)
  { num: 27, col: 31, row: 29 },
  { num: 28, col: 39, row: 29 },
];

for (const b of BAIAS_CONFIG) {
  // Pinta o chão da área da baia com madeira escandinava acolhedora (3x3 tiles)
  for (let r = b.row; r <= b.row + 2 && r < ROWS - 1; r++) {
    for (let c = b.col; c <= b.col + 2 && c < COLS - 1; c++) {
      setTile(c, r, FLOOR_DEV_WOOD, COR_DEV_WOOD);
    }
  }

  const deskUid = `desk-ws-${b.num}`;
  const chairUid = `chair-ws-${b.num}`;
  const pcUid = `pc-ws-${b.num}`;

  // Mesa executiva (largura 3, altura 2)
  addFurniture(deskUid, 'ASSET_NEW_106', b.col, b.row, { h: -10, s: 42, b: -48, c: 6 });

  // CADEIRA GIRATÓRIA: na linha b.row (walkable), exatamente no centro da mesa!
  // O personagem senta aqui virado para BAIXO (Direction.DOWN) de frente para o monitor!
  addFurniture(chairUid, 'ASSET_35', b.col + 1, b.row);

  // Computador com café sobre o tampo da mesa (b.row + 1)
  addFurniture(pcUid, 'ASSET_90', b.col + 1, b.row + 1);
}

// 5. Decoração paisagística elegante
const DECORACOES = [
  // Vasos altos no Boulevard Central (divisórias verdes elegantes e hall de entrada sul)
  { type: 'ASSET_140', col: 22, row: 10 },
  { type: 'ASSET_141', col: 25, row: 14 },
  { type: 'ASSET_142', col: 22, row: 19 },
  { type: 'ASSET_140', col: 25, row: 24 },
  { type: 'ASSET_142', col: 21, row: 30 },
  { type: 'ASSET_142', col: 26, row: 30 },

  // Estantes de livros embutidas nas paredes laterais
  { type: 'bookshelf', col: 1, row: 11 },
  { type: 'bookshelf', col: 1, row: 16 },
  { type: 'bookshelf', col: 1, row: 21 },
  { type: 'ASSET_140', col: 1, row: 26 },

  { type: 'bookshelf', col: 46, row: 11 },
  { type: 'bookshelf', col: 46, row: 16 },
  { type: 'bookshelf', col: 46, row: 21 },
  { type: 'ASSET_140', col: 46, row: 26 },

  // Tapetes nobres na passarela do Boulevard
  { type: 'ASSET_150', col: 23, row: 12 },
  { type: 'ASSET_150', col: 23, row: 21 },
];

DECORACOES.forEach((d, idx) => {
  addFurniture(`decor-${idx}`, d.type, d.col, d.row);
});

const layout = {
  version: 3,
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
