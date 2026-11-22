import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEUTRAL_BUTTONS,
  POKEMON_RED_BLUE_MEM,
  POKEMON_YELLOW_MEM,
  createAutoFight,
  getAutoFightProfile,
  isPokemonRedBlueTitle,
  isPokemonYellowTitle,
  isSupportedAutoFightTitle,
  pickAttackSlot,
  readPokemonRedOverworldPos,
  readPokemonRedSnapshot,
  readPokemonYellowOverworldPos,
  readPokemonYellowSnapshot,
} from '../autofight.js';

function makeSnapshot(overrides = {}) {
  return {
    isInBattle: 0,
    map: 12,
    x: 5,
    y: 5,
    partyCount: 1,
    party: [
      {
        species: 176,
        hp: 27,
        maxHp: 27,
        level: 9,
        moves: [10, 45, 52, 0], // Scratch, Growl, Ember
        pp: [35, 40, 25, 0],
      },
    ],
    battleMon: {
      hp: 27,
      maxHp: 27,
      level: 9,
      moves: [10, 45, 52, 0],
      pp: [35, 40, 25, 0],
    },
    enemyHp: 12,
    hasTypeBox: false,
    menuBoxRows: Array(6).fill('                    '),
    menuBoxText: '',
    fightPos: null,
    hasRun: false,
    cursorPos: null,
    moveFirstRow: 13,
    ...overrides,
  };
}

test('isPokemonRedBlueTitle recognizes Red/Blue and ignores other ROMs', () => {
  assert.equal(isPokemonRedBlueTitle('POKEMON RED'), true);
  assert.equal(isPokemonRedBlueTitle('POKEMON BLUE'), true);
  assert.equal(isPokemonRedBlueTitle(' pokemon red '), true);
  assert.equal(isPokemonRedBlueTitle('MBC3 TEST'), false);
  assert.equal(isPokemonRedBlueTitle(''), false);
});

test('pickAttackSlot skips status/self-KO moves and masks PP Ups', () => {
  // Growl (45), Leer (43), Splash (150), Selfdestruct (120) are all non-attacks
  assert.equal(pickAttackSlot([45, 43, 150, 120], [40, 30, 40, 5]), -1);

  // Scratch at 0 PP (with 1 PP Up encoded as 0x40), Growl skipped, Ember at 25 PP -> slot 2
  assert.equal(pickAttackSlot([10, 45, 52, 0], [0x40, 40, 25, 0]), 2);

  // Scratch with 3 PP Ups and 1 PP remaining (0xC1) -> slot 0
  assert.equal(pickAttackSlot([10, 45, 52, 0], [0xc1, 40, 25, 0]), 0);
});

test('overworld 2-tile tethered pacing and blocked fallback + map change stop', () => {
  const af = createAutoFight();
  const anchorSnap = makeSnapshot({ x: 5, y: 5 });
  af.start(anchorSnap);

  // Moves right from anchor
  let res = af.step(anchorSnap);
  assert.equal(res.active, true);
  assert.equal(res.phase, 'moving');
  assert.equal(res.buttons.right, true);

  // Steps onto anchor.x + 1 -> returns left toward anchor
  res = af.step(makeSnapshot({ x: 6, y: 5 }));
  assert.equal(res.active, true);
  assert.equal(res.buttons.left, true);

  // If right is blocked at anchor for 36 frames, rotates through DIRS: left -> up -> down
  const afBlocked = createAutoFight();
  afBlocked.start(anchorSnap);
  for (let i = 0; i < 35; i++) {
    res = afBlocked.step(anchorSnap);
    assert.equal(res.buttons.right, true);
  }
  res = afBlocked.step(anchorSnap);
  assert.equal(res.buttons.left, true);

  for (let i = 0; i < 35; i++) {
    res = afBlocked.step(anchorSnap);
    assert.equal(res.buttons.left, true);
  }
  res = afBlocked.step(anchorSnap);
  assert.equal(res.buttons.up, true);

  for (let i = 0; i < 35; i++) {
    res = afBlocked.step(anchorSnap);
    assert.equal(res.buttons.up, true);
  }
  res = afBlocked.step(anchorSnap);
  assert.equal(res.buttons.down, true);

  // Map transition stops cleanly
  res = afBlocked.step(makeSnapshot({ map: 0, x: 5, y: 5 }));
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'map changed');
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);
});

test('battle navigation: RUN -> FIGHT -> A, then move slot 0 -> slot 2 (Ember) -> A', () => {
  const af = createAutoFight();
  af.start(makeSnapshot({ isInBattle: 0 }));

  // Enter battle -> Battle menu with cursor on RUN (row 16, col 15) while FIGHT is at (row 14, col 10)
  let res = af.step(
    makeSnapshot({
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      hasRun: true,
      cursorPos: { row: 16, col: 15 },
    })
  );
  // First step presses 'up' (3 frames + 6 cooldown = 9 frames)
  assert.equal(res.buttons.up, true);
  for (let i = 0; i < 8; i++) {
    af.step(
      makeSnapshot({
        isInBattle: 1,
        fightPos: { row: 14, col: 10 },
        hasRun: true,
        cursorPos: { row: 16, col: 15 },
      })
    );
  }

  // Now at (14, 15) -> should press 'left' toward (14, 9)
  res = af.step(
    makeSnapshot({
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      hasRun: true,
      cursorPos: { row: 14, col: 15 },
    })
  );
  assert.equal(res.buttons.left, true);
  for (let i = 0; i < 8; i++) {
    af.step(
      makeSnapshot({
        isInBattle: 1,
        fightPos: { row: 14, col: 10 },
        hasRun: true,
        cursorPos: { row: 14, col: 15 },
      })
    );
  }

  // Cursor is now on FIGHT (14, 9) -> should press 'a' (3 frames + 14 cooldown = 17 frames)
  res = af.step(
    makeSnapshot({
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      hasRun: true,
      cursorPos: { row: 14, col: 9 },
    })
  );
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 16; i++) {
    af.step(
      makeSnapshot({
        isInBattle: 1,
        fightPos: { row: 14, col: 10 },
        hasRun: true,
        cursorPos: { row: 14, col: 9 },
      })
    );
  }

  // Move Selection Menu: Scratch (slot 0) has 0 PP, Growl (slot 1) is non-attack, Ember (slot 2) has 25 PP.
  const moveSnap = (cursorRow) =>
    makeSnapshot({
      isInBattle: 1,
      hasTypeBox: true,
      cursorPos: { row: cursorRow, col: 5 },
      battleMon: {
        hp: 27,
        maxHp: 27,
        level: 9,
        moves: [10, 45, 52, 0],
        pp: [0, 40, 25, 0],
      },
    });

  // At slot 0 (row 13) -> press 'down' twice (each pulse is 3 + 6 = 9 frames)
  res = af.step(moveSnap(13));
  assert.equal(res.buttons.down, true);
  for (let i = 0; i < 8; i++) af.step(moveSnap(13));

  res = af.step(moveSnap(14));
  assert.equal(res.buttons.down, true);
  for (let i = 0; i < 8; i++) af.step(moveSnap(14));

  // At slot 2 (row 15) -> press 'a'
  res = af.step(moveSnap(15));
  assert.equal(res.buttons.a, true);
});

test('stops cleanly when out of PP in overworld and in battle menus, without premature mid-animation stop', () => {
  // Overworld 0 PP
  const af1 = createAutoFight();
  af1.start(makeSnapshot());
  let res = af1.step(
    makeSnapshot({
      party: [
        {
          species: 176,
          hp: 27,
          maxHp: 27,
          level: 9,
          moves: [10, 45, 52, 0],
          pp: [0, 40, 0, 0],
        },
      ],
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'out of PP (missing Heal Center path — visit a Heal Center first)');
  assert.match(res.stopReason, /out of PP/i);
  assert.match(res.stopReason, /missing Heal Center/i);

  // Mid-animation after using final 1 PP: battleMon.pp becomes 0 during attack animation,
  // should NOT stop until menu reopens or battle ends.
  const af2 = createAutoFight();
  af2.start(makeSnapshot());
  res = af2.step(
    makeSnapshot({
      isInBattle: 1,
      battleMon: { hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [1, 40, 0, 0] },
    })
  );
  assert.equal(res.active, true);

  res = af2.step(
    makeSnapshot({
      isInBattle: 1,
      battleMon: { hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [0, 40, 0, 0] },
    })
  );
  assert.equal(res.active, true);

  // Exhaust remaining 1 pulse frame + 8 cooldown frames, then open Battle Menu with 0 attack PP -> stops with 'out of PP'
  for (let i = 0; i < 9; i++) {
    res = af2.step(
      makeSnapshot({
        isInBattle: 1,
        battleMon: { hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [0, 40, 0, 0] },
      })
    );
  }
  res = af2.step(
    makeSnapshot({
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      hasRun: true,
      cursorPos: { row: 14, col: 9 },
      battleMon: { hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [0, 40, 0, 0] },
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'out of PP (missing Heal Center path — visit a Heal Center first)');
  assert.match(res.stopReason, /out of PP/i);
  assert.match(res.stopReason, /missing Heal Center/i);

  // Move Selection Menu with 0 attack PP also stops
  const af3 = createAutoFight();
  af3.start(makeSnapshot({ isInBattle: 1 }));
  res = af3.step(
    makeSnapshot({
      isInBattle: 1,
      hasTypeBox: true,
      cursorPos: { row: 13, col: 5 },
      battleMon: { hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [0, 40, 0, 0] },
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'out of PP (missing Heal Center path — visit a Heal Center first)');
  assert.match(res.stopReason, /out of PP/i);
  assert.match(res.stopReason, /missing Heal Center/i);
});

test('stops when fainted/dead, ignores stale battleMon intro, stops on trainer battle', () => {
  const af = createAutoFight();
  af.start(makeSnapshot());

  // Battle intro where battleMon is stale zero -> must NOT stop
  let res = af.step(
    makeSnapshot({
      isInBattle: 1,
      battleMon: { hp: 0, maxHp: 0, level: 0, moves: [0, 0, 0, 0], pp: [0, 0, 0, 0] },
    })
  );
  assert.equal(res.active, true);

  // SendOutMon populates battleMon
  res = af.step(
    makeSnapshot({
      isInBattle: 1,
      battleMon: { hp: 27, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
    })
  );
  assert.equal(res.active, true);

  // Battle HP reaches 0 -> stops immediately
  res = af.step(
    makeSnapshot({
      isInBattle: 1,
      battleMon: { hp: 0, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'fainted');
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);

  // isInBattle === 0xFF blackout
  const afBlackout = createAutoFight();
  afBlackout.start(makeSnapshot());
  res = afBlackout.step(makeSnapshot({ isInBattle: 0xff }));
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'fainted');

  // Overworld all party HP 0
  const afDeadParty = createAutoFight();
  afDeadParty.start(makeSnapshot());
  res = afDeadParty.step(
    makeSnapshot({
      party: [{ species: 176, hp: 0, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] }],
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'fainted');

  // Trainer battle
  const afTrainer = createAutoFight();
  afTrainer.start(makeSnapshot());
  res = afTrainer.step(makeSnapshot({ isInBattle: 2 }));
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'trainer battle');
});

test('stops immediately with neutral buttons when learning a move (text or move list diff)', () => {
  for (const text of [
    'CHARMANDER is trying to learn RAGE!',
    'CHARMANDER learned EMBER!',
    'Delete an older move to make room?',
    'Wait... forgotten move!',
  ]) {
    const af = createAutoFight();
    af.start(makeSnapshot({ isInBattle: 1 }));
    const res = af.step(makeSnapshot({ isInBattle: 1, menuBoxText: text }));
    assert.equal(res.active, false, `Should stop on "${text}"`);
    assert.equal(res.stopReason, 'learning a move');
    assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);
  }

  // Party move list gained a 4th move without text match
  const afDiff = createAutoFight();
  afDiff.start(makeSnapshot({ isInBattle: 1 }));
  const res = afDiff.step(
    makeSnapshot({
      isInBattle: 1,
      party: [
        {
          species: 176,
          hp: 27,
          maxHp: 27,
          level: 10,
          moves: [10, 45, 52, 99],
          pp: [35, 40, 25, 20],
        },
      ],
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'learning a move');
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);
});

test('passive PokéCenter trail tracking: ignores title screen, records exit, prunes loops, resets on new PokéCenter, flags moving ledges only', () => {
  const af = createAutoFight();

  // Title screen / empty party should not record PokéCenter
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 0, facing: 0x00, movementFlags: 0 });
  assert.equal(af.getState().pokeCenterMap, null);
  assert.equal(af.getState().trailLength, 0);

  // Inside Viridian PokéCenter (0x29) with a party
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  assert.equal(af.getState().pokeCenterMap, 0x29);

  // Exit onto Viridian City (map 1)
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00, movementFlags: 0 });
  assert.equal(af.getState().trailLength, 1);
  assert.equal(af.getState().hasHealPath, true);

  // Walk and make a loop: (23,26) -> (23,27) -> (24,27) -> (24,26) -> back to (23,26)
  for (const [x, y] of [
    [23, 26],
    [23, 27],
    [24, 27],
    [24, 26],
    [23, 26],
  ]) {
    af.observe({ isInBattle: 0, map: 1, x, y, partyCount: 1, facing: 0x00, movementFlags: 0 });
  }
  const pruned = af.exportTrail();
  assert.equal(pruned.trail.length, 2);
  assert.deepEqual(
    pruned.trail.map((n) => [n.map, n.x, n.y]),
    [
      [1, 23, 25],
      [1, 23, 26],
    ]
  );

  // Stationary BIT_LEDGE_OR_FISHING (fishing) must NOT flag oneWay
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00, movementFlags: 0x40 });
  assert.equal(af.exportTrail().trail[1].oneWay, false);

  // Jumping down a ledge (dist 2 + movementFlags 0x40) flags oneWay
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 28, partyCount: 1, facing: 0x00, movementFlags: 0x40 });
  assert.equal(af.exportTrail().trail[2].oneWay, true);

  // Cross-map transition records enterDir / exitDir
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 29, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 0, partyCount: 1, facing: 0x00, movementFlags: 0 });
  const cross = af.exportTrail();
  const crossNode = cross.trail[cross.trail.length - 1];
  assert.equal(crossNode.map, 12);
  assert.equal(crossNode.enterDir, 'down');
  assert.equal(crossNode.exitDir, 'up');

  // Entering a different PokéCenter (Pewter 0x3a) resets trail
  af.observe({ isInBattle: 0, map: 0x3a, x: 3, y: 7, partyCount: 1, facing: 0x04, movementFlags: 0 });
  assert.equal(af.getState().pokeCenterMap, 0x3a);
  assert.equal(af.getState().trailLength, 0);
  assert.equal(af.exportTrail(), null);
});

test('round-trip heal & return: flees out-of-PP battle, handles ambush, heals without re-talking, resumes grind, and repeats', () => {
  const af = createAutoFight();

  // Observe outbound walk from Viridian PokéCenter (0x29) -> Viridian City (1) -> Route 1 (12)
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  for (const [x, y] of [
    [23, 25],
    [23, 26],
    [23, 27],
  ]) {
    af.observe({ isInBattle: 0, map: 1, x, y, partyCount: 1, facing: 0x00, movementFlags: 0 });
  }
  for (const [x, y] of [
    [10, 0],
    [10, 1],
    [10, 2],
  ]) {
    af.observe({ isInBattle: 0, map: 12, x, y, partyCount: 1, facing: 0x00, movementFlags: 0 });
  }
  assert.equal(af.getState().hasHealPath, true);

  // Start Auto-Fight on Route 1 (12, 10, 2)
  af.start(makeSnapshot({ map: 12, x: 10, y: 2 }));

  // Step 1: in battle Move Selection Menu with 0 attack PP -> flees by pressing 'b' (does NOT stop)
  const zeroPpBattleMon = {
    hp: 20,
    maxHp: 27,
    level: 9,
    moves: [10, 45, 52, 0],
    pp: [0, 40, 0, 0],
  };
  let res = af.step(
    makeSnapshot({
      map: 12,
      x: 10,
      y: 2,
      isInBattle: 1,
      hasTypeBox: true,
      cursorPos: { row: 13, col: 5 },
      battleMon: zeroPpBattleMon,
    })
  );
  assert.equal(res.active, true);
  assert.equal(res.phase, 'fleeing');
  assert.equal(res.buttons.b, true);

  // Finish 2 remaining 'b' frames + 10 cooldown frames = 12 frames
  const moveMenuZeroPp = makeSnapshot({
    map: 12,
    x: 10,
    y: 2,
    isInBattle: 1,
    hasTypeBox: true,
    cursorPos: { row: 13, col: 5 },
    battleMon: zeroPpBattleMon,
  });
  for (let i = 0; i < 12; i++) af.step(moveMenuZeroPp);

  // Main Battle Menu at FIGHT (14, 9) -> should move 'down' -> 'right' -> 'a' to RUN (16, 15)
  const mainBattleMenu = (cursorPos) =>
    makeSnapshot({
      map: 12,
      x: 10,
      y: 2,
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      runPos: { row: 16, col: 16 },
      hasRun: true,
      cursorPos,
      battleMon: zeroPpBattleMon,
    });

  res = af.step(mainBattleMenu({ row: 14, col: 9 }));
  assert.equal(res.buttons.down, true);
  for (let i = 0; i < 8; i++) af.step(mainBattleMenu({ row: 14, col: 9 }));

  res = af.step(mainBattleMenu({ row: 16, col: 9 }));
  assert.equal(res.buttons.right, true);
  for (let i = 0; i < 8; i++) af.step(mainBattleMenu({ row: 16, col: 9 }));

  res = af.step(mainBattleMenu({ row: 16, col: 15 }));
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 16; i++) af.step(mainBattleMenu({ row: 16, col: 15 }));

  // Battle ended -> return to overworld at (12, 10, 2) with 0 PP
  const zeroPpParty = [
    { species: 176, hp: 20, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [0, 40, 0, 0] },
  ];
  res = af.step(makeSnapshot({ map: 12, x: 10, y: 2, party: zeroPpParty }));
  assert.equal(res.active, true);
  assert.equal(res.phase, 'returning');
  assert.equal(res.buttons.up, true);

  // Step onto (12, 10, 1) and get ambushed by a wild encounter
  res = af.step(makeSnapshot({ map: 12, x: 10, y: 1, party: zeroPpParty }));
  assert.equal(res.buttons.up, true);

  res = af.step(
    makeSnapshot({
      map: 12,
      x: 10,
      y: 1,
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      runPos: { row: 16, col: 16 },
      hasRun: true,
      cursorPos: { row: 14, col: 9 },
      party: zeroPpParty,
    })
  );
  assert.equal(res.active, true);
  assert.equal(res.phase, 'fleeing');

  // Escape ambush -> back to overworld at (12, 10, 1) -> step to (12, 10, 0) -> cross border up to Viridian (1, 23, 27)
  res = af.step(makeSnapshot({ map: 12, x: 10, y: 1, party: zeroPpParty }));
  assert.equal(res.phase, 'returning');
  assert.equal(res.buttons.up, true);

  res = af.step(makeSnapshot({ map: 12, x: 10, y: 0, party: zeroPpParty }));
  assert.equal(res.buttons.up, true);

  for (const [x, y] of [
    [23, 27],
    [23, 26],
    [23, 25],
  ]) {
    res = af.step(makeSnapshot({ map: 1, x, y, party: zeroPpParty }));
    assert.equal(res.phase, 'returning');
    assert.equal(res.buttons.up, true);
  }

  // Entered Viridian PokéCenter (0x29) at right door mat (4, 7) -> must align x to 3 FIRST!
  res = af.step(makeSnapshot({ map: 0x29, x: 4, y: 7, facing: 0x04, party: zeroPpParty }));
  assert.equal(res.active, true);
  assert.equal(res.phase, 'healing');
  assert.equal(af.getState().healSubphase, 'to_nurse');
  assert.equal(res.buttons.left, true);

  for (const y of [7, 6, 5, 4]) {
    res = af.step(makeSnapshot({ map: 0x29, x: 3, y, facing: 0x04, party: zeroPpParty }));
    assert.equal(res.buttons.up, true);
  }

  // Arrived at (3, 3) facing left (0x08) -> turns up before talking
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x08, party: zeroPpParty }));
  assert.equal(res.buttons.up, true);
  for (let i = 0; i < 8; i++) {
    af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x08, party: zeroPpParty }));
  }

  // Facing up (0x04) at (3, 3) -> transitions to talking_nurse and presses 'a'
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: zeroPpParty }));
  assert.equal(af.getState().healSubphase, 'talking_nurse');
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 12; i++) {
    af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: zeroPpParty }));
  }

  // Nurse Joy restores HP & PP -> MUST stop pressing 'a' and switch to closing_dialogue ('b' + 'down')
  const healedParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
  ];
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty }));
  assert.equal(af.getState().healSubphase, 'closing_dialogue');
  assert.equal(res.buttons.b, true);
  for (let i = 0; i < 8; i++) {
    const mid = af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty }));
    assert.equal(mid.buttons.a, false, 'Must never press A after party is healed');
  }

  // Check closing_dialogue cycle: 3 frames 'b', 12 frames 'down', zero 'a' presses
  const cycleOutputs = [];
  for (let i = 0; i < 15; i++) {
    const out = af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty }));
    assert.equal(out.buttons.a, false);
    cycleOutputs.push(out.buttons.b ? 'b' : out.buttons.down ? 'down' : 'other');
  }
  assert.deepEqual(cycleOutputs, [
    'b', 'b', 'b',
    'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'down',
  ]);

  // Once dialogue closes and player steps to (3, 4) -> switches to exiting and walks down out the door
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 4, facing: 0x00, party: healedParty }));
  assert.equal(af.getState().healSubphase, 'exiting');
  assert.equal(res.buttons.down, true);

  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 7, facing: 0x00, party: healedParty }));
  assert.equal(res.buttons.down, true);

  // Exited PokéCenter onto Viridian City (1, 23, 25) -> walking_back along trail
  res = af.step(makeSnapshot({ map: 1, x: 23, y: 25, party: healedParty }));
  assert.equal(res.phase, 'walking_back');
  assert.equal(res.buttons.down, true);

  for (const [x, y] of [
    [23, 26],
    [23, 27],
  ]) {
    res = af.step(makeSnapshot({ map: 1, x, y, party: healedParty }));
    assert.equal(res.phase, 'walking_back');
    assert.equal(res.buttons.down, true);
  }

  res = af.step(makeSnapshot({ map: 12, x: 10, y: 0, party: healedParty }));
  assert.equal(res.phase, 'walking_back');
  assert.equal(res.buttons.down, true);

  res = af.step(makeSnapshot({ map: 12, x: 10, y: 1, party: healedParty }));
  assert.equal(res.phase, 'walking_back');
  assert.equal(res.buttons.down, true);

  // Arrived back at grind spot (12, 10, 2) -> resumes moving!
  res = af.step(makeSnapshot({ map: 12, x: 10, y: 2, party: healedParty }));
  assert.equal(res.active, true);
  assert.equal(res.phase, 'moving');
  assert.deepEqual(af.getState().anchor, { map: 12, x: 10, y: 2 });

  // Second out-of-PP cycle reuses the preserved trail cleanly
  res = af.step(makeSnapshot({ map: 12, x: 10, y: 2, party: zeroPpParty }));
  assert.equal(res.active, true);
  assert.equal(res.phase, 'returning');
});

test('stops quickly with actionable error when blocked by a one-way ledge', () => {
  const af = createAutoFight();

  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00, movementFlags: 0 });
  // One-way ledge jump down to (23, 28)
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 28, partyCount: 1, facing: 0x00, movementFlags: 0x40 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 29, partyCount: 1, facing: 0x00, movementFlags: 0 });

  const zeroPpParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [0, 40, 0, 0] },
  ];
  af.start(makeSnapshot({ map: 1, x: 23, y: 29, party: zeroPpParty }));

  // First step initiates return up from (23, 29) -> moves to (23, 28)
  let res = af.step(makeSnapshot({ map: 1, x: 23, y: 29, party: zeroPpParty }));
  assert.equal(res.phase, 'returning');
  assert.equal(res.buttons.up, true);

  // Arrival frame at (23, 28)
  res = af.step(makeSnapshot({ map: 1, x: 23, y: 28, party: zeroPpParty }));
  assert.equal(res.active, true);
  assert.equal(res.buttons.up, true);

  // Blocked at (23, 28) trying to climb back up the ledge: runs for 44 stuck frames, stops on 45th
  for (let i = 0; i < 44; i++) {
    res = af.step(makeSnapshot({ map: 1, x: 23, y: 28, party: zeroPpParty }));
    assert.equal(res.active, true);
    assert.equal(res.buttons.up, true);
  }
  res = af.step(makeSnapshot({ map: 1, x: 23, y: 28, party: zeroPpParty }));
  assert.equal(res.active, false);
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);
  assert.match(res.stopReason, /one-way/i);
  assert.match(res.stopReason, /different path/i);
});

test('stops after generic blocked timeout when stuck, and clears stuck counter if movement resumes', () => {
  const af = createAutoFight();

  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 27, partyCount: 1, facing: 0x00, movementFlags: 0 });

  const zeroPpParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [0, 40, 0, 0] },
  ];
  af.start(makeSnapshot({ map: 1, x: 23, y: 27, party: zeroPpParty }));

  // Blocked for 100 frames at (23, 27) -> must NOT stop yet
  let res;
  for (let i = 0; i < 100; i++) {
    res = af.step(makeSnapshot({ map: 1, x: 23, y: 27, party: zeroPpParty }));
    assert.equal(res.active, true);
  }

  // NPC moves away -> player reaches (23, 26), resetting stuck counter
  res = af.step(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
  assert.equal(res.active, true);

  // Blocked at (23, 26) for 239 more frames -> still active, then stops on 240th
  for (let i = 0; i < 239; i++) {
    res = af.step(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
    assert.equal(res.active, true);
  }
  res = af.step(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
  assert.equal(res.active, false);
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);
  assert.match(res.stopReason, /blocked/i);
  assert.match(res.stopReason, /different path/i);
});

test('exportTrail / importTrail round-trip preserves heal route and rejects invalid payloads', () => {
  const af1 = createAutoFight();
  af1.observe({ isInBattle: 0, map: 0x3a, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af1.observe({ isInBattle: 0, map: 3, x: 13, y: 25, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af1.observe({ isInBattle: 0, map: 3, x: 13, y: 26, partyCount: 1, facing: 0x00, movementFlags: 0 });
  const exported = af1.exportTrail();
  assert.ok(exported);

  const af2 = createAutoFight();
  assert.equal(af2.importTrail(null), false);
  assert.equal(af2.importTrail({ pokeCenterMap: 99, trail: [] }), false);
  assert.equal(af2.importTrail({ pokeCenterMap: 0x3a, trail: [] }), false);
  assert.equal(af2.importTrail(exported), true);

  const zeroPpParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [0, 40, 0, 0] },
  ];
  af2.start(makeSnapshot({ map: 3, x: 13, y: 26, party: zeroPpParty }));
  const res = af2.step(makeSnapshot({ map: 3, x: 13, y: 26, party: zeroPpParty }));
  assert.equal(res.active, true);
  assert.equal(res.phase, 'returning');
  assert.equal(res.buttons.up, true);
});

test('warp fade-out resilience: preserves trail when wCurMap updates before wXCoord/wYCoord and wCurMapTileset (with and without tileset)', () => {
  // 1. Real PokéCenter exit fade-out WITH tileset (tileset 6 -> 0 after 24 frames)
  const af1 = createAutoFight();
  af1.observe({
    isInBattle: 0,
    map: 0x29,
    x: 3,
    y: 7,
    tileset: 6,
    mapWidth: 14,
    mapHeight: 8,
    partyCount: 1,
    facing: 0x00,
    movementFlags: 0,
  });
  assert.equal(af1.getState().inPokeCenter, true);
  assert.equal(af1.getState().pokeCenterName, 'Viridian Heal Center');

  // 24 fade-out frames where wCurMap is already 1 (Viridian City) while tileset=6 and coords=(3,7)
  for (let i = 0; i < 24; i++) {
    af1.observe({
      isInBattle: 0,
      map: 1,
      x: 3,
      y: 7,
      tileset: 6,
      mapWidth: 14,
      mapHeight: 8,
      partyCount: 1,
      facing: 0x00,
      movementFlags: 0,
    });
  }

  // Frame 25: LoadMapHeader updates tileset=0 and LoadDestinationWarpPosition sets (23, 25)
  af1.observe({
    isInBattle: 0,
    map: 1,
    x: 23,
    y: 25,
    tileset: 0,
    mapWidth: 40,
    mapHeight: 36,
    partyCount: 1,
    facing: 0x00,
    movementFlags: 0,
  });
  af1.observe({
    isInBattle: 0,
    map: 1,
    x: 23,
    y: 26,
    tileset: 0,
    mapWidth: 40,
    mapHeight: 36,
    partyCount: 1,
    facing: 0x00,
    movementFlags: 0,
  });

  const t1 = af1.exportTrail();
  assert.ok(t1, 'Trail must survive PokéCenter exit fade-out');
  assert.deepEqual(
    t1.trail.map((n) => [n.map, n.x, n.y]),
    [
      [1, 23, 25],
      [1, 23, 26],
    ]
  );
  assert.equal(af1.getState().hasHealPath, true);
  assert.equal(af1.getState().inPokeCenter, false);
  assert.equal(af1.getState().pokeCenterName, 'Viridian Heal Center');

  // 2. Warp fade-out WITHOUT tileset / same-tileset gate warp (stale coords for 24 frames, then jump)
  const af2 = createAutoFight();
  af2.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  for (let i = 0; i < 24; i++) {
    af2.observe({ isInBattle: 0, map: 1, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  }
  // Frame 25 snaps to real outside coords (23, 25) and continues walking
  af2.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af2.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00, movementFlags: 0 });
  // Turn north at (23, 26) before entering gate map (0x2f)
  af2.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x04, movementFlags: 0 });
  // Walk into a gate map (0x2f): wCurMap changes first for 24 frames at old coords (23, 26)
  for (let i = 0; i < 24; i++) {
    af2.observe({ isInBattle: 0, map: 0x2f, x: 23, y: 26, partyCount: 1, facing: 0x04, movementFlags: 0 });
  }
  // Destination inside gate snaps to (4, 7) -> preserves enterDir/exitDir from (23, 26)
  af2.observe({ isInBattle: 0, map: 0x2f, x: 4, y: 7, partyCount: 1, facing: 0x04, movementFlags: 0 });
  const t2 = af2.exportTrail();
  assert.ok(t2, 'Trail must survive warp fade-outs without tileset');
  assert.deepEqual(
    t2.trail.map((n) => [n.map, n.x, n.y]),
    [
      [1, 23, 25],
      [1, 23, 26],
      [0x2f, 4, 7],
    ]
  );
  assert.equal(t2.trail[0].exitDir, 'up');
  assert.equal(t2.trail[2].enterDir, 'up');
  assert.equal(t2.trail[2].exitDir, 'down');
});

test('border transient 0xFF/OOB coords are ignored by observe() and stepHealing waits out warp fade-out', () => {
  const af = createAutoFight();
  af.observe({
    isInBattle: 0,
    map: 0x29,
    x: 3,
    y: 7,
    tileset: 6,
    mapWidth: 14,
    mapHeight: 8,
    partyCount: 1,
    facing: 0x00,
    movementFlags: 0,
  });
  af.observe({
    isInBattle: 0,
    map: 1,
    x: 23,
    y: 25,
    tileset: 0,
    mapWidth: 40,
    mapHeight: 36,
    partyCount: 1,
    facing: 0x00,
    movementFlags: 0,
  });
  af.observe({
    isInBattle: 0,
    map: 1,
    x: 23,
    y: 26,
    tileset: 0,
    mapWidth: 40,
    mapHeight: 36,
    partyCount: 1,
    facing: 0x00,
    movementFlags: 0,
  });

  // Transient OOB values during CheckMapConnections must be ignored without wiping trail
  af.observe({ isInBattle: 0, map: 1, x: 0xff, y: 26, tileset: 0, mapWidth: 40, mapHeight: 36, partyCount: 1 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 0xff, tileset: 0, mapWidth: 40, mapHeight: 36, partyCount: 1 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 36, tileset: 0, mapWidth: 40, mapHeight: 36, partyCount: 1 });
  assert.equal(af.exportTrail().trail.length, 2);

  // Start out-of-PP return -> enter PokéCenter during fade-out (map=0x29 while tileset=0, coords=(23,25))
  const zeroPpParty = [
    { species: 176, hp: 20, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [0, 40, 0, 0] },
  ];
  af.start(makeSnapshot({ map: 1, x: 23, y: 26, tileset: 0, party: zeroPpParty }));
  let res = af.step(makeSnapshot({ map: 1, x: 23, y: 26, tileset: 0, party: zeroPpParty }));
  assert.equal(res.phase, 'returning');

  // Entering PokéCenter: first frames have map=0x29, tileset=0 (fade-out) -> must output neutral and wait
  res = af.step(makeSnapshot({ map: 0x29, x: 23, y: 25, tileset: 0, party: zeroPpParty }));
  assert.equal(res.phase, 'healing');
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);

  // Once tileset=6 loads at (3,7), walks up to Nurse Joy
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 7, tileset: 6, facing: 0x04, party: zeroPpParty }));
  assert.equal(res.buttons.up, true);

  // Walk to (3,3) -> talk -> heal -> close dialogue -> exiting
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, tileset: 6, facing: 0x04, party: zeroPpParty }));
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 12; i++) {
    af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, tileset: 6, facing: 0x04, party: zeroPpParty }));
  }

  const healedParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
  ];
  af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, tileset: 6, facing: 0x04, party: healedParty }));
  for (let i = 0; i < 8; i++) {
    af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, tileset: 6, facing: 0x04, party: healedParty }));
  }
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 4, tileset: 6, facing: 0x00, party: healedParty }));
  assert.equal(af.getState().healSubphase, 'exiting');

  // Exiting PokéCenter: during fade-out map=1 while tileset=6 -> stays in 'healing' (does NOT start walking_back early)
  res = af.step(makeSnapshot({ map: 1, x: 3, y: 7, tileset: 6, party: healedParty }));
  assert.equal(res.phase, 'healing');

  // Once tileset=0 loads at (23, 25) -> transitions cleanly to 'walking_back'
  res = af.step(makeSnapshot({ map: 1, x: 23, y: 25, tileset: 0, party: healedParty }));
  assert.equal(res.phase, 'walking_back');
  assert.equal(res.buttons.down, true);
});

test('stopping during returning, walking_back, and ambush fleeing preserves heal path across observe() and restart', () => {
  const zeroPpParty = [
    { species: 176, hp: 20, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [0, 40, 0, 0] },
  ];
  const healedParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
  ];

  function setupRoute1Trail() {
    const af = createAutoFight();
    af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
    for (const [x, y] of [
      [23, 25],
      [23, 26],
      [23, 27],
    ]) {
      af.observe({ isInBattle: 0, map: 1, x, y, partyCount: 1, facing: 0x00, movementFlags: 0 });
    }
    for (const [x, y] of [
      [10, 0],
      [10, 1],
      [10, 2],
      [10, 3],
      [10, 4],
      [10, 5],
    ]) {
      af.observe({ isInBattle: 0, map: 12, x, y, partyCount: 1, facing: 0x00, movementFlags: 0 });
    }
    return af;
  }

  // 1. Stop during returning on the same map > 2 tiles from grind spot (10, 5)
  const afRetSameMap = setupRoute1Trail();
  afRetSameMap.start(makeSnapshot({ map: 12, x: 10, y: 5, party: zeroPpParty }));
  for (const y of [5, 4, 3, 2]) {
    const res = afRetSameMap.step(makeSnapshot({ map: 12, x: 10, y, party: zeroPpParty }));
    assert.equal(res.phase, 'returning');
  }
  afRetSameMap.stop('manual');
  assert.equal(afRetSameMap.getState().hasHealPath, true);
  assert.equal(afRetSameMap.getState().pokeCenterMap, 0x29);
  assert.equal(afRetSameMap.getState().trailLength, 6);

  // Subsequent observe() frames on Route 1 must keep and continue pruning the trail
  afRetSameMap.observe({ isInBattle: 0, map: 12, x: 10, y: 2, partyCount: 1, facing: 0x04, movementFlags: 0 });
  afRetSameMap.observe({ isInBattle: 0, map: 12, x: 10, y: 1, partyCount: 1, facing: 0x04, movementFlags: 0 });
  assert.equal(afRetSameMap.getState().hasHealPath, true);
  assert.equal(afRetSameMap.getState().trailLength, 5);

  afRetSameMap.start(makeSnapshot({ map: 12, x: 10, y: 1, party: zeroPpParty }));
  const restartedSameMap = afRetSameMap.step(makeSnapshot({ map: 12, x: 10, y: 1, party: zeroPpParty }));
  assert.equal(restartedSameMap.active, true);
  assert.equal(restartedSameMap.phase, 'returning');

  // 2. Stop during returning on an earlier map (Viridian City map 1)
  const afRetEarlierMap = setupRoute1Trail();
  afRetEarlierMap.start(makeSnapshot({ map: 12, x: 10, y: 5, party: zeroPpParty }));
  for (const y of [5, 4, 3, 2, 1, 0]) {
    afRetEarlierMap.step(makeSnapshot({ map: 12, x: 10, y, party: zeroPpParty }));
  }
  afRetEarlierMap.step(makeSnapshot({ map: 1, x: 23, y: 27, party: zeroPpParty }));
  afRetEarlierMap.step(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
  afRetEarlierMap.stop('manual');
  assert.equal(afRetEarlierMap.getState().hasHealPath, true);
  assert.equal(afRetEarlierMap.getState().trailLength, 2);

  afRetEarlierMap.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x04, movementFlags: 0 });
  assert.equal(afRetEarlierMap.getState().hasHealPath, true);
  assert.equal(afRetEarlierMap.getState().trailLength, 2);

  afRetEarlierMap.start(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
  const restartedEarlierMap = afRetEarlierMap.step(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
  assert.equal(restartedEarlierMap.active, true);
  assert.equal(restartedEarlierMap.phase, 'returning');

  // 3. Stop during ambush fleeing (both >2 tiles from grind spot and on an earlier map)
  const afFlee = setupRoute1Trail();
  afFlee.start(makeSnapshot({ map: 12, x: 10, y: 5, party: zeroPpParty }));
  for (const y of [5, 4, 3, 2]) {
    afFlee.step(makeSnapshot({ map: 12, x: 10, y, party: zeroPpParty }));
  }
  const fleeStep = afFlee.step(
    makeSnapshot({
      map: 12,
      x: 10,
      y: 2,
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      runPos: { row: 16, col: 16 },
      hasRun: true,
      cursorPos: { row: 14, col: 9 },
      party: zeroPpParty,
    })
  );
  assert.equal(fleeStep.phase, 'fleeing');
  afFlee.stop('manual');
  assert.equal(afFlee.getState().hasHealPath, true);
  assert.equal(afFlee.getState().trailLength, 6);

  // Restarting while still in ambush battle on an earlier map reconciles trail cleanly
  const afFleeEarlier = setupRoute1Trail();
  afFleeEarlier.start(makeSnapshot({ map: 12, x: 10, y: 5, party: zeroPpParty }));
  for (const y of [5, 4, 3, 2, 1, 0]) {
    afFleeEarlier.step(makeSnapshot({ map: 12, x: 10, y, party: zeroPpParty }));
  }
  afFleeEarlier.step(makeSnapshot({ map: 1, x: 23, y: 27, party: zeroPpParty }));
  afFleeEarlier.step(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
  afFleeEarlier.step(makeSnapshot({ map: 1, x: 23, y: 26, isInBattle: 1, party: zeroPpParty }));
  afFleeEarlier.stop('manual');
  assert.equal(afFleeEarlier.getState().hasHealPath, true);
  assert.equal(afFleeEarlier.getState().trailLength, 2);

  afFleeEarlier.start(
    makeSnapshot({
      map: 1,
      x: 23,
      y: 26,
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      runPos: { row: 16, col: 16 },
      hasRun: true,
      cursorPos: { row: 14, col: 9 },
      party: zeroPpParty,
      battleMon: { hp: 20, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [0, 40, 0, 0] },
    })
  );
  const restartAmbush = afFleeEarlier.step(
    makeSnapshot({
      map: 1,
      x: 23,
      y: 26,
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      runPos: { row: 16, col: 16 },
      hasRun: true,
      cursorPos: { row: 14, col: 9 },
      party: zeroPpParty,
      battleMon: { hp: 20, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [0, 40, 0, 0] },
    })
  );
  assert.equal(restartAmbush.active, true);
  assert.equal(restartAmbush.phase, 'fleeing');

  // 4. Stop during walking_back on earlier map preserves trail
  const afWalkBack = setupRoute1Trail();
  afWalkBack.start(makeSnapshot({ map: 12, x: 10, y: 5, party: zeroPpParty }));
  for (const y of [5, 4, 3, 2, 1, 0]) {
    afWalkBack.step(makeSnapshot({ map: 12, x: 10, y, party: zeroPpParty }));
  }
  for (const y of [27, 26, 25]) {
    afWalkBack.step(makeSnapshot({ map: 1, x: 23, y, party: zeroPpParty }));
  }
  afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 7, facing: 0x04, party: zeroPpParty }));
  afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: zeroPpParty }));
  for (let i = 0; i < 12; i++) {
    afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: zeroPpParty }));
  }
  afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty }));
  for (let i = 0; i < 8; i++) {
    afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty }));
  }
  afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 4, facing: 0x00, party: healedParty }));
  afWalkBack.step(makeSnapshot({ map: 1, x: 23, y: 25, party: healedParty }));
  const wbRes = afWalkBack.step(makeSnapshot({ map: 1, x: 23, y: 26, party: healedParty }));
  assert.equal(wbRes.phase, 'walking_back');

  afWalkBack.stop('manual');
  assert.equal(afWalkBack.getState().hasHealPath, true);
  assert.equal(afWalkBack.getState().trailLength, 2);
  afWalkBack.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00, movementFlags: 0 });
  assert.equal(afWalkBack.getState().hasHealPath, true);
  assert.equal(afWalkBack.getState().trailLength, 2);
});

test('stepMoving respects cooldown before re-anchoring and records drift >= 3 tiles so stopping preserves trail', () => {
  const af = createAutoFight();
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 5, partyCount: 1, facing: 0x00, movementFlags: 0 });
  const initialLen = af.getState().trailLength;

  af.start(makeSnapshot({ map: 12, x: 10, y: 5 }));
  af.step(makeSnapshot({ map: 12, x: 10, y: 5 }));
  af.step(makeSnapshot({ map: 12, x: 11, y: 5 }));

  // Enter battle on (11, 5) and return to overworld -> sets overworldCooldown = 30
  af.step(makeSnapshot({ map: 12, x: 11, y: 5, isInBattle: 1 }));
  af.step(makeSnapshot({ map: 12, x: 11, y: 5, isInBattle: 0 }));

  // 30 cooldown + 100 pre-battle transition frames stationary at (11, 5) must NOT shift anchor
  for (let i = 0; i < 130; i++) {
    af.step(makeSnapshot({ map: 12, x: 11, y: 5 }));
  }
  assert.deepEqual(af.getState().anchor, { map: 12, x: 10, y: 5 });

  // Remaining 48 stuck frames stay at old anchor, then 49th (150th stuck frame) re-anchors to (11, 5)
  for (let i = 0; i < 48; i++) {
    af.step(makeSnapshot({ map: 12, x: 11, y: 5 }));
  }
  assert.deepEqual(af.getState().anchor, { map: 12, x: 10, y: 5 });
  af.step(makeSnapshot({ map: 12, x: 11, y: 5 }));
  assert.deepEqual(af.getState().anchor, { map: 12, x: 11, y: 5 });

  // Drift two more tiles right to (13, 5) (3 tiles total from (10, 5))
  af.step(makeSnapshot({ map: 12, x: 12, y: 5 }));
  for (let i = 0; i < 150; i++) {
    af.step(makeSnapshot({ map: 12, x: 12, y: 5 }));
  }
  assert.deepEqual(af.getState().anchor, { map: 12, x: 12, y: 5 });

  af.step(makeSnapshot({ map: 12, x: 13, y: 5 }));
  for (let i = 0; i < 150; i++) {
    af.step(makeSnapshot({ map: 12, x: 13, y: 5 }));
  }
  assert.deepEqual(af.getState().anchor, { map: 12, x: 13, y: 5 });

  af.stop('manual');
  af.observe({ isInBattle: 0, map: 12, x: 13, y: 5, partyCount: 1, facing: 0x0c, movementFlags: 0 });
  assert.equal(af.getState().hasHealPath, true);
  assert.equal(af.getState().trailLength, initialLen + 3);
});

test('stopping during healing or exiting warp fade-out keeps inPokeCenter true and records fresh trail on exit', () => {
  const zeroPpParty = [
    { species: 176, hp: 20, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [0, 40, 0, 0] },
  ];
  const healedParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
  ];

  const af = createAutoFight();
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, tileset: 6, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, tileset: 0, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, tileset: 0, partyCount: 1, facing: 0x00, movementFlags: 0 });

  af.start(makeSnapshot({ map: 1, x: 23, y: 26, tileset: 0, party: zeroPpParty }));
  af.step(makeSnapshot({ map: 1, x: 23, y: 26, tileset: 0, party: zeroPpParty }));
  af.step(makeSnapshot({ map: 1, x: 23, y: 25, tileset: 0, party: zeroPpParty }));
  af.step(makeSnapshot({ map: 0x29, x: 3, y: 7, tileset: 6, facing: 0x04, party: zeroPpParty }));
  af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, tileset: 6, facing: 0x04, party: zeroPpParty }));
  for (let i = 0; i < 12; i++) {
    af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, tileset: 6, facing: 0x04, party: zeroPpParty }));
  }
  af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, tileset: 6, facing: 0x04, party: healedParty }));
  for (let i = 0; i < 8; i++) {
    af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, tileset: 6, facing: 0x04, party: healedParty }));
  }
  af.step(makeSnapshot({ map: 0x29, x: 3, y: 4, tileset: 6, facing: 0x00, party: healedParty }));

  // Enter exit fade-out: map is already 1 while tileset=6 and coords=(3,7)
  const fadeOutStep = af.step(makeSnapshot({ map: 1, x: 3, y: 7, tileset: 6, party: healedParty }));
  assert.equal(fadeOutStep.phase, 'healing');

  af.stop('manual');
  assert.equal(af.getState().inPokeCenter, true);
  assert.equal(af.getState().pokeCenterMap, 0x29);

  // Remaining fade-out frames observed while stopped stay inPokeCenter with empty trail
  for (let i = 0; i < 10; i++) {
    af.observe({ isInBattle: 0, map: 1, x: 3, y: 7, tileset: 6, partyCount: 1, facing: 0x00, movementFlags: 0 });
    assert.equal(af.getState().inPokeCenter, true);
    assert.equal(af.getState().trailLength, 0);
  }

  // Outside tileset loads at (1, 23, 25) -> fresh trail starts cleanly
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, tileset: 0, partyCount: 1, facing: 0x00, movementFlags: 0 });
  assert.equal(af.getState().inPokeCenter, false);
  assert.equal(af.getState().hasHealPath, true);
  assert.equal(af.getState().trailLength, 1);
  const exported = af.exportTrail();
  assert.deepEqual(exported.trail.map((n) => [n.map, n.x, n.y]), [[1, 23, 25]]);
  assert.equal(exported.trail[0].enterDir, 'down');
  assert.equal(exported.trail[0].exitDir, 'up');
});

test('stopping during returning gate warp fade-out waits out grace window and snaps back onto trail', () => {
  const zeroPpParty = [
    { species: 176, hp: 20, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [0, 40, 0, 0] },
  ];

  const af = createAutoFight();
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x04, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 0x2f, x: 4, y: 7, partyCount: 1, facing: 0x04, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 0x2f, x: 4, y: 6, partyCount: 1, facing: 0x04, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 0, partyCount: 1, facing: 0x04, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 1, partyCount: 1, facing: 0x04, movementFlags: 0 });

  af.start(makeSnapshot({ map: 12, x: 10, y: 1, party: zeroPpParty }));
  af.step(makeSnapshot({ map: 12, x: 10, y: 1, party: zeroPpParty }));
  af.step(makeSnapshot({ map: 12, x: 10, y: 0, party: zeroPpParty }));
  af.step(makeSnapshot({ map: 0x2f, x: 4, y: 6, party: zeroPpParty }));
  af.step(makeSnapshot({ map: 0x2f, x: 4, y: 7, party: zeroPpParty }));

  // Gate warp fade-out: map changed to 1 while coords are still gate (4, 7)
  af.step(makeSnapshot({ map: 1, x: 4, y: 7, party: zeroPpParty }));
  af.stop('manual');

  for (let i = 0; i < 20; i++) {
    af.observe({ isInBattle: 0, map: 1, x: 4, y: 7, partyCount: 1, facing: 0x00, movementFlags: 0 });
    assert.equal(af.getState().pokeCenterMap, 0x29);
    assert.ok(af.getState().trailLength > 0);
  }

  // Destination coords (1, 23, 26) load -> snaps cleanly onto trail
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00, movementFlags: 0 });
  assert.equal(af.getState().hasHealPath, true);
  assert.deepEqual(
    af.exportTrail().trail.map((n) => [n.map, n.x, n.y]),
    [
      [1, 23, 25],
      [1, 23, 26],
    ]
  );
});

test('redundant stop() while inactive preserves trail/inPokeCenter and hasHealPath tracks manual backtracking', () => {
  const af = createAutoFight();
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, tileset: 6, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.stop('manual');
  assert.equal(af.getState().inPokeCenter, true);
  assert.equal(af.getState().pokeCenterMap, 0x29);

  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, tileset: 0, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, tileset: 0, partyCount: 1, facing: 0x00, movementFlags: 0 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 0, tileset: 0, partyCount: 1, facing: 0x00, movementFlags: 0 });

  af.start(makeSnapshot({ map: 12, x: 10, y: 0 }));
  af.stop('manual');
  // Redundant stop while already inactive must not alter trail
  af.stop('manual');
  assert.equal(af.getState().hasHealPath, true);
  assert.equal(af.getState().trailLength, 3);

  // Manually walk back onto map 1 (while anchor was map 12) -> hasHealPath must reflect map 1
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, tileset: 0, partyCount: 1, facing: 0x04, movementFlags: 0 });
  assert.equal(af.getState().trailLength, 2);
  assert.equal(af.getState().hasHealPath, true);
});

function createGen1Memory() {
  const ram = new Uint8Array(0x10000);
  const readMem = (addr) => ram[addr & 0xffff];
  const write16 = (addr, val) => {
    ram[addr] = (val >> 8) & 0xff;
    ram[addr + 1] = val & 0xff;
  };
  const writeTileText = (row, col, text, tileMapAddr = 0xc3a0) => {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      let code = 0x7f;
      if (ch >= 'A' && ch <= 'Z') code = 0x80 + (ch.charCodeAt(0) - 65);
      else if (ch >= 'a' && ch <= 'z') code = 0xa0 + (ch.charCodeAt(0) - 97);
      else if (ch >= '0' && ch <= '9') code = 0xf6 + (ch.charCodeAt(0) - 48);
      else if (ch === '/') code = 0xf3;
      else if (ch === '?') code = 0xe6;
      else if (ch === '!') code = 0xe7;
      ram[tileMapAddr + row * 20 + col + i] = code;
    }
  };
  const clearTileMap = (tileMapAddr = 0xc3a0) => {
    ram.fill(0x7f, tileMapAddr, tileMapAddr + 18 * 20);
  };
  const writePartyMon = (mem, idx, mon) => {
    const base = mem.partyMon1 + idx * 0x2c;
    ram[base] = mon.species;
    write16(base + 0x01, mon.hp);
    for (let i = 0; i < 4; i++) {
      ram[base + 0x08 + i] = mon.moves[i] ?? 0;
      ram[base + 0x1d + i] = mon.pp[i] ?? 0;
    }
    ram[base + 0x21] = mon.level;
    write16(base + 0x22, mon.maxHp);
  };
  const writeBattleMon = (mem, mon) => {
    const base = mem.battleMon;
    write16(base + 0x01, mon.hp);
    for (let i = 0; i < 4; i++) {
      ram[base + 0x08 + i] = mon.moves[i] ?? 0;
      ram[base + 0x19 + i] = mon.pp[i] ?? 0;
    }
    ram[base + 0x0e] = mon.level;
    write16(base + 0x0f, mon.maxHp);
  };
  return { ram, readMem, write16, writeTileText, clearTileMap, writePartyMon, writeBattleMon };
}

test('getAutoFightProfile and title helpers distinguish Red/Blue, Yellow, and unsupported ROMs', () => {
  assert.equal(isPokemonYellowTitle('POKEMON YELLOW'), true);
  assert.equal(isPokemonYellowTitle(' pokemon yellow '), true);
  assert.equal(isPokemonYellowTitle('POKEMON RED'), false);
  assert.equal(isPokemonRedBlueTitle('POKEMON YELLOW'), false);
  assert.equal(isSupportedAutoFightTitle('POKEMON YELLOW'), true);
  assert.equal(isSupportedAutoFightTitle('POKEMON RED'), true);
  assert.equal(isSupportedAutoFightTitle('POKEMON BLUE'), true);
  assert.equal(isSupportedAutoFightTitle('MBC3 TEST'), false);
  assert.equal(isSupportedAutoFightTitle(''), false);

  const yellow = getAutoFightProfile(' pokemon yellow ');
  assert.ok(yellow);
  assert.equal(yellow.id, 'pokemon-yellow');
  assert.equal(yellow.name, 'Pokémon Yellow');
  assert.equal(yellow.mem, POKEMON_YELLOW_MEM);

  const red = getAutoFightProfile('POKEMON RED');
  assert.ok(red);
  assert.equal(red.id, 'pokemon-red-blue');
  assert.equal(red.name, 'Pokémon Red');
  assert.equal(red.mem, POKEMON_RED_BLUE_MEM);

  const blue = getAutoFightProfile('POKEMON BLUE');
  assert.ok(blue);
  assert.equal(blue.id, 'pokemon-red-blue');
  assert.equal(blue.name, 'Pokémon Blue');

  assert.equal(getAutoFightProfile('TETRIS'), null);
});

test('readPokemonYellow* and readPokemonRed* read exact version-specific WRAM offsets and tilemap menus', () => {
  // 1. Pokémon Yellow memory buffer with distinct sentinels on Red/Blue shifted addresses
  const yMem = createGen1Memory();
  yMem.ram[0xd056] = 1; // wIsInBattle (Yellow)
  yMem.ram[0xd057] = 2; // sentinel (Red/Blue wIsInBattle)
  yMem.ram[0xd35d] = 12; // wCurMap (Yellow)
  yMem.ram[0xd35e] = 99; // sentinel
  yMem.ram[0xd360] = 7; // wYCoord (Yellow)
  yMem.ram[0xd361] = 11; // wXCoord (Yellow)
  yMem.ram[0xd362] = 99; // sentinel
  yMem.ram[0xd366] = 3; // wCurMapTileset (Yellow)
  yMem.ram[0xd367] = 18; // wCurMapHeight (Yellow) -> 36
  yMem.ram[0xd368] = 10; // wCurMapWidth (Yellow) -> 20
  yMem.ram[0xd369] = 99; // sentinel
  yMem.ram[0xd735] = 0x40; // wd736 (Yellow)
  yMem.ram[0xd736] = 0x00; // sentinel
  yMem.ram[0xc109] = 0x08; // shared facing left
  yMem.ram[0xd162] = 2; // wPartyCount (Yellow)
  yMem.ram[0xd163] = 6; // sentinel
  yMem.writePartyMon(POKEMON_YELLOW_MEM, 0, {
    species: 0x54, // Pikachu
    hp: 24,
    maxHp: 28,
    level: 8,
    moves: [84, 45, 0, 0], // Thundershock, Growl
    pp: [0x40 | 29, 40, 0, 0],
  });
  yMem.writePartyMon(POKEMON_YELLOW_MEM, 1, {
    species: 0x24, // Pidgey
    hp: 15,
    maxHp: 19,
    level: 5,
    moves: [16, 28, 0, 0],
    pp: [35, 15, 0, 0],
  });
  yMem.writeBattleMon(POKEMON_YELLOW_MEM, {
    hp: 24,
    maxHp: 28,
    level: 8,
    moves: [84, 45, 0, 0],
    pp: [29, 40, 0, 0],
  });
  yMem.write16(0xcfe5, 13); // wEnemyMonHP (Yellow)

  yMem.clearTileMap();
  yMem.writeTileText(14, 10, 'FIGHT');
  yMem.writeTileText(16, 16, 'RUN');
  yMem.ram[0xc3a0 + 14 * 20 + 9] = 0xed;

  const yPos = readPokemonYellowOverworldPos(yMem.readMem);
  assert.deepEqual(yPos, {
    isInBattle: 1,
    map: 12,
    y: 7,
    x: 11,
    tileset: 3,
    mapHeight: 36,
    mapWidth: 20,
    partyCount: 2,
    facing: 0x08,
    movementFlags: 0x40,
  });

  const ySnapBattle = readPokemonYellowSnapshot(yMem.readMem);
  assert.equal(ySnapBattle.isInBattle, 1);
  assert.equal(ySnapBattle.map, 12);
  assert.equal(ySnapBattle.x, 11);
  assert.equal(ySnapBattle.y, 7);
  assert.equal(ySnapBattle.tileset, 3);
  assert.equal(ySnapBattle.mapHeight, 36);
  assert.equal(ySnapBattle.mapWidth, 20);
  assert.equal(ySnapBattle.movementFlags, 0x40);
  assert.equal(ySnapBattle.partyCount, 2);
  assert.deepEqual(ySnapBattle.party[0], {
    species: 0x54,
    hp: 24,
    maxHp: 28,
    level: 8,
    moves: [84, 45, 0, 0],
    pp: [29, 40, 0, 0],
  });
  assert.deepEqual(ySnapBattle.party[1], {
    species: 0x24,
    hp: 15,
    maxHp: 19,
    level: 5,
    moves: [16, 28, 0, 0],
    pp: [35, 15, 0, 0],
  });
  assert.deepEqual(ySnapBattle.battleMon, {
    hp: 24,
    maxHp: 28,
    level: 8,
    moves: [84, 45, 0, 0],
    pp: [29, 40, 0, 0],
  });
  assert.equal(ySnapBattle.enemyHp, 13);
  assert.equal(ySnapBattle.hasTypeBox, false);
  assert.deepEqual(ySnapBattle.fightPos, { row: 14, col: 10 });
  assert.deepEqual(ySnapBattle.runPos, { row: 16, col: 16 });
  assert.equal(ySnapBattle.hasRun, true);
  assert.deepEqual(ySnapBattle.cursorPos, { row: 14, col: 9 });

  yMem.clearTileMap();
  yMem.writeTileText(9, 2, 'TYPE/');
  yMem.ram[0xc3a0 + 13 * 20 + 5] = 0xed;
  const ySnapMove = readPokemonYellowSnapshot(yMem.readMem);
  assert.equal(ySnapMove.hasTypeBox, true);
  assert.deepEqual(ySnapMove.cursorPos, { row: 13, col: 5 });

  // 2. Red/Blue memory buffer verifies unbreaking POKEMON_RED_BLUE_MEM offsets
  const rMem = createGen1Memory();
  rMem.ram[0xd057] = 1;
  rMem.ram[0xd35e] = 3;
  rMem.ram[0xd361] = 14;
  rMem.ram[0xd362] = 9;
  rMem.ram[0xd367] = 0;
  rMem.ram[0xd368] = 18;
  rMem.ram[0xd369] = 20;
  rMem.ram[0xd736] = 0x80;
  rMem.ram[0xc109] = 0x04;
  rMem.ram[0xd163] = 1;
  rMem.writePartyMon(POKEMON_RED_BLUE_MEM, 0, {
    species: 176,
    hp: 31,
    maxHp: 35,
    level: 10,
    moves: [10, 45, 52, 0],
    pp: [35, 40, 22, 0],
  });
  rMem.writeBattleMon(POKEMON_RED_BLUE_MEM, {
    hp: 31,
    maxHp: 35,
    level: 10,
    moves: [10, 45, 52, 0],
    pp: [35, 40, 22, 0],
  });
  rMem.write16(0xcfe6, 17);
  rMem.clearTileMap();
  rMem.writeTileText(9, 2, 'TYPE/');
  rMem.ram[0xc3a0 + 14 * 20 + 5] = 0xed;

  const rPos = readPokemonRedOverworldPos(rMem.readMem);
  assert.deepEqual(rPos, {
    isInBattle: 1,
    map: 3,
    y: 14,
    x: 9,
    tileset: 0,
    mapHeight: 36,
    mapWidth: 40,
    partyCount: 1,
    facing: 0x04,
    movementFlags: 0x80,
  });

  const rSnap = readPokemonRedSnapshot(rMem.readMem);
  assert.equal(rSnap.enemyHp, 17);
  assert.equal(rSnap.party[0].species, 176);
  assert.equal(rSnap.battleMon.hp, 31);
  assert.equal(rSnap.hasTypeBox, true);
  assert.deepEqual(rSnap.cursorPos, { row: 14, col: 5 });
});

test('RAM-backed Pokémon Yellow round-trip Auto-Fight flow selects Thundershock, flees out-of-PP, heals at Viridian, and returns', () => {
  const profile = getAutoFightProfile('POKEMON YELLOW');
  assert.ok(profile);
  const { ram, readMem, writeTileText, clearTileMap, writePartyMon, writeBattleMon } =
    createGen1Memory();
  const af = createAutoFight();

  const setOverworld = ({ map, x, y, tileset, mapWidth, mapHeight, facing = 0x00, flags = 0 }) => {
    ram[0xd056] = 0;
    ram[0xd35d] = map;
    ram[0xd361] = x;
    ram[0xd360] = y;
    ram[0xd366] = tileset;
    ram[0xd367] = mapHeight / 2;
    ram[0xd368] = mapWidth / 2;
    ram[0xc109] = facing;
    ram[0xd735] = flags;
  };

  ram[0xd162] = 1;
  writePartyMon(profile.mem, 0, {
    species: 0x54, // Pikachu
    hp: 22,
    maxHp: 22,
    level: 6,
    moves: [45, 84, 0, 0], // Growl (non-attack), Thundershock
    pp: [40, 30, 0, 0],
  });

  // 1. Observe Viridian PokéCenter -> exit to Viridian -> walk to Route 1
  setOverworld({ map: 0x29, x: 3, y: 7, tileset: 6, mapWidth: 14, mapHeight: 8, facing: 0x00 });
  af.observe(profile.readOverworldPos(readMem));
  assert.equal(af.getState().pokeCenterName, 'Viridian Heal Center');

  for (const [x, y] of [
    [23, 25],
    [23, 26],
    [23, 27],
  ]) {
    setOverworld({ map: 1, x, y, tileset: 0, mapWidth: 40, mapHeight: 36, facing: 0x00 });
    af.observe(profile.readOverworldPos(readMem));
  }
  for (const [x, y] of [
    [10, 0],
    [10, 1],
    [10, 2],
  ]) {
    setOverworld({ map: 12, x, y, tileset: 0, mapWidth: 20, mapHeight: 36, facing: 0x00 });
    af.observe(profile.readOverworldPos(readMem));
  }
  assert.equal(af.getState().hasHealPath, true);

  // 2. Start Auto-Fight on Route 1
  af.start(profile.readSnapshot(readMem));
  let res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.active, true);
  assert.equal(res.phase, 'moving');

  // 3. Wild battle: select FIGHT, then skip Growl (slot 0) to pick Thundershock (slot 1)
  ram[0xd056] = 1;
  writeBattleMon(profile.mem, {
    hp: 22,
    maxHp: 22,
    level: 6,
    moves: [45, 84, 0, 0],
    pp: [40, 30, 0, 0],
  });
  clearTileMap();
  writeTileText(14, 10, 'FIGHT');
  writeTileText(16, 16, 'RUN');
  ram[0xc3a0 + 14 * 20 + 9] = 0xed;
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.phase, 'fighting');
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 16; i++) af.step(profile.readSnapshot(readMem));

  // Move selection menu: cursor starts at slot 0 (Growl) -> moves down to slot 1 (Thundershock) -> presses A
  clearTileMap();
  writeTileText(9, 2, 'TYPE/');
  ram[0xc3a0 + 13 * 20 + 5] = 0xed;
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.buttons.down, true);
  for (let i = 0; i < 8; i++) af.step(profile.readSnapshot(readMem));

  clearTileMap();
  writeTileText(9, 2, 'TYPE/');
  ram[0xc3a0 + 14 * 20 + 5] = 0xed;
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 14; i++) af.step(profile.readSnapshot(readMem));

  // 4. Out of Thundershock PP on main battle menu -> flees to RUN and returns to Viridian Heal Center
  ram[0xd02d] = 0; // battleMon slot 1 PP = 0
  ram[0xd188] = 0; // partyMon1 slot 1 PP = 0
  clearTileMap();
  writeTileText(14, 10, 'FIGHT');
  writeTileText(16, 16, 'RUN');
  ram[0xc3a0 + 14 * 20 + 9] = 0xed;
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.phase, 'fleeing');
  assert.equal(res.buttons.down, true);
  for (let i = 0; i < 8; i++) af.step(profile.readSnapshot(readMem));

  ram[0xc3a0 + 14 * 20 + 9] = 0x7f;
  ram[0xc3a0 + 16 * 20 + 9] = 0xed;
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.buttons.right, true);
  for (let i = 0; i < 8; i++) af.step(profile.readSnapshot(readMem));

  ram[0xc3a0 + 16 * 20 + 9] = 0x7f;
  ram[0xc3a0 + 16 * 20 + 15] = 0xed;
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 16; i++) af.step(profile.readSnapshot(readMem));

  // 5. Overworld return path back to Viridian Heal Center
  clearTileMap();
  for (const [x, y] of [
    [10, 2],
    [10, 1],
    [10, 0],
  ]) {
    setOverworld({ map: 12, x, y, tileset: 0, mapWidth: 20, mapHeight: 36 });
    res = af.step(profile.readSnapshot(readMem));
    assert.equal(res.phase, 'returning');
    assert.equal(res.buttons.up, true);
  }
  for (const [x, y] of [
    [23, 27],
    [23, 26],
    [23, 25],
  ]) {
    setOverworld({ map: 1, x, y, tileset: 0, mapWidth: 40, mapHeight: 36 });
    res = af.step(profile.readSnapshot(readMem));
    assert.equal(res.phase, 'returning');
    assert.equal(res.buttons.up, true);
  }

  // 6. Heal at Viridian PokéCenter (align x before y, face up, talk, close dialogue without pressing A, exit)
  setOverworld({ map: 0x29, x: 4, y: 7, tileset: 6, mapWidth: 14, mapHeight: 8, facing: 0x04 });
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.phase, 'healing');
  assert.equal(res.buttons.left, true);

  setOverworld({ map: 0x29, x: 3, y: 3, tileset: 6, mapWidth: 14, mapHeight: 8, facing: 0x04 });
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(af.getState().healSubphase, 'talking_nurse');
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 12; i++) af.step(profile.readSnapshot(readMem));

  ram[0xd188] = 30; // Healed!
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(af.getState().healSubphase, 'closing_dialogue');
  assert.equal(res.buttons.b, true);
  assert.equal(res.buttons.a, false);
  for (let i = 0; i < 8; i++) {
    const mid = af.step(profile.readSnapshot(readMem));
    assert.equal(mid.buttons.a, false);
  }

  setOverworld({ map: 0x29, x: 3, y: 4, tileset: 6, mapWidth: 14, mapHeight: 8, facing: 0x00 });
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(af.getState().healSubphase, 'exiting');
  assert.equal(res.buttons.down, true);

  // 7. Exit and walk back to grind spot (12, 10, 2)
  for (const [x, y] of [
    [23, 25],
    [23, 26],
    [23, 27],
  ]) {
    setOverworld({ map: 1, x, y, tileset: 0, mapWidth: 40, mapHeight: 36 });
    res = af.step(profile.readSnapshot(readMem));
    assert.equal(res.phase, 'walking_back');
    assert.equal(res.buttons.down, true);
  }
  for (const [x, y] of [
    [10, 0],
    [10, 1],
  ]) {
    setOverworld({ map: 12, x, y, tileset: 0, mapWidth: 20, mapHeight: 36 });
    res = af.step(profile.readSnapshot(readMem));
    assert.equal(res.phase, 'walking_back');
    assert.equal(res.buttons.down, true);
  }
  setOverworld({ map: 12, x: 10, y: 2, tileset: 0, mapWidth: 20, mapHeight: 36 });
  res = af.step(profile.readSnapshot(readMem));
  assert.equal(res.active, true);
  assert.equal(res.phase, 'moving');
  assert.deepEqual(af.getState().anchor, { map: 12, x: 10, y: 2 });
});
