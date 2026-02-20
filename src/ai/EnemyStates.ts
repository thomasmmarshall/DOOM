/**
 * Enemy AI State System
 * Defines behavior states for monsters
 * Based on linuxdoom-1.10/info.c and p_enemy.c
 */

import type { Mobj } from '../game/mobj';
import type { Fixed } from '../core';

/**
 * AI State enumeration
 */
export enum AIState {
  IDLE = 'IDLE',           // Standing still, looking for targets
  SEE = 'SEE',             // Spotted player, moving to attack
  CHASE = 'CHASE',         // Chasing player
  MELEE = 'MELEE',         // Melee attack
  MISSILE = 'MISSILE',     // Ranged attack
  PAIN = 'PAIN',           // Taking damage reaction
  DEATH = 'DEATH',         // Death animation
  DEAD = 'DEAD',           // Corpse
}

/**
 * Enemy AI data attached to mobj
 */
export interface EnemyAI {
  state: AIState;
  target?: Mobj;           // Current target (usually player)
  moveDir: number;         // Current movement direction (0-7)
  moveCount: number;       // Ticks remaining for current movement
  reactionTime: number;    // Delay before acting
  threshold: number;       // Chase threshold
  lastKnownX: Fixed;       // Last known target X
  lastKnownY: Fixed;       // Last known target Y
}

/**
 * Create default enemy AI data
 */
export function createEnemyAI(): EnemyAI {
  return {
    state: AIState.IDLE,
    moveDir: 0,
    moveCount: 0,
    reactionTime: 0,
    threshold: 0,
    lastKnownX: 0,
    lastKnownY: 0,
  };
}

/**
 * AI Look - Search for targets
 * Based on A_Look from p_enemy.c
 */
export function AI_Look(enemy: Mobj, enemyAI: EnemyAI, player: Mobj): void {
  // TODO: Implement line-of-sight check
  // For now, simple distance check
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const distSq = (dx >> 16) * (dx >> 16) + (dy >> 16) * (dy >> 16);

  // If player is within range, spot them
  const SIGHT_RANGE = 1024 * 1024; // 1024 units squared
  if (distSq < SIGHT_RANGE) {
    enemyAI.target = player;
    enemyAI.state = AIState.SEE;
  }
}

/**
 * AI Chase - Move toward target
 * Based on A_Chase from p_enemy.c
 */
export function AI_Chase(enemy: Mobj, enemyAI: EnemyAI): void {
  if (!enemyAI.target) {
    enemyAI.state = AIState.IDLE;
    return;
  }

  // Simple pursuit - move toward target
  const dx = enemyAI.target.x - enemy.x;
  const dy = enemyAI.target.y - enemy.y;

  // Calculate direction (simplified)
  // In full DOOM, this uses 8-way directional movement
  const angle = Math.atan2(dy >> 16, dx >> 16);

  // Store for movement system to use
  enemy.angle = ((angle * (0xFFFFFFFF / (Math.PI * 2))) >>> 0) & 0xFFFFFFFF;

  // Check if close enough to attack
  const distSq = (dx >> 16) * (dx >> 16) + (dy >> 16) * (dy >> 16);
  const MELEE_RANGE = 64 * 64;
  const MISSILE_RANGE = 512 * 512;

  if (distSq < MELEE_RANGE) {
    enemyAI.state = AIState.MELEE;
  } else if (distSq < MISSILE_RANGE) {
    // Random chance to fire missile
    if (Math.random() < 0.1) { // 10% chance per tick
      enemyAI.state = AIState.MISSILE;
    }
  }
}

/**
 * AI Pain - React to damage
 */
export function AI_Pain(enemy: Mobj, enemyAI: EnemyAI): void {
  // Pain state is temporary, return to chase after a few ticks
  enemyAI.reactionTime = 8; // Pain animation lasts ~8 ticks

  // After pain, go back to chase
  setTimeout(() => {
    if (enemyAI.state === AIState.PAIN) {
      enemyAI.state = AIState.CHASE;
    }
  }, 8 * (1000 / 35)); // 8 ticks at 35Hz
}

/**
 * Monster thinker function
 * Main AI update called each tick
 */
export function monsterThinker(mobj: Mobj): void {
  // Get or create AI data
  if (!(mobj as any).ai) {
    (mobj as any).ai = createEnemyAI();
  }

  const ai = (mobj as any).ai as EnemyAI;

  // State machine
  switch (ai.state) {
    case AIState.IDLE:
      // Look for targets (player passed separately in game loop)
      break;

    case AIState.SEE:
      // Transition to chase
      ai.state = AIState.CHASE;
      break;

    case AIState.CHASE:
      AI_Chase(mobj, ai);
      break;

    case AIState.MELEE:
      // TODO: Implement melee attack
      ai.state = AIState.CHASE;
      break;

    case AIState.MISSILE:
      // TODO: Implement ranged attack
      ai.state = AIState.CHASE;
      break;

    case AIState.PAIN:
      // Pain state handled by AI_Pain
      break;

    case AIState.DEATH:
      // Death animation
      ai.state = AIState.DEAD;
      break;

    case AIState.DEAD:
      // Do nothing
      break;
  }
}
