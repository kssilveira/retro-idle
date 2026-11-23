import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRYSTAL_POKECENTER_CONFIGS,
  NEUTRAL_BUTTONS,
  POKEMON_CRYSTAL_MEM,
  POKEMON_RED_BLUE_MEM,
  POKEMON_YELLOW_MEM,
  createAutoFight,
  encodeCrystalMapId,
  getAutoFightProfile,
  pickAttackSlot,
  readPokemonCrystalOverworldPos,
  readPokemonCrystalSnapshot,
  readPokemonGen1OverworldPos,
  readPokemonGen1Snapshot,
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

test('getAutoFightProfile recognizes Red, Blue, Yellow, Crystal and rejects unsupported ROMs', () => {
  const red = getAutoFightProfile('POKEMON RED');
  assert.ok(red);
  assert.equal(red.id, 'pokemon-red-blue');
  assert.equal(red.name, 'Pokémon Red');
  assert.equal(red.mem, POKEMON_RED_BLUE_MEM);

  const blue = getAutoFightProfile(' pokemon blue ');
  assert.ok(blue);
  assert.equal(blue.id, 'pokemon-red-blue');
  assert.equal(blue.name, 'Pokémon Blue');

  const yellow = getAutoFightProfile(' pokemon yellow ');
  assert.ok(yellow);
  assert.equal(yellow.id, 'pokemon-yellow');
  assert.equal(yellow.name, 'Pokémon Yellow');
  assert.equal(yellow.mem, POKEMON_YELLOW_MEM);

  for (const title of ['PM_CRYSTAL', ' pm_crystal ', 'POKEMON CRYSTAL']) {
    const crystal = getAutoFightProfile(title);
    assert.ok(crystal);
    assert.equal(crystal.id, 'pokemon-crystal');
    assert.equal(crystal.name, 'Pokémon Crystal');
    assert.equal(crystal.mem, POKEMON_CRYSTAL_MEM);
    assert.equal(crystal.pokeCenterConfigs, CRYSTAL_POKECENTER_CONFIGS);
  }
  assert.equal(Object.keys(CRYSTAL_POKECENTER_CONFIGS).length, 22);

  assert.equal(getAutoFightProfile('MBC3 TEST'), null);
  assert.equal(getAutoFightProfile('TETRIS'), null);
  assert.equal(getAutoFightProfile(''), null);
});

test('pickAttackSlot skips status, conditional, and self-KO moves (Gen 1 & Gen 2) and masks PP Ups', () => {
  // Growl (45), Leer (43), Splash (150), Selfdestruct (120) are all non-attacks
  assert.equal(pickAttackSlot([45, 43, 150, 120], [40, 30, 40, 5]), -1);

  // Scratch at 0 PP (with 1 PP Up encoded as 0x40), Growl skipped, Ember at 25 PP -> slot 2
  assert.equal(pickAttackSlot([10, 45, 52, 0], [0x40, 40, 25, 0]), 2);

  // Scratch with 3 PP Ups and 1 PP remaining (0xC1) -> slot 0
  assert.equal(pickAttackSlot([10, 45, 52, 0], [0xc1, 40, 25, 0]), 0);

  // Gen 2: False Swipe (206), Perish Song (195), Snore (173), Protect (182) -> all skipped
  assert.equal(pickAttackSlot([206, 195, 173, 182], [40, 5, 15, 10]), -1);
  // Charm (204), Baton Pass (226), Mirror Coat (243), Belly Drum (187) -> all skipped
  assert.equal(pickAttackSlot([204, 226, 243, 187], [20, 40, 20, 10]), -1);
  // Pain Split (220), Curse (174), Crunch (242) -> selects Crunch (slot 2)
  assert.equal(pickAttackSlot([220, 174, 242, 0], [20, 10, 15, 0]), 2);
  // Flame Wheel (172), Return (216), Hidden Power (237)
  assert.equal(pickAttackSlot([206, 172, 216, 237], [40, 0, 20, 15]), 2);
  assert.equal(pickAttackSlot([206, 172, 216, 237], [40, 25, 0, 0]), 1);
  assert.equal(pickAttackSlot([206, 172, 216, 237], [40, 0, 0, 15]), 3);
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
});

test('proactive low-HP healing: triggers round-trip heal at <= 30% HP (with full PP), ignores > 30% HP, and stops if missing Heal Center', () => {
  // 1. Without Heal Center path: stops in overworld, battle main menu, and move selection menu (not mid-animation)
  const lowHpParty = [
    { species: 176, hp: 8, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] }, // 8/27 = 29.6% <= 30%
  ];
  const aboveThresholdParty = [
    { species: 176, hp: 9, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] }, // 9/27 = 33.3% > 30%
  ];

  const afAbove = createAutoFight();
  afAbove.start(makeSnapshot({ party: aboveThresholdParty }));
  assert.equal(afAbove.step(makeSnapshot({ party: aboveThresholdParty })).phase, 'moving');

  const afNoPathOw = createAutoFight();
  afNoPathOw.start(makeSnapshot({ party: lowHpParty }));
  let res = afNoPathOw.step(makeSnapshot({ party: lowHpParty }));
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'low HP (missing Heal Center path — visit a Heal Center first)');
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);

  const lowHpBattleMon = { hp: 8, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] };
  const afNoPathBattle = createAutoFight();
  afNoPathBattle.start(makeSnapshot({ isInBattle: 1 }));
  // Mid-animation (no menus visible yet) keeps stepping without premature stop
  assert.equal(
    afNoPathBattle.step(makeSnapshot({ isInBattle: 1, battleMon: lowHpBattleMon })).active,
    true
  );
  for (let i = 0; i < 10; i++) {
    afNoPathBattle.step(makeSnapshot({ isInBattle: 1, battleMon: lowHpBattleMon }));
  }
  res = afNoPathBattle.step(
    makeSnapshot({
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      hasRun: true,
      cursorPos: { row: 14, col: 9 },
      battleMon: lowHpBattleMon,
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'low HP (missing Heal Center path — visit a Heal Center first)');

  const afNoPathMove = createAutoFight();
  afNoPathMove.start(makeSnapshot({ isInBattle: 1 }));
  res = afNoPathMove.step(
    makeSnapshot({
      isInBattle: 1,
      hasTypeBox: true,
      cursorPos: { row: 13, col: 5 },
      battleMon: lowHpBattleMon,
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'low HP (missing Heal Center path — visit a Heal Center first)');

  // 2. With Heal Center path: flees Move Selection Menu at <= 30% HP (even with full PP), heals HP at Heal Center, and returns
  const af = createAutoFight();
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 0, partyCount: 1, facing: 0x00 });
  af.start(makeSnapshot({ map: 12, x: 10, y: 0 }));

  res = af.step(
    makeSnapshot({
      map: 12,
      x: 10,
      y: 0,
      isInBattle: 1,
      hasTypeBox: true,
      cursorPos: { row: 13, col: 5 },
      battleMon: lowHpBattleMon,
    })
  );
  assert.equal(res.active, true);
  assert.equal(res.phase, 'fleeing');
  assert.equal(res.buttons.b, true);
  for (let i = 0; i < 12; i++) {
    af.step(
      makeSnapshot({
        map: 12,
        x: 10,
        y: 0,
        isInBattle: 1,
        hasTypeBox: true,
        cursorPos: { row: 13, col: 5 },
        battleMon: lowHpBattleMon,
      })
    );
  }

  // Battle Menu navigates FIGHT -> RUN
  res = af.step(
    makeSnapshot({
      map: 12,
      x: 10,
      y: 0,
      isInBattle: 1,
      fightPos: { row: 14, col: 10 },
      runPos: { row: 16, col: 16 },
      hasRun: true,
      cursorPos: { row: 14, col: 9 },
      battleMon: lowHpBattleMon,
    })
  );
  assert.equal(res.phase, 'fleeing');
  assert.equal(res.buttons.down, true);

  // Overworld returns along trail -> enters PokéCenter -> heals HP (while PP was already full!) -> walks back
  res = af.step(makeSnapshot({ map: 12, x: 10, y: 0, party: lowHpParty }));
  assert.equal(res.phase, 'returning');
  assert.equal(res.buttons.up, true);

  res = af.step(makeSnapshot({ map: 1, x: 23, y: 25, party: lowHpParty }));
  assert.equal(res.phase, 'returning');
  assert.equal(res.buttons.up, true);

  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 7, facing: 0x04, party: lowHpParty }));
  assert.equal(res.phase, 'healing');
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: lowHpParty }));
  assert.equal(af.getState().healSubphase, 'talking_nurse');
  for (let i = 0; i < 12; i++) {
    af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: lowHpParty }));
  }

  // Healed HP triggers closing_dialogue even though PP did not change
  const healedParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
  ];
  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty }));
  assert.equal(af.getState().healSubphase, 'closing_dialogue');
  assert.equal(res.buttons.b, true);
  for (let i = 0; i < 8; i++) {
    assert.equal(
      af.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty })).buttons.a,
      false
    );
  }

  res = af.step(makeSnapshot({ map: 0x29, x: 3, y: 4, facing: 0x00, party: healedParty }));
  assert.equal(af.getState().healSubphase, 'exiting');
  res = af.step(makeSnapshot({ map: 1, x: 23, y: 25, party: healedParty }));
  assert.equal(res.phase, 'walking_back');
  res = af.step(makeSnapshot({ map: 12, x: 10, y: 0, party: healedParty }));
  assert.equal(res.phase, 'moving');

  // 3. Overworld low HP on arrival/start also triggers returning immediately when Heal Center path exists
  res = af.step(makeSnapshot({ map: 12, x: 10, y: 0, party: lowHpParty }));
  assert.equal(res.active, true);
  assert.equal(res.phase, 'returning');
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

  // Battle HP reaches 0 -> stops with 'fainted'
  res = af.step(
    makeSnapshot({
      isInBattle: 1,
      battleMon: { hp: 0, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'fainted');
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);

  // Even with a Heal Center path, fainting / blackout stops cleanly with 'fainted'
  const afWithPath = createAutoFight();
  afWithPath.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  afWithPath.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00 });
  afWithPath.start(makeSnapshot({ map: 1, x: 23, y: 25 }));
  res = afWithPath.step(makeSnapshot({ map: 1, x: 23, y: 25, isInBattle: 0xff }));
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'fainted');
  assert.deepEqual(res.buttons, NEUTRAL_BUTTONS);

  // Overworld all party HP 0 -> stops with 'fainted'
  const afDeadParty = createAutoFight();
  afDeadParty.start(makeSnapshot());
  res = afDeadParty.step(
    makeSnapshot({
      party: [{ species: 176, hp: 0, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] }],
    })
  );
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'fainted');

  // Empty party stops cleanly with 'fainted'
  const afEmptyParty = createAutoFight();
  afEmptyParty.start(makeSnapshot());
  res = afEmptyParty.step(makeSnapshot({ partyCount: 0, party: [] }));
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'fainted');

  // Trainer battle
  const afTrainer = createAutoFight();
  afTrainer.start(makeSnapshot());
  res = afTrainer.step(makeSnapshot({ isInBattle: 2 }));
  assert.equal(res.active, false);
  assert.equal(res.stopReason, 'trainer battle');
});

test('stops immediately with neutral buttons when learning a move', () => {
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
});

test('passive PokéCenter trail tracking: ignores title screen, records exit, prunes loops, and resets on new PokéCenter', () => {
  const af = createAutoFight();

  // Title screen / empty party should not record PokéCenter
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 0, facing: 0x00 });
  assert.equal(af.getState().pokeCenterMap, null);
  assert.equal(af.getState().trailLength, 0);

  // Inside Viridian PokéCenter (0x29) with a party
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  assert.equal(af.getState().pokeCenterMap, 0x29);

  // Exit onto Viridian City (map 1)
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00 });
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
    af.observe({ isInBattle: 0, map: 1, x, y, partyCount: 1, facing: 0x00 });
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

  // Cross-map transition records enterDir / exitDir
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 27, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 0, partyCount: 1, facing: 0x00 });
  const cross = af.exportTrail();
  const crossNode = cross.trail[cross.trail.length - 1];
  assert.equal(crossNode.map, 12);
  assert.equal(crossNode.enterDir, 'down');
  assert.equal(crossNode.exitDir, 'up');

  // Entering a different PokéCenter (Pewter 0x3a) resets trail
  af.observe({ isInBattle: 0, map: 0x3a, x: 3, y: 7, partyCount: 1, facing: 0x04 });
  assert.equal(af.getState().pokeCenterMap, 0x3a);
  assert.equal(af.getState().trailLength, 0);
  assert.equal(af.exportTrail(), null);
});

test('round-trip heal & return: flees out-of-PP battle, handles ambush, heals without re-talking, resumes grind, and repeats', () => {
  const af = createAutoFight();

  // Observe outbound walk from Viridian PokéCenter (0x29) -> Viridian City (1) -> Route 1 (12)
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  for (const [x, y] of [
    [23, 25],
    [23, 26],
    [23, 27],
  ]) {
    af.observe({ isInBattle: 0, map: 1, x, y, partyCount: 1, facing: 0x00 });
  }
  for (const [x, y] of [
    [10, 0],
    [10, 1],
    [10, 2],
  ]) {
    af.observe({ isInBattle: 0, map: 12, x, y, partyCount: 1, facing: 0x00 });
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

test('stops after generic blocked timeout when stuck (returning and walking back), and clears stuck counter if movement resumes', () => {
  const af = createAutoFight();

  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 27, partyCount: 1, facing: 0x00 });

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

  // Also stops after 240 blocked frames when walking_back to grind spot
  const afWalkBack = createAutoFight();
  afWalkBack.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  afWalkBack.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00 });
  afWalkBack.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00 });
  afWalkBack.start(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
  afWalkBack.step(makeSnapshot({ map: 1, x: 23, y: 26, party: zeroPpParty }));
  afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: zeroPpParty }));
  for (let i = 0; i < 12; i++) {
    afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: zeroPpParty }));
  }
  const healedParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 0, 0], pp: [35, 40, 0, 0] },
  ];
  afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty }));
  for (let i = 0; i < 8; i++) {
    afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 3, facing: 0x04, party: healedParty }));
  }
  afWalkBack.step(makeSnapshot({ map: 0x29, x: 3, y: 4, facing: 0x00, party: healedParty }));
  afWalkBack.step(makeSnapshot({ map: 1, x: 23, y: 25, party: healedParty }));
  for (let i = 0; i < 268; i++) {
    res = afWalkBack.step(makeSnapshot({ map: 1, x: 23, y: 25, party: healedParty }));
    assert.equal(res.active, true);
    assert.equal(res.phase, 'walking_back');
  }
  res = afWalkBack.step(makeSnapshot({ map: 1, x: 23, y: 25, party: healedParty }));
  assert.equal(res.active, false);
  assert.match(res.stopReason, /returning to grind spot/i);
});

test('exportTrail / importTrail round-trip preserves heal route and rejects invalid payloads', () => {
  const af1 = createAutoFight();
  af1.observe({ isInBattle: 0, map: 0x3a, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  af1.observe({ isInBattle: 0, map: 3, x: 13, y: 25, partyCount: 1, facing: 0x00 });
  af1.observe({ isInBattle: 0, map: 3, x: 13, y: 26, partyCount: 1, facing: 0x00 });
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
  af2.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  for (let i = 0; i < 24; i++) {
    af2.observe({ isInBattle: 0, map: 1, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  }
  // Frame 25 snaps to real outside coords (23, 25) and continues walking
  af2.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00 });
  af2.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x00 });
  // Turn north at (23, 26) before entering gate map (0x2f)
  af2.observe({ isInBattle: 0, map: 1, x: 23, y: 26, partyCount: 1, facing: 0x04 });
  // Walk into a gate map (0x2f): wCurMap changes first for 24 frames at old coords (23, 26)
  for (let i = 0; i < 24; i++) {
    af2.observe({ isInBattle: 0, map: 0x2f, x: 23, y: 26, partyCount: 1, facing: 0x04 });
  }
  // Destination inside gate snaps to (4, 7) -> preserves enterDir/exitDir from (23, 26)
  af2.observe({ isInBattle: 0, map: 0x2f, x: 4, y: 7, partyCount: 1, facing: 0x04 });
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

test('stepMoving respects cooldown before re-anchoring after battle', () => {
  const af = createAutoFight();
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 5, partyCount: 1, facing: 0x00 });

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
});

test('stopping during healing or exiting warp fade-out keeps inPokeCenter true and records fresh trail on exit', () => {
  const zeroPpParty = [
    { species: 176, hp: 20, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [0, 40, 0, 0] },
  ];
  const healedParty = [
    { species: 176, hp: 27, maxHp: 27, level: 9, moves: [10, 45, 52, 0], pp: [35, 40, 25, 0] },
  ];

  const af = createAutoFight();
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, tileset: 6, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, tileset: 0, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, tileset: 0, partyCount: 1, facing: 0x00 });

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
    af.observe({ isInBattle: 0, map: 1, x: 3, y: 7, tileset: 6, partyCount: 1, facing: 0x00 });
    assert.equal(af.getState().inPokeCenter, true);
    assert.equal(af.getState().trailLength, 0);
  }

  // Outside tileset loads at (1, 23, 25) -> fresh trail starts cleanly
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, tileset: 0, partyCount: 1, facing: 0x00 });
  assert.equal(af.getState().inPokeCenter, false);
  assert.equal(af.getState().hasHealPath, true);
  assert.equal(af.getState().trailLength, 1);
  const exported = af.exportTrail();
  assert.deepEqual(exported.trail.map((n) => [n.map, n.x, n.y]), [[1, 23, 25]]);
  assert.equal(exported.trail[0].enterDir, 'down');
  assert.equal(exported.trail[0].exitDir, 'up');
});

test('redundant stop() while inactive preserves trail/inPokeCenter and hasHealPath tracks manual backtracking', () => {
  const af = createAutoFight();
  af.observe({ isInBattle: 0, map: 0x29, x: 3, y: 7, tileset: 6, partyCount: 1, facing: 0x00 });
  af.stop('manual');
  assert.equal(af.getState().inPokeCenter, true);
  assert.equal(af.getState().pokeCenterMap, 0x29);

  af.observe({ isInBattle: 0, map: 1, x: 23, y: 25, tileset: 0, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, tileset: 0, partyCount: 1, facing: 0x00 });
  af.observe({ isInBattle: 0, map: 12, x: 10, y: 0, tileset: 0, partyCount: 1, facing: 0x00 });

  af.start(makeSnapshot({ map: 12, x: 10, y: 0 }));
  af.stop('manual');
  // Redundant stop while already inactive must not alter trail
  af.stop('manual');
  assert.equal(af.getState().hasHealPath, true);
  assert.equal(af.getState().trailLength, 3);

  // Manually walk back onto map 1 (while anchor was map 12) -> hasHealPath must reflect map 1
  af.observe({ isInBattle: 0, map: 1, x: 23, y: 26, tileset: 0, partyCount: 1, facing: 0x04 });
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

test('readPokemonGen1OverworldPos and readPokemonGen1Snapshot read Red/Blue and Yellow WRAM offsets and tilemap menus', () => {
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

  yMem.clearTileMap();
  yMem.writeTileText(14, 10, 'FIGHT');
  yMem.writeTileText(16, 16, 'RUN');
  yMem.ram[0xc3a0 + 14 * 20 + 9] = 0xed;

  const yPos = readPokemonGen1OverworldPos(yMem.readMem, POKEMON_YELLOW_MEM);
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
  });

  const ySnapBattle = readPokemonGen1Snapshot(yMem.readMem, POKEMON_YELLOW_MEM);
  assert.equal(ySnapBattle.isInBattle, 1);
  assert.equal(ySnapBattle.map, 12);
  assert.equal(ySnapBattle.x, 11);
  assert.equal(ySnapBattle.y, 7);
  assert.equal(ySnapBattle.tileset, 3);
  assert.equal(ySnapBattle.mapHeight, 36);
  assert.equal(ySnapBattle.mapWidth, 20);
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
  assert.equal(ySnapBattle.hasTypeBox, false);
  assert.deepEqual(ySnapBattle.fightPos, { row: 14, col: 10 });
  assert.deepEqual(ySnapBattle.runPos, { row: 16, col: 16 });
  assert.equal(ySnapBattle.hasRun, true);
  assert.deepEqual(ySnapBattle.cursorPos, { row: 14, col: 9 });

  yMem.clearTileMap();
  yMem.writeTileText(9, 2, 'TYPE/');
  yMem.ram[0xc3a0 + 13 * 20 + 5] = 0xed;
  const ySnapMove = readPokemonGen1Snapshot(yMem.readMem, POKEMON_YELLOW_MEM);
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
  rMem.clearTileMap();
  rMem.writeTileText(9, 2, 'TYPE/');
  rMem.ram[0xc3a0 + 14 * 20 + 5] = 0xed;

  const rPos = readPokemonGen1OverworldPos(rMem.readMem, POKEMON_RED_BLUE_MEM);
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
  });

  const rSnap = readPokemonGen1Snapshot(rMem.readMem, POKEMON_RED_BLUE_MEM);
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

  const setOverworld = ({ map, x, y, tileset, mapWidth, mapHeight, facing = 0x00 }) => {
    ram[0xd056] = 0;
    ram[0xd35d] = map;
    ram[0xd361] = x;
    ram[0xd360] = y;
    ram[0xd366] = tileset;
    ram[0xd367] = mapHeight / 2;
    ram[0xd368] = mapWidth / 2;
    ram[0xc109] = facing;
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

function createCrystalMemory() {
  const ram = new Uint8Array(0x10000);
  const mem = POKEMON_CRYSTAL_MEM;
  const readMem = (addr) => ram[addr & 0xffff];
  const write16 = (addr, val) => {
    ram[addr] = (val >> 8) & 0xff;
    ram[addr + 1] = val & 0xff;
  };
  const writeTileText = (row, col, text, tileMapAddr = mem.tileMap) => {
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
  const clearTileMap = (tileMapAddr = mem.tileMap) => {
    ram.fill(0x7f, tileMapAddr, tileMapAddr + 18 * 20);
  };
  const writePartyMon = (idx, mon) => {
    ram[mem.partySpecies + idx] = mon.isEgg ? 0xfd : mon.species;
    const base = mem.partyMon1 + idx * 0x30;
    ram[base] = mon.species;
    for (let i = 0; i < 4; i++) {
      ram[base + 0x02 + i] = mon.moves?.[i] ?? 0;
      ram[base + 0x17 + i] = mon.pp?.[i] ?? 0;
    }
    ram[base + 0x1f] = mon.level ?? 0;
    write16(base + 0x22, mon.hp ?? 0);
    write16(base + 0x24, mon.maxHp ?? 0);
  };
  const writeBattleMon = (mon) => {
    const base = mem.battleMon;
    ram[base] = mon.species ?? 0;
    for (let i = 0; i < 4; i++) {
      ram[base + 0x02 + i] = mon.moves?.[i] ?? 0;
      ram[base + 0x08 + i] = mon.pp?.[i] ?? 0;
    }
    ram[base + 0x0d] = mon.level ?? 0;
    write16(base + 0x10, mon.hp ?? 0);
    write16(base + 0x12, mon.maxHp ?? 0);
  };
  const setOverworld = ({
    mapGroup,
    mapNumber,
    x,
    y,
    tileset = 1,
    mapWidth = 20,
    mapHeight = 18,
    facing = 0x00,
    battleMode = 0,
  }) => {
    ram[mem.battleMode] = battleMode;
    ram[mem.mapGroup] = mapGroup;
    ram[mem.mapNumber] = mapNumber;
    ram[mem.yCoord] = y;
    ram[mem.xCoord] = x;
    ram[mem.curMapTileset] = tileset;
    ram[mem.curMapHeight] = mapHeight / 2;
    ram[mem.curMapWidth] = mapWidth / 2;
    ram[mem.playerDirection] = facing;
  };
  return {
    ram,
    mem,
    readMem,
    write16,
    writeTileText,
    clearTileMap,
    writePartyMon,
    writeBattleMon,
    setOverworld,
  };
}

test('readPokemonCrystalOverworldPos and readPokemonCrystalSnapshot read Gen 2 WRAM, Eggs, and Disabled box', () => {
  const cm = createCrystalMemory();
  cm.setOverworld({
    mapGroup: 26,
    mapNumber: 3,
    x: 12,
    y: 9,
    tileset: 1,
    mapWidth: 40,
    mapHeight: 18,
    facing: 0x0c,
    battleMode: 1,
  });
  cm.ram[cm.mem.partyCount] = 2;
  cm.writePartyMon(0, {
    species: 175, // Togepi inside Egg (0xFD in wPartySpecies)
    isEgg: true,
    hp: 0,
    maxHp: 0,
    level: 1,
    moves: [45, 204, 0, 0],
    pp: [40, 20, 0, 0],
  });
  cm.writePartyMon(1, {
    species: 158, // Totodile
    hp: 21,
    maxHp: 23,
    level: 6,
    moves: [10, 43, 55, 0],
    pp: [35, 30, 0x40 | 20, 0],
  });
  cm.writeBattleMon({
    species: 158,
    moves: [10, 43, 55, 0],
    pp: [35, 30, 20, 0],
    level: 6,
    hp: 21,
    maxHp: 23,
  });

  cm.clearTileMap();
  cm.writeTileText(14, 10, 'FIGHT');
  cm.writeTileText(16, 16, 'RUN');
  cm.ram[cm.mem.tileMap + 14 * 20 + 9] = 0xed;

  const pos = readPokemonCrystalOverworldPos(cm.readMem);
  assert.deepEqual(pos, {
    isInBattle: 1,
    map: encodeCrystalMapId(26, 3),
    mapGroup: 26,
    mapNumber: 3,
    y: 9,
    x: 12,
    tileset: 1,
    mapHeight: 18,
    mapWidth: 40,
    partyCount: 2,
    facing: 0x0c,
  });

  const snap = readPokemonCrystalSnapshot(cm.readMem);
  assert.equal(snap.party[0].isEgg, true);
  assert.equal(snap.party[0].hp, 0);
  assert.equal(snap.party[1].isEgg, false);
  assert.equal(snap.party[1].species, 158);
  assert.equal(snap.party[1].pp[2], 20);
  assert.equal(snap.battleMon.hp, 21);
  assert.equal(snap.battleMon.maxHp, 23);
  assert.deepEqual(snap.fightPos, { row: 14, col: 10 });
  assert.equal(snap.hasRun, true);
  assert.deepEqual(snap.cursorPos, { row: 14, col: 9 });

  // Disabled move info box triggers hasTypeBox
  cm.clearTileMap();
  cm.writeTileText(10, 1, 'Disabled!');
  cm.ram[cm.mem.tileMap + 13 * 20 + 5] = 0xed;
  const disabledSnap = readPokemonCrystalSnapshot(cm.readMem);
  assert.equal(disabledSnap.hasTypeBox, true);
  assert.deepEqual(disabledSnap.cursorPos, { row: 13, col: 5 });
});

test('RAM-backed Pokémon Crystal full round-trip Auto-Fight (Cherrygrove + Egg + Indigo Plateau + low-HP heal)', () => {
  const profile = getAutoFightProfile('PM_CRYSTAL');
  const cm = createCrystalMemory();
  const af = createAutoFight();

  // Party: Totodile + Mystery Egg (0xFD)
  cm.ram[cm.mem.partyCount] = 2;
  cm.writePartyMon(0, {
    species: 158,
    hp: 21,
    maxHp: 21,
    level: 6,
    moves: [43, 206, 55, 0], // Leer (non-attack), False Swipe (non-KO), Water Gun (attack)
    pp: [30, 40, 25, 0],
  });
  cm.writePartyMon(1, {
    species: 175,
    isEgg: true,
    hp: 0,
    maxHp: 0,
    level: 1,
    moves: [45, 0, 0, 0],
    pp: [40, 0, 0, 0],
  });

  // 1. Visit Cherrygrove Heal Center (26, 5) -> Cherrygrove City (26, 3) -> Route 30 (26, 1)
  cm.setOverworld({ mapGroup: 26, mapNumber: 5, x: 3, y: 7, tileset: 7, mapWidth: 10, mapHeight: 8 });
  af.observe(profile.readOverworldPos(cm.readMem));
  assert.equal(af.getState().pokeCenterName, 'Cherrygrove Heal Center');

  for (const [x, y] of [
    [29, 4],
    [29, 3],
    [29, 2],
  ]) {
    cm.setOverworld({ mapGroup: 26, mapNumber: 3, x, y, tileset: 1, mapWidth: 40, mapHeight: 18 });
    af.observe(profile.readOverworldPos(cm.readMem));
  }
  for (const [x, y] of [
    [8, 53],
    [8, 52],
  ]) {
    cm.setOverworld({ mapGroup: 26, mapNumber: 1, x, y, tileset: 1, mapWidth: 20, mapHeight: 54 });
    af.observe(profile.readOverworldPos(cm.readMem));
  }
  assert.equal(af.getState().hasHealPath, true);

  // 2. Start Auto-Fight on Route 30 -> wild battle -> select FIGHT -> Water Gun (slot 2)
  af.start(profile.readSnapshot(cm.readMem));
  assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'moving');

  cm.setOverworld({ mapGroup: 26, mapNumber: 1, x: 8, y: 52, tileset: 1, battleMode: 1 });
  cm.writeBattleMon({
    species: 158,
    moves: [43, 206, 55, 0],
    pp: [30, 40, 25, 0],
    level: 6,
    hp: 21,
    maxHp: 21,
  });
  cm.clearTileMap();
  cm.writeTileText(14, 10, 'FIGHT');
  cm.writeTileText(16, 16, 'RUN');
  cm.ram[cm.mem.tileMap + 14 * 20 + 9] = 0xed;

  let res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.phase, 'fighting');
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 16; i++) af.step(profile.readSnapshot(cm.readMem));

  // Move selection: skip Leer (0) and False Swipe (1) -> down x2 -> A on Water Gun (2)
  cm.clearTileMap();
  cm.writeTileText(9, 1, 'TYPE/');
  cm.ram[cm.mem.tileMap + 13 * 20 + 5] = 0xed;
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.buttons.down, true);
  for (let i = 0; i < 8; i++) af.step(profile.readSnapshot(cm.readMem));

  cm.ram[cm.mem.tileMap + 13 * 20 + 5] = 0x7f;
  cm.ram[cm.mem.tileMap + 14 * 20 + 5] = 0xed;
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.buttons.down, true);
  for (let i = 0; i < 8; i++) af.step(profile.readSnapshot(cm.readMem));

  cm.ram[cm.mem.tileMap + 14 * 20 + 5] = 0x7f;
  cm.ram[cm.mem.tileMap + 15 * 20 + 5] = 0xed;
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 14; i++) af.step(profile.readSnapshot(cm.readMem));

  // 3. Water Gun PP hits 0 -> flee to RUN -> return to Cherrygrove Heal Center
  cm.ram[cm.mem.battleMon + 0x0a] = 0;
  cm.ram[cm.mem.partyMon1 + 0x19] = 0;
  cm.clearTileMap();
  cm.writeTileText(14, 10, 'FIGHT');
  cm.writeTileText(16, 16, 'RUN');
  cm.ram[cm.mem.tileMap + 14 * 20 + 9] = 0xed;
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.phase, 'fleeing');
  assert.equal(res.buttons.down, true);
  for (let i = 0; i < 8; i++) af.step(profile.readSnapshot(cm.readMem));
  cm.ram[cm.mem.tileMap + 14 * 20 + 9] = 0x7f;
  cm.ram[cm.mem.tileMap + 16 * 20 + 9] = 0xed;
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.buttons.right, true);
  for (let i = 0; i < 8; i++) af.step(profile.readSnapshot(cm.readMem));
  cm.ram[cm.mem.tileMap + 16 * 20 + 9] = 0x7f;
  cm.ram[cm.mem.tileMap + 16 * 20 + 15] = 0xed;
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 16; i++) af.step(profile.readSnapshot(cm.readMem));

  // Walk back to Cherrygrove Heal Center
  cm.clearTileMap();
  for (const [x, y] of [
    [8, 52],
    [8, 53],
  ]) {
    cm.setOverworld({ mapGroup: 26, mapNumber: 1, x, y, tileset: 1, mapWidth: 20, mapHeight: 54 });
    assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'returning');
  }
  for (const [x, y] of [
    [29, 2],
    [29, 3],
    [29, 4],
  ]) {
    cm.setOverworld({ mapGroup: 26, mapNumber: 3, x, y, tileset: 1, mapWidth: 40, mapHeight: 18 });
    assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'returning');
  }

  // Enter Cherrygrove PokéCenter at right mat (4, 7) -> align x=3 -> walk to (3, 3) -> talk -> Egg does NOT block allFullHp!
  cm.setOverworld({ mapGroup: 26, mapNumber: 5, x: 4, y: 7, tileset: 7, facing: 0x04 });
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.phase, 'healing');
  assert.equal(res.buttons.left, true);

  cm.setOverworld({ mapGroup: 26, mapNumber: 5, x: 3, y: 3, tileset: 7, facing: 0x04 });
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(af.getState().healSubphase, 'talking_nurse');
  assert.equal(res.buttons.a, true);
  for (let i = 0; i < 12; i++) af.step(profile.readSnapshot(cm.readMem));

  cm.ram[cm.mem.partyMon1 + 0x19] = 25; // Water Gun PP healed (Egg stays hp=0, maxHp=0)
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(af.getState().healSubphase, 'closing_dialogue');
  assert.equal(res.buttons.b, true);
  for (let i = 0; i < 8; i++) {
    assert.equal(af.step(profile.readSnapshot(cm.readMem)).buttons.a, false);
  }

  cm.setOverworld({ mapGroup: 26, mapNumber: 5, x: 3, y: 4, tileset: 7, facing: 0x00 });
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(af.getState().healSubphase, 'exiting');
  assert.equal(res.buttons.down, true);

  for (const [x, y] of [
    [29, 4],
    [29, 3],
    [29, 2],
  ]) {
    cm.setOverworld({ mapGroup: 26, mapNumber: 3, x, y, tileset: 1, mapWidth: 40, mapHeight: 18 });
    assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'walking_back');
  }
  cm.setOverworld({ mapGroup: 26, mapNumber: 1, x: 8, y: 53, tileset: 1, mapWidth: 20, mapHeight: 54 });
  assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'walking_back');

  cm.setOverworld({ mapGroup: 26, mapNumber: 1, x: 8, y: 52, tileset: 1, mapWidth: 20, mapHeight: 54 });
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.phase, 'moving');
  assert.deepEqual(af.getState().anchor, { map: encodeCrystalMapId(26, 1), x: 8, y: 52 });

  // 4. Crystal proactive low-HP heal with Egg in party (6/21 HP, full PP)
  cm.writePartyMon(0, {
    species: 158,
    hp: 6,
    maxHp: 21,
    level: 6,
    moves: [43, 206, 55, 0],
    pp: [30, 40, 25, 0],
  });
  assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'returning');
  cm.setOverworld({ mapGroup: 26, mapNumber: 1, x: 8, y: 53, tileset: 1, mapWidth: 20, mapHeight: 54 });
  assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'returning');
  for (const [x, y] of [
    [29, 2],
    [29, 3],
    [29, 4],
  ]) {
    cm.setOverworld({ mapGroup: 26, mapNumber: 3, x, y, tileset: 1, mapWidth: 40, mapHeight: 18 });
    assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'returning');
  }
  cm.setOverworld({ mapGroup: 26, mapNumber: 5, x: 3, y: 3, tileset: 7, facing: 0x04 });
  assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'healing');
  for (let i = 0; i < 12; i++) af.step(profile.readSnapshot(cm.readMem));
  cm.write16(cm.mem.partyMon1 + 0x22, 21); // HP healed to 21/21
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(af.getState().healSubphase, 'closing_dialogue');
  assert.equal(res.buttons.b, true);
  for (let i = 0; i < 8; i++) {
    assert.equal(af.step(profile.readSnapshot(cm.readMem)).buttons.a, false);
  }
  cm.setOverworld({ mapGroup: 26, mapNumber: 5, x: 3, y: 4, tileset: 7, facing: 0x00 });
  res = af.step(profile.readSnapshot(cm.readMem));
  assert.equal(af.getState().healSubphase, 'exiting');
  for (const [x, y] of [
    [29, 4],
    [29, 3],
    [29, 2],
  ]) {
    cm.setOverworld({ mapGroup: 26, mapNumber: 3, x, y, tileset: 1, mapWidth: 40, mapHeight: 18 });
    assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'walking_back');
  }
  cm.setOverworld({ mapGroup: 26, mapNumber: 1, x: 8, y: 53, tileset: 1, mapWidth: 20, mapHeight: 54 });
  assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'walking_back');
  cm.setOverworld({ mapGroup: 26, mapNumber: 1, x: 8, y: 52, tileset: 1, mapWidth: 20, mapHeight: 54 });
  assert.equal(af.step(profile.readSnapshot(cm.readMem)).phase, 'moving');

  // 5. Verify Indigo Plateau nurse & exit navigation directly
  const afIndigoCenter = createAutoFight();
  cm.setOverworld({ mapGroup: 16, mapNumber: 2, x: 5, y: 13, tileset: 7, mapWidth: 18, mapHeight: 14 });
  afIndigoCenter.observe(profile.readOverworldPos(cm.readMem));
  cm.setOverworld({ mapGroup: 16, mapNumber: 1, x: 9, y: 6, tileset: 3, mapWidth: 20, mapHeight: 18 });
  afIndigoCenter.observe(profile.readOverworldPos(cm.readMem));
  cm.ram[cm.mem.partyMon1 + 0x19] = 0;
  afIndigoCenter.start(profile.readSnapshot(cm.readMem));
  afIndigoCenter.step(profile.readSnapshot(cm.readMem));
  // Enter Indigo Plateau PokéCenter at (5, 13) -> steers left to x=3, then up to y=9
  cm.setOverworld({ mapGroup: 16, mapNumber: 2, x: 5, y: 13, tileset: 7, facing: 0x04 });
  res = afIndigoCenter.step(profile.readSnapshot(cm.readMem));
  assert.equal(res.phase, 'healing');
  assert.equal(res.buttons.left, true);
  cm.setOverworld({ mapGroup: 16, mapNumber: 2, x: 3, y: 13, tileset: 7, facing: 0x04 });
  assert.equal(afIndigoCenter.step(profile.readSnapshot(cm.readMem)).buttons.up, true);
  cm.setOverworld({ mapGroup: 16, mapNumber: 2, x: 3, y: 9, tileset: 7, facing: 0x04 });
  assert.equal(afIndigoCenter.step(profile.readSnapshot(cm.readMem)).buttons.a, true);
  for (let i = 0; i < 12; i++) afIndigoCenter.step(profile.readSnapshot(cm.readMem));
  cm.ram[cm.mem.partyMon1 + 0x19] = 25;
  assert.equal(afIndigoCenter.step(profile.readSnapshot(cm.readMem)).buttons.b, true);
  for (let i = 0; i < 8; i++) afIndigoCenter.step(profile.readSnapshot(cm.readMem));
  cm.setOverworld({ mapGroup: 16, mapNumber: 2, x: 3, y: 10, tileset: 7, facing: 0x00 });
  assert.equal(afIndigoCenter.step(profile.readSnapshot(cm.readMem)).buttons.down, true);
  assert.equal(afIndigoCenter.getState().healSubphase, 'exiting');
  // Exiting aligns exitX=5 before walking down to exitY=13
  assert.equal(afIndigoCenter.step(profile.readSnapshot(cm.readMem)).buttons.right, true);
  cm.setOverworld({ mapGroup: 16, mapNumber: 2, x: 5, y: 10, tileset: 7, facing: 0x00 });
  assert.equal(afIndigoCenter.step(profile.readSnapshot(cm.readMem)).buttons.down, true);
});
