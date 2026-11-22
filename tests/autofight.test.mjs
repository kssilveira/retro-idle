import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEUTRAL_BUTTONS,
  createAutoFight,
  isPokemonRedBlueTitle,
  pickAttackSlot,
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
