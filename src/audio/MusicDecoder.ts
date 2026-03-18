const MUS_HEADER_MAGIC = 'MUS\x1a';
const MUS_TICKS_PER_SECOND = 140;
const MIDI_TICKS_PER_QUARTER = 70;
const MIDI_TEMPO_USEC_PER_QUARTER = 500_000;

const SYSTEM_EVENT_TO_MIDI_CONTROLLER = new Map<number, number>([
  [10, 120], // all sounds off
  [11, 123], // all notes off
  [12, 126], // mono
  [13, 127], // poly
  [14, 121], // reset all controllers
]);

const CONTROLLER_EVENT_TO_MIDI = new Map<number, number>([
  [1, 0],   // bank select
  [2, 1],   // modulation
  [3, 7],   // channel volume
  [4, 10],  // pan
  [5, 11],  // expression
  [6, 91],  // reverb depth
  [7, 93],  // chorus depth
  [8, 64],  // sustain pedal
  [9, 67],  // soft pedal
]);

type TimedMidiEvent = {
  tick: number;
  status: number;
  data: number[];
};

type MusDelayResult = {
  delay: number;
  offset: number;
};

export class MusicDecoder {
  static decodeMusToMidi(data: ArrayBuffer, trackName: string = 'DOOM'): ArrayBuffer | null {
    if (data.byteLength < 16) {
      return null;
    }

    const view = new DataView(data);
    const bytes = new Uint8Array(data);
    const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);

    if (magic !== MUS_HEADER_MAGIC) {
      return null;
    }

    const songLength = view.getUint16(4, true);
    const songOffset = view.getUint16(6, true);
    const songEnd = Math.min(songOffset + songLength, bytes.length);

    if (songOffset >= bytes.length || songOffset >= songEnd) {
      return null;
    }

    const channelVelocities = new Array<number>(16).fill(100);
    const midiEvents: TimedMidiEvent[] = [];

    let currentTick = 0;
    let offset = songOffset;
    let finished = false;

    while (offset < songEnd && !finished) {
      const descriptor = bytes[offset++];
      const hasDelay = (descriptor & 0x80) !== 0;
      const eventType = (descriptor >> 4) & 0x07;
      const musChannel = descriptor & 0x0f;
      const midiChannel = this.mapMusChannel(musChannel);

      switch (eventType) {
        case 0: {
          if (offset >= songEnd) {
            return null;
          }

          const note = bytes[offset++] & 0x7f;
          midiEvents.push({
            tick: currentTick,
            status: 0x80 | midiChannel,
            data: [note, 64],
          });
          break;
        }
        case 1: {
          if (offset >= songEnd) {
            return null;
          }

          const noteByte = bytes[offset++];
          const note = noteByte & 0x7f;

          if ((noteByte & 0x80) !== 0) {
            if (offset >= songEnd) {
              return null;
            }
            channelVelocities[musChannel] = bytes[offset++] & 0x7f;
          }

          midiEvents.push({
            tick: currentTick,
            status: 0x90 | midiChannel,
            data: [note, channelVelocities[musChannel]],
          });
          break;
        }
        case 2: {
          if (offset >= songEnd) {
            return null;
          }

          const bend = Math.min(0x3fff, (bytes[offset++] & 0xff) << 6);
          midiEvents.push({
            tick: currentTick,
            status: 0xe0 | midiChannel,
            data: [bend & 0x7f, (bend >> 7) & 0x7f],
          });
          break;
        }
        case 3: {
          if (offset >= songEnd) {
            return null;
          }

          const systemEvent = bytes[offset++] & 0x7f;
          const controller = SYSTEM_EVENT_TO_MIDI_CONTROLLER.get(systemEvent);

          if (controller !== undefined) {
            midiEvents.push({
              tick: currentTick,
              status: 0xb0 | midiChannel,
              data: [controller, 0],
            });
          }
          break;
        }
        case 4: {
          if (offset + 1 >= songEnd) {
            return null;
          }

          const controllerEvent = bytes[offset++] & 0x7f;
          const value = bytes[offset++] & 0x7f;

          if (controllerEvent === 0) {
            midiEvents.push({
              tick: currentTick,
              status: 0xc0 | midiChannel,
              data: [value],
            });
          } else {
            const controller = CONTROLLER_EVENT_TO_MIDI.get(controllerEvent);
            if (controller !== undefined) {
              midiEvents.push({
                tick: currentTick,
                status: 0xb0 | midiChannel,
                data: [controller, value],
              });
            }
          }
          break;
        }
        case 5:
          break;
        case 6:
          finished = true;
          break;
        case 7:
          if (offset >= songEnd) {
            return null;
          }
          offset++;
          break;
        default:
          return null;
      }

      if (hasDelay && !finished) {
        const delay = this.readMusDelay(bytes, offset, songEnd);
        if (!delay) {
          return null;
        }
        currentTick += delay.delay;
        offset = delay.offset;
      }
    }

    return this.buildMidiFile(midiEvents, trackName);
  }

  private static mapMusChannel(channel: number): number {
    if (channel === 15) {
      return 9;
    }

    return channel >= 9 ? channel + 1 : channel;
  }

  private static readMusDelay(bytes: Uint8Array, startOffset: number, endOffset: number): MusDelayResult | null {
    let delay = 0;
    let offset = startOffset;

    while (offset < endOffset) {
      const byte = bytes[offset++];
      delay = (delay << 7) + (byte & 0x7f);

      if ((byte & 0x80) === 0) {
        return { delay, offset };
      }
    }

    return null;
  }

  private static buildMidiFile(events: TimedMidiEvent[], trackName: string): ArrayBuffer {
    const trackData: number[] = [];
    let lastTick = 0;

    this.pushMetaEvent(trackData, 0, 0x03, this.encodeText(trackName));
    this.pushMetaEvent(trackData, 0, 0x51, [
      (MIDI_TEMPO_USEC_PER_QUARTER >> 16) & 0xff,
      (MIDI_TEMPO_USEC_PER_QUARTER >> 8) & 0xff,
      MIDI_TEMPO_USEC_PER_QUARTER & 0xff,
    ]);

    for (const event of events) {
      const delta = Math.max(0, event.tick - lastTick);
      trackData.push(...this.writeVariableLength(delta), event.status, ...event.data);
      lastTick = event.tick;
    }

    this.pushMetaEvent(trackData, 0, 0x2f, []);

    const output: number[] = [];

    output.push(
      0x4d, 0x54, 0x68, 0x64, // MThd
      0x00, 0x00, 0x00, 0x06, // header length
      0x00, 0x00,             // format 0
      0x00, 0x01,             // one track
      0x00, MIDI_TICKS_PER_QUARTER, // division
      0x4d, 0x54, 0x72, 0x6b, // MTrk
      (trackData.length >> 24) & 0xff,
      (trackData.length >> 16) & 0xff,
      (trackData.length >> 8) & 0xff,
      trackData.length & 0xff,
      ...trackData,
    );

    return new Uint8Array(output).buffer;
  }

  private static pushMetaEvent(trackData: number[], delta: number, type: number, data: number[]): void {
    trackData.push(...this.writeVariableLength(delta), 0xff, type, ...this.writeVariableLength(data.length), ...data);
  }

  private static writeVariableLength(value: number): number[] {
    const bytes = [value & 0x7f];
    let remaining = value >>> 7;

    while (remaining > 0) {
      bytes.unshift((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }

    return bytes;
  }

  private static encodeText(text: string): number[] {
    return Array.from(new TextEncoder().encode(text));
  }
}

export const MUS_DELAY_TICKS_PER_SECOND = MUS_TICKS_PER_SECOND;
