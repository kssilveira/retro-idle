import fs from 'node:fs';
import path from 'node:path';

/** Build an original 64 KB MBC3 + RAM + BATTERY test ROM without copyrighted assets. */
export function buildTestRom() {
  const rom = new Uint8Array(64 * 1024); // 64 KB = 4 ROM banks

  // Entry point: NOP; JP 0x0150
  rom.set([0x00, 0xc3, 0x50, 0x01], 0x0100);

  // Satisfy binjgb's 0xe06c8834 shift-XOR check across 0x0104..0x0133 without Nintendo logo bytes
  for (let k = 0; k < 32; k++) {
    rom[0x0114 + k] = (0xe06c8834 >>> (31 - k)) & 1;
  }

  // Title: "MBC3 TEST" at 0x0134..0x0142
  const title = 'MBC3 TEST';
  for (let i = 0; i < title.length; i++) {
    rom[0x0134 + i] = title.charCodeAt(i);
  }

  rom[0x0143] = 0x00; // DMG
  rom[0x0147] = 0x13; // MBC3 + RAM + BATTERY (same as Pokemon Red)
  rom[0x0148] = 0x01; // 64 KB (4 ROM banks)
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

if (path.resolve(process.argv[1] || '') === import.meta.filename) {
  const outPath = path.resolve(process.argv[2] || path.join(import.meta.dirname, '.tmp', 'mbc3-test.gb'));
  const rom = buildTestRom();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, rom);
  console.log(`Generated ${outPath} (${rom.length} bytes)`);
}
