/**
 * Minimal single-threaded Emscripten C wrapper for libmgba (GBA core, HLE BIOS only).
 * Built without pthreads/SharedArrayBuffer via scripts/build-mgba.sh.
 */
#include <stdarg.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#include <emscripten/emscripten.h>

#include <mgba/core/blip_buf.h>
#include <mgba/core/config.h>
#include <mgba/core/core.h>
#include <mgba/core/interface.h>
#include <mgba/core/log.h>
#include <mgba/gba/core.h>
#include <mgba/internal/defines.h>
#include <mgba/internal/gba/audio.h>
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/savedata.h>
#include <mgba-util/vfs.h>

#define GBA_WIDTH 240
#define GBA_HEIGHT 160
#define GBA_MAX_AUDIO_FRAMES 4096

static struct mLogger s_quietLogger;
static int s_loggerRegistered = 0;

static void _noopLog(struct mLogger* logger, int category, enum mLogLevel level, const char* format, va_list args) {
	(void) logger;
	(void) category;
	(void) level;
	(void) format;
	(void) args;
}

typedef struct {
	struct mCore* core;
	uint8_t* romCopy;
	size_t romSize;
	uint32_t frameBuf[GBA_WIDTH * GBA_HEIGHT];
	int16_t audioBuf[GBA_MAX_AUDIO_FRAMES * 2];
	int sampleRate;
	int saveDirty;
	int lastDirty;
	struct mCoreCallbacks callbacks;
} GbaContext;

static void _onSavedataUpdated(void* context) {
	GbaContext* ctx = (GbaContext*) context;
	if (ctx) {
		ctx->saveDirty = 1;
	}
}

EMSCRIPTEN_KEEPALIVE
void gba_destroy(GbaContext* ctx) {
	if (!ctx) {
		return;
	}
	if (ctx->core) {
		ctx->core->clearCoreCallbacks(ctx->core);
		mCoreConfigDeinit(&ctx->core->config);
		ctx->core->deinit(ctx->core);
		ctx->core = NULL;
	}
	free(ctx->romCopy);
	ctx->romCopy = NULL;
	free(ctx);
}

EMSCRIPTEN_KEEPALIVE
GbaContext* gba_create(const uint8_t* romData, size_t romSize, const uint8_t* saveData, size_t saveSize, int sampleRate) {
	if (!romData || romSize < 0xC0) {
		return NULL;
	}
	if (!s_loggerRegistered) {
		s_quietLogger.log = _noopLog;
		s_quietLogger.filter = NULL;
		mLogSetDefaultLogger(&s_quietLogger);
		s_loggerRegistered = 1;
	}

	GbaContext* ctx = (GbaContext*) calloc(1, sizeof(GbaContext));
	if (!ctx) {
		return NULL;
	}
	ctx->sampleRate = sampleRate > 0 ? sampleRate : 44100;

	struct mCore* core = GBACoreCreate();
	if (!core) {
		free(ctx);
		return NULL;
	}
	if (!core->init(core)) {
		free(core);
		free(ctx);
		return NULL;
	}
	ctx->core = core;

	mCoreInitConfig(core, NULL);
	struct mCoreOptions opts = {0};
	opts.useBios = false;
	opts.skipBios = true;
	opts.audioBuffers = 2048;
	opts.sampleRate = (unsigned) ctx->sampleRate;
	opts.volume = GBA_AUDIO_VOLUME_MAX;
	opts.mute = false;
	mCoreConfigLoadDefaults(&core->config, &opts);
	mCoreLoadConfig(core);

	core->setVideoBuffer(core, (color_t*) ctx->frameBuf, GBA_WIDTH);
	core->setAudioBufferSize(core, 2048);

	ctx->romCopy = (uint8_t*) malloc(romSize);
	if (!ctx->romCopy) {
		gba_destroy(ctx);
		return NULL;
	}
	memcpy(ctx->romCopy, romData, romSize);
	ctx->romSize = romSize;

	struct VFile* romVf = VFileFromConstMemory(ctx->romCopy, romSize);
	if (!romVf || !core->loadROM(core, romVf)) {
		if (romVf) {
			romVf->close(romVf);
		}
		gba_destroy(ctx);
		return NULL;
	}

	struct VFile* saveVf = VFileMemChunk(saveSize > 0 ? saveData : NULL, saveSize);
	if (!saveVf || !core->loadSave(core, saveVf)) {
		if (saveVf) {
			saveVf->close(saveVf);
		}
		gba_destroy(ctx);
		return NULL;
	}

	ctx->callbacks.context = ctx;
	ctx->callbacks.savedataUpdated = _onSavedataUpdated;
	core->addCoreCallbacks(core, &ctx->callbacks);

	core->reset(core);

	blip_t* left = core->getAudioChannel(core, 0);
	blip_t* right = core->getAudioChannel(core, 1);
	if (left) {
		blip_set_rates(left, core->frequency(core), ctx->sampleRate);
	}
	if (right) {
		blip_set_rates(right, core->frequency(core), ctx->sampleRate);
	}

	return ctx;
}

EMSCRIPTEN_KEEPALIVE
int gba_run_frame(GbaContext* ctx) {
	if (!ctx || !ctx->core) {
		return 0;
	}
	ctx->core->runFrame(ctx->core);

	for (int i = 0; i < GBA_WIDTH * GBA_HEIGHT; i++) {
		ctx->frameBuf[i] |= 0xFF000000u;
	}

	struct GBA* gba = (struct GBA*) ctx->core->board;
	if (gba) {
		int dirty = gba->memory.savedata.dirty;
		if (dirty != 0 && ctx->lastDirty == 0) {
			ctx->saveDirty = 1;
		}
		ctx->lastDirty = dirty;
	}

	blip_t* left = ctx->core->getAudioChannel(ctx->core, 0);
	blip_t* right = ctx->core->getAudioChannel(ctx->core, 1);
	if (!left || !right) {
		return 0;
	}

	int avail = blip_samples_avail(left);
	int availR = blip_samples_avail(right);
	if (availR < avail) {
		avail = availR;
	}
	if (avail > GBA_MAX_AUDIO_FRAMES) {
		avail = GBA_MAX_AUDIO_FRAMES;
	}
	if (avail > 0) {
		blip_read_samples(left, ctx->audioBuf, avail, 1);
		blip_read_samples(right, ctx->audioBuf + 1, avail, 1);
		while (blip_samples_avail(left) > 0 && blip_samples_avail(right) > 0) {
			int16_t trash[256 * 2];
			int extra = blip_samples_avail(left);
			int extraR = blip_samples_avail(right);
			if (extraR < extra) {
				extra = extraR;
			}
			if (extra > 256) {
				extra = 256;
			}
			if (extra <= 0) {
				break;
			}
			blip_read_samples(left, trash, extra, 1);
			blip_read_samples(right, trash + 1, extra, 1);
		}
	}
	return avail;
}

EMSCRIPTEN_KEEPALIVE
void gba_set_keys(GbaContext* ctx, uint32_t keys) {
	if (ctx && ctx->core) {
		ctx->core->setKeys(ctx->core, keys);
	}
}

EMSCRIPTEN_KEEPALIVE
uint8_t* gba_get_frame_buffer(GbaContext* ctx) {
	return ctx ? (uint8_t*) ctx->frameBuf : NULL;
}

EMSCRIPTEN_KEEPALIVE
int16_t* gba_get_audio_buffer(GbaContext* ctx) {
	return ctx ? ctx->audioBuf : NULL;
}

EMSCRIPTEN_KEEPALIVE
uint32_t gba_get_frame_count(GbaContext* ctx) {
	return (ctx && ctx->core) ? ctx->core->frameCounter(ctx->core) : 0;
}

EMSCRIPTEN_KEEPALIVE
size_t gba_get_state_size(GbaContext* ctx) {
	return (ctx && ctx->core) ? ctx->core->stateSize(ctx->core) : 0;
}

EMSCRIPTEN_KEEPALIVE
int gba_save_state(GbaContext* ctx, uint8_t* out) {
	if (!ctx || !ctx->core || !out) {
		return 0;
	}
	return ctx->core->saveState(ctx->core, out) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int gba_load_state(GbaContext* ctx, const uint8_t* data, size_t size) {
	if (!ctx || !ctx->core || !data) {
		return 0;
	}
	if (size != ctx->core->stateSize(ctx->core)) {
		return 0;
	}
	if (!ctx->core->loadState(ctx->core, data)) {
		return 0;
	}
	blip_t* left = ctx->core->getAudioChannel(ctx->core, 0);
	blip_t* right = ctx->core->getAudioChannel(ctx->core, 1);
	if (left) {
		blip_clear(left);
		blip_set_rates(left, ctx->core->frequency(ctx->core), ctx->sampleRate);
	}
	if (right) {
		blip_clear(right);
		blip_set_rates(right, ctx->core->frequency(ctx->core), ctx->sampleRate);
	}
	ctx->saveDirty = 0;
	ctx->lastDirty = 0;
	return 1;
}

EMSCRIPTEN_KEEPALIVE
size_t gba_get_save_size(GbaContext* ctx) {
	if (!ctx || !ctx->core || !ctx->core->board) {
		return 0;
	}
	struct GBA* gba = (struct GBA*) ctx->core->board;
	return GBASavedataSize(&gba->memory.savedata);
}

EMSCRIPTEN_KEEPALIVE
size_t gba_read_save(GbaContext* ctx, uint8_t* out, size_t maxLen) {
	if (!ctx || !ctx->core || !ctx->core->board || !out) {
		return 0;
	}
	struct GBA* gba = (struct GBA*) ctx->core->board;
	size_t size = GBASavedataSize(&gba->memory.savedata);
	if (size == 0 || maxLen < size) {
		return 0;
	}
	struct VFile* vf = VFileFromMemory(out, size);
	if (!vf) {
		return 0;
	}
	bool ok = GBASavedataClone(&gba->memory.savedata, vf);
	vf->close(vf);
	return ok ? size : 0;
}

EMSCRIPTEN_KEEPALIVE
int gba_was_save_updated(GbaContext* ctx) {
	if (!ctx) {
		return 0;
	}
	int dirty = ctx->saveDirty;
	ctx->saveDirty = 0;
	return dirty;
}

EMSCRIPTEN_KEEPALIVE
uint32_t gba_read8(GbaContext* ctx, uint32_t addr) {
	return (ctx && ctx->core) ? (ctx->core->rawRead8(ctx->core, addr, 0) & 0xFFu) : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t gba_read16(GbaContext* ctx, uint32_t addr) {
	return (ctx && ctx->core) ? (ctx->core->rawRead16(ctx->core, addr, 0) & 0xFFFFu) : 0;
}

EMSCRIPTEN_KEEPALIVE
uint32_t gba_read32(GbaContext* ctx, uint32_t addr) {
	return (ctx && ctx->core) ? ctx->core->rawRead32(ctx->core, addr, 0) : 0;
}

EMSCRIPTEN_KEEPALIVE
void gba_write8(GbaContext* ctx, uint32_t addr, uint8_t val) {
	if (ctx && ctx->core) {
		ctx->core->busWrite8(ctx->core, addr, val);
	}
}

EMSCRIPTEN_KEEPALIVE
void gba_write16(GbaContext* ctx, uint32_t addr, uint16_t val) {
	if (ctx && ctx->core) {
		ctx->core->busWrite16(ctx->core, addr, val);
	}
}

EMSCRIPTEN_KEEPALIVE
void gba_write32(GbaContext* ctx, uint32_t addr, uint32_t val) {
	if (ctx && ctx->core) {
		ctx->core->busWrite32(ctx->core, addr, val);
	}
}
