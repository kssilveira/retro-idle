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

// Non-damaging, flee, self-KO, or conditional-fail Gen 1 move IDs.
export const NON_ATTACK_MOVES = new Set([
  14, 18, 28, 39, 43, 45, 46, 47, 48, 50, 54, 73, 74, 77, 78, 79, 81, 86, 92,
  95, 96, 97, 100, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113,
  114, 115, 116, 118, 119, 120, 133, 134, 135, 137, 138, 139, 142, 144, 147,
  148, 150, 151, 153, 156, 159, 160, 164,
]);

const LEARN_PROMPT_RE = /\blearn|trying to|Delete an|forgotten/;
const DIRS = ['right', 'left', 'up', 'down'];
const TILEMAP_ADDR = 0xc3a0;
const TILE_CURSOR = 0xed;
const MOVE_FIRST_ROW = 13;

const STANDARD_POKECENTER_CONFIG = Object.freeze({
  standX: 3,
  standY: 3,
  exitX: 3,
  exitY: 7,
});

export const POKECENTER_CONFIGS = Object.freeze({
  0x29: STANDARD_POKECENTER_CONFIG, // Viridian City
  0x3a: STANDARD_POKECENTER_CONFIG, // Pewter City
  0x40: STANDARD_POKECENTER_CONFIG, // Cerulean City
  0x44: STANDARD_POKECENTER_CONFIG, // Mt. Moon / Route 4
  0x51: STANDARD_POKECENTER_CONFIG, // Rock Tunnel / Route 10
  0x59: STANDARD_POKECENTER_CONFIG, // Vermilion City
  0x85: STANDARD_POKECENTER_CONFIG, // Celadon City
  0x8d: STANDARD_POKECENTER_CONFIG, // Lavender Town
  0x9a: STANDARD_POKECENTER_CONFIG, // Fuchsia City
  0xab: STANDARD_POKECENTER_CONFIG, // Cinnabar Island
  0xae: Object.freeze({ standX: 7, standY: 7, exitX: 7, exitY: 11 }), // Indigo Plateau Lobby
  0xb6: STANDARD_POKECENTER_CONFIG, // Saffron City
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
const HEAL_STALL_FRAMES = 1200;
const MAX_TRAIL_LENGTH = 2000;
const MOVEMENT_ONE_WAY_MASK = 0xc0;

export function isPokeCenterMap(mapId) {
  return Object.hasOwn(POKECENTER_CONFIGS, mapId);
}

export function isPokemonRedBlueTitle(title) {
  const normalized = String(title || '').trim().toUpperCase();
  return normalized === 'POKEMON RED' || normalized === 'POKEMON BLUE';
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

export function readPokemonRedOverworldPos(readMem) {
  const r = (addr) => readMem(addr) & 0xff;
  return {
    isInBattle: r(0xd057),
    map: r(0xd35e),
    y: r(0xd361),
    x: r(0xd362),
    partyCount: Math.min(r(0xd163), 6),
    facing: r(0xc109),
    movementFlags: r(0xd736),
  };
}

export function readPokemonRedSnapshot(readMem) {
  const r = (addr) => readMem(addr) & 0xff;
  const r16 = (addr) => (r(addr) << 8) | r(addr + 1);

  const isInBattle = r(0xd057);
  const map = r(0xd35e);
  const y = r(0xd361);
  const x = r(0xd362);
  const facing = r(0xc109);
  const movementFlags = r(0xd736);

  const partyCount = Math.min(r(0xd163), 6);
  const party = [];
  for (let i = 0; i < partyCount; i++) {
    const base = 0xd16b + i * 0x2c;
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

  const battleMon = {
    hp: r16(0xd015),
    maxHp: r16(0xd023),
    level: r(0xd022),
    moves: [r(0xd01c), r(0xd01d), r(0xd01e), r(0xd01f)],
    pp: [
      r(0xd02d) & 0x3f,
      r(0xd02e) & 0x3f,
      r(0xd02f) & 0x3f,
      r(0xd030) & 0x3f,
    ],
  };

  const enemyHp = r16(0xcfe6);

  const readTileRow = (row) => {
    let s = '';
    const start = TILEMAP_ADDR + row * 20;
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
  const hasTypeBox = moveInfoText.includes('TYPE');

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
    const rowAddr = TILEMAP_ADDR + row * 20;
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
    isInBattle,
    map,
    y,
    x,
    facing,
    movementFlags,
    partyCount,
    party,
    battleMon,
    enemyHp,
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

export function createAutoFight() {
  let active = false;
  let phase = 'idle';
  let stopReason = null;
  let anchor = null;
  let initialParty = [];
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
  let trail = [];
  let wasInPokeCenter = false;
  let prevOverworld = null;

  // Round-trip heal & return state
  let travelMode = null;
  let pathIdx = -1;
  let stuckFrames = 0;
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
    trail = [];
    wasInPokeCenter = false;
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

  function observe(snap) {
    if (active || !snap || snap.isInBattle !== 0 || (snap.partyCount ?? 1) === 0) {
      return;
    }

    const facingDir = dirFromFacing(snap.facing);

    if (isPokeCenterMap(snap.map)) {
      pokeCenterMap = snap.map;
      trail = [];
      wasInPokeCenter = true;
      prevOverworld = { map: snap.map, x: snap.x, y: snap.y, facingDir };
      return;
    }

    if (wasInPokeCenter) {
      wasInPokeCenter = false;
      const enterDir = prevOverworld?.facingDir || 'down';
      const exitDir = OPPOSITE_DIR[enterDir] || 'up';
      trail = [{ map: snap.map, x: snap.x, y: snap.y, enterDir, exitDir, oneWay: false }];
      prevOverworld = { map: snap.map, x: snap.x, y: snap.y, facingDir };
      return;
    }

    if (pokeCenterMap === null || trail.length === 0) {
      prevOverworld = { map: snap.map, x: snap.x, y: snap.y, facingDir };
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

    if (snap.map === last.map) {
      const dist = Math.abs(snap.x - last.x) + Math.abs(snap.y - last.y);
      if (dist > 2) {
        pokeCenterMap = null;
        trail = [];
        prevOverworld = { map: snap.map, x: snap.x, y: snap.y, facingDir };
        return;
      }
    }

    const loopIdx = trail.findIndex((n) => n.map === snap.map && n.x === snap.x && n.y === snap.y);
    if (loopIdx !== -1) {
      trail.length = loopIdx + 1;
      prevOverworld = {
        map: snap.map,
        x: snap.x,
        y: snap.y,
        facingDir: facingDir || dirFromDelta(last, snap) || prevOverworld?.facingDir || null,
      };
      return;
    }

    const oneWay =
      Boolean((snap.movementFlags || 0) & MOVEMENT_ONE_WAY_MASK) ||
      (snap.map === last.map && Math.abs(snap.x - last.x) + Math.abs(snap.y - last.y) === 2);

    if (snap.map !== last.map) {
      const enterDir = prevOverworld?.facingDir || facingDir || 'up';
      const exitDir = OPPOSITE_DIR[enterDir] || 'down';
      trail.push({ map: snap.map, x: snap.x, y: snap.y, enterDir, exitDir, oneWay });
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
    active = false;
    stopReason = reason;
    phase = 'idle';
    pulse = null;
    cooldown = 0;
    travelMode = null;
    healSubphase = null;
    stuckFrames = 0;
    healFrames = 0;
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
      moves: [...m.moves],
    }));
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
    const lead = party.find((m) => m.hp > 0);
    if (!lead) {
      return stop('fainted');
    }
    if (healSubphase !== 'exiting' && snap.map !== pokeCenterMap) {
      return stop('map changed');
    }

    healFrames += 1;
    if (healFrames >= HEAL_STALL_FRAMES) {
      return stop('healing stalled at PokéCenter');
    }

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

    const cfg = POKECENTER_CONFIGS[pokeCenterMap];

    if (healSubphase === 'to_nurse') {
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
      const allFullHp = party.length > 0 && party.every((m) => m.hp === m.maxHp);
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
      if (snap.map !== pokeCenterMap) {
        if (snap.map !== trail[0]?.map) {
          return stop('map changed');
        }
        phase = 'walking_back';
        travelMode = 'walking_back';
        pathIdx = 0;
        stuckFrames = 0;
        overworldCooldown = 0;
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
    const lead = party.find((m) => m.hp > 0);
    if (!lead) {
      return stop('fainted');
    }

    if (snap.map === pokeCenterMap) {
      phase = 'healing';
      travelMode = null;
      healSubphase = 'to_nurse';
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

    if (!trail.some((n) => n.map === snap.map)) {
      return stop('map changed');
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

    if (snap.map === lastPos.map && snap.x === lastPos.x && snap.y === lastPos.y) {
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
      return stop('blocked by one-way path — use a different path from the PokéCenter next time');
    }
    if (stuckFrames >= BLOCKED_STUCK_FRAMES) {
      return stop('path blocked (possible one-way path or obstacle) — use a different path from the PokéCenter next time');
    }

    lastPos = { map: snap.map, x: snap.x, y: snap.y };
    phase = 'returning';
    return {
      active: true,
      buttons: { ...NEUTRAL_BUTTONS, [dir]: true },
      stopReason: null,
      phase,
    };
  }

  function stepWalkingBack(snap, party) {
    const lead = party.find((m) => m.hp > 0);
    if (!lead) {
      return stop('fainted');
    }

    if (!trail.some((n) => n.map === snap.map)) {
      return stop('map changed');
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

    if (snap.map === lastPos.map && snap.x === lastPos.x && snap.y === lastPos.y) {
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
      return stop('path blocked returning to grind spot — use a different path from the PokéCenter next time');
    }

    lastPos = { map: snap.map, x: snap.x, y: snap.y };
    phase = 'walking_back';
    return {
      active: true,
      buttons: { ...NEUTRAL_BUTTONS, [dir]: true },
      stopReason: null,
      phase,
    };
  }

  function stepMoving(snap, party) {
    const lead = party.find((m) => m.hp > 0);
    if (!lead) {
      return stop('fainted');
    }
    if (pickAttackSlot(lead.moves, lead.pp) === -1) {
      if (hasHealPath(anchor.map)) {
        beginReturning(snap);
        return stepReturning(snap, party);
      }
      return stop('out of PP');
    }
    if (snap.map !== anchor.map) {
      return stop('map changed');
    }

    let dir;
    if (snap.x !== anchor.x || snap.y !== anchor.y) {
      atAnchorFrames = 0;
      if (snap.x === lastPos.x && snap.y === lastPos.y) {
        returnStuckFrames += 1;
      } else {
        returnStuckFrames = 0;
      }
      if (returnStuckFrames >= 48) {
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

    // 1. Check for move-learning prompts or newly learned moves before any button press.
    if (LEARN_PROMPT_RE.test(snap.menuBoxText || '')) {
      return stop('learning a move');
    }
    const party = snap.party || [];
    for (let i = 0; i < initialParty.length && i < party.length; i++) {
      const cur = party[i];
      const init = initialParty[i];
      if (cur.species !== 0 && cur.species === init.species) {
        for (let k = 0; k < 4; k++) {
          if (cur.moves[k] !== init.moves[k]) {
            return stop('learning a move');
          }
        }
      }
    }

    // 2. Blackout or trainer battle safety stops.
    if (snap.isInBattle === 0xff) {
      return stop('fainted');
    }
    if (snap.isInBattle === 2) {
      return stop('trainer battle');
    }

    // 3. Overworld phases.
    if (snap.isInBattle === 0) {
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
      pulse = null;
      cooldown = 0;
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
        return stop('out of PP');
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
        return stop('out of PP');
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
      hasHealPath: hasHealPath(anchor?.map ?? prevOverworld?.map),
      trailLength: trail.length,
      healSubphase,
    }),
  };
}
