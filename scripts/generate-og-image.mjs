import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const TMP_DIR = path.join(REPO_DIR, 'tests', '.tmp');
const CHROME_PROFILE = path.join(TMP_DIR, 'og-chrome-profile');
const EXTRACTED_FRAME_PATH = path.join(TMP_DIR, 'og-game-frame.png');
const DEMO_GIF_PATH = path.join(REPO_DIR, 'docs', 'autofight-demo.gif');
const OUTPUT_PNG = path.join(REPO_DIR, 'docs', 'og-image.png');

const CDP_PORT = 19224;
const DEMO_FRAME_INDEX = 55;
// Crop inward from the GIF's #screen bounds (37, 63, 474x426) to omit its rounded border corners.
const SCREEN_CROP = '468:420:40:66';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}:\n${stderr || stdout}`));
    });
  });
}

function buildOgHtml(frameDataUrl) {
  return String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>retro-idle — OG Image</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1120;
      --panel: #111827;
      --border: #1e293b;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --emerald: #34d399;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      width: 1200px;
      height: 630px;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }

    body {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 48px;
      padding: 56px 64px;
      background-image:
        radial-gradient(680px 520px at 84% 28%, rgba(56, 189, 248, 0.15), transparent 68%),
        radial-gradient(560px 460px at 14% 88%, rgba(52, 211, 153, 0.10), transparent 68%),
        linear-gradient(135deg, #0b1120 0%, #0f172a 100%);
    }

    .grid-bg {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(to right, rgba(148, 163, 184, 0.04) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(148, 163, 184, 0.04) 1px, transparent 1px);
      background-size: 32px 32px;
      mask-image: radial-gradient(ellipse at center, black 45%, transparent 92%);
      pointer-events: none;
    }

    .left {
      position: relative;
      z-index: 1;
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 22px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 7px 14px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid #1e293b;
      color: var(--accent);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }

    .eyebrow-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 10px rgba(52, 211, 153, 0.8);
    }

    h1 {
      margin: 0;
      font-size: 74px;
      font-weight: 800;
      line-height: 1.02;
      letter-spacing: -0.03em;
      color: #f8fafc;
    }

    .tagline {
      margin: 0;
      font-size: 28px;
      line-height: 1.35;
      font-weight: 500;
      color: #cbd5e1;
      max-width: 560px;
    }

    .tagline strong {
      color: #f8fafc;
      font-weight: 600;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;
    }

    .pill {
      padding: 9px 15px;
      border-radius: 10px;
      background: rgba(17, 24, 39, 0.9);
      border: 1px solid #263449;
      color: #e2e8f0;
      font-size: 16px;
      font-weight: 600;
    }

    .pill.accent {
      border-color: rgba(56, 189, 248, 0.45);
      background: rgba(12, 74, 110, 0.35);
      color: #bae6fd;
    }

    .footer-url {
      margin-top: 8px;
      font-size: 16px;
      font-weight: 500;
      color: var(--muted);
      letter-spacing: 0.01em;
    }

    .right {
      position: relative;
      z-index: 1;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .emu-card {
      width: 454px;
      background: var(--panel);
      border: 1px solid #263449;
      border-radius: 16px;
      padding: 18px 20px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      box-shadow:
        0 28px 60px rgba(2, 6, 23, 0.72),
        0 0 0 1px rgba(56, 189, 248, 0.08);
    }

    .emu-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
    }

    .emu-title {
      color: var(--text);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .emu-rom {
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .bezel {
      width: 414px;
      aspect-ratio: 160 / 144;
      border: 2px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: #0f172a;
    }

    .bezel img {
      width: 100%;
      height: 100%;
      display: block;
      image-rendering: pixelated;
    }

    .emu-bar {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .btn-group {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .ui-btn {
      padding: 5px 11px;
      border-radius: 7px;
      border: 1px solid var(--border);
      background: #1e293b;
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
    }

    .ui-btn.active {
      border-color: var(--accent);
      background: #0c4a6e;
      color: #f0f9ff;
    }

    .emu-status {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      text-align: center;
    }

    .status-auto {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent);
    }

    .status-heal {
      font-size: 13px;
      font-weight: 500;
      color: var(--emerald);
    }
  </style>
</head>
<body>
  <div class="grid-bg"></div>

  <section class="left">
    <div class="eyebrow">
      <span class="eyebrow-dot"></span>
      GB &bull; GBC &bull; GBA in your browser
    </div>
    <h1>retro-idle</h1>
    <p class="tagline">
      <strong>Play the fun parts, auto-grind the rest.</strong> Zero-build WebAssembly emulator with built-in idle automation.
    </p>
    <div class="pills">
      <span class="pill accent">Auto-Fight &amp; Heal</span>
      <span class="pill">1x&ndash;20x Speed</span>
      <span class="pill">Mini-Player &amp; Touch</span>
    </div>
    <div class="footer-url">kssilveira.github.io/retro-idle</div>
  </section>

  <section class="right">
    <div class="emu-card">
      <div class="emu-header">
        <span class="emu-title">retro-idle</span>
        <span class="emu-rom">MEADOW QUEST DEMO</span>
      </div>
      <div class="bezel">
        <img src="${frameDataUrl}" alt="Game Boy battle gameplay preview" />
      </div>
      <div class="emu-bar">
        <div class="btn-group">
          <span class="ui-btn active">Auto-Fight</span>
          <span class="ui-btn">Save State</span>
        </div>
        <div class="btn-group">
          <span class="ui-btn">1x</span>
          <span class="ui-btn active">4x</span>
          <span class="ui-btn">20x</span>
        </div>
      </div>
      <div class="emu-status">
        <div class="status-auto">Auto-Fight: fighting</div>
        <div class="status-heal">Heal Center linked (12 steps)</div>
      </div>
    </div>
  </section>
</body>
</html>`;
}

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

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
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
  fs.rmSync(CHROME_PROFILE, { recursive: true, force: true });
  fs.mkdirSync(CHROME_PROFILE, { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_PNG), { recursive: true });

  await runCmd('ffmpeg', [
    '-y',
    '-i',
    DEMO_GIF_PATH,
    '-vf',
    `select=eq(n\\,${DEMO_FRAME_INDEX}),crop=${SCREEN_CROP}`,
    '-frames:v',
    '1',
    EXTRACTED_FRAME_PATH,
  ]);

  const frameBytes = fs.readFileSync(EXTRACTED_FRAME_PATH);
  const frameDataUrl = `data:image/png;base64,${frameBytes.toString('base64')}`;
  const html = buildOgHtml(frameDataUrl);

  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--mute-audio',
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${CHROME_PROFILE}`,
      '--window-size=1200,630',
      'about:blank',
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
    await client.send('Log.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 630,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const { frameTree } = await client.send('Page.getFrameTree');
    await client.send('Page.setDocumentContent', {
      frameId: frameTree.frame.id,
      html,
    });

    await waitFor(
      () => client.eval(`(() => { const img = document.querySelector('img'); return Boolean(img && img.complete && img.naturalWidth > 0); })()`),
      5000,
      50
    );

    const shot = await client.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 },
    });
    const outBuf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync(OUTPUT_PNG, outBuf);

    // Read PNG IHDR width/height directly (bytes 16..24).
    const width = outBuf.readUInt32BE(16);
    const height = outBuf.readUInt32BE(20);
    assert.equal(width, 1200, `Expected width 1200, got ${width}`);
    assert.equal(height, 630, `Expected height 630, got ${height}`);

    const errors = client.events.filter(
      (e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error') ||
        (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
    );
    assert.equal(errors.length, 0, `Unexpected Chrome errors: ${JSON.stringify(errors)}`);

    console.log('GENERATED OG IMAGE:', {
      path: OUTPUT_PNG,
      bytes: outBuf.length,
      dimensions: `${width}x${height}`,
      demoFrame: DEMO_FRAME_INDEX,
    });
  } finally {
    if (client) client.close();
    chrome.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
