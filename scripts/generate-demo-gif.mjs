import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const TMP_DIR = path.join(REPO_DIR, 'tests', '.tmp');
const FRAMES_DIR = path.join(TMP_DIR, 'demo-frames');
const CHROME_PROFILE = path.join(TMP_DIR, 'demo-chrome-profile');
const PALETTE_PATH = path.join(TMP_DIR, 'demo-palette.png');
const OUTPUT_GIF = path.join(REPO_DIR, 'docs', 'autofight-demo.gif');

const CDP_PORT = 19223;
const FPS = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEMO_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>retro-idle — Auto-Fight Demo</title>
  <link rel="icon" href="data:," />
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1120;
      --panel: #111827;
      --border: #1e293b;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #38bdf8;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 14px;
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      overflow: hidden;
    }

    main {
      width: min(520px, 100%);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    h1 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    #screen {
      width: min(480px, 100%);
      aspect-ratio: 160 / 144;
      height: auto;
      background: #0f172a;
      border: 2px solid var(--border);
      border-radius: 6px;
      image-rendering: pixelated;
      display: block;
    }

    .controls {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      align-items: center;
    }

    .file-label,
    button {
      font: inherit;
      font-size: 0.82rem;
      padding: 6px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #1e293b;
      color: var(--text);
    }

    #auto-fight-btn {
      min-width: 126px;
    }

    button.active {
      border-color: var(--accent);
      background: #0c4a6e;
    }

    .speed-controls {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      align-items: center;
    }

    .speed-label {
      font-size: 0.85rem;
      color: var(--muted);
      margin-right: 2px;
    }

    .speed-btn {
      font-size: 0.825rem;
      padding: 5px 10px;
      min-width: 44px;
    }

    #status {
      width: 100%;
      text-align: center;
      font-size: 0.875rem;
      color: var(--muted);
      min-height: 1.25em;
    }

    #auto-fight-status {
      width: 100%;
      text-align: center;
      font-size: 0.825rem;
      color: var(--accent);
      min-height: 1.2em;
    }

    #heal-center-status {
      width: 100%;
      text-align: center;
      font-size: 0.8rem;
      color: var(--muted);
      min-height: 1.15em;
    }

    #heal-center-status.linked {
      color: #34d399;
    }

    .legend {
      margin: 0;
      font-size: 0.8rem;
      color: var(--muted);
      text-align: center;
      line-height: 1.5;
    }

    kbd {
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 0.75rem;
      color: var(--text);
    }
  </style>
</head>
<body>
  <main id="app-card">
    <h1>retro-idle</h1>
    <canvas id="screen" width="160" height="144"></canvas>

    <div class="controls">
      <span class="file-label">Load ROM (.gb / .gbc)</span>
      <button type="button" id="toggle-play">Pause</button>
      <button type="button" id="reset-btn">Reset</button>
      <button type="button" id="save-state-btn">Save State</button>
      <button type="button" id="load-state-btn">Load State</button>
      <button type="button" id="export-sav-btn">Export .sav</button>
      <button type="button" id="import-sav-btn">Import .sav</button>
      <button type="button" id="auto-fight-btn">Auto-Fight</button>
    </div>

    <div class="speed-controls" id="speed-controls">
      <span class="speed-label">Speed</span>
      <button type="button" class="speed-btn active" data-speed="1">1x</button>
      <button type="button" class="speed-btn" data-speed="2">2x</button>
      <button type="button" class="speed-btn" data-speed="4">4x</button>
      <button type="button" class="speed-btn" data-speed="10">10x</button>
      <button type="button" class="speed-btn" data-speed="20">20x</button>
    </div>

    <div id="status">Playing: MEADOW QUEST (ORIGINAL DEMO)</div>
    <div id="auto-fight-status">&nbsp;</div>
    <div id="heal-center-status">&nbsp;</div>

    <p class="legend">
      D-Pad: <kbd>Arrows</kbd> or <kbd>WASD</kbd> &middot;
      A: <kbd>X</kbd> &middot;
      B: <kbd>Z</kbd> &middot;
      Start: <kbd>Enter</kbd> &middot;
      Select: <kbd>Shift</kbd> &middot;
      Speed: <kbd>1</kbd>&ndash;<kbd>5</kbd> &middot;
      Gamepad supported
    </p>
  </main>

  <script type="module">
    import { createAutoFight, NEUTRAL_BUTTONS } from './autofight.js';

    const canvas = document.getElementById('screen');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const autoFightBtn = document.getElementById('auto-fight-btn');
    const autoFightStatusEl = document.getElementById('auto-fight-status');
    const healCenterStatusEl = document.getElementById('heal-center-status');
    const speedBtns = Array.from(document.querySelectorAll('.speed-btn'));

    // Original 4-shade classic green LCD palette
    const C0 = '#e0f8d0';
    const C1 = '#88c070';
    const C2 = '#346856';
    const C3 = '#081820';
    const PAL = { '.': null, '0': C0, '1': C1, '2': C2, '3': C3 };

    // 4x5 bitmap pixel font (uppercase + digits + symbols + heart + cursor)
    const FONT = {
      ' ': [0, 0, 0, 0, 0],
      A: [0b0110, 0b1001, 0b1111, 0b1001, 0b1001],
      B: [0b1110, 0b1001, 0b1110, 0b1001, 0b1110],
      C: [0b0111, 0b1000, 0b1000, 0b1000, 0b0111],
      D: [0b1110, 0b1001, 0b1001, 0b1001, 0b1110],
      E: [0b1111, 0b1000, 0b1110, 0b1000, 0b1111],
      F: [0b1111, 0b1000, 0b1110, 0b1000, 0b1000],
      G: [0b0111, 0b1000, 0b1011, 0b1001, 0b0111],
      H: [0b1001, 0b1001, 0b1111, 0b1001, 0b1001],
      I: [0b1110, 0b0100, 0b0100, 0b0100, 0b1110],
      J: [0b0011, 0b0001, 0b0001, 0b1001, 0b0110],
      K: [0b1001, 0b1010, 0b1100, 0b1010, 0b1001],
      L: [0b1000, 0b1000, 0b1000, 0b1000, 0b1111],
      M: [0b1001, 0b1111, 0b1111, 0b1001, 0b1001],
      N: [0b1001, 0b1101, 0b1011, 0b1001, 0b1001],
      O: [0b0110, 0b1001, 0b1001, 0b1001, 0b0110],
      P: [0b1110, 0b1001, 0b1110, 0b1000, 0b1000],
      Q: [0b0110, 0b1001, 0b1001, 0b1011, 0b0111],
      R: [0b1110, 0b1001, 0b1110, 0b1010, 0b1001],
      S: [0b0111, 0b1000, 0b0110, 0b0001, 0b1110],
      T: [0b1111, 0b0100, 0b0100, 0b0100, 0b0100],
      U: [0b1001, 0b1001, 0b1001, 0b1001, 0b0110],
      V: [0b1001, 0b1001, 0b1001, 0b0110, 0b0110],
      W: [0b1001, 0b1001, 0b1111, 0b1111, 0b1001],
      X: [0b1001, 0b1001, 0b0110, 0b1001, 0b1001],
      Y: [0b1001, 0b1001, 0b0110, 0b0100, 0b0100],
      Z: [0b1111, 0b0010, 0b0100, 0b1000, 0b1111],
      '0': [0b0110, 0b1011, 0b1101, 0b1001, 0b0110],
      '1': [0b0100, 0b1100, 0b0100, 0b0100, 0b1110],
      '2': [0b1110, 0b0001, 0b0110, 0b1000, 0b1111],
      '3': [0b1110, 0b0001, 0b0110, 0b0001, 0b1110],
      '4': [0b1001, 0b1001, 0b1111, 0b0001, 0b0001],
      '5': [0b1111, 0b1000, 0b1110, 0b0001, 0b1110],
      '6': [0b0111, 0b1000, 0b1110, 0b1001, 0b0110],
      '7': [0b1111, 0b0001, 0b0010, 0b0100, 0b0100],
      '8': [0b0110, 0b1001, 0b0110, 0b1001, 0b0110],
      '9': [0b0110, 0b1001, 0b0111, 0b0001, 0b1110],
      ':': [0b0000, 0b0100, 0b0000, 0b0100, 0b0000],
      '/': [0b0001, 0b0010, 0b0100, 0b1000, 0b0000],
      '-': [0b0000, 0b0000, 0b1111, 0b0000, 0b0000],
      '+': [0b0000, 0b0100, 0b1110, 0b0100, 0b0000],
      '!': [0b0100, 0b0100, 0b0100, 0b0000, 0b0100],
      '.': [0b0000, 0b0000, 0b0000, 0b0000, 0b0100],
      '&': [0b0100, 0b1010, 0b0100, 0b1010, 0b0101],
      '?': [0b1110, 0b0001, 0b0110, 0b0000, 0b0100],
      '>': [0b1000, 0b1100, 0b1110, 0b1100, 0b1000], // crisp arrow cursor
      '*': [0b1010, 0b1110, 0b1110, 0b0100, 0b0000], // pixel heart
    };

    function drawText(text, x, y, color = C3) {
      ctx.fillStyle = color;
      const str = String(text).toUpperCase();
      for (let i = 0; i < str.length; i++) {
        const glyph = FONT[str[i]] || FONT[' '];
        const gx = x + i * 5;
        for (let r = 0; r < 5; r++) {
          const bits = glyph[r];
          for (let c = 0; c < 4; c++) {
            if (bits & (1 << (3 - c))) {
              ctx.fillRect(gx + c, y + r, 1, 1);
            }
          }
        }
      }
    }

    function drawSprite(grid, x, y, scale = 1, flash = false) {
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        for (let c = 0; c < row.length; c++) {
          const ch = row[c];
          if (ch === '.') continue;
          ctx.fillStyle = flash ? C0 : PAL[ch];
          ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
        }
      }
    }

    function drawHeart(x, y, scale = 1, fill = C3) {
      const heart = [
        '.33.33.',
        '3003003',
        '3000003',
        '.30003.',
        '..303..',
        '...3...',
      ];
      for (let r = 0; r < heart.length; r++) {
        for (let c = 0; c < heart[r].length; c++) {
          const ch = heart[r][c];
          if (ch === '.') continue;
          ctx.fillStyle = ch === '3' ? C3 : fill;
          ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
        }
      }
    }

    function drawBox(x, y, w, h, fill = C0) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = C3;
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + h - 1, w, 1);
      ctx.fillRect(x, y, 1, h);
      ctx.fillRect(x + w - 1, y, 1, h);
      ctx.fillStyle = C2;
      ctx.fillRect(x + 2, y + 2, w - 4, 1);
      ctx.fillRect(x + 2, y + h - 3, w - 4, 1);
      ctx.fillRect(x + 2, y + 2, 1, h - 4);
      ctx.fillRect(x + w - 3, y + 2, 1, h - 4);
    }

    // Original 16x16 hooded ranger sprites
    const HERO_DOWN = [
      '.....333333.....',
      '....32222223....',
      '...3222222223...',
      '...3233333323...',
      '...3300330033...',
      '...3000000003...',
      '....33000033....',
      '...3221111223...',
      '..322113311223..',
      '..302111111203..',
      '..33.311113.33..',
      '.....322223.....',
      '.....32..23.....',
      '....333..333....',
      '....33....33....',
      '................',
    ];
    const HERO_DOWN_WALK = [
      '.....333333.....',
      '....32222223....',
      '...3222222223...',
      '...3233333323...',
      '...3300330033...',
      '...3000000003...',
      '....33000033....',
      '...3221111223...',
      '..322113311223..',
      '..302111111203..',
      '..33.311113.33..',
      '.....322223.....',
      '....323..323....',
      '....33....333...',
      '................',
      '................',
    ];
    const HERO_UP = [
      '.....333333.....',
      '....32222223....',
      '...3222222223...',
      '...3222222223...',
      '...3222112223...',
      '...3222222223...',
      '....32222223....',
      '...3222222223...',
      '..322211112223..',
      '..302222222203..',
      '..33.322223.33..',
      '.....322223.....',
      '.....32..23.....',
      '....333..333....',
      '................',
      '................',
    ];
    const HERO_SIDE = [
      '.....333333.....',
      '....32222223....',
      '...3222222223...',
      '...3222333223...',
      '...3223003033...',
      '...3223000003...',
      '....32300033....',
      '....3221113.....',
      '...322113113....',
      '...30211113.....',
      '....3.3113......',
      '.....32223......',
      '....323.323.....',
      '....33...33.....',
      '................',
      '................',
    ];

    // Original robed healer NPC (16x16)
    const HEALER_SPRITE = [
      '.....333333.....',
      '....30000003....',
      '...3011111103...',
      '...3030000303...',
      '...3003003003...',
      '....30000003....',
      '...3110000113...',
      '..311102201113..',
      '..311100001113..',
      '...3311111133...',
      '.....311113.....',
      '................',
    ];

    // Original wild creature 1: MOSS SLIME (16x16 scaled 2x -> 32x32)
    const MOSS_SLIME = [
      '.......33.......',
      '......3113......',
      '.....312.3......',
      '......333.......',
      '....3311133.....',
      '...311001113....',
      '..31001111123...',
      '..31111111123...',
      '.3113311133223..',
      '.3113011130223..',
      '.3111112211223..',
      '.3211122221223..',
      '..32222222223...',
      '...333333333....',
      '................',
      '................',
    ];

    // Original wild creature 2: BARK BEETLE (16x16 scaled 2x -> 32x32)
    const BARK_BEETLE = [
      '...33......33...',
      '..313......313..',
      '...3233333323...',
      '....32222223....',
      '...3230220323...',
      '..322223322223..',
      '..312222222213..',
      '.33112233221133.',
      '31.3223113223.13',
      '3..3222112223..3',
      '...3222222223...',
      '..3.32233223.3..',
      '.3...333333...3.',
      '................',
      '................',
      '................',
    ];

    // Original player creature: SPARK CUB back-view (16x16 scaled 2x -> 32x32)
    const SPARK_CUB = [
      '..33........33..',
      '..303......303..',
      '..3013....3103..',
      '...3113333113...',
      '...3100110013...',
      '..310001100013..',
      '..311111111113..',
      '...3111221113...',
      '..311111111113..',
      '.300311221133...',
      '300031122113....',
      '.30331111113....',
      '..3.311..113....',
      '....333..333....',
      '................',
      '................',
    ];

    // Map definitions (10x9 metatiles -> 160x144)
    // Legend: T=tree, .=meadow, P=path, G=grass, B=building wall, R=roof, D=door,
    //         H=heal center interior floor, W=wall, C=counter, M=exit mat
    const OVERWORLD_MAP = [
      'TTTTTTTTTT',
      'TTRRRRRR.T',
      'TTBBDBBB.T',
      'T...P....T',
      'T...P..G.T',
      'T...PGGG.T',
      'T...PGGG.T',
      'T....GGG.T',
      'TTTTTTTTTT',
    ];

    const HEAL_MAP = [
      'WWWWWWWWWW',
      'W........W',
      'WCCCCCCCCW',
      'W.HHHHHH.W',
      'WHHHHHHHHW',
      'WHHHHHHHHW',
      'WHHHHHHHHW',
      'W.HMHHHH.W',
      'WWWWWWWWWW',
    ];

    function drawTile(ch, tx, ty, tick) {
      const px = tx * 16;
      const py = ty * 16;
      if (ch === '.' || ch === 'D') {
        ctx.fillStyle = C0;
        ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = C1;
        if ((tx + ty) % 2 === 0) {
          ctx.fillRect(px + 3, py + 4, 2, 1);
          ctx.fillRect(px + 10, py + 11, 2, 1);
        }
      } else if (ch === 'T') {
        ctx.fillStyle = C1;
        ctx.fillRect(px, py, 16, 16);
        // Rounded tree canopy
        ctx.fillStyle = C3;
        ctx.fillRect(px + 3, py + 1, 10, 10);
        ctx.fillRect(px + 2, py + 2, 12, 8);
        ctx.fillStyle = C2;
        ctx.fillRect(px + 4, py + 2, 8, 8);
        ctx.fillRect(px + 3, py + 3, 10, 6);
        ctx.fillStyle = C1;
        ctx.fillRect(px + 4, py + 3, 4, 3);
        ctx.fillRect(px + 5, py + 2, 3, 2);
        // Trunk
        ctx.fillStyle = C3;
        ctx.fillRect(px + 6, py + 11, 4, 5);
        ctx.fillStyle = C2;
        ctx.fillRect(px + 7, py + 11, 2, 4);
      } else if (ch === 'R') {
        ctx.fillStyle = C2;
        ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = C3;
        ctx.fillRect(px, py, 16, 2);
        ctx.fillRect(px, py + 14, 16, 2);
        ctx.fillStyle = C1;
        for (let i = 2; i < 16; i += 4) ctx.fillRect(px + i, py + 4, 2, 8);
      } else if (ch === 'B') {
        ctx.fillStyle = C0;
        ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = C3;
        ctx.fillRect(px, py + 14, 16, 2);
        ctx.fillStyle = C2;
        ctx.fillRect(px + 3, py + 4, 10, 6);
        ctx.fillStyle = C0;
        ctx.fillRect(px + 4, py + 5, 3, 4);
        ctx.fillRect(px + 9, py + 5, 3, 4);
      } else if (ch === 'P') {
        ctx.fillStyle = C1;
        ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = C0;
        ctx.fillRect(px + 2, py + 3, 3, 2);
        ctx.fillRect(px + 10, py + 10, 3, 2);
      } else if (ch === 'G') {
        ctx.fillStyle = C1;
        ctx.fillRect(px, py, 16, 16);
        const sway = Math.floor(tick / 12) % 2;
        for (let gx = 2; gx <= 10; gx += 7) {
          for (let gy = 3; gy <= 10; gy += 7) {
            ctx.fillStyle = C3;
            ctx.fillRect(px + gx + 1, py + gy + 3, 4, 1);
            ctx.fillStyle = C2;
            ctx.fillRect(px + gx + sway, py + gy, 1, 3);
            ctx.fillRect(px + gx + 2, py + gy - 1, 1, 4);
            ctx.fillRect(px + gx + 4 + sway, py + gy, 1, 3);
          }
        }
      } else if (ch === 'W') {
        ctx.fillStyle = C2;
        ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = C3;
        ctx.fillRect(px, py + 14, 16, 2);
        ctx.fillStyle = C1;
        ctx.fillRect(px + 2, py + 3, 12, 8);
      } else if (ch === 'C') {
        ctx.fillStyle = C0;
        ctx.fillRect(px, py, 16, 16);
        ctx.fillStyle = C3;
        ctx.fillRect(px, py + 4, 16, 10);
        ctx.fillStyle = C1;
        ctx.fillRect(px, py + 5, 16, 6);
      } else if (ch === 'H' || ch === 'M') {
        ctx.fillStyle = C0;
        ctx.fillRect(px, py, 16, 16);
        if (tx === 3 && ty >= 3 && ty <= 6) {
          // Cozy runner carpet guiding to the counter
          ctx.fillStyle = C1;
          ctx.fillRect(px + 2, py, 12, 16);
          ctx.fillStyle = C2;
          ctx.fillRect(px + 2, py, 1, 16);
          ctx.fillRect(px + 13, py, 1, 16);
        } else {
          ctx.fillStyle = C1;
          ctx.fillRect(px + 1, py + 1, 1, 1);
          ctx.fillRect(px + 14, py + 14, 1, 1);
        }
      }
      if (ch === 'D') {
        ctx.fillStyle = C3;
        ctx.fillRect(px + 2, py + 1, 12, 15);
        ctx.fillStyle = C2;
        ctx.fillRect(px + 4, py + 3, 8, 12);
        ctx.fillStyle = C0;
        ctx.fillRect(px + 9, py + 8, 2, 2);
      }
      if (ch === 'M') {
        ctx.fillStyle = C2;
        ctx.fillRect(px + 2, py + 5, 12, 9);
        ctx.fillStyle = C1;
        ctx.fillRect(px + 4, py + 7, 8, 5);
      }
    }

    // Simulation state
    const autoFight = createAutoFight();
    const world = {
      tick: 0,
      map: 0x29,
      tileset: 6,
      x: 3,
      y: 6,
      facing: 0x00, // down
      walkProgress: 0, // pixels shifted from previous tile
      walkDir: null,
      moveFromX: 3,
      moveFromY: 6,
      isInBattle: 0,
      battleSub: 'intro', // intro | main_menu | move_menu | attack_anim | victory | flee_text
      battleTimer: 0,
      enemyName: 'MOSS SLIME',
      enemyLevel: 4,
      enemyHp: 12,
      enemyMaxHp: 12,
      enemySprite: MOSS_SLIME,
      cursorRow: 16,
      cursorCol: 15,
      partyHp: 18,
      partyMaxHp: 24,
      bashPp: 1,
      healAnimTimer: 0,
      healText: '',
      speed: 1,
      autoFightEnabled: false,
      prevButtons: { ...NEUTRAL_BUTTONS },
      battle1Done: false,
      battle2Done: false,
      paceTiles: 0,
      visitedSeen: false,
      phasesSeen: new Set(),
      resumedMovingTicks: 0,
      done: false,
    };

    const OPP_DELTA = {
      up: [0, -1, 0x04],
      down: [0, 1, 0x00],
      left: [-1, 0, 0x08],
      right: [1, 0, 0x0c],
    };

    function currentSnap() {
      const party = [
        {
          species: 1,
          hp: world.partyHp,
          maxHp: world.partyMaxHp,
          level: 7,
          moves: [45, 10, 0, 0], // CHIRP (Growl non-attack 45), BASH (Scratch attack 10)
          pp: [20, world.bashPp, 0, 0],
        },
      ];
      const hasTypeBox = world.isInBattle === 1 && world.battleSub === 'move_menu';
      const isMainMenu = world.isInBattle === 1 && world.battleSub === 'main_menu';
      return {
        isInBattle: world.isInBattle,
        map: world.map,
        x: world.x,
        y: world.y,
        tileset: world.tileset,
        mapHeight: 9,
        mapWidth: 10,
        facing: world.facing,
        movementFlags: 0,
        partyCount: 1,
        party,
        battleMon: {
          hp: world.partyHp,
          maxHp: world.partyMaxHp,
          level: 7,
          moves: [45, 10, 0, 0],
          pp: [20, world.bashPp, 0, 0],
        },
        enemyHp: world.enemyHp,
        hasTypeBox,
        menuBoxRows: Array(6).fill('                    '),
        menuBoxText: '',
        fightPos: isMainMenu ? { row: 14, col: 10 } : null,
        runPos: isMainMenu ? { row: 16, col: 16 } : null,
        hasRun: isMainMenu,
        cursorPos: isMainMenu || hasTypeBox ? { row: world.cursorRow, col: world.cursorCol } : null,
        moveFirstRow: 13,
      };
    }

    function syncUI(res = null) {
      const st = autoFight.getState();
      const centerName = st.pokeCenterMap === 0x29 ? 'Meadow Heal Center' : st.pokeCenterName;

      if (st.inPokeCenter && centerName) {
        healCenterStatusEl.textContent =
          'Heal Center visited: ' + centerName + ' — exit to record return path';
        healCenterStatusEl.classList.add('linked');
        world.visitedSeen = true;
      } else if (centerName && st.trailLength > 0) {
        const unit = st.trailLength === 1 ? 'step' : 'steps';
        healCenterStatusEl.textContent =
          'Heal Center path active: ' + centerName + ' (' + st.trailLength + ' ' + unit + ')';
        healCenterStatusEl.classList.add('linked');
      } else {
        healCenterStatusEl.textContent =
          'Heal Center: not visited yet — visit one to enable auto-heal return';
        healCenterStatusEl.classList.remove('linked');
      }

      autoFightBtn.textContent = st.active ? 'Stop Auto-Fight' : 'Auto-Fight';
      autoFightBtn.classList.toggle('active', st.active);

      for (const b of speedBtns) {
        b.classList.toggle('active', Number(b.dataset.speed) === world.speed);
      }

      if (st.active && res) {
        world.phasesSeen.add(res.phase);
        if (res.phase === 'returning') {
          autoFightStatusEl.textContent = 'Auto-Fight: returning to Heal Center...';
        } else if (res.phase === 'fleeing') {
          autoFightStatusEl.textContent = 'Auto-Fight: fleeing battle...';
        } else if (res.phase === 'healing') {
          autoFightStatusEl.textContent = 'Auto-Fight: healing at Heal Center...';
        } else if (res.phase === 'walking_back') {
          autoFightStatusEl.textContent = 'Auto-Fight: walking back to grind spot...';
        } else {
          autoFightStatusEl.textContent =
            'Auto-Fight: ' + res.phase + '...' + (st.hasHealPath ? ' (Heal Center path ready)' : '');
        }
      } else {
        autoFightStatusEl.textContent = '\u00a0';
      }
    }

    function tryOverworldStep(dir) {
      const [dx, dy, face] = OPP_DELTA[dir];
      world.facing = face;

      if (world.map === 0x29 && world.x === 3 && world.y === 7 && dir === 'down') {
        // Exit Heal Center onto Meadow Trail door
        world.map = 1;
        world.tileset = 0;
        world.x = 4;
        world.y = 3;
        world.facing = 0x00;
        return;
      }
      if (world.map === 1 && world.x === 4 && world.y === 3 && dir === 'up') {
        // Enter Heal Center
        world.map = 0x29;
        world.tileset = 6;
        world.x = 3;
        world.y = 7;
        world.facing = 0x04;
        return;
      }

      const nx = world.x + dx;
      const ny = world.y + dy;
      if (nx < 1 || nx > 8 || ny < 1 || ny > 7) return;
      if (world.map === 0x29 && ny <= 2) return;
      if (world.map === 1 && ny <= 2) return;

      world.moveFromX = world.x;
      world.moveFromY = world.y;
      world.x = nx;
      world.y = ny;
      world.walkDir = dir;
      world.walkProgress = 8;
      if (world.autoFightEnabled && !world.battle1Done) {
        world.paceTiles += 1;
      }
    }

    // Scripted intro path before enabling Auto-Fight
    const INTRO_MOVES = [
      'down', // (3,6)->(3,7)
      'down', // exit (3,7)->(1: 4,3)
      'down', // (4,4)
      'down', // (4,5)
      'down', // (4,6)
      'right', // (5,6)
    ];
    let introStepIdx = 0;
    let introWait = 6;
    let startCountdown = -1;

    function tickOneGbFrame() {
      world.tick += 1;

      if (world.walkProgress > 0) {
        world.walkProgress -= 2;
        if (world.walkProgress <= 0) {
          world.walkProgress = 0;
          world.walkDir = null;
        }
      }

      if (!world.autoFightEnabled) {
        autoFight.observe(currentSnap());
        if (world.walkProgress === 0) {
          if (introWait > 0) {
            introWait -= 1;
          } else if (introStepIdx < INTRO_MOVES.length) {
            tryOverworldStep(INTRO_MOVES[introStepIdx++]);
            introWait = introStepIdx === 1 ? 6 : 2;
          } else if (startCountdown === -1) {
            startCountdown = 10;
          } else if (startCountdown > 0) {
            startCountdown -= 1;
          } else {
            world.autoFightEnabled = true;
            world.speed = 4;
            autoFight.start(currentSnap());
          }
        }
        syncUI(null);
        return;
      }

      const res = autoFight.step(currentSnap());
      if (!res.active) {
        throw new Error('Auto-Fight stopped unexpectedly: ' + res.stopReason);
      }
      const btn = res.buttons;
      const rising = (k) => btn[k] && !world.prevButtons[k];

      if (world.isInBattle === 0) {
        // Check triggers when finishing a tile walk
        if (world.walkProgress === 0) {
          if (!world.battle1Done && res.phase === 'moving' && world.paceTiles >= 3 && world.x === 6 && world.y === 6) {
            world.battle1Done = true;
            world.isInBattle = 1;
            world.battleSub = 'intro';
            world.battleTimer = 0;
            world.enemyName = 'MOSS SLIME';
            world.enemyLevel = 4;
            world.enemyHp = 12;
            world.enemyMaxHp = 12;
            world.enemySprite = MOSS_SLIME;
            world.cursorRow = 16; // starts on RUN so cursor visibly steers to FIGHT
            world.cursorCol = 15;
            world.prevButtons = { ...btn };
            syncUI(res);
            return;
          }
          if (
            world.battle1Done &&
            !world.battle2Done &&
            res.phase === 'returning' &&
            world.map === 1 &&
            world.x === 4 &&
            world.y === 5
          ) {
            world.battle2Done = true;
            world.isInBattle = 1;
            world.battleSub = 'intro';
            world.battleTimer = 0;
            world.enemyName = 'BARK BEETLE';
            world.enemyLevel = 5;
            world.enemyHp = 14;
            world.enemyMaxHp = 14;
            world.enemySprite = BARK_BEETLE;
            world.cursorRow = 14; // starts on FIGHT so cursor visibly steers to RUN
            world.cursorCol = 9;
            world.prevButtons = { ...btn };
            syncUI(res);
            return;
          }

          if (res.phase === 'healing') {
            const sub = autoFight.getState().healSubphase;
            if (sub === 'talking_nurse') {
              if (rising('a') && world.healAnimTimer === 0) {
                world.healAnimTimer = 34;
                world.healText = 'RESTORING HP & PP...';
              }
              if (world.healAnimTimer > 0) {
                world.healAnimTimer -= 1;
                if (world.healAnimTimer <= 16 && world.healAnimTimer > 1) {
                  world.healText = 'ALL HEALED!';
                }
                if (world.healAnimTimer === 1) {
                  world.partyHp = world.partyMaxHp;
                  world.bashPp = 10;
                  world.healText = 'ALL HEALED!';
                }
              }
            } else if (sub === 'closing_dialogue') {
              if (rising('b') || btn.down) {
                world.healText = '';
                world.healAnimTimer = 0;
              }
              if (btn.down && !world.healText) {
                tryOverworldStep('down');
              }
            } else {
              for (const d of ['up', 'down', 'left', 'right']) {
                if (btn[d]) {
                  tryOverworldStep(d);
                  break;
                }
              }
            }
          } else {
            for (const d of ['up', 'down', 'left', 'right']) {
              if (btn[d]) {
                tryOverworldStep(d);
                break;
              }
            }
          }
        }

        if (world.battle2Done && world.phasesSeen.has('walking_back') && res.phase === 'moving') {
          world.resumedMovingTicks += 1;
          if (world.resumedMovingTicks >= 34) {
            world.done = true;
          }
        }
      } else {
        // In wild battle
        if (world.battleSub === 'intro') {
          world.battleTimer += 1;
          if (rising('a') && world.battleTimer >= 12) {
            world.battleSub = 'main_menu';
            world.battleTimer = 0;
          }
        } else if (world.battleSub === 'main_menu') {
          if (rising('up')) world.cursorRow = 14;
          else if (rising('down')) world.cursorRow = 16;
          else if (rising('left')) world.cursorCol = 9;
          else if (rising('right')) world.cursorCol = 15;
          else if (rising('a')) {
            if (world.cursorRow === 14 && world.cursorCol === 9) {
              world.battleSub = 'move_menu';
              world.cursorRow = 13; // CHIRP (non-attack)
              world.cursorCol = 5;
              world.battleTimer = 0;
            } else if (world.cursorRow === 16 && world.cursorCol === 15) {
              world.battleSub = 'flee_text';
              world.battleTimer = 0;
            }
          }
        } else if (world.battleSub === 'move_menu') {
          if (rising('b')) {
            world.battleSub = 'main_menu';
            world.cursorRow = 14;
            world.cursorCol = 9;
          } else if (rising('down')) {
            world.cursorRow = Math.min(14, world.cursorRow + 1);
          } else if (rising('up')) {
            world.cursorRow = Math.max(13, world.cursorRow - 1);
          } else if (rising('a') && world.cursorRow === 14) {
            world.bashPp = Math.max(0, world.bashPp - 1);
            world.battleSub = 'attack_anim';
            world.battleTimer = 0;
          }
        } else if (world.battleSub === 'attack_anim') {
          world.battleTimer += 1;
          if (world.battleTimer >= 8) {
            world.enemyHp = Math.max(0, 12 - Math.floor(((world.battleTimer - 8) / 14) * 12));
          }
          if (world.battleTimer >= 24) {
            world.enemyHp = 0;
            world.battleSub = 'victory';
            world.battleTimer = 0;
          }
        } else if (world.battleSub === 'victory') {
          world.battleTimer += 1;
          if (rising('a') && world.battleTimer >= 12) {
            world.isInBattle = 0;
            world.battleTimer = 0;
          }
        } else if (world.battleSub === 'flee_text') {
          world.battleTimer += 1;
          if (rising('a') && world.battleTimer >= 12) {
            world.isInBattle = 0;
            world.battleTimer = 0;
          }
        }
      }

      world.prevButtons = { ...btn };
      syncUI(res);
    }

    function renderOverworld() {
      const grid = world.map === 0x29 ? HEAL_MAP : OVERWORLD_MAP;
      for (let ty = 0; ty < 9; ty++) {
        for (let tx = 0; tx < 10; tx++) {
          drawTile(grid[ty][tx], tx, ty, world.tick);
        }
      }

      if (world.map === 1) {
        // Pixel heart emblem above Heal Center roof
        drawBox(65, 16, 30, 14, C0);
        drawHeart(73, 19, 2, C2);
      } else {
        // Healer NPC behind counter + pixel heart sign on counter
        drawSprite(HEALER_SPRITE, 3 * 16, 1 * 16 + 4, 1);
        drawHeart(3 * 16 + 4, 2 * 16 + 5, 1, C2);
        if (world.healAnimTimer > 10) {
          const offset = (world.healAnimTimer % 6) < 3 ? 0 : -2;
          drawHeart(3 * 16 + 4, 1 * 16 - 4 + offset, 1, C0);
          drawHeart(2 * 16 + 10, 1 * 16 + 2 - offset, 1, C0);
        }
      }

      // Interpolate hero pixel position during 8-frame tile step
      const frac = world.walkProgress / 8;
      const hx = (world.x * (1 - frac) + world.moveFromX * frac) * 16;
      const hy = (world.y * (1 - frac) + world.moveFromY * frac) * 16;

      let heroSprite = HERO_DOWN;
      if (world.facing === 0x04) heroSprite = HERO_UP;
      else if (world.facing === 0x08 || world.facing === 0x0c) heroSprite = HERO_SIDE;
      else if (world.walkProgress > 0 && Math.floor(world.walkProgress / 2) % 2 === 1) {
        heroSprite = HERO_DOWN_WALK;
      }
      drawSprite(heroSprite, Math.round(hx), Math.round(hy), 1);

      if (world.healText) {
        drawBox(6, 108, 148, 30, C0);
        drawText(world.healText, 14, 118, C3);
        if (world.partyHp === world.partyMaxHp) {
          drawText('HP 24/24   PP 10/10', 14, 127, C2);
        }
      }
    }

    function drawHpBar(x, y, hp, maxHp) {
      ctx.fillStyle = C3;
      ctx.fillRect(x, y, 52, 5);
      ctx.fillStyle = C0;
      ctx.fillRect(x + 1, y + 1, 50, 3);
      const fill = Math.max(0, Math.round((hp / maxHp) * 50));
      ctx.fillStyle = hp <= maxHp / 3 ? C2 : C3;
      ctx.fillRect(x + 1, y + 1, fill, 3);
    }

    function renderBattle() {
      ctx.fillStyle = C0;
      ctx.fillRect(0, 0, 160, 144);

      // Ground ellipses
      ctx.fillStyle = C1;
      ctx.fillRect(96, 52, 50, 10);
      ctx.fillRect(10, 82, 56, 10);

      // Enemy HUD
      drawText(world.enemyName, 8, 8, C3);
      drawText('LV' + world.enemyLevel, 8, 16, C2);
      drawText('HP', 8, 24, C3);
      drawHpBar(20, 24, world.enemyHp, world.enemyMaxHp);

      // Enemy sprite (hidden on KO, flashes during hit)
      const hitFlash =
        world.battleSub === 'attack_anim' && world.battleTimer >= 8 && world.battleTimer % 4 < 2;
      if (world.enemyHp > 0) {
        const bob = Math.floor(world.tick / 12) % 2;
        drawSprite(world.enemySprite, 105, 22 + bob, 2, hitFlash);
      }

      // Player creature sprite
      const lunge =
        world.battleSub === 'attack_anim' && world.battleTimer < 8 ? 6 : 0;
      drawSprite(SPARK_CUB, 22 + lunge, 56, 2);

      // Player HUD
      drawText('SPARK CUB', 88, 60, C3);
      drawText('LV7', 136, 60, C2);
      drawText('HP', 88, 69, C3);
      drawHpBar(100, 69, world.partyHp, world.partyMaxHp);
      drawText(world.partyHp + '/' + world.partyMaxHp, 114, 77, C3);

      // Bottom dialogue / menu frame
      drawBox(2, 92, 156, 50, C0);

      if (world.battleSub === 'intro') {
        drawText('WILD ' + world.enemyName, 12, 104, C3);
        drawText(world.battle2Done ? 'AMBUSHED YOU!' : 'APPEARED!', 12, 116, C3);
      } else if (world.battleSub === 'main_menu') {
        drawText('WHAT WILL', 10, 104, C3);
        drawText('CUB DO?', 10, 116, C3);
        drawBox(74, 92, 84, 50, C0);
        drawText('FIGHT', 88, 104, C3);
        drawText('PARTY', 124, 104, C3);
        drawText('BAG', 88, 122, C3);
        drawText('RUN', 124, 122, C3);
        const cx = world.cursorCol <= 10 ? 81 : 117;
        const cy = world.cursorRow <= 14 ? 104 : 122;
        drawText('>', cx, cy, C3);
      } else if (world.battleSub === 'move_menu') {
        drawBox(2, 92, 82, 50, C0);
        drawText('CHIRP', 20, 102, C2);
        drawText('BASH', 20, 114, C3);
        drawText('-', 20, 126, C2);
        const cy = world.cursorRow === 13 ? 102 : 114;
        drawText('>', 12, cy, C3);
        drawBox(82, 92, 76, 50, C0);
        drawText('TYPE/NORM', 90, 104, C2);
        drawText('PP ' + world.bashPp + '/10', 90, 118, C3);
      } else if (world.battleSub === 'attack_anim') {
        drawText('SPARK CUB', 12, 104, C3);
        drawText('USED BASH!', 12, 116, C3);
      } else if (world.battleSub === 'victory') {
        drawText(world.enemyName + ' FAINTED!', 12, 104, C3);
        drawText('+18 EXP GAINED!', 12, 116, C2);
      } else if (world.battleSub === 'flee_text') {
        drawText('GOT AWAY SAFELY!', 12, 110, C3);
      }
    }

    function render() {
      if (world.isInBattle === 1) renderBattle();
      else renderOverworld();
    }

    window.__demo = {
      step(gbFrames = 2) {
        for (let i = 0; i < gbFrames; i++) {
          if (world.done) break;
          tickOneGbFrame();
        }
        render();
        return {
          tick: world.tick,
          map: world.map,
          x: world.x,
          y: world.y,
          isInBattle: world.isInBattle,
          battleSub: world.battleSub,
          phase: autoFight.getState().phase,
          healSubphase: autoFight.getState().healSubphase,
          visitedSeen: world.visitedSeen,
          phasesSeen: Array.from(world.phasesSeen),
          done: world.done,
          autoStatus: autoFightStatusEl.textContent,
          healStatus: healCenterStatusEl.textContent,
        };
      },
    };

    // Render initial frame
    autoFight.observe(currentSnap());
    syncUI(null);
    render();
  </script>
</body>
</html>`;

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

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.rmSync(CHROME_PROFILE, { recursive: true, force: true });
  fs.mkdirSync(CHROME_PROFILE, { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_GIF), { recursive: true });

  const autofightSource = fs.readFileSync(path.join(REPO_DIR, 'autofight.js'));
  const server = http.createServer((req, res) => {
    if (req.url === '/demo.html' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DEMO_HTML);
      return;
    }
    if (req.url === '/autofight.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(autofightSource);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${CHROME_PROFILE}`,
      '--window-size=640,980',
      `http://127.0.0.1:${port}/demo.html`,
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
      width: 640,
      height: 980,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await waitFor(async () => await client.eval(`Boolean(window.__demo)`), 10000, 50);

    const rect = await client.eval(`(() => {
      const r = document.getElementById('app-card').getBoundingClientRect();
      const pad = 14;
      return {
        x: Math.max(0, Math.round(r.left - pad)),
        y: Math.max(0, Math.round(r.top - pad)),
        width: Math.round(r.width + pad * 2),
        height: Math.round(r.height + pad * 2),
        scale: 1,
      };
    })()`);

    // Ensure even dimensions for clean ffmpeg handling
    if (rect.width % 2 !== 0) rect.width += 1;
    if (rect.height % 2 !== 0) rect.height += 1;

    const frameLog = [];
    const sampleFrames = {};
    const markSample = (key, idx) => {
      if (!(key in sampleFrames)) sampleFrames[key] = idx;
    };
    let frameIdx = 0;

    async function captureCurrentFrame(repeat = 1) {
      const shot = await client.send('Page.captureScreenshot', {
        format: 'png',
        clip: rect,
      });
      const buf = Buffer.from(shot.data, 'base64');
      for (let i = 0; i < repeat; i++) {
        const out = path.join(FRAMES_DIR, `frame-${String(frameIdx).padStart(4, '0')}.png`);
        fs.writeFileSync(out, buf);
        frameIdx += 1;
      }
    }

    // Hold frame 0 briefly so initial Heal Center visited banner is legible
    markSample('heal_visited', frameIdx);
    await captureCurrentFrame(6);

    let lastState = null;
    for (let step = 0; step < 300; step++) {
      // Advance faster during overworld travel, 2 GB frames during battle menus for crisp readability
      const gbStep =
        lastState?.isInBattle === 1 && (lastState.battleSub === 'main_menu' || lastState.battleSub === 'move_menu')
          ? 2
          : lastState?.phase === 'returning' || lastState?.phase === 'walking_back'
            ? 3
            : 2;
      const st = await client.eval(`window.__demo.step(${gbStep})`);
      lastState = st;
      frameLog.push(st);

      if (st.map === 1 && st.phase === 'idle') markSample('trail_recorded', frameIdx);
      if (st.phase === 'moving' && st.phasesSeen.length === 1) markSample('moving', frameIdx);
      if (st.phase === 'fighting' && st.battleSub === 'move_menu') markSample('move_menu', frameIdx);
      if (st.phase === 'fighting' && st.battleSub === 'attack_anim') markSample('attack_anim', frameIdx);
      if (st.phase === 'returning') markSample('returning', frameIdx);
      if (st.phase === 'fleeing' && st.battleSub === 'main_menu') markSample('fleeing', frameIdx);
      if (st.phase === 'healing' && st.healSubphase === 'talking_nurse') markSample('healing_talk', frameIdx);
      if (st.phase === 'walking_back') markSample('walking_back', frameIdx);
      if (st.done) markSample('resumed_end', frameIdx);

      let repeat = 1;
      if (st.battleSub === 'intro' && st.tick > 0) repeat = 1;
      await captureCurrentFrame(repeat);

      if (st.done) {
        await captureCurrentFrame(8);
        break;
      }
    }

    assert.equal(lastState?.done, true, `Demo did not finish within 300 steps; lastState=${JSON.stringify(lastState)}`);
    assert.equal(lastState.visitedSeen, true, 'Expected Heal Center visited state');
    for (const expectedPhase of ['moving', 'fighting', 'fleeing', 'returning', 'healing', 'walking_back']) {
      assert.ok(
        lastState.phasesSeen.includes(expectedPhase),
        `Missing phase ${expectedPhase}; seen=${JSON.stringify(lastState.phasesSeen)}`
      );
    }

    const errors = client.events.filter(
      (e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Runtime.consoleAPICalled' && e.params?.type === 'error') ||
        (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error')
    );
    assert.equal(errors.length, 0, `Unexpected Chrome errors: ${JSON.stringify(errors)}`);

    await runCmd('ffmpeg', [
      '-y',
      '-framerate',
      String(FPS),
      '-i',
      path.join(FRAMES_DIR, 'frame-%04d.png'),
      '-vf',
      'palettegen=max_colors=64:stats_mode=diff',
      PALETTE_PATH,
    ]);

    await runCmd('ffmpeg', [
      '-y',
      '-framerate',
      String(FPS),
      '-i',
      path.join(FRAMES_DIR, 'frame-%04d.png'),
      '-i',
      PALETTE_PATH,
      '-lavfi',
      'paletteuse=dither=none:diff_mode=rectangle',
      '-loop',
      '0',
      OUTPUT_GIF,
    ]);

    const stat = fs.statSync(OUTPUT_GIF);
    console.log('GENERATED DEMO GIF:', {
      path: OUTPUT_GIF,
      bytes: stat.size,
      frames: frameIdx,
      durationSec: Number((frameIdx / FPS).toFixed(2)),
      clip: `${rect.width}x${rect.height}`,
      phasesSeen: lastState.phasesSeen,
      sampleFrames,
    });
  } finally {
    if (client) client.close();
    chrome.kill('SIGTERM');
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
