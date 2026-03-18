/**
 * Enemy AI State System
 * Defines behavior states for monsters
 * Based on linuxdoom-1.10/info.c and p_enemy.c
 */

import type { Mobj } from '../game/mobj';
import { MobjFlags } from '../game/mobj';
import { FixedToFloat, FloatToFixed, pRandom } from '../core';
import type { MapData } from '../level/types';
import { checkLineOfSight } from '../physics/LineOfSight';
import { applyCollision, applyGravity, applyZMomentum } from '../physics';
import { damageActor } from '../game/Damage';

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
}

const MONSTER_SPEED: Record<number, number> = {
  3004: 8,
  9: 8,
  3001: 8,
};

function getEnemyAI(enemy: Mobj): EnemyAI {
  if (!(enemy as any).ai) {
    (enemy as any).ai = {
      state: AIState.IDLE,
      attackCooldown: 0,
      painTicks: 0,
      animationTicks: 0,
    } satisfies EnemyAI;
  }

  return (enemy as any).ai as EnemyAI;
}

function updateMonsterFrame(enemy: Mobj, ai: EnemyAI): void {
  if (enemy.health <= 0) {
    enemy.frame = enemy.type === 2035 ? 'B' : 'H';
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

function moveTowardPlayer(enemy: Mobj, player: Mobj, mapData: MapData): void {
  const dx = FixedToFloat(player.x - enemy.x);
  const dy = FixedToFloat(player.y - enemy.y);
  const dist = Math.hypot(dx, dy);
  if (dist <= 1) {
    return;
  }

  const speed = MONSTER_SPEED[enemy.type] ?? 8;
  enemy.momx = FloatToFixed((dx / dist) * speed);
  enemy.momy = FloatToFixed((dy / dist) * speed);
  applyCollision(enemy, mapData);
  applyGravity(enemy);
  applyZMomentum(enemy);
}

function attackPlayer(enemy: Mobj, player: Mobj): void {
  switch (enemy.type) {
    case 3004:
      damageActor(player, ((pRandom() % 4) + 1) * 2, enemy);
      break;
    case 9:
      damageActor(player, ((pRandom() % 3) + 1) * 6, enemy);
      break;
    case 3001:
      damageActor(player, 4 + (pRandom() % 4), enemy);
      break;
  }
}

export function updateMonster(enemy: Mobj, player: Mobj, mapData: MapData): void {
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

  if (hasSight) {
    ai.target = player;
  }

  if (!ai.target) {
    ai.state = AIState.IDLE;
    updateMonsterFrame(enemy, ai);
    return;
  }

  const meleeRange = enemy.type === 3001 ? 64 : 96;
  const missileRange = enemy.type === 3001 ? 384 : 768;
  const shouldAttack = hasSight && ai.attackCooldown <= 0 && dist <= missileRange;

  if (shouldAttack && (dist <= meleeRange || (pRandom() % 100) < 18)) {
    ai.state = AIState.ATTACK;
    ai.attackCooldown = enemy.type === 9 ? 30 : 24;
    attackPlayer(enemy, player);
  } else {
    ai.state = AIState.CHASE;
    moveTowardPlayer(enemy, player, mapData);
  }

  updateMonsterFrame(enemy, ai);
}

export function monsterThinker(_mobj: Mobj): void {
  // Monster logic is wired from the main game loop so it has player/map context.
}
