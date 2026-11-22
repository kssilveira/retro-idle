import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildTestRom } from './make-test-rom.mjs';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const TMP_DIR = path.join(import.meta.dirname, '.tmp');
const ROM_PATH = path.join(TMP_DIR, 'mbc3-test.gb');
const IMPORTED_SAV_PATH = path.join(TMP_DIR, 'imported.sav');
const CHROME_PROFILE = path.join(TMP_DIR, 'chrome-profile');
const SCREENSHOT_PATH = path.join(TMP_DIR, 'screenshot.png');
const HTTP_PORT = 18765;
const CDP_PORT = 19222;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HAS_NON_BLANK_CANVAS_EXPR = `(() => {
  const c = document.getElementById('screen');
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let first = null;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (first === null) first = key;
    else if (key !== first) return true;
  }
  return false;
})()`;

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', reject);
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
      } else {
        this.events.push(msg);
      }
    });
  }

  async connect() {
    await this.openPromise;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, options = {}) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      ...options,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval exception: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

async function waitFor(fn, timeoutMs = 10000, intervalMs = 100) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const val = await fn();
    if (val) return val;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(ROM_PATH, buildTestRom());
  fs.rmSync(CHROME_PROFILE, { recursive: true, force: true });
  fs.mkdirSync(CHROME_PROFILE, { recursive: true });

  const server = spawn('python3', ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'], {
    cwd: REPO_DIR,
    stdio: 'ignore',
  });

  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${CHROME_PROFILE}`,
      '--window-size=900,800',
      `http://127.0.0.1:${HTTP_PORT}/`,
    ],
    { stdio: 'ignore' }
  );

  let client;
  try {
    await waitFor(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
        const targets = await res.json();
        return targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch {
        return null;
      }
    }, 10000, 150);

    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    const pageTarget = targets.find((t) => t.type === 'page');
    client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Runtime.enable');
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');

    await waitFor(async () => {
      return await client.eval(`Boolean(window.__retroIdle && document.getElementById('rom-input'))`);
    }, 10000, 100);

    const doc = await client.send('DOM.getDocument');
    const inputNode = await client.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '#rom-input',
    });
    await client.send('DOM.setFileInputFiles', {
      nodeId: inputNode.nodeId,
      files: [ROM_PATH],
    });

    await waitFor(async () => {
      return await client.eval(`Boolean(window.__retroIdle?.getEmulator()?.isPlaying) && ${HAS_NON_BLANK_CANVAS_EXPR}`);
    }, 12000, 100);

    const state = await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const c = document.getElementById('screen');
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const colors = new Set();
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 0) {
            colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
          }
          hash ^= data[i];
          hash = Math.imul(hash, 16777619);
        }
        return {
          playing: emu.isPlaying,
          sramSize: emu.sramSize,
          status: document.getElementById('status').textContent,
          activeTag: document.activeElement?.tagName,
          colorCount: colors.size,
          hash1: hash >>> 0,
        };
      })()
    `);

    assert.equal(state.playing, true, 'Expected binjgb playing');
    assert.equal(state.sramSize, 32768, 'Expected 32768-byte MBC3 SRAM');
    assert.match(state.status, /MBC3 TEST/, 'Status should contain ROM title');
    assert.match(state.status, /MBC3 \+ RAM \+ BATTERY/, 'Status should contain MBC3 type');
    assert.doesNotMatch(state.status, /resumed auto-save/, 'Initial fresh load should not report resumed auto-save');
    assert.notEqual(state.activeTag, 'INPUT', 'File input must be blurred after ROM load');
    assert.ok(state.colorCount >= 2, `Expected >= 2 colors (MBC3 pass), got ${state.colorCount}`);

    // Verify active VBlank animation (SCX increments every frame)
    await sleep(350);
    const hash2 = await client.eval(`
      (() => {
        const c = document.getElementById('screen');
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 4) {
          hash ^= data[i];
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      })()
    `);
    assert.notEqual(hash2, state.hash1, 'Canvas pixels should animate across VBlank frames');

    // Read BGP register (0xFF47) and WRAM test markers (0xC000=0x5A, 0xC001=0xA5) before key press
    const memCheck = await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        return {
          bgp: emu.readMem(0xff47),
          bank2Byte: emu.readMem(0xc000),
          sramByte: emu.readMem(0xc001),
        };
      })()
    `);
    assert.equal(memCheck.bank2Byte, 0x5a, `Expected WRAM[0xC000]=0x5A (MBC3 ROM bank 2), got 0x${memCheck.bank2Byte?.toString(16)}`);
    assert.equal(memCheck.sramByte, 0xa5, `Expected WRAM[0xC001]=0xA5 (MBC3 SRAM bank 1), got 0x${memCheck.sramByte?.toString(16)}`);
    assert.equal(memCheck.bgp, 0xe4, `Expected BGP 0xE4 before keyDown, got 0x${memCheck.bgp?.toString(16)}`);

    // Hold KeyX (A button) and confirm BGP flip to 0x1B
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'x',
      code: 'KeyX',
      windowsVirtualKeyCode: 88,
      nativeVirtualKeyCode: 88,
    });

    await waitFor(async () => {
      return await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0x1b`);
    }, 5000, 30);

    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'x',
      code: 'KeyX',
      windowsVirtualKeyCode: 88,
      nativeVirtualKeyCode: 88,
    });

    await waitFor(async () => {
      return await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4`);
    }, 5000, 30);

    // Pause / Resume button test + focus blur verification
    await client.eval(`document.getElementById('toggle-play').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getEmulator().isPaused === true && document.getElementById('toggle-play').textContent === 'Resume' && !document.getElementById('toggle-play').disabled`
        ),
      5000,
      30
    );
    const activeAfterPause = await client.eval(`document.activeElement?.tagName`);
    assert.notEqual(activeAfterPause, 'BUTTON', 'Pause button must blur after click');

    await client.eval(`document.getElementById('toggle-play').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getEmulator().isPlaying === true && document.getElementById('toggle-play').textContent === 'Pause' && !document.getElementById('toggle-play').disabled`
        ),
      5000,
      30
    );
    const finalStatus = await client.eval(`document.getElementById('status').textContent`);
    assert.match(finalStatus, /^Playing: MBC3 TEST/, `Expected Playing status after resume, got ${finalStatus}`);

    // Initial manual Save/Load + .sav Export/Import button states on a fresh profile
    const initialBtnStates = await client.eval(`({
      saveDisabled: document.getElementById('save-state-btn').disabled,
      loadDisabled: document.getElementById('load-state-btn').disabled,
      exportSavDisabled: document.getElementById('export-sav-btn').disabled,
      importSavDisabled: document.getElementById('import-sav-btn').disabled,
    })`);
    assert.equal(initialBtnStates.saveDisabled, false, 'Save State button should be enabled after ROM load');
    assert.equal(initialBtnStates.loadDisabled, true, 'Load State button should be disabled before any manual save');
    assert.equal(initialBtnStates.exportSavDisabled, false, 'Export .sav button should be enabled for MBC3+RAM');
    assert.equal(initialBtnStates.importSavDisabled, false, 'Import .sav button should be enabled for MBC3+RAM');

    // Intercept URL.createObjectURL to inspect exported .sav Blob bytes
    await client.eval(`
      (() => {
        window.__capturedSavs = [];
        const origCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (obj) => {
          if (obj instanceof Blob) {
            obj.arrayBuffer().then((buf) => {
              window.__capturedSavs.push(Array.from(new Uint8Array(buf)));
            });
          }
          return origCreate(obj);
        };
      })()
    `);

    await client.eval(`document.getElementById('export-sav-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('export-sav-btn').disabled && document.getElementById('status').textContent.includes('exported .sav') && window.__capturedSavs.length >= 1`
        ),
      5000,
      30
    );
    const exported1Info = await client.eval(`({
      len: window.__capturedSavs[0].length,
      bank1Byte0: window.__capturedSavs[0][0x2000],
      activeTag: document.activeElement?.tagName,
    })`);
    assert.equal(exported1Info.len, 32768, `Expected 32768-byte .sav export, got ${exported1Info.len}`);
    assert.equal(exported1Info.bank1Byte0, 0xa5, `Expected exported SRAM[0x2000]=0xA5, got 0x${exported1Info.bank1Byte0?.toString(16)}`);
    assert.notEqual(exported1Info.activeTag, 'BUTTON', 'Export .sav button must blur after click');

    // Write custom 32KB .sav and import it via #sav-input
    const importedBytes = new Uint8Array(32768);
    importedBytes.set([0xde, 0xad, 0xbe, 0xef], 0x0000);
    importedBytes[0x2001] = 0x42;
    fs.writeFileSync(IMPORTED_SAV_PATH, importedBytes);

    const docSav = await client.send('DOM.getDocument');
    const savInputNode = await client.send('DOM.querySelector', {
      nodeId: docSav.root.nodeId,
      selector: '#sav-input',
    });
    await client.send('DOM.setFileInputFiles', {
      nodeId: savInputNode.nodeId,
      files: [IMPORTED_SAV_PATH],
    });

    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('import-sav-btn').disabled && window.__retroIdle.getEmulator().isPlaying && document.getElementById('status').textContent.includes('imported .sav')`
        ),
      8000,
      40
    );

    const sramCheckAfterImport = await client.eval(`
      (() => {
        const ram = window.__retroIdle.getEmulator().getExtRam();
        return {
          head: Array.from(ram.slice(0, 4)),
          b1_0: ram[0x2000],
          b1_1: ram[0x2001],
        };
      })()
    `);
    assert.deepEqual(sramCheckAfterImport.head, [0xde, 0xad, 0xbe, 0xef], 'Imported SRAM header bytes mismatch');
    assert.equal(sramCheckAfterImport.b1_0, 0xa5, 'Boot init should write 0xA5 at SRAM[0x2000]');
    assert.equal(sramCheckAfterImport.b1_1, 0x42, 'Imported SRAM[0x2001] should persist across reset');

    // Re-export .sav and confirm imported bytes are present in download
    await client.eval(`document.getElementById('export-sav-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('export-sav-btn').disabled && window.__capturedSavs.length >= 2`
        ),
      5000,
      30
    );
    const exported2Info = await client.eval(`({
      len: window.__capturedSavs[1].length,
      head: window.__capturedSavs[1].slice(0, 4),
      b1_1: window.__capturedSavs[1][0x2001],
    })`);
    assert.equal(exported2Info.len, 32768);
    assert.deepEqual(exported2Info.head, [0xde, 0xad, 0xbe, 0xef]);
    assert.equal(exported2Info.b1_1, 0x42);

    const readScxExpr = `window.__retroIdle.getEmulator().readMem(0xff43)`;

    // Wait for SCX in [20, 70], then save manual state
    const scxBeforeManualSave = await waitFor(async () => {
      const scx = await client.eval(readScxExpr);
      return scx >= 20 && scx <= 70 ? scx : false;
    }, 8000, 20);

    await client.eval(`document.getElementById('save-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('save-state-btn').disabled && document.getElementById('status').textContent.includes('state saved')`
        ),
      5000,
      30
    );
    const afterSaveInfo = await client.eval(`({
      playing: window.__retroIdle.getEmulator().isPlaying,
      loadDisabled: document.getElementById('load-state-btn').disabled,
      activeTag: document.activeElement?.tagName,
      status: document.getElementById('status').textContent,
    })`);
    assert.equal(afterSaveInfo.playing, true, 'Emulation must keep playing after Save State');
    assert.equal(afterSaveInfo.loadDisabled, false, 'Load State button must enable after Save State');
    assert.notEqual(afterSaveInfo.activeTag, 'BUTTON', 'Save State button must blur after click');
    assert.match(afterSaveInfo.status, /— state saved$/, `Unexpected status after Save State: ${afterSaveInfo.status}`);

    // Wait until SCX advances >= 35 frames past scxBeforeManualSave, then click Load State 5x
    await waitFor(async () => {
      const scx = await client.eval(readScxExpr);
      const delta = (scx - scxBeforeManualSave) & 0xff;
      return delta >= 35 && delta < 180 ? scx : false;
    }, 8000, 25);

    let scxAfterManualLoad1 = 0;
    let scxAfterManualLoad2 = 0;
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (attempt === 2) await sleep(150);
      await client.eval(`document.getElementById('load-state-btn').click()`);
      await waitFor(
        async () =>
          await client.eval(
            `!document.getElementById('load-state-btn').disabled && document.getElementById('status').textContent.includes('state loaded')`
          ),
        5000,
        25
      );
      const scxAfterN = await client.eval(readScxExpr);
      assert.ok(
        ((scxAfterN - scxBeforeManualSave + 10) & 0xff) < 35,
        `Expected SCX to jump back near ${scxBeforeManualSave} after Load State #${attempt}, got ${scxAfterN}`
      );
      if (attempt === 1) {
        scxAfterManualLoad1 = scxAfterN;
        const afterLoadInfo = await client.eval(`({
          playing: window.__retroIdle.getEmulator().isPlaying,
          activeTag: document.activeElement?.tagName,
        })`);
        assert.equal(afterLoadInfo.playing, true, 'Emulation must keep playing after Load State');
        assert.notEqual(afterLoadInfo.activeTag, 'BUTTON', 'Load State button must blur after click');
      }
      scxAfterManualLoad2 = scxAfterN;
    }

    // Verify Load State -> Pause -> Save State -> Load State
    await client.eval(`document.getElementById('toggle-play').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getEmulator().isPaused === true && !document.getElementById('toggle-play').disabled`
        ),
      5000,
      25
    );
    await client.eval(`document.getElementById('save-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('save-state-btn').disabled && document.getElementById('status').textContent.includes('state saved')`
        ),
      5000,
      25
    );
    await client.eval(`document.getElementById('load-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('load-state-btn').disabled && document.getElementById('status').textContent.includes('state loaded')`
        ),
      5000,
      25
    );

    // Wait until SCX advances 70..130 frames past scxBeforeManualSave, then reload page
    const scxBeforeClose = await waitFor(async () => {
      const scx = await client.eval(readScxExpr);
      const delta = (scx - scxBeforeManualSave) & 0xff;
      return delta >= 70 && delta <= 130 ? scx : false;
    }, 8000, 25);

    await client.eval(`window.__beforeReload = true`);
    await client.send('Page.reload');
    await waitFor(
      async () =>
        await client.eval(
          `window.__beforeReload === undefined && Boolean(window.__retroIdle && document.getElementById('rom-input'))`
        ),
      10000,
      40
    );

    // Zero-click reload: both the persisted ROM and auto-save state must restore automatically
    await waitFor(async () => {
      return await client.eval(`
        (() => {
          const emu = window.__retroIdle?.getEmulator();
          const status = document.getElementById('status')?.textContent || '';
          return Boolean(emu && emu.isPlaying && status.includes('resumed auto-save'));
        })()
      `);
    }, 12000, 40);

    const resumedStatus = await client.eval(`document.getElementById('status').textContent`);
    assert.match(
      resumedStatus,
      /^Playing: MBC3 TEST \(MBC3 \+ RAM \+ BATTERY\) — resumed auto-save$/,
      `Unexpected resumed status: ${resumedStatus}`
    );

    const scxAfterResume = await client.eval(readScxExpr);
    const scxDelta = (scxAfterResume - scxBeforeClose + 10) & 0xff;
    assert.ok(scxDelta < 110, `Expected SCX to resume near ${scxBeforeClose}, got ${scxAfterResume}`);

    await sleep(250);
    const scxAfterDelay = await client.eval(readScxExpr);
    assert.notEqual(scxAfterDelay, scxAfterResume, 'Emulation must keep running after auto-save restore');

    const loadDisabledAfterReload = await client.eval(`document.getElementById('load-state-btn').disabled`);
    assert.equal(loadDisabledAfterReload, false, 'Load State button must remain enabled after reload');

    // Click Load State after reload and confirm SCX jumps back to scxBeforeManualSave
    await client.eval(`document.getElementById('load-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('load-state-btn').disabled && document.getElementById('status').textContent.includes('state loaded')`
        ),
      5000,
      25
    );
    const scxAfterPostReloadManualLoad = await client.eval(readScxExpr);
    assert.ok(
      ((scxAfterPostReloadManualLoad - scxBeforeManualSave + 10) & 0xff) < 35,
      `Expected post-reload Load State to jump back near ${scxBeforeManualSave}, got ${scxAfterPostReloadManualLoad}`
    );

    // Reset button test: must boot fresh without "resumed auto-save" or "state loaded", while keeping imported SRAM
    await client.eval(`document.getElementById('reset-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getEmulator().isPlaying === true && !document.getElementById('reset-btn').disabled`
        ),
      8000,
      40
    );
    const resetStatus = await client.eval(`document.getElementById('status').textContent`);
    assert.doesNotMatch(resetStatus, /resumed auto-save|state loaded/, `Reset should boot fresh, got ${resetStatus}`);

    const sramAfterReloadAndReset = await client.eval(`
      (() => {
        const ram = window.__retroIdle.getEmulator().getExtRam();
        return { head: Array.from(ram.slice(0, 4)), b1_1: ram[0x2001] };
      })()
    `);
    assert.deepEqual(sramAfterReloadAndReset.head, [0xde, 0xad, 0xbe, 0xef], 'Imported SRAM must persist after reload and reset');
    assert.equal(sramAfterReloadAndReset.b1_1, 0x42, 'Imported SRAM[0x2001] must persist after reload and reset');

    await waitFor(async () => await client.eval(HAS_NON_BLANK_CANVAS_EXPR), 5000, 30);

    // Speed controls check: initial 1x, 4x button throughput, reset persistence, and 1-5 hotkeys
    const initialSpeedInfo = await client.eval(`({
      speed: window.__retroIdle.getSpeed(),
      emuSpeed: window.__retroIdle.getEmulator().speed,
      btn1Active: document.querySelector('.speed-btn[data-speed="1"]').classList.contains('active'),
      btn1Pressed: document.querySelector('.speed-btn[data-speed="1"]').getAttribute('aria-pressed'),
    })`);
    assert.equal(initialSpeedInfo.speed, 1, 'Expected initial speed 1');
    assert.equal(initialSpeedInfo.emuSpeed, 1, 'Expected initial emulator speed 1');
    assert.equal(initialSpeedInfo.btn1Active, true, 'Expected 1x button active initially');
    assert.equal(initialSpeedInfo.btn1Pressed, 'true', 'Expected 1x button aria-pressed="true" initially');

    const t1Start = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
    await sleep(350);
    const t1End = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
    const ticks1x = t1End - t1Start;
    assert.ok(ticks1x > 0, `Expected positive ticks at 1x, got ${ticks1x}`);

    await client.eval(`document.querySelector('.speed-btn[data-speed="4"]').click()`);
    const speed4Info = await client.eval(`({
      speed: window.__retroIdle.getSpeed(),
      emuSpeed: window.__retroIdle.getEmulator().speed,
      btn1Active: document.querySelector('.speed-btn[data-speed="1"]').classList.contains('active'),
      btn4Active: document.querySelector('.speed-btn[data-speed="4"]').classList.contains('active'),
      btn4Pressed: document.querySelector('.speed-btn[data-speed="4"]').getAttribute('aria-pressed'),
      activeTag: document.activeElement?.tagName,
    })`);
    assert.equal(speed4Info.speed, 4, 'Expected speed 4 after clicking 4x');
    assert.equal(speed4Info.emuSpeed, 4, 'Expected emulator speed 4 after clicking 4x');
    assert.equal(speed4Info.btn1Active, false, 'Expected 1x button inactive at 4x');
    assert.equal(speed4Info.btn4Active, true, 'Expected 4x button active at 4x');
    assert.equal(speed4Info.btn4Pressed, 'true', 'Expected 4x button aria-pressed="true"');
    assert.notEqual(speed4Info.activeTag, 'BUTTON', 'Speed button must blur after click');

    const t4Start = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
    await sleep(350);
    const t4End = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
    const ticks4x = t4End - t4Start;
    assert.ok(
      ticks4x > ticks1x * 2.2,
      `Expected 4x ticks (${ticks4x}) > 2.2x of 1x ticks (${ticks1x})`
    );

    // Speed persists across Reset
    await client.eval(`document.getElementById('reset-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getEmulator().isPlaying === true && !document.getElementById('reset-btn').disabled`
        ),
      8000,
      40
    );
    const speedAfterReset = await client.eval(`({
      speed: window.__retroIdle.getSpeed(),
      emuSpeed: window.__retroIdle.getEmulator().speed,
    })`);
    assert.equal(speedAfterReset.speed, 4, 'Speed should persist at 4 after Reset');
    assert.equal(speedAfterReset.emuSpeed, 4, 'Emulator speed should persist at 4 after Reset');

    // Hotkey Digit4 -> 10x, Digit1 -> 1x
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: '4',
      code: 'Digit4',
      windowsVirtualKeyCode: 52,
      nativeVirtualKeyCode: 52,
    });
    const speed10Info = await client.eval(`({
      speed: window.__retroIdle.getSpeed(),
      btn10Active: document.querySelector('.speed-btn[data-speed="10"]').classList.contains('active'),
    })`);
    assert.equal(speed10Info.speed, 10, 'Expected Digit4 hotkey to switch speed to 10x');
    assert.equal(speed10Info.btn10Active, true, 'Expected 10x button active after Digit4');

    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: '1',
      code: 'Digit1',
      windowsVirtualKeyCode: 49,
      nativeVirtualKeyCode: 49,
    });
    const speed1Info = await client.eval(`({
      speed: window.__retroIdle.getSpeed(),
      btn1Active: document.querySelector('.speed-btn[data-speed="1"]').classList.contains('active'),
    })`);
    assert.equal(speed1Info.speed, 1, 'Expected Digit1 hotkey to switch speed back to 1x');
    assert.equal(speed1Info.btn1Active, true, 'Expected 1x button active after Digit1');

    // Document Picture-in-Picture Mini-Player checks (when supported by browser)
    const miniSupported = await client.eval(`window.__retroIdle.getMiniPlayer().supported`);
    let miniPlayerInfo = { supported: miniSupported };
    if (miniSupported) {
      const beforeOpen = await client.eval(`({
        disabled: document.getElementById('mini-player-btn').disabled,
        open: window.__retroIdle.getMiniPlayer().open,
      })`);
      assert.equal(beforeOpen.disabled, false, 'Mini-Player button should be enabled while ROM is loaded');
      assert.equal(beforeOpen.open, false, 'Mini-Player should start closed');

      await client.eval(`document.getElementById('mini-player-btn').click()`, { userGesture: true });
      await waitFor(
        async () => await client.eval(`window.__retroIdle.getMiniPlayer().open === true`),
        6000,
        50
      );

      const inPipState = await client.eval(`
        (() => {
          const mp = window.__retroIdle.getMiniPlayer();
          const pipWin = mp.getWindow();
          const pipCanvas = pipWin?.document?.getElementById('screen');
          const data = pipCanvas.getContext('2d').getImageData(0, 0, pipCanvas.width, pipCanvas.height).data;
          let first = null;
          let hasMultipleColors = false;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) continue;
            const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
            if (first === null) first = key;
            else if (key !== first) {
              hasMultipleColors = true;
              break;
            }
          }
          const btn = document.getElementById('mini-player-btn');
          return {
            screenInPip: pipCanvas.ownerDocument === pipWin.document,
            screenInMain: Boolean(document.getElementById('screen')),
            placeholderHidden: document.getElementById('pip-placeholder').hidden,
            btnActive: btn.classList.contains('active'),
            btnText: btn.textContent,
            hasMultipleColors,
          };
        })()
      `);
      assert.equal(inPipState.screenInPip, true, 'Expected #screen inside PiP window document');
      assert.equal(inPipState.screenInMain, false, 'Expected #screen moved out of main document');
      assert.equal(inPipState.placeholderHidden, false, 'Expected #pip-placeholder visible while in Mini-Player');
      assert.equal(inPipState.btnActive, true, 'Expected #mini-player-btn active while open');
      assert.equal(inPipState.btnText, 'Exit Mini-Player', 'Expected #mini-player-btn text to update');
      assert.equal(inPipState.hasMultipleColors, true, 'Expected non-blank canvas inside Mini-Player');

      const pipTicksStart = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
      await sleep(250);
      const pipTicksEnd = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
      assert.ok(pipTicksEnd > pipTicksStart, 'Expected emulator ticks to advance under PiP requestAnimationFrame');

      // PiP speed button cycles 1x -> 2x and syncs back to main UI; Digit1 in PiP restores 1x
      await client.eval(`
        window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="speed"]').click()
      `);
      const pipSpeed2 = await client.eval(`({
        speed: window.__retroIdle.getSpeed(),
        pipBtnText: window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="speed"]').textContent,
        main2Active: document.querySelector('.speed-btn[data-speed="2"]').classList.contains('active'),
      })`);
      assert.equal(pipSpeed2.speed, 2, 'Expected PiP speed button to switch 1x -> 2x');
      assert.equal(pipSpeed2.pipBtnText, '2x', 'Expected PiP speed button text to update to 2x');
      assert.equal(pipSpeed2.main2Active, true, 'Expected main 2x button active after PiP speed click');

      await client.eval(`
        (() => {
          const w = window.__retroIdle.getMiniPlayer().getWindow();
          w.dispatchEvent(new w.KeyboardEvent('keydown', { key: '1', code: 'Digit1', bubbles: true, cancelable: true }));
        })()
      `);
      const pipSpeed1 = await client.eval(`({
        speed: window.__retroIdle.getSpeed(),
        pipBtnText: window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="speed"]').textContent,
        main1Active: document.querySelector('.speed-btn[data-speed="1"]').classList.contains('active'),
      })`);
      assert.equal(pipSpeed1.speed, 1, 'Expected Digit1 inside PiP to restore 1x');
      assert.equal(pipSpeed1.pipBtnText, '1x', 'Expected PiP speed button text to restore 1x');
      assert.equal(pipSpeed1.main1Active, true, 'Expected main 1x button active after Digit1 in PiP');

      // Keyboard forwarding in PiP (KeyX -> BGP flips 0xE4 -> 0x1B -> 0xE4)
      await client.eval(`
        (() => {
          const w = window.__retroIdle.getMiniPlayer().getWindow();
          w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'x', code: 'KeyX', bubbles: true, cancelable: true }));
        })()
      `);
      await waitFor(
        async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0x1b`),
        5000,
        30
      );
      await client.eval(`
        (() => {
          const w = window.__retroIdle.getMiniPlayer().getWindow();
          w.dispatchEvent(new w.KeyboardEvent('keyup', { key: 'x', code: 'KeyX', bubbles: true, cancelable: true }));
        })()
      `);
      await waitFor(
        async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4`),
        5000,
        30
      );

      // PiP Pause / Resume button + button blur check in pipWin.document
      await client.eval(`
        window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="toggle-play"]').click()
      `);
      await waitFor(
        async () =>
          await client.eval(`
            (() => {
              const emu = window.__retroIdle.getEmulator();
              const w = window.__retroIdle.getMiniPlayer().getWindow();
              const btn = w.document.querySelector('[data-pip-action="toggle-play"]');
              return emu.isPaused === true && !btn.disabled && btn.textContent === 'Resume';
            })()
          `),
        5000,
        30
      );
      const pipPausedFocusTag = await client.eval(
        `window.__retroIdle.getMiniPlayer().getWindow().document.activeElement?.tagName`
      );
      assert.notEqual(pipPausedFocusTag, 'BUTTON', 'PiP Pause button must blur after click');

      await client.eval(`
        window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="toggle-play"]').click()
      `);
      await waitFor(
        async () =>
          await client.eval(`
            (() => {
              const emu = window.__retroIdle.getEmulator();
              const w = window.__retroIdle.getMiniPlayer().getWindow();
              const btn = w.document.querySelector('[data-pip-action="toggle-play"]');
              return emu.isPlaying === true && !btn.disabled && btn.textContent === 'Pause';
            })()
          `),
        5000,
        30
      );

      // Close PiP via pipWin.close() -> tests native pagehide restoration
      await client.eval(`window.__retroIdle.getMiniPlayer().getWindow().close()`);
      await waitFor(
        async () => await client.eval(`window.__retroIdle.getMiniPlayer().open === false`),
        5000,
        30
      );

      const afterPipClose = await client.eval(`({
        screenBackInSlot: document.getElementById('screen')?.parentElement === document.getElementById('screen-slot'),
        placeholderHidden: document.getElementById('pip-placeholder').hidden,
        btnActive: document.getElementById('mini-player-btn').classList.contains('active'),
        btnText: document.getElementById('mini-player-btn').textContent,
        playing: window.__retroIdle.getEmulator().isPlaying,
      })`);
      assert.equal(afterPipClose.screenBackInSlot, true, 'Expected #screen back in #screen-slot after PiP close');
      assert.equal(afterPipClose.placeholderHidden, true, 'Expected #pip-placeholder hidden after PiP close');
      assert.equal(afterPipClose.btnActive, false, 'Expected #mini-player-btn inactive after PiP close');
      assert.equal(afterPipClose.btnText, 'Mini-Player', 'Expected #mini-player-btn text reset after PiP close');
      assert.equal(afterPipClose.playing, true, 'Expected emulation still playing after PiP close');

      const mainTicksStart = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
      await sleep(250);
      const mainTicksEnd = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
      assert.ok(mainTicksEnd > mainTicksStart, 'Expected emulator ticks to keep advancing on main window');

      miniPlayerInfo = {
        supported: true,
        pipTicksDelta: pipTicksEnd - pipTicksStart,
        mainTicksDelta: mainTicksEnd - mainTicksStart,
      };
    }

    // Capture screenshot
    const shot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));

    // Assert zero runtime exceptions, zero console errors, zero Log.entryAdded errors
    const errors = client.events.filter(
      (e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error') ||
        (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
    );
    assert.equal(errors.length, 0, `Unexpected browser errors: ${JSON.stringify(errors)}`);

    console.log('ALL CHECKS PASSED:', {
      ...state,
      hash2,
      memCheck,
      exported1Info,
      sramCheckAfterImport,
      exported2Info,
      sramAfterReloadAndReset,
      scxBeforeManualSave,
      scxAfterManualLoad1,
      scxAfterManualLoad2,
      scxBeforeClose,
      scxAfterResume,
      scxAfterDelay,
      scxAfterPostReloadManualLoad,
      resumedStatus,
      resetStatus,
      speedCheck: { ticks1x, ticks4x, ratio: Number((ticks4x / ticks1x).toFixed(2)) },
      miniPlayerInfo,
      screenshot: SCREENSHOT_PATH,
    });
  } finally {
    if (client) client.close();
    chrome.kill('SIGTERM');
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
