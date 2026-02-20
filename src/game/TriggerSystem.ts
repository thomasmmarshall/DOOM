/**
 * Trigger System
 * Handles line special activation (doors, platforms, switches)
 * Based on DOOM's linedef special types
 */

import type { MapData, MapLineDef } from '../level/types';
import type { DoorManager, DoorType } from '../sectors/DoorSystem';
import type { PlatformManager, PlatformType } from '../sectors/PlatformSystem';
import type { Mobj } from './mobj';
import { FixedToFloat } from '../core/fixed';

/**
 * Line activation types
 */
export enum ActivationType {
  USE = 'USE',         // Player presses use key
  WALK = 'WALK',       // Player walks over line
  SHOOT = 'SHOOT',     // Player shoots line
  PUSH = 'PUSH',       // Same as USE (alternative name)
}

/**
 * Line special categories
 */
export enum SpecialCategory {
  DOOR = 'DOOR',
  PLATFORM = 'PLATFORM',
  FLOOR = 'FLOOR',
  CEILING = 'CEILING',
  TELEPORT = 'TELEPORT',
  EXIT = 'EXIT',
  LIGHT = 'LIGHT',
}

/**
 * Common DOOM linedef special types
 * Source: https://doomwiki.org/wiki/Linedef_type
 */
export const LineSpecials = {
  // Doors
  DR_DOOR: 1,              // Door Open Wait Close (DR)
  W1_DOOR_OPEN: 2,         // Door Open Stay (W1)
  W1_DOOR_CLOSE: 3,        // Door Close Stay (W1)
  W1_DOOR_RAISE: 4,        // Door Open Wait Close (W1)
  SR_DOOR_RAISE: 63,       // Door Open Wait Close (SR)
  SR_DOOR_OPEN: 61,        // Door Open Stay (SR)
  SR_DOOR_CLOSE: 42,       // Door Close Stay (SR)

  // Platforms
  SR_PLATFORM_DOWN: 62,    // Platform Lower Wait Raise (SR)
  WR_PLATFORM_DOWN: 88,    // Platform Lower Wait Raise (WR)
  W1_PLATFORM_DOWN: 10,    // Platform Lower Wait Raise (W1)
  SR_PLATFORM_PERPETUAL: 87, // Platform Perpetual Raise (SR)
};

/**
 * Line trigger manager
 */
export class TriggerSystem {
  private mapData: MapData;
  private doorManager: DoorManager;
  private platformManager: PlatformManager;
  private activatedLines: Set<number>;

  constructor(mapData: MapData, doorManager: DoorManager, platformManager: PlatformManager) {
    this.mapData = mapData;
    this.doorManager = doorManager;
    this.platformManager = platformManager;
    this.activatedLines = new Set(); // Track W1/S1 (once-only) triggers
  }

  /**
   * Try to activate a line by using it
   */
  useLine(player: Mobj, lineIndex: number): boolean {
    const line = this.mapData.linedefs[lineIndex];
    if (!line || line.special === 0) return false;

    // Check if player is close enough to use
    if (!this.isPlayerNearLine(player, lineIndex)) {
      return false;
    }

    return this.activateLine(lineIndex, ActivationType.USE, player);
  }

  /**
   * Check if player is crossing a line (walk triggers)
   */
  checkWalkTriggers(player: Mobj, oldX: number, oldY: number): void {
    const newX = FixedToFloat(player.x);
    const newY = FixedToFloat(player.y);

    // Check all linedefs for crossing
    for (let i = 0; i < this.mapData.linedefs.length; i++) {
      const line = this.mapData.linedefs[i];
      if (line.special === 0) continue;

      // Check if line crossed
      if (this.lineCrossed(oldX, oldY, newX, newY, i)) {
        this.activateLine(i, ActivationType.WALK, player);
      }
    }
  }

  /**
   * Activate a line special
   */
  private activateLine(lineIndex: number, activation: ActivationType, player: Mobj): boolean {
    const line = this.mapData.linedefs[lineIndex];
    if (!line || line.special === 0) return false;

    // Check activation type matches line special
    const validActivation = this.checkActivationType(line.special, activation);
    if (!validActivation) return false;

    // Check if already activated (W1/S1 types)
    const isOnceOnly = this.isOnceOnly(line.special);
    if (isOnceOnly && this.activatedLines.has(lineIndex)) {
      return false;
    }

    // Execute the special
    const success = this.executeSpecial(line, player);

    // Mark as activated if once-only
    if (success && isOnceOnly) {
      this.activatedLines.add(lineIndex);
    }

    return success;
  }

  /**
   * Execute a line special
   */
  private executeSpecial(line: MapLineDef, player: Mobj): boolean {
    const special = line.special;

    // Door specials
    if (special === LineSpecials.DR_DOOR ||
        special === LineSpecials.W1_DOOR_RAISE ||
        special === LineSpecials.SR_DOOR_RAISE) {
      return this.activateDoorByTag(line.tag, 'NORMAL');
    }

    if (special === LineSpecials.W1_DOOR_OPEN ||
        special === LineSpecials.SR_DOOR_OPEN) {
      return this.activateDoorByTag(line.tag, 'OPEN_STAY');
    }

    if (special === LineSpecials.W1_DOOR_CLOSE ||
        special === LineSpecials.SR_DOOR_CLOSE) {
      return this.activateDoorByTag(line.tag, 'CLOSE');
    }

    // Platform specials
    if (special === LineSpecials.SR_PLATFORM_DOWN ||
        special === LineSpecials.WR_PLATFORM_DOWN ||
        special === LineSpecials.W1_PLATFORM_DOWN) {
      return this.activatePlatformByTag(line.tag, 'LOWER_AND_WAIT');
    }

    if (special === LineSpecials.SR_PLATFORM_PERPETUAL) {
      return this.activatePlatformByTag(line.tag, 'PERPETUAL_RAISE');
    }

    console.warn(`Unhandled line special: ${special}`);
    return false;
  }

  /**
   * Activate all doors with matching tag
   */
  private activateDoorByTag(tag: number, doorType: string): boolean {
    if (tag === 0) return false;

    let activated = false;
    for (let i = 0; i < this.mapData.sectors.length; i++) {
      if (this.mapData.sectors[i].tag === tag) {
        const success = this.doorManager.activateDoor(i, doorType as DoorType);
        if (success) activated = true;
      }
    }
    return activated;
  }

  /**
   * Activate all platforms with matching tag
   */
  private activatePlatformByTag(tag: number, platformType: string): boolean {
    if (tag === 0) return false;

    let activated = false;
    for (let i = 0; i < this.mapData.sectors.length; i++) {
      if (this.mapData.sectors[i].tag === tag) {
        const success = this.platformManager.activatePlatform(i, platformType as PlatformType);
        if (success) activated = true;
      }
    }
    return activated;
  }

  /**
   * Check if activation type matches line special
   */
  private checkActivationType(special: number, activation: ActivationType): boolean {
    const prefix = Math.floor(special / 100);

    // DR = Door Repeatable (use)
    // W1/WR = Walk Once/Repeatable
    // S1/SR = Switch Once/Repeatable

    // For simplicity, check first digit of special
    if (special === 1) return activation === ActivationType.USE; // DR

    // W1/WR types (walk triggers)
    const walkSpecials = [2, 3, 4, 10, 88];
    if (walkSpecials.includes(special)) {
      return activation === ActivationType.WALK;
    }

    // SR types (switch/use triggers)
    const useSpecials = [61, 62, 63, 42, 87];
    if (useSpecials.includes(special)) {
      return activation === ActivationType.USE;
    }

    return false;
  }

  /**
   * Check if special can only be activated once
   */
  private isOnceOnly(special: number): boolean {
    // W1 and S1 types are once-only
    const onceOnlySpecials = [2, 3, 4, 10]; // W1 types
    return onceOnlySpecials.includes(special);
  }

  /**
   * Check if player is near enough to use a line
   */
  private isPlayerNearLine(player: Mobj, lineIndex: number): boolean {
    const line = this.mapData.linedefs[lineIndex];
    const v1 = this.mapData.vertexes[line.v1];
    const v2 = this.mapData.vertexes[line.v2];

    const px = FixedToFloat(player.x);
    const py = FixedToFloat(player.y);

    // Distance from point to line segment
    const dist = this.pointToLineDistance(px, py, v1.x, v1.y, v2.x, v2.y);

    // Player can use lines within 64 units
    return dist <= 64;
  }

  /**
   * Check if player crossed a line
   */
  private lineCrossed(oldX: number, oldY: number, newX: number, newY: number, lineIndex: number): boolean {
    const line = this.mapData.linedefs[lineIndex];
    const v1 = this.mapData.vertexes[line.v1];
    const v2 = this.mapData.vertexes[line.v2];

    return this.lineSegmentsIntersect(oldX, oldY, newX, newY, v1.x, v1.y, v2.x, v2.y);
  }

  /**
   * Calculate distance from point to line segment
   */
  private pointToLineDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      // Line is a point
      const dpx = px - x1;
      const dpy = py - y1;
      return Math.sqrt(dpx * dpx + dpy * dpy);
    }

    // Project point onto line
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    const distX = px - projX;
    const distY = py - projY;

    return Math.sqrt(distX * distX + distY * distY);
  }

  /**
   * Check if two line segments intersect
   */
  private lineSegmentsIntersect(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number
  ): boolean {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);

    if (Math.abs(denom) < 0.0001) return false; // Parallel

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  }
}
