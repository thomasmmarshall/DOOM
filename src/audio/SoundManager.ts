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
  impClaw: 'DSCLAW',
  demonAttack: 'DSSGTATK',
  impFireball: 'DSFIRSHT',
  barrel: 'DSBAREXP',
  oof: 'DSOOF',
};

/** s_sound.c-style 2D pan + clipping distance (map units). */
export interface SoundSpatial {
  origin: { x: number; y: number };
  listener: { x: number; y: number; angleBam: number };
}

interface ActiveVoice {
  source: AudioBufferSourceNode;
}

/** Roughly s_sound channel cap (linuxdoom mixes to hardware voices). */
const MAX_VOICES = 8;
const S_CLIPPING_DIST = 1200;

export class SoundManager {
  private wad: WADReader;
  private audioContext?: AudioContext;
  private cache = new Map<string, CachedSound>();
  private voices: ActiveVoice[] = [];

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

  private evictIfNeeded(): void {
    while (this.voices.length >= MAX_VOICES) {
      const v = this.voices.shift()!;
      try {
        v.source.stop();
      } catch {
        /* already ended */
      }
      try {
        v.source.disconnect();
      } catch {
        /* */
      }
    }
  }

  play(name: keyof typeof SOUND_LUMPS, volume: number = 0.5, spatial?: SoundSpatial): void {
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

    this.evictIfNeeded();

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;

    let effVol = volume;
    if (spatial) {
      const dx = spatial.origin.x - spatial.listener.x;
      const dy = spatial.origin.y - spatial.listener.y;
      const dist = Math.hypot(dx, dy);
      effVol *= Math.max(0.06, Math.min(1, 1 - dist / S_CLIPPING_DIST));
      gain.gain.value = effVol;

      const panner = context.createStereoPanner();
      const ang = Math.atan2(dy, dx);
      const view = ((spatial.listener.angleBam >>> 0) * (2 * Math.PI)) / 0x100000000;
      panner.pan.value = Math.max(-1, Math.min(1, Math.sin(ang - view)));

      source.connect(gain);
      gain.connect(panner);
      panner.connect(context.destination);
    } else {
      gain.gain.value = effVol;
      source.connect(gain);
      gain.connect(context.destination);
    }

    const entry: ActiveVoice = { source };
    source.onended = () => {
      const i = this.voices.indexOf(entry);
      if (i >= 0) {
        this.voices.splice(i, 1);
      }
    };
    this.voices.push(entry);
    source.start();
  }
}
