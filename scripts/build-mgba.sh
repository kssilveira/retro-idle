#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EMSDK_DIR="${EMSDK_DIR:-/tmp/emsdk}"
MGBA_SRC="${MGBA_SRC:-/tmp/mgba-src}"
BUILD_DIR="${BUILD_DIR:-/tmp/mgba-build}"
OUT_DIR="$REPO_DIR/vendor/mgba"

if [ ! -f "$EMSDK_DIR/emsdk_env.sh" ]; then
  echo "Missing emsdk at $EMSDK_DIR" >&2
  exit 1
fi
if [ ! -f "$MGBA_SRC/CMakeLists.txt" ]; then
  echo "Missing mGBA sources at $MGBA_SRC" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh" >/dev/null

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$OUT_DIR"

cp "$MGBA_SRC/LICENSE" "$OUT_DIR/LICENSE"

emcmake cmake -S "$MGBA_SRC" -B "$BUILD_DIR" \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DCMAKE_BUILD_TYPE=Release \
  -DM_CORE_GBA=ON \
  -DM_CORE_GB=OFF \
  -DBUILD_STATIC=ON \
  -DBUILD_SHARED=OFF \
  -DBUILD_QT=OFF \
  -DBUILD_SDL=OFF \
  -DBUILD_GL=OFF \
  -DBUILD_GLES2=OFF \
  -DBUILD_GLES3=OFF \
  -DBUILD_LIBRETRO=OFF \
  -DBUILD_OPENEMU=OFF \
  -DBUILD_PERF=OFF \
  -DBUILD_TEST=OFF \
  -DBUILD_SUITE=OFF \
  -DBUILD_CINEMA=OFF \
  -DBUILD_ROM_TEST=OFF \
  -DBUILD_EXAMPLE=OFF \
  -DBUILD_PYTHON=OFF \
  -DBUILD_LTO=OFF \
  -DUSE_ZLIB=OFF \
  -DUSE_PNG=OFF \
  -DUSE_FFMPEG=OFF \
  -DUSE_SQLITE3=OFF \
  -DUSE_LIBZIP=OFF \
  -DUSE_LZMA=OFF \
  -DUSE_ELF=OFF \
  -DUSE_GDB_STUB=OFF \
  -DUSE_DEBUGGERS=OFF \
  -DUSE_EDITLINE=OFF \
  -DUSE_DISCORD_RPC=OFF \
  -DUSE_LUA=OFF \
  -DENABLE_SCRIPTING=OFF \
  -DDISABLE_THREADING=ON \
  -DMINIMAL_CORE=2 \
  -DHAVE_PTHREAD=OFF \
  -DHAVE_PTHREAD_H=OFF \
  -DHAVE_PTHREAD_CREATE=OFF \
  -DCMAKE_C_FLAGS="-O3 -D_GNU_SOURCE -DDISABLE_THREADING -DMINIMAL_CORE=2 -DDISABLE_ANON_MMAP"

# Strip any pthread flags if CMake probed host headers anyway
if grep -rn "pthread" "$BUILD_DIR/CMakeFiles" >/dev/null 2>&1; then
  echo "WARNING: pthread reference found in CMakeFiles; inspecting..."
  grep -rn "pthread" "$BUILD_DIR/CMakeFiles" | head -n 20 || true
fi

cmake --build "$BUILD_DIR" --target mgba -j"$(nproc 2>/dev/null || echo 4)"

LIBMGBA_A="$(find "$BUILD_DIR" -maxdepth 2 -name 'libmgba.a' | head -n 1)"
if [ -z "$LIBMGBA_A" ]; then
  echo "libmgba.a not found in $BUILD_DIR" >&2
  exit 1
fi

emcc -O3 \
  -DDISABLE_THREADING -DMINIMAL_CORE=2 -DM_CORE_GBA -DDISABLE_ANON_MMAP \
  -I"$MGBA_SRC/include" \
  -I"$BUILD_DIR/include" \
  -I"$MGBA_SRC/src" \
  "$OUT_DIR/wrapper.c" \
  "$LIBMGBA_A" \
  -lm \
  -s EXPORT_ES6=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createMgba \
  -s ENVIRONMENT=web \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=67108864 \
  -s EXPORTED_FUNCTIONS='["_malloc","_free","_gba_create","_gba_destroy","_gba_run_frame","_gba_set_keys","_gba_get_frame_buffer","_gba_get_audio_buffer","_gba_get_frame_count","_gba_get_state_size","_gba_save_state","_gba_load_state","_gba_get_save_size","_gba_read_save","_gba_was_save_updated","_gba_read8","_gba_read16","_gba_read32","_gba_write8","_gba_write16","_gba_write32"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAP8","HEAPU8","HEAP16","HEAPU32"]' \
  -o "$OUT_DIR/mgba.js"

echo "Built $OUT_DIR/mgba.js and $OUT_DIR/mgba.wasm:"
ls -lh "$OUT_DIR/mgba.js" "$OUT_DIR/mgba.wasm"
if grep -E "SharedArrayBuffer|pthread|PThread" "$OUT_DIR/mgba.js" >/dev/null 2>&1; then
  echo "ERROR: Unexpected SharedArrayBuffer/pthread reference in mgba.js" >&2
  exit 1
fi
echo "Verified zero SharedArrayBuffer/pthread references in mgba.js"
