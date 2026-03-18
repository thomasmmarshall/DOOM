import WebAudioTinySynth from 'webaudio-tinysynth';
import type { WADReader } from '../wad';
import { MusicDecoder } from './MusicDecoder';

const DOOM2_MUSIC_BY_MAP: string[] = [
  'D_RUNNIN',
  'D_STALKS',
  'D_COUNTD',
  'D_BETWEE',
  'D_DOOM',
  'D_THE_DA',
  'D_SHAWN',
  'D_DDTBLU',
  'D_IN_CIT',
  'D_DEAD',
  'D_STLKS2',
  'D_THEDA2',
  'D_DOOM2',
  'D_DDTBL2',
  'D_RUNNI2',
  'D_DEAD2',
  'D_STLKS3',
  'D_ROMERO',
  'D_SHAWN2',
  'D_MESSAG',
  'D_COUNT2',
  'D_DDTBL3',
  'D_AMPIE',
  'D_THEDA3',
  'D_ADRIAN',
  'D_MESSG2',
  'D_ROMER2',
  'D_TENSE',
  'D_SHAWN3',
  'D_OPENIN',
  'D_EVIL',
  'D_ULTIMA',
];

const EPISODE4_MUSIC_BY_MAP: string[] = [
  'D_E3M4',
  'D_E3M2',
  'D_E3M3',
  'D_E1M5',
  'D_E2M7',
  'D_E2M4',
  'D_E2M6',
  'D_E2M5',
  'D_E1M9',
];

export function resolveMapMusicLump(wad: Pick<WADReader, 'hasLump'>, mapName: string): string | null {
  const upperMapName = mapName.toUpperCase();
  const directLump = `D_${upperMapName}`;

  if (wad.hasLump(directLump)) {
    return directLump;
  }

  const episodeMatch = /^E(\d)M(\d)$/.exec(upperMapName);
  if (episodeMatch) {
    const episode = Number(episodeMatch[1]);
    const map = Number(episodeMatch[2]);

    if (episode >= 1 && episode <= 3) {
      const lumpName = `D_E${episode}M${map}`;
      return wad.hasLump(lumpName) ? lumpName : null;
    }

    if (episode === 4) {
      const lumpName = EPISODE4_MUSIC_BY_MAP[map - 1];
      return lumpName && wad.hasLump(lumpName) ? lumpName : null;
    }
  }

  const commercialMatch = /^MAP(\d\d)$/.exec(upperMapName);
  if (commercialMatch) {
    const mapIndex = Number(commercialMatch[1]) - 1;
    const lumpName = DOOM2_MUSIC_BY_MAP[mapIndex];
    return lumpName && wad.hasLump(lumpName) ? lumpName : null;
  }

  return null;
}

export class MusicPlayer {
  private wad: WADReader;
  private synth?: WebAudioTinySynth;
  private preparedLumpName?: string;

  constructor(wad: WADReader) {
    this.wad = wad;
  }

  prepareMapMusic(mapName: string): boolean {
    const lumpName = resolveMapMusicLump(this.wad, mapName);
    if (!lumpName) {
      return false;
    }

    if (this.preparedLumpName === lumpName) {
      return true;
    }

    const musData = this.wad.readLump(lumpName);
    if (!musData) {
      return false;
    }

    const midiData = MusicDecoder.decodeMusToMidi(musData, lumpName);
    if (!midiData) {
      return false;
    }

    const synth = this.ensureSynth();
    if (!synth) {
      return false;
    }

    synth.stopMIDI();
    synth.loadMIDI(midiData);
    synth.setLoop(1);
    this.preparedLumpName = lumpName;
    return true;
  }

  async activate(): Promise<void> {
    const synth = this.ensureSynth();
    if (!synth || !this.preparedLumpName) {
      return;
    }

    const audioContext = synth.getAudioContext();
    if (audioContext?.state === 'suspended') {
      await audioContext.resume();
    }

    if (!Boolean(synth.getPlayStatus().play)) {
      synth.playMIDI();
    }
  }

  stop(): void {
    if (!this.synth) {
      return;
    }

    this.synth.stopMIDI();
  }

  private ensureSynth(): WebAudioTinySynth | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (!this.synth) {
      this.synth = new WebAudioTinySynth({
        quality: 1,
        useReverb: 1,
        voices: 48,
      });
      this.synth.setMasterVol(0.18);
      this.synth.setLoop(1);
    }

    return this.synth;
  }
}
