import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const TMP_DIR = path.join(REPO_DIR, 'tests', '.tmp');
const CHROME_PROFILE = path.join(TMP_DIR, 'pwa-icon-chrome-profile');
const ICONS_DIR = path.join(REPO_DIR, 'icons');
const SVG_PATH = path.join(ICONS_DIR, 'icon.svg');

const CDP_PORT = 19225;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function buildIconHtml({ svgMarkup, size, background, scale }) {
  const bgStyle = background ? `background: ${background};` : 'background: transparent;';
  const innerPx = Math.round(size * scale);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: ${size}px;
      height: ${size}px;
      overflow: hidden;
      ${bgStyle}
      display: grid;
      place-items: center;
    }
    .icon-wrap {
      width: ${innerPx}px;
      height: ${innerPx}px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-wrap svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <div class="icon-wrap">${svgMarkup}</div>
</body>
</html>`;
}

const ICON_SPECS = [
  { filename: 'icon-192.png', size: 192, background: null, scale: 1, omitBackground: true },
  { filename: 'icon-512.png', size: 512, background: null, scale: 1, omitBackground: true },
  { filename: 'icon-maskable-192.png', size: 192, background: '#0b1120', scale: 0.72, omitBackground: false },
  { filename: 'icon-maskable-512.png', size: 512, background: '#0b1120', scale: 0.72, omitBackground: false },
  { filename: 'apple-touch-icon.png', size: 180, background: '#0b1120', scale: 0.82, omitBackground: false },
];

async function main() {
  const svgMarkup = fs.readFileSync(SVG_PATH, 'utf8');
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  fs.rmSync(CHROME_PROFILE, { recursive: true, force: true });
  fs.mkdirSync(CHROME_PROFILE, { recursive: true });

  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--mute-audio',
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${CHROME_PROFILE}`,
      '--window-size=512,512',
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

    const { frameTree } = await client.send('Page.getFrameTree');
    const results = [];

    for (const spec of ICON_SPECS) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: spec.size,
        height: spec.size,
        deviceScaleFactor: 1,
        mobile: false,
      });

      const html = buildIconHtml({
        svgMarkup,
        size: spec.size,
        background: spec.background,
        scale: spec.scale,
      });

      await client.send('Page.setDocumentContent', {
        frameId: frameTree.frame.id,
        html,
      });

      await waitFor(
        () => client.eval(`Boolean(document.querySelector('.icon-wrap svg'))`),
        5000,
        30
      );

      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        omitBackground: spec.omitBackground,
        clip: { x: 0, y: 0, width: spec.size, height: spec.size, scale: 1 },
      });

      const outPath = path.join(ICONS_DIR, spec.filename);
      const outBuf = Buffer.from(shot.data, 'base64');
      fs.writeFileSync(outPath, outBuf);

      const width = outBuf.readUInt32BE(16);
      const height = outBuf.readUInt32BE(20);
      assert.equal(width, spec.size, `${spec.filename}: expected width ${spec.size}, got ${width}`);
      assert.equal(height, spec.size, `${spec.filename}: expected height ${spec.size}, got ${height}`);

      results.push({ filename: spec.filename, dimensions: `${width}x${height}`, bytes: outBuf.length });
    }

    const errors = client.events.filter(
      (e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error') ||
        (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
    );
    assert.equal(errors.length, 0, `Unexpected Chrome errors: ${JSON.stringify(errors)}`);

    console.log('GENERATED PWA ICONS:', results);
  } finally {
    if (client) client.close();
    chrome.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
