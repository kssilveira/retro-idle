# `retro-idle` Video Recording Helper

Reusable Chrome CDP capture script for recording Auto-Fight heal loops across **Pokémon Red**, **Pokémon Yellow**, **Pokémon Crystal**, and **Pokémon Emerald**.

> [!IMPORTANT]
> Keep all personal ROMs and raw `.mp4` gameplay captures **outside** this repository (defaults use `~/Downloads/roms/` and `~/Downloads/retro-idle-recordings/`).

## Record All 4 Games (`record-autofight.mjs`)

1. Start the local server and Chrome with CDP debugging:
   ```bash
   ./serve.sh
   ./open-chrome.sh
   ```
2. Prepare your 4 manual save states in the browser (each positioned outside a Heal Center so Auto-Fight can demonstrate a full heal-and-return loop).
3. Run the CDP recorder:
   ```bash
   node video/record-autofight.mjs
   ```
   Optional flags:
   - `--roms-dir <dir>` (default: `~/Downloads/roms`)
   - `--out-dir <dir>` (default: `~/Downloads/retro-idle-recordings`)
   - `--cdp-port <port>` (default: `9222`)
   - `--url <url>` (default: `http://127.0.0.1:8000`)
   - Positional slugs to record a subset: `01-pokemon-red`, `02-pokemon-yellow`, `03-pokemon-crystal`, `04-pokemon-emerald`
