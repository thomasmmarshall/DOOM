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
  reactiontime: number; // Ticks before attacking when first seeing target (DOOM: 8)
}

// DOOM: Imp 8, Shotgun guy 15, Demon 10. We use 8 discrete dirs + movecount;
// we move every tick in exact direction so use ~1/3 speed to match feel.
const MONSTER_SPEED: Record<number, number> = {
  3004: 2,  // Imp
  9: 3,     // Shotgun guy
  3001: 2,  // Demon
};

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
  3001: 'M',
  3002: 'N',
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

function moveTowardPlayer(enemy: Mobj, player: Mobj, mapData: MapData): void {
  const dx = FixedToFloat(player.x - enemy.x);
  const dy = FixedToFloat(player.y - enemy.y);
  const dist = Math.hypot(dx, dy);
  if (dist <= 1) {
    return;
  }

  const speed = MONSTER_SPEED[enemy.type] ?? 2;
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

const SOUND_RANGE = 768; // DOOM: P_NoiseAlert propagates through sectors

export function updateMonster(
  enemy: Mobj,
  player: Mobj,
  mapData: MapData,
  noiseOrigin?: { x: number; y: number }
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

  // Wake by sight (P_LookForPlayers) or sound (P_NoiseAlert)
  if (hasSight) {
    if (!ai.target) {
      ai.reactiontime = 8; // DOOM: don't attack immediately when first seeing
    }
    ai.target = player;
  } else if (noiseOrigin && !ai.target && !(enemy.flags & MobjFlags.AMBUSH)) {
    const distToNoise = Math.hypot(
      FixedToFloat(enemy.x) - noiseOrigin.x,
      FixedToFloat(enemy.y) - noiseOrigin.y
    );
    if (distToNoise <= SOUND_RANGE) {
      ai.target = player;
      ai.reactiontime = 8;
    }
  }

  if (!ai.target) {
    ai.state = AIState.IDLE;
    updateMonsterFrame(enemy, ai);
    return;
  }

  const meleeRange = enemy.type === 3001 ? 64 : 96;
  const missileRange = enemy.type === 3001 ? 384 : 768;
  const canAttack =
    hasSight &&
    ai.attackCooldown <= 0 &&
    ai.reactiontime <= 0 &&
    dist <= missileRange;
  // DOOM: melee always; missile only 18% chance per check (p_enemy.c A_Chase)
  const missileChance = (pRandom() % 100) < 18;
  const shouldAttack = canAttack && (dist <= meleeRange || missileChance);

  if (shouldAttack) {
    ai.state = AIState.ATTACK;
    // Cooldown so enemy doesn't shoot again immediately (DOOM: attack state has duration)
    ai.attackCooldown = enemy.type === 9 ? 56 : 48;
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
