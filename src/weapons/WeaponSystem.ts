/**
 * Weapon System
 * Manages player weapons and firing
 * Based on linuxdoom-1.10/p_pspr.c
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import { FixedToFloat } from '../core/fixed';
import type { MapData } from '../level/types';
import { checkLineOfSight } from '../physics/LineOfSight';

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

/**
 * Perform hitscan attack
 * Instant-hit weapon like pistol, shotgun, chaingun
 * @param source - Attacker (usually player)
 * @param angle - Angle to fire in (radians)
 * @param damage - Base damage
 * @param spread - Angular spread in radians
 * @param allMobjs - List of all map objects to check for hits
 * @returns Hit result or null if nothing hit
 */
export function performHitscan(
  source: Mobj,
  angle: number,
  damage: number,
  spread: number = 0,
  allMobjs: Mobj[] = [],
  mapData?: MapData
): HitscanResult | null {
  // Calculate direction with spread
  const finalAngle = angle + (Math.random() - 0.5) * spread;

  // Cast ray from source
  const range = 2048; // Maximum range
  const startX = FixedToFloat(source.x);
  const startY = FixedToFloat(source.y);
  const startZ = FixedToFloat(source.z) + 32; // Eye height

  const dirX = Math.cos(finalAngle);
  const dirY = Math.sin(finalAngle);

  // Find closest shootable target along the ray
  let closestDist = range;
  let closestTarget: Mobj | undefined;

  for (const target of allMobjs) {
    // Can't shoot self
    if (target === source) continue;

    // Skip non-shootable
    if (!(target.flags & MobjFlags.SHOOTABLE)) continue;

    // Skip dead things
    if (target.health <= 0) continue;

    // Get target position
    const targetX = FixedToFloat(target.x);
    const targetY = FixedToFloat(target.y);
    const targetZ = FixedToFloat(target.z);
    const targetHeight = FixedToFloat(target.height);

    // Calculate distance to target
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > closestDist) continue;

    // Calculate angle to target
    const targetAngle = Math.atan2(dy, dx);
    const angleDiff = Math.abs(finalAngle - targetAngle);

    // Check if target is in our firing cone (very narrow for hitscan)
    const targetRadius = FixedToFloat(target.radius);
    const angularSize = Math.atan2(targetRadius, dist);

    if (angleDiff < angularSize * 2) {
      // Check vertical alignment
      if (startZ >= targetZ && startZ <= targetZ + targetHeight) {
        if (mapData && !checkLineOfSight(source, target, mapData)) {
          continue;
        }
        closestDist = dist;
        closestTarget = target;
      }
    }
  }

  if (closestTarget) {
    return {
      hit: true,
      target: closestTarget,
      distance: closestDist,
      damage,
      hitPoint: {
        x: FixedToFloat(closestTarget.x),
        y: FixedToFloat(closestTarget.y),
        z: FixedToFloat(closestTarget.z),
      },
    };
  }

  // No hit - return ray endpoint
  return {
    hit: false,
    distance: range,
    damage,
    hitPoint: { x: startX + dirX * range, y: startY + dirY * range, z: startZ },
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
}
