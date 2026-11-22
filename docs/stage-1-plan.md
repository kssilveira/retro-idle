# Stage 1 Plan — "Grind Right Here" MVP

> Browser Game Boy / Game Boy Color emulator with built-in **Auto-Grind** cruise control: drop your own ROM, play normally, toggle Auto-Pilot when you reach a grinding spot, and take back control with a 0 ms handoff when a milestone hits.

---

## 1. Overview & Scope

### Core Loop
1. User opens the static web app and drops a legally obtained `.gb` or `.gbc` ROM (ROMs stay 100% client-side in browser memory / `IndexedDB`).
2. User plays manually with keyboard/gamepad until reaching a tedious stretch (e.g., tall grass outside a town or before a Gym).
3. User opens the **Auto-Grind** drawer, picks stop conditions and speed (`1x`–`20x`), and hits **Start Auto-Grind**.
4. The emulator paces back and forth across 2 tiles in a Web Worker, fights wild encounters automatically by reading live WRAM state, and **auto-pauses + alerts** when any stop or safety condition triggers.
5. Control returns instantly (`0 ms` handoff) to the user on the exact frame/screen—with one-click **Undo Auto-Pilot** to roll back to before automation started if anything unexpected happened.

### Target Games
- **Primary target:** *Pokémon Red / Blue* (USA/Europe, Game Boy) via a verified WRAM profile (`pokered`).
- **Generic fallback:** Any other `.gb`/`.gbc` ROM runs a simple timed button-macro loop (`Left ↔ Right + A`) with a configurable stop timer.

### Explicit Non-Goals (Deferred to Later Stages)
- No cloud backend, user accounts, or cross-device sync.
- No map-wide A* pathfinding or automated PokéCenter heal loops (Stage 3).
- No conditional Gambit rule builder or automatic Poké Ball catching (Stage 2).
- No GBA or SNES cores in Stage 1.
- **Zero** copyrighted ROMs, BIOS files, sprites, or Nintendo assets checked into the repository.

---

## 2. Architecture & Tech Stack

### Frontend & Build
- **Stack:** Static Single-Page App built with **Vite + TypeScript** (zero server cost; deployable to GitHub Pages or Cloudflare Pages).
- **Tooling prerequisite:** Current host has `node v24.21.0`; bootstrap a package manager (`npm` or `pnpm`) prior to Milestone M1 implementation.

### Emulator Core Abstraction (`src/core/emulator.ts`)
Wrap the WASM core behind a minimal, swappable TypeScript interface so UI, profiles, and automation never couple directly to a specific emulator package:

```ts
export interface ButtonState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
  select: boolean;
  start: boolean;
}

export interface EmulatorCore {
  loadRom(romBytes: Uint8Array): Promise<void>;
  stepFrame(): void;
  setButtons(state: ButtonState): void;
  getFrameRGBA(): Uint8ClampedArray; // 160 * 144 * 4
  readByte(gbAddr: number): number;
  readBytes(gbAddr: number, len: number): Uint8Array; // Game Boy bus / WRAM 0xC000–0xDFFF
  saveState(): Uint8Array;
  loadState(state: Uint8Array): void;
  getBatteryRam(): Uint8Array;
  loadBatteryRam(ram: Uint8Array): void;
}
```

- **Initial core choice:** `wasmboy` (`src/core/wasmboy-adapter.ts`), using low-level `WasmBoyCore` exports (`executeFrame()`, `setJoypadState(UP, RIGHT, DOWN, LEFT, A, B, SELECT, START)`, and linear WASM memory anchored at `GAMEBOY_INTERNAL_MEMORY_LOCATION`).
- **Documented fallback:** `binjgb` WASM if `wasmboy` WRAM offsets or save-state serialization create friction during M1/M2.

### Two-Thread Browser Architecture

```
Main Thread (src/main.ts)                    Web Worker (src/worker/emu.worker.ts)
──────────────────────────                   ─────────────────────────────────────
• <canvas> (160x144, capped <= 60 FPS) <──── • EmulatorCore (WASM)
• Web Audio (auto-muted above 1x)            • Burst scheduler (1x / 4x / 10x / 20x)
• Keyboard / Gamepad input                   • RAM polling -> GameStateSnapshot
• Auto-Grind Drawer & Telemetry HUD          • AutoGrindFSM (pure TS)
• Web Notifications + pause chime            • Save-state ring buffer (Pre + 4x 60s)
• Optional Picture-in-Picture window
• IndexedDB (.sav + settings)
```

- **Why a Web Worker + frame bursts:** Desktop browsers throttle background tab timers to ~1 Hz (`1000 ms`). Because WASM executes 60 Game Boy frames in ~1–2 ms, a Web Worker bursting N frames per tick keeps background grinding smoothly running at `1x`–`20x` without blocking UI or relying on `requestAnimationFrame`.
- **Main-thread rendering:** Decoupled from simulation speed; renders at 60 FPS max at `1x` and drops to a lower preview cadence (e.g., 10–15 FPS) during Turbo Mode (`10x`–`20x`) to save CPU/GPU work.

---

## 3. ROM Identification & Verified *Pokémon Red/Blue* RAM Map

### Client-Side ROM Detection
On ROM drop, compute `CRC32` (and optionally `SHA-1`) in memory:
- Matches known *Pokémon Red / Blue* (USA/Europe) hashes → activates `pokered` profile (`src/profiles/pokered.ts`). Red and Blue share identical WRAM addresses.
- Unknown `.gb`/`.gbc` hash → falls back to `generic` macro profile.

### *Pokémon Red/Blue* WRAM Map (`src/profiles/pokered.ts`)

| GB Address | Symbol | Size / Format | Meaning & Notes |
| :--- | :--- | :--- | :--- |
| `0xD057` | `wIsInBattle` | `u8` | `0` = overworld, `1` = wild battle, `2` = trainer battle, `0xFF` = lost battle |
| `0xD163` | `wPartyCount` | `u8` | Number of party Pokémon (`1..6`) |
| `0xD16B` | `wPartyMon1` | `44 bytes` (`0x2C` stride) | Base struct of Party Slot 1 |
| `0xD16B` (`+0x00`) | `wPartyMon1Species` | `u8` | Internal Gen 1 species ID |
| `0xD16C..0xD16D` (`+0x01`) | `wPartyMon1HP` | `u16` **big-endian** | Overworld current HP (note: read `wBattleMonHP` during battle) |
| `0xD16F` (`+0x04`) | `wPartyMon1Status` | `u8` | Status condition bitfield (`0` = healthy) |
| `0xD173..0xD176` (`+0x08`) | `wPartyMon1Moves` | `4 × u8` | Move IDs 1–4 |
| `0xD188..0xD18B` (`+0x1D`) | `wPartyMon1PP` | `4 × u8` | Overworld Move PP (`byte & 0x3F` = current PP; top 2 bits = PP Ups) |
| `0xD18C` (`+0x21`) | `wPartyMon1Level` | `u8` | Lead Pokémon level |
| `0xD18D..0xD18E` (`+0x22`) | `wPartyMon1MaxHP` | `u16` **big-endian** | Lead Pokémon Max HP |
| `0xD015..0xD016` | `wBattleMonHP` | `u16` **big-endian** | Active battle Pokémon live HP (`wIsInBattle !== 0`) |
| `0xD023..0xD024` | `wBattleMonMaxHP` | `u16` **big-endian** | Active battle Pokémon live Max HP |
| `0xD02D..0xD030` | `wBattleMonPP` | `4 × u8` | Active battle Pokémon live PP (`byte & 0x3F`) |
| `0xCFE5` | `wEnemyMonSpecies` | `u8` | Enemy **internal** Gen 1 species ID (requires 256-entry lookup → National Dex #1–151) |
| `0xCFE6..0xCFE7` | `wEnemyMonHP` | `u16` **big-endian** | Enemy live HP |
| `0xD2F7..0xD309` | `wPokedexOwned` | `19 bytes` bitfield | `owned = (mem[0xD2F7 + ((dex - 1) >> 3)] & (1 << ((dex - 1) & 7))) !== 0` |
| `0xD35E` | `wCurMap` | `u8` | Current map ID |
| `0xD361` | `wYCoord` | `u8` | Player Y tile coordinate |
| `0xD362` | `wXCoord` | `u8` | Player X tile coordinate |
| `0xCC26` | `wCurrentMenuItem` | `u8` | Active menu cursor index (`0` = top item) |

---

## 4. Auto-Grind State Machine (`src/autopilot/grind-fsm.ts`)

`AutoGrindFSM` is implemented as **pure TypeScript** with zero DOM or WASM dependencies:

```ts
step(snapshot: GameStateSnapshot, config: GrindConfig): { buttons: ButtonState; pauseReason: PauseReason | null }
```

This keeps all state transitions deterministic and fast to unit-test in Node (`tests/grind-fsm.test.ts`).

### Configurable Options
- **Master Toggle & Hotkey:** Start / Pause Auto-Grind button plus instant manual takeover via `Escape`.
- **Speed Selector:** `1x`, `4x`, `10x`, `20x`.
- **Pacing Axis & Anchor Tether:** Choose `Left ↔ Right` or `Up ↔ Down`. On start, capture `(anchorMapId, anchorX, anchorY)`; movement presses only step between the anchor tile and `+1` tile along the chosen axis so the avatar never drifts out of the grass patch.
- **Attack Move Slot:** `Slot 1`–`Slot 4`, or `First available with PP > 0`.
- **User Stop Conditions:**
  - Lead level `>= targetLevel`
  - Lead HP `< minHpPercent` (default `25%`)
  - Selected move PP `== 0` (or all moves PP `== 0`)
  - Wild enemy is **Uncaught** (bit unset in `wPokedexOwned`)
  - Wild enemy matches **Target Species** allowlist (e.g., Pikachu, Abra)
- **Always-On Safety Stops:**
  - Trainer battle entered (`wIsInBattle === 2`)
  - Unexpected map transition (`wCurMap !== anchorMapId`)
  - Battle lost / blackout (`wIsInBattle === 0xFF`)
  - Lead level incremented (or battle stalls `> 45` simulated seconds with unchanged enemy HP) → pauses to prevent accidentally overwriting a newly learned move or mashing `B` to cancel an evolution.

### FSM States
```
MANUAL ──(start)──▶ PACING ◀───────────────────▶ BATTLE_ACTIVE
                      │                                │
                      │ (stop / safety trigger)        ▼
                      └──────────▶ PAUSED_MILESTONE ◀── POST_BATTLE_CHECK
```

- **`MANUAL`:** Passthrough; FSM outputs neutral buttons and ignores automation.
- **`PACING`:** Alternates directional input along the chosen axis tethered to `(anchorX, anchorY)`, pulsing lightly to trigger encounters while monitoring `wIsInBattle` and `wCurMap`.
- **`BATTLE_ACTIVE`:** Checks wild enemy species (Uncaught / Target allowlist) and `wIsInBattle === 2` on entry. Otherwise navigates the fight menu using `wCurrentMenuItem` (`0xCC26`) + `A`/`B` timing to select the configured move slot while reading live `wBattleMonHP` and `wBattleMonPP`.
- **`POST_BATTLE_CHECK`:** Runs once `wIsInBattle` returns to `0`. Evaluates HP %, remaining PP, level-up safety stop, and `targetLevel` before re-entering `PACING` or transitioning to `PAUSED_MILESTONE`.
- **`PAUSED_MILESTONE`:** Releases all buttons, freezes burst loop (or drops cleanly to paused manual state), snapshots telemetry, and fires user alert.

### Generic ROM Fallback Mode
When a ROM's CRC32 does not match a known profile, the UI switches the drawer to **Generic Macro Mode**: configurable `Left ↔ Right` or `Up ↔ Down` pacing + `A` mash interval with a countdown timer (`N` minutes) before pausing.

---

## 5. Safety Net, Persistence & UX

### Undo Auto-Pilot Ring Buffer
- Immediately when the user clicks **Start Auto-Grind**, capture a pinned in-memory snapshot: `preAutopilotState = core.saveState()`.
- While Auto-Grind runs, capture up to **4 rolling snapshots** every `60` simulated seconds.
- Clicking **Undo Auto-Pilot** restores `preAutopilotState` (or lets the user pick a recent rolling checkpoint) with zero progress regret.

### Persistence & Save Portability (`src/storage/db.ts`)
- Store cartridge `.sav` battery RAM and user drawer settings in **`IndexedDB`**, keyed by ROM hash.
- Call `navigator.storage.persist()` on startup to reduce Safari/browser eviction risk.
- Auto-flush battery RAM every `30` seconds during play, on every pause, and on `pagehide`.
- Provide prominent **Import `.sav`** and **Export `.sav`** buttons so saves stay portable across desktop emulators.

### Background UX & Telemetry
- **Alerts:** Gentle Web Audio chime + `Notification` API alert stating the pause reason (e.g., *"Uncaught Pikachu appeared!"*, *"Charmander reached Lv. 16"*, *"HP below 25%"*).
- **Optional Picture-in-Picture:** Document Picture-in-Picture pop-out showing the miniature `160×144` canvas + status pill on desktop while working in other windows.
- **Telemetry HUD:** Live compact stats (battles won, levels gained, encounters/min, elapsed simulated time) and a scrollable session event log.

---

## 6. Proposed Repository Structure

```text
retro-idle/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   └── stage-1-plan.md
├── src/
│   ├── main.ts                  # Main thread app shell, canvas, audio, UI bindings
│   ├── worker/
│   │   └── emu.worker.ts        # Worker loop, burst speed scheduler, ring buffer, FSM driver
│   ├── core/
│   │   ├── emulator.ts          # EmulatorCore & ButtonState interfaces
│   │   └── wasmboy-adapter.ts   # WasmBoyCore wrapper (swappable with binjgb)
│   ├── profiles/
│   │   ├── types.ts             # GameProfile & GameStateSnapshot contracts
│   │   └── pokered.ts           # CRC32 matcher, WRAM map, internal-ID -> Dex table
│   ├── autopilot/
│   │   └── grind-fsm.ts         # Pure TypeScript AutoGrindFSM
│   └── storage/
│       └── db.ts                # IndexedDB persistence + .sav import/export helpers
└── tests/
    └── grind-fsm.test.ts        # Deterministic FSM unit tests
```

---

## 7. Implementation Milestones & Acceptance Criteria

| Milestone | Scope | Acceptance Criteria |
| :--- | :--- | :--- |
| **M1 — Playable Browser Emulator** | Vite + TS setup, `EmulatorCore`, `WasmBoy` adapter, Web Worker canvas, keyboard input, `IndexedDB` + `.sav` import/export | Drop a `.gb`/`.gbc` ROM, play smoothly at 60 FPS with audio, refresh page and retain SRAM save, export/re-import `.sav` cleanly. |
| **M2 — ROM Profile & Live RAM HUD** | `CRC32` ROM detection, `pokered.ts` reader + internal-ID table, live debug/HUD drawer | Load *Pokémon Red/Blue* and verify live Lead Level, HP/MaxHP, PP, Map ID, X/Y, Battle State, Enemy Species, and Caught bit update accurately during manual play **before** enabling any automated input. |
| **M3 — Core Auto-Grind FSM & Turbo** | `grind-fsm.ts`, Node unit tests (`tests/grind-fsm.test.ts`), 2-tile anchor pacing, battle loop, `1x`–`20x` speed selector, all stop/safety triggers | Unit tests pass for all transitions and safety stops; walking into grass and starting Auto-Grind fights wild battles at `10x`/`20x`, never leaves anchor patch, and stops reliably on target level, low HP, 0 PP, uncaught species, trainer battle, or level-up prompt. |
| **M4 — Undo Safety Net & Alerts** | Pre-autopilot + 4x 60s save-state ring buffer, Undo button, pause chime + Web Notifications, telemetry & event log | Clicking **Undo Auto-Pilot** restores exact pre-automation state; pausing fires audible chime + desktop notification and logs reason in HUD. |
| **M5 — Background Tab Polish & Deploy** | Background tab burst verification, Document PiP mini-view, GitHub Pages CI workflow | Grinding continues smoothly at `10x` while browser tab is backgrounded on desktop; static production build deploys cleanly via GitHub Actions. |

---

## 8. Key Technical Pitfalls to Watch For

1. **Big-endian Gen 1 stats:** `wPartyMon1HP`, `wPartyMon1MaxHP`, `wBattleMonHP`, `wBattleMonMaxHP`, and `wEnemyMonHP` are **16-bit big-endian** (`(hi << 8) | lo`), unlike the Game Boy CPU's little-endian instruction set.
2. **Stale party structs during combat:** `wPartyMon1HP` and `wPartyMon1PP` are not guaranteed to reflect turn-by-turn battle damage/PP usage until battle ends; always read `wBattleMonHP` (`0xD015`) and `wBattleMonPP` (`0xD02D`) while `wIsInBattle !== 0`.
3. **PP bitmasking:** Upper 2 bits of PP bytes store applied PP Ups. Always mask with `& 0x3F` before comparing against `0`.
4. **Gen 1 internal species IDs != National Pokédex numbers:** `wEnemyMonSpecies` (`0xCFE5`) holds internal index numbers (e.g., Rhydon = `0x01`, Bulbasaur = `0x99`). Map through a 256-entry table to National Dex `#1–151` before checking `wPokedexOwned` (`0xD2F7`).
5. **Move overwrite & evolution hazard:** Blindly mashing `A`/`B` after a level-up can overwrite a good move or cancel evolution. Pausing on lead level increment (and on battle stall `> 45s`) prevents silent save damage.
6. **Verify `WasmBoy` WRAM offsets first in M2:** Confirm how `GAMEBOY_INTERNAL_MEMORY_LOCATION` maps Game Boy `0xC000–0xDFFF` inside WASM linear memory using the live HUD in M2 before sending any automated button inputs.
7. **Zero copyrighted assets in repo:** Keep tests, fixtures, and build artifacts 100% free of ROMs, BIOS dumps, or Nintendo sprites; unit-test `AutoGrindFSM` using synthetic `GameStateSnapshot` objects.
