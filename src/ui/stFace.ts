/**
 * Status face (linuxdoom-1.10/st_stuff.c ST_updateFaceWidget)
 */

import { mRandom } from '../core';
import type { Mobj } from '../game/mobj';
import { FixedToFloat } from '../core/fixed';

const ST_NUMPAINFACES = 5;
const ST_FACESTRIDE = 8;
const ST_NUMSTRAIGHTFACES = 3;
const ST_TURNOFFSET = ST_NUMSTRAIGHTFACES;
const ST_OUCHOFFSET = ST_TURNOFFSET + 2;
const ST_EVILGRINOFFSET = ST_OUCHOFFSET + 1;
const ST_RAMPAGEOFFSET = ST_EVILGRINOFFSET + 1;
export const ST_GODFACE = ST_FACESTRIDE * ST_NUMPAINFACES;
export const ST_DEADFACE = ST_GODFACE + 1;

const ST_EVILGRINCOUNT = 2 * 35;
const ST_STRAIGHTFACECOUNT = Math.floor(35 / 2);
const ST_TURNCOUNT = 35;
const ST_RAMPAGEDELAY = 2 * 35;
const ST_MUCHPAIN = 20;
const ANG180 = 0x80000000 >>> 0;
const ANG45 = 0x20000000 >>> 0;

export function buildStFaceLumpNames(): string[] {
  const names: string[] = [];
  for (let i = 0; i < ST_NUMPAINFACES; i++) {
    for (let j = 0; j < ST_NUMSTRAIGHTFACES; j++) {
      names.push(`STFST${i}${j}`);
    }
    names.push(`STFTR${i}0`, `STFTL${i}0`, `STFOUCH${i}`, `STFEVL${i}`, `STFKILL${i}`);
  }
  names.push('STFGOD0', 'STFDEAD0');
  return names;
}

function calcPainOffset(health: number): number {
  const h = health > 100 ? 100 : health;
  return ST_FACESTRIDE * Math.floor(((100 - h) * ST_NUMPAINFACES) / 101);
}

function pointToAngleBam(px: number, py: number, tx: number, ty: number): number {
  const dx = tx - px;
  const dy = ty - py;
  let rad = Math.atan2(dy, dx);
  if (rad < 0) rad += 2 * Math.PI;
  return Math.floor((rad / (2 * Math.PI)) * 0x100000000) >>> 0;
}

export interface StFaceInput {
  health: number;
  /** Health at end of previous tick (like `st_oldhealth` before ST_Ticker assigns it). */
  healthPrevTick: number;
  damageCount: number;
  bonusCount: number;
  weaponJustPicked?: boolean;
  attackHeld: boolean;
  invulnTics: number;
  angleBam: number;
  playerX: number;
  playerY: number;
  playerMo?: Mobj;
  damageAttacker?: Mobj;
}

export class StFaceWidgetState {
  facecount = 0;
  faceindex = 0;
  priority = 0;
  lastattackdown = -1;

  tick(input: StFaceInput): number {
    let i: number;
    let diffang: number;
    let badguyangle: number;
    const bigPain = input.healthPrevTick - input.health > ST_MUCHPAIN;

    if (this.priority < 10) {
      if (!input.health) {
        this.priority = 9;
        this.faceindex = ST_DEADFACE;
        this.facecount = 1;
      }
    }

    if (this.priority < 9) {
      if (input.bonusCount && input.weaponJustPicked) {
        this.priority = 8;
        this.facecount = ST_EVILGRINCOUNT;
        this.faceindex = calcPainOffset(input.health) + ST_EVILGRINOFFSET;
      }
    }

    if (this.priority < 8) {
      const att = input.damageAttacker;
      if (input.damageCount && att && input.playerMo && att !== input.playerMo) {
        this.priority = 7;

        if (bigPain) {
          this.facecount = ST_TURNCOUNT;
          this.faceindex = calcPainOffset(input.health) + ST_OUCHOFFSET;
        } else {
          badguyangle = pointToAngleBam(
            input.playerX,
            input.playerY,
            FixedToFloat(att.x),
            FixedToFloat(att.y)
          );
          const playerAngle = input.angleBam >>> 0;
          if (badguyangle > playerAngle) {
            diffang = (badguyangle - playerAngle) >>> 0;
            i = diffang > ANG180 ? 1 : 0;
          } else {
            diffang = (playerAngle - badguyangle) >>> 0;
            i = diffang <= ANG180 ? 1 : 0;
          }
          this.facecount = ST_TURNCOUNT;
          this.faceindex = calcPainOffset(input.health);
          if (diffang < ANG45) {
            this.faceindex += ST_RAMPAGEOFFSET;
          } else if (i) {
            this.faceindex += ST_TURNOFFSET;
          } else {
            this.faceindex += ST_TURNOFFSET + 1;
          }
        }
      }
    }

    if (this.priority < 7) {
      if (input.damageCount) {
        if (bigPain) {
          this.priority = 7;
          this.facecount = ST_TURNCOUNT;
          this.faceindex = calcPainOffset(input.health) + ST_OUCHOFFSET;
        } else {
          this.priority = 6;
          this.facecount = ST_TURNCOUNT;
          this.faceindex = calcPainOffset(input.health) + ST_RAMPAGEOFFSET;
        }
      }
    }

    if (this.priority < 6) {
      if (input.attackHeld) {
        if (this.lastattackdown === -1) {
          this.lastattackdown = ST_RAMPAGEDELAY;
        } else if (!--this.lastattackdown) {
          this.priority = 5;
          this.faceindex = calcPainOffset(input.health) + ST_RAMPAGEOFFSET;
          this.facecount = 1;
          this.lastattackdown = 1;
        }
      } else {
        this.lastattackdown = -1;
      }
    }

    if (this.priority < 5 && input.invulnTics > 0) {
      this.priority = 4;
      this.faceindex = ST_GODFACE;
      this.facecount = 1;
    }

    if (!this.facecount) {
      this.faceindex = calcPainOffset(input.health) + (mRandom() % ST_NUMSTRAIGHTFACES);
      this.facecount = ST_STRAIGHTFACECOUNT;
      this.priority = 0;
    }

    this.facecount--;
    return this.faceindex;
  }
}
