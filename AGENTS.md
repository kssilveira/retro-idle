# AGENTS.md — Handoff Context for `retro-idle`

## 1. Current Repository State (commit `24e2732`)
- **Zero-build playable browser prototype** in [index.html](index.html) powered by vendored MIT-licensed `binjgb` WASM ([vendor/binjgb/](vendor/binjgb/)):
  - `vendor/binjgb/binjgb.js` (`13,029` bytes)
  - `vendor/binjgb/binjgb.wasm` (`88,652` bytes)
  - `vendor/binjgb/LICENSE` (MIT)
- **Implemented features in `index.html`:**
  - `.gb` / `.gbc` file picker (`#rom-input`) and full-page drag-and-drop (`loadRom`), plus `?rom=<url>` support. (`.zip` files are rejected with a clear unzip prompt.)
  - Last-ROM persistence in `IndexedDB` so refreshing or reopening auto-boots the previous ROM.
  - Keyboard (`Arrow Keys` / `WASD`, `X` = A, `Z` = B, `Enter` = Start, `Shift` / `Tab` = Select) + Gamepad API input.
  - Transport controls: **Pause/Resume** (`#toggle-play`), **Reset** (`#reset-btn`), **Save State** (`#save-state-btn`), **Load State** (`#load-state-btn`), **Export `.sav`** (`#export-sav-btn`), and **Import `.sav`** (`#import-sav-btn` + `#sav-input`).
  - Automatic unload/tab-hide state snapshot and auto-resume on ROM load (`— resumed auto-save`).
  - Debounced (`500 ms`) + pause/unload battery SRAM flushing via `_emulator_was_ext_ram_updated`.
  - Debug hook: `window.__retroIdle = { getEmulator: () => emu, loadRom }` (`emu.readMem(addr)` reads live Game Boy memory).
- **Helper scripts:**
  - [serve.sh](serve.sh) — serves repo root on `http://127.0.0.1:${1:-8000}/` via `python3 -m http.server`.
  - [open-chrome.sh](open-chrome.sh) — launches `google-chrome` with `--remote-debugging-port=${2:-9222}` and persistent profile `${XDG_CACHE_HOME:-$HOME/.cache}/retro-idle-chrome`.
- **GitHub Pages deployment:** Empty [.nojekyll](.nojekyll) at repo root serves static files directly from `main` (`/ (root)`) at `https://kssilveira.github.io/retro-idle/` without Jekyll processing. Keep asset paths in `index.html` relative (`./vendor/binjgb/...`) for subpath hosting; `IndexedDB` (`retro-idle`) and `localStorage` (`retro-idle:unload`) are already namespaced for the shared `kssilveira.github.io` origin, and `binjgb` requires no COOP/COEP headers.
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

---

## 4. Client-Side Storage Schema
- **`IndexedDB` database `'retro-idle'` (v1, object store `'kv'`):**
  - `'lastRom'` → `{ bytes: Uint8Array, name: string, savedAt: number }`
  - `` `sram:${romId}` `` → `Uint8Array` (where `romId` = 8-hex-char CRC32 of ROM bytes)
  - `` `autoState:${romId}` `` → `Uint8Array`
  - `` `manualState:${romId}` `` → `Uint8Array`
- **`localStorage['retro-idle:unload']`:** JSON `{ romId, state, sram }` (base64 strings).
- Both **Reset** and **Import `.sav`** (`rebootWithSram`) delete `autoState:${currentRomId}` and clear any matching `localStorage['retro-idle:unload']` entry so reloading does not revert to pre-reset/pre-import state.

---

## 5. Environment, Testing & Copyright Boundaries
- **Installed tools:** `node v24.21.0` (has native `fetch` and `WebSocket`), `python3`, `google-chrome` (`158.0.8127.36`). **No `npm` or `npx` is on `PATH`**, so `/browser` Chrome DevTools MCP cannot launch; use `./open-chrome.sh` + a Node 24 CDP WebSocket client on `http://127.0.0.1:9222` to inspect live tabs or run headless verification.
- **Copyright rule:** **Never** download, search for, link to, or commit copyrighted commercial ROMs, BIOS dumps, or Nintendo assets (keep personal ROMs strictly outside the repo, e.g. `~/Downloads/roms/`).
- **Regression test suite:** End-to-end verification lives in [tests/](tests/), with generated test artifacts written under gitignored `tests/.tmp/` (plus `*.gb`, `*.gbc`, `*.sav` in [.gitignore](.gitignore)):
  - [tests/make-test-rom.mjs](tests/make-test-rom.mjs) → builds a clean 64 KB `MBC3 + RAM + BATTERY` (`0x13`) test ROM with 32 KB SRAM and a non-copyrighted `0xe06c8834` shift-XOR header check.
  - [tests/verify.mjs](tests/verify.mjs) → runs end-to-end CDP Chrome checks (MBC3 banking, SRAM, animation, `KeyX` input, `.sav` export/import, 5× Load State, Pause/Save/Load, zero-click `Page.reload()`, Reset, and zero console/log errors). Run with `node tests/verify.mjs`.

---

## 6. Next Steps (per `docs/stage-1-plan.md`)
- Bootstrap a package manager (`npm`/`pnpm`) when ready to migrate to Vite + TypeScript; when adding a build step, set `base: '/retro-idle/'` in `vite.config.ts` and switch GitHub Pages to a GitHub Actions workflow deploying `dist/`.
- **M2 — ROM Profile & Live WRAM HUD:** Add `pokered` CRC32 identification + live WRAM polling via `emu.readMem(addr)` (note big-endian Gen 1 HP values, `wBattleMon*` vs `wPartyMon1*`, `& 0x3F` PP bitmask, and internal species ID → National Dex mapping).
- **M3–M5 — Auto-Grind FSM, Undo Ring Buffer, Background Worker & Alerts:** Extract `BinjgbEmulator` into `EmulatorCore` (`src/core/emulator.ts`) inside a Web Worker for throttled background tabs (`1x`–`20x`), implement pure TS `AutoGrindFSM`, rolling save-state ring buffer, and PiP/notifications.
