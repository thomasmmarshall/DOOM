import type { WADReader } from '../wad';

type CachedSound = AudioBuffer;

const SOUND_LUMPS: Record<string, string> = {
  pistol: 'DSPISTOL',
  shotgun: 'DSSHOTGN',
  chaingun: 'DSCHGUN',
  rocket: 'DSRLAUNC',
  pickup: 'DSITEMUP',
  weaponup: 'DSWPNUP',
  doorOpen: 'DSDOROPN',
  doorClose: 'DSDORCLS',
  switch: 'DSSWTCHN',
  platform: 'DSPSTART',
  monsterSight: 'DSPOSIT1',
  impSight: 'DSBGSIT1',
  shotgunGuySight: 'DSSGTSIT',
  playerPain: 'DSPLPAIN',
  monsterDeath: 'DSPODTH1',
  zombieDeath: 'DSPODTH1',
  shotgunGuyDeath: 'DSPODTH2',
  impDeath: 'DSBGDTH1',
  demonDeath: 'DSSGTDTH',
  barrel: 'DSBAREXP',
  oof: 'DSOOF',
};

export class SoundManager {
  private wad: WADReader;
  private audioContext?: AudioContext;
  private cache = new Map<string, CachedSound>();

  constructor(wad: WADReader) {
    this.wad = wad;
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (!this.audioContext) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) {
        return null;
      }
      this.audioContext = new Ctx();
    }

    return this.audioContext;
  }

  private decodeDmxSound(lumpName: string): AudioBuffer | null {
    const context = this.getContext();
    if (!context) {
      return null;
    }

    if (this.cache.has(lumpName)) {
      return this.cache.get(lumpName)!;
    }

    const data = this.wad.readLump(lumpName);
    if (!data || data.byteLength <= 8) {
      return null;
    }

    const bytes = new Uint8Array(data);
    const sampleCount = bytes.byteLength - 8;
    const buffer = context.createBuffer(1, sampleCount, 11025);
    const channel = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      channel[i] = (bytes[i + 8] - 128) / 128;
    }

    this.cache.set(lumpName, buffer);
    return buffer;
  }

  play(name: keyof typeof SOUND_LUMPS, volume: number = 0.5): void {
    const context = this.getContext();
    if (!context) {
      return;
    }

    const lumpName = SOUND_LUMPS[name];
    const buffer = this.decodeDmxSound(lumpName);
    if (!buffer) {
      return;
    }

    if (context.state === 'suspended') {
      void context.resume();
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
  }
}
