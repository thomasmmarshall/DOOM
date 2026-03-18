declare module 'webaudio-tinysynth' {
  export interface WebAudioTinySynthOptions {
    quality?: number;
    useReverb?: number;
    voices?: number;
  }

  export interface WebAudioTinySynthPlayStatus {
    play: boolean | number;
    curTick: number;
    maxTick: number;
  }

  export default class WebAudioTinySynth {
    constructor(options?: WebAudioTinySynthOptions);
    getAudioContext(): AudioContext;
    setMasterVol(level: number): void;
    setLoop(loop: number): void;
    loadMIDI(midiData: ArrayBuffer): void;
    playMIDI(): void;
    stopMIDI(): void;
    getPlayStatus(): WebAudioTinySynthPlayStatus;
  }
}
