# AGENTS.md — Handoff Context for `retro-idle`

## 1. Current Repository State (commit `ea16740`)
- **Zero-build playable browser prototype** in [index.html](index.html) + [autofight.js](autofight.js) powered by vendored MIT-licensed `binjgb` WASM ([vendor/binjgb/](vendor/binjgb/)):
  - `vendor/binjgb/binjgb.js` (`13,029` bytes)
  - `vendor/binjgb/binjgb.wasm` (`88,652` bytes)
  - `vendor/binjgb/LICENSE` (MIT)
- **Implemented features in `index.html` and `autofight.js`:**
  - `.gb` / `.gbc` file picker (`#rom-input`) and full-page drag-and-drop (`loadRom`), plus `?rom=<url>` support. (`.zip` files are rejected with a clear unzip prompt.)
  - Last-ROM persistence in `IndexedDB` so refreshing or reopening auto-boots the previous ROM.
  - Keyboard (`Arrow Keys` / `WASD`, `X` = A, `Z` = B, `Enter` = Start, `Shift` / `Tab` = Select) + Gamepad API input.
  - Transport controls: **Pause/Resume** (`#toggle-play`), **Reset** (`#reset-btn`), **Save State** (`#save-state-btn`), **Load State** (`#load-state-btn`), **Export `.sav`** (`#export-sav-btn`), and **Import `.sav`** (`#import-sav-btn` + `#sav-input`).
  - **Emulator speed controls** (`#speed-controls`, `.speed-btn` for `1x` / `2x` / `4x` / `10x` / `20x`): hotkeys `Digit1`–`Digit5` / `Numpad1`–`Numpad5`, audio muted above `1x`, `MAX_TURBO_STEP_MS = 12` frame budget, and speed persists across Reset.
  - **Pokémon Red/Blue Auto-Fight** (`#auto-fight-btn`, `#auto-fight-status`, `#pokecenter-status`, [autofight.js](autofight.js)):
    - Auto-enabled for `POKEMON RED` / `POKEMON BLUE` ROM headers (`isPokemonRedBlueTitle`); stopped via `#auto-fight-btn`, `Escape`, Pause, Reset, Load State, Import `.sav`, Load ROM, or `visibilitychange` (`hidden`).
    - `#auto-fight-status` (`.error` styling on error/milestone stops) and `#pokecenter-status` (`.linked` highlight when a PokéCenter is visited or a return path is active) are kept separate from `#status` so `tests/verify.mjs` status assertions remain untouched.
    - Per-GB-frame `onFrame` (`onEmulatorFrame`) hook inside `BinjgbEmulator.stepFrame` (`EVENT_NEW_FRAME`) + `setOverrideButtons(btns)`: runs `stepAutoFight()` when active, or passively calls `autoFight.observe(readPokemonRedOverworldPos(...))` when inactive to track a loop-pruned breadcrumb trail from the most recently visited PokéCenter (`POKECENTER_CONFIGS`: all 11 standard Kanto PokéCenters + Indigo Plateau Lobby `0xae`).
    - Live Gen 1 WRAM + `wTileMap` (`0xC3A0`) snapshot (`readPokemonRedSnapshot`): 2-tile tethered overworld pacing (auto-rotates `right → left → up → down` when blocked, re-anchors if stuck returning) and wild battle navigation (`FIGHT` → first attack slot with `PP > 0` skipping `NON_ATTACK_MOVES` like Growl).
    - **Out-of-PP round-trip heal & return:** When a PokéCenter path is active for the current map and attack PP hits `0`, Auto-Fight enters `fleeing` (backs out of Move Selection with `B`, navigates to `RUN`) → `returning` (retraces the pruned trail + cross-map `exitDir`, fleeing any ambushes) → `healing` (`to_nurse` → `talking_nurse` → `closing_dialogue` → `exiting`) → `walking_back` (replays the trail + `enterDir`) → resumes `moving`.
    - **Safety & error stops (neutral buttons):** `out of PP (missing PokéCenter path — visit a PokéCenter first)` when no PokéCenter path exists for the current map, one-way/obstacle blocks (`45` stuck frames on `oneWay`-flagged segments, `240` frames on unflagged obstacles), plus `fainted`, `learning a move` (textbox regex `/\blearn|trying to|Delete an|forgotten/` or party move-list diff), `trainer battle`, and `map changed`.
  - Automatic unload/tab-hide state snapshot and auto-resume on ROM load (`— resumed auto-save`).
  - Debounced (`500 ms`) + pause/unload battery SRAM flushing via `_emulator_was_ext_ram_updated`.
  - Debug hook: `window.__retroIdle = { getEmulator: () => emu, loadRom, getSpeed: () => currentSpeed, setSpeed, getAutoFight: () => ({ ...autoFight.getState(), start, stop, clearTrail, snapshot }) }` where `autoFight.getState()` exposes `pokeCenterName`, `inPokeCenter`, `hasHealPath`, and `trailLength` (`emu.readMem(addr)` reads live Game Boy memory).
- **Helper scripts:**
  - [serve.sh](serve.sh) — serves repo root on `http://127.0.0.1:${1:-8000}/` via `python3 -m http.server`.
  - [open-chrome.sh](open-chrome.sh) — launches `google-chrome` with `--remote-debugging-port=${2:-9222}` and persistent profile `${XDG_CACHE_HOME:-$HOME/.cache}/retro-idle-chrome`.
- **GitHub Pages deployment:** Empty [.nojekyll](.nojekyll) at repo root serves static files directly from `main` (`/ (root)`) at `https://kssilveira.github.io/retro-idle/` without Jekyll processing. Keep module/asset paths in `index.html` relative (`./autofight.js`, `./vendor/binjgb/...`) for subpath hosting; `IndexedDB` (`retro-idle`) and `localStorage` (`retro-idle:unload`) are already namespaced for the shared `kssilveira.github.io` origin, and `binjgb` requires no COOP/COEP headers.
- **Roadmap:** See [docs/stage-1-plan.md](docs/stage-1-plan.md).

---

## 2. Core Choice: Why `binjgb` Replaced `wasmboy`
[docs/stage-1-plan.md](docs/stage-1-plan.md#L64-L65) originally listed `wasmboy` first and `binjgb` as the fallback. We switched to **`binjgb`** after verifying upstream bugs in `wasmboy@0.7.1` (still present on `wasmboy` `master`):
1. **5 copy-paste `loadState()` slot bugs in `wasmboy` WASM** (`Channel1.cycleCounter`, `Channel2.cycleCounter`, `Graphics.scanlineRegister`, `Channel3.cycleCounter`, `Channel4.cycleCounter` passed as the slot index to `getSaveStateMemoryOffset(offset, slot)` instead of `saveStateSlot`). The 1st load state corrupts fields with unintended memory; the 2nd load state traps with `RuntimeError: memory access out of bounds` and drops worker messages.
2. **`WasmBoyMemory.loadState()` raw `ArrayBuffer` bug** leaving `cartridgeRam`/`gameboyMemory`/`paletteMemory`/`internalState` unwrapped until the next frame.
3. **`binjgb` advantages:** Flat single-buffer state (`_emulator_write_state` / `_emulator_read_state`) and SRAM (`_emulator_write_ext_ram` / `_emulator_read_ext_ram`), built-in dirty SRAM flag (`_emulator_was_ext_ram_updated`), direct `_emulator_read_mem(e, addr)`, and zero runtime binary patching.

---

## 3. `binjgb` & Browser Pitfalls Already Solved
- **Joypad callback registration:** `_emulator_new_simple()` does **not** bind joypad polling on its own. You **must** allocate `_joypad_new()` and call `_emulator_set_default_joypad_callback(e, joypadPtr)`, then `_joypad_delete(joypadPtr)` in `destroy()`.
- **Static C button state:** `wrapper.c` stores `s_buttons` in a static global, so `BinjgbEmulator` explicitly zeroes all 8 buttons via `_set_joyp_*(e, 0)` on construction.
- **`FileData*` memory management:** `_file_data_delete(ptr)` only frees `file_data->data`; always also call `_free(ptr)` (`withFileData`).
- **Dynamic WASM heap views:** Always construct `new Uint8Array(module.HEAP8.buffer, ptr, size)` inside `withFileData`, `renderFrame`, and `pushAudio` instead of caching views across `_malloc` calls.
- **32 KB ROM alignment:** Align ROM allocation size up to `0x8000` (`(len + 0x7fff) & ~0x7fff`) and zero-pad before `_emulator_new_simple`.
- **Unload persistence without permissions-policy errors:** Chrome blocks `unload` listeners (`Permissions policy violation: unload is not allowed in this document`). Use `pagehide`, `beforeunload`, and `visibilitychange` (`hidden`) to write base64 snapshots synchronously to `localStorage`, then commit into `IndexedDB` on next load (`consumePendingUnload`).
- **Keyboard focus trap & shortcut safety:** Call `blur()` after file inputs and button clicks so `INPUT_TAGS` checks don't block Game Boy keys; ignore `ctrlKey || altKey || metaKey` (not `shiftKey`, which is `Select`) so `Ctrl+R` / `F5` / DevTools continue to work.
- **Headless / non-gesture audio:** Skip pushing audio buffers while `audioCtx.state !== 'running'` and safely `resume()` on user gestures (`pointerdown`, `keydown`, clicks).
- **Stale Gen 1 menu WRAM:** `wTopMenuItemY`/`wCurrentMenuItem` remain populated outside menus, so menu detection is gated on live `wTileMap` (`0xC3A0`) text (`FIGHT`+`RUN`, `TYPE`) and rendered cursor `0xED` (`▶`, move slots starting at row `13`), returning neutral on the first frame of `MoveSelectionMenu` before `0xED` draws.
- **Stale `wBattleMon` on battle entry:** `wBattleMonHP`/`wBattleMonPP` hold prior-battle or zero values until `SendOutMon` runs during the wild battle intro; `battleMonReady` guards battle faint/PP checks.
- **Refresh-rate-independent FSM ticks:** Drive automation from `EVENT_NEW_FRAME` rather than `requestAnimationFrame` so pulse/cooldown timings stay locked to Game Boy VBlank frames on 120/144 Hz monitors.
- **Gen 1 `WarpFound2` fade-out timing & transient OOB coords:** `wCurMap` (`0xD35E`) changes ~24–30 VBlank frames before `LoadMapData` updates `wXCoord` (`0xD362`), `wYCoord` (`0xD361`), and `wCurMapTileset` (`0xD367`), and `CheckMapConnections` can transiently emit `0xFF`/OOB coords. `observe()` ignores OOB coords, waits for `tileset` change on PokéCenter exit, and snaps stale warp coords within `WARP_SNAP_GRACE_FRAMES` (`60`) rather than clearing the trail; `stepHealing` also gates PokéCenter entry/exit on `cfg.tileset`.
- **PokéCenter interior navigation, dialogue loop & `BIT_LEDGE_OR_FISHING`:** `to_nurse` aligns `x` before `y` to avoid static NPCs at `(4, 3)` (Viridian/Cerulean/Mt. Moon); after `HealParty` restores HP/PP, `talking_nurse` immediately switches from `A` to alternating `B` + `Down` (`closing_dialogue`) until `y > standY` so Nurse Joy is never re-triggered; `oneWay` is only flagged when `(x, y)` changes so stationary fishing (`wMovementFlags` `0xD736` bit `0x40`) never causes false positives.

---

## 4. Client-Side Storage Schema
- **`IndexedDB` database `'retro-idle'` (v1, object store `'kv'`):**
  - `'lastRom'` → `{ bytes: Uint8Array, name: string, savedAt: number }`
  - `` `sram:${romId}` `` → `Uint8Array` (where `romId` = 8-hex-char CRC32 of ROM bytes)
  - `` `autoState:${romId}` `` → `Uint8Array`
  - `` `manualState:${romId}` `` → `Uint8Array`
  - `` `pokeTrail:${romId}` `` → `{ pokeCenterMap, trail }`
- **`localStorage['retro-idle:unload']`:** JSON `{ romId, state, sram, pokeTrail }` (`state` and `sram` are base64 strings; `pokeTrail` is `{ pokeCenterMap, trail } | null`).
- Both **Reset** and **Import `.sav`** (`rebootWithSram`) delete `autoState:${currentRomId}` and `pokeTrail:${currentRomId}` and clear any matching `localStorage['retro-idle:unload']` entry so reloading does not revert to pre-reset/pre-import state. `pokeTrail:${currentRomId}` is only imported back in `loadRom` when `autoState` restores, and Load State clears the active in-memory trail.

---

## 5. Environment, Testing & Copyright Boundaries
- **Installed tools:** `node v24.21.0` (has native `fetch` and `WebSocket`), `python3`, `google-chrome` (`158.0.8127.36`). **No `npm` or `npx` is on `PATH`**, so `/browser` Chrome DevTools MCP cannot launch; use `./open-chrome.sh` + a Node 24 CDP WebSocket client on `http://127.0.0.1:9222` to inspect live tabs or run headless verification.
- **Copyright rule:** **Never** download, search for, link to, or commit copyrighted commercial ROMs, BIOS dumps, or Nintendo assets (keep personal ROMs strictly outside the repo, e.g. `~/Downloads/roms/`).
- **Regression & unit test suite:** Tests live in [tests/](tests/), with generated test artifacts written under gitignored `tests/.tmp/` (plus `*.gb`, `*.gbc`, `*.sav` in [.gitignore](.gitignore)):
  - [tests/autofight.test.mjs](tests/autofight.test.mjs) → 14 unit tests for Pokémon Red/Blue Auto-Fight (`pickAttackSlot`, 2-tile pacing/rotation, battle menu & move navigation, passive PokéCenter trail tracking/loop pruning, warp fade-out & transient `0xFF`/OOB resilience, full out-of-PP heal-and-return round-trip, one-way/obstacle block stops, missing-PokéCenter error stop, `exportTrail`/`importTrail`, and `fainted` / `learning a move` / `trainer battle` / `map changed` stops). Run with `node --test tests/autofight.test.mjs`.
  - [tests/make-test-rom.mjs](tests/make-test-rom.mjs) → builds a clean 64 KB `MBC3 + RAM + BATTERY` (`0x13`) test ROM with 32 KB SRAM and a non-copyrighted `0xe06c8834` shift-XOR header check.
  - [tests/verify.mjs](tests/verify.mjs) → runs end-to-end CDP Chrome checks (MBC3 banking, SRAM, animation, `KeyX` input, `.sav` export/import, 5× Load State, Pause/Save/Load, zero-click `Page.reload()`, Reset, `1x`/`4x`/`10x` speed controls, `Digit1`/`Digit4` hotkeys, Reset speed persistence, and zero console/log errors). Run with `node tests/verify.mjs`.

---

## 6. Next Steps (per `docs/stage-1-plan.md`)
- Basic Pokémon Red/Blue WRAM reading, `1x`–`20x` speed controls, and Auto-Fight with automatic PokéCenter heal-and-return (tethered pacing, wild battle attacking, passive breadcrumb tracking, Nurse Joy round-trip healing, and safety/error stops) are now implemented in [index.html](index.html) and [autofight.js](autofight.js).
- Bootstrap a package manager (`npm`/`pnpm`) when ready to migrate to Vite + TypeScript; when adding a build step, set `base: '/retro-idle/'` in `vite.config.ts` and switch GitHub Pages to a GitHub Actions workflow deploying `dist/`.
- **M2/M3 polish — Live WRAM Telemetry HUD & Configurable Stops:** Surface lead level, HP/MaxHP, PP, species, and configurable stop conditions (target level, min HP%, uncaught/target species via internal-ID → National Dex mapping) plus generic macro fallback for non-Pokémon ROMs.
- **M3–M5 — Background Worker Turbo, Undo Ring Buffer & Alerts:** Extract `BinjgbEmulator` into `EmulatorCore` (`src/core/emulator.ts`) inside a Web Worker for throttled background tabs (`1x`–`20x`), add a rolling save-state ring buffer for one-click Undo Auto-Pilot, and add Document PiP / Web Notifications.
