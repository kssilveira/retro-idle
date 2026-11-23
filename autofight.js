export const NEUTRAL_BUTTONS = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  a: false,
  b: false,
  start: false,
  select: false,
});

// Non-damaging, flee, self-KO, or conditional-fail Gen 1, Gen 2, & Gen 3 move IDs.
export const NON_ATTACK_MOVES = new Set([
  14, 18, 28, 39, 43, 45, 46, 47, 48, 50, 54, 73, 74, 77, 78, 79, 81, 86, 92,
  95, 96, 97, 100, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113,
  114, 115, 116, 118, 119, 120, 133, 134, 135, 137, 138, 139, 142, 144, 147,
  148, 150, 151, 153, 156, 159, 160, 164,
  166, 169, 170, 171, 173, 174, 176, 178, 180, 182, 184, 186, 187, 191, 193,
  194, 195, 197, 199, 201, 203, 204, 206, 207, 208, 212, 213, 214, 215, 219,
  220, 226, 227, 230, 234, 235, 236, 240, 241, 243, 244,
  252, 254, 255, 256, 258, 259, 260, 261, 262, 264, 266, 267, 268, 269, 270,
  271, 272, 273, 274, 275, 277, 278, 281, 283, 285, 286, 287, 288, 289, 293,
  294, 297, 298, 300, 303, 312, 313, 316, 319, 320, 321, 322, 334, 335, 336,
  339, 346, 347, 349,
]);

const LEARN_PROMPT_RE = /\blearn|trying to|Delete an?|forgotten/;
const DIRS = ['right', 'left', 'up', 'down'];
const TILE_CURSOR = 0xed;
const MOVE_FIRST_ROW = 13;

export const POKEMON_RED_BLUE_MEM = Object.freeze({
  facing: 0xc109,
  tileMap: 0xc3a0,
  battleMon: 0xd014,
  isInBattle: 0xd057,
  partyCount: 0xd163,
  partyMon1: 0xd16b,
  curMap: 0xd35e,
  yCoord: 0xd361,
  xCoord: 0xd362,
  curMapTileset: 0xd367,
  curMapHeight: 0xd368,
  curMapWidth: 0xd369,
});

export const POKEMON_YELLOW_MEM = Object.freeze({
  facing: 0xc109,
  tileMap: 0xc3a0,
  battleMon: 0xd013,
  isInBattle: 0xd056,
  partyCount: 0xd162,
  partyMon1: 0xd16a,
  curMap: 0xd35d,
  yCoord: 0xd360,
  xCoord: 0xd361,
  curMapTileset: 0xd366,
  curMapHeight: 0xd367,
  curMapWidth: 0xd368,
});

export const POKEMON_CRYSTAL_MEM = Object.freeze({
  tileMap: 0xc4a0,          // WRAM0: 20x18 tilemap
  battleMon: 0xc62c,        // WRAM0: battle_struct (0x20 bytes)
  curMapTileset: 0xd199,    // WRAM1: wMapTileset (TILESET_POKECENTER = 7)
  curMapHeight: 0xd19e,     // WRAM1: wMapHeight (in blocks; *2 = tiles)
  curMapWidth: 0xd19f,      // WRAM1: wMapWidth (in blocks; *2 = tiles)
  battleMode: 0xd22d,       // WRAM1: wBattleMode (0=overworld, 1=wild, 2=trainer)
  playerDirection: 0xd4de,  // WRAM1: wPlayerStruct + 0x08 (0=down, 4=up, 8=left, 12=right)
  mapGroup: 0xdcb5,         // WRAM1: wMapGroup (1..26)
  mapNumber: 0xdcb6,        // WRAM1: wMapNumber
  yCoord: 0xdcb7,           // WRAM1: wYCoord
  xCoord: 0xdcb8,           // WRAM1: wXCoord
  partyCount: 0xdcd7,       // WRAM1: wPartyCount (0..6)
  partySpecies: 0xdcd8,     // WRAM1: wPartySpecies (6 bytes; 0xFD = EGG)
  partyMon1: 0xdcdf,        // WRAM1: wPartyMon1 (party_struct, stride 0x30)
});

export const POKEMON_EMERALD_MEM = Object.freeze({
  gMain: 0x030022c0,
  gSaveBlock1Ptr: 0x03005d8c,
  gSaveBlock2Ptr: 0x03005d90,
  gMapHeader: 0x02037318,
  gObjectEvents: 0x02037350,
  gPlayerAvatar: 0x02037590,
  gPlayerPartyCount: 0x020244e9,
  gPlayerParty: 0x020244ec,
  gBattleTypeFlags: 0x02022fec,
  gBattleOutcome: 0x0202433a,
  gBattleMons: 0x02024084,
  gBattlerControllerFuncs: 0x03005d60,
  gActionSelectionCursor: 0x020244ac,
  gMoveSelectionCursor: 0x020244b0,
  gBattlescriptCurrInstr: 0x02024214,
  gDisplayedStringBattle: 0x02022e2c,
  gStringVar4: 0x02021fc4,
  handleInputChooseAction: 0x08057588,
  handleInputChooseMove: 0x08057bfc,
  cb2WhiteOut: 0x08085f58,
  cb2InitLearnMove: 0x081606a0,
  cb2EvolutionSceneStart: 0x0813d9b0,
  cb2EvolutionSceneLoad: 0x0813dd7c,
  cb2EvolutionSceneUpdate: 0x0813e3a4,
  battleScriptAskToLearnMoveStart: 0x082dabe3,
  battleScriptAskToLearnMoveEnd: 0x082dac2b,
});

const CRYSTAL_EGG_SPECIES = 0xfd;

const EMERALD_NON_AUTO_BATTLE_MASK =
  (1 << 0) | // BATTLE_TYPE_DOUBLE
  (1 << 1) | // BATTLE_TYPE_LINK
  (1 << 3) | // BATTLE_TYPE_TRAINER
  (1 << 7) | // BATTLE_TYPE_SAFARI
  (1 << 9);  // BATTLE_TYPE_WALLY_TUTORIAL

const EMERALD_DIR_TO_FACING = Object.freeze({
  1: 0x00, // DIR_SOUTH
  2: 0x04, // DIR_NORTH
  3: 0x08, // DIR_WEST
  4: 0x0c, // DIR_EAST
});

const EMERALD_SUBSTRUCT_SLOTS = Object.freeze([
  [0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 3, 1, 2], [0, 2, 3, 1], [0, 3, 2, 1],
  [1, 0, 2, 3], [1, 0, 3, 2], [2, 0, 1, 3], [3, 0, 1, 2], [2, 0, 3, 1], [3, 0, 2, 1],
  [1, 2, 0, 3], [1, 3, 0, 2], [2, 1, 0, 3], [3, 1, 0, 2], [2, 3, 0, 1], [3, 2, 0, 1],
  [1, 2, 3, 0], [1, 3, 2, 0], [2, 1, 3, 0], [3, 1, 2, 0], [2, 3, 1, 0], [3, 2, 1, 0],
]);

const EMERALD_EXT_CTRL_ARG_LEN = Object.freeze([
  0, 1, 1, 1, 3, 1, 1, 0, 1, 0, 0, 2, 1, 1, 1, 0, 2, 1, 1, 1, 1, 0, 0, 0, 0,
]);

const STANDARD_POKECENTER_CONFIG = Object.freeze({
  standX: 3,
  standY: 3,
  exitX: 3,
  exitY: 7,
  tileset: 6,
});

function makeStandardPokeCenter(name) {
  return Object.freeze({ ...STANDARD_POKECENTER_CONFIG, name });
}

export const POKECENTER_CONFIGS = Object.freeze({
  0x29: makeStandardPokeCenter('Viridian Heal Center'),
  0x3a: makeStandardPokeCenter('Pewter Heal Center'),
  0x40: makeStandardPokeCenter('Cerulean Heal Center'),
  0x44: makeStandardPokeCenter('Mt. Moon Heal Center'),
  0x51: makeStandardPokeCenter('Rock Tunnel Heal Center'),
  0x59: makeStandardPokeCenter('Vermilion Heal Center'),
  0x85: makeStandardPokeCenter('Celadon Heal Center'),
  0x8d: makeStandardPokeCenter('Lavender Heal Center'),
  0x9a: makeStandardPokeCenter('Fuchsia Heal Center'),
  0xab: makeStandardPokeCenter('Cinnabar Heal Center'),
  0xae: Object.freeze({
    standX: 7,
    standY: 7,
    exitX: 7,
    exitY: 11,
    tileset: 2,
    name: 'Indigo Plateau Lobby',
  }),
  0xb6: makeStandardPokeCenter('Saffron Heal Center'),
});

export function encodeCrystalMapId(mapGroup, mapNumber) {
  return ((mapGroup & 0xff) << 8) | (mapNumber & 0xff);
}

const CRYSTAL_STANDARD_POKECENTER_CONFIG = Object.freeze({
  standX: 3,
  standY: 3,
  exitX: 3,
  exitY: 7,
  tileset: 7,
});

function makeCrystalStandardPokeCenter(name) {
  return Object.freeze({ ...CRYSTAL_STANDARD_POKECENTER_CONFIG, name });
}

export const CRYSTAL_POKECENTER_CONFIGS = Object.freeze({
  [encodeCrystalMapId(1, 1)]: makeCrystalStandardPokeCenter('Olivine Heal Center'),
  [encodeCrystalMapId(2, 3)]: makeCrystalStandardPokeCenter('Mahogany Heal Center'),
  [encodeCrystalMapId(4, 3)]: makeCrystalStandardPokeCenter('Ecruteak Heal Center'),
  [encodeCrystalMapId(5, 6)]: makeCrystalStandardPokeCenter('Blackthorn Heal Center'),
  [encodeCrystalMapId(6, 1)]: makeCrystalStandardPokeCenter('Cinnabar Heal Center'),
  [encodeCrystalMapId(7, 4)]: makeCrystalStandardPokeCenter('Cerulean Heal Center'),
  [encodeCrystalMapId(7, 8)]: makeCrystalStandardPokeCenter('Route 10 Heal Center'),
  [encodeCrystalMapId(8, 1)]: makeCrystalStandardPokeCenter('Azalea Heal Center'),
  [encodeCrystalMapId(10, 10)]: makeCrystalStandardPokeCenter('Violet Heal Center'),
  [encodeCrystalMapId(10, 13)]: makeCrystalStandardPokeCenter('Route 32 Heal Center'),
  [encodeCrystalMapId(11, 20)]: makeCrystalStandardPokeCenter('Goldenrod Heal Center'),
  [encodeCrystalMapId(12, 5)]: makeCrystalStandardPokeCenter('Vermilion Heal Center'),
  [encodeCrystalMapId(14, 6)]: makeCrystalStandardPokeCenter('Pewter Heal Center'),
  [encodeCrystalMapId(16, 2)]: Object.freeze({
    standX: 3,
    standY: 9,
    exitX: 5,
    exitY: 13,
    tileset: 7,
    name: 'Indigo Plateau Heal Center',
  }),
  [encodeCrystalMapId(17, 10)]: makeCrystalStandardPokeCenter('Fuchsia Heal Center'),
  [encodeCrystalMapId(18, 5)]: makeCrystalStandardPokeCenter('Lavender Heal Center'),
  [encodeCrystalMapId(19, 3)]: makeCrystalStandardPokeCenter('Mt. Silver Heal Center'),
  [encodeCrystalMapId(21, 17)]: makeCrystalStandardPokeCenter('Celadon Heal Center'),
  [encodeCrystalMapId(22, 6)]: makeCrystalStandardPokeCenter('Cianwood Heal Center'),
  [encodeCrystalMapId(23, 9)]: makeCrystalStandardPokeCenter('Viridian Heal Center'),
  [encodeCrystalMapId(25, 6)]: makeCrystalStandardPokeCenter('Saffron Heal Center'),
  [encodeCrystalMapId(26, 5)]: makeCrystalStandardPokeCenter('Cherrygrove Heal Center'),
});

export function encodeEmeraldMapId(mapGroup, mapNumber) {
  return 0x10000 | ((mapGroup & 0xff) << 8) | (mapNumber & 0xff);
}

const EMERALD_STANDARD_POKECENTER_CONFIG = Object.freeze({
  standX: 7,
  standY: 4,
  exitX: 7,
  exitY: 8,
  tileset: 61, // LAYOUT_POKEMON_CENTER_1F
});

function makeEmeraldStandardPokeCenter(name) {
  return Object.freeze({ ...EMERALD_STANDARD_POKECENTER_CONFIG, name });
}

export const EMERALD_POKECENTER_CONFIGS = Object.freeze({
  [encodeEmeraldMapId(2, 2)]: makeEmeraldStandardPokeCenter('Oldale Heal Center'),
  [encodeEmeraldMapId(3, 1)]: makeEmeraldStandardPokeCenter('Dewford Heal Center'),
  [encodeEmeraldMapId(4, 5)]: Object.freeze({
    standX: 7,
    standY: 4,
    exitX: 7,
    exitY: 8,
    tileset: 71, // LAYOUT_LAVARIDGE_TOWN_POKEMON_CENTER_1F
    name: 'Lavaridge Heal Center',
  }),
  [encodeEmeraldMapId(5, 4)]: makeEmeraldStandardPokeCenter('Fallarbor Heal Center'),
  [encodeEmeraldMapId(6, 4)]: makeEmeraldStandardPokeCenter('Verdanturf Heal Center'),
  [encodeEmeraldMapId(7, 0)]: makeEmeraldStandardPokeCenter('Pacifidlog Heal Center'),
  [encodeEmeraldMapId(8, 4)]: makeEmeraldStandardPokeCenter('Petalburg Heal Center'),
  [encodeEmeraldMapId(9, 11)]: makeEmeraldStandardPokeCenter('Slateport Heal Center'),
  [encodeEmeraldMapId(10, 5)]: makeEmeraldStandardPokeCenter('Mauville Heal Center'),
  [encodeEmeraldMapId(11, 5)]: makeEmeraldStandardPokeCenter('Rustboro Heal Center'),
  [encodeEmeraldMapId(12, 2)]: makeEmeraldStandardPokeCenter('Fortree Heal Center'),
  [encodeEmeraldMapId(13, 6)]: makeEmeraldStandardPokeCenter('Lilycove Heal Center'),
  [encodeEmeraldMapId(14, 3)]: makeEmeraldStandardPokeCenter('Mossdeep Heal Center'),
  [encodeEmeraldMapId(15, 2)]: makeEmeraldStandardPokeCenter('Sootopolis Heal Center'),
  [encodeEmeraldMapId(16, 10)]: Object.freeze({
    standX: 3,
    standY: 4,
    exitX: 9,
    exitY: 11,
    tileset: 270, // LAYOUT_EVER_GRANDE_CITY_POKEMON_LEAGUE_1F
    yFirstToNurse: true,
    name: 'Ever Grande League Heal Center',
  }),
  [encodeEmeraldMapId(16, 12)]: makeEmeraldStandardPokeCenter('Ever Grande Heal Center'),
  [encodeEmeraldMapId(26, 53)]: makeEmeraldStandardPokeCenter('Battle Frontier Heal Center'),
});

const ALL_POKECENTER_CONFIGS = Object.freeze({
  ...POKECENTER_CONFIGS,
  ...CRYSTAL_POKECENTER_CONFIGS,
  ...EMERALD_POKECENTER_CONFIGS,
});

const FACING_TO_DIR = Object.freeze({
  0x00: 'down',
  0x04: 'up',
  0x08: 'left',
  0x0c: 'right',
});

const OPPOSITE_DIR = Object.freeze({
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
});

const BLOCKED_STUCK_FRAMES = 240;
const RETURN_STUCK_FRAMES = 150;
const HEAL_STALL_FRAMES = 1800;
const MAX_TRAIL_LENGTH = 2000;
const WARP_SNAP_GRACE_FRAMES = 60;
const LOW_HP_NUMERATOR = 3;
const LOW_HP_DENOMINATOR = 10; // <= 30% HP
const OUT_OF_PP_MISSING_POKECENTER_REASON =
  'out of PP (missing Heal Center path — visit a Heal Center first)';
const LOW_HP_MISSING_POKECENTER_REASON =
  'low HP (missing Heal Center path — visit a Heal Center first)';

export function isPokeCenterMap(mapId) {
  return Object.hasOwn(ALL_POKECENTER_CONFIGS, mapId);
}

export function pickAttackSlot(moves, pp, { maskPpUps = true } = {}) {
  const ppMask = maskPpUps ? 0x3f : 0xff;
  for (let i = 0; i < 4; i++) {
    const moveId = moves[i] | 0;
    const remPp = (pp[i] | 0) & ppMask;
    if (moveId !== 0 && !NON_ATTACK_MOVES.has(moveId) && remPp > 0) {
      return i;
    }
  }
  return -1;
}

export function decodeGen1Char(byte) {
  const b = byte & 0xff;
  if (b >= 0x80 && b <= 0x99) return String.fromCharCode(65 + b - 0x80);
  if (b >= 0xa0 && b <= 0xb9) return String.fromCharCode(97 + b - 0xa0);
  if (b >= 0xf6 && b <= 0xff) return String.fromCharCode(48 + b - 0xf6);
  if (b === 0x7f) return ' ';
  if (b === 0xf3) return '/';
  if (b === 0xe6) return '?';
  if (b === 0xe7) return '!';
  return ' ';
}

export function readPokemonGen1OverworldPos(readMem, mem = POKEMON_RED_BLUE_MEM) {
  const r = (addr) => readMem(addr) & 0xff;
  return {
    isInBattle: r(mem.isInBattle),
    map: r(mem.curMap),
    y: r(mem.yCoord),
    x: r(mem.xCoord),
    tileset: r(mem.curMapTileset),
    mapHeight: r(mem.curMapHeight) * 2,
    mapWidth: r(mem.curMapWidth) * 2,
    partyCount: Math.min(r(mem.partyCount), 6),
    facing: r(mem.facing),
  };
}

function readBattleTilemap(r, tileMapAddr, { matchDisabled = false } = {}) {
  const readTileRow = (row) => {
    let s = '';
    const start = tileMapAddr + row * 20;
    for (let c = 0; c < 20; c++) {
      s += decodeGen1Char(r(start + c));
    }
    return s;
  };

  const moveInfoRows = [];
  for (let row = 8; row <= 11; row++) {
    moveInfoRows.push(readTileRow(row));
  }
  const moveInfoText = moveInfoRows.join(' ');
  const hasTypeBox =
    moveInfoText.includes('TYPE') || (matchDisabled && moveInfoText.includes('Disabled!'));

  const menuBoxRows = [];
  for (let row = 12; row <= 17; row++) {
    menuBoxRows.push(readTileRow(row));
  }
  const menuBoxText = menuBoxRows.join(' ');

  let fightPos = null;
  let runPos = null;
  for (let row = 12; row <= 17; row++) {
    const rowText = menuBoxRows[row - 12];
    if (!fightPos) {
      const col = rowText.indexOf('FIGHT');
      if (col !== -1) fightPos = { row, col };
    }
    if (!runPos) {
      const col = rowText.indexOf('RUN');
      if (col !== -1) runPos = { row, col };
    }
  }
  const hasRun = Boolean(runPos);

  let cursorPos = null;
  for (let row = 12; row <= 17; row++) {
    const rowAddr = tileMapAddr + row * 20;
    for (let col = 0; col < 20; col++) {
      if (r(rowAddr + col) === TILE_CURSOR) {
        if (!cursorPos) cursorPos = { row, col };
        if (hasTypeBox && col === 5) {
          cursorPos = { row, col };
          row = 18;
          break;
        }
      }
    }
  }

  return {
    hasTypeBox,
    menuBoxRows,
    menuBoxText,
    fightPos,
    runPos,
    hasRun,
    cursorPos,
    moveFirstRow: MOVE_FIRST_ROW,
  };
}

export function readPokemonGen1Snapshot(readMem, mem = POKEMON_RED_BLUE_MEM) {
  const r = (addr) => readMem(addr) & 0xff;
  const r16 = (addr) => (r(addr) << 8) | r(addr + 1);

  const pos = readPokemonGen1OverworldPos(readMem, mem);
  const party = [];
  for (let i = 0; i < pos.partyCount; i++) {
    const base = mem.partyMon1 + i * 0x2c;
    party.push({
      species: r(base),
      hp: r16(base + 0x01),
      moves: [r(base + 0x08), r(base + 0x09), r(base + 0x0a), r(base + 0x0b)],
      pp: [
        r(base + 0x1d) & 0x3f,
        r(base + 0x1e) & 0x3f,
        r(base + 0x1f) & 0x3f,
        r(base + 0x20) & 0x3f,
      ],
      level: r(base + 0x21),
      maxHp: r16(base + 0x22),
    });
  }

  const battleBase = mem.battleMon;
  const battleMon = {
    hp: r16(battleBase + 0x01),
    maxHp: r16(battleBase + 0x0f),
    level: r(battleBase + 0x0e),
    moves: [r(battleBase + 0x08), r(battleBase + 0x09), r(battleBase + 0x0a), r(battleBase + 0x0b)],
    pp: [
      r(battleBase + 0x19) & 0x3f,
      r(battleBase + 0x1a) & 0x3f,
      r(battleBase + 0x1b) & 0x3f,
      r(battleBase + 0x1c) & 0x3f,
    ],
  };

  const tileMenus = readBattleTilemap(r, mem.tileMap);

  return {
    ...pos,
    party,
    battleMon,
    ...tileMenus,
  };
}

export function readPokemonCrystalOverworldPos(readMem, mem = POKEMON_CRYSTAL_MEM) {
  const r = (addr) => readMem(addr) & 0xff;
  const mapGroup = r(mem.mapGroup);
  const mapNumber = r(mem.mapNumber);
  return {
    isInBattle: r(mem.battleMode),
    map: encodeCrystalMapId(mapGroup, mapNumber),
    mapGroup,
    mapNumber,
    y: r(mem.yCoord),
    x: r(mem.xCoord),
    tileset: r(mem.curMapTileset),
    mapHeight: r(mem.curMapHeight) * 2,
    mapWidth: r(mem.curMapWidth) * 2,
    partyCount: Math.min(r(mem.partyCount), 6),
    facing: r(mem.playerDirection),
  };
}

export function readPokemonCrystalSnapshot(readMem, mem = POKEMON_CRYSTAL_MEM) {
  const r = (addr) => readMem(addr) & 0xff;
  const r16 = (addr) => (r(addr) << 8) | r(addr + 1);

  const pos = readPokemonCrystalOverworldPos(readMem, mem);
  const party = [];
  for (let i = 0; i < pos.partyCount; i++) {
    const listSpecies = r(mem.partySpecies + i);
    if (listSpecies === CRYSTAL_EGG_SPECIES) {
      party.push({
        species: CRYSTAL_EGG_SPECIES,
        isEgg: true,
        hp: 0,
        maxHp: 0,
        level: 0,
        moves: [0, 0, 0, 0],
        pp: [0, 0, 0, 0],
      });
      continue;
    }
    const base = mem.partyMon1 + i * 0x30;
    party.push({
      species: r(base),
      isEgg: false,
      hp: r16(base + 0x22),
      maxHp: r16(base + 0x24),
      level: r(base + 0x1f),
      moves: [r(base + 0x02), r(base + 0x03), r(base + 0x04), r(base + 0x05)],
      pp: [
        r(base + 0x17) & 0x3f,
        r(base + 0x18) & 0x3f,
        r(base + 0x19) & 0x3f,
        r(base + 0x1a) & 0x3f,
      ],
    });
  }

  const bBase = mem.battleMon;
  const battleMon = {
    species: r(bBase),
    moves: [r(bBase + 0x02), r(bBase + 0x03), r(bBase + 0x04), r(bBase + 0x05)],
    pp: [
      r(bBase + 0x08) & 0x3f,
      r(bBase + 0x09) & 0x3f,
      r(bBase + 0x0a) & 0x3f,
      r(bBase + 0x0b) & 0x3f,
    ],
    level: r(bBase + 0x0d),
    hp: r16(bBase + 0x10),
    maxHp: r16(bBase + 0x12),
  };

  const tileMenus = readBattleTilemap(r, mem.tileMap, { matchDisabled: true });

  return {
    ...pos,
    party,
    battleMon,
    ...tileMenus,
  };
}

export function decodeGen3Char(byte) {
  const b = byte & 0xff;
  if (b >= 0xbb && b <= 0xd4) return String.fromCharCode(65 + b - 0xbb);
  if (b >= 0xd5 && b <= 0xee) return String.fromCharCode(97 + b - 0xd5);
  if (b >= 0xa1 && b <= 0xaa) return String.fromCharCode(48 + b - 0xa1);
  if (b === 0x00 || b === 0xfa || b === 0xfb || b === 0xfe) return ' ';
  if (b === 0xab) return '!';
  if (b === 0xac) return '?';
  if (b === 0xad) return '.';
  if (b === 0xae) return '-';
  if (b === 0xb8) return ',';
  if (b === 0xba) return '/';
  return ' ';
}

export function decodeGen3String(readMem, startAddr, maxLen = 160) {
  let out = '';
  let i = 0;
  while (i < maxLen) {
    const b = readMem(startAddr + i) & 0xff;
    i += 1;
    if (b === 0xff) break;
    if (b === 0xfc) {
      if (i >= maxLen) break;
      const cmd = readMem(startAddr + i) & 0xff;
      i += 1 + (EMERALD_EXT_CTRL_ARG_LEN[cmd] ?? 0);
      continue;
    }
    if (b === 0xfd) {
      i += 1;
      out += ' ';
      continue;
    }
    out += decodeGen3Char(b);
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function decryptEmeraldBoxMon(readMem, base) {
  const r = (addr) => readMem(addr) & 0xff;
  const r32 = (addr) =>
    (r(addr) | (r(addr + 1) << 8) | (r(addr + 2) << 16) | (r(addr + 3) << 24)) >>> 0;

  const personality = r32(base);
  const otId = r32(base + 0x04);
  const flags = r(base + 0x13);
  const hasSpecies = Boolean((flags >> 1) & 1);
  const isEgg = Boolean((flags >> 2) & 1);
  if (!hasSpecies) {
    return { species: 0, isEgg: false, moves: [0, 0, 0, 0], pp: [0, 0, 0, 0] };
  }

  const key = (personality ^ otId) >>> 0;
  const order = EMERALD_SUBSTRUCT_SLOTS[personality % 24];
  const readWord = (slot, wordIdx) =>
    (r32(base + 0x20 + slot * 12 + wordIdx * 4) ^ key) >>> 0;

  const growth0 = readWord(order[0], 0);
  const species = growth0 & 0xffff;

  const atk0 = readWord(order[1], 0);
  const atk1 = readWord(order[1], 1);
  const atk2 = readWord(order[1], 2);
  return {
    species,
    isEgg,
    moves: [
      atk0 & 0xffff,
      (atk0 >>> 16) & 0xffff,
      atk1 & 0xffff,
      (atk1 >>> 16) & 0xffff,
    ],
    pp: [
      atk2 & 0xff,
      (atk2 >>> 8) & 0xff,
      (atk2 >>> 16) & 0xff,
      (atk2 >>> 24) & 0xff,
    ],
  };
}

export function readPokemonEmeraldOverworldPos(readMem, mem = POKEMON_EMERALD_MEM) {
  const r = (addr) => readMem(addr) & 0xff;
  const r16 = (addr) => (r(addr) | (r(addr + 1) << 8)) & 0xffff;
  const r16s = (addr) => {
    const v = r16(addr);
    return v & 0x8000 ? v - 0x10000 : v;
  };
  const r32 = (addr) =>
    (r(addr) | (r(addr + 1) << 8) | (r(addr + 2) << 16) | (r(addr + 3) << 24)) >>> 0;

  const cb2 = (r32(mem.gMain + 0x04) & ~1) >>> 0;
  const inBattleFlag = Boolean((r(mem.gMain + 0x439) >> 1) & 1);
  const battleTypeFlags = r32(mem.gBattleTypeFlags);
  const battleOutcome = r(mem.gBattleOutcome);
  const inCutscene =
    cb2 === mem.cb2EvolutionSceneStart ||
    cb2 === mem.cb2EvolutionSceneLoad ||
    cb2 === mem.cb2EvolutionSceneUpdate;

  let isInBattle = 0;
  if (cb2 === mem.cb2WhiteOut || (inBattleFlag && battleOutcome === 2)) {
    isInBattle = 0xff;
  } else if (inBattleFlag) {
    isInBattle = (battleTypeFlags & EMERALD_NON_AUTO_BATTLE_MASK) !== 0 ? 2 : 1;
  }

  const sb1 = r32(mem.gSaveBlock1Ptr);
  if (sb1 < 0x02000000 || sb1 > 0x0203f000) {
    return {
      isInBattle,
      inCutscene,
      map: 0,
      mapGroup: 0,
      mapNumber: 0,
      y: -1,
      x: -1,
      tileset: 0,
      mapHeight: 0,
      mapWidth: 0,
      partyCount: 0,
      facing: 0,
    };
  }

  const mapGroup = r(sb1 + 0x04);
  const mapNumber = r(sb1 + 0x05);
  const map = encodeEmeraldMapId(mapGroup, mapNumber);
  const tileset = r16(mem.gMapHeader + 0x12) || r16(sb1 + 0x32);

  let mapWidth = 0;
  let mapHeight = 0;
  const layoutPtr = r32(mem.gMapHeader);
  if (
    (layoutPtr >= 0x08000000 && layoutPtr < 0x0a000000) ||
    (layoutPtr >= 0x02000000 && layoutPtr <= 0x0203fff0)
  ) {
    const w = r32(layoutPtr) | 0;
    const h = r32(layoutPtr + 4) | 0;
    if (w > 0 && w <= 1024 && h > 0 && h <= 1024) {
      mapWidth = w;
      mapHeight = h;
    }
  }

  let x = r16s(sb1 + 0x00);
  let y = r16s(sb1 + 0x02);
  let facing = 0x00;

  const playerObjIdx = r(mem.gPlayerAvatar + 0x05);
  if (playerObjIdx < 16) {
    const objBase = mem.gObjectEvents + playerObjIdx * 0x24;
    const activeObj = Boolean(r(objBase) & 0x01);
    const isPlayer = Boolean(r(objBase + 0x02) & 0x01);
    if (activeObj && isPlayer) {
      const ox = r16s(objBase + 0x10) - 7;
      const oy = r16s(objBase + 0x12) - 7;
      if (ox >= 0 && oy >= 0) {
        x = ox;
        y = oy;
      }
      const dir = r(objBase + 0x18) & 0x0f;
      facing = EMERALD_DIR_TO_FACING[dir] ?? facing;
    }
  }

  return {
    isInBattle,
    inCutscene,
    map,
    mapGroup,
    mapNumber,
    y,
    x,
    tileset,
    mapHeight,
    mapWidth,
    partyCount: Math.min(r(mem.gPlayerPartyCount), 6),
    facing,
  };
}

export function readPokemonEmeraldSnapshot(readMem, mem = POKEMON_EMERALD_MEM) {
  const r = (addr) => readMem(addr) & 0xff;
  const r16 = (addr) => (r(addr) | (r(addr + 1) << 8)) & 0xffff;
  const r32 = (addr) =>
    (r(addr) | (r(addr + 1) << 8) | (r(addr + 2) << 16) | (r(addr + 3) << 24)) >>> 0;

  const pos = readPokemonEmeraldOverworldPos(readMem, mem);
  const party = [];
  for (let i = 0; i < pos.partyCount; i++) {
    const base = mem.gPlayerParty + i * 0x64;
    const box = decryptEmeraldBoxMon(readMem, base);
    if (box.isEgg) {
      party.push({
        species: box.species,
        isEgg: true,
        hp: 0,
        maxHp: 0,
        level: 0,
        moves: [0, 0, 0, 0],
        pp: [0, 0, 0, 0],
      });
      continue;
    }
    party.push({
      species: box.species,
      isEgg: false,
      hp: r16(base + 0x56),
      maxHp: r16(base + 0x58),
      level: r(base + 0x54),
      moves: box.moves,
      pp: box.pp,
    });
  }

  const bBase = mem.gBattleMons;
  const battleMon = {
    species: r16(bBase),
    moves: [r16(bBase + 0x0c), r16(bBase + 0x0e), r16(bBase + 0x10), r16(bBase + 0x12)],
    pp: [r(bBase + 0x24), r(bBase + 0x25), r(bBase + 0x26), r(bBase + 0x27)],
    hp: r16(bBase + 0x28),
    level: r(bBase + 0x2a),
    maxHp: r16(bBase + 0x2c),
  };

  const ctrlFunc = (r32(mem.gBattlerControllerFuncs) & ~1) >>> 0;
  let fightPos = null;
  let runPos = null;
  let hasRun = false;
  let cursorPos = null;
  let hasTypeBox = false;
  let moveGrid = false;
  let moveCursor = 0;

  if (pos.isInBattle === 1 && ctrlFunc === mem.handleInputChooseAction) {
    const act = r(mem.gActionSelectionCursor) & 3;
    fightPos = { row: 0, col: 1 };
    runPos = { row: 1, col: 2 };
    hasRun = true;
    cursorPos = { row: (act >> 1) & 1, col: act & 1 };
  } else if (pos.isInBattle === 1 && ctrlFunc === mem.handleInputChooseMove) {
    hasTypeBox = true;
    moveGrid = true;
    moveCursor = r(mem.gMoveSelectionCursor) & 3;
  }

  const cb2 = (r32(mem.gMain + 0x04) & ~1) >>> 0;
  const inLearnCb = cb2 === mem.cb2InitLearnMove;
  const instr = r32(mem.gBattlescriptCurrInstr);
  const inLearnScript =
    pos.isInBattle === 1 &&
    instr >= mem.battleScriptAskToLearnMoveStart &&
    instr < mem.battleScriptAskToLearnMoveEnd;

  const textParts = [];
  if (pos.isInBattle === 1 || pos.inCutscene || inLearnCb) {
    const battleText = decodeGen3String(r, mem.gDisplayedStringBattle, 160);
    if (battleText) textParts.push(battleText);
  }
  if (pos.inCutscene || inLearnCb) {
    const var4Text = decodeGen3String(r, mem.gStringVar4, 160);
    if (var4Text) textParts.push(var4Text);
  }
  if (inLearnCb || inLearnScript) {
    textParts.push('trying to learn');
  }

  return {
    ...pos,
    maskPpUps: false,
    party,
    battleMon,
    hasTypeBox,
    moveGrid,
    moveCursor,
    menuBoxRows: [],
    menuBoxText: textParts.join(' '),
    fightPos,
    runPos,
    hasRun,
    cursorPos,
  };
}

function makeGen1Profile(id, name, mem) {
  return Object.freeze({
    id,
    name,
    mem,
    readOverworldPos: (readMem) => readPokemonGen1OverworldPos(readMem, mem),
    readSnapshot: (readMem) => readPokemonGen1Snapshot(readMem, mem),
  });
}

const POKEMON_CRYSTAL_PROFILE = Object.freeze({
  id: 'pokemon-crystal',
  name: 'Pokémon Crystal',
  mem: POKEMON_CRYSTAL_MEM,
  pokeCenterConfigs: CRYSTAL_POKECENTER_CONFIGS,
  readOverworldPos: readPokemonCrystalOverworldPos,
  readSnapshot: readPokemonCrystalSnapshot,
});

const POKEMON_EMERALD_PROFILE = Object.freeze({
  id: 'pokemon-emerald',
  name: 'Pokémon Emerald',
  mem: POKEMON_EMERALD_MEM,
  pokeCenterConfigs: EMERALD_POKECENTER_CONFIGS,
  readOverworldPos: readPokemonEmeraldOverworldPos,
  readSnapshot: readPokemonEmeraldSnapshot,
});

const AUTO_FIGHT_PROFILES = Object.freeze({
  'POKEMON RED': makeGen1Profile('pokemon-red-blue', 'Pokémon Red', POKEMON_RED_BLUE_MEM),
  'POKEMON BLUE': makeGen1Profile('pokemon-red-blue', 'Pokémon Blue', POKEMON_RED_BLUE_MEM),
  'POKEMON YELLOW': makeGen1Profile('pokemon-yellow', 'Pokémon Yellow', POKEMON_YELLOW_MEM),
  'PM_CRYSTAL': POKEMON_CRYSTAL_PROFILE,
  'POKEMON CRYSTAL': POKEMON_CRYSTAL_PROFILE,
  'POKEMON EMER': POKEMON_EMERALD_PROFILE,
  'POKEMON EMERALD': POKEMON_EMERALD_PROFILE,
});

export function getAutoFightProfile(title, gameCode = '') {
  const normalizedTitle = String(title || '').trim().toUpperCase();
  const normalizedCode = String(gameCode || '').trim().toUpperCase();
  const isEmeraldTitle =
    normalizedTitle === 'POKEMON EMER' || normalizedTitle === 'POKEMON EMERALD';
  if (isEmeraldTitle || normalizedCode === 'BPEE') {
    if (normalizedCode && normalizedCode !== 'BPEE') return null;
    return POKEMON_EMERALD_PROFILE;
  }
  return AUTO_FIGHT_PROFILES[normalizedTitle] ?? null;
}

function sumPartyPp(party, maskPpUps = true) {
  const ppMask = maskPpUps ? 0x3f : 0xff;
  let total = 0;
  for (const mon of party) {
    for (let i = 0; i < 4; i++) {
      total += (mon.pp[i] | 0) & ppMask;
    }
  }
  return total;
}

function sumPartyHp(party) {
  let total = 0;
  for (const mon of party) {
    total += mon.hp | 0;
  }
  return total;
}

function isPartyAllFullHp(party) {
  return (
    party.some((m) => !m.isEgg) &&
    party.every((m) => m.isEgg || (m.maxHp > 0 && m.hp === m.maxHp))
  );
}

/** Return whether an active Pokemon is at or below the low-HP heal threshold (30%). */
function isLowHp(mon) {
  return Boolean(
    mon &&
      mon.maxHp > 0 &&
      mon.hp > 0 &&
      mon.hp * LOW_HP_DENOMINATOR <= mon.maxHp * LOW_HP_NUMERATOR
  );
}

/** Return the missing-path stop reason if a Pokemon needs healing (out of PP or low HP). */
function getHealTriggerReason(mon, maskPpUps = true) {
  if (pickAttackSlot(mon.moves, mon.pp, { maskPpUps }) === -1) {
    return OUT_OF_PP_MISSING_POKECENTER_REASON;
  }
  if (isLowHp(mon)) {
    return LOW_HP_MISSING_POKECENTER_REASON;
  }
  return null;
}

function dirFromFacing(facing) {
  return FACING_TO_DIR[facing] ?? null;
}

function dirFromDelta(prev, next) {
  if (!prev || !next || prev.map !== next.map) return null;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (dx > 0 && dy === 0) return 'right';
  if (dx < 0 && dy === 0) return 'left';
  if (dy > 0 && dx === 0) return 'down';
  if (dy < 0 && dx === 0) return 'up';
  return null;
}

function steerSameMap(snap, target) {
  if (snap.x > target.x) return 'left';
  if (snap.x < target.x) return 'right';
  if (snap.y > target.y) return 'up';
  return 'down';
}

function isValidOverworldCoord(snap) {
  if (!snap || snap.x < 0 || snap.y < 0 || snap.x === 0xff || snap.y === 0xff) return false;
  if (snap.mapWidth > 0 && snap.x >= snap.mapWidth) return false;
  if (snap.mapHeight > 0 && snap.y >= snap.mapHeight) return false;
  return true;
}

export function createAutoFight() {
  let active = false;
  let phase = 'idle';
  let stopReason = null;
  let anchor = null;
  let wasInBattle = false;
  let battleMonReady = false;
  let dirIndex = 0;
  let atAnchorFrames = 0;
  let returnStuckFrames = 0;
  let lastPos = { map: -1, x: 0, y: 0 };
  let overworldCooldown = 0;
  let pulse = null;
  let cooldown = 0;

  // Passive PokéCenter breadcrumb trail state
  let pokeCenterMap = null;
  let pokeCenterTileset = null;
  let trail = [];
  let wasInPokeCenter = false;
  let pendingWarpSnapFrames = 0;
  let warpStartTileset = null;
  let prevOverworld = null;

  // Round-trip heal & return state
  let travelMode = null;
  let pathIdx = -1;
  let stuckFrames = 0;
  let lastTravelDir = 'up';
  let healSubphase = null;
  let healStartTotalPp = 0;
  let healStartTotalHp = 0;
  let healFrames = 0;
  let closeCycleFrame = 0;

  function hasHealPath(mapId) {
    return pokeCenterMap !== null && trail.length > 0 && trail[trail.length - 1].map === mapId;
  }

  function clearTrail() {
    pokeCenterMap = null;
    pokeCenterTileset = null;
    trail = [];
    wasInPokeCenter = false;
    pendingWarpSnapFrames = 0;
    warpStartTileset = null;
    prevOverworld = null;
  }

  function exportTrail() {
    if (pokeCenterMap === null || trail.length === 0) return null;
    return {
      pokeCenterMap,
      trail: trail.map((n) => ({ ...n })),
    };
  }

  function importTrail(data) {
    clearTrail();
    if (!data || !isPokeCenterMap(data.pokeCenterMap) || !Array.isArray(data.trail)) {
      return false;
    }
    if (data.trail.length === 0 || data.trail.length > MAX_TRAIL_LENGTH) {
      return false;
    }
    const sanitized = [];
    for (const n of data.trail) {
      if (!n || typeof n.map !== 'number' || typeof n.x !== 'number' || typeof n.y !== 'number') {
        return false;
      }
      sanitized.push({
        map: n.map | 0,
        x: n.x | 0,
        y: n.y | 0,
        enterDir: typeof n.enterDir === 'string' ? n.enterDir : null,
        exitDir: typeof n.exitDir === 'string' ? n.exitDir : null,
      });
    }
    pokeCenterMap = data.pokeCenterMap;
    trail = sanitized;
    wasInPokeCenter = false;
    prevOverworld = null;
    return true;
  }

  function observe(snap) {
    if (active || !snap || snap.isInBattle !== 0 || (snap.partyCount ?? 1) === 0) {
      return;
    }
    if (!isValidOverworldCoord(snap)) {
      return;
    }

    const facingDir = dirFromFacing(snap.facing);

    if (isPokeCenterMap(snap.map)) {
      pokeCenterMap = snap.map;
      pokeCenterTileset = ALL_POKECENTER_CONFIGS[snap.map].tileset;
      trail = [];
      wasInPokeCenter = true;
      pendingWarpSnapFrames = 0;
      warpStartTileset = null;
      prevOverworld = { map: snap.map, x: snap.x, y: snap.y, facingDir };
      return;
    }

    if (wasInPokeCenter) {
      // Wait for LoadMapHeader after WarpFound2 changes wCurMap before committing exit coords.
      if (snap.tileset !== undefined && pokeCenterTileset !== null && snap.tileset === pokeCenterTileset) {
        return;
      }
      wasInPokeCenter = false;
      const enterDir = prevOverworld?.facingDir || 'down';
      const exitDir = OPPOSITE_DIR[enterDir] || 'up';
      trail = [{ map: snap.map, x: snap.x, y: snap.y, enterDir, exitDir }];
      pendingWarpSnapFrames = WARP_SNAP_GRACE_FRAMES;
      warpStartTileset = snap.tileset ?? null;
      prevOverworld = { map: snap.map, x: snap.x, y: snap.y, facingDir };
      return;
    }

    if (pokeCenterMap === null || trail.length === 0) {
      prevOverworld = { map: snap.map, x: snap.x, y: snap.y, facingDir };
      return;
    }

    const last = trail[trail.length - 1];
    if (snap.map === last.map && snap.x === last.x && snap.y === last.y) {
      if (pendingWarpSnapFrames > 0) {
        pendingWarpSnapFrames -= 1;
        if (pendingWarpSnapFrames === 0) {
          warpStartTileset = null;
        }
      }
      prevOverworld = {
        map: snap.map,
        x: snap.x,
        y: snap.y,
        facingDir: facingDir || prevOverworld?.facingDir || null,
      };
      return;
    }

    const loopIdx = trail.findIndex((n) => n.map === snap.map && n.x === snap.x && n.y === snap.y);
    if (loopIdx !== -1) {
      trail.length = loopIdx + 1;
      pendingWarpSnapFrames = 0;
      warpStartTileset = null;
      prevOverworld = {
        map: snap.map,
        x: snap.x,
        y: snap.y,
        facingDir: facingDir || dirFromDelta(last, snap) || prevOverworld?.facingDir || null,
      };
      return;
    }

    if (snap.map === last.map) {
      const dist = Math.abs(snap.x - last.x) + Math.abs(snap.y - last.y);
      const tilesetChanged =
        snap.tileset !== undefined && warpStartTileset !== null && snap.tileset !== warpStartTileset;
      if (pendingWarpSnapFrames > 0 && (dist > 2 || tilesetChanged)) {
        last.x = snap.x;
        last.y = snap.y;
        pendingWarpSnapFrames = 0;
        warpStartTileset = null;
        prevOverworld = {
          map: snap.map,
          x: snap.x,
          y: snap.y,
          facingDir: facingDir || prevOverworld?.facingDir || null,
        };
        return;
      }
      pendingWarpSnapFrames = 0;
      warpStartTileset = null;
      if (dist > 2) {
        pokeCenterMap = null;
        trail = [];
        prevOverworld = { map: snap.map, x: snap.x, y: snap.y, facingDir };
        return;
      }
    } else {
      pendingWarpSnapFrames = 0;
      warpStartTileset = null;
    }

    if (snap.map !== last.map) {
      const enterDir = prevOverworld?.facingDir || facingDir || 'up';
      const exitDir = OPPOSITE_DIR[enterDir] || 'down';
      trail.push({ map: snap.map, x: snap.x, y: snap.y, enterDir, exitDir });
      pendingWarpSnapFrames = WARP_SNAP_GRACE_FRAMES;
      warpStartTileset = snap.tileset ?? null;
    } else {
      trail.push({ map: snap.map, x: snap.x, y: snap.y, enterDir: null, exitDir: null });
    }

    if (trail.length > MAX_TRAIL_LENGTH) {
      pokeCenterMap = null;
      trail = [];
    }

    prevOverworld = {
      map: snap.map,
      x: snap.x,
      y: snap.y,
      facingDir: facingDir || dirFromDelta(last, snap) || prevOverworld?.facingDir || null,
    };
  }

  function stop(reason = 'manual') {
    const wasActive = active;
    const prevPhase = phase;

    active = false;
    stopReason = reason;
    phase = 'idle';
    pulse = null;
    cooldown = 0;
    travelMode = null;
    healSubphase = null;
    stuckFrames = 0;
    healFrames = 0;

    if (wasActive && pokeCenterMap !== null && prevPhase === 'healing') {
      wasInPokeCenter = true;
      pokeCenterTileset = ALL_POKECENTER_CONFIGS[pokeCenterMap]?.tileset ?? pokeCenterTileset;
      trail = [];
      pendingWarpSnapFrames = 0;
      warpStartTileset = null;
      prevOverworld = null;
    }

    return {
      active: false,
      buttons: { ...NEUTRAL_BUTTONS },
      stopReason: reason,
      phase: 'idle',
    };
  }

  function start(snap) {
    active = true;
    stopReason = null;
    phase = snap.isInBattle === 1 ? 'fighting' : 'moving';
    anchor = { map: snap.map, x: snap.x, y: snap.y };
    wasInBattle = snap.isInBattle === 1;
    battleMonReady =
      snap.isInBattle === 1 &&
      snap.battleMon.maxHp > 0 &&
      snap.battleMon.hp > 0 &&
      snap.battleMon.moves[0] !== 0;
    dirIndex = 0;
    atAnchorFrames = 0;
    returnStuckFrames = 0;
    lastPos = { map: snap.map, x: snap.x, y: snap.y };
    overworldCooldown = 0;
    pulse = null;
    cooldown = 0;
    travelMode = null;
    pathIdx = -1;
    stuckFrames = 0;
    healSubphase = null;
    healStartTotalPp = 0;
    healStartTotalHp = 0;
    healFrames = 0;
    closeCycleFrame = 0;
  }

  function beginReturning(snap) {
    phase = 'returning';
    travelMode = 'returning';
    pathIdx = trail.length - 1;
    stuckFrames = 0;
    pulse = null;
    cooldown = 0;
    overworldCooldown = 0;
    lastPos = { map: snap.map, x: snap.x, y: snap.y };
  }

  function beginFleeing(nextTravelMode) {
    if (nextTravelMode === 'returning' && travelMode !== 'returning') {
      pathIdx = trail.length - 1;
    }
    phase = 'fleeing';
    travelMode = nextTravelMode;
    pulse = null;
    cooldown = 0;
  }

  function startPulse(button, framesLeft, cooldownAfter) {
    pulse = { button, framesLeft: framesLeft - 1, cooldownAfter };
    if (pulse.framesLeft === 0) {
      cooldown = cooldownAfter;
    }
    return {
      active: true,
      buttons: { ...NEUTRAL_BUTTONS, [button]: true },
      stopReason: null,
      phase,
    };
  }

  function neutral() {
    return {
      active: true,
      buttons: { ...NEUTRAL_BUTTONS },
      stopReason: null,
      phase,
    };
  }

  function tickPulseAndCooldown() {
    if (pulse && pulse.framesLeft > 0) {
      pulse.framesLeft -= 1;
      if (pulse.framesLeft === 0) {
        cooldown = pulse.cooldownAfter;
      }
      return {
        active: true,
        buttons: { ...NEUTRAL_BUTTONS, [pulse.button]: true },
        stopReason: null,
        phase,
      };
    }

    if (cooldown > 0) {
      cooldown -= 1;
      return neutral();
    }

    return null;
  }

  function beginHealing(snap, party) {
    const maskPpUps = snap.maskPpUps ?? true;
    wasInBattle = false;
    battleMonReady = false;
    phase = 'healing';
    travelMode = null;
    healSubphase = 'to_nurse';
    healStartTotalPp = sumPartyPp(party, maskPpUps);
    healStartTotalHp = sumPartyHp(party);
    healFrames = 0;
    closeCycleFrame = 0;
    stuckFrames = 0;
    pulse = null;
    cooldown = 0;
    lastPos = { map: snap.map, x: snap.x, y: snap.y };
    return stepHealing(snap, party);
  }

  function stepFleeMainMenu(snap) {
    if (!snap.cursorPos) return neutral();
    const runPos = snap.runPos || {
      row: snap.fightPos.row + 2,
      col: snap.fightPos.col + 6,
    };
    const targetRow = runPos.row;
    const targetCol = runPos.col - 1;
    if (snap.cursorPos.row < targetRow) return startPulse('down', 3, 6);
    if (snap.cursorPos.row > targetRow) return startPulse('up', 3, 6);
    if (snap.cursorPos.col < targetCol) return startPulse('right', 3, 6);
    if (snap.cursorPos.col > targetCol) return startPulse('left', 3, 6);
    return startPulse('a', 3, 14);
  }

  function stepHealing(snap, party) {
    const maskPpUps = snap.maskPpUps ?? true;
    const lead = party.find((m) => !m.isEgg && m.hp > 0);
    if (!lead) {
      return stop('fainted');
    }
    if (healSubphase !== 'exiting' && snap.map !== pokeCenterMap) {
      return stop('map changed');
    }

    healFrames += 1;
    if (healFrames >= HEAL_STALL_FRAMES) {
      return stop('healing stalled at Heal Center');
    }

    const activePulse = tickPulseAndCooldown();
    if (activePulse) return activePulse;

    const cfg = ALL_POKECENTER_CONFIGS[pokeCenterMap];

    if (healSubphase === 'to_nurse') {
      if (snap.tileset !== undefined && snap.tileset !== cfg.tileset) {
        return neutral();
      }
      if (cfg.yFirstToNurse) {
        if (snap.y > cfg.standY) {
          return { active: true, buttons: { ...NEUTRAL_BUTTONS, up: true }, stopReason: null, phase };
        }
        if (snap.y < cfg.standY) {
          return { active: true, buttons: { ...NEUTRAL_BUTTONS, down: true }, stopReason: null, phase };
        }
        if (snap.x > cfg.standX) {
          return { active: true, buttons: { ...NEUTRAL_BUTTONS, left: true }, stopReason: null, phase };
        }
        if (snap.x < cfg.standX) {
          return { active: true, buttons: { ...NEUTRAL_BUTTONS, right: true }, stopReason: null, phase };
        }
      } else {
        if (snap.x > cfg.standX) {
          return { active: true, buttons: { ...NEUTRAL_BUTTONS, left: true }, stopReason: null, phase };
        }
        if (snap.x < cfg.standX) {
          return { active: true, buttons: { ...NEUTRAL_BUTTONS, right: true }, stopReason: null, phase };
        }
        if (snap.y > cfg.standY) {
          return { active: true, buttons: { ...NEUTRAL_BUTTONS, up: true }, stopReason: null, phase };
        }
        if (snap.y < cfg.standY) {
          return { active: true, buttons: { ...NEUTRAL_BUTTONS, down: true }, stopReason: null, phase };
        }
      }
      if (snap.facing != null && snap.facing !== 0x04) {
        return startPulse('up', 3, 6);
      }
      healSubphase = 'talking_nurse';
      healStartTotalPp = sumPartyPp(party, maskPpUps);
      healStartTotalHp = sumPartyHp(party);
      healFrames = 0;
      return startPulse('a', 3, 10);
    }

    if (healSubphase === 'talking_nurse') {
      const allFullHp = isPartyAllFullHp(party);
      const hasAttackPp = pickAttackSlot(lead.moves, lead.pp, { maskPpUps }) !== -1;
      const curPp = sumPartyPp(party, maskPpUps);
      const curHp = sumPartyHp(party);
      if (allFullHp && hasAttackPp && (curPp > healStartTotalPp || curHp > healStartTotalHp)) {
        healSubphase = 'closing_dialogue';
        closeCycleFrame = 0;
        healFrames = 0;
        return startPulse('b', 3, 6);
      }
      return startPulse('a', 3, 10);
    }

    if (healSubphase === 'closing_dialogue') {
      if (snap.y > cfg.standY) {
        healSubphase = 'exiting';
        healFrames = 0;
        return { active: true, buttons: { ...NEUTRAL_BUTTONS, down: true }, stopReason: null, phase };
      }
      const btn = closeCycleFrame < 3 ? 'b' : 'down';
      closeCycleFrame = (closeCycleFrame + 1) % 15;
      return { active: true, buttons: { ...NEUTRAL_BUTTONS, [btn]: true }, stopReason: null, phase };
    }

    if (healSubphase === 'exiting') {
      if (snap.map !== pokeCenterMap && (snap.tileset === undefined || snap.tileset !== cfg.tileset)) {
        if (snap.map !== trail[0]?.map) {
          return stop('map changed');
        }
        phase = 'walking_back';
        travelMode = 'walking_back';
        pathIdx = 0;
        stuckFrames = 0;
        overworldCooldown = 30;
        healSubphase = null;
        lastPos = { map: snap.map, x: snap.x, y: snap.y };
        return stepTrail(snap, party, 1);
      }
      if (snap.x > cfg.exitX) {
        return { active: true, buttons: { ...NEUTRAL_BUTTONS, left: true }, stopReason: null, phase };
      }
      if (snap.x < cfg.exitX) {
        return { active: true, buttons: { ...NEUTRAL_BUTTONS, right: true }, stopReason: null, phase };
      }
      return { active: true, buttons: { ...NEUTRAL_BUTTONS, down: true }, stopReason: null, phase };
    }

    return neutral();
  }

  /** Traverse the recorded Heal Center trail backward (`dirSign = -1`) or forward (`dirSign = 1`). */
  function stepTrail(snap, party, dirSign) {
    const returning = dirSign < 0;
    const mode = returning ? 'returning' : 'walking_back';

    const lead = party.find((m) => !m.isEgg && m.hp > 0);
    if (!lead) {
      return stop('fainted');
    }

    if (returning && snap.map === pokeCenterMap) {
      return beginHealing(snap, party);
    }

    if (!trail.some((n) => n.map === snap.map)) {
      return stop('map changed');
    }

    if (snap.x === 0xff || snap.y === 0xff) {
      phase = mode;
      return {
        active: true,
        buttons: { ...NEUTRAL_BUTTONS, [lastTravelDir]: true },
        stopReason: null,
        phase,
      };
    }

    for (
      let k = returning ? Math.min(pathIdx, trail.length - 1) : Math.max(0, pathIdx);
      returning ? k >= 0 : k < trail.length;
      k += dirSign
    ) {
      if (trail[k].map === snap.map && trail[k].x === snap.x && trail[k].y === snap.y) {
        pathIdx = k + dirSign;
        break;
      }
    }

    if (!returning && pathIdx >= trail.length) {
      anchor = { map: snap.map, x: snap.x, y: snap.y };
      phase = 'moving';
      travelMode = null;
      dirIndex = 0;
      atAnchorFrames = 0;
      returnStuckFrames = 0;
      stuckFrames = 0;
      overworldCooldown = 0;
      lastPos = { map: snap.map, x: snap.x, y: snap.y };
      return stepMoving(snap, party);
    }

    let dir;
    if (returning && pathIdx < 0) {
      const doorBase = trail[0];
      if (doorBase && doorBase.map === snap.map && (snap.x !== doorBase.x || snap.y !== doorBase.y)) {
        dir = steerSameMap(snap, doorBase);
      } else {
        dir = doorBase?.exitDir || 'up';
      }
    } else {
      const target = trail[pathIdx];
      if (target.map === snap.map) {
        dir = steerSameMap(snap, target);
      } else {
        const fromIdx = pathIdx - dirSign;
        const fromNode = fromIdx >= 0 && fromIdx < trail.length ? trail[fromIdx] : null;
        if (fromNode && fromNode.map === snap.map && (snap.x !== fromNode.x || snap.y !== fromNode.y)) {
          dir = steerSameMap(snap, fromNode);
        } else {
          dir = (returning ? fromNode?.exitDir : target.enterDir) || 'up';
        }
      }
    }

    if (snap.map !== lastPos.map) {
      stuckFrames = 0;
      overworldCooldown = 30;
    } else if (snap.x === lastPos.x && snap.y === lastPos.y) {
      if (overworldCooldown > 0) {
        overworldCooldown -= 1;
      } else {
        stuckFrames += 1;
      }
    } else {
      stuckFrames = 0;
      overworldCooldown = 0;
    }

    if (stuckFrames >= BLOCKED_STUCK_FRAMES) {
      return stop(
        returning
          ? 'path blocked (possible one-way path or obstacle) — use a different path from the Heal Center next time'
          : 'path blocked returning to grind spot — use a different path from the Heal Center next time'
      );
    }

    lastPos = { map: snap.map, x: snap.x, y: snap.y };
    lastTravelDir = dir;
    phase = mode;
    return {
      active: true,
      buttons: { ...NEUTRAL_BUTTONS, [dir]: true },
      stopReason: null,
      phase,
    };
  }

  function stepMoving(snap, party) {
    const maskPpUps = snap.maskPpUps ?? true;
    const lead = party.find((m) => !m.isEgg && m.hp > 0);
    if (!lead) {
      return stop('fainted');
    }
    const healReason = getHealTriggerReason(lead, maskPpUps);
    if (healReason) {
      if (hasHealPath(anchor.map)) {
        beginReturning(snap);
        return stepTrail(snap, party, -1);
      }
      return stop(healReason);
    }
    if (snap.map !== anchor.map) {
      return stop('map changed');
    }

    let dir;
    if (snap.x !== anchor.x || snap.y !== anchor.y) {
      atAnchorFrames = 0;
      if (snap.x === lastPos.x && snap.y === lastPos.y) {
        if (overworldCooldown > 0) {
          overworldCooldown -= 1;
        } else {
          returnStuckFrames += 1;
        }
      } else {
        returnStuckFrames = 0;
        overworldCooldown = 0;
      }
      if (returnStuckFrames >= RETURN_STUCK_FRAMES) {
        anchor = { map: snap.map, x: snap.x, y: snap.y };
        returnStuckFrames = 0;
        dir = DIRS[dirIndex];
      } else {
        dir = steerSameMap(snap, anchor);
      }
    } else {
      returnStuckFrames = 0;
      if (overworldCooldown > 0) {
        overworldCooldown -= 1;
      } else {
        atAnchorFrames += 1;
      }
      if (atAnchorFrames >= 36) {
        atAnchorFrames = 0;
        dirIndex = (dirIndex + 1) % DIRS.length;
      }
      dir = DIRS[dirIndex];
    }

    lastPos = { map: snap.map, x: snap.x, y: snap.y };
    phase = 'moving';
    return {
      active: true,
      buttons: { ...NEUTRAL_BUTTONS, [dir]: true },
      stopReason: null,
      phase,
    };
  }

  function step(snap) {
    if (!active) {
      return {
        active: false,
        buttons: { ...NEUTRAL_BUTTONS },
        stopReason,
        phase: 'idle',
      };
    }

    // 1. Check for move-learning prompts before any button press.
    if (LEARN_PROMPT_RE.test(snap.menuBoxText || '')) {
      return stop('learning a move');
    }

    const maskPpUps = snap.maskPpUps ?? true;
    const party = snap.party || [];

    // 2. Blackout or trainer battle handling.
    if (snap.isInBattle === 0xff) {
      return stop('fainted');
    }
    if (snap.isInBattle === 2) {
      return stop('trainer battle');
    }

    // 3. Overworld / post-battle evolution cutscenes.
    if (snap.isInBattle === 0) {
      if (snap.inCutscene) {
        const activePulse = tickPulseAndCooldown();
        if (activePulse) return activePulse;
        return startPulse('a', 3, 12);
      }
      if (wasInBattle) {
        wasInBattle = false;
        battleMonReady = false;
        pulse = null;
        cooldown = 0;
        atAnchorFrames = 0;
        returnStuckFrames = 0;
        stuckFrames = 0;
        overworldCooldown = 30;
        if (travelMode === 'returning') {
          phase = 'returning';
          pathIdx = Math.min(pathIdx, trail.length - 1);
        } else if (travelMode === 'walking_back') {
          phase = 'walking_back';
        } else {
          phase = 'moving';
        }
      }

      if (phase === 'healing') {
        return stepHealing(snap, party);
      }
      if (phase === 'returning') {
        return stepTrail(snap, party, -1);
      }
      if (phase === 'walking_back') {
        return stepTrail(snap, party, 1);
      }
      return stepMoving(snap, party);
    }

    // 4. Wild battle (`isInBattle === 1`).
    if (!wasInBattle) {
      wasInBattle = true;
      battleMonReady = false;
      pulse = null;
      cooldown = 0;
      if (isValidOverworldCoord(snap)) {
        lastPos = { map: snap.map, x: snap.x, y: snap.y };
      }
    }

    if (
      !battleMonReady &&
      snap.battleMon.maxHp > 0 &&
      snap.battleMon.hp > 0 &&
      snap.battleMon.moves[0] !== 0
    ) {
      battleMonReady = true;
    }

    if (battleMonReady && snap.battleMon.hp === 0) {
      return stop('fainted');
    }

    phase = travelMode !== null ? 'fleeing' : 'fighting';

    const activePulse = tickPulseAndCooldown();
    if (activePulse) return activePulse;

    // Move Selection Menu.
    if (snap.hasTypeBox) {
      if (travelMode !== null) {
        return startPulse('b', 3, 10);
      }
      if (!battleMonReady) return neutral();
      const healReason = getHealTriggerReason(snap.battleMon, maskPpUps);
      if (healReason) {
        if (hasHealPath(anchor.map)) {
          beginFleeing('returning');
          return startPulse('b', 3, 10);
        }
        return stop(healReason);
      }
      const targetSlot = pickAttackSlot(snap.battleMon.moves, snap.battleMon.pp, { maskPpUps });
      if (snap.moveGrid) {
        const curSlot = (snap.moveCursor ?? 0) & 3;
        const curRow = (curSlot >> 1) & 1;
        const curCol = curSlot & 1;
        const tgtRow = (targetSlot >> 1) & 1;
        const tgtCol = targetSlot & 1;
        if (curRow > tgtRow) return startPulse('up', 3, 6);
        if (curCol > tgtCol) return startPulse('left', 3, 6);
        if (curRow < tgtRow) return startPulse('down', 3, 6);
        if (curCol < tgtCol) return startPulse('right', 3, 6);
        return startPulse('a', 3, 12);
      }
      if (!snap.cursorPos) return neutral();
      const currentSlot = snap.cursorPos.row - (snap.moveFirstRow ?? MOVE_FIRST_ROW);
      if (currentSlot < 0 || currentSlot > 3) return neutral();
      if (currentSlot < targetSlot) return startPulse('down', 3, 6);
      if (currentSlot > targetSlot) return startPulse('up', 3, 6);
      return startPulse('a', 3, 12);
    }

    // Main Battle Menu (FIGHT / PKMN / ITEM / RUN).
    if (snap.fightPos && snap.hasRun) {
      if (travelMode !== null) {
        return stepFleeMainMenu(snap);
      }
      if (!battleMonReady) return neutral();
      const healReason = getHealTriggerReason(snap.battleMon, maskPpUps);
      if (healReason) {
        if (hasHealPath(anchor.map)) {
          beginFleeing('returning');
          return stepFleeMainMenu(snap);
        }
        return stop(healReason);
      }
      if (!snap.cursorPos) return neutral();
      const targetRow = snap.fightPos.row;
      const targetCol = snap.fightPos.col - 1;
      if (snap.cursorPos.row > targetRow) return startPulse('up', 3, 6);
      if (snap.cursorPos.col > targetCol) return startPulse('left', 3, 6);
      if (snap.cursorPos.row === targetRow && snap.cursorPos.col === targetCol) {
        return startPulse('a', 3, 14);
      }
      return neutral();
    }

    // Battle intro, dialogue boxes, animations, EXP gain.
    return startPulse('a', 3, 8);
  }

  return {
    start,
    stop,
    step,
    observe,
    clearTrail,
    exportTrail,
    importTrail,
    getState: () => ({
      active,
      phase,
      stopReason,
      anchor,
      pokeCenterMap,
      pokeCenterName:
        pokeCenterMap !== null ? ALL_POKECENTER_CONFIGS[pokeCenterMap]?.name ?? null : null,
      inPokeCenter: wasInPokeCenter,
      hasHealPath: hasHealPath(active ? anchor?.map : prevOverworld?.map ?? anchor?.map),
      trailLength: trail.length,
      healSubphase,
    }),
  };
}
