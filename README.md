# retro-idle

Browser Game Boy / Game Boy Color emulator with built-in idle automation — play the fun parts, auto-grind the rest.

**Live demo:** <https://kssilveira.github.io/retro-idle/>

## Features

- **Zero-build browser GB/GBC emulator** ([index.html](index.html)) powered by vendored MIT-licensed `binjgb` WASM.
- **ROM loading & auto-resume:** Load `.gb` / `.gbc` files via file picker, full-page drag-and-drop, or `?rom=<url>`. Your last ROM, auto-save state, and battery SRAM persist locally in `IndexedDB`.
- **Portable saves & states:** Manual **Save State** / **Load State**, plus **Export `.sav`** / **Import `.sav`** compatible with desktop emulators.
- **Emulator speed controls:** Switch between `1x`, `2x`, `4x`, `10x`, and `20x` speed via the UI buttons or number keys (`1`–`5`); audio automatically mutes above `1x`.
- **Pokémon Red / Blue Auto-Fight** ([autofight.js](autofight.js)):
  - Automatically enabled when a `POKEMON RED` or `POKEMON BLUE` ROM is loaded.
  - Paces back and forth around your starting tile (rotating directions if blocked) and fights wild encounters by selecting `FIGHT` and your first attacking move with `PP > 0` (skipping non-damaging moves like Growl).
  - Automatically stops and releases all buttons when **out of PP**, **fainted**, **learning a move**, entering a **trainer battle**, or **changing maps** (or when you press `Escape` or click **Stop Auto-Fight**).

## Controls

| Action | Input |
| :--- | :--- |
| D-Pad | `Arrow Keys` or `WASD` |
| A / B | `X` / `Z` |
| Start / Select | `Enter` / `Shift` or `Tab` |
| Speed (1x–20x) | `1`–`5` |
| Stop Auto-Fight | `Escape` |
| Gamepad | Standard Gamepad API mapping |

## Run Locally & Test

Requires `python3`, `node` (v24+), and `google-chrome` (for browser verification):

```bash
# Serve at http://127.0.0.1:8000/
./serve.sh

# Optional: launch Chrome with CDP debugging on port 9222
./open-chrome.sh

# Run Auto-Fight unit tests
node --test tests/autofight.test.mjs

# Run end-to-end headless Chrome emulator verification
node tests/verify.mjs
```

## Roadmap & Copyright Notice

- See [docs/stage-1-plan.md](docs/stage-1-plan.md) for the Stage 1 roadmap (live telemetry HUD, configurable stop rules, background Web Worker turbo mode, Undo ring buffer, and alerts).
- **No copyrighted ROMs, BIOS dumps, or game assets are included.** Bring your own legally obtained `.gb` / `.gbc` ROMs; everything runs 100% client-side in your browser.
