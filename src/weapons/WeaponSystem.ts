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

/**
 * Distance along ray to first wall hit, or maxRange if none.
 * @param shootZ — map Z used for two-sided openings (PTR_ShootTraverse, aimslope 0).
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
    if (line.sidenum[1] === -1) {
      minT = t;
      continue;
    }
    const frontSector = mapData.sectors[mapData.sidedefs[line.sidenum[0]].sector];
    const backSector = mapData.sectors[mapData.sidedefs[line.sidenum[1]].sector];
    const frontFloor = frontSector.floorheight;
    const backFloor = backSector.floorheight;
    const frontCeil = frontSector.ceilingheight;
    const backCeil = backSector.ceilingheight;
    const openBottom = Math.max(frontFloor, backFloor);
    const openTop = Math.min(frontCeil, backCeil);
    if (openTop <= openBottom) {
      minT = t;
      continue;
    }
    // Horizontal trace: same tests as PTR_ShootTraverse with aimslope == 0.
    let blocked = false;
    if (frontFloor !== backFloor && openBottom > shootZ) {
      blocked = true;
    }
    if (!blocked && frontCeil !== backCeil && openTop < shootZ) {
      blocked = true;
    }
    if (blocked) {
      minT = t;
    }
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
  angleBam: number,
  damage: number,
  allMobjs: Mobj[],
  mapData: MapData | undefined,
  options?: { accurate?: boolean; maxRange?: number; spreadBits?: number }
): HitscanResult | null {
  const accurate = options?.accurate ?? false;
  const range = options?.maxRange ?? 2048;
  const spreadBits = options?.spreadBits;

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

  const wallHitDist = mapData ? getRayToWallDistance(startX, startY, dirX, dirY, range, mapData, startZ) : range;

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
