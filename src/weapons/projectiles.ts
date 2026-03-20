/**
 * Player-fired projectiles (rocket, plasma, BFG ball)
 * Based on linuxdoom-1.10 MT_ROCKET / MT_PLASMA / MT_BFG + A_Explode / A_BFGSpray
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import type { Angle } from '../core';
import { doomAngleToThreeRadians, pointToAngleBam } from '../core/coordinates';
import { pRandom } from '../core';
import { FixedToFloat, FloatToFixed } from '../core/fixed';
import type { MapData } from '../level/types';
import { findSectorAtPoint } from '../level';
import { damageActor } from '../game/Damage';
import { getRayToWallDistance, performHitscan } from './WeaponSystem';

export type ProjectileKind = 'rocket' | 'plasma' | 'bfg';

const ROCKET_SPEED = 20;
const PLASMA_SPEED = 25;
const BFG_SPEED = 25;

/** Chebyshev + target radius, damage = bombDamage - dist (like PIT_RadiusAttack). */
export function radiusAttack(
  spotX: number,
  spotY: number,
  bombDamage: number,
  source: Mobj | undefined,
  allMobjs: Mobj[]
): void {
  for (const thing of allMobjs) {
    if (thing.removed) continue;
    if (!(thing.flags & MobjFlags.SHOOTABLE)) continue;
    if (thing.health <= 0) continue;

    const dx = Math.abs(FixedToFloat(thing.x) - spotX);
    const dy = Math.abs(FixedToFloat(thing.y) - spotY);
    let dist = Math.max(dx, dy) - FixedToFloat(thing.radius);
    if (dist < 0) dist = 0;
    if (dist >= bombDamage) continue;

    const dmg = bombDamage - dist;
    if (dmg > 0) {
      damageActor(thing, dmg, source);
    }
  }
}

function raySegmentHitsCircle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (dx * fx + dy * fy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-8) return false;
  const s = Math.sqrt(disc);
  const t0 = (-b - s) / (2 * a);
  const t1 = (-b + s) / (2 * a);
  const inSeg = (t: number) => t >= 0 && t <= 1;
  return inSeg(t0) || inSeg(t1);
}

const IMP_FIREBALL_SPEED = 10;

/** MT_TROOPSHOT-style imp fireball (p_enemy.c A_TroopAttack missile). */
export function spawnImpFireball(
  actor: Mobj,
  target: Mobj,
  mapData: MapData,
  getAllMobjs: () => Mobj[],
  addWorldMobj: (mobj: Mobj, thinker: (m: Mobj) => void) => void
): void {
  const ax = FixedToFloat(actor.x);
  const ay = FixedToFloat(actor.y);
  const tx = FixedToFloat(target.x);
  const ty = FixedToFloat(target.y);
  const angBam = pointToAngleBam(ax, ay, tx, ty);
  const rad = doomAngleToThreeRadians(angBam);
  const px = ax + Math.cos(rad) * 24;
  const py = ay + Math.sin(rad) * 24;
  const pz = FixedToFloat(actor.z) + 32;

  const sectorIndex = findSectorAtPoint(px, py, mapData);
  const owner = actor;

  const proj: Mobj = {
    x: FloatToFixed(px),
    y: FloatToFixed(py),
    z: FloatToFixed(pz),
    angle: angBam as Angle,
    momx: FloatToFixed(Math.cos(rad) * IMP_FIREBALL_SPEED),
    momy: FloatToFixed(Math.sin(rad) * IMP_FIREBALL_SPEED),
    momz: 0,
    radius: FloatToFixed(6),
    height: FloatToFixed(8),
    floorz: actor.floorz,
    ceilingz: actor.ceilingz,
    flags: MobjFlags.MISSILE | MobjFlags.NOGRAVITY | MobjFlags.DROPOFF,
    health: 1000,
    type: 20103,
    sprite: 'BAL1',
    frame: 'A',
    rotation: 0,
    sectorIndex: sectorIndex >= 0 ? sectorIndex : undefined,
  };

  addWorldMobj(proj, (m) => {
    if (m.removed) return;

    const ox = FixedToFloat(m.x);
    const oy = FixedToFloat(m.y);
    const oz = FixedToFloat(m.z);

    const vx = FixedToFloat(m.momx);
    const vy = FixedToFloat(m.momy);
    const step = Math.hypot(vx, vy);
    if (step < 0.001) {
      m.removed = true;
      return;
    }

    const nx = ox + vx;
    const ny = oy + vy;
    const dirX = vx / step;
    const dirY = vy / step;

    const wallT = getRayToWallDistance(ox, oy, dirX, dirY, step + 0.01, mapData, oz + FixedToFloat(m.height) / 2);
    let hitDist = step + 0.01;
    let hitThing: Mobj | undefined;

    const all = getAllMobjs();
    for (const t of all) {
      if (t === m || t === owner || t.removed) continue;
      if (!(t.flags & MobjFlags.SHOOTABLE)) continue;
      if (t.health <= 0) continue;

      const txx = FixedToFloat(t.x);
      const tyy = FixedToFloat(t.y);
      const tr = FixedToFloat(t.radius);
      const tz = FixedToFloat(t.z);
      const th = FixedToFloat(t.height);

      if (!raySegmentHitsCircle(ox, oy, nx, ny, txx, tyy, tr)) continue;
      if (oz < tz || oz > tz + th) continue;

      const tAlong = (txx - ox) * dirX + (tyy - oy) * dirY;
      if (tAlong >= 0 && tAlong < hitDist) {
        hitDist = tAlong;
        hitThing = t;
      }
    }

    const hitWall = wallT < hitDist && wallT <= step;

    if (hitThing && hitDist <= step) {
      // linuxdoom MT_TROOPSHOT damage + impact (roughly 3–24 like vanilla fireball).
      const dmg = 3 * ((pRandom() % 8) + 1);
      damageActor(hitThing, dmg, owner);
      m.removed = true;
      return;
    }

    if (hitWall) {
      m.removed = true;
      return;
    }

    m.x = FloatToFixed(nx);
    m.y = FloatToFixed(ny);
  });
}

export function spawnPlayerProjectile(
  player: Mobj,
  kind: ProjectileKind,
  mapData: MapData,
  getAllMobjs: () => Mobj[],
  addWorldMobj: (mobj: Mobj, thinker: (m: Mobj) => void) => void
): void {
  const rad = doomAngleToThreeRadians(player.angle);
  const speed = kind === 'rocket' ? ROCKET_SPEED : kind === 'plasma' ? PLASMA_SPEED : BFG_SPEED;
  const px = FixedToFloat(player.x);
  const py = FixedToFloat(player.y);
  const pz = FixedToFloat(player.z) + 32;

  const sectorIndex = findSectorAtPoint(px, py, mapData);
  const sprite = kind === 'rocket' ? 'MISL' : kind === 'plasma' ? 'PLSS' : 'BFS1';
  const radiusF = kind === 'rocket' ? 11 : 13;

  const proj: Mobj = {
    x: FloatToFixed(px + Math.cos(rad) * 24),
    y: FloatToFixed(py + Math.sin(rad) * 24),
    z: FloatToFixed(pz),
    angle: player.angle,
    momx: FloatToFixed(Math.cos(rad) * speed),
    momy: FloatToFixed(Math.sin(rad) * speed),
    momz: 0,
    radius: FloatToFixed(radiusF),
    height: FloatToFixed(8),
    floorz: player.floorz,
    ceilingz: player.ceilingz,
    flags: MobjFlags.MISSILE | MobjFlags.NOGRAVITY | MobjFlags.DROPOFF,
    health: 1000,
    type: kind === 'rocket' ? 20100 : kind === 'plasma' ? 20101 : 20102,
    sprite,
    frame: 'A',
    rotation: 0,
    sectorIndex: sectorIndex >= 0 ? sectorIndex : undefined,
  };

  const owner = player;

  addWorldMobj(proj, (m) => {
    if (m.removed) return;

    const ox = FixedToFloat(m.x);
    const oy = FixedToFloat(m.y);
    const oz = FixedToFloat(m.z);

    const vx = FixedToFloat(m.momx);
    const vy = FixedToFloat(m.momy);
    const step = Math.hypot(vx, vy);
    if (step < 0.001) {
      m.removed = true;
      return;
    }

    const nx = ox + vx;
    const ny = oy + vy;
    const dirX = vx / step;
    const dirY = vy / step;

    const wallT = getRayToWallDistance(ox, oy, dirX, dirY, step + 0.01, mapData, oz + FixedToFloat(m.height) / 2);
    let hitDist = step + 0.01;
    let hitThing: Mobj | undefined;

    const all = getAllMobjs();
    for (const t of all) {
      if (t === m || t === owner || t.removed) continue;
      if (!(t.flags & MobjFlags.SHOOTABLE)) continue;
      if (t.health <= 0) continue;

      const tx = FixedToFloat(t.x);
      const ty = FixedToFloat(t.y);
      const tr = FixedToFloat(t.radius);
      const tz = FixedToFloat(t.z);
      const th = FixedToFloat(t.height);

      if (!raySegmentHitsCircle(ox, oy, nx, ny, tx, ty, tr)) continue;
      if (oz < tz || oz > tz + th) continue;

      const tAlong = (tx - ox) * dirX + (ty - oy) * dirY;
      if (tAlong >= 0 && tAlong < hitDist) {
        hitDist = tAlong;
        hitThing = t;
      }
    }

    const hitWall = wallT < hitDist && wallT <= step;

    if (hitThing && hitDist <= step) {
      const hx = ox + dirX * Math.max(0, hitDist - 0.1);
      const hy = oy + dirY * Math.max(0, hitDist - 0.1);
      if (kind === 'plasma') {
        damageActor(hitThing, 5, owner);
      } else if (kind === 'rocket') {
        radiusAttack(hx, hy, 128, owner, all);
      } else {
        damageActor(hitThing, 100, owner);
        bfgSprayVanilla(owner, m.angle >>> 0, mapData, all);
      }
      m.removed = true;
      return;
    }

    if (hitWall) {
      const hx = ox + dirX * Math.max(0, wallT - 0.05);
      const hy = oy + dirY * Math.max(0, wallT - 0.05);
      if (kind === 'rocket') {
        radiusAttack(hx, hy, 128, owner, all);
      } else if (kind === 'bfg') {
        bfgSprayVanilla(owner, m.angle >>> 0, mapData, all);
      }
      m.removed = true;
      return;
    }

    m.x = FloatToFixed(nx);
    m.y = FloatToFixed(ny);
  });
}

/**
 * linuxdoom-1.10 `A_BFGSpray`: 40 `P_AimLineAttack`-style traces from the player
 * in a 90° fan centered on the ball's travel angle, each hit for sum of 15×((rand&7)+1).
 */
function bfgSprayVanilla(
  player: Mobj,
  ballAngleBam: number,
  mapData: MapData | undefined,
  allMobjs: Mobj[]
): void {
  const ANG90 = 0x40000000 >>> 0;
  const base = ballAngleBam >>> 0;
  const half = ANG90 >>> 1;
  const step = Math.floor(ANG90 / 40) >>> 0;

  for (let i = 0; i < 40; i++) {
    const an = (base - half + step * i) >>> 0;
    let damage = 0;
    for (let j = 0; j < 15; j++) {
      damage += (pRandom() & 7) + 1;
    }
    const result = performHitscan(player, an, damage, allMobjs, mapData, { accurate: true });
    if (result?.hit && result.target) {
      damageActor(result.target, damage, player);
    }
  }
}
