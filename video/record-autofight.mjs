import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GAMES = [
  {
    slug: '01-pokemon-red',
    exts: ['.gb'],
    matchTokens: ['red'],
    expectedHeader: 'POKEMON RED',
  },
  {
    slug: '02-pokemon-yellow',
    exts: ['.gbc', '.gb'],
    matchTokens: ['yellow'],
    expectedHeader: 'POKEMON YELLOW',
  },
  {
    slug: '03-pokemon-crystal',
    exts: ['.gbc'],
    matchTokens: ['crystal'],
    expectedHeader: 'PM_CRYSTAL',
  },
  {
    slug: '04-pokemon-emerald',
    exts: ['.gba'],
    matchTokens: ['emerald'],
    expectedHeader: 'POKEMON EMER',
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseArgs(argv) {
  const opts = {
    romsDir: path.join(os.homedir(), 'Downloads', 'roms'),
    outDir: path.join(os.homedir(), 'Downloads', 'retro-idle-recordings'),
    cdpPort: '9222',
    url: 'http://127.0.0.1:8000',
    slugs: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node video/record-autofight.mjs [options] [game-slug...]

Options:
  --roms-dir <dir>   Directory containing local .gb/.gbc/.gba ROMs (default: ~/Downloads/roms)
  --out-dir <dir>    Output directory outside the repo (default: ~/Downloads/retro-idle-recordings)
  --cdp-port <port>  Chrome DevTools remote debugging port (default: 9222)
  --url <url>        Running retro-idle tab URL prefix (default: http://127.0.0.1:8000)

Game slugs (default: all 4):
  01-pokemon-red, 02-pokemon-yellow, 03-pokemon-crystal, 04-pokemon-emerald`);
      process.exit(0);
    } else if (arg === '--roms-dir' && argv[i + 1]) {
      opts.romsDir = path.resolve(argv[++i]);
    } else if (arg === '--out-dir' && argv[i + 1]) {
      opts.outDir = path.resolve(argv[++i]);
    } else if (arg === '--cdp-port' && argv[i + 1]) {
      opts.cdpPort = argv[++i];
    } else if (arg === '--url' && argv[i + 1]) {
      opts.url = argv[++i].replace(/\/+$/, '');
    } else if (!arg.startsWith('-')) {
      opts.slugs.push(arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

function findRomInDir(romsDir, game) {
  if (!fs.existsSync(romsDir)) {
    throw new Error(`ROMs directory does not exist: ${romsDir}`);
  }
  const entries = fs.readdirSync(romsDir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => {
      const lower = name.toLowerCase();
      const ext = path.extname(lower);
      return game.exts.includes(ext) && game.matchTokens.every((tok) => lower.includes(tok));
    })
    .sort();

  if (matches.length === 0) {
    throw new Error(
      `No matching ROM found for ${game.slug} (${game.exts.join('/')}) in ${romsDir}`
    );
  }
  return path.join(romsDir, matches[0]);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onErr = (err) => {
        cleanup();
        reject(err?.error || err || new Error('WebSocket connection failed'));
      };
      const cleanup = () => {
        this.ws.removeEventListener('open', onOpen);
        this.ws.removeEventListener('error', onErr);
      };
      this.ws.addEventListener('open', onOpen);
      this.ws.addEventListener('error', onErr);
    });

    this.ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (typeof msg.id === 'number') {
        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          if (msg.error) {
            entry.reject(new Error(`${msg.error.message || 'CDP error'} (${msg.error.code ?? ''})`));
          } else {
            entry.resolve(msg.result);
          }
        }
      } else if (msg.method) {
        const set = this.listeners.get(msg.method);
        if (set) {
          for (const fn of set) {
            try {
              fn(msg.params || {});
            } catch (err) {
              console.error(`Listener error for ${msg.method}:`, err);
            }
          }
        }
      }
    });

    this.ws.addEventListener('close', () => {
      for (const [, entry] of this.pending) {
        entry.reject(new Error('CDP WebSocket closed'));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`WebSocket not open for ${method}`));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'Runtime.evaluate exception';
      throw new Error(desc);
    }
    return res.result?.value;
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

async function waitForCondition(fn, { timeoutMs, intervalMs = 100, label = 'condition' }) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const val = await fn();
      if (val) return val;
    } catch (err) {
      lastErr = err;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms${lastErr ? `: ${lastErr.message}` : ''}`);
}

async function installRafShim(client) {
  await client.eval(`(() => {
    if (!window.__origRAF) {
      window.__origRAF = window.requestAnimationFrame.bind(window);
    }
    if (!window.__origCAF) {
      window.__origCAF = window.cancelAnimationFrame.bind(window);
    }
    const timers = new Map();
    let nextId = 1;
    window.__shimRaftimers = timers;
    window.requestAnimationFrame = (cb) => {
      const id = nextId++;
      const tid = setTimeout(() => {
        timers.delete(id);
        cb(performance.now());
      }, 16);
      timers.set(id, tid);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      const tid = timers.get(id);
      if (tid !== undefined) {
        clearTimeout(tid);
        timers.delete(id);
      }
    };
    const emu = window.__retroIdle?.getEmulator?.();
    if (emu?.isPlaying) {
      emu.pause();
      emu.resume();
    }
  })()`);
}

async function restoreRafShim(client) {
  await client.eval(`(() => {
    if (window.__shimRaftimers) {
      for (const tid of window.__shimRaftimers.values()) {
        clearTimeout(tid);
      }
      delete window.__shimRaftimers;
    }
    if (window.__origRAF) {
      window.requestAnimationFrame = window.__origRAF;
      delete window.__origRAF;
    }
    if (window.__origCAF) {
      window.cancelAnimationFrame = window.__origCAF;
      delete window.__origCAF;
    }
    const emu = window.__retroIdle?.getEmulator?.();
    if (emu?.isPlaying) {
      emu.pause();
      emu.resume();
    }
  })()`);
}

async function recordGame(client, game, { romPath, outDir, tmpRoot }) {
  const { slug, expectedHeader } = game;

  console.log(`\n=== [${slug}] Opening ROM: ${path.basename(romPath)} ===`);
  const doc = await client.send('DOM.getDocument', { depth: -1 });
  const inputNode = await client.send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: '#rom-input',
  });
  if (!inputNode?.nodeId) {
    throw new Error('Could not find #rom-input element');
  }
  await client.send('DOM.setFileInputFiles', {
    nodeId: inputNode.nodeId,
    files: [romPath],
  });

  await waitForCondition(
    () =>
      client.eval(`(() => {
        const status = document.getElementById('status')?.textContent || '';
        const loadBtn = document.getElementById('load-state-btn');
        const af = window.__retroIdle?.getAutoFight?.();
        return (
          !status.startsWith('Loading') &&
          status.includes(${JSON.stringify(expectedHeader)}) &&
          Boolean(loadBtn && !loadBtn.disabled) &&
          Boolean(af && af.supported === true)
        );
      })()`),
    { timeoutMs: 25_000, intervalMs: 100, label: `${slug} ROM load` }
  );

  const sramSize = await client.eval(`window.__retroIdle?.getEmulator?.()?.sramSize ?? 0`);
  if (!(sramSize > 0)) {
    throw new Error(`${slug}: Expected emulator sramSize > 0 after ROM load, got ${sramSize}`);
  }

  console.log(`[${slug}] ROM loaded; clicking Load State...`);
  await client.eval(`document.getElementById('load-state-btn').click()`);

  await waitForCondition(
    () =>
      client.eval(`(() => {
        const status = document.getElementById('status')?.textContent || '';
        const afBtn = document.getElementById('auto-fight-btn');
        return status.includes('state loaded') && Boolean(afBtn && !afBtn.disabled);
      })()`),
    { timeoutMs: 10_000, intervalMs: 100, label: `${slug} state load` }
  );

  await sleep(400);
  const preInfo = await client.eval(`(() => {
    const af = window.__retroIdle?.getAutoFight?.() || {};
    return {
      pokeCenterName: af.pokeCenterName ?? null,
      hasHealPath: af.hasHealPath ?? false,
      trailLength: af.trailLength ?? 0,
      hcStatus: document.getElementById('heal-center-status')?.textContent || '',
      visibilityState: document.visibilityState,
    };
  })()`);
  console.log(`[${slug}] Pre-fight state:`, JSON.stringify(preInfo));

  if (preInfo.visibilityState !== 'visible') {
    throw new Error(`Tab visibilityState is ${preInfo.visibilityState}, expected visible`);
  }

  const frameDir = path.join(tmpRoot, slug);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });

  const frames = [];
  let frameCounter = 0;
  let capturing = true;
  let lastFrameBuf = null;
  let captureErr = null;

  async function runCaptureLoop() {
    while (capturing) {
      const ts = performance.now() / 1000;
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
      });
      if (!capturing) break;
      const buf = Buffer.from(shot.data, 'base64');
      const file = path.join(frameDir, `frame-${String(frameCounter++).padStart(6, '0')}.png`);
      fs.writeFileSync(file, buf);
      frames.push({ file, ts });
      lastFrameBuf = buf;
    }
  }

  const captureLoopPromise = runCaptureLoop().catch((err) => {
    captureErr = err;
  });

  try {
    console.log(`[${slug}] Recording started via Page.captureScreenshot...`);
    await sleep(600);
    if (captureErr) throw captureErr;

    await client.eval(`document.getElementById('auto-fight-btn').click()`);
    await waitForCondition(
      () => client.eval(`Boolean(window.__retroIdle?.getAutoFight?.()?.active)`),
      { timeoutMs: 3000, intervalMs: 50, label: `${slug} Auto-Fight activation` }
    );

    const ticksBefore = await client.eval(`window.__retroIdle?.getEmulator?.()?.getTicks?.() ?? 0`);
    const framesBefore = frames.length;
    const bufBefore = lastFrameBuf;
    const livenessDeadline = Date.now() + 4000;
    let ticksAfter = ticksBefore;
    let frameDelta = 0;
    let visuallyChanged = false;

    while (Date.now() < livenessDeadline) {
      if (captureErr) throw captureErr;
      ticksAfter = await client.eval(`window.__retroIdle?.getEmulator?.()?.getTicks?.() ?? 0`);
      frameDelta = frames.length - framesBefore;
      visuallyChanged = Boolean(lastFrameBuf && bufBefore && !lastFrameBuf.equals(bufBefore));
      if (ticksAfter > ticksBefore && frameDelta >= 5 && visuallyChanged) {
        break;
      }
      await sleep(150);
    }

    if (captureErr) throw captureErr;
    if (!(ticksAfter > ticksBefore)) {
      throw new Error(`${slug}: Emulator ticks did not advance (${ticksBefore} -> ${ticksAfter})`);
    }
    if (frameDelta < 5) {
      throw new Error(`${slug}: Screenshot loop stalled (delta=${frameDelta} < 5 in 4s)`);
    }
    if (!visuallyChanged) {
      throw new Error(`${slug}: Captured screenshots did not visually change within 4s`);
    }
    console.log(`[${slug}] Liveness verified: ticks +${ticksAfter - ticksBefore}, frames +${frameDelta}`);

    const startMs = Date.now();
    const timeoutMs = 480_000;
    let seenHealing = false;
    let seenWalkingBack = false;
    const phasesSeen = [];
    let lastPhaseKey = '';
    let lastProgressLogMs = startMs;
    let earlyStop = null;
    let completedLoop = false;
    let learnMoveResumes = 0;

    while (Date.now() - startMs < timeoutMs) {
      if (captureErr) throw captureErr;
      const st = await client.eval(`(() => {
        const af = window.__retroIdle?.getAutoFight?.();
        if (!af) return null;
        return {
          active: af.active,
          phase: af.phase,
          healSubphase: af.healSubphase,
          stopReason: af.stopReason,
          snapshot: af.active ? null : af.snapshot?.(),
        };
      })()`);

      if (!st) {
        throw new Error(`${slug}: getAutoFight() returned null`);
      }

      const now = Date.now();
      const phaseKey = `${st.phase}:${st.healSubphase ?? ''}`;
      if (phaseKey !== lastPhaseKey) {
        lastPhaseKey = phaseKey;
        if (!phasesSeen.includes(st.phase)) {
          phasesSeen.push(st.phase);
        }
        const elapsed = ((now - startMs) / 1000).toFixed(1);
        console.log(
          `[${slug} +${elapsed}s] phase=${st.phase}${st.healSubphase ? ` (${st.healSubphase})` : ''} frames=${frames.length}`
        );
        lastProgressLogMs = now;
      } else if (now - lastProgressLogMs >= 5000) {
        const elapsed = ((now - startMs) / 1000).toFixed(1);
        console.log(
          `[${slug} +${elapsed}s] still phase=${st.phase}${st.healSubphase ? ` (${st.healSubphase})` : ''} frames=${frames.length}`
        );
        lastProgressLogMs = now;
      }

      if (st.phase === 'healing') seenHealing = true;
      if (st.phase === 'walking_back') seenWalkingBack = true;

      if (seenHealing && (st.phase === 'moving' || st.phase === 'fighting')) {
        completedLoop = true;
        break;
      }

      if (!st.active) {
        if (st.stopReason === 'learning a move' && learnMoveResumes < 3) {
          learnMoveResumes += 1;
          console.log(
            `[${slug}] Milestone stop: learning a move — pausing 1200ms then resuming (${learnMoveResumes}/3)...`
          );
          await sleep(1200);
          const learnRe = /\blearn|trying to|Delete an?|forgotten/;
          let cleared = false;
          for (let pulseIdx = 0; pulseIdx < 25; pulseIdx++) {
            await client.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }))`);
            await sleep(100);
            await client.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }))`);
            await sleep(180);
            const menuText = await client.eval(
              `window.__retroIdle?.getAutoFight?.()?.snapshot?.()?.menuBoxText || ''`
            );
            if (!learnRe.test(menuText)) {
              cleared = true;
              break;
            }
          }
          if (!cleared) {
            throw new Error(`${slug}: failed to clear move-learned dialogue after 25 KeyX pulses`);
          }
          await client.eval(`document.getElementById('auto-fight-btn').click()`);
          await waitForCondition(
            () => client.eval(`Boolean(window.__retroIdle?.getAutoFight?.()?.active)`),
            { timeoutMs: 3000, intervalMs: 50, label: `${slug} Auto-Fight resume after learning a move` }
          );
          continue;
        }
        earlyStop = {
          stopReason: st.stopReason,
          phase: st.phase,
          healSubphase: st.healSubphase,
          snapshot: st.snapshot,
        };
        console.warn(`[${slug}] Auto-Fight stopped early:`, JSON.stringify(earlyStop));
        await sleep(500);
        break;
      }

      await sleep(120);
    }

    if (completedLoop) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      console.log(`[${slug} +${elapsed}s] Heal loop completed; capturing grass resumption for 1800ms...`);
      await sleep(1800);
      await client.eval(`(() => {
        const af = window.__retroIdle?.getAutoFight?.();
        if (af?.active) document.getElementById('auto-fight-btn').click();
      })()`);
      await sleep(500);
    } else if (!earlyStop) {
      earlyStop = {
        stopReason: 'timeout_480s',
        phase: lastPhaseKey,
        healSubphase: null,
        snapshot: null,
      };
      await client.eval(`(() => {
        const af = window.__retroIdle?.getAutoFight?.();
        if (af?.active) document.getElementById('auto-fight-btn').click();
      })()`);
      await sleep(500);
    }

    capturing = false;
    await captureLoopPromise;
    if (captureErr) throw captureErr;

    const elapsedSec = Number(((Date.now() - startMs) / 1000).toFixed(2));
    console.log(`[${slug}] Capture stopped; captured ${frames.length} frames.`);

    if (frames.length < 10) {
      throw new Error(`${slug}: too few frames captured (${frames.length})`);
    }

    const concatPath = path.join(frameDir, 'frames.txt');
    const lines = [];
    for (let i = 0; i < frames.length - 1; i++) {
      const dur = Math.max(0.01, Math.min(1.0, frames[i + 1].ts - frames[i].ts));
      const escaped = frames[i].file.replace(/'/g, "'\\''");
      lines.push(`file '${escaped}'`);
      lines.push(`duration ${dur.toFixed(4)}`);
    }
    const lastEscaped = frames[frames.length - 1].file.replace(/'/g, "'\\''");
    lines.push(`file '${lastEscaped}'`);
    lines.push('duration 0.2500');
    lines.push(`file '${lastEscaped}'`);
    fs.writeFileSync(concatPath, lines.join('\n') + '\n');

    const outMp4 = path.join(outDir, `${slug}.mp4`);
    const ff = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        concatPath,
        '-vf',
        'pad=ceil(iw/2)*2:ceil(ih/2)*2:color=0x0b1120',
        '-fps_mode',
        'cfr',
        '-r',
        '60',
        '-c:v',
        'libx264',
        '-crf',
        '16',
        '-preset',
        'medium',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outMp4,
      ],
      { encoding: 'utf8' }
    );

    if (ff.status !== 0) {
      throw new Error(`${slug}: ffmpeg failed (exit ${ff.status}):\n${ff.stderr}`);
    }

    fs.rmSync(frameDir, { recursive: true, force: true });

    const summary = {
      slug,
      outMp4,
      frames: frames.length,
      elapsedSec,
      seenHealing,
      seenWalkingBack,
      phasesSeen,
      learnMoveResumes,
      completedLoop,
      earlyStop,
    };
    console.log(`[${slug}] SUMMARY:`, JSON.stringify(summary));
    return summary;
  } finally {
    capturing = false;
    await captureLoopPromise.catch(() => {});
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const selectedGames = opts.slugs.length
    ? GAMES.filter((g) => opts.slugs.includes(g.slug))
    : GAMES;
  if (selectedGames.length === 0) {
    throw new Error(`No matching games for args: ${opts.slugs.join(', ')}`);
  }

  const resolvedGames = selectedGames.map((game) => ({
    ...game,
    romPath: findRomInDir(opts.romsDir, game),
  }));

  const tmpRoot = path.join(opts.outDir, '.tmp-frames');
  fs.mkdirSync(opts.outDir, { recursive: true });
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  const cdpHttp = `http://127.0.0.1:${opts.cdpPort}/json/list`;
  const pages = await (await fetch(cdpHttp)).json();
  const page = pages.find((p) => p.type === 'page' && p.url.startsWith(opts.url));
  if (!page?.webSocketDebuggerUrl) {
    throw new Error(`Could not find retro-idle tab at ${opts.url} on CDP port ${opts.cdpPort}`);
  }

  const client = new CDPClient(page.webSocketDebuggerUrl);
  await client.connect();
  try {
    await client.send('Page.enable');
    await client.send('DOM.enable');
    await client.send('Runtime.enable');
    await client.send('Page.bringToFront');
    await client.eval(`window.__beforeReload = true`);
    await client.send('Page.reload', { ignoreCache: true });
    await waitForCondition(
      () =>
        client.eval(`(() => {
          if (window.__beforeReload) return false;
          const st = document.getElementById('status')?.textContent || '';
          return Boolean(
            window.__retroIdle &&
            document.getElementById('rom-input') &&
            window.__retroIdle.getEmulator?.() &&
            !st.startsWith('Loading')
          );
        })()`),
      { timeoutMs: 25_000, intervalMs: 100, label: 'page reload' }
    );

    const vis = await client.eval('document.visibilityState');
    if (vis !== 'visible') {
      throw new Error(`Expected tab visibilityState === "visible", got "${vis}"`);
    }

    await installRafShim(client);
    console.log('Installed temporary 60 Hz requestAnimationFrame shim.');

    const summaries = [];
    for (const game of resolvedGames) {
      const summary = await recordGame(client, game, {
        romPath: game.romPath,
        outDir: opts.outDir,
        tmpRoot,
      });
      summaries.push(summary);
    }

    fs.rmSync(tmpRoot, { recursive: true, force: true });
    console.log('\n=== ALL RECORDINGS COMPLETE ===');
    console.log(JSON.stringify(summaries, null, 2));

    const incomplete = summaries.filter((s) => !s.completedLoop);
    if (incomplete.length > 0) {
      process.exitCode = 2;
    }
  } finally {
    await restoreRafShim(client).catch(() => {});
    client.close();
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
