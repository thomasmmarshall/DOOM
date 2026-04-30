/**
 * Enemy AI State System
 * Based on linuxdoom-1.10/info.c, p_enemy.c (A_Chase, A_PosAttack, A_TroopAttack, …)
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import { FixedToFloat, pRandom } from '../core';
import { pointToAngleBam } from '../core/coordinates';
import type { MapData } from '../level/types';
import { checkLineOfSight } from '../physics/LineOfSight';
import { applyCollision, applyGravity, applyZMomentum } from '../physics';
import { damageActor } from '../game/Damage';
import {
  CHASE_XSPEED,
  CHASE_YSPEED,
  getChaseFrameTics,
  getMonsterChaseSpeed,
  getMonsterReactionTime,
} from '../game/mobjinfoMotion';
import { performHitscan } from '../weapons/WeaponSystem';
import { spawnImpFireball } from '../weapons/projectiles';

export enum AIState {
  IDLE = 'IDLE',
  CHASE = 'CHASE',
  ATTACK = 'ATTACK',
  PAIN = 'PAIN',
  DEAD = 'DEAD',
}

export interface EnemyAI {
  state: AIState;
  target?: Mobj;
  attackCooldown: number;
  painTicks: number;
  animationTicks: number;
  reactiontime: number;
  /** Countdown to next `P_Move` step; vanilla runs A_Chase only on RUN state transitions. */
  chaseMoveCooldown: number;
}

/** Optional: imp fireball + monster hitscans need world mobjs and spawner. */
export interface MonsterThinkContext {
  getAllMobjs: () => Mobj[];
  addWorldMobj: (mobj: Mobj, thinker: (m: Mobj) => void) => void;
}

// Vanilla p_local.h: MELEERANGE = 64*FRACUNIT, but check uses MELEERANGE-20+target.radius
const MELEERANGE = 64;

// Opposite direction table for P_NewChaseDir
const DI_NODIR = 8;
const opposite = [4, 5, 6, 7, 0, 1, 2, 3, DI_NODIR];
const diags = [5, 7, 1, 3]; // NW, NE, SW, SE

function getEnemyAI(enemy: Mobj): EnemyAI {
  if (!(enemy as any).ai) {
    (enemy as any).ai = {
      state: AIState.IDLE,
      attackCooldown: 0,
      painTicks: 0,
      animationTicks: 0,
      reactiontime: 0,
      chaseMoveCooldown: 0,
    } satisfies EnemyAI;
  }

  return (enemy as any).ai as EnemyAI;
}

const DEATH_FRAMES: Record<number, string> = {
  2035: 'B',
  3001: 'L',
  3002: 'M',
  3004: 'L',
  9: 'L',
};

function updateMonsterFrame(enemy: Mobj, ai: EnemyAI): void {
  if (enemy.health <= 0) {
    enemy.frame = DEATH_FRAMES[enemy.type] ?? 'L';
    return;
  }

  if (ai.state === AIState.PAIN) {
    enemy.frame = 'G';
    return;
  }

  if (ai.state === AIState.ATTACK) {
    enemy.frame = 'E';
    return;
  }

  ai.animationTicks = (ai.animationTicks + 1) % 16;
  enemy.frame = ai.animationTicks < 8 ? 'A' : 'B';
}

/**
 * P_CheckMissileRange from p_enemy.c — distance-based probability for ranged attacks.
 */
function checkMissileRange(enemy: Mobj, target: Mobj): boolean {
  if (enemy.flags & MobjFlags.JUSTHIT) {
    enemy.flags &= ~MobjFlags.JUSTHIT;
    return true;
  }

  const ai = getEnemyAI(enemy);
  if (ai.reactiontime > 0) return false;

  let dist = Math.hypot(
    FixedToFloat(enemy.x - target.x),
    FixedToFloat(enemy.y - target.y)
  ) - 64;

  const hasMelee = enemy.type === 3001 || enemy.type === 3002;
  if (!hasMelee) dist -= 128;
  if (dist < 0) dist = 0;

  if (enemy.type === 3006) dist = dist / 2; // Lost Soul

  if (dist > 200) dist = 200;

  return pRandom() >= dist;
}

/**
 * P_NewChaseDir from p_enemy.c — picks movement direction toward target.
 */
function newChaseDir(enemy: Mobj, target: Mobj): number {
  const ai = getEnemyAI(enemy);
  const olddir: number = (ai as any).movedir ?? DI_NODIR;
  const turnaround = opposite[olddir] ?? DI_NODIR;

  const deltax = FixedToFloat(target.x - enemy.x);
  const deltay = FixedToFloat(target.y - enemy.y);

  let d1: number;
  let d2: number;

  if (deltax > 10) d1 = 0;
  else if (deltax < -10) d1 = 4;
  else d1 = DI_NODIR;

  if (deltay < -10) d2 = 6;
  else if (deltay > 10) d2 = 2;
  else d2 = DI_NODIR;

  if (d1 !== DI_NODIR && d2 !== DI_NODIR) {
    const diagIdx = ((deltay < 0) ? 2 : 0) + ((deltax > 0) ? 0 : 1);
    const diag = diags[diagIdx]!;
    if (diag !== turnaround) return diag;
  }

  if (pRandom() > 200 || Math.abs(deltay) > Math.abs(deltax)) {
    const temp = d1;
    d1 = d2;
    d2 = temp;
  }

  if (d1 !== DI_NODIR && d1 !== turnaround) return d1;
  if (d2 !== DI_NODIR && d2 !== turnaround) return d2;
  if (olddir !== DI_NODIR && olddir !== turnaround) return olddir;

  if (pRandom() & 1) {
    for (let tdir = 0; tdir <= 7; tdir++) {
      if (tdir !== turnaround) return tdir;
    }
  } else {
    for (let tdir = 7; tdir >= 0; tdir--) {
      if (tdir !== turnaround) return tdir;
    }
  }

  return turnaround !== DI_NODIR ? turnaround : 0;
}

function moveTowardPlayer(enemy: Mobj, player: Mobj, mapData: MapData): void {
  const ai = getEnemyAI(enemy);
  const movedir = newChaseDir(enemy, player);
  (ai as any).movedir = movedir;

  const speed = getMonsterChaseSpeed(enemy.type);
  enemy.momx = speed * CHASE_XSPEED[movedir]!;
  enemy.momy = speed * CHASE_YSPEED[movedir]!;
  applyCollision(enemy, mapData);
  applyGravity(enemy);
  applyZMomentum(enemy);
}

function applyMonsterHitscan(
  enemy: Mobj,
  target: Mobj,
  mapData: MapData,
  getAllMobjs: () => Mobj[],
  pelletCount: number
): void {
  const ex = FixedToFloat(enemy.x);
  const ey = FixedToFloat(enemy.y);
  const px = FixedToFloat(target.x);
  const py = FixedToFloat(target.y);
  const baseAng = pointToAngleBam(ex, ey, px, py);

  for (let i = 0; i < pelletCount; i++) {
    let ang = baseAng;
    ang = (ang + ((pRandom() - pRandom()) << 20)) >>> 0;
    const damage = ((pRandom() % 5) + 1) * 3;
    const res = performHitscan(enemy, ang, damage, getAllMobjs(), mapData);
    if (res?.hit && res.target) {
      damageActor(res.target, res.damage, enemy);
    }
  }
}

function resolveAttack(
  enemy: Mobj,
  player: Mobj,
  mapData: MapData,
  melee: boolean,
  ctx: MonsterThinkContext | undefined
): void {
  switch (enemy.type) {
    case 3004:
      if (ctx) applyMonsterHitscan(enemy, player, mapData, ctx.getAllMobjs, 1);
      break;
    case 9:
      if (ctx) applyMonsterHitscan(enemy, player, mapData, ctx.getAllMobjs, 3);
      break;
    case 3001:
      if (melee) {
        damageActor(player, (pRandom() % 8 + 1) * 3, enemy);
      } else if (ctx) {
        spawnImpFireball(enemy, player, mapData, ctx.getAllMobjs, ctx.addWorldMobj);
      }
      break;
    case 3002:
      if (melee) {
        damageActor(player, ((pRandom() % 10) + 1) * 4, enemy);
      }
      break;
    default:
      break;
  }
}

/** Fired the moment a monster lands an attack (for audio / feedback). */
export type MonsterAttackCallback = (enemy: Mobj, melee: boolean) => void;

const SOUND_RANGE = 768;

export function updateMonster(
  enemy: Mobj,
  player: Mobj,
  mapData: MapData,
  noiseOrigin?: { x: number; y: number },
  onAttack?: MonsterAttackCallback,
  ctx?: MonsterThinkContext
): void {
  const ai = getEnemyAI(enemy);

  if (enemy.health <= 0) {
    ai.state = AIState.DEAD;
    updateMonsterFrame(enemy, ai);
    return;
  }

  // Infighting: if damaged by another monster, retarget
  if (enemy.infightTarget && enemy.infightTarget !== player &&
      enemy.infightTarget.health > 0 && !enemy.infightTarget.removed) {
    ai.target = enemy.infightTarget;
    enemy.infightTarget = undefined;
  }

  // Threshold countdown (vanilla: can't switch targets while threshold > 0)
  if (enemy.threshold && enemy.threshold > 0) {
    enemy.threshold--;
  }

  if (enemy.flags & MobjFlags.JUSTHIT) {
    ai.state = AIState.PAIN;
    ai.painTicks = 4;
    ai.chaseMoveCooldown = 0;
    enemy.flags &= ~MobjFlags.JUSTHIT;
  }

  if (ai.attackCooldown > 0) {
    ai.attackCooldown--;
  }

  if (ai.reactiontime > 0) {
    ai.reactiontime--;
  }

  if (ai.painTicks > 0) {
    ai.painTicks--;
    ai.state = AIState.PAIN;
    if (ai.painTicks === 0) {
      ai.chaseMoveCooldown = 0;
    }
    updateMonsterFrame(enemy, ai);
    return;
  }

  const hasSight = checkLineOfSight(enemy, player, mapData);
  const dist = Math.hypot(
    FixedToFloat(player.x - enemy.x),
    FixedToFloat(player.y - enemy.y)
  );

  const react = getMonsterReactionTime(enemy.type);

  if (hasSight) {
    const firstSight = !ai.target;
    if (!ai.target) {
      ai.reactiontime = react;
    }
    ai.target = player;
    if (firstSight) {
      ai.chaseMoveCooldown = 0;
    }
  } else if (noiseOrigin && !ai.target && !(enemy.flags & MobjFlags.AMBUSH)) {
    const distToNoise = Math.hypot(
      FixedToFloat(enemy.x) - noiseOrigin.x,
      FixedToFloat(enemy.y) - noiseOrigin.y
    );
    if (distToNoise <= SOUND_RANGE) {
      ai.target = player;
      ai.reactiontime = react;
      ai.chaseMoveCooldown = 0;
    }
  }

  if (!ai.target) {
    ai.state = AIState.IDLE;
    updateMonsterFrame(enemy, ai);
    return;
  }

  // Vanilla melee range check: MELEERANGE - 20 + target radius
  const targetRadius = FixedToFloat(player.radius);
  const meleeCheckDist = MELEERANGE - 20 + targetRadius;
  const inMelee = dist <= meleeCheckDist && hasSight;

  const canAttack =
    hasSight &&
    ai.attackCooldown <= 0 &&
    ai.reactiontime <= 0;

  // Use vanilla P_CheckMissileRange (distance-based probability)
  const missileOk = canAttack && checkMissileRange(enemy, player);

  let shouldAttack = false;
  let melee = false;

  switch (enemy.type) {
    case 3002: // Demon - melee only
      shouldAttack = canAttack && inMelee;
      melee = true;
      break;
    case 3001: // Imp - melee + missile
      if (canAttack && inMelee) {
        shouldAttack = true;
        melee = true;
      } else {
        shouldAttack = missileOk;
        melee = false;
      }
      break;
    case 3004: // Zombieman
    case 9:    // Shotgun Guy
      shouldAttack = missileOk;
      melee = false;
      break;
    default:
      if (canAttack && inMelee) {
        shouldAttack = true;
        melee = true;
      } else {
        shouldAttack = missileOk;
        melee = false;
      }
      break;
  }

  if (shouldAttack) {
    ai.state = AIState.ATTACK;
    ai.attackCooldown = enemy.type === 9 ? 56 : 48;
    ai.chaseMoveCooldown = 0;
    onAttack?.(enemy, melee);
    resolveAttack(enemy, player, mapData, melee, ctx);
  } else {
    ai.state = AIState.CHASE;
    const stride = getChaseFrameTics(enemy.type);
    if (ai.chaseMoveCooldown > 0) {
      ai.chaseMoveCooldown--;
      enemy.momx = 0;
      enemy.momy = 0;
      applyGravity(enemy);
      applyZMomentum(enemy);
    } else {
      moveTowardPlayer(enemy, player, mapData);
      ai.chaseMoveCooldown = stride - 1;
    }
  }

  updateMonsterFrame(enemy, ai);
}

export function monsterThinker(_mobj: Mobj): void {
  // Monster logic is wired from the main game loop so it has player/map context.
}
