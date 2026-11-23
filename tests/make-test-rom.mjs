import fs from 'node:fs';
import path from 'node:path';

/** Build an original GB/GBC test ROM without copyrighted assets. */
export function buildTestRom({ title = 'MBC3 TEST', cgbFlag = 0x00, cartType = 0x13, romSizeCode = 0x01 } = {}) {
  const rom = new Uint8Array(32 * 1024 * (1 << romSizeCode));

  // Entry point: NOP; JP 0x0150
  rom.set([0x00, 0xc3, 0x50, 0x01], 0x0100);

  // Satisfy binjgb's 0xe06c8834 shift-XOR check across 0x0104..0x0133 without Nintendo logo bytes
  for (let k = 0; k < 32; k++) {
    rom[0x0114 + k] = (0xe06c8834 >>> (31 - k)) & 1;
  }

  // Title: up to 15 ASCII bytes at 0x0134..0x0142 (0x0143 holds CGB flag)
  const cleanTitle = String(title).slice(0, 15);
  for (let i = 0; i < cleanTitle.length; i++) {
    rom[0x0134 + i] = cleanTitle.charCodeAt(i);
  }

  rom[0x0143] = cgbFlag & 0xff; // 0x00 DMG, 0x80 CGB-compatible
  rom[0x0147] = cartType & 0xff; // 0x13 MBC3+RAM+BATTERY, 0x1B MBC5+RAM+BATTERY
  rom[0x0148] = romSizeCode & 0xff; // 0x01 = 64 KB (4 banks), 0x03 = 256 KB (16 banks)
  rom[0x0149] = 0x03; // 32 KB (4 SRAM banks, same as Pokemon Red)

  // ROM Bank 2 byte 0 (offset 0x8000)
  rom[0x8000] = 0x5a;

  // Sharp LR35902 program at 0x0150
  const code = [
    0xf3,                   // 0150: DI
    0xf0, 0x44,             // 0151: LDH A, (0x44)  ; wait LY >= 144
    0xfe, 0x90,             // 0153: CP 0x90
    0x38, 0xfa,             // 0155: JR C, -6 (0151)
    0xaf,                   // 0157: XOR A
    0xe0, 0x40,             // 0158: LDH (0x40), A  ; LCD off
    0x3e, 0x02,             // 015A: LD A, 2
    0xea, 0x00, 0x20,       // 015C: LD (0x2000), A ; MBC3 ROM bank 2
    0xfa, 0x00, 0x40,       // 015F: LD A, (0x4000) ; read bank 2[0] -> 0x5A
    0xea, 0x00, 0xc0,       // 0162: LD (0xC000), A
    0x3e, 0x0a,             // 0165: LD A, 0x0A
    0xea, 0x00, 0x00,       // 0167: LD (0x0000), A ; enable SRAM
    0x3e, 0x01,             // 016A: LD A, 1
    0xea, 0x00, 0x40,       // 016C: LD (0x4000), A ; SRAM bank 1
    0x3e, 0xa5,             // 016F: LD A, 0xA5
    0xea, 0x00, 0xa0,       // 0171: LD (0xA000), A ; write SRAM
    0xaf,                   // 0174: XOR A
    0xfa, 0x00, 0xa0,       // 0175: LD A, (0xA000) ; read back -> 0xA5
    0xea, 0x01, 0xc0,       // 0178: LD (0xC001), A
    0x21, 0x00, 0x80,       // 017B: LD HL, 0x8000  ; Tile 0 = blank
    0x06, 0x10,             // 017E: LD B, 16
    0xaf,                   // 0180: XOR A
    0x22,                   // 0181: LD (HL+), A
    0x05,                   // 0182: DEC B
    0x20, 0xfc,             // 0183: JR NZ, -4 (0181)
    0x06, 0x08,             // 0185: LD B, 8        ; Tile 1 top half = 0xF0
    0x3e, 0xf0,             // 0187: LD A, 0xF0
    0x22,                   // 0189: LD (HL+), A
    0x05,                   // 018A: DEC B
    0x20, 0xfc,             // 018B: JR NZ, -4 (0189)
    0x06, 0x08,             // 018D: LD B, 8        ; Tile 1 bottom half = 0x0F
    0x3e, 0x0f,             // 018F: LD A, 0x0F
    0x22,                   // 0191: LD (HL+), A
    0x05,                   // 0192: DEC B
    0x20, 0xfc,             // 0193: JR NZ, -4 (0191)
    0x0e, 0x00,             // 0195: LD C, 0
    0xfa, 0x00, 0xc0,       // 0197: LD A, (0xC000)
    0xfe, 0x5a,             // 019A: CP 0x5A
    0x20, 0x09,             // 019C: JR NZ, +9 (01A7)
    0xfa, 0x01, 0xc0,       // 019E: LD A, (0xC001)
    0xfe, 0xa5,             // 01A1: CP 0xA5
    0x20, 0x02,             // 01A3: JR NZ, +2 (01A7)
    0x0e, 0x01,             // 01A5: LD C, 1        ; PASS -> Tile 1 checkerboard
    0x21, 0x00, 0x98,       // 01A7: LD HL, 0x9800  ; fill 1024-byte BG map
    0x16, 0x04,             // 01AA: LD D, 4
    0x06, 0x00,             // 01AC: LD B, 0
    0x79,                   // 01AE: LD A, C
    0x22,                   // 01AF: LD (HL+), A
    0x05,                   // 01B0: DEC B
    0x20, 0xfc,             // 01B1: JR NZ, -4 (01AF)
    0x15,                   // 01B3: DEC D
    0x20, 0xf6,             // 01B4: JR NZ, -10 (01AC)
    0x3e, 0xe4,             // 01B6: LD A, 0xE4     ; BGP normal
    0xe0, 0x47,             // 01B8: LDH (0x47), A
    0xaf,                   // 01BA: XOR A
    0xe0, 0x42,             // 01BB: LDH (0x42), A  ; SCY = 0
    0xe0, 0x43,             // 01BC: LDH (0x43), A  ; SCX = 0
    0x3e, 0x91,             // 01BD: LD A, 0x91     ; LCD on + BG on + 0x8000 tiles
    0xe0, 0x40,             // 01BF: LDH (0x40), A
    // Enable APU & trigger Channel 1 + Channel 4 so saveState/loadState exercises sound slots
    0x3e, 0x80, 0xe0, 0x26, // NR52 = 0x80
    0x3e, 0x77, 0xe0, 0x24, // NR50 = 0x77
    0x3e, 0xff, 0xe0, 0x25, // NR51 = 0xFF
    0x3e, 0x80, 0xe0, 0x11, // NR11 = 0x80
    0x3e, 0xf0, 0xe0, 0x12, // NR12 = 0xF0
    0x3e, 0x00, 0xe0, 0x13, // NR13 = 0x00
    0x3e, 0x84, 0xe0, 0x14, // NR14 = 0x84
    0x3e, 0xf0, 0xe0, 0x21, // NR42 = 0xF0
    0x3e, 0x22, 0xe0, 0x22, // NR43 = 0x22
    0x3e, 0x80, 0xe0, 0x23, // NR44 = 0x80
    // Keep B=0x7F, C=0x7F, D=0x7F untouched in loop
    0x06, 0x7f,             // LD B, 0x7F
    0x0e, 0x7f,             // LD C, 0x7F
    0x16, 0x7f,             // LD D, 0x7F
    0xf0, 0x44,             // loop: LDH A, (0x44)  ; wait LY == 144
    0xfe, 0x90,             // CP 0x90
    0x20, 0xfa,             // JR NZ, -6
    0xf0, 0x43,             // LDH A, (0x43)  ; SCX++
    0x3c,                   // INC A
    0xe0, 0x43,             // LDH (0x43), A
    0x3e, 0x10,             // LD A, 0x10     ; select action buttons (A/B/Sel/Start)
    0xe0, 0x00,             // LDH (0x00), A
    0xf0, 0x00,             // LDH A, (0x00)
    0xf0, 0x00,             // LDH A, (0x00)
    0xe6, 0x0f,             // AND 0x0F
    0xfe, 0x0f,             // CP 0x0F
    0x28, 0x04,             // JR Z, +4
    0x3e, 0x1b,             // LD A, 0x1B     ; invert palette while button held!
    0x18, 0x02,             // JR +2
    0x3e, 0xe4,             // LD A, 0xE4     ; normal palette
    0xe0, 0x47,             // LDH (0x47), A
    0xf0, 0x44,             // LDH A, (0x44)  ; wait LY != 144
    0xfe, 0x90,             // CP 0x90
    0x28, 0xfa,             // JR Z, -6
    0x18, 0xd8,             // JR -40 (loop)
  ];
  rom.set(code, 0x0150);

  // Header checksum
  let x = 0;
  for (let a = 0x0134; a <= 0x014c; a++) {
    x = (x - rom[a] - 1) & 0xff;
  }
  rom[0x014d] = x;

  // Global checksum
  let globalSum = 0;
  for (let i = 0; i < rom.length; i++) {
    if (i !== 0x014e && i !== 0x014f) {
      globalSum = (globalSum + rom[i]) & 0xffff;
    }
  }
  rom[0x014e] = (globalSum >> 8) & 0xff;
  rom[0x014f] = globalSum & 0xff;

  return rom;
}

/** Build an original 512 KB GBA Mode 3 test ROM without copyrighted assets. */
export function buildGbaTestRom({ title = 'GBA TEST', gameCode = 'BTEE' } = {}) {
  const rom = new Uint8Array(512 * 1024);

  const words = [];
  const emit = (w) => words.push(w >>> 0);
  const patchBranch = (idx, targetIdx) => {
    const off = targetIdx - idx - 2;
    words[idx] = (words[idx] & 0xff000000) | (off & 0x00ffffff);
  };
  const ldrLit = (rd, val) => ({ idx: words.length, rd, val: val >>> 0 });
  const pendingLits = [];

  // Entry at 0x080000C0
  pendingLits.push(ldrLit(4, 0x04000000)); // R4 = I/O base
  emit(0xe59f4000);
  pendingLits.push(ldrLit(5, 0x06000000)); // R5 = VRAM base
  emit(0xe59f5000);
  pendingLits.push(ldrLit(6, 0x02000000)); // R6 = EWRAM base
  emit(0xe59f6000);
  pendingLits.push(ldrLit(7, 0x0e002000)); // R7 = SRAM + 0x2000
  emit(0xe59f7000);
  pendingLits.push(ldrLit(0, 0x00000403)); // DISPCNT = Mode 3 + BG2
  emit(0xe59f0000);
  emit(0xe1c400b0); // STRH R0, [R4, #0]

  // Write 0xA5 to SRAM[0x2000], read back to EWRAM[0x02000000]
  emit(0xe3a000a5); // MOV R0, #0xA5
  emit(0xe5c70000); // STRB R0, [R7, #0]
  emit(0xe5d70000); // LDRB R0, [R7, #0]
  emit(0xe5c60000); // STRB R0, [R6, #0]

  // Zero frame counter at EWRAM[0x02000004]
  emit(0xe3a08000); // MOV R8, #0
  emit(0xe5868004); // STR R8, [R6, #4]

  // Main VBlank loop
  const waitVblIdx = words.length;
  emit(0xe1d400b6); // LDRH R0, [R4, #6] (REG_VCOUNT)
  emit(0xe35000a0); // CMP R0, #160
  const bWaitVblIdx = words.length;
  emit(0x1a000000); // BNE wait_vbl
  patchBranch(bWaitVblIdx, waitVblIdx);

  // Increment frame counter
  emit(0xe5968004); // LDR R8, [R6, #4]
  emit(0xe2888001); // ADD R8, R8, #1
  emit(0xe5868004); // STR R8, [R6, #4]

  // Poll KEYINPUT (0x04000130): bit 0 low when A is pressed
  pendingLits.push(ldrLit(12, 0x04000130)); // R12 = REG_KEYINPUT
  emit(0xe59fc000);
  emit(0xe1d400b6); // wait — read R12 directly
  words.pop();
  emit(0xe1dc00b0); // LDRH R0, [R12, #0]
  emit(0xe3100001); // TST R0, #1
  const bNotPressedIdx = words.length;
  emit(0x1a000000); // BNE not_pressed

  // A pressed: marker = 0x1B, base color = 0x001F (red)
  emit(0xe3a0101b); // MOV R1, #0x1B
  emit(0xe3a0201f); // MOV R2, #0x1F
  const bAfterInputIdx = words.length;
  emit(0xea000000); // B after_input

  // A released: marker = 0xE4, base color = 0x7C00 (blue)
  const notPressedIdx = words.length;
  patchBranch(bNotPressedIdx, notPressedIdx);
  emit(0xe3a010e4); // MOV R1, #0xE4
  emit(0xe3a02b1f); // MOV R2, #0x7C00

  const afterInputIdx = words.length;
  patchBranch(bAfterInputIdx, afterInputIdx);
  emit(0xe5c61008); // STRB R1, [R6, #8]

  // Animated pixel color R2 |= (R8 & 0x1F) << 5, fill 240x16 banner
  emit(0xe208301f); // AND R3, R8, #0x1F
  emit(0xe1822283); // ORR R2, R2, R3, LSL #5
  emit(0xe3a09000); // MOV R9, #0
  pendingLits.push(ldrLit(10, 240 * 16)); // 16 rows of Mode 3 pixels
  emit(0xe59fa000);

  const drawLoopIdx = words.length;
  emit(0xe1a0b089); // MOV R11, R9, LSL #1
  emit(0xe085b00b); // ADD R11, R5, R11
  emit(0xe1cb20b0); // STRH R2, [R11, #0]
  emit(0xe2899001); // ADD R9, R9, #1
  emit(0xe159000a); // CMP R9, R10
  const bDrawLoopIdx = words.length;
  emit(0x3a000000); // BCC draw_loop
  patchBranch(bDrawLoopIdx, drawLoopIdx);

  // Wait for VBlank end (VCOUNT != 160)
  const waitEndIdx = words.length;
  emit(0xe1d400b6); // LDRH R0, [R4, #6]
  emit(0xe35000a0); // CMP R0, #160
  const bWaitEndIdx = words.length;
  emit(0x0a000000); // BEQ wait_end
  patchBranch(bWaitEndIdx, waitEndIdx);

  const bMainIdx = words.length;
  emit(0xea000000); // B wait_vbl
  patchBranch(bMainIdx, waitVblIdx);

  // Literal pool at end of code
  for (const lit of pendingLits) {
    const litIdx = words.length;
    const byteOff = (litIdx - lit.idx - 2) * 4;
    words[lit.idx] = (words[lit.idx] & 0xfffff000) | (byteOff & 0xfff);
    emit(lit.val);
  }

  // Write B 0x00C0 at offset 0x0000
  const entryBranch = 0xea000000 | (((0xc0 - 8) / 4) & 0x00ffffff);
  rom[0] = entryBranch & 0xff;
  rom[1] = (entryBranch >> 8) & 0xff;
  rom[2] = (entryBranch >> 16) & 0xff;
  rom[3] = (entryBranch >> 24) & 0xff;

  const cleanTitle = String(title).slice(0, 12);
  for (let i = 0; i < cleanTitle.length; i++) {
    rom[0x0a0 + i] = cleanTitle.charCodeAt(i);
  }
  const cleanCode = String(gameCode).padEnd(4, ' ').slice(0, 4);
  for (let i = 0; i < 4; i++) {
    rom[0x0ac + i] = cleanCode.charCodeAt(i);
  }
  rom[0x0b0] = 0x30;
  rom[0x0b1] = 0x31;
  rom[0x0b2] = 0x96;

  let chk = 0;
  for (let i = 0x0a0; i <= 0x0bc; i++) {
    chk = (chk - rom[i]) & 0xff;
  }
  rom[0x0bd] = (chk - 0x19) & 0xff;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const addr = 0x0c0 + i * 4;
    rom[addr] = w & 0xff;
    rom[addr + 1] = (w >>> 8) & 0xff;
    rom[addr + 2] = (w >>> 16) & 0xff;
    rom[addr + 3] = (w >>> 24) & 0xff;
  }

  return rom;
}

if (path.resolve(process.argv[1] || '') === import.meta.filename) {
  const outPath = path.resolve(process.argv[2] || path.join(import.meta.dirname, '.tmp', 'mbc3-test.gb'));
  const rom = buildTestRom();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, rom);
  console.log(`Generated ${outPath} (${rom.length} bytes)`);
}
