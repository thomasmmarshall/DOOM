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
import { pRandom } from '../core';
import { isSkyFlat } from '../renderer/doomLighting';

/**
 * Weapon types
 */
export enum WeaponType {
  FIST = 0,
  PISTOL = 1,
  SHOTGUN = 2,
  CHAINGUN = 3,
  ROCKET_LAUNCHER = 4,
  PLASMA_RIFLE = 5,
  BFG9000 = 6,
  CHAINSAW = 7,
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
export const WEAPON_INFO: Map<WeaponType, WeaponInfo> = new Map([
  [WeaponType.FIST, {
    type: WeaponType.FIST,
    ammoPerShot: 0,
    damage: 10,
    fireDelay: 10,
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
    fireDelay: 15,
    sprite: 'SHTG',
  }],
  [WeaponType.CHAINGUN, {
    type: WeaponType.CHAINGUN,
    ammoType: 'bullets',
    ammoPerShot: 1,
    damage: 15,
    fireDelay: 2,
    sprite: 'CHGG',
  }],
  [WeaponType.ROCKET_LAUNCHER, {
    type: WeaponType.ROCKET_LAUNCHER,
    ammoType: 'rockets',
    ammoPerShot: 1,
    damage: 20,
    fireDelay: 24,
    sprite: 'MISG',
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

/** Distance along ray to first wall hit, or maxRange if none. */
function getRayToWallDistance(
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  maxRange: number,
  mapData: MapData
): number {
  let minT = maxRange;
  for (const line of mapData.linedefs) {
    const v1 = mapData.vertexes[line.v1];
    const v2 = mapData.vertexes[line.v2];
    const segDx = v2.x - v1.x;
    const segDy = v2.y - v1.y;
    const denom = dirX * segDy - dirY * segDx;
    if (Math.abs(denom) < 1e-6) continue;
    const t = ((v1.x - startX) * segDy - (v1.y - startY) * segDx) / denom;
    const u = ((startX - v1.x) * dirY - (startY - v1.y) * dirX) / -denom;
    if (t < 0 || u < 0 || u > 1) continue;
    if (t >= minT) continue;
    const twoSided = (line.flags & ML_TWOSIDED) !== 0;
    const blocking = (line.flags & ML_BLOCKING) !== 0;
    if (!twoSided || blocking) {
      minT = t;
      continue;
    }
    if (line.sidenum[0] === -1) continue;
    const frontSector = mapData.sectors[mapData.sidedefs[line.sidenum[0]].sector];
    const frontFloor = frontSector.floorheight;
    const frontCeiling = frontSector.ceilingheight;
    if (line.sidenum[1] === -1) {
      minT = t;
      continue;
    }
    const backSector = mapData.sectors[mapData.sidedefs[line.sidenum[1]].sector];
    const openBottom = Math.max(frontFloor, backSector.floorheight);
    const openTop = Math.min(frontCeiling, backSector.ceilingheight);
    if (openTop <= openBottom) minT = t;
  }
  return minT;
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
 * Perform hitscan attack
 * Instant-hit weapon like pistol, shotgun, chaingun.
 * Uses ray-circle hit test and ray-vs-wall trace so walls block shots.
 */
export function performHitscan(
  source: Mobj,
  angle: number,
  damage: number,
  spread: number = 0,
  allMobjs: Mobj[] = [],
  mapData?: MapData
): HitscanResult | null {
  const spreadOffset = spread === 0 ? 0 : ((pRandom() - pRandom()) / 255) * spread;
  const finalAngle = angle + spreadOffset;

  const range = 2048;
  const startX = FixedToFloat(source.x);
  const startY = FixedToFloat(source.y);
  const startZ = FixedToFloat(source.z) + 32;

  const dirX = Math.cos(finalAngle);
  const dirY = Math.sin(finalAngle);

  const wallHitDist = mapData ? getRayToWallDistance(startX, startY, dirX, dirY, range, mapData) : range;

  let closestDist = wallHitDist;
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
    hitPoint: { x: startX + dirX * range, y: startY + dirY * range, z: startZ },
    hitSky: mapData ? isSkyCeilingPoint(startX + dirX * range, startY + dirY * range, mapData) : false,
  };
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
