# retro-idle

Browser Game Boy, Game Boy Color, and Game Boy Advance emulator with built-in idle automation — play the fun parts, auto-grind the rest.

**Live demo:** <https://kssilveira.github.io/retro-idle/>

![Auto-Fight and automatic Heal Center demo](docs/autofight-demo.gif)

*Demo captured from the real `retro-idle` UI and [autofight.js](autofight.js) state machine using 100% original placeholder pixel art — no commercial ROM assets are included.*

## Features

- **Zero-build browser GB/GBC & GBA emulator** ([index.html](index.html)) powered by vendored MIT-licensed `binjgb` WASM (GB/GBC) and single-threaded MPL-2.0 `mGBA` WASM using its built-in open-source HLE BIOS (GBA).
- **ROM loading & auto-resume:** Load `.gb`, `.gbc`, or `.gba` files via file picker or full-page drag-and-drop. Your last ROM, auto-save state, and battery SRAM / Flash saves persist locally in `IndexedDB`.
- **Portable saves & states:** Manual **Save State** / **Load State**, plus **Export `.sav`** / **Import `.sav`** compatible with desktop emulators (32 KB GB/GBC SRAM and GBA SRAM / 128 KB Flash).
- **Emulator speed controls:** Switch between `1x`, `2x`, `4x`, `10x`, and `20x` speed via the UI buttons or number keys (`1`–`5`); audio automatically mutes above `1x`.
- **Default-muted audio:** Emulator audio starts muted by default (`Unmute` / `Mute` button in the main controls and Mini-Player, or `M` hotkey, persisted across refreshes).
- **Turbo A & Auto A:** Hold `C` (or the Touch Pad **TURBO A** button / Gamepad `Y`) to rapidly pulse `A` at any emulator speed while playing manually, or toggle **Auto A** (`V` / toolbar button / Mini-Player) for hands-free `A` mashing on any ROM — automatically stopping on **learning a move** or **fainting** in supported Pokémon games while continuing passive Heal Center trail recording.
- **Mobile & touch support:** Automatically displays multi-touch controls (thumb-slide D-Pad, B/A, holdable **TURBO A**, Start/Select, plus L/R shoulder buttons in GBA mode) on phones and tablets with responsive portrait & landscape handheld layouts, a manual **Touch Pad** toggle, mobile file-picker & touch audio unlock support, and Screen Wake Lock while playing.
- **Always-on-top Mini-Player:** Pop out an interactive Document Picture-in-Picture mini-player window on desktop Chrome/Edge with live Pause/Resume, Auto-Fight, Auto A, speed, and mute controls, Auto-Fight / Heal Center status, full keyboard input forwarding, and continuous background playback while the main tab is hidden.
- **Pokémon Red / Blue / Yellow / Crystal / Emerald Auto-Fight** ([autofight.js](autofight.js)):
  - Automatically enabled when a `POKEMON RED`, `POKEMON BLUE`, `POKEMON YELLOW`, Pokémon Crystal (`PM_CRYSTAL`), or English Pokémon Emerald (`POKEMON EMER` / `BPEE`) ROM is loaded.
  - Paces back and forth around your starting tile (rotating directions if blocked) and fights wild encounters by selecting `FIGHT` and your first attacking move with `PP > 0` (skipping non-damaging moves like Growl or False Swipe).
  - **Automatic Heal Center heal-and-return:** Passively records a loop-pruned path from the most recently visited Heal Center (shown live below the Auto-Fight status when visited and how many steps are active). When out of PP or low on HP (`<= 30%`), Auto-Fight flees wild battles, walks back to heal with the healer, returns to your grinding spot, and resumes fighting.
  - Automatically stops and releases all buttons on **out of PP or low HP without a visited Heal Center** (`missing Heal Center path`), **fainting** (`fainted`), **blocked path / one-way ledge** (prompting you to use a returnable path next time), **learning a move**, entering a **trainer battle** (or double/Safari/tutorial battle in Emerald), or **unexpected map change** (or when you press `Escape` or click **Stop Auto-Fight**).

## Controls

| Action | Input |
| :--- | :--- |
| D-Pad | `Arrow Keys` or `WASD` |
| A / B | `X` / `Z` |
| Turbo A (hold) | `C` or Touch `TURBO A` |
| Auto A (toggle) | `V` or `Auto A` button |
| L / R (GBA) | `Q` / `E` |
| Start / Select | `Enter` / `Shift` or `Tab` |
| Speed (1x–20x) | `1`–`5` |
| Mute / Unmute | `M` |
| Stop Auto-Fight / Auto A | `Escape` |
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

## Copyright Notice

- **No copyrighted ROMs, BIOS dumps, or game assets are included.** Bring your own legally obtained `.gb`, `.gbc`, or `.gba` ROMs (GBA runs on `mGBA`'s built-in open-source HLE BIOS); everything runs 100% client-side in your browser.
- **Not affiliated with or endorsed by Nintendo, Creatures, or Game Freak.** Game Boy, Game Boy Color, Game Boy Advance, and Pokémon are trademarks of their respective owners and are mentioned solely to describe compatibility.
