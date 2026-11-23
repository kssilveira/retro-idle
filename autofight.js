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

// Non-damaging, flee, self-KO, or conditional-fail Gen 1 & Gen 2 move IDs.
export const NON_ATTACK_MOVES = new Set([
  14, 18, 28, 39, 43, 45, 46, 47, 48, 50, 54, 73, 74, 77, 78, 79, 81, 86, 92,
  95, 96, 97, 100, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113,
  114, 115, 116, 118, 119, 120, 133, 134, 135, 137, 138, 139, 142, 144, 147,
  148, 150, 151, 153, 156, 159, 160, 164,
  166, 169, 170, 171, 173, 174, 176, 178, 180, 182, 184, 186, 187, 191, 193,
  194, 195, 197, 199, 201, 203, 204, 206, 207, 208, 212, 213, 214, 215, 219,
  220, 226, 227, 230, 234, 235, 236, 240, 241, 243, 244,
]);

const LEARN_PROMPT_RE = /\blearn|trying to|Delete an|forgotten/;
const DIRS = ['right', 'left', 'up', 'down'];
const TILE_CURSOR = 0xed;
const MOVE_FIRST_ROW = 13;

export const POKEMON_RED_BLUE_MEM = Object.freeze({
  facing: 0xc109,
  tileMap: 0xc3a0,
  enemyHp: 0xcfe6,
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
  movementFlags: 0xd736,
});

export const POKEMON_YELLOW_MEM = Object.freeze({
  facing: 0xc109,
  tileMap: 0xc3a0,
  enemyHp: 0xcfe5,
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
  movementFlags: 0xd735,
});

export const POKEMON_CRYSTAL_MEM = Object.freeze({
  tileMap: 0xc4a0,          // WRAM0: 20x18 tilemap
  battleMon: 0xc62c,        // WRAM0: battle_struct (0x20 bytes)
  curMapTileset: 0xd199,    // WRAM1: wMapTileset (TILESET_POKECENTER = 7)
  curMapHeight: 0xd19e,     // WRAM1: wMapHeight (in blocks; *2 = tiles)
  curMapWidth: 0xd19f,      // WRAM1: wMapWidth (in blocks; *2 = tiles)
  enemyMon: 0xd206,         // WRAM1: wEnemyMon battle_struct (0x20 bytes)
  battleMode: 0xd22d,       // WRAM1: wBattleMode (0=overworld, 1=wild, 2=trainer)
  battleType: 0xd230,       // WRAM1: wBattleType (3=BATTLETYPE_TUTORIAL)
  playerDirection: 0xd4de,  // WRAM1: wPlayerStruct + 0x08 (0=down, 4=up, 8=left, 12=right)
  playerStepType: 0xd4df,   // WRAM1: wPlayerStruct + 0x09 (0x09 = STEP_TYPE_PLAYER_JUMP)
  mapGroup: 0xdcb5,         // WRAM1: wMapGroup (1..26)
  mapNumber: 0xdcb6,        // WRAM1: wMapNumber
  yCoord: 0xdcb7,           // WRAM1: wYCoord
  xCoord: 0xdcb8,           // WRAM1: wXCoord
  partyCount: 0xdcd7,       // WRAM1: wPartyCount (0..6)
  partySpecies: 0xdcd8,     // WRAM1: wPartySpecies (6 bytes; 0xFD = EGG)
  partyMon1: 0xdcdf,        // WRAM1: wPartyMon1 (party_struct, stride 0x30)
});

const CRYSTAL_EGG_SPECIES = 0xfd;
const CRYSTAL_STEP_TYPE_PLAYER_JUMP = 0x09;
const CRYSTAL_BATTLETYPE_TUTORIAL = 0x03;

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

const ALL_POKECENTER_CONFIGS = Object.freeze({
  ...POKECENTER_CONFIGS,
  ...CRYSTAL_POKECENTER_CONFIGS,
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

const ONE_WAY_STUCK_FRAMES = 45;
const BLOCKED_STUCK_FRAMES = 240;
const RETURN_STUCK_FRAMES = 150;
const HEAL_STALL_FRAMES = 1800;
const RECOVER_STALL_FRAMES = 1800;
const RECOVER_WRONG_MAP_GRACE_FRAMES = 180;
const RECOVER_SAME_ORIGIN_GRACE_FRAMES = 30;
const RECOVER_NO_ATTACK_PP_GRACE_FRAMES = 60;
const BLACKOUT_SPAWN_MAX_DIST = 4;
const MAX_TRAIL_LENGTH = 2000;
const WARP_SNAP_GRACE_FRAMES = 60;
const MOVEMENT_ONE_WAY_MASK = 0xc0;
const OUT_OF_PP_MISSING_POKECENTER_REASON =
  'out of PP (missing Heal Center path — visit a Heal Center first)';
const FAINTED_MISSING_POKECENTER_REASON =
  'fainted (missing Heal Center path — visit a Heal Center first)';
const FAINTED_WRONG_HEAL_CENTER_REASON =
  'fainted (blacked out to a different location — heal at your chosen Heal Center first)';
const FAINTED_STALL_REASON = 'fainted recovery stalled';

export function isPokeCenterMap(mapId) {
  return Object.hasOwn(ALL_POKECENTER_CONFIGS, mapId);
}

export function isGen2Shiny(dv0, dv1) {
  return (dv0 & 0x2f) === 0x2a && (dv1 & 0xff) === 0xaa;
}

export function pickAttackSlot(moves, pp) {
  for (let i = 0; i < 4; i++) {
    const moveId = moves[i] | 0;
    const remPp = (pp[i] | 0) & 0x3f;
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
    movementFlags: r(mem.movementFlags),
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

  let partyCursorRow = null;
  for (let row = 0; row <= 11; row++) {
    if (r(tileMapAddr + row * 20) === TILE_CURSOR) {
      partyCursorRow = row;
      break;
    }
  }

  let switchPos = null;
  for (let row = 10; row <= 17; row++) {
    const rowText = row >= 12 ? menuBoxRows[row - 12] : readTileRow(row);
    const col = rowText.indexOf('SWITCH');
    if (col !== -1) {
      switchPos = { row, col };
      break;
    }
  }

  let switchCursorPos = null;
  if (switchPos) {
    const minCol = Math.max(0, switchPos.col - 2);
    for (let row = 10; row <= 17 && !switchCursorPos; row++) {
      const rowAddr = tileMapAddr + row * 20;
      for (let col = minCol; col < 20; col++) {
        if (r(rowAddr + col) === TILE_CURSOR) {
          switchCursorPos = { row, col };
          break;
        }
      }
    }
    if (!switchCursorPos) {
      for (let row = 10; row <= 17 && !switchCursorPos; row++) {
        const rowAddr = tileMapAddr + row * 20;
        for (let col = 0; col < minCol; col++) {
          if (r(rowAddr + col) === TILE_CURSOR) {
            switchCursorPos = { row, col };
            break;
          }
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
    partyCursorRow,
    switchPos,
    switchCursorPos,
  };
}

export function readPokemonGen1Snapshot(readMem, mem = POKEMON_RED_BLUE_MEM) {
  const r = (addr) => readMem(addr) & 0xff;
  const r16 = (addr) => (r(addr) << 8) | r(addr + 1);

  const isInBattle = r(mem.isInBattle);
  const map = r(mem.curMap);
  const y = r(mem.yCoord);
  const x = r(mem.xCoord);
  const tileset = r(mem.curMapTileset);
  const mapHeight = r(mem.curMapHeight) * 2;
  const mapWidth = r(mem.curMapWidth) * 2;
  const facing = r(mem.facing);
  const movementFlags = r(mem.movementFlags);

  const partyCount = Math.min(r(mem.partyCount), 6);
  const party = [];
  for (let i = 0; i < partyCount; i++) {
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

  const enemyHp = r16(mem.enemyHp);
  const tileMenus = readBattleTilemap(r, mem.tileMap);

  return {
    isInBattle,
    map,
    y,
    x,
    tileset,
    mapHeight,
    mapWidth,
    facing,
    movementFlags,
    partyCount,
    party,
    battleMon,
    enemyHp,
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
    movementFlags: r(mem.playerStepType) === CRYSTAL_STEP_TYPE_PLAYER_JUMP ? 0x40 : 0,
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

  const eBase = mem.enemyMon;
  const battleType = r(mem.battleType);
  const enemySpecies = r(eBase);
  const enemyDv0 = r(eBase + 0x06);
  const enemyDv1 = r(eBase + 0x07);
  const enemyLevel = r(eBase + 0x0d);
  const enemyHp = r16(eBase + 0x10);
  const enemyMaxHp = r16(eBase + 0x12);
  const enemyReady =
    pos.isInBattle === 1 &&
    battleType !== CRYSTAL_BATTLETYPE_TUTORIAL &&
    enemySpecies >= 1 &&
    enemySpecies <= 251 &&
    enemyMaxHp > 0 &&
    enemyHp > 0;
  const enemyMon = {
    species: enemySpecies,
    level: enemyLevel,
    hp: enemyHp,
    maxHp: enemyMaxHp,
    dvs: [enemyDv0, enemyDv1],
    shiny: enemyReady && isGen2Shiny(enemyDv0, enemyDv1),
  };

  const tileMenus = readBattleTilemap(r, mem.tileMap, { matchDisabled: true });

  return {
    ...pos,
    battleType,
    party,
    battleMon,
    enemyMon,
    enemyHp,
    ...tileMenus,
  };
}

export function readPokemonRedOverworldPos(readMem) {
  return readPokemonGen1OverworldPos(readMem, POKEMON_RED_BLUE_MEM);
}

export function readPokemonRedSnapshot(readMem) {
  return readPokemonGen1Snapshot(readMem, POKEMON_RED_BLUE_MEM);
}

export function readPokemonYellowOverworldPos(readMem) {
  return readPokemonGen1OverworldPos(readMem, POKEMON_YELLOW_MEM);
}

export function readPokemonYellowSnapshot(readMem) {
  return readPokemonGen1Snapshot(readMem, POKEMON_YELLOW_MEM);
}

const POKEMON_RED_PROFILE = Object.freeze({
  id: 'pokemon-red-blue',
  name: 'Pokémon Red',
  mem: POKEMON_RED_BLUE_MEM,
  readOverworldPos: readPokemonRedOverworldPos,
  readSnapshot: readPokemonRedSnapshot,
});

const POKEMON_BLUE_PROFILE = Object.freeze({
  id: 'pokemon-red-blue',
  name: 'Pokémon Blue',
  mem: POKEMON_RED_BLUE_MEM,
  readOverworldPos: readPokemonRedOverworldPos,
  readSnapshot: readPokemonRedSnapshot,
});

const POKEMON_YELLOW_PROFILE = Object.freeze({
  id: 'pokemon-yellow',
  name: 'Pokémon Yellow',
  mem: POKEMON_YELLOW_MEM,
  readOverworldPos: readPokemonYellowOverworldPos,
  readSnapshot: readPokemonYellowSnapshot,
});

const POKEMON_CRYSTAL_PROFILE = Object.freeze({
  id: 'pokemon-crystal',
  name: 'Pokémon Crystal',
  mem: POKEMON_CRYSTAL_MEM,
  pokeCenterConfigs: CRYSTAL_POKECENTER_CONFIGS,
  supportsShinyStop: true,
  readOverworldPos: readPokemonCrystalOverworldPos,
  readSnapshot: readPokemonCrystalSnapshot,
});

const AUTO_FIGHT_PROFILES = Object.freeze({
  'POKEMON RED': POKEMON_RED_PROFILE,
  'POKEMON BLUE': POKEMON_BLUE_PROFILE,
  'POKEMON YELLOW': POKEMON_YELLOW_PROFILE,
  'PM_CRYSTAL': POKEMON_CRYSTAL_PROFILE,
  'POKEMON CRYSTAL': POKEMON_CRYSTAL_PROFILE,
});

export function getAutoFightProfile(title) {
  const normalized = String(title || '').trim().toUpperCase();
  return AUTO_FIGHT_PROFILES[normalized] ?? null;
}

export function isSupportedAutoFightTitle(title) {
  return getAutoFightProfile(title) !== null;
}

export function isPokemonYellowTitle(title) {
  return getAutoFightProfile(title)?.id === 'pokemon-yellow';
}

export function isPokemonRedBlueTitle(title) {
  return getAutoFightProfile(title)?.id === 'pokemon-red-blue';
}

export function isPokemonCrystalTitle(title) {
  return getAutoFightProfile(title)?.id === 'pokemon-crystal';
}

function sumPartyPp(party) {
  let total = 0;
  for (const mon of party) {
    for (let i = 0; i < 4; i++) {
      total += (mon.pp[i] | 0) & 0x3f;
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

function hasNonEggPartyMon(party) {
  return party.some((m) => !m.isEgg);
}

function countNonEggPartyMons(party) {
  let count = 0;
  for (const m of party) {
    if (!m.isEgg) count += 1;
  }
  return count;
}

function findLivingPartyIndex(party) {
  return party.findIndex((m) => !m.isEgg && m.hp > 0);
}

function isPartyAllFullHp(party) {
  return (
    hasNonEggPartyMon(party) &&
    party.every((m) => m.isEgg || (m.maxHp > 0 && m.hp === m.maxHp))
  );
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
  if (!snap || snap.x === 0xff || snap.y === 0xff) return false;
  if (snap.mapWidth > 0 && snap.x >= snap.mapWidth) return false;
  if (snap.mapHeight > 0 && snap.y >= snap.mapHeight) return false;
  return true;
}

export function createAutoFight() {
  let active = false;
  let phase = 'idle';
  let stopReason = null;
  let anchor = null;
  let initialParty = [];
  let wasInBattle = false;
  let battleMonReady = false;
  let encounterChecked = false;
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
  let pendingStopReconcileFrames = 0;
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
  let recoverFrames = 0;
  let recoverWrongLocFrames = 0;
  let recoverSameOriginFrames = 0;
  let recoverNoAttackFrames = 0;
  let recoverOrigin = null;

  function hasHealPath(mapId) {
    return pokeCenterMap !== null && trail.length > 0 && trail[trail.length - 1].map === mapId;
  }

  function clearTrail() {
    pokeCenterMap = null;
    pokeCenterTileset = null;
    trail = [];
    wasInPokeCenter = false;
    pendingWarpSnapFrames = 0;
    pendingStopReconcileFrames = 0;
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
        oneWay: Boolean(n.oneWay),
      });
    }
    pokeCenterMap = data.pokeCenterMap;
    trail = sanitized;
    wasInPokeCenter = false;
    prevOverworld = null;
    return true;
  }

  function reconcileTrailToPos(pos) {
    if (pokeCenterMap === null || trail.length === 0 || !isValidOverworldCoord(pos)) {
      return false;
    }
    const facingDir = dirFromFacing(pos.facing);
    const exactIdx = trail.findIndex((n) => n.map === pos.map && n.x === pos.x && n.y === pos.y);
    if (exactIdx !== -1) {
      trail.length = exactIdx + 1;
      pendingWarpSnapFrames = 0;
      warpStartTileset = null;
      prevOverworld = {
        map: pos.map,
        x: pos.x,
        y: pos.y,
        facingDir: facingDir || prevOverworld?.facingDir || null,
      };
      return true;
    }

    const refIdx = pathIdx >= 0 && pathIdx < trail.length ? pathIdx : trail.length - 1;
    let bestIdx = -1;
    let bestDist = 3;
    let bestRefDelta = Infinity;
    for (let i = 0; i < trail.length; i++) {
      const n = trail[i];
      if (n.map !== pos.map) continue;
      const dist = Math.abs(pos.x - n.x) + Math.abs(pos.y - n.y);
      if (dist > 2) continue;
      const refDelta = Math.abs(i - refIdx);
      if (dist < bestDist || (dist === bestDist && refDelta < bestRefDelta)) {
        bestIdx = i;
        bestDist = dist;
        bestRefDelta = refDelta;
      }
    }
    if (bestIdx === -1) {
      return false;
    }

    const prevNode = trail[bestIdx];
    const oneWay =
      Boolean((pos.movementFlags || 0) & MOVEMENT_ONE_WAY_MASK) || bestDist === 2;
    trail.length = bestIdx + 1;
    trail.push({
      map: pos.map,
      x: pos.x,
      y: pos.y,
      enterDir: null,
      exitDir: null,
      oneWay,
    });
    if (trail.length > MAX_TRAIL_LENGTH) {
      pokeCenterMap = null;
      trail = [];
    }
    pendingWarpSnapFrames = 0;
    warpStartTileset = null;
    prevOverworld = {
      map: pos.map,
      x: pos.x,
      y: pos.y,
      facingDir: facingDir || dirFromDelta(prevNode, pos) || prevOverworld?.facingDir || null,
    };
    return true;
  }

  function recordMovingStep(snap) {
    if (!isValidOverworldCoord(snap)) {
      return;
    }
    const facingDir = dirFromFacing(snap.facing);
    if (!hasHealPath(snap.map) || isPokeCenterMap(snap.map)) {
      prevOverworld = {
        map: snap.map,
        x: snap.x,
        y: snap.y,
        facingDir: facingDir || prevOverworld?.facingDir || null,
      };
      return;
    }

    const last = trail[trail.length - 1];
    if (snap.map === last.map && snap.x === last.x && snap.y === last.y) {
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
    } else {
      const dist = Math.abs(snap.x - last.x) + Math.abs(snap.y - last.y);
      if (dist <= 2) {
        const oneWay = Boolean((snap.movementFlags || 0) & MOVEMENT_ONE_WAY_MASK) || dist === 2;
        trail.push({
          map: snap.map,
          x: snap.x,
          y: snap.y,
          enterDir: null,
          exitDir: null,
          oneWay,
        });
        if (trail.length > MAX_TRAIL_LENGTH) {
          pokeCenterMap = null;
          trail = [];
        }
      }
    }

    prevOverworld = {
      map: snap.map,
      x: snap.x,
      y: snap.y,
      facingDir: facingDir || dirFromDelta(last, snap) || prevOverworld?.facingDir || null,
    };
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
      pendingStopReconcileFrames = 0;
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
      trail = [{ map: snap.map, x: snap.x, y: snap.y, enterDir, exitDir, oneWay: false }];
      pendingWarpSnapFrames = WARP_SNAP_GRACE_FRAMES;
      pendingStopReconcileFrames = 0;
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
      pendingStopReconcileFrames = 0;
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

    if (pendingStopReconcileFrames > 0) {
      if (reconcileTrailToPos(snap)) {
        pendingStopReconcileFrames = 0;
        return;
      }
      pendingStopReconcileFrames -= 1;
      if (pendingStopReconcileFrames > 0) {
        return;
      }
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

    const oneWay =
      Boolean((snap.movementFlags || 0) & MOVEMENT_ONE_WAY_MASK) ||
      (snap.map === last.map && Math.abs(snap.x - last.x) + Math.abs(snap.y - last.y) === 2);

    if (snap.map !== last.map) {
      const enterDir = prevOverworld?.facingDir || facingDir || 'up';
      const exitDir = OPPOSITE_DIR[enterDir] || 'down';
      trail.push({ map: snap.map, x: snap.x, y: snap.y, enterDir, exitDir, oneWay });
      pendingWarpSnapFrames = WARP_SNAP_GRACE_FRAMES;
      warpStartTileset = snap.tileset ?? null;
    } else {
      trail.push({ map: snap.map, x: snap.x, y: snap.y, enterDir: null, exitDir: null, oneWay });
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
    const prevTravelMode = travelMode;

    active = false;
    stopReason = reason;
    phase = 'idle';
    pulse = null;
    cooldown = 0;
    travelMode = null;
    healSubphase = null;
    stuckFrames = 0;
    healFrames = 0;
    recoverFrames = 0;
    recoverWrongLocFrames = 0;
    recoverSameOriginFrames = 0;
    recoverNoAttackFrames = 0;
    recoverOrigin = null;

    if (wasActive && pokeCenterMap !== null) {
      if (
        prevPhase === 'healing' ||
        (prevPhase === 'recovering' && isPokeCenterMap(lastPos.map))
      ) {
        wasInPokeCenter = true;
        pokeCenterTileset = ALL_POKECENTER_CONFIGS[pokeCenterMap]?.tileset ?? pokeCenterTileset;
        trail = [];
        pendingWarpSnapFrames = 0;
        warpStartTileset = null;
        pendingStopReconcileFrames = 0;
        prevOverworld = null;
      } else if (
        prevPhase === 'returning' ||
        prevPhase === 'walking_back' ||
        prevPhase === 'recovering' ||
        prevTravelMode !== null
      ) {
        if (reconcileTrailToPos(lastPos)) {
          pendingStopReconcileFrames = 0;
        } else if (trail.length > 0) {
          pendingStopReconcileFrames = WARP_SNAP_GRACE_FRAMES;
        }
      }
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
    initialParty = (snap.party || []).map((m) => ({
      species: m.species,
      isEgg: Boolean(m.isEgg),
      moves: [...m.moves],
    }));
    wasInBattle = snap.isInBattle === 1;
    encounterChecked = false;
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
    pendingStopReconcileFrames = 0;
    if (
      pokeCenterMap !== null &&
      trail.length > 0 &&
      !isPokeCenterMap(snap.map) &&
      isValidOverworldCoord(snap)
    ) {
      reconcileTrailToPos(snap);
    }
    travelMode = null;
    pathIdx = -1;
    stuckFrames = 0;
    healSubphase = null;
    healStartTotalPp = 0;
    healStartTotalHp = 0;
    healFrames = 0;
    closeCycleFrame = 0;
    recoverFrames = 0;
    recoverWrongLocFrames = 0;
    recoverSameOriginFrames = 0;
    recoverNoAttackFrames = 0;
    recoverOrigin = null;
  }

  function findBlackoutWalkBackStart(snap) {
    if (trail.length === 0 || snap.map !== trail[0].map || !isValidOverworldCoord(snap)) {
      return null;
    }
    const distToDoor = Math.abs(snap.x - trail[0].x) + Math.abs(snap.y - trail[0].y);
    if (distToDoor > BLACKOUT_SPAWN_MAX_DIST) {
      return null;
    }

    let segEnd = 0;
    while (segEnd < trail.length && trail[segEnd].map === trail[0].map) {
      segEnd += 1;
    }

    for (let k = 0; k < segEnd; k++) {
      if (trail[k].x === snap.x && trail[k].y === snap.y) {
        return k + 1;
      }
    }

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < segEnd; i++) {
      const dist = Math.abs(snap.x - trail[i].x) + Math.abs(snap.y - trail[i].y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    // Avoid walking back into the Heal Center door when blackout spawns adjacent to it.
    if (
      bestIdx === 0 &&
      segEnd > 1 &&
      steerSameMap(snap, trail[0]) === (trail[0].exitDir || 'up') &&
      Math.abs(snap.x - trail[1].x) + Math.abs(snap.y - trail[1].y) <= BLACKOUT_SPAWN_MAX_DIST
    ) {
      bestIdx = 1;
    }

    return bestIdx;
  }

  function beginRecovering(snap) {
    phase = 'recovering';
    travelMode = null;
    healSubphase = null;
    wasInBattle = snap.isInBattle === 1;
    battleMonReady = false;
    encounterChecked = false;
    pulse = null;
    cooldown = 0;
    stuckFrames = 0;
    overworldCooldown = 0;
    recoverFrames = 0;
    recoverWrongLocFrames = 0;
    recoverSameOriginFrames = 0;
    recoverNoAttackFrames = 0;
    recoverOrigin = isValidOverworldCoord(snap)
      ? { map: snap.map, x: snap.x, y: snap.y }
      : lastPos.map >= 0
        ? { ...lastPos }
        : null;
    if (isValidOverworldCoord(snap)) {
      lastPos = { map: snap.map, x: snap.x, y: snap.y };
    }
  }

  function handleOverworldFainted(snap, party) {
    if (!hasNonEggPartyMon(party)) {
      return stop('fainted');
    }
    if (hasHealPath(anchor.map)) {
      beginRecovering(snap);
      return stepRecovering(snap, party);
    }
    return stop(FAINTED_MISSING_POKECENTER_REASON);
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

  function beginHealing(snap, party, nextSubphase = 'to_nurse') {
    wasInBattle = false;
    battleMonReady = false;
    encounterChecked = false;
    phase = 'healing';
    travelMode = null;
    healSubphase = nextSubphase;
    healStartTotalPp = sumPartyPp(party);
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
    const lead = party.find((m) => !m.isEgg && m.hp > 0);
    if (!lead) {
      return handleOverworldFainted(snap, party);
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
      if (snap.facing != null && snap.facing !== 0x04) {
        return startPulse('up', 3, 6);
      }
      healSubphase = 'talking_nurse';
      healStartTotalPp = sumPartyPp(party);
      healStartTotalHp = sumPartyHp(party);
      healFrames = 0;
      return startPulse('a', 3, 10);
    }

    if (healSubphase === 'talking_nurse') {
      const allFullHp = isPartyAllFullHp(party);
      const hasAttackPp = pickAttackSlot(lead.moves, lead.pp) !== -1;
      const curPp = sumPartyPp(party);
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
        return stepWalkingBack(snap, party);
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

  function stepReturning(snap, party) {
    const lead = party.find((m) => !m.isEgg && m.hp > 0);
    if (!lead) {
      return handleOverworldFainted(snap, party);
    }

    if (snap.map === pokeCenterMap) {
      return beginHealing(snap, party, 'to_nurse');
    }

    if (!trail.some((n) => n.map === snap.map)) {
      return stop('map changed');
    }

    if (snap.x === 0xff || snap.y === 0xff) {
      phase = 'returning';
      return {
        active: true,
        buttons: { ...NEUTRAL_BUTTONS, [lastTravelDir]: true },
        stopReason: null,
        phase,
      };
    }

    for (let k = Math.min(pathIdx, trail.length - 1); k >= 0; k--) {
      if (trail[k].map === snap.map && trail[k].x === snap.x && trail[k].y === snap.y) {
        pathIdx = k - 1;
        break;
      }
    }

    let dir;
    if (pathIdx < 0) {
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
        const fromNode = pathIdx + 1 < trail.length ? trail[pathIdx + 1] : null;
        if (fromNode && fromNode.map === snap.map && (snap.x !== fromNode.x || snap.y !== fromNode.y)) {
          dir = steerSameMap(snap, fromNode);
        } else {
          dir = fromNode?.exitDir || 'up';
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

    const currentNode = pathIdx + 1 < trail.length ? trail[pathIdx + 1] : null;
    const targetNode = pathIdx >= 0 ? trail[pathIdx] : null;
    const isOneWay = Boolean(currentNode?.oneWay || targetNode?.oneWay);

    if (isOneWay && stuckFrames >= ONE_WAY_STUCK_FRAMES) {
      return stop('blocked by one-way path — use a different path from the Heal Center next time');
    }
    if (stuckFrames >= BLOCKED_STUCK_FRAMES) {
      return stop('path blocked (possible one-way path or obstacle) — use a different path from the Heal Center next time');
    }

    lastPos = { map: snap.map, x: snap.x, y: snap.y };
    lastTravelDir = dir;
    phase = 'returning';
    return {
      active: true,
      buttons: { ...NEUTRAL_BUTTONS, [dir]: true },
      stopReason: null,
      phase,
    };
  }

  function stepWalkingBack(snap, party) {
    const lead = party.find((m) => !m.isEgg && m.hp > 0);
    if (!lead) {
      return handleOverworldFainted(snap, party);
    }

    if (!trail.some((n) => n.map === snap.map)) {
      return stop('map changed');
    }

    if (snap.x === 0xff || snap.y === 0xff) {
      phase = 'walking_back';
      return {
        active: true,
        buttons: { ...NEUTRAL_BUTTONS, [lastTravelDir]: true },
        stopReason: null,
        phase,
      };
    }

    for (let k = Math.max(0, pathIdx); k < trail.length; k++) {
      if (trail[k].map === snap.map && trail[k].x === snap.x && trail[k].y === snap.y) {
        pathIdx = k + 1;
        break;
      }
    }

    if (pathIdx >= trail.length) {
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

    const target = trail[pathIdx];
    let dir;
    if (target.map === snap.map) {
      dir = steerSameMap(snap, target);
    } else {
      const fromNode = pathIdx > 0 ? trail[pathIdx - 1] : null;
      if (fromNode && fromNode.map === snap.map && (snap.x !== fromNode.x || snap.y !== fromNode.y)) {
        dir = steerSameMap(snap, fromNode);
      } else {
        dir = target.enterDir || 'up';
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
      return stop('path blocked returning to grind spot — use a different path from the Heal Center next time');
    }

    lastPos = { map: snap.map, x: snap.x, y: snap.y };
    lastTravelDir = dir;
    phase = 'walking_back';
    return {
      active: true,
      buttons: { ...NEUTRAL_BUTTONS, [dir]: true },
      stopReason: null,
      phase,
    };
  }

  function stepMoving(snap, party) {
    const lead = party.find((m) => !m.isEgg && m.hp > 0);
    if (!lead) {
      return handleOverworldFainted(snap, party);
    }
    if (snap.map === anchor.map) {
      recordMovingStep(snap);
    }
    if (pickAttackSlot(lead.moves, lead.pp) === -1) {
      if (hasHealPath(anchor.map)) {
        beginReturning(snap);
        return stepReturning(snap, party);
      }
      return stop(OUT_OF_PP_MISSING_POKECENTER_REASON);
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

  function stepRecovering(snap, party) {
    if (!hasHealPath(anchor.map)) {
      return stop(FAINTED_MISSING_POKECENTER_REASON);
    }
    recoverFrames += 1;
    if (recoverFrames >= RECOVER_STALL_FRAMES) {
      return stop(FAINTED_STALL_REASON);
    }
    if (isValidOverworldCoord(snap)) {
      lastPos = { map: snap.map, x: snap.x, y: snap.y };
    }

    if (snap.isInBattle === 0) {
      const lead = party.find((m) => !m.isEgg && m.hp > 0);
      const allFullHp = isPartyAllFullHp(party);
      const hasAttackPp = Boolean(lead && pickAttackSlot(lead.moves, lead.pp) !== -1);
      const cfg = ALL_POKECENTER_CONFIGS[pokeCenterMap];
      const doorNode = trail[0];

      if (snap.map === pokeCenterMap) {
        recoverWrongLocFrames = 0;
        if (snap.tileset !== undefined && cfg && snap.tileset !== cfg.tileset) {
          return neutral();
        }
        if (lead && allFullHp && hasAttackPp) {
          return beginHealing(snap, party, cfg && snap.y > cfg.standY ? 'exiting' : 'closing_dialogue');
        }
        if (lead && allFullHp && !hasAttackPp) {
          recoverNoAttackFrames += 1;
          if (recoverNoAttackFrames >= RECOVER_NO_ATTACK_PP_GRACE_FRAMES) {
            return beginHealing(snap, party, 'to_nurse');
          }
          return neutral();
        }
        if (lead && !allFullHp) {
          return beginHealing(snap, party, 'to_nurse');
        }
      } else if (
        doorNode &&
        snap.map === doorNode.map &&
        lead &&
        allFullHp &&
        (snap.tileset === undefined || pokeCenterTileset === null || snap.tileset !== pokeCenterTileset) &&
        isValidOverworldCoord(snap)
      ) {
        const startIdx = findBlackoutWalkBackStart(snap);
        if (startIdx !== null) {
          recoverWrongLocFrames = 0;
          if (
            recoverOrigin &&
            recoverOrigin.map === snap.map &&
            recoverOrigin.x === snap.x &&
            recoverOrigin.y === snap.y &&
            (snap.x !== doorNode.x || snap.y !== doorNode.y)
          ) {
            if (recoverSameOriginFrames < RECOVER_SAME_ORIGIN_GRACE_FRAMES) {
              recoverSameOriginFrames += 1;
              return neutral();
            }
          }
          if (!hasAttackPp) {
            recoverNoAttackFrames += 1;
            if (recoverNoAttackFrames >= RECOVER_NO_ATTACK_PP_GRACE_FRAMES) {
              return stop('out of PP');
            }
            return neutral();
          }
          wasInBattle = false;
          battleMonReady = false;
          encounterChecked = false;
          phase = 'walking_back';
          travelMode = 'walking_back';
          pathIdx = startIdx;
          stuckFrames = 0;
          overworldCooldown = 30;
          healSubphase = null;
          pulse = null;
          cooldown = 0;
          lastPos = { map: snap.map, x: snap.x, y: snap.y };
          return stepWalkingBack(snap, party);
        }
      }

      if (lead && allFullHp && snap.map !== pokeCenterMap) {
        recoverWrongLocFrames += 1;
        if (recoverWrongLocFrames >= RECOVER_WRONG_MAP_GRACE_FRAMES) {
          clearTrail();
          return stop(FAINTED_WRONG_HEAL_CENTER_REASON);
        }
        return neutral();
      }
    }

    const activePulse = tickPulseAndCooldown();
    if (activePulse) return activePulse;

    if (snap.isInBattle === 0xff) {
      return (snap.menuBoxText || '').trim().length > 0 ? startPulse('a', 3, 8) : neutral();
    }
    if (snap.isInBattle === 0 && snap.map === pokeCenterMap) {
      return startPulse('b', 3, 8);
    }
    return startPulse('a', 3, 8);
  }

  function stepFaintSwitch(snap, livingIdx, partyLen) {
    phase = travelMode !== null ? 'fleeing' : 'fighting';
    const activePulse = tickPulseAndCooldown();
    if (activePulse) return activePulse;

    if (snap.switchPos) {
      const cur = snap.switchCursorPos || snap.cursorPos;
      if (!cur) return neutral();
      if (cur.row < snap.switchPos.row) return startPulse('down', 3, 6);
      if (cur.row > snap.switchPos.row) return startPulse('up', 3, 6);
      return startPulse('a', 3, 12);
    }

    if (snap.partyCursorRow !== null && snap.partyCursorRow !== undefined) {
      const currentSlot = snap.partyCursorRow >> 1;
      if (currentSlot < 0 || currentSlot >= partyLen) return neutral();
      if (currentSlot < livingIdx) return startPulse('down', 3, 6);
      if (currentSlot > livingIdx) return startPulse('up', 3, 6);
      return startPulse('a', 3, 12);
    }

    return startPulse('a', 3, 8);
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

    // 1. Check for move-learning prompts or newly learned moves before any button press.
    if (LEARN_PROMPT_RE.test(snap.menuBoxText || '')) {
      return stop('learning a move');
    }
    const party = snap.party || [];
    for (let i = 0; i < initialParty.length && i < party.length; i++) {
      const cur = party[i];
      const init = initialParty[i];
      if (!cur.isEgg && !init.isEgg && cur.species !== 0 && cur.species === init.species) {
        for (let k = 0; k < 4; k++) {
          if (cur.moves[k] !== init.moves[k]) {
            return stop('learning a move');
          }
        }
      }
    }

    // 2. Blackout or trainer battle handling.
    if (snap.isInBattle === 0xff) {
      if (phase === 'recovering') {
        return stepRecovering(snap, party);
      }
      if (hasHealPath(anchor.map) && hasNonEggPartyMon(party)) {
        beginRecovering(snap);
        return stepRecovering(snap, party);
      }
      return stop(hasNonEggPartyMon(party) ? FAINTED_MISSING_POKECENTER_REASON : 'fainted');
    }
    if (snap.isInBattle === 2) {
      return stop('trainer battle');
    }

    if (phase === 'recovering') {
      return stepRecovering(snap, party);
    }

    // 3. Overworld phases.
    if (snap.isInBattle === 0) {
      if (wasInBattle) {
        wasInBattle = false;
        battleMonReady = false;
        encounterChecked = false;
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
        return stepReturning(snap, party);
      }
      if (phase === 'walking_back') {
        return stepWalkingBack(snap, party);
      }
      return stepMoving(snap, party);
    }

    // 4. Wild battle (`isInBattle === 1`).
    if (!wasInBattle) {
      wasInBattle = true;
      battleMonReady = false;
      encounterChecked = false;
      pulse = null;
      cooldown = 0;
      if (isValidOverworldCoord(snap)) {
        lastPos = { map: snap.map, x: snap.x, y: snap.y };
      }
    }

    if (
      !encounterChecked &&
      snap.enemyMon &&
      snap.enemyMon.species > 0 &&
      snap.enemyMon.maxHp > 0 &&
      snap.enemyMon.hp > 0
    ) {
      encounterChecked = true;
      if (snap.enemyMon.shiny) {
        return stop('shiny encounter');
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
      if (!hasHealPath(anchor.map)) {
        return stop(hasNonEggPartyMon(party) ? FAINTED_MISSING_POKECENTER_REASON : 'fainted');
      }
      const livingIdx = findLivingPartyIndex(party);
      const nonEggCount = countNonEggPartyMons(party);
      if (livingIdx === -1 || nonEggCount <= 1) {
        beginRecovering(snap);
        return stepRecovering(snap, party);
      }
      return stepFaintSwitch(snap, livingIdx, party.length);
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
      const targetSlot = pickAttackSlot(snap.battleMon.moves, snap.battleMon.pp);
      if (targetSlot === -1) {
        if (hasHealPath(anchor.map)) {
          beginFleeing('returning');
          return startPulse('b', 3, 10);
        }
        return stop(OUT_OF_PP_MISSING_POKECENTER_REASON);
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
      if (pickAttackSlot(snap.battleMon.moves, snap.battleMon.pp) === -1) {
        if (hasHealPath(anchor.map)) {
          beginFleeing('returning');
          return stepFleeMainMenu(snap);
        }
        return stop(OUT_OF_PP_MISSING_POKECENTER_REASON);
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
