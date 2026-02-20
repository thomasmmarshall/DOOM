import { describe, it, expect } from 'vitest';
import { WADReader } from './WADReader';

describe('WADReader', () => {
  /**
   * Create a minimal valid WAD file for testing
   */
  function createTestWAD(): ArrayBuffer {
    const buffer = new ArrayBuffer(12 + 16); // Header + 1 lump entry
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Write header
    bytes[0] = 'I'.charCodeAt(0);
    bytes[1] = 'W'.charCodeAt(0);
    bytes[2] = 'A'.charCodeAt(0);
    bytes[3] = 'D'.charCodeAt(0);

    view.setInt32(4, 1, true); // numlumps = 1
    view.setInt32(8, 12, true); // infotableofs = 12

    // Write lump directory entry
    view.setInt32(12, 0, true); // filepos = 0
    view.setInt32(16, 0, true); // size = 0

    // Write lump name "TEST"
    bytes[20] = 'T'.charCodeAt(0);
    bytes[21] = 'E'.charCodeAt(0);
    bytes[22] = 'S'.charCodeAt(0);
    bytes[23] = 'T'.charCodeAt(0);

    return buffer;
  }

  it('should parse WAD header correctly', () => {
    const wad = new WADReader(createTestWAD());
    const info = wad.getInfo();

    expect(info.identification).toBe('IWAD');
    expect(info.numlumps).toBe(1);
    expect(info.infotableofs).toBe(12);
  });

  it('should parse lump directory', () => {
    const wad = new WADReader(createTestWAD());

    expect(wad.hasLump('TEST')).toBe(true);
    expect(wad.hasLump('MISSING')).toBe(false);
  });

  it('should retrieve lump by name', () => {
    const wad = new WADReader(createTestWAD());
    const lump = wad.getLump('TEST');

    expect(lump).toBeDefined();
    expect(lump?.name).toBe('TEST');
    expect(lump?.size).toBe(0);
  });

  it('should be case-insensitive for lump names', () => {
    const wad = new WADReader(createTestWAD());

    expect(wad.hasLump('test')).toBe(true);
    expect(wad.hasLump('Test')).toBe(true);
    expect(wad.hasLump('TEST')).toBe(true);
  });

  it('should throw error for invalid WAD', () => {
    const buffer = new ArrayBuffer(12);
    const bytes = new Uint8Array(buffer);
    bytes[0] = 'B'.charCodeAt(0);
    bytes[1] = 'A'.charCodeAt(0);
    bytes[2] = 'D'.charCodeAt(0);
    bytes[3] = '!'.charCodeAt(0);

    expect(() => new WADReader(buffer)).toThrow('Invalid WAD file');
  });
});
