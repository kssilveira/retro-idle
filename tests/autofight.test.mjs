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
  assert.equal(res.stopReason, 'out of PP');

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
  assert.equal(res.stopReason, 'out of PP');

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
  assert.equal(res.stopReason, 'out of PP');
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
