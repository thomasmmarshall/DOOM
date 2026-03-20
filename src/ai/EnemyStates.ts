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
}

/** Optional: imp fireball + monster hitscans need world mobjs and spawner. */
export interface MonsterThinkContext {
  getAllMobjs: () => Mobj[];
  addWorldMobj: (mobj: Mobj, thinker: (m: Mobj) => void) => void;
}

const MELEERANGE = 64;
const MISSILERANGE = 2048;

function getEnemyAI(enemy: Mobj): EnemyAI {
  if (!(enemy as any).ai) {
    (enemy as any).ai = {
      state: AIState.IDLE,
      attackCooldown: 0,
      painTicks: 0,
      animationTicks: 0,
      reactiontime: 0,
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
 * Nearest cardinal/diagonal chase dir (0–7) matching linuxdoom P_NewChaseDir / P_Move octants.
 * Using the real xspeed/yspeed vectors avoids “homing missiles” that outrun vanilla A_Chase.
 */
function chaseMovedirToward(nx: number, ny: number): number {
  let best = -Infinity;
  let dir = 0;
  for (let k = 0; k < 8; k++) {
    const vx = CHASE_XSPEED[k]!;
    const vy = CHASE_YSPEED[k]!;
    const len = Math.hypot(vx, vy);
    const dot = (nx * vx + ny * vy) / len;
    if (dot > best) {
      best = dot;
      dir = k;
    }
  }
  return dir;
}

function moveTowardPlayer(enemy: Mobj, player: Mobj, mapData: MapData): void {
  const dx = FixedToFloat(player.x - enemy.x);
  const dy = FixedToFloat(player.y - enemy.y);
  const dist = Math.hypot(dx, dy);
  if (dist <= 1) {
    return;
  }

  const speed = getMonsterChaseSpeed(enemy.type);
  const movedir = chaseMovedirToward(dx / dist, dy / dist);
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

  if (enemy.flags & MobjFlags.JUSTHIT) {
    ai.state = AIState.PAIN;
    ai.painTicks = 4;
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
    if (!ai.target) {
      ai.reactiontime = react;
    }
    ai.target = player;
  } else if (noiseOrigin && !ai.target && !(enemy.flags & MobjFlags.AMBUSH)) {
    const distToNoise = Math.hypot(
      FixedToFloat(enemy.x) - noiseOrigin.x,
      FixedToFloat(enemy.y) - noiseOrigin.y
    );
    if (distToNoise <= SOUND_RANGE) {
      ai.target = player;
      ai.reactiontime = react;
    }
  }

  if (!ai.target) {
    ai.state = AIState.IDLE;
    updateMonsterFrame(enemy, ai);
    return;
  }

  const canAttack =
    hasSight &&
    ai.attackCooldown <= 0 &&
    ai.reactiontime <= 0 &&
    dist <= MISSILERANGE;

  const missileChance = (pRandom() % 100) < 18;
  const inMelee = dist <= MELEERANGE;

  let shouldAttack = false;
  let melee = false;

  switch (enemy.type) {
    case 3002:
      shouldAttack = canAttack && inMelee;
      melee = true;
      break;
    case 3001:
      shouldAttack = canAttack && (inMelee || missileChance);
      melee = inMelee;
      break;
    case 3004:
    case 9:
      shouldAttack = canAttack && missileChance;
      melee = false;
      break;
    default:
      shouldAttack = canAttack && missileChance;
      melee = inMelee;
      break;
  }

  if (shouldAttack) {
    ai.state = AIState.ATTACK;
    ai.attackCooldown = enemy.type === 9 ? 56 : 48;
    onAttack?.(enemy, melee);
    resolveAttack(enemy, player, mapData, melee, ctx);
  } else {
    ai.state = AIState.CHASE;
    moveTowardPlayer(enemy, player, mapData);
  }

  updateMonsterFrame(enemy, ai);
}

export function monsterThinker(_mobj: Mobj): void {
  // Monster logic is wired from the main game loop so it has player/map context.
}
