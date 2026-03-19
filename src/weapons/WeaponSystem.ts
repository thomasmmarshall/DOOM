/**
 * Weapon System
 * Manages player weapons and firing
 * Based on linuxdoom-1.10/p_pspr.c
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import { FixedToFloat } from '../core/fixed';
import type { MapData } from '../level/types';
import { ML_BLOCKING, ML_TWOSIDED } from '../level/types';
import { findSectorAtPoint } from '../level';
import {
  collectShootIntercepts,
  getBlockmapView,
  lineOpening,
  type BlockmapView,
} from '../level/pathTraverse';
import { pRandom } from '../core';
import { doomAngleToThreeRadians } from '../core/coordinates';
import { isSkyFlat } from '../renderer/doomLighting';

/**
 * Weapon types
 */
/** Matches linuxdoom-1.10 `weapontype_t` order (doom1; doom2 adds supershotgun at 8). */
export enum WeaponType {
  FIST = 0,
  PISTOL = 1,
  SHOTGUN = 2,
  CHAINGUN = 3,
  ROCKET_LAUNCHER = 4,
  PLASMA_RIFLE = 5,
  BFG9000 = 6,
  CHAINSAW = 7,
  SUPER_SHOTGUN = 8,
}

/**
 * Weapon state
 */
export enum WeaponState {
  READY = 'READY',       // Ready to fire
  FIRING = 'FIRING',     // Currently firing
  LOWERING = 'LOWERING', // Switching away
  RAISING = 'RAISING',   // Switching to
}

/**
 * Weapon info
 */
export interface WeaponInfo {
  type: WeaponType;
  ammoType?: 'bullets' | 'shells' | 'rockets' | 'cells';
  ammoPerShot: number;
  damage: number;
  fireDelay: number; // Ticks between shots
  sprite: string;
}

/**
 * Player weapon state
 */
export interface PlayerWeapon {
  currentWeapon: WeaponType;
  state: WeaponState;
  fireTimer: number; // Ticks until can fire again
  pendingWeapon?: WeaponType;
}

/**
 * Weapon info database
 */
/** Fire cooldown in tics before `READY` (approx. full attack state chain in original). */
export const WEAPON_INFO: Map<WeaponType, WeaponInfo> = new Map([
  [WeaponType.FIST, {
    type: WeaponType.FIST,
    ammoPerShot: 0,
    damage: 10,
    fireDelay: 22,
    sprite: 'PUNG',
  }],
  [WeaponType.PISTOL, {
    type: WeaponType.PISTOL,
    ammoType: 'bullets',
    ammoPerShot: 1,
    damage: 15,
    fireDelay: 4,
    sprite: 'PISG',
  }],
  [WeaponType.SHOTGUN, {
    type: WeaponType.SHOTGUN,
    ammoType: 'shells',
    ammoPerShot: 1,
    damage: 70,
    fireDelay: 44,
    sprite: 'SHTG',
  }],
  [WeaponType.CHAINGUN, {
    type: WeaponType.CHAINGUN,
    ammoType: 'bullets',
    ammoPerShot: 1,
    damage: 15,
    fireDelay: 4,
    sprite: 'CHGG',
  }],
  [WeaponType.ROCKET_LAUNCHER, {
    type: WeaponType.ROCKET_LAUNCHER,
    ammoType: 'rockets',
    ammoPerShot: 1,
    damage: 20,
    fireDelay: 20,
    sprite: 'MISG',
  }],
  [WeaponType.PLASMA_RIFLE, {
    type: WeaponType.PLASMA_RIFLE,
    ammoType: 'cells',
    ammoPerShot: 1,
    damage: 5,
    fireDelay: 23,
    sprite: 'PLSG',
  }],
  [WeaponType.BFG9000, {
    type: WeaponType.BFG9000,
    ammoType: 'cells',
    ammoPerShot: 40,
    damage: 100,
    fireDelay: 60,
    sprite: 'BFGG',
  }],
  [WeaponType.CHAINSAW, {
    type: WeaponType.CHAINSAW,
    ammoPerShot: 0,
    damage: 10,
    fireDelay: 4,
    sprite: 'SAWG',
  }],
  [WeaponType.SUPER_SHOTGUN, {
    type: WeaponType.SUPER_SHOTGUN,
    ammoType: 'shells',
    ammoPerShot: 2,
    damage: 80,
    fireDelay: 55,
    sprite: 'SHT2',
  }],
]);

/**
 * Create default player weapon state
 */
export function createPlayerWeapon(): PlayerWeapon {
  return {
    currentWeapon: WeaponType.PISTOL,
    state: WeaponState.READY,
    fireTimer: 0,
  };
}

/**
 * Update weapon state each tick
 */
export function updateWeapon(weapon: PlayerWeapon): void {
  // Decrease fire timer
  if (weapon.fireTimer > 0) {
    weapon.fireTimer--;
  }

  // Handle state transitions
  switch (weapon.state) {
    case WeaponState.FIRING:
      // Wait for fire delay
      if (weapon.fireTimer <= 0) {
        weapon.state = WeaponState.READY;
      }
      break;

    case WeaponState.RAISING:
      // TODO: Weapon raising animation
      weapon.state = WeaponState.READY;
      break;

    case WeaponState.LOWERING:
      // TODO: Weapon lowering animation
      if (weapon.pendingWeapon !== undefined) {
        weapon.currentWeapon = weapon.pendingWeapon;
        weapon.pendingWeapon = undefined;
        weapon.state = WeaponState.RAISING;
      }
      break;
  }
}

/**
 * Attempt to fire weapon
 */
export function fireWeapon(weapon: PlayerWeapon, player: Mobj): boolean {
  // Check if weapon is ready
  if (weapon.state !== WeaponState.READY || weapon.fireTimer > 0) {
    return false;
  }

  const info = WEAPON_INFO.get(weapon.currentWeapon);
  if (!info) return false;

  if (!canPlayerUseWeapon(player, weapon.currentWeapon)) {
    return false;
  }

  // Set firing state
  weapon.state = WeaponState.FIRING;
  weapon.fireTimer = info.fireDelay;

  console.log(`Fired ${WeaponType[weapon.currentWeapon]} - Damage: ${info.damage}`);

  return true;
}

/**
 * Switch to a different weapon
 */
export function switchWeapon(weapon: PlayerWeapon, newWeapon: WeaponType): void {
  if (weapon.currentWeapon === newWeapon) return;

  weapon.pendingWeapon = newWeapon;
  weapon.state = WeaponState.LOWERING;
}

export function canPlayerUseWeapon(player: Mobj, weaponType: WeaponType): boolean {
  if (!player.player) {
    return false;
  }

  if (!player.player.weapons[weaponType]) {
    return false;
  }

  const info = WEAPON_INFO.get(weaponType);
  if (!info?.ammoType) {
    return true;
  }

  return player.player.ammo[info.ammoType] >= info.ammoPerShot;
}

export function switchPlayerWeapon(player: Mobj, newWeapon: WeaponType): boolean {
  if (!player.player?.weapon) {
    return false;
  }

  if (!canPlayerUseWeapon(player, newWeapon)) {
    return false;
  }

  switchWeapon(player.player.weapon, newWeapon);
  return true;
}

export function consumeWeaponAmmo(player: Mobj, weaponType: WeaponType): void {
  const info = WEAPON_INFO.get(weaponType);
  if (!info?.ammoType || !player.player) {
    return;
  }

  player.player.ammo[info.ammoType] = Math.max(
    0,
    player.player.ammo[info.ammoType] - info.ammoPerShot
  );
}

/**
 * Shot origin height for P_LineAttack / P_AimLineAttack (linuxdoom p_map.c).
 * `shootz = z + (height>>1) + 8*FRACUNIT`
 */
export function lineAttackShootZ(source: Mobj): number {
  return FixedToFloat(source.z) + FixedToFloat(source.height) / 2 + 8;
}

/** P_AimLineAttack / P_BulletSlope aim distance: `16*64` map units (p_pspr.c). */
const AIMLINE_RANGE = 1024;

function traceEndXY(sx: number, sy: number, angleBam: number, dist: number): { ex: number; ey: number } {
  const rad = doomAngleToThreeRadians(angleBam >>> 0);
  return { ex: sx + Math.cos(rad) * dist, ey: sy + Math.sin(rad) * dist };
}

function aimLineAttackAtAngle(
  source: Mobj,
  angleBam: number,
  attackRange: number,
  shootZ: number,
  mapData: MapData,
  things: Mobj[],
  bm: BlockmapView | undefined
): { slope: number; target?: Mobj } {
  const sx = FixedToFloat(source.x);
  const sy = FixedToFloat(source.y);
  const { ex, ey } = traceEndXY(sx, sy, angleBam, attackRange);
  let topslope = 100 / 160;
  let bottomslope = -100 / 160;
  let aimslope = 0;
  let linetarget: Mobj | undefined;

  const intercepts = collectShootIntercepts(mapData, sx, sy, ex, ey, source, things, bm);

  for (const intr of intercepts) {
    const dist = intr.t * attackRange;
    if (dist <= 1e-6) continue;

    if (intr.kind === 'line') {
      const line = mapData.linedefs[intr.lineIndex];
      if ((line.flags & ML_TWOSIDED) === 0) {
        return { slope: 0 };
      }
      const open = lineOpening(mapData, intr.lineIndex);
      if (!open) {
        return { slope: 0 };
      }
      const { openBottom, openTop } = open;
      const front = mapData.sectors[mapData.sidedefs[line.sidenum[0]].sector];
      const back = mapData.sectors[mapData.sidedefs[line.sidenum[1]].sector];
      if (front.floorheight !== back.floorheight) {
        const slope = (openBottom - shootZ) / dist;
        if (slope > bottomslope) bottomslope = slope;
      }
      if (front.ceilingheight !== back.ceilingheight) {
        const slope = (openTop - shootZ) / dist;
        if (slope < topslope) topslope = slope;
      }
      if (topslope <= bottomslope) {
        return { slope: 0 };
      }
      continue;
    }

    const th = intr.thing;
    const tz = FixedToFloat(th.z);
    const thh = FixedToFloat(th.height);
    const thingtopslope = (tz + thh - shootZ) / dist;
    if (thingtopslope < bottomslope) continue;
    const thingbottomslope = (tz - shootZ) / dist;
    if (thingbottomslope > topslope) continue;
    let tt = thingtopslope;
    let tb = thingbottomslope;
    if (tt > topslope) tt = topslope;
    if (tb < bottomslope) tb = bottomslope;
    aimslope = (tt + tb) / 2;
    linetarget = th;
    return { slope: aimslope, target: linetarget };
  }

  return { slope: 0 };
}

function computeBulletSlope(
  source: Mobj,
  mapData: MapData,
  things: Mobj[],
  bm: BlockmapView | undefined,
  shootZ: number
): number {
  let an = source.angle >>> 0;
  let { slope, target } = aimLineAttackAtAngle(source, an, AIMLINE_RANGE, shootZ, mapData, things, bm);
  if (target) return slope;
  an = (an + (1 << 26)) >>> 0;
  ({ slope, target } = aimLineAttackAtAngle(source, an, AIMLINE_RANGE, shootZ, mapData, things, bm));
  if (target) return slope;
  an = (an - (2 << 26)) >>> 0;
  ({ slope } = aimLineAttackAtAngle(source, an, AIMLINE_RANGE, shootZ, mapData, things, bm));
  return slope;
}

function resolveShootTraverse(
  mapData: MapData,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  attackRange: number,
  shootZ: number,
  aimslope: number,
  source: Mobj,
  damage: number,
  things: Mobj[],
  bm: BlockmapView | undefined
): HitscanResult {
  const dx = ex - sx;
  const dy = ey - sy;
  const intercepts = collectShootIntercepts(mapData, sx, sy, ex, ey, source, things, bm);

  const wallPuffResult = (lineIndex: number, t: number): HitscanResult => {
    const adj = Math.max(0, t - 4 / attackRange);
    const hx = sx + dx * adj;
    const hy = sy + dy * adj;
    const hz = shootZ + aimslope * (adj * attackRange);
    const line = mapData.linedefs[lineIndex];
    const front = mapData.sectors[mapData.sidedefs[line.sidenum[0]].sector];
    if (isSkyFlat(front.ceilingpic)) {
      if (hz > front.ceilingheight) {
        return {
          hit: false,
          distance: attackRange,
          damage,
          hitPoint: { x: hx, y: hy, z: hz },
          hitSky: true,
        };
      }
      if (line.sidenum[1] !== -1) {
        const back = mapData.sectors[mapData.sidedefs[line.sidenum[1]].sector];
        if (isSkyFlat(back.ceilingpic)) {
          return {
            hit: false,
            distance: attackRange,
            damage,
            hitPoint: { x: hx, y: hy, z: hz },
            hitSky: true,
          };
        }
      }
    }
    return {
      hit: false,
      distance: t * attackRange,
      damage,
      hitPoint: { x: hx, y: hy, z: hz },
    };
  };

  for (const intr of intercepts) {
    const { t } = intr;
    if (t <= 0 || t > 1) continue;

    if (intr.kind === 'line') {
      const line = mapData.linedefs[intr.lineIndex];
      if ((line.flags & ML_TWOSIDED) === 0) {
        return wallPuffResult(intr.lineIndex, t);
      }
      const open = lineOpening(mapData, intr.lineIndex);
      if (!open) {
        return wallPuffResult(intr.lineIndex, t);
      }
      const dist = t * attackRange;
      const front = mapData.sectors[mapData.sidedefs[line.sidenum[0]].sector];
      const back = mapData.sectors[mapData.sidedefs[line.sidenum[1]].sector];
      const { openBottom, openTop } = open;

      if (front.floorheight !== back.floorheight) {
        const slope = (openBottom - shootZ) / dist;
        if (slope > aimslope) {
          return wallPuffResult(intr.lineIndex, t);
        }
      }
      if (front.ceilingheight !== back.ceilingheight) {
        const slope = (openTop - shootZ) / dist;
        if (slope < aimslope) {
          return wallPuffResult(intr.lineIndex, t);
        }
      }
      continue;
    }

    const th = intr.thing;
    if (!(th.flags & MobjFlags.SHOOTABLE) || th.health <= 0) continue;
    const dist = t * attackRange;
    const tz = FixedToFloat(th.z);
    const thh = FixedToFloat(th.height);
    const thingtopslope = (tz + thh - shootZ) / dist;
    if (thingtopslope < aimslope) continue;
    const thingbottomslope = (tz - shootZ) / dist;
    if (thingbottomslope > aimslope) continue;

    const adj = Math.max(0, t - 10 / attackRange);
    const hx = sx + dx * adj;
    const hy = sy + dy * adj;
    const hz = shootZ + aimslope * (adj * attackRange);
    return {
      hit: true,
      target: th,
      distance: t * attackRange,
      damage,
      hitPoint: { x: hx, y: hy, z: hz },
    };
  }

  const endX = sx + dx;
  const endY = sy + dy;
  return {
    hit: false,
    distance: attackRange,
    damage,
    hitPoint: {
      x: endX,
      y: endY,
      z: shootZ + aimslope * attackRange,
    },
    hitSky: isSkyCeilingPoint(endX, endY, mapData),
  };
}

/**
 * Distance along ray to first wall hit, or maxRange if none (projectiles; horizontal aimslope 0).
 */
export function getRayToWallDistance(
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  maxRange: number,
  mapData: MapData,
  shootZ: number
): number {
  const ex = startX + dirX * maxRange;
  const ey = startY + dirY * maxRange;
  const bm = getBlockmapView(mapData.blockmap);
  const intercepts = collectShootIntercepts(mapData, startX, startY, ex, ey, undefined, [], bm);

  for (const intr of intercepts) {
    if (intr.kind !== 'line') continue;
    const { t } = intr;
    const line = mapData.linedefs[intr.lineIndex];
    const twoSided = (line.flags & ML_TWOSIDED) !== 0;
    const blocking = (line.flags & ML_BLOCKING) !== 0;
    if (!twoSided || line.sidenum[1] === -1 || blocking) {
      return t * maxRange;
    }
    const open = lineOpening(mapData, intr.lineIndex);
    if (!open) {
      return t * maxRange;
    }
    const front = mapData.sectors[mapData.sidedefs[line.sidenum[0]].sector];
    const back = mapData.sectors[mapData.sidedefs[line.sidenum[1]].sector];
    const { openBottom, openTop } = open;
    if (openTop <= openBottom) {
      return t * maxRange;
    }
    let hit = false;
    if (front.floorheight !== back.floorheight && openBottom > shootZ) hit = true;
    if (!hit && front.ceilingheight !== back.ceilingheight && openTop < shootZ) hit = true;
    if (hit) return t * maxRange;
  }
  return maxRange;
}

/** First positive distance along ray (start + t*dir) to circle at (cx,cy) radius R, or Infinity. */
function rayCircleIntersection(
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  cx: number,
  cy: number,
  R: number
): number {
  const dx = startX - cx;
  const dy = startY - cy;
  const b = 2 * (dirX * dx + dirY * dy);
  const c = dx * dx + dy * dy - R * R;
  const disc = b * b - 4 * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / 2;
  return t > 0 ? t : Infinity;
}

/**
 * Perform hitscan (P_LineAttack + blockmap intercepts + P_BulletSlope).
 */
export function performHitscan(
  source: Mobj,
  angleBam: number,
  damage: number,
  allMobjs: Mobj[],
  mapData: MapData | undefined,
  options?: { accurate?: boolean; maxRange?: number; spreadBits?: number; aimMode?: 'bullet' | 'melee' }
): HitscanResult | null {
  const accurate = options?.accurate ?? false;
  const range = options?.maxRange ?? 2048;
  const spreadBits = options?.spreadBits;
  const aimMode = options?.aimMode ?? 'bullet';

  let ang = angleBam >>> 0;
  if (spreadBits) {
    ang = (ang + ((pRandom() - pRandom()) << spreadBits)) >>> 0;
  } else if (!accurate) {
    ang = (ang + ((pRandom() - pRandom()) << 18)) >>> 0;
  }

  const finalAngle = doomAngleToThreeRadians(ang);
  const startX = FixedToFloat(source.x);
  const startY = FixedToFloat(source.y);
  const startZ = lineAttackShootZ(source);
  const dirX = Math.cos(finalAngle);
  const dirY = Math.sin(finalAngle);
  const endX = startX + dirX * range;
  const endY = startY + dirY * range;

  if (!mapData) {
    let closestDist = range;
    let closestTarget: Mobj | undefined;
    for (const target of allMobjs) {
      if (target === source) continue;
      if (!(target.flags & MobjFlags.SHOOTABLE)) continue;
      if (target.health <= 0) continue;
      const targetX = FixedToFloat(target.x);
      const targetY = FixedToFloat(target.y);
      const targetZ = FixedToFloat(target.z);
      const targetHeight = FixedToFloat(target.height);
      const targetRadius = FixedToFloat(target.radius);
      const t = rayCircleIntersection(startX, startY, dirX, dirY, targetX, targetY, targetRadius);
      if (t <= 0 || t >= closestDist) continue;
      if (startZ < targetZ || startZ > targetZ + targetHeight) continue;
      closestDist = t;
      closestTarget = target;
    }
    if (closestTarget) {
      return {
        hit: true,
        target: closestTarget,
        distance: closestDist,
        damage,
        hitPoint: {
          x: startX + dirX * closestDist,
          y: startY + dirY * closestDist,
          z: FixedToFloat(closestTarget.z),
        },
      };
    }
    return {
      hit: false,
      distance: range,
      damage,
      hitPoint: { x: endX, y: endY, z: startZ },
    };
  }

  const bm = getBlockmapView(mapData.blockmap);
  const shootZ = startZ;
  const aimSlope =
    aimMode === 'melee'
      ? aimLineAttackAtAngle(source, ang, range, shootZ, mapData, allMobjs, bm).slope
      : computeBulletSlope(source, mapData, allMobjs, bm, shootZ);

  return resolveShootTraverse(
    mapData,
    startX,
    startY,
    endX,
    endY,
    range,
    shootZ,
    aimSlope,
    source,
    damage,
    allMobjs,
    bm
  );
}

/**
 * Result of a hitscan attack
 */
export interface HitscanResult {
  hit: boolean;
  target?: Mobj;
  distance: number;
  damage: number;
  hitPoint: { x: number; y: number; z: number };
  hitSky?: boolean;
}

function isSkyCeilingPoint(x: number, y: number, mapData: MapData): boolean {
  const sectorIndex = findSectorAtPoint(x, y, mapData);
  if (sectorIndex < 0) {
    return false;
  }

  return isSkyFlat(mapData.sectors[sectorIndex].ceilingpic);
}
