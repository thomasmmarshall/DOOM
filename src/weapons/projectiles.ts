/**
 * Player-fired projectiles (rocket, plasma, BFG ball)
 * Based on linuxdoom-1.10 MT_ROCKET / MT_PLASMA / MT_BFG + A_Explode / A_BFGSpray
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import { doomAngleToThreeRadians } from '../core/coordinates';
import { pRandom } from '../core';
import { FixedToFloat, FloatToFixed } from '../core/fixed';
import type { MapData } from '../level/types';
import { findSectorAtPoint } from '../level';
import { damageActor } from '../game/Damage';
import { getRayToWallDistance } from './WeaponSystem';

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

    const wallT = getRayToWallDistance(ox, oy, dirX, dirY, step + 0.01, mapData);
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
        radiusAttack(hx, hy, 128, owner, all);
        bfgSprayApprox(owner, hx, hy, all);
      }
      m.removed = true;
      return;
    }

    if (hitWall) {
      const hx = ox + dirX * Math.max(0, wallT - 0.05);
      const hy = oy + dirY * Math.max(0, wallT - 0.05);
      if (kind === 'rocket' || kind === 'bfg') {
        radiusAttack(hx, hy, 128, owner, all);
        if (kind === 'bfg') {
          bfgSprayApprox(owner, hx, hy, all);
        }
      }
      m.removed = true;
      return;
    }

    m.x = FloatToFixed(nx);
    m.y = FloatToFixed(ny);
  });
}

/** Rough cone damage toward enemies (full BFG does traces from player). */
function bfgSprayApprox(player: Mobj, _bx: number, _by: number, all: Mobj[]): void {
  const pa = doomAngleToThreeRadians(player.angle);
  const ax = Math.cos(pa);
  const ay = Math.sin(pa);
  const px = FixedToFloat(player.x);
  const py = FixedToFloat(player.y);

  for (const t of all) {
    if (t === player || t.removed) continue;
    if (!(t.flags & MobjFlags.SHOOTABLE) || t.health <= 0) continue;

    const tx = FixedToFloat(t.x);
    const ty = FixedToFloat(t.y);
    const dx = tx - px;
    const dy = ty - py;
    const dist = Math.hypot(dx, dy);
    if (dist < 16 || dist > 2048) continue;

    const nx = dx / dist;
    const ny = dy / dist;
    const dot = nx * ax + ny * ay;
    if (dot < 0.3) continue;

    damageActor(t, 40 + (pRandom() % 120), player);
  }
}
