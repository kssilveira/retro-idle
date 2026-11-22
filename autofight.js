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

export function readPokemonRedSnapshot(readMem) {
  const r = (addr) => readMem(addr) & 0xff;
  const r16 = (addr) => (r(addr) << 8) | r(addr + 1);

  const isInBattle = r(0xd057);
  const map = r(0xd35e);
  const y = r(0xd361);
  const x = r(0xd362);

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
  for (let row = 12; row <= 17; row++) {
    const col = menuBoxRows[row - 12].indexOf('FIGHT');
    if (col !== -1) {
      fightPos = { row, col };
      break;
    }
  }
  const hasRun = menuBoxText.includes('RUN');

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
    partyCount,
    party,
    battleMon,
    enemyHp,
    hasTypeBox,
    menuBoxRows,
    menuBoxText,
    fightPos,
    hasRun,
    cursorPos,
    moveFirstRow: MOVE_FIRST_ROW,
  };
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
  let lastPos = { x: 0, y: 0 };
  let overworldCooldown = 0;
  let pulse = null;
  let cooldown = 0;

  function stop(reason = 'manual') {
    active = false;
    stopReason = reason;
    phase = 'idle';
    pulse = null;
    cooldown = 0;
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
    lastPos = { x: snap.x, y: snap.y };
    overworldCooldown = 0;
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

    // 3. Overworld pacing.
    if (snap.isInBattle === 0) {
      if (wasInBattle) {
        wasInBattle = false;
        battleMonReady = false;
        pulse = null;
        cooldown = 0;
        atAnchorFrames = 0;
        returnStuckFrames = 0;
        overworldCooldown = 30;
      }

      const lead = party.find((m) => m.hp > 0);
      if (!lead) {
        return stop('fainted');
      }
      if (pickAttackSlot(lead.moves, lead.pp) === -1) {
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
        } else if (snap.x > anchor.x) {
          dir = 'left';
        } else if (snap.x < anchor.x) {
          dir = 'right';
        } else if (snap.y > anchor.y) {
          dir = 'up';
        } else {
          dir = 'down';
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

      lastPos = { x: snap.x, y: snap.y };
      phase = 'moving';
      return {
        active: true,
        buttons: { ...NEUTRAL_BUTTONS, [dir]: true },
        stopReason: null,
        phase,
      };
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

    phase = 'fighting';

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
      if (!battleMonReady) return neutral();
      const targetSlot = pickAttackSlot(snap.battleMon.moves, snap.battleMon.pp);
      if (targetSlot === -1) {
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
      if (!battleMonReady) return neutral();
      if (pickAttackSlot(snap.battleMon.moves, snap.battleMon.pp) === -1) {
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
    getState: () => ({ active, phase, stopReason, anchor }),
  };
}
