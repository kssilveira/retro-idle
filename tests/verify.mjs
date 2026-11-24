import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildTestRom, buildGbaTestRom } from './make-test-rom.mjs';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const TMP_DIR = path.join(import.meta.dirname, '.tmp');
const ROM_PATH = path.join(TMP_DIR, 'mbc3-test.gb');
const BIG_ROM_PATH = path.join(TMP_DIR, 'mbc3-big-test.gb');
const YELLOW_ROM_PATH = path.join(TMP_DIR, 'pokemon-yellow-test.gbc');
const CRYSTAL_ROM_PATH = path.join(TMP_DIR, 'pokemon-crystal-test.gbc');
const GBA_ROM_PATH = path.join(TMP_DIR, 'gba-test.gba');
const EMERALD_ROM_PATH = path.join(TMP_DIR, 'pokemon-emerald-test.gba');
const IMPORTED_SAV_PATH = path.join(TMP_DIR, 'imported.sav');
const DOWNLOADS_DIR = path.join(TMP_DIR, 'downloads');
const CHROME_PROFILE = path.join(TMP_DIR, 'chrome-profile');
const SCREENSHOT_PATH = path.join(TMP_DIR, 'screenshot.png');
const MOBILE_SCREENSHOT_PATH = path.join(TMP_DIR, 'screenshot-mobile.png');
const MOBILE_LANDSCAPE_SCREENSHOT_PATH = path.join(TMP_DIR, 'screenshot-mobile-landscape.png');
const LANDSCAPE_FS_SCREENSHOT_PATH = path.join(TMP_DIR, 'screenshot-landscape-fullscreen.png');
const GBA_LANDSCAPE_FS_SCREENSHOT_PATH = path.join(TMP_DIR, 'screenshot-gba-landscape-fullscreen.png');
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
  fs.writeFileSync(BIG_ROM_PATH, buildTestRom({ title: 'BIG TEST', romSizeCode: 0x03 }));
  fs.writeFileSync(
    YELLOW_ROM_PATH,
    buildTestRom({ title: 'POKEMON YELLOW', cgbFlag: 0x80, cartType: 0x1b })
  );
  fs.writeFileSync(
    CRYSTAL_ROM_PATH,
    buildTestRom({ title: 'PM_CRYSTAL', cgbFlag: 0xc0, cartType: 0x10 })
  );
  fs.writeFileSync(
    GBA_ROM_PATH,
    buildGbaTestRom({ title: 'GBA TEST', gameCode: 'BTEE' })
  );
  fs.writeFileSync(
    EMERALD_ROM_PATH,
    buildGbaTestRom({ title: 'POKEMON EMER', gameCode: 'BPEE' })
  );
  fs.rmSync(DOWNLOADS_DIR, { recursive: true, force: true });
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
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
      '--mute-audio',
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
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOADS_DIR,
    });

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

    const initialAudio = await client.eval(`({
      ...window.__retroIdle.getAudio(),
      btnDisabled: document.getElementById('mute-btn').disabled,
      btnText: document.getElementById('mute-btn').textContent,
      btnActive: document.getElementById('mute-btn').classList.contains('active'),
      btnPressed: document.getElementById('mute-btn').getAttribute('aria-pressed'),
    })`);
    assert.equal(initialAudio.muted, true, 'Audio must be muted by default');
    assert.equal(initialAudio.audible, false, 'Audio must not be audible while muted');
    assert.equal(initialAudio.hasContext, false, 'AudioContext should not be created while muted');
    assert.equal(initialAudio.activeSources, 0, 'No audio sources should be scheduled while muted');
    assert.equal(initialAudio.btnDisabled, false, 'Mute button must be enabled');
    assert.equal(initialAudio.btnText, 'Unmute', 'Mute button should read Unmute when muted');
    assert.equal(initialAudio.btnActive, true, 'Mute button should be active when muted');
    assert.equal(initialAudio.btnPressed, 'true', 'Mute button aria-pressed should be true when muted');

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

    // Turbo A (KeyC) & Auto A (#auto-a-btn / KeyV / Escape) on non-Pokémon ROM
    const sampleBgpBothStatesExpr = `new Promise((resolve) => {
      const seen = new Set();
      let frames = 0;
      const tick = () => {
        seen.add(window.__retroIdle.getEmulator().readMem(0xff47));
        frames += 1;
        if ((seen.has(0x1b) && seen.has(0xe4)) || frames >= 45) {
          resolve({ has1b: seen.has(0x1b), hasE4: seen.has(0xe4), frames });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })`;

    const initialAutoABtns = await client.eval(`({
      autoADisabled: document.getElementById('auto-a-btn').disabled,
      autoFightDisabled: document.getElementById('auto-fight-btn').disabled,
    })`);
    assert.equal(initialAutoABtns.autoADisabled, false, 'Auto A button must be enabled for non-Pokémon ROMs');
    assert.equal(initialAutoABtns.autoFightDisabled, true, 'Auto-Fight button must stay disabled for non-Pokémon ROMs');

    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'c',
      code: 'KeyC',
      windowsVirtualKeyCode: 67,
      nativeVirtualKeyCode: 67,
    });
    const turboKeySample = await client.eval(sampleBgpBothStatesExpr);
    assert.equal(turboKeySample.has1b && turboKeySample.hasE4, true, `KeyC Turbo A should pulse BGP: ${JSON.stringify(turboKeySample)}`);
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'c',
      code: 'KeyC',
      windowsVirtualKeyCode: 67,
      nativeVirtualKeyCode: 67,
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4 && !window.__retroIdle.getAutoA().turboHeld`),
      5000,
      30
    );

    await client.eval(`document.getElementById('auto-a-btn').click()`);
    const autoAActiveInfo = await client.eval(`({
      ...window.__retroIdle.getAutoA(),
      btnText: document.getElementById('auto-a-btn').textContent,
      btnActive: document.getElementById('auto-a-btn').classList.contains('active'),
      statusText: document.getElementById('auto-fight-status').textContent,
      activeTag: document.activeElement?.tagName,
    })`);
    assert.equal(autoAActiveInfo.active, true);
    assert.equal(autoAActiveInfo.btnText, 'Stop Auto A');
    assert.equal(autoAActiveInfo.btnActive, true);
    assert.equal(autoAActiveInfo.statusText, 'Auto A: active');
    assert.notEqual(autoAActiveInfo.activeTag, 'BUTTON', 'Auto A button must blur after click');

    const autoASample = await client.eval(sampleBgpBothStatesExpr);
    assert.equal(autoASample.has1b && autoASample.hasE4, true, `Auto A should pulse BGP: ${JSON.stringify(autoASample)}`);

    // KeyV toggles off, KeyV toggles on, Escape stops Auto A cleanly
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'v',
      code: 'KeyV',
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'v',
      code: 'KeyV',
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
    });
    assert.equal(await client.eval(`window.__retroIdle.getAutoA().active`), false, 'KeyV should stop Auto A');

    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'v',
      code: 'KeyV',
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'v',
      code: 'KeyV',
      windowsVirtualKeyCode: 86,
      nativeVirtualKeyCode: 86,
    });
    assert.equal(await client.eval(`window.__retroIdle.getAutoA().active`), true, 'Second KeyV should start Auto A');

    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await waitFor(
      async () => await client.eval(`!window.__retroIdle.getAutoA().active && window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4 && document.getElementById('auto-fight-status').hidden`),
      5000,
      30
    );

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

    await client.eval(`document.getElementById('export-sav-btn').click()`, { userGesture: true });
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('export-sav-btn').disabled && document.getElementById('status').textContent.includes('exported .sav') && window.__capturedSavs.length >= 1`
        ),
      5000,
      30
    );
    const downloadedSavPath = path.join(DOWNLOADS_DIR, 'MBC3_TEST.sav');
    await waitFor(
      () => fs.existsSync(downloadedSavPath) && fs.statSync(downloadedSavPath).size === 32768,
      5000,
      30
    );
    const downloaded1 = fs.readFileSync(downloadedSavPath);
    assert.equal(downloaded1.length, 32768, `Expected 32768-byte downloaded .sav #1, got ${downloaded1.length}`);
    assert.equal(
      downloaded1[0x2000],
      0xa5,
      `Expected downloaded SRAM[0x2000]=0xA5, got 0x${downloaded1[0x2000]?.toString(16)}`
    );
    fs.rmSync(downloadedSavPath, { force: true });
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
    await client.eval(`document.getElementById('export-sav-btn').click()`, { userGesture: true });
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('export-sav-btn').disabled && window.__capturedSavs.length >= 2`
        ),
      5000,
      30
    );
    await waitFor(
      () => fs.existsSync(downloadedSavPath) && fs.statSync(downloadedSavPath).size === 32768,
      5000,
      30
    );
    const downloaded2 = fs.readFileSync(downloadedSavPath);
    assert.equal(downloaded2.length, 32768, `Expected 32768-byte downloaded .sav #2, got ${downloaded2.length}`);
    assert.deepEqual(Array.from(downloaded2.subarray(0, 4)), [0xde, 0xad, 0xbe, 0xef]);
    assert.equal(downloaded2[0x2001], 0x42);
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
    await waitFor(async () => await client.eval(HAS_NON_BLANK_CANVAS_EXPR), 5000, 30);
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

    // Audio mute toggle, speed interaction, and M hotkey checks
    const stillMutedAudio = await client.eval(`window.__retroIdle.getAudio()`);
    assert.equal(stillMutedAudio.muted, true, 'Audio must remain muted after prior interactions');
    assert.equal(stillMutedAudio.hasContext, false, 'AudioContext must remain uncreated while muted');
    assert.equal(stillMutedAudio.activeSources, 0, 'No audio sources should exist while muted');

    await client.eval(`document.getElementById('mute-btn').click()`, { userGesture: true });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAudio().muted === false`),
      5000,
      30
    );
    const unmutedAudio = await client.eval(`({
      ...window.__retroIdle.getAudio(),
      btnText: document.getElementById('mute-btn').textContent,
      btnActive: document.getElementById('mute-btn').classList.contains('active'),
      btnPressed: document.getElementById('mute-btn').getAttribute('aria-pressed'),
      activeTag: document.activeElement?.tagName,
    })`);
    assert.equal(unmutedAudio.muted, false);
    assert.equal(unmutedAudio.audible, true);
    assert.equal(unmutedAudio.hasContext, true);
    assert.equal(unmutedAudio.gain, 1);
    assert.equal(unmutedAudio.btnText, 'Mute');
    assert.equal(unmutedAudio.btnActive, false);
    assert.equal(unmutedAudio.btnPressed, 'false');
    assert.notEqual(unmutedAudio.activeTag, 'BUTTON', 'Mute button must blur after click');

    // Switching to 4x silences output while preserving unmuted preference; 1x restores audible output
    await client.eval(`document.querySelector('.speed-btn[data-speed="4"]').click()`);
    const audioAt4x = await client.eval(`window.__retroIdle.getAudio()`);
    assert.equal(audioAt4x.muted, false, '4x speed must keep unmuted preference');
    assert.equal(audioAt4x.audible, false, '4x speed must not output audio');
    assert.equal(audioAt4x.gain, 0, '4x speed must set gain to 0');
    assert.equal(audioAt4x.activeSources, 0, '4x speed must stop scheduled audio sources');

    await client.eval(`document.querySelector('.speed-btn[data-speed="1"]').click()`);
    const audioBack1x = await client.eval(`window.__retroIdle.getAudio()`);
    assert.equal(audioBack1x.audible, true, 'Returning to 1x while unmuted must restore audible output');
    assert.equal(audioBack1x.gain, 1, 'Returning to 1x while unmuted must restore gain 1');

    // KeyM hotkey mutes and ignores key-repeat
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'm',
      code: 'KeyM',
      windowsVirtualKeyCode: 77,
      nativeVirtualKeyCode: 77,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'm',
      code: 'KeyM',
      windowsVirtualKeyCode: 77,
      nativeVirtualKeyCode: 77,
    });
    const mutedViaKey = await client.eval(`({
      ...window.__retroIdle.getAudio(),
      btnText: document.getElementById('mute-btn').textContent,
      btnActive: document.getElementById('mute-btn').classList.contains('active'),
      btnPressed: document.getElementById('mute-btn').getAttribute('aria-pressed'),
    })`);
    assert.equal(mutedViaKey.muted, true);
    assert.equal(mutedViaKey.audible, false);
    assert.equal(mutedViaKey.gain, 0);
    assert.equal(mutedViaKey.activeSources, 0);
    assert.equal(mutedViaKey.btnText, 'Unmute');
    assert.equal(mutedViaKey.btnActive, true);
    assert.equal(mutedViaKey.btnPressed, 'true');

    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAudio().contextState === 'suspended'`),
      5000,
      30
    );

    await client.eval(`
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', repeat: true, bubbles: true, cancelable: true }))
    `);
    assert.equal(
      await client.eval(`window.__retroIdle.getAudio().muted`),
      true,
      'KeyM with repeat:true must not toggle mute state'
    );

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

      // PiP Auto A toggle syncs with main #auto-a-btn and status
      await client.eval(`
        window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="auto-a"]').click()
      `);
      const pipAutoAOn = await client.eval(`(() => {
        const w = window.__retroIdle.getMiniPlayer().getWindow();
        const b = w.document.querySelector('[data-pip-action="auto-a"]');
        return {
          active: window.__retroIdle.getAutoA().active,
          pipText: b.textContent,
          pipActive: b.classList.contains('active'),
          mainText: document.getElementById('auto-a-btn').textContent,
          pipStatus: w.document.querySelector('.pip-status-primary').textContent,
        };
      })()`);
      assert.equal(pipAutoAOn.active, true);
      assert.equal(pipAutoAOn.pipText, 'Stop A');
      assert.equal(pipAutoAOn.pipActive, true);
      assert.equal(pipAutoAOn.mainText, 'Stop Auto A');
      assert.equal(pipAutoAOn.pipStatus, 'Auto A: active');

      await client.eval(`
        window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="auto-a"]').click()
      `);
      assert.equal(await client.eval(`window.__retroIdle.getAutoA().active`), false, 'Second PiP Auto A click should stop Auto A');
      await waitFor(
        async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4`),
        5000,
        30
      );

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

      // PiP mute button and KeyM inside PiP sync with main #mute-btn
      const pipMuteInitial = await client.eval(`(() => {
        const b = window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="mute"]');
        return {
          text: b.textContent,
          active: b.classList.contains('active'),
          pressed: b.getAttribute('aria-pressed'),
        };
      })()`);
      assert.equal(pipMuteInitial.text, 'Unmute');
      assert.equal(pipMuteInitial.active, true);
      assert.equal(pipMuteInitial.pressed, 'true');

      await client.eval(`
        window.__retroIdle.getMiniPlayer().getWindow().document.querySelector('[data-pip-action="mute"]').click()
      `, { userGesture: true });
      const pipUnmuted = await client.eval(`(() => {
        const w = window.__retroIdle.getMiniPlayer().getWindow();
        const b = w.document.querySelector('[data-pip-action="mute"]');
        return {
          muted: window.__retroIdle.getAudio().muted,
          pipText: b.textContent,
          pipActive: b.classList.contains('active'),
          mainText: document.getElementById('mute-btn').textContent,
          pipActiveTag: w.document.activeElement?.tagName,
        };
      })()`);
      assert.equal(pipUnmuted.muted, false, 'Clicking PiP mute button should unmute');
      assert.equal(pipUnmuted.pipText, 'Mute');
      assert.equal(pipUnmuted.pipActive, false);
      assert.equal(pipUnmuted.mainText, 'Mute');
      assert.notEqual(pipUnmuted.pipActiveTag, 'BUTTON', 'PiP Mute button must blur after click');

      await client.eval(`
        (() => {
          const w = window.__retroIdle.getMiniPlayer().getWindow();
          w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'm', code: 'KeyM', bubbles: true, cancelable: true }));
        })()
      `);
      const pipRemuted = await client.eval(`(() => {
        const w = window.__retroIdle.getMiniPlayer().getWindow();
        const b = w.document.querySelector('[data-pip-action="mute"]');
        return {
          muted: window.__retroIdle.getAudio().muted,
          pipText: b.textContent,
          mainText: document.getElementById('mute-btn').textContent,
        };
      })()`);
      assert.equal(pipRemuted.muted, true, 'KeyM inside PiP should re-mute');
      assert.equal(pipRemuted.pipText, 'Unmute');
      assert.equal(pipRemuted.mainText, 'Unmute');

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

    // Desktop Touch Pad toggle check + Phone Portrait & Landscape Multi-Touch E2E checks
    const desktopTouchInitial = await client.eval(`window.__retroIdle.getTouchControls()`);
    assert.equal(desktopTouchInitial.visible, false, 'Touch gamepad should be hidden on desktop by default');

    await client.eval(`document.getElementById('touch-pad-btn').click()`);
    const desktopTouchShown = await client.eval(`({
      ...window.__retroIdle.getTouchControls(),
      btnActive: document.getElementById('touch-pad-btn').classList.contains('active'),
      activeTag: document.activeElement?.tagName,
    })`);
    assert.equal(desktopTouchShown.visible, true, 'Touch Pad click should show touch gamepad');
    assert.equal(desktopTouchShown.btnActive, true, 'Touch Pad button should show active state');
    assert.notEqual(desktopTouchShown.activeTag, 'BUTTON', 'Touch Pad button must blur after click');

    await client.eval(`document.getElementById('touch-pad-btn').click()`);
    assert.equal(
      await client.eval(`window.__retroIdle.getTouchControls().visible`),
      false,
      'Second Touch Pad click should hide touch gamepad'
    );
    await client.eval(`window.__retroIdle.getTouchControls().setVisible(null)`);

    // 1. Portrait Phone (390x844) + Multi-Touch + D-Pad slide
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await client.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    });

    await waitFor(
      async () => await client.eval(`window.__retroIdle.getTouchControls().visible === true`),
      5000,
      40
    );

    const portraitLayout = await client.eval(`
      (() => {
        const screenRect = document.getElementById('screen').getBoundingClientRect();
        const gamepadRect = document.getElementById('touch-gamepad').getBoundingClientRect();
        const rightRect = document.querySelector('[data-gb-btn="right"]').getBoundingClientRect();
        const upRect = document.querySelector('[data-gb-btn="up"]').getBoundingClientRect();
        const aRect = document.querySelector('[data-gb-btn="a"]').getBoundingClientRect();
        const turboARect = document.querySelector('[data-gb-btn="turboA"]').getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          screenVisible: screenRect.width > 100 && screenRect.height > 100,
          gamepadBottom: gamepadRect.bottom,
          turboAWidth: turboARect.width,
          turboAHeight: turboARect.height,
          turboABottom: turboARect.bottom,
          rightCenter: { x: Math.round(rightRect.left + rightRect.width / 2), y: Math.round(rightRect.top + rightRect.height / 2) },
          upCenter: { x: Math.round(upRect.left + upRect.width / 2), y: Math.round(upRect.top + upRect.height / 2) },
          aCenter: { x: Math.round(aRect.left + aRect.width / 2), y: Math.round(aRect.top + aRect.height / 2) },
          turboACenter: { x: Math.round(turboARect.left + turboARect.width / 2), y: Math.round(turboARect.top + turboARect.height / 2) },
        };
      })()
    `);
    assert.ok(
      portraitLayout.scrollWidth <= portraitLayout.innerWidth,
      `Portrait overflow: ${portraitLayout.scrollWidth} > ${portraitLayout.innerWidth}`
    );
    assert.equal(portraitLayout.screenVisible, true, 'Portrait screen must be visible');
    assert.ok(
      portraitLayout.turboAWidth > 60 && portraitLayout.turboAHeight > 20,
      `Portrait TURBO A button not visible: ${JSON.stringify(portraitLayout)}`
    );
    assert.ok(
      Math.max(portraitLayout.gamepadBottom, portraitLayout.turboABottom) <= 844,
      `Portrait touch gamepad must fit within 844px height (bottom=${portraitLayout.gamepadBottom})`
    );

    const finger1Right = { x: portraitLayout.rightCenter.x, y: portraitLayout.rightCenter.y, id: 1 };
    const finger1Up = { x: portraitLayout.upCenter.x, y: portraitLayout.upCenter.y, id: 1 };
    const finger2A = { x: portraitLayout.aCenter.x, y: portraitLayout.aCenter.y, id: 2 };
    const finger2TurboA = { x: portraitLayout.turboACenter.x, y: portraitLayout.turboACenter.y, id: 2 };

    // Finger 1 holds D-Pad right
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [finger1Right],
    });
    const afterRight = await client.eval(`({
      held: window.__retroIdle.getTouchControls().held,
      rightPressed: document.querySelector('[data-gb-btn="right"]').classList.contains('pressed'),
    })`);
    assert.deepEqual(afterRight.held, ['right']);
    assert.equal(afterRight.rightPressed, true);

    // Finger 2 holds A while Finger 1 stays on D-Pad right -> BGP flips to 0x1B
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [finger1Right, finger2A],
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0x1b`),
      5000,
      30
    );
    const afterMultiTouch = await client.eval(`({
      held: window.__retroIdle.getTouchControls().held,
      aPressed: document.querySelector('[data-gb-btn="a"]').classList.contains('pressed'),
      rightPressed: document.querySelector('[data-gb-btn="right"]').classList.contains('pressed'),
    })`);
    assert.deepEqual(afterMultiTouch.held, ['a', 'right']);
    assert.equal(afterMultiTouch.aPressed, true);
    assert.equal(afterMultiTouch.rightPressed, true);

    // Release both touches via standard CDP touchEnd (touchPoints: []) -> BGP restores to 0xE4
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4`),
      5000,
      30
    );
    assert.deepEqual(
      await client.eval(`window.__retroIdle.getTouchControls().held`),
      [],
      'All touch buttons must release on touchEnd'
    );

    // Slide Finger 1 from D-Pad right to D-Pad up without lifting
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [finger1Right],
    });
    assert.deepEqual(
      await client.eval(`window.__retroIdle.getTouchControls().held`),
      ['right']
    );

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [finger1Up],
    });
    const afterSlide = await client.eval(`({
      held: window.__retroIdle.getTouchControls().held,
      upPressed: document.querySelector('[data-gb-btn="up"]').classList.contains('pressed'),
      rightPressed: document.querySelector('[data-gb-btn="right"]').classList.contains('pressed'),
    })`);
    assert.deepEqual(afterSlide.held, ['up']);
    assert.equal(afterSlide.upPressed, true);
    assert.equal(afterSlide.rightPressed, false);

    // Release Finger 1
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    assert.deepEqual(
      await client.eval(`window.__retroIdle.getTouchControls().held`),
      [],
      'All touch buttons must release on touchEnd'
    );

    // Multi-touch D-Pad right + Touch TURBO A pulses BGP 0xFF47 between 0x1B and 0xE4
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [finger1Right, finger2TurboA],
    });
    const afterTouchTurbo = await client.eval(`({
      held: window.__retroIdle.getTouchControls().held,
      turboPressed: document.querySelector('[data-gb-btn="turboA"]').classList.contains('pressed'),
    })`);
    assert.deepEqual(afterTouchTurbo.held, ['right', 'turboA']);
    assert.equal(afterTouchTurbo.turboPressed, true);
    const touchTurboSample = await client.eval(sampleBgpBothStatesExpr);
    assert.equal(touchTurboSample.has1b && touchTurboSample.hasE4, true, `Touch TURBO A should pulse BGP: ${JSON.stringify(touchTurboSample)}`);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getTouchControls().held.length === 0 && window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4`),
      5000,
      30
    );

    const mobileShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(MOBILE_SCREENSHOT_PATH, Buffer.from(mobileShot.data, 'base64'));

    // 2. Landscape Phone (844x390)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 844,
      height: 390,
      deviceScaleFactor: 2,
      mobile: true,
    });

    const landscapeLayout = await client.eval(`
      (() => {
        const screenRect = document.getElementById('screen').getBoundingClientRect();
        const dpadRect = document.getElementById('touch-dpad').getBoundingClientRect();
        const aRect = document.querySelector('[data-gb-btn="a"]').getBoundingClientRect();
        const startRect = document.querySelector('[data-gb-btn="start"]').getBoundingClientRect();
        const turboARect = document.querySelector('[data-gb-btn="turboA"]').getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          dpadRight: dpadRect.right,
          screenLeft: screenRect.left,
          screenRight: screenRect.right,
          aLeft: aRect.left,
          screenBottom: screenRect.bottom,
          dpadBottom: dpadRect.bottom,
          aBottom: aRect.bottom,
          startBottom: startRect.bottom,
          turboAWidth: turboARect.width,
          turboAHeight: turboARect.height,
          turboABottom: turboARect.bottom,
        };
      })()
    `);
    assert.ok(
      landscapeLayout.scrollWidth <= landscapeLayout.innerWidth,
      `Landscape overflow: ${landscapeLayout.scrollWidth} > ${landscapeLayout.innerWidth}`
    );
    assert.ok(
      landscapeLayout.turboAWidth > 60 && landscapeLayout.turboAHeight > 20,
      `Landscape TURBO A button not visible: ${JSON.stringify(landscapeLayout)}`
    );
    assert.ok(
      landscapeLayout.dpadRight <= landscapeLayout.screenLeft + 8,
      `Expected D-Pad left of screen in landscape (${landscapeLayout.dpadRight} <= ${landscapeLayout.screenLeft})`
    );
    assert.ok(
      landscapeLayout.screenRight <= landscapeLayout.aLeft + 8,
      `Expected A button right of screen in landscape (${landscapeLayout.screenRight} <= ${landscapeLayout.aLeft})`
    );
    assert.ok(
      Math.max(
        landscapeLayout.screenBottom,
        landscapeLayout.dpadBottom,
        landscapeLayout.aBottom,
        landscapeLayout.startBottom,
        landscapeLayout.turboABottom
      ) <= 390,
      `Landscape handheld controls must fit inside 390px height (${JSON.stringify(landscapeLayout)})`
    );

    const landscapeShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(MOBILE_LANDSCAPE_SCREENSHOT_PATH, Buffer.from(landscapeShot.data, 'base64'));

    // 2b. GB Landscape Fullscreen with translucent overlay controls (844x390)
    const initialFsState = await client.eval(`({
      fs: window.__retroIdle.getFullscreen(),
      hudHidden: document.getElementById('fullscreen-hud').hidden,
    })`);
    assert.equal(initialFsState.fs.active, false, 'Fullscreen must be inactive initially');
    assert.equal(initialFsState.hudHidden, true, '#fullscreen-hud must be hidden initially');

    await client.eval(`document.getElementById('fullscreen-btn').click()`, { userGesture: true });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getFullscreen().active === true`),
      5000,
      30
    );

    const gbFsLayout = await client.eval(`(() => {
      const screenRect = document.getElementById('screen').getBoundingClientRect();
      const hudRect = document.getElementById('fullscreen-hud').getBoundingClientRect();
      const dpadRect = document.getElementById('touch-dpad').getBoundingClientRect();
      const rightRect = document.querySelector('[data-gb-btn="right"]').getBoundingClientRect();
      const aRect = document.querySelector('[data-gb-btn="a"]').getBoundingClientRect();
      const bRect = document.querySelector('[data-gb-btn="b"]').getBoundingClientRect();
      const turboARect = document.querySelector('[data-gb-btn="turboA"]').getBoundingClientRect();
      const selectRect = document.querySelector('[data-gb-btn="select"]').getBoundingClientRect();
      const startRect = document.querySelector('[data-gb-btn="start"]').getBoundingClientRect();
      return {
        bodyFsClass: document.body.classList.contains('fullscreen-mode'),
        hudHidden: document.getElementById('fullscreen-hud').hidden,
        touchVisible: window.__retroIdle.getTouchControls().visible,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        screenRect: screenRect.toJSON(),
        hudRect: hudRect.toJSON(),
        dpadRect: dpadRect.toJSON(),
        aRect: aRect.toJSON(),
        bRect: bRect.toJSON(),
        turboARect: turboARect.toJSON(),
        selectRect: selectRect.toJSON(),
        startRect: startRect.toJSON(),
        rightCenter: { x: Math.round(rightRect.left + rightRect.width / 2), y: Math.round(rightRect.top + rightRect.height / 2) },
        aCenter: { x: Math.round(aRect.left + aRect.width / 2), y: Math.round(aRect.top + aRect.height / 2) },
      };
    })()`);
    assert.equal(gbFsLayout.bodyFsClass, true, 'Expected body.fullscreen-mode');
    assert.equal(gbFsLayout.hudHidden, false, 'Expected #fullscreen-hud visible in fullscreen');
    assert.equal(gbFsLayout.touchVisible, true, 'Expected #touch-gamepad visible in fullscreen');
    assert.ok(gbFsLayout.scrollWidth <= 844, `GB fullscreen horizontal overflow: ${gbFsLayout.scrollWidth}`);
    assert.ok(gbFsLayout.scrollHeight <= 390, `GB fullscreen vertical overflow: ${gbFsLayout.scrollHeight}`);
    assert.ok(gbFsLayout.screenRect.height >= 388, `Expected GB fullscreen canvas height >= 388, got ${gbFsLayout.screenRect.height}`);
    assert.ok(
      gbFsLayout.screenRect.height > landscapeLayout.screenBottom,
      `Expected fullscreen canvas height (${gbFsLayout.screenRect.height}) > non-fullscreen bottom (${landscapeLayout.screenBottom})`
    );
    for (const [label, r] of [
      ['hud', gbFsLayout.hudRect],
      ['dpad', gbFsLayout.dpadRect],
      ['a', gbFsLayout.aRect],
      ['b', gbFsLayout.bRect],
      ['turboA', gbFsLayout.turboARect],
      ['select', gbFsLayout.selectRect],
      ['start', gbFsLayout.startRect],
    ]) {
      assert.ok(
        r.left >= -1 && r.top >= -1 && r.right <= 845 && r.bottom <= 391,
        `GB fullscreen ${label} out of 844x390 bounds: ${JSON.stringify(r)}`
      );
    }
    assert.ok(
      gbFsLayout.dpadRect.right <= gbFsLayout.selectRect.left + 1,
      `Expected D-Pad left of SELECT in GB fullscreen (${gbFsLayout.dpadRect.right} <= ${gbFsLayout.selectRect.left})`
    );
    assert.ok(
      gbFsLayout.startRect.right <= gbFsLayout.bRect.left + 1,
      `Expected START left of B in GB fullscreen (${gbFsLayout.startRect.right} <= ${gbFsLayout.bRect.left})`
    );

    // Multi-touch input in fullscreen overlay mode (D-Pad right + A)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: gbFsLayout.rightCenter.x, y: gbFsLayout.rightCenter.y, id: 1 },
        { x: gbFsLayout.aCenter.x, y: gbFsLayout.aCenter.y, id: 2 },
      ],
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0x1b`),
      5000,
      30
    );
    assert.deepEqual(
      await client.eval(`window.__retroIdle.getTouchControls().held`),
      ['a', 'right'],
      'Fullscreen multi-touch should register both a and right'
    );
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4 && window.__retroIdle.getTouchControls().held.length === 0`),
      5000,
      30
    );

    // Floating HUD actions in fullscreen: Speed, Auto A + #fs-status, Mute, Pad toggle
    await client.eval(`document.getElementById('fs-speed-btn').click()`);
    const fsSpeed2 = await client.eval(`({
      speed: window.__retroIdle.getSpeed(),
      fsText: document.getElementById('fs-speed-btn').textContent,
      main2Active: document.querySelector('.speed-btn[data-speed="2"]').classList.contains('active'),
      activeTag: document.activeElement?.tagName,
    })`);
    assert.equal(fsSpeed2.speed, 2);
    assert.equal(fsSpeed2.fsText, '2x');
    assert.equal(fsSpeed2.main2Active, true);
    assert.notEqual(fsSpeed2.activeTag, 'BUTTON', '#fs-speed-btn must blur after click');
    await client.eval(`window.__retroIdle.setSpeed(1)`);

    await client.eval(`document.getElementById('fs-auto-a-btn').click()`);
    const fsAutoAOn = await client.eval(`({
      active: window.__retroIdle.getAutoA().active,
      btnText: document.getElementById('fs-auto-a-btn').textContent,
      fsStatusHidden: document.getElementById('fs-status').hidden,
      fsStatusText: document.getElementById('fs-status').textContent,
    })`);
    assert.equal(fsAutoAOn.active, true);
    assert.equal(fsAutoAOn.btnText, 'Stop A');
    assert.equal(fsAutoAOn.fsStatusHidden, false);
    assert.equal(fsAutoAOn.fsStatusText, 'Auto A: active');
    await client.eval(`document.getElementById('fs-auto-a-btn').click()`);
    await waitFor(
      async () => await client.eval(`!window.__retroIdle.getAutoA().active && document.getElementById('fs-status').hidden && window.__retroIdle.getEmulator().readMem(0xff47) === 0xe4`),
      5000,
      30
    );

    await client.eval(`document.getElementById('fs-mute-btn').click()`, { userGesture: true });
    assert.equal(await client.eval(`window.__retroIdle.getAudio().muted`), false, '#fs-mute-btn should unmute');
    await client.eval(`document.getElementById('fs-mute-btn').click()`, { userGesture: true });
    assert.equal(await client.eval(`window.__retroIdle.getAudio().muted`), true, '#fs-mute-btn should re-mute');

    await client.eval(`document.getElementById('fs-pad-btn').click()`);
    assert.equal(await client.eval(`window.__retroIdle.getTouchControls().visible`), false, '#fs-pad-btn should hide overlay pad');
    await client.eval(`document.getElementById('fs-pad-btn').click()`);
    assert.equal(await client.eval(`window.__retroIdle.getTouchControls().visible`), true, '#fs-pad-btn should restore overlay pad');

    const gbFsShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(LANDSCAPE_FS_SCREENSHOT_PATH, Buffer.from(gbFsShot.data, 'base64'));

    await client.eval(`document.getElementById('fs-exit-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getFullscreen().active === false && window.__retroIdle.getFullscreen().nativeActive === false && document.getElementById('fullscreen-hud').hidden === true`
        ),
      5000,
      30
    );

    // KeyF enters fullscreen and Escape exits fullscreen
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'f',
      code: 'KeyF',
      windowsVirtualKeyCode: 70,
      nativeVirtualKeyCode: 70,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'f',
      code: 'KeyF',
      windowsVirtualKeyCode: 70,
      nativeVirtualKeyCode: 70,
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getFullscreen().active === true`),
      5000,
      30
    );
    await sleep(100);
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
      nativeVirtualKeyCode: 27,
    });
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getFullscreen().active === false && window.__retroIdle.getFullscreen().nativeActive === false`
        ),
      5000,
      30
    );

    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await client.send('Emulation.clearDeviceMetricsOverride');
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getTouchControls().visible === false`),
      5000,
      40
    );

    // Synthetic Pokémon Yellow CGB/MBC5 boot + WRAM Auto-Fight detection verification
    const docYellow = await client.send('DOM.getDocument');
    const yellowInputNode = await client.send('DOM.querySelector', {
      nodeId: docYellow.root.nodeId,
      selector: '#rom-input',
    });
    await client.send('DOM.setFileInputFiles', {
      nodeId: yellowInputNode.nodeId,
      files: [YELLOW_ROM_PATH],
    });

    await waitFor(
      async () =>
        await client.eval(
          `Boolean(window.__retroIdle?.getEmulator()?.isPlaying && window.__retroIdle?.getAutoFight()?.profile === 'pokemon-yellow')`
        ),
      12000,
      50
    );

    const yellowUi = await client.eval(`({
      status: document.getElementById('status').textContent,
      autoFightDisabled: document.getElementById('auto-fight-btn').disabled,
      healHidden: document.getElementById('heal-center-status').hidden,
      supported: window.__retroIdle.getAutoFight().supported,
      profile: window.__retroIdle.getAutoFight().profile,
    })`);
    assert.match(
      yellowUi.status,
      /^Playing: POKEMON YELLOW \(MBC5 \+ RAM \+ BATTERY\)$/,
      `Unexpected Yellow status: ${yellowUi.status}`
    );
    assert.equal(yellowUi.autoFightDisabled, false, 'Auto-Fight button must enable for POKEMON YELLOW');
    assert.equal(yellowUi.healHidden, false, 'Heal Center status must be visible for POKEMON YELLOW');
    assert.equal(yellowUi.supported, true, 'Auto-Fight supported must be true for POKEMON YELLOW');
    assert.equal(yellowUi.profile, 'pokemon-yellow', 'Expected pokemon-yellow Auto-Fight profile');

    // Write Pokémon Yellow WRAM state inside Viridian Heal Center and confirm live frame observation + snapshot
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const writes = [
          [0xd056, 0],
          [0xd35d, 0x29],
          [0xd360, 7],
          [0xd361, 3],
          [0xd366, 6],
          [0xd367, 4],
          [0xd368, 7],
          [0xd162, 1],
          [0xd16a, 0x54],
          [0xd16b, 0],
          [0xd16c, 25],
          [0xd172, 84],
          [0xd187, 30],
          [0xd18b, 5],
          [0xd18c, 0],
          [0xd18d, 25],
        ];
        for (const [addr, val] of writes) {
          emu.module._emulator_write_mem(emu.e, addr, val);
        }
      })()
    `);

    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAutoFight().inPokeCenter === true`),
      6000,
      30
    );

    const yellowCheck = await client.eval(`({
      profile: window.__retroIdle.getAutoFight().profile,
      pokeCenterName: window.__retroIdle.getAutoFight().pokeCenterName,
      healStatus: document.getElementById('heal-center-status').textContent,
      snapshot: window.__retroIdle.getAutoFight().snapshot(),
    })`);
    assert.equal(yellowCheck.pokeCenterName, 'Viridian Heal Center');
    assert.match(yellowCheck.healStatus, /Heal Center visited: Viridian Heal Center/);
    assert.equal(yellowCheck.snapshot.map, 0x29);
    assert.equal(yellowCheck.snapshot.x, 3);
    assert.equal(yellowCheck.snapshot.y, 7);
    assert.equal(yellowCheck.snapshot.tileset, 6);
    assert.equal(yellowCheck.snapshot.partyCount, 1);
    assert.equal(yellowCheck.snapshot.party[0].hp, 25);
    assert.equal(yellowCheck.snapshot.party[0].moves[0], 84);
    assert.equal(yellowCheck.snapshot.party[0].pp[0], 30);

    // Manual Save State / Load State must also persist & restore the Heal Center trail
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const writes = [
          [0xd35d, 0x01],
          [0xd366, 0x00],
          [0xd367, 20],
          [0xd368, 20],
          [0xd361, 23],
          [0xd360, 26],
        ];
        for (const [addr, val] of writes) emu.module._emulator_write_mem(emu.e, addr, val);
      })()
    `);
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAutoFight().trailLength === 1`),
      5000,
      25
    );
    await client.eval(
      `window.__retroIdle.getEmulator().module._emulator_write_mem(window.__retroIdle.getEmulator().e, 0xd360, 27)`
    );
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAutoFight().trailLength === 2`),
      5000,
      25
    );
    await client.eval(
      `window.__retroIdle.getEmulator().module._emulator_write_mem(window.__retroIdle.getEmulator().e, 0xd360, 28)`
    );
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAutoFight().trailLength === 3`),
      5000,
      25
    );

    const yellowTrailBeforeSave = await client.eval(`({
      af: window.__retroIdle.getAutoFight(),
      trail: window.__retroIdle.getAutoFight().exportTrail(),
      healText: document.getElementById('heal-center-status').textContent,
      healLinked: document.getElementById('heal-center-status').classList.contains('linked'),
    })`);
    assert.equal(yellowTrailBeforeSave.af.pokeCenterName, 'Viridian Heal Center');
    assert.equal(yellowTrailBeforeSave.af.trailLength, 3);
    assert.equal(yellowTrailBeforeSave.af.hasHealPath, true);
    assert.equal(yellowTrailBeforeSave.healText, 'Heal Center path active: Viridian Heal Center (3 steps)');
    assert.equal(yellowTrailBeforeSave.healLinked, true);

    await client.eval(`document.getElementById('save-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('save-state-btn').disabled && document.getElementById('status').textContent.includes('state saved')`
        ),
      5000,
      25
    );

    // Break the trail by jumping >2 tiles away, then Load State and confirm trail restores
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        emu.module._emulator_write_mem(emu.e, 0xd361, 5);
        emu.module._emulator_write_mem(emu.e, 0xd360, 5);
      })()
    `);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoFight().trailLength === 0 && window.__retroIdle.getAutoFight().pokeCenterName === null`
        ),
      5000,
      25
    );

    await client.eval(`document.getElementById('load-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('load-state-btn').disabled && document.getElementById('status').textContent.includes('state loaded') && window.__retroIdle.getAutoFight().hasHealPath === true && window.__retroIdle.getAutoFight().trailLength === 3`
        ),
      5000,
      25
    );
    const yellowTrailAfterLoad = await client.eval(`({
      x: window.__retroIdle.getEmulator().readWramLinear(0xd361),
      y: window.__retroIdle.getEmulator().readWramLinear(0xd360),
      trail: window.__retroIdle.getAutoFight().exportTrail(),
      healText: document.getElementById('heal-center-status').textContent,
      healLinked: document.getElementById('heal-center-status').classList.contains('linked'),
    })`);
    assert.equal(yellowTrailAfterLoad.x, 23);
    assert.equal(yellowTrailAfterLoad.y, 28);
    assert.deepEqual(yellowTrailAfterLoad.trail, yellowTrailBeforeSave.trail);
    assert.equal(yellowTrailAfterLoad.healText, 'Heal Center path active: Viridian Heal Center (3 steps)');
    assert.equal(yellowTrailAfterLoad.healLinked, true);

    // Break trail in auto-save, reload page, then Load State and confirm manual heal path persists across refresh
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        emu.module._emulator_write_mem(emu.e, 0xd361, 5);
        emu.module._emulator_write_mem(emu.e, 0xd360, 5);
      })()
    `);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoFight().trailLength === 0 && window.__retroIdle.getAutoFight().pokeCenterName === null`
        ),
      5000,
      25
    );

    await client.eval(`window.__beforeReload = true`);
    await client.send('Page.reload');
    await waitFor(
      async () =>
        await client.eval(
          `window.__beforeReload === undefined && Boolean(window.__retroIdle?.getEmulator()?.isPlaying && document.getElementById('status')?.textContent.includes('resumed auto-save') && window.__retroIdle?.getAutoFight()?.profile === 'pokemon-yellow')`
        ),
      12000,
      40
    );
    const yellowPostReloadBeforeLoad = await client.eval(`({
      trailLength: window.__retroIdle.getAutoFight().trailLength,
      loadDisabled: document.getElementById('load-state-btn').disabled,
    })`);
    assert.equal(yellowPostReloadBeforeLoad.trailLength, 0);
    assert.equal(yellowPostReloadBeforeLoad.loadDisabled, false);

    await client.eval(`document.getElementById('load-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('load-state-btn').disabled && document.getElementById('status').textContent.includes('state loaded') && window.__retroIdle.getAutoFight().hasHealPath === true && window.__retroIdle.getAutoFight().trailLength === 3`
        ),
      5000,
      25
    );
    const yellowTrailAfterReloadLoad = await client.eval(`({
      x: window.__retroIdle.getEmulator().readWramLinear(0xd361),
      y: window.__retroIdle.getEmulator().readWramLinear(0xd360),
      trail: window.__retroIdle.getAutoFight().exportTrail(),
    })`);
    assert.equal(yellowTrailAfterReloadLoad.x, 23);
    assert.equal(yellowTrailAfterReloadLoad.y, 28);
    assert.deepEqual(yellowTrailAfterReloadLoad.trail, yellowTrailBeforeSave.trail);

    // Overwrite manual save with NO heal path, create a new active trail, then Load State -> trail must clear
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        emu.module._emulator_write_mem(emu.e, 0xd361, 5);
        emu.module._emulator_write_mem(emu.e, 0xd360, 5);
      })()
    `);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoFight().trailLength === 0 && window.__retroIdle.getAutoFight().pokeCenterName === null`
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
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const writes = [
          [0xd35d, 0x29],
          [0xd366, 6],
          [0xd367, 4],
          [0xd368, 7],
          [0xd361, 3],
          [0xd360, 7],
        ];
        for (const [addr, val] of writes) emu.module._emulator_write_mem(emu.e, addr, val);
      })()
    `);
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAutoFight().inPokeCenter === true`),
      5000,
      25
    );
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const writes = [
          [0xd35d, 0x01],
          [0xd366, 0x00],
          [0xd367, 20],
          [0xd368, 20],
          [0xd361, 23],
          [0xd360, 26],
        ];
        for (const [addr, val] of writes) emu.module._emulator_write_mem(emu.e, addr, val);
      })()
    `);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoFight().trailLength === 1 && window.__retroIdle.getAutoFight().hasHealPath === true`
        ),
      5000,
      25
    );
    await client.eval(`document.getElementById('load-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('load-state-btn').disabled && document.getElementById('status').textContent.includes('state loaded') && window.__retroIdle.getAutoFight().trailLength === 0 && window.__retroIdle.getAutoFight().pokeCenterName === null`
        ),
      5000,
      25
    );
    const yellowTrailAfterEmptyLoad = await client.eval(`({
      x: window.__retroIdle.getEmulator().readWramLinear(0xd361),
      y: window.__retroIdle.getEmulator().readWramLinear(0xd360),
      hasHealPath: window.__retroIdle.getAutoFight().hasHealPath,
      healLinked: document.getElementById('heal-center-status').classList.contains('linked'),
    })`);
    assert.equal(yellowTrailAfterEmptyLoad.x, 5);
    assert.equal(yellowTrailAfterEmptyLoad.y, 5);
    assert.equal(yellowTrailAfterEmptyLoad.hasHealPath, false);
    assert.equal(yellowTrailAfterEmptyLoad.healLinked, false);

    // Synthetic Pokémon Crystal CGB/MBC3+TIMER boot + GBC WRAM bank isolation + trainer battle stop
    const docCrystal = await client.send('DOM.getDocument');
    const crystalInputNode = await client.send('DOM.querySelector', {
      nodeId: docCrystal.root.nodeId,
      selector: '#rom-input',
    });
    await client.send('DOM.setFileInputFiles', {
      nodeId: crystalInputNode.nodeId,
      files: [CRYSTAL_ROM_PATH],
    });

    await waitFor(
      async () =>
        await client.eval(
          `Boolean(window.__retroIdle?.getEmulator()?.isPlaying && window.__retroIdle?.getAutoFight()?.profile === 'pokemon-crystal')`
        ),
      12000,
      50
    );

    const crystalUi = await client.eval(`({
      status: document.getElementById('status').textContent,
      autoFightDisabled: document.getElementById('auto-fight-btn').disabled,
      healHidden: document.getElementById('heal-center-status').hidden,
      supported: window.__retroIdle.getAutoFight().supported,
      profile: window.__retroIdle.getAutoFight().profile,
    })`);
    assert.match(
      crystalUi.status,
      /^Playing: PM_CRYSTAL \(MBC3 \+ TIMER \+ RAM \+ BATTERY\)$/,
      `Unexpected Crystal status: ${crystalUi.status}`
    );
    assert.equal(crystalUi.autoFightDisabled, false, 'Auto-Fight button must enable for PM_CRYSTAL');
    assert.equal(crystalUi.healHidden, false, 'Heal Center status must be visible for PM_CRYSTAL');
    assert.equal(crystalUi.supported, true, 'Auto-Fight supported must be true for PM_CRYSTAL');
    assert.equal(crystalUi.profile, 'pokemon-crystal', 'Expected pokemon-crystal Auto-Fight profile');

    // Switch rSVBK = 2, write sentinel garbage into WRAM bank 2 and valid Crystal Cherrygrove Heal Center state into WRAM bank 1
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        emu.module._emulator_write_mem(emu.e, 0xff70, 2);
        const ptr = emu.module._emulator_get_wram_ptr(emu.e);
        const wram = emu.module.HEAPU8;
        const wBank = (bank, addr, val) => {
          wram[ptr + ((bank << 12) | (addr & 0x0fff))] = val;
        };
        // Bank 2 garbage sentinels
        wBank(2, 0xd22d, 2);
        wBank(2, 0xdcb5, 99);
        wBank(2, 0xdcb6, 99);
        wBank(2, 0xdcd7, 0);
        // Bank 1 valid Cherrygrove PokéCenter (26, 5)
        wBank(1, 0xd22d, 0);
        wBank(1, 0xdcb5, 26);
        wBank(1, 0xdcb6, 5);
        wBank(1, 0xdcb7, 7);
        wBank(1, 0xdcb8, 3);
        wBank(1, 0xd199, 7);
        wBank(1, 0xd19e, 4);
        wBank(1, 0xd19f, 5);
        wBank(1, 0xdcd7, 1);
        wBank(1, 0xdcd8, 158);
        wBank(1, 0xdcdf + 0x00, 158);
        wBank(1, 0xdcdf + 0x02, 55);
        wBank(1, 0xdcdf + 0x17, 25);
        wBank(1, 0xdcdf + 0x1f, 5);
        wBank(1, 0xdcdf + 0x22, 0);
        wBank(1, 0xdcdf + 0x23, 21);
        wBank(1, 0xdcdf + 0x24, 0);
        wBank(1, 0xdcdf + 0x25, 21);
      })()
    `);

    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAutoFight().inPokeCenter === true`),
      6000,
      30
    );

    const crystalCheck = await client.eval(`({
      svbk: window.__retroIdle.getEmulator().readMem(0xff70) & 7,
      bank2MapGroup: window.__retroIdle.getEmulator().readMem(0xdcb5),
      profile: window.__retroIdle.getAutoFight().profile,
      pokeCenterName: window.__retroIdle.getAutoFight().pokeCenterName,
      healStatus: document.getElementById('heal-center-status').textContent,
      snapshot: window.__retroIdle.getAutoFight().snapshot(),
    })`);
    assert.equal(crystalCheck.svbk, 2, 'Expected rSVBK to remain 2');
    assert.equal(crystalCheck.bank2MapGroup, 99, 'Expected direct readMem(0xDCB5) to hit WRAM bank 2 sentinel');
    assert.equal(crystalCheck.pokeCenterName, 'Cherrygrove Heal Center');
    assert.match(crystalCheck.healStatus, /Heal Center visited: Cherrygrove Heal Center/);
    assert.equal(crystalCheck.snapshot.mapGroup, 26);
    assert.equal(crystalCheck.snapshot.mapNumber, 5);
    assert.equal(crystalCheck.snapshot.x, 3);
    assert.equal(crystalCheck.snapshot.y, 7);
    assert.equal(crystalCheck.snapshot.tileset, 7);
    assert.equal(crystalCheck.snapshot.partyCount, 1);
    assert.equal(crystalCheck.snapshot.party[0].hp, 21);
    assert.equal(crystalCheck.snapshot.party[0].moves[0], 55);
    assert.equal(crystalCheck.snapshot.party[0].pp[0], 25);

    // Inject trainer battle into WRAM bank 1 (while WRAM bank 2 sentinel stays 0) -> verify automatic stop
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const ptr = emu.module._emulator_get_wram_ptr(emu.e);
        const wram = emu.module.HEAPU8;
        const wBank = (bank, addr, val) => {
          wram[ptr + ((bank << 12) | (addr & 0x0fff))] = val;
        };
        wBank(2, 0xd22d, 0); // bank 2 sentinel = overworld
        wBank(1, 0xd22d, 2); // bank 1 wBattleMode = trainer battle
        wBank(0, 0xc62c + 0x00, 158);
        wBank(0, 0xc62c + 0x02, 55);
        wBank(0, 0xc62c + 0x08, 25);
        wBank(0, 0xc62c + 0x0d, 5);
        wBank(0, 0xc62c + 0x10, 0);
        wBank(0, 0xc62c + 0x11, 21);
        wBank(0, 0xc62c + 0x12, 0);
        wBank(0, 0xc62c + 0x13, 21);
      })()
    `);
    await client.eval(`document.getElementById('auto-fight-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoFight().active === false && window.__retroIdle.getAutoFight().stopReason === 'trainer battle'`
        ),
      6000,
      30
    );
    const trainerStopUi = await client.eval(`({
      statusText: document.getElementById('auto-fight-status').textContent,
      isError: document.getElementById('auto-fight-status').classList.contains('error'),
    })`);
    assert.equal(trainerStopUi.statusText, 'Auto-Fight stopped: trainer battle');
    assert.equal(trainerStopUi.isError, true);

    const prefsAfterAutoStop = await client.eval(`JSON.parse(localStorage.getItem('retro-idle:prefs') || 'null')`);
    assert.equal(prefsAfterAutoStop?.autoFightRomId, null, 'Automatic stop must clear persisted Auto-Fight state');

    // UI button persistence across page refresh (Speed, Touch Pad, Auto-Fight)
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const ptr = emu.module._emulator_get_wram_ptr(emu.e);
        emu.module.HEAPU8[ptr + ((1 << 12) | (0xd22d & 0x0fff))] = 0; // wBattleMode = overworld
      })()
    `);

    await client.eval(`document.querySelector('.speed-btn[data-speed="4"]').click()`);
    await client.eval(`document.getElementById('touch-pad-btn').click()`);
    await client.eval(`document.getElementById('auto-fight-btn').click()`);
    await client.eval(`document.getElementById('mute-btn').click()`, { userGesture: true });
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getSpeed() === 4 && window.__retroIdle.getTouchControls().visible === true && window.__retroIdle.getAutoFight().active === true && window.__retroIdle.getAudio().muted === false`
        ),
      6000,
      30
    );

    await client.eval(`window.__beforeReload = true`);
    await client.send('Page.reload');
    await waitFor(
      async () =>
        await client.eval(
          `window.__beforeReload === undefined && Boolean(window.__retroIdle?.getEmulator()?.isPlaying && document.getElementById('status')?.textContent.includes('resumed auto-save') && window.__retroIdle?.getAutoFight()?.active === true)`
        ),
      12000,
      40
    );

    const prefsAfterReload1 = await client.eval(`({
      speed: window.__retroIdle.getSpeed(),
      emuSpeed: window.__retroIdle.getEmulator().speed,
      speed4Active: document.querySelector('.speed-btn[data-speed="4"]').classList.contains('active'),
      speed4Pressed: document.querySelector('.speed-btn[data-speed="4"]').getAttribute('aria-pressed'),
      speed1Active: document.querySelector('.speed-btn[data-speed="1"]').classList.contains('active'),
      touchVisible: window.__retroIdle.getTouchControls().visible,
      touchBtnActive: document.getElementById('touch-pad-btn').classList.contains('active'),
      touchBtnPressed: document.getElementById('touch-pad-btn').getAttribute('aria-pressed'),
      bodyTouchClass: document.body.classList.contains('touch-controls-visible'),
      autoFightActive: window.__retroIdle.getAutoFight().active,
      autoFightBtnActive: document.getElementById('auto-fight-btn').classList.contains('active'),
      autoFightBtnPressed: document.getElementById('auto-fight-btn').getAttribute('aria-pressed'),
      autoFightBtnText: document.getElementById('auto-fight-btn').textContent,
      autoFightStatusHidden: document.getElementById('auto-fight-status').hidden,
      autoFightStatusError: document.getElementById('auto-fight-status').classList.contains('error'),
      muted: window.__retroIdle.getAudio().muted,
      muteBtnText: document.getElementById('mute-btn').textContent,
      muteBtnActive: document.getElementById('mute-btn').classList.contains('active'),
      muteBtnPressed: document.getElementById('mute-btn').getAttribute('aria-pressed'),
      screenRect: document.getElementById('screen').getBoundingClientRect().toJSON(),
      gamepadRect: document.getElementById('touch-gamepad').getBoundingClientRect().toJSON(),
      speedRect: document.querySelector('.speed-controls').getBoundingClientRect().toJSON(),
      controlsRect: document.querySelector('.controls').getBoundingClientRect().toJSON(),
    })`);
    assert.equal(prefsAfterReload1.speed, 4, 'Speed 4x must persist across refresh');
    assert.equal(prefsAfterReload1.emuSpeed, 4, 'Emulator speed must restore to 4x on refresh');
    assert.equal(prefsAfterReload1.speed4Active, true);
    assert.equal(prefsAfterReload1.speed4Pressed, 'true');
    assert.equal(prefsAfterReload1.speed1Active, false);
    assert.equal(prefsAfterReload1.touchVisible, true, 'Touch Pad ON must persist across refresh');
    assert.equal(prefsAfterReload1.touchBtnActive, true);
    assert.equal(prefsAfterReload1.touchBtnPressed, 'true');
    assert.equal(prefsAfterReload1.bodyTouchClass, true);
    assert.ok(
      prefsAfterReload1.gamepadRect.top >= prefsAfterReload1.screenRect.bottom - 2,
      `Desktop Touch Pad must appear below screen (${prefsAfterReload1.gamepadRect.top} >= ${prefsAfterReload1.screenRect.bottom})`
    );
    assert.ok(
      prefsAfterReload1.gamepadRect.bottom <= prefsAfterReload1.speedRect.top + 2,
      `Desktop Touch Pad must appear above speed controls (${prefsAfterReload1.gamepadRect.bottom} <= ${prefsAfterReload1.speedRect.top})`
    );
    assert.ok(
      prefsAfterReload1.gamepadRect.bottom <= prefsAfterReload1.controlsRect.top + 2,
      `Desktop Touch Pad must appear above toolbar controls (${prefsAfterReload1.gamepadRect.bottom} <= ${prefsAfterReload1.controlsRect.top})`
    );
    assert.equal(prefsAfterReload1.autoFightActive, true, 'Auto-Fight ON must persist across refresh');
    assert.equal(prefsAfterReload1.autoFightBtnActive, true);
    assert.equal(prefsAfterReload1.autoFightBtnPressed, 'true');
    assert.equal(prefsAfterReload1.autoFightBtnText, 'Stop Auto-Fight');
    assert.equal(prefsAfterReload1.autoFightStatusHidden, false);
    assert.equal(prefsAfterReload1.autoFightStatusError, false);
    assert.equal(prefsAfterReload1.muted, false, 'Unmuted state must persist across refresh');
    assert.equal(prefsAfterReload1.muteBtnText, 'Mute');
    assert.equal(prefsAfterReload1.muteBtnActive, false);
    assert.equal(prefsAfterReload1.muteBtnPressed, 'false');

    // Turn all four back OFF / 1x / muted, refresh again, and confirm OFF state persists (including explicit Touch Pad OFF on mobile)
    await client.eval(`document.getElementById('auto-fight-btn').click()`);
    await client.eval(`document.getElementById('touch-pad-btn').click()`);
    await client.eval(`document.querySelector('.speed-btn[data-speed="1"]').click()`);
    await client.eval(`document.getElementById('mute-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getSpeed() === 1 && window.__retroIdle.getTouchControls().visible === false && window.__retroIdle.getAutoFight().active === false && window.__retroIdle.getAudio().muted === true`
        ),
      5000,
      30
    );

    await client.eval(`window.__beforeReload = true`);
    await client.send('Page.reload');
    await waitFor(
      async () =>
        await client.eval(
          `window.__beforeReload === undefined && Boolean(window.__retroIdle?.getEmulator()?.isPlaying && document.getElementById('status')?.textContent.includes('resumed auto-save'))`
        ),
      12000,
      40
    );

    const prefsAfterReload2 = await client.eval(`({
      speed: window.__retroIdle.getSpeed(),
      speed1Active: document.querySelector('.speed-btn[data-speed="1"]').classList.contains('active'),
      touchVisible: window.__retroIdle.getTouchControls().visible,
      touchBtnActive: document.getElementById('touch-pad-btn').classList.contains('active'),
      touchBtnPressed: document.getElementById('touch-pad-btn').getAttribute('aria-pressed'),
      autoFightActive: window.__retroIdle.getAutoFight().active,
      autoFightBtnActive: document.getElementById('auto-fight-btn').classList.contains('active'),
      autoFightBtnPressed: document.getElementById('auto-fight-btn').getAttribute('aria-pressed'),
      autoFightBtnText: document.getElementById('auto-fight-btn').textContent,
      muted: window.__retroIdle.getAudio().muted,
      hasContext: window.__retroIdle.getAudio().hasContext,
      muteBtnText: document.getElementById('mute-btn').textContent,
      muteBtnActive: document.getElementById('mute-btn').classList.contains('active'),
      muteBtnPressed: document.getElementById('mute-btn').getAttribute('aria-pressed'),
    })`);
    assert.equal(prefsAfterReload2.speed, 1, 'Speed 1x must persist after turning back to 1x');
    assert.equal(prefsAfterReload2.speed1Active, true);
    assert.equal(prefsAfterReload2.touchVisible, false, 'Touch Pad OFF must persist across refresh');
    assert.equal(prefsAfterReload2.touchBtnActive, false);
    assert.equal(prefsAfterReload2.touchBtnPressed, 'false');
    assert.equal(prefsAfterReload2.autoFightActive, false, 'Auto-Fight OFF must stay off across refresh');
    assert.equal(prefsAfterReload2.autoFightBtnActive, false);
    assert.equal(prefsAfterReload2.autoFightBtnPressed, 'false');
    assert.equal(prefsAfterReload2.autoFightBtnText, 'Auto-Fight');
    assert.equal(prefsAfterReload2.muted, true, 'Muted state must persist across refresh');
    assert.equal(prefsAfterReload2.hasContext, false, 'AudioContext should not be created on reload when muted');
    assert.equal(prefsAfterReload2.muteBtnText, 'Unmute');
    assert.equal(prefsAfterReload2.muteBtnActive, true);
    assert.equal(prefsAfterReload2.muteBtnPressed, 'true');

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(100);
    assert.equal(
      await client.eval(`window.__retroIdle.getTouchControls().visible`),
      false,
      'Explicit Touch Pad OFF preference must override responsive mobile auto-show'
    );
    await client.send('Emulation.clearDeviceMetricsOverride');
    await client.eval(`window.__retroIdle.getTouchControls().setVisible(null)`);

    // Synthetic GBA Mode 3 boot, 240x160 viewport, SRAM/state/speed/reload/reset/touch checks
    const docGba = await client.send('DOM.getDocument');
    const gbaInputNode = await client.send('DOM.querySelector', {
      nodeId: docGba.root.nodeId,
      selector: '#rom-input',
    });
    await client.send('DOM.setFileInputFiles', {
      nodeId: gbaInputNode.nodeId,
      files: [GBA_ROM_PATH],
    });
    await waitFor(
      async () =>
        await client.eval(
          `Boolean(window.__retroIdle?.getEmulator()?.isPlaying && window.__retroIdle.getEmulator().platform === 'gba' && window.__retroIdle.getEmulator().sramSize === 32768) && ${HAS_NON_BLANK_CANVAS_EXPR}`
        ),
      15000,
      50
    );

    const gbaState = await client.eval(`
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
          hash ^= data[i] ^ (data[i + 1] << 8) ^ (data[i + 2] << 16);
          hash = Math.imul(hash, 16777619);
        }
        return {
          playing: emu.isPlaying,
          platform: emu.platform,
          width: c.width,
          height: c.height,
          gbaModeClass: document.body.classList.contains('gba-mode'),
          status: document.getElementById('status').textContent,
          sramSize: emu.sramSize,
          sramEcho: emu.readMem(0x02000000),
          inputMarker: emu.readMem(0x02000008),
          autoFightDisabled: document.getElementById('auto-fight-btn').disabled,
          exportSavDisabled: document.getElementById('export-sav-btn').disabled,
          importSavDisabled: document.getElementById('import-sav-btn').disabled,
          saveStateDisabled: document.getElementById('save-state-btn').disabled,
          loadStateDisabled: document.getElementById('load-state-btn').disabled,
          colorCount: colors.size,
          hash1: hash >>> 0,
        };
      })()
    `);
    assert.equal(gbaState.playing, true);
    assert.equal(gbaState.platform, 'gba');
    assert.equal(gbaState.width, 240);
    assert.equal(gbaState.height, 160);
    assert.equal(gbaState.gbaModeClass, true);
    assert.match(gbaState.status, /^Playing: GBA TEST \(GBA · BTEE\)$/);
    assert.equal(gbaState.sramSize, 32768);
    assert.equal(gbaState.sramEcho, 0xa5);
    assert.equal(gbaState.inputMarker, 0xe4);
    assert.equal(gbaState.autoFightDisabled, true);
    assert.equal(gbaState.exportSavDisabled, false);
    assert.equal(gbaState.importSavDisabled, false);
    assert.equal(gbaState.saveStateDisabled, false);
    assert.equal(gbaState.loadStateDisabled, true);
    assert.ok(gbaState.colorCount >= 2, `Expected >= 2 colors on GBA canvas, got ${gbaState.colorCount}`);

    await sleep(250);
    const gbaHash2 = await client.eval(`
      (() => {
        const c = document.getElementById('screen');
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 4) {
          hash ^= data[i] ^ (data[i + 1] << 8) ^ (data[i + 2] << 16);
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      })()
    `);
    assert.notEqual(gbaHash2, gbaState.hash1, 'GBA canvas pixels must animate across VBlank frames');

    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'x',
      code: 'KeyX',
      windowsVirtualKeyCode: 88,
      nativeVirtualKeyCode: 88,
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0x02000008) === 0x1b`),
      5000,
      30
    );
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'x',
      code: 'KeyX',
      windowsVirtualKeyCode: 88,
      nativeVirtualKeyCode: 88,
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0x02000008) === 0xe4`),
      5000,
      30
    );

    const gbaSavPath = path.join(DOWNLOADS_DIR, 'GBA_TEST.sav');
    fs.rmSync(gbaSavPath, { force: true });
    await client.eval(`document.getElementById('export-sav-btn').click()`, { userGesture: true });
    await waitFor(
      async () =>
        fs.existsSync(gbaSavPath) &&
        fs.statSync(gbaSavPath).size === 32768 &&
        (await client.eval(`document.getElementById('status').textContent.includes('exported .sav')`)),
      6000,
      30
    );
    const gbaExported = fs.readFileSync(gbaSavPath);
    assert.equal(gbaExported.length, 32768);
    assert.equal(gbaExported[0x2000], 0xa5);
    fs.rmSync(gbaSavPath, { force: true });

    const gbaImportedBytes = new Uint8Array(32768);
    gbaImportedBytes.set([0xde, 0xad, 0xbe, 0xef], 0x0000);
    gbaImportedBytes[0x2001] = 0x42;
    fs.writeFileSync(IMPORTED_SAV_PATH, gbaImportedBytes);

    const docGbaSav = await client.send('DOM.getDocument');
    const gbaSavInputNode = await client.send('DOM.querySelector', {
      nodeId: docGbaSav.root.nodeId,
      selector: '#sav-input',
    });
    await client.send('DOM.setFileInputFiles', {
      nodeId: gbaSavInputNode.nodeId,
      files: [IMPORTED_SAV_PATH],
    });
    await waitFor(
      async () =>
        await client.eval(
          `(() => { const emu = window.__retroIdle.getEmulator(); return !document.getElementById('import-sav-btn').disabled && emu?.isPlaying && emu.platform === 'gba' && emu.sramSize === 32768 && (emu.module._gba_read32(emu.e, 0x02000004) >>> 0) >= 2 && document.getElementById('status').textContent.includes('imported .sav'); })()`
        ),
      8000,
      40
    );
    const gbaSramAfterImport = await client.eval(`
      (() => {
        const ram = window.__retroIdle.getEmulator().getExtRam();
        return {
          head: Array.from(ram.slice(0, 4)),
          b2000: ram[0x2000],
          b2001: ram[0x2001],
        };
      })()
    `);
    assert.deepEqual(gbaSramAfterImport.head, [0xde, 0xad, 0xbe, 0xef]);
    assert.equal(gbaSramAfterImport.b2000, 0xa5);
    assert.equal(gbaSramAfterImport.b2001, 0x42);

    const gbaFrameBeforeSave = await waitFor(async () => {
      const f = await client.eval(
        `(() => { const emu = window.__retroIdle.getEmulator(); return emu.module._gba_read32(emu.e, 0x02000004) >>> 0; })()`
      );
      return f >= 15 ? f : false;
    }, 8000, 25);

    await client.eval(`document.getElementById('save-state-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `!document.getElementById('save-state-btn').disabled && document.getElementById('status').textContent.includes('state saved')`
        ),
      6000,
      30
    );
    await waitFor(async () => {
      const f = await client.eval(
        `(() => { const emu = window.__retroIdle.getEmulator(); return emu.module._gba_read32(emu.e, 0x02000004) >>> 0; })()`
      );
      return f - gbaFrameBeforeSave >= 35 ? f : false;
    }, 8000, 25);

    let gbaFrameAfterLoad = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      await client.eval(`document.getElementById('load-state-btn').click()`);
      await waitFor(
        async () =>
          await client.eval(
            `!document.getElementById('load-state-btn').disabled && document.getElementById('status').textContent.includes('state loaded')`
          ),
        6000,
        25
      );
      const loadedInfo = await client.eval(`
        (() => {
          const emu = window.__retroIdle.getEmulator();
          return {
            playing: emu.isPlaying,
            frame: emu.module._gba_read32(emu.e, 0x02000004) >>> 0,
          };
        })()
      `);
      assert.equal(loadedInfo.playing, true);
      assert.ok(
        loadedInfo.frame >= gbaFrameBeforeSave && loadedInfo.frame <= gbaFrameBeforeSave + 25,
        `GBA Load State #${attempt} frame ${loadedInfo.frame} not within [${gbaFrameBeforeSave}, ${gbaFrameBeforeSave + 25}]`
      );
      gbaFrameAfterLoad = loadedInfo.frame;
    }

    const gbaT1Start = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
    await sleep(350);
    const gbaT1End = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
    const gbaTicks1x = gbaT1End - gbaT1Start;
    assert.ok(gbaTicks1x > 0, `Expected positive GBA ticks at 1x, got ${gbaTicks1x}`);

    await client.eval(`document.querySelector('.speed-btn[data-speed="4"]').click()`);
    const gbaT4Start = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
    await sleep(350);
    const gbaT4End = await client.eval(`window.__retroIdle.getEmulator().getTicks()`);
    const gbaTicks4x = gbaT4End - gbaT4Start;
    assert.ok(
      gbaTicks4x > gbaTicks1x * 2.2,
      `Expected GBA 4x ticks (${gbaTicks4x}) > 2.2x of 1x ticks (${gbaTicks1x})`
    );
    await client.eval(`document.querySelector('.speed-btn[data-speed="1"]').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getSpeed() === 1 && window.__retroIdle.getEmulator().speed === 1`
        ),
      4000,
      20
    );

    await client.eval(`window.__beforeReload = true`);
    await client.send('Page.reload');
    await waitFor(
      async () =>
        await client.eval(
          `window.__beforeReload === undefined && Boolean(window.__retroIdle?.getEmulator()?.isPlaying && window.__retroIdle.getEmulator().platform === 'gba' && document.getElementById('status')?.textContent.includes('resumed auto-save'))`
        ),
      15000,
      40
    );
    const gbaReload1 = await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const c = document.getElementById('screen');
        return {
          width: c.width,
          height: c.height,
          gbaMode: document.body.classList.contains('gba-mode'),
          loadDisabled: document.getElementById('load-state-btn').disabled,
          frame: emu.module._gba_read32(emu.e, 0x02000004) >>> 0,
        };
      })()
    `);
    assert.equal(gbaReload1.width, 240);
    assert.equal(gbaReload1.height, 160);
    assert.equal(gbaReload1.gbaMode, true);
    assert.equal(gbaReload1.loadDisabled, false);
    await sleep(250);
    const gbaReloadFrame2 = await client.eval(
      `(() => { const emu = window.__retroIdle.getEmulator(); return emu.module._gba_read32(emu.e, 0x02000004) >>> 0; })()`
    );
    assert.ok(
      gbaReloadFrame2 > gbaReload1.frame,
      `GBA should keep advancing after reload (${gbaReload1.frame} -> ${gbaReloadFrame2})`
    );

    await client.eval(`document.getElementById('reset-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `(() => { const emu = window.__retroIdle.getEmulator(); return !document.getElementById('reset-btn').disabled && emu?.isPlaying && emu.platform === 'gba' && emu.sramSize === 32768 && (emu.module._gba_read32(emu.e, 0x02000004) >>> 0) >= 2; })()`
        ),
      10000,
      40
    );
    const gbaSramAfterReset = await client.eval(`
      (() => {
        const ram = window.__retroIdle.getEmulator().getExtRam();
        return {
          head: Array.from(ram.slice(0, 4)),
          b2000: ram[0x2000],
          b2001: ram[0x2001],
        };
      })()
    `);
    assert.deepEqual(gbaSramAfterReset.head, [0xde, 0xad, 0xbe, 0xef]);
    assert.equal(gbaSramAfterReset.b2000, 0xa5);
    assert.equal(gbaSramAfterReset.b2001, 0x42);

    // Mobile GBA portrait & landscape touch checks (L/R shoulder buttons visible, no overflow)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await client.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: 5,
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getTouchControls().visible === true`),
      5000,
      40
    );
    const gbaPortraitLayout = await client.eval(`
      (() => {
        const screenRect = document.getElementById('screen').getBoundingClientRect();
        const gamepadRect = document.getElementById('touch-gamepad').getBoundingClientRect();
        const lRect = document.querySelector('[data-gb-btn="l"]').getBoundingClientRect();
        const rRect = document.querySelector('[data-gb-btn="r"]').getBoundingClientRect();
        const turboARect = document.querySelector('[data-gb-btn="turboA"]').getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          screenBottom: screenRect.bottom,
          gamepadBottom: gamepadRect.bottom,
          lWidth: lRect.width,
          lHeight: lRect.height,
          lBottom: lRect.bottom,
          rWidth: rRect.width,
          rHeight: rRect.height,
          rBottom: rRect.bottom,
          turboAWidth: turboARect.width,
          turboAHeight: turboARect.height,
          turboABottom: turboARect.bottom,
        };
      })()
    `);
    assert.ok(
      gbaPortraitLayout.scrollWidth <= gbaPortraitLayout.innerWidth,
      `GBA portrait overflow: ${gbaPortraitLayout.scrollWidth} > ${gbaPortraitLayout.innerWidth}`
    );
    assert.ok(
      gbaPortraitLayout.lWidth > 40 && gbaPortraitLayout.lHeight > 20,
      `GBA portrait L button not visible: ${JSON.stringify(gbaPortraitLayout)}`
    );
    assert.ok(
      gbaPortraitLayout.rWidth > 40 && gbaPortraitLayout.rHeight > 20,
      `GBA portrait R button not visible: ${JSON.stringify(gbaPortraitLayout)}`
    );
    assert.ok(
      gbaPortraitLayout.turboAWidth > 60 && gbaPortraitLayout.turboAHeight > 20,
      `GBA portrait TURBO A button not visible: ${JSON.stringify(gbaPortraitLayout)}`
    );
    assert.ok(
      Math.max(
        gbaPortraitLayout.screenBottom,
        gbaPortraitLayout.gamepadBottom,
        gbaPortraitLayout.lBottom,
        gbaPortraitLayout.rBottom,
        gbaPortraitLayout.turboABottom
      ) <= 844,
      `GBA portrait controls overflow 844px height (${JSON.stringify(gbaPortraitLayout)})`
    );

    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 844,
      height: 390,
      deviceScaleFactor: 2,
      mobile: true,
    });
    const gbaLandscapeLayout = await client.eval(`
      (() => {
        const screenRect = document.getElementById('screen').getBoundingClientRect();
        const dpadRect = document.getElementById('touch-dpad').getBoundingClientRect();
        const aRect = document.querySelector('[data-gb-btn="a"]').getBoundingClientRect();
        const startRect = document.querySelector('[data-gb-btn="start"]').getBoundingClientRect();
        const lRect = document.querySelector('[data-gb-btn="l"]').getBoundingClientRect();
        const rRect = document.querySelector('[data-gb-btn="r"]').getBoundingClientRect();
        const turboARect = document.querySelector('[data-gb-btn="turboA"]').getBoundingClientRect();
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          dpadRight: dpadRect.right,
          screenLeft: screenRect.left,
          screenRight: screenRect.right,
          aLeft: aRect.left,
          screenBottom: screenRect.bottom,
          dpadBottom: dpadRect.bottom,
          aBottom: aRect.bottom,
          startBottom: startRect.bottom,
          lWidth: lRect.width,
          lHeight: lRect.height,
          lBottom: lRect.bottom,
          rWidth: rRect.width,
          rHeight: rRect.height,
          rBottom: rRect.bottom,
          turboAWidth: turboARect.width,
          turboAHeight: turboARect.height,
          turboABottom: turboARect.bottom,
        };
      })()
    `);
    assert.ok(
      gbaLandscapeLayout.scrollWidth <= gbaLandscapeLayout.innerWidth,
      `GBA landscape overflow: ${gbaLandscapeLayout.scrollWidth} > ${gbaLandscapeLayout.innerWidth}`
    );
    assert.ok(
      gbaLandscapeLayout.lWidth > 40 && gbaLandscapeLayout.lHeight > 20,
      `GBA landscape L button not visible: ${JSON.stringify(gbaLandscapeLayout)}`
    );
    assert.ok(
      gbaLandscapeLayout.rWidth > 40 && gbaLandscapeLayout.rHeight > 20,
      `GBA landscape R button not visible: ${JSON.stringify(gbaLandscapeLayout)}`
    );
    assert.ok(
      gbaLandscapeLayout.turboAWidth > 60 && gbaLandscapeLayout.turboAHeight > 20,
      `GBA landscape TURBO A button not visible: ${JSON.stringify(gbaLandscapeLayout)}`
    );
    assert.ok(
      gbaLandscapeLayout.dpadRight <= gbaLandscapeLayout.screenLeft + 8,
      `Expected D-Pad left of GBA screen in landscape (${gbaLandscapeLayout.dpadRight} <= ${gbaLandscapeLayout.screenLeft})`
    );
    assert.ok(
      gbaLandscapeLayout.screenRight <= gbaLandscapeLayout.aLeft + 8,
      `Expected A button right of GBA screen in landscape (${gbaLandscapeLayout.screenRight} <= ${gbaLandscapeLayout.aLeft})`
    );
    assert.ok(
      Math.max(
        gbaLandscapeLayout.screenBottom,
        gbaLandscapeLayout.dpadBottom,
        gbaLandscapeLayout.aBottom,
        gbaLandscapeLayout.startBottom,
        gbaLandscapeLayout.lBottom,
        gbaLandscapeLayout.rBottom,
        gbaLandscapeLayout.turboABottom
      ) <= 390,
      `GBA landscape controls overflow 390px height (${JSON.stringify(gbaLandscapeLayout)})`
    );

    // GBA Landscape Fullscreen (844x390): L/R shoulders clear of HUD, 3:2 canvas fills height, touch A works
    await client.eval(`document.getElementById('fullscreen-btn').click()`, { userGesture: true });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getFullscreen().active === true`),
      5000,
      30
    );
    const gbaFsLayout = await client.eval(`(() => {
      const screenRect = document.getElementById('screen').getBoundingClientRect();
      const hudRect = document.getElementById('fullscreen-hud').getBoundingClientRect();
      const dpadRect = document.getElementById('touch-dpad').getBoundingClientRect();
      const lRect = document.querySelector('[data-gb-btn="l"]').getBoundingClientRect();
      const rRect = document.querySelector('[data-gb-btn="r"]').getBoundingClientRect();
      const aRect = document.querySelector('[data-gb-btn="a"]').getBoundingClientRect();
      const bRect = document.querySelector('[data-gb-btn="b"]').getBoundingClientRect();
      const turboARect = document.querySelector('[data-gb-btn="turboA"]').getBoundingClientRect();
      const selectRect = document.querySelector('[data-gb-btn="select"]').getBoundingClientRect();
      const startRect = document.querySelector('[data-gb-btn="start"]').getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        screenRect: screenRect.toJSON(),
        hudRect: hudRect.toJSON(),
        dpadRect: dpadRect.toJSON(),
        lRect: lRect.toJSON(),
        rRect: rRect.toJSON(),
        aRect: aRect.toJSON(),
        bRect: bRect.toJSON(),
        turboARect: turboARect.toJSON(),
        selectRect: selectRect.toJSON(),
        startRect: startRect.toJSON(),
        aCenter: { x: Math.round(aRect.left + aRect.width / 2), y: Math.round(aRect.top + aRect.height / 2) },
      };
    })()`);
    assert.ok(gbaFsLayout.scrollWidth <= 844, `GBA fullscreen horizontal overflow: ${gbaFsLayout.scrollWidth}`);
    assert.ok(gbaFsLayout.scrollHeight <= 390, `GBA fullscreen vertical overflow: ${gbaFsLayout.scrollHeight}`);
    assert.ok(gbaFsLayout.screenRect.height >= 388, `Expected GBA fullscreen canvas height >= 388, got ${gbaFsLayout.screenRect.height}`);
    assert.ok(gbaFsLayout.screenRect.width >= 580, `Expected GBA 3:2 fullscreen canvas width >= 580, got ${gbaFsLayout.screenRect.width}`);
    assert.ok(
      gbaFsLayout.lRect.width > 40 && gbaFsLayout.lRect.height > 20,
      `GBA fullscreen L button not visible: ${JSON.stringify(gbaFsLayout.lRect)}`
    );
    assert.ok(
      gbaFsLayout.rRect.width > 40 && gbaFsLayout.rRect.height > 20,
      `GBA fullscreen R button not visible: ${JSON.stringify(gbaFsLayout.rRect)}`
    );
    assert.ok(
      gbaFsLayout.lRect.right <= gbaFsLayout.hudRect.left + 1,
      `Expected L button left of HUD (${gbaFsLayout.lRect.right} <= ${gbaFsLayout.hudRect.left})`
    );
    assert.ok(
      gbaFsLayout.hudRect.right <= gbaFsLayout.rRect.left + 1,
      `Expected HUD left of R button (${gbaFsLayout.hudRect.right} <= ${gbaFsLayout.rRect.left})`
    );
    for (const [label, r] of [
      ['hud', gbaFsLayout.hudRect],
      ['l', gbaFsLayout.lRect],
      ['r', gbaFsLayout.rRect],
      ['dpad', gbaFsLayout.dpadRect],
      ['a', gbaFsLayout.aRect],
      ['b', gbaFsLayout.bRect],
      ['turboA', gbaFsLayout.turboARect],
      ['select', gbaFsLayout.selectRect],
      ['start', gbaFsLayout.startRect],
    ]) {
      assert.ok(
        r.left >= -1 && r.top >= -1 && r.right <= 845 && r.bottom <= 391,
        `GBA fullscreen ${label} out of 844x390 bounds: ${JSON.stringify(r)}`
      );
    }
    assert.ok(gbaFsLayout.dpadRect.right <= gbaFsLayout.selectRect.left + 1, 'D-Pad overlaps SELECT in GBA fullscreen');
    assert.ok(gbaFsLayout.startRect.right <= gbaFsLayout.bRect.left + 1, 'START overlaps B in GBA fullscreen');

    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: gbaFsLayout.aCenter.x, y: gbaFsLayout.aCenter.y, id: 1 }],
    });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0x02000008) === 0x1b`),
      5000,
      30
    );
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getEmulator().readMem(0x02000008) === 0xe4`),
      5000,
      30
    );

    const gbaFsShot = await client.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(GBA_LANDSCAPE_FS_SCREENSHOT_PATH, Buffer.from(gbaFsShot.data, 'base64'));

    // Portrait fullscreen fallback check (390x844)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    const portraitFsLayout = await client.eval(`(() => {
      const hudRect = document.getElementById('fullscreen-hud').getBoundingClientRect();
      const lRect = document.querySelector('[data-gb-btn="l"]').getBoundingClientRect();
      const rRect = document.querySelector('[data-gb-btn="r"]').getBoundingClientRect();
      const dpadRect = document.getElementById('touch-dpad').getBoundingClientRect();
      const bRect = document.querySelector('[data-gb-btn="b"]').getBoundingClientRect();
      const selectRect = document.querySelector('[data-gb-btn="select"]').getBoundingClientRect();
      const startRect = document.querySelector('[data-gb-btn="start"]').getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        hudRect: hudRect.toJSON(),
        lRect: lRect.toJSON(),
        rRect: rRect.toJSON(),
        dpadRect: dpadRect.toJSON(),
        bRect: bRect.toJSON(),
        selectRect: selectRect.toJSON(),
        startRect: startRect.toJSON(),
      };
    })()`);
    assert.ok(portraitFsLayout.scrollWidth <= 390, `Portrait fullscreen horizontal overflow: ${portraitFsLayout.scrollWidth}`);
    assert.ok(portraitFsLayout.scrollHeight <= 844, `Portrait fullscreen vertical overflow: ${portraitFsLayout.scrollHeight}`);
    assert.ok(
      portraitFsLayout.hudRect.bottom <= portraitFsLayout.lRect.top + 1 &&
        portraitFsLayout.hudRect.bottom <= portraitFsLayout.rRect.top + 1,
      `Portrait fullscreen HUD overlaps L/R: ${JSON.stringify(portraitFsLayout)}`
    );
    assert.ok(
      portraitFsLayout.dpadRect.bottom <= portraitFsLayout.selectRect.top + 1 &&
        portraitFsLayout.bRect.bottom <= portraitFsLayout.startRect.top + 1,
      `Portrait fullscreen D-Pad/A/B overlaps SELECT/START: ${JSON.stringify(portraitFsLayout)}`
    );

    await client.eval(`document.getElementById('fs-exit-btn').click()`);
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getFullscreen().active === false`),
      5000,
      30
    );

    await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await client.send('Emulation.clearDeviceMetricsOverride');
    await waitFor(
      async () => await client.eval(`window.__retroIdle.getTouchControls().visible === false`),
      5000,
      40
    );

    // Synthetic Pokémon Emerald (BPEE) 128KB Flash, BoxPokemon decryption & Auto-Fight verification
    const docEmerald = await client.send('DOM.getDocument');
    const emeraldInputNode = await client.send('DOM.querySelector', {
      nodeId: docEmerald.root.nodeId,
      selector: '#rom-input',
    });
    await client.send('DOM.setFileInputFiles', {
      nodeId: emeraldInputNode.nodeId,
      files: [EMERALD_ROM_PATH],
    });
    await waitFor(
      async () =>
        await client.eval(
          `Boolean(window.__retroIdle?.getEmulator()?.isPlaying && window.__retroIdle.getEmulator().platform === 'gba' && window.__retroIdle?.getAutoFight()?.profile === 'pokemon-emerald')`
        ),
      12000,
      50
    );

    const emeraldUi = await client.eval(`({
      status: document.getElementById('status').textContent,
      sramSize: window.__retroIdle.getEmulator().sramSize,
      autoFightDisabled: document.getElementById('auto-fight-btn').disabled,
      healHidden: document.getElementById('heal-center-status').hidden,
      supported: window.__retroIdle.getAutoFight().supported,
      profile: window.__retroIdle.getAutoFight().profile,
    })`);
    assert.match(
      emeraldUi.status,
      /^Playing: POKEMON EMER \(GBA · BPEE\)$/,
      `Unexpected Emerald status: ${emeraldUi.status}`
    );
    assert.equal(emeraldUi.sramSize, 131072, 'Expected 128 KB (131072 B) Flash save for BPEE');
    assert.equal(emeraldUi.autoFightDisabled, false);
    assert.equal(emeraldUi.healHidden, false);
    assert.equal(emeraldUi.supported, true);
    assert.equal(emeraldUi.profile, 'pokemon-emerald');

    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const mod = emu.module;
        const w8 = (a, v) => mod._gba_write8(emu.e, a >>> 0, v & 0xff);
        const w16 = (a, v) => mod._gba_write16(emu.e, a >>> 0, v & 0xffff);
        const w32 = (a, v) => mod._gba_write32(emu.e, a >>> 0, v >>> 0);

        const SB1 = 0x02025a48;
        const LAYOUT_ADDR = 0x0203a000;
        w32(0x03005d8c, SB1);          // gSaveBlock1Ptr
        w32(0x02037318, LAYOUT_ADDR);  // gMapHeader -> mapLayoutPtr
        w32(LAYOUT_ADDR, 20);          // mapWidth
        w32(LAYOUT_ADDR + 4, 20);      // mapHeight
        w16(0x02037318 + 0x12, 61);    // Oldale Center mapLayoutId

        w32(0x030022c0 + 0x04, 0x08085e5c | 1); // gMain.callback2 = CB2_Overworld
        w8(0x030022c0 + 0x439, 0);              // not in battle
        w32(0x02022fec, 0);                     // gBattleTypeFlags = 0
        w8(0x0202433a, 0);                      // gBattleOutcome = 0

        w16(SB1 + 0x00, 7);  // pos.x
        w16(SB1 + 0x02, 8);  // pos.y
        w8(SB1 + 0x04, 2);   // mapGroup = Oldale
        w8(SB1 + 0x05, 2);   // mapNumber = Oldale Heal Center
        w16(SB1 + 0x32, 61);

        w8(0x02037590 + 0x05, 0); // gPlayerAvatar.objectEventId = 0
        w8(0x02037350 + 0x00, 1); // active
        w8(0x02037350 + 0x02, 1); // isPlayer
        w16(0x02037350 + 0x10, 7 + 7);
        w16(0x02037350 + 0x12, 8 + 7);
        w8(0x02037350 + 0x18, 2); // DIR_NORTH

        // Party count = 1, encrypted Treecko (species 277, move Pound = 1, PP = 35, HP 21/21)
        w8(0x020244e9, 1);
        const base = 0x020244ec;
        const personality = 23; // 23 % 24 = 23 -> [3, 2, 1, 0]: Growth slot 3, Attacks slot 2
        const otId = 0xdeadbeef >>> 0;
        const key = (personality ^ otId) >>> 0;
        w32(base, personality);
        w32(base + 0x04, otId);
        w8(base + 0x13, 0x02); // hasSpecies = 1

        const subs = [
          [0, 0, 0],
          [0, 0, 0],
          [1, 0, 35],  // slot 2 (Attacks): move1=1 (Pound), pp1=35
          [277, 0, 0], // slot 3 (Growth): species=277 (Treecko)
        ];
        for (let s = 0; s < 4; s++) {
          for (let w = 0; w < 3; w++) {
            w32(base + 0x20 + s * 12 + w * 4, (subs[s][w] ^ key) >>> 0);
          }
        }
        w8(base + 0x54, 5);   // level
        w16(base + 0x56, 21); // hp
        w16(base + 0x58, 21); // maxHp
      })()
    `);

    await waitFor(
      async () => await client.eval(`window.__retroIdle.getAutoFight().inPokeCenter === true`),
      6000,
      30
    );
    const emeraldCheck = await client.eval(`({
      profile: window.__retroIdle.getAutoFight().profile,
      pokeCenterName: window.__retroIdle.getAutoFight().pokeCenterName,
      healStatus: document.getElementById('heal-center-status').textContent,
      snapshot: window.__retroIdle.getAutoFight().snapshot(),
    })`);
    assert.equal(emeraldCheck.pokeCenterName, 'Oldale Heal Center');
    assert.match(emeraldCheck.healStatus, /Heal Center visited: Oldale Heal Center/);
    assert.equal(emeraldCheck.snapshot.mapGroup, 2);
    assert.equal(emeraldCheck.snapshot.mapNumber, 2);
    assert.equal(emeraldCheck.snapshot.x, 7);
    assert.equal(emeraldCheck.snapshot.y, 8);
    assert.equal(emeraldCheck.snapshot.tileset, 61);
    assert.equal(emeraldCheck.snapshot.partyCount, 1);
    assert.equal(emeraldCheck.snapshot.party[0].species, 277);
    assert.equal(emeraldCheck.snapshot.party[0].hp, 21);
    assert.equal(emeraldCheck.snapshot.party[0].moves[0], 1);
    assert.equal(emeraldCheck.snapshot.party[0].pp[0], 35);

    // Start Auto A while exiting Oldale Heal Center -> stays active & keeps passive Heal Center trail tracking
    await client.eval(`document.getElementById('auto-a-btn').click()`);
    assert.equal(await client.eval(`window.__retroIdle.getAutoA().active`), true);
    assert.equal(
      await client.eval(`document.getElementById('auto-fight-status').textContent`),
      'Auto A: active (move-learn & faint guard)'
    );
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const mod = emu.module;
        const w8 = (a, v) => mod._gba_write8(emu.e, a >>> 0, v & 0xff);
        const w16 = (a, v) => mod._gba_write16(emu.e, a >>> 0, v & 0xffff);
        const SB1 = 0x02025a48;
        w16(0x02037318 + 0x12, 11);
        w16(SB1 + 0x00, 6);
        w16(SB1 + 0x02, 16);
        w8(SB1 + 0x04, 0);
        w8(SB1 + 0x05, 10);
        w16(SB1 + 0x32, 11);
        w16(0x02037350 + 0x10, 6 + 7);
        w16(0x02037350 + 0x12, 16 + 7);
      })()
    `);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoFight().trailLength === 1 && window.__retroIdle.getAutoFight().hasHealPath === true`
        ),
      5000,
      30
    );

    // Inject BATTLE_TYPE_TRAINER (1 << 3) into EWRAM -> Auto A stays active in trainer battle,
    // then clicking Auto-Fight stops Auto A (mutual exclusion) and triggers automatic Auto-Fight stop
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        const mod = emu.module;
        const w8 = (a, v) => mod._gba_write8(emu.e, a >>> 0, v & 0xff);
        const w16 = (a, v) => mod._gba_write16(emu.e, a >>> 0, v & 0xffff);
        const w32 = (a, v) => mod._gba_write32(emu.e, a >>> 0, v >>> 0);
        w8(0x030022c0 + 0x439, 0x02); // inBattle = true
        w32(0x02022fec, 1 << 3);      // BATTLE_TYPE_TRAINER
        const bBase = 0x02024084;
        w16(bBase, 277);
        w16(bBase + 0x0c, 1);
        w8(bBase + 0x24, 35);
        w16(bBase + 0x28, 21);
        w8(bBase + 0x2a, 5);
        w16(bBase + 0x2c, 21);
      })()
    `);
    await sleep(120);
    assert.equal(await client.eval(`window.__retroIdle.getAutoA().active`), true, 'Auto A must stay active during trainer battle');

    await client.eval(`document.getElementById('auto-fight-btn').click()`);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoA().active === false && window.__retroIdle.getAutoFight().active === false && window.__retroIdle.getAutoFight().stopReason === 'trainer battle'`
        ),
      6000,
      30
    );
    const emeraldTrainerStop = await client.eval(`({
      statusText: document.getElementById('auto-fight-status').textContent,
      isError: document.getElementById('auto-fight-status').classList.contains('error'),
    })`);
    assert.equal(emeraldTrainerStop.statusText, 'Auto-Fight stopped: trainer battle');
    assert.equal(emeraldTrainerStop.isError, true);

    // Auto A stops on move-learning prompt during trainer battle and on fainting
    await client.eval(`document.getElementById('auto-a-btn').click()`);
    assert.equal(await client.eval(`window.__retroIdle.getAutoA().active`), true);
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        emu.module._gba_write32(emu.e, 0x02024214, 0x082dabe3 + 4);
      })()
    `);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoA().active === false && window.__retroIdle.getAutoA().stopReason === 'learning a move'`
        ),
      6000,
      30
    );
    const emeraldAutoALearnStop = await client.eval(`({
      statusText: document.getElementById('auto-fight-status').textContent,
      isError: document.getElementById('auto-fight-status').classList.contains('error'),
    })`);
    assert.equal(emeraldAutoALearnStop.statusText, 'Auto A stopped: learning a move');
    assert.equal(emeraldAutoALearnStop.isError, true);

    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        emu.module._gba_write32(emu.e, 0x02024214, 0);
      })()
    `);
    await client.eval(`document.getElementById('auto-a-btn').click()`);
    assert.equal(await client.eval(`window.__retroIdle.getAutoA().active`), true);
    await client.eval(`
      (() => {
        const emu = window.__retroIdle.getEmulator();
        emu.module._gba_write16(emu.e, 0x02024084 + 0x28, 0);
      })()
    `);
    await waitFor(
      async () =>
        await client.eval(
          `window.__retroIdle.getAutoA().active === false && window.__retroIdle.getAutoA().stopReason === 'fainted'`
        ),
      6000,
      30
    );
    const emeraldAutoAFaintStop = await client.eval(`({
      statusText: document.getElementById('auto-fight-status').textContent,
      isError: document.getElementById('auto-fight-status').classList.contains('error'),
    })`);
    assert.equal(emeraldAutoAFaintStop.statusText, 'Auto A stopped: fainted');
    assert.equal(emeraldAutoAFaintStop.isError, true);

    const prefsRefreshCheck = {
      reloadOn: {
        speed: prefsAfterReload1.speed,
        touchVisible: prefsAfterReload1.touchVisible,
        autoFightActive: prefsAfterReload1.autoFightActive,
        muted: prefsAfterReload1.muted,
      },
      reloadOff: {
        speed: prefsAfterReload2.speed,
        touchVisible: prefsAfterReload2.touchVisible,
        autoFightActive: prefsAfterReload2.autoFightActive,
        muted: prefsAfterReload2.muted,
      },
    };

    // Regression check: switching between differently-sized GB ROMs must not corrupt binjgb heap
    for (const [romFile, expectedTitle] of [
      [BIG_ROM_PATH, 'BIG TEST'],
      [ROM_PATH, 'MBC3 TEST'],
      [BIG_ROM_PATH, 'BIG TEST'],
      [ROM_PATH, 'MBC3 TEST'],
    ]) {
      const switchDoc = await client.send('DOM.getDocument');
      const switchInput = await client.send('DOM.querySelector', {
        nodeId: switchDoc.root.nodeId,
        selector: '#rom-input',
      });
      await client.send('DOM.setFileInputFiles', {
        nodeId: switchInput.nodeId,
        files: [romFile],
      });
      await waitFor(
        async () =>
          await client.eval(`(() => {
            const st = document.getElementById('status')?.textContent || '';
            const emu = window.__retroIdle?.getEmulator?.();
            return (
              !st.startsWith('Loading') &&
              st.includes(${JSON.stringify(expectedTitle)}) &&
              Boolean(emu?.isPlaying)
            );
          })()`),
        10000,
        50
      );
      await sleep(250);
      const switchState = await client.eval(`(() => {
        const emu = window.__retroIdle.getEmulator();
        return {
          sramSize: emu.sramSize,
          firstHeaderByte: emu.readMem(0x0134),
          wramBank2Byte: emu.readMem(0xc000),
        };
      })()`);
      assert.equal(switchState.sramSize, 32768, `${expectedTitle}: expected 32768-byte SRAM after ROM switch`);
      assert.equal(
        switchState.firstHeaderByte,
        expectedTitle.charCodeAt(0),
        `${expectedTitle}: ROM header byte 0x0134 corrupted after ROM switch`
      );
      assert.equal(switchState.wramBank2Byte, 0x5a, `${expectedTitle}: CPU failed to write 0x5A to 0xC000`);
    }

    // PWA checks: manifest, icons, Service Worker precache, install prompt UI, and offline playback (GB + GBA)
    await waitFor(
      async () =>
        await client.eval(`Boolean(window.__retroIdle?.getPwa?.().swRegistered && window.__retroIdle?.getPwa?.().swControlled)`),
      10000,
      100
    );

    const pwaMeta = await client.eval(`(async () => {
      await navigator.serviceWorker.ready;
      const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
      const appleTouchHref = document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href');
      const manifestRes = await fetch('./manifest.webmanifest');
      const manifest = await manifestRes.json();
      const iconUrls = [...new Set([
        ...manifest.icons.map((i) => i.src),
        './icons/apple-touch-icon.png',
      ])];
      const iconStatuses = [];
      for (const url of iconUrls) {
        const r = await fetch(url);
        const buf = await r.arrayBuffer();
        iconStatuses.push({ url, status: r.status, bytes: buf.byteLength });
      }
      const cacheNames = await caches.keys();
      const cache = await caches.open('retro-idle-v1');
      const cachedReqs = await cache.keys();
      const cachedPaths = cachedReqs.map((r) => new URL(r.url).pathname);
      return {
        pwa: window.__retroIdle.getPwa(),
        manifestHref,
        appleTouchHref,
        manifestStatus: manifestRes.status,
        manifest,
        iconStatuses,
        cacheNames,
        cachedPaths,
      };
    })()`);

    assert.equal(pwaMeta.manifestHref, './manifest.webmanifest', 'Expected relative manifest link');
    assert.equal(pwaMeta.appleTouchHref, './icons/apple-touch-icon.png', 'Expected relative apple-touch-icon link');
    assert.equal(pwaMeta.manifestStatus, 200, 'Manifest fetch should succeed with HTTP 200');
    assert.equal(pwaMeta.manifest.id, './', 'Manifest id should be ./');
    assert.equal(pwaMeta.manifest.start_url, './', 'Manifest start_url should be ./');
    assert.equal(pwaMeta.manifest.scope, './', 'Manifest scope should be ./');
    assert.equal(pwaMeta.manifest.display, 'standalone', 'Manifest display should be standalone');
    assert.ok(Array.isArray(pwaMeta.manifest.file_handlers) && pwaMeta.manifest.file_handlers.length > 0, 'Expected file_handlers in manifest');
    for (const icon of pwaMeta.manifest.icons) {
      assert.ok(icon.purpose === 'any' || icon.purpose === 'maskable', `Icon purpose should be separate any or maskable, got ${icon.purpose}`);
    }
    for (const ic of pwaMeta.iconStatuses) {
      assert.equal(ic.status, 200, `Icon ${ic.url} should return HTTP 200`);
      assert.ok(ic.bytes > 0, `Icon ${ic.url} should be non-empty`);
    }
    assert.ok(pwaMeta.cacheNames.includes('retro-idle-v1'), 'Expected retro-idle-v1 cache');
    for (const expectedPath of [
      '/',
      '/index.html',
      '/autofight.js',
      '/manifest.webmanifest',
      '/vendor/binjgb/binjgb.js',
      '/vendor/binjgb/binjgb.wasm',
      '/vendor/mgba/mgba.js',
      '/vendor/mgba/mgba.wasm',
      '/icons/icon.svg',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-192.png',
      '/icons/icon-maskable-512.png',
      '/icons/apple-touch-icon.png',
    ]) {
      assert.ok(
        pwaMeta.cachedPaths.includes(expectedPath),
        `Expected ${expectedPath} in retro-idle-v1 cache, got ${JSON.stringify(pwaMeta.cachedPaths)}`
      );
    }

    // Install prompt UI check
    const installCheck = await client.eval(`(async () => {
      const btn = document.getElementById('install-app-btn');
      const initialPwa = window.__retroIdle.getPwa();
      const initialConsistent = btn.hidden === (initialPwa.standalone || !initialPwa.canInstall);
      window.__mockPromptCalled = false;
      const ev = new Event('beforeinstallprompt', { cancelable: true });
      ev.prompt = () => {
        window.__mockPromptCalled = true;
        return Promise.resolve();
      };
      ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(ev);
      const canInstallAfterEvent = window.__retroIdle.getPwa().canInstall;
      const visibleAfterEvent = !btn.hidden;
      btn.click();
      await new Promise((r) => setTimeout(r, 30));
      return {
        initialConsistent,
        realPromptFired: initialPwa.canInstall,
        canInstallAfterEvent,
        visibleAfterEvent,
        promptCalled: window.__mockPromptCalled,
        hiddenAfterClick: btn.hidden,
        canInstallAfterClick: window.__retroIdle.getPwa().canInstall,
      };
    })()`);
    assert.equal(installCheck.initialConsistent, true, '#install-app-btn visibility should match canInstall state');
    assert.equal(installCheck.canInstallAfterEvent, true, 'canInstall should be true after beforeinstallprompt');
    assert.equal(installCheck.visibleAfterEvent, true, '#install-app-btn should be visible after beforeinstallprompt');
    assert.equal(installCheck.promptCalled, true, 'Clicking #install-app-btn should invoke deferred prompt()');
    assert.equal(installCheck.hiddenAfterClick, true, '#install-app-btn should hide after prompt');
    assert.equal(installCheck.canInstallAfterClick, false, 'canInstall should clear after prompt');

    // True offline playback check (GB auto-resume + GBA load from SW cache)
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    try {
      await client.eval(`window.__beforeReload = true`);
      await client.send('Page.reload', { ignoreCache: false });
      await waitFor(
        async () =>
          await client.eval(
            `window.__beforeReload === undefined && Boolean(window.__retroIdle?.getEmulator?.()?.isPlaying) && ${HAS_NON_BLANK_CANVAS_EXPR} && (document.getElementById('status')?.textContent || '').includes('MBC3 TEST')`
          ),
        12000,
        100
      );
      const offlineGbState = await client.eval(`({
        status: document.getElementById('status').textContent,
        swControlled: window.__retroIdle.getPwa().swControlled,
        onLine: navigator.onLine,
      })`);
      assert.equal(offlineGbState.swControlled, true, 'SW should control page during offline reload');

      const offlineDoc = await client.send('DOM.getDocument');
      const offlineInput = await client.send('DOM.querySelector', {
        nodeId: offlineDoc.root.nodeId,
        selector: '#rom-input',
      });
      await client.send('DOM.setFileInputFiles', {
        nodeId: offlineInput.nodeId,
        files: [GBA_ROM_PATH],
      });
      await waitFor(
        async () =>
          await client.eval(
            `Boolean(window.__retroIdle?.getEmulator?.()?.isPlaying) && ${HAS_NON_BLANK_CANVAS_EXPR} && (document.getElementById('status')?.textContent || '').includes('GBA TEST')`
          ),
        12000,
        100
      );
      const offlineGbaStatus = await client.eval(`document.getElementById('status').textContent`);
      var pwaCheck = {
        swRegistered: pwaMeta.pwa.swRegistered,
        swControlled: offlineGbState.swControlled,
        cachedCount: pwaMeta.cachedPaths.length,
        installPromptTested: installCheck.promptCalled,
        offlineGbStatus: offlineGbState.status,
        offlineGbaStatus,
      };
    } finally {
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }

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
      yellowCheck: {
        profile: yellowCheck.profile,
        pokeCenterName: yellowCheck.pokeCenterName,
        healStatus: yellowCheck.healStatus,
      },
      crystalCheck: {
        profile: crystalCheck.profile,
        pokeCenterName: crystalCheck.pokeCenterName,
        healStatus: crystalCheck.healStatus,
        bank2MapGroup: crystalCheck.bank2MapGroup,
        trainerStop: trainerStopUi.statusText,
      },
      gbaCheck: {
        status: gbaState.status,
        sramSize: gbaState.sramSize,
        frameBeforeSave: gbaFrameBeforeSave,
        frameAfterLoad: gbaFrameAfterLoad,
        speedRatio: Number((gbaTicks4x / gbaTicks1x).toFixed(2)),
        landscapeMaxBottom: Math.round(
          Math.max(
            gbaLandscapeLayout.screenBottom,
            gbaLandscapeLayout.dpadBottom,
            gbaLandscapeLayout.aBottom,
            gbaLandscapeLayout.startBottom,
            gbaLandscapeLayout.lBottom,
            gbaLandscapeLayout.rBottom
          )
        ),
      },
      emeraldCheck: {
        status: emeraldUi.status,
        sramSize: emeraldUi.sramSize,
        profile: emeraldCheck.profile,
        pokeCenterName: emeraldCheck.pokeCenterName,
        healStatus: emeraldCheck.healStatus,
        trainerStop: emeraldTrainerStop.statusText,
      },
      prefsRefreshCheck,
      mobileCheck: {
        portraitBottom: portraitLayout.gamepadBottom,
        landscapeMaxBottom: Math.round(
          Math.max(
            landscapeLayout.screenBottom,
            landscapeLayout.dpadBottom,
            landscapeLayout.aBottom,
            landscapeLayout.startBottom
          )
        ),
        mobileScreenshot: MOBILE_SCREENSHOT_PATH,
        landscapeScreenshot: MOBILE_LANDSCAPE_SCREENSHOT_PATH,
        landscapeFullscreenScreenshot: LANDSCAPE_FS_SCREENSHOT_PATH,
        gbaLandscapeFullscreenScreenshot: GBA_LANDSCAPE_FS_SCREENSHOT_PATH,
      },
      pwaCheck,
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
