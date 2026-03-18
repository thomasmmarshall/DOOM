import { describe, expect, it } from 'vitest';
import { MusicDecoder } from './MusicDecoder';
import { resolveMapMusicLump } from './MusicPlayer';

function createTestMus(): ArrayBuffer {
  const songData = [
    0x90, // play note on channel 0, followed by delay
    0xbc, // note 60 with explicit velocity
    100,  // velocity
    10,   // delay
    0x00, // release note on channel 0
    60,   // note 60
    0x60, // end of song
  ];

  const bytes = new Uint8Array(16 + songData.length);
  bytes.set([0x4d, 0x55, 0x53, 0x1a], 0); // MUS\x1a

  const view = new DataView(bytes.buffer);
  view.setUint16(4, songData.length, true);
  view.setUint16(6, 16, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);

  bytes.set(songData, 16);
  return bytes.buffer;
}

describe('MusicDecoder', () => {
  it('converts a MUS stream into a MIDI file', () => {
    const midi = MusicDecoder.decodeMusToMidi(createTestMus(), 'TEST');

    expect(midi).not.toBeNull();

    const bytes = Array.from(new Uint8Array(midi!));
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect(bytes[12]).toBe(0x00);
    expect(bytes[13]).toBe(70);
    expect(bytes).toEqual(expect.arrayContaining([0x90, 60, 100]));
    expect(bytes).toEqual(expect.arrayContaining([0x80, 60, 64]));
  });
});

describe('resolveMapMusicLump', () => {
  const wad = {
    hasLump(name: string): boolean {
      return new Set(['D_E1M1', 'D_E3M4', 'D_RUNNIN']).has(name);
    },
  };

  it('uses original DOOM and DOOM II map-to-music mappings', () => {
    expect(resolveMapMusicLump(wad, 'E1M1')).toBe('D_E1M1');
    expect(resolveMapMusicLump(wad, 'E4M1')).toBe('D_E3M4');
    expect(resolveMapMusicLump(wad, 'MAP01')).toBe('D_RUNNIN');
  });
});
