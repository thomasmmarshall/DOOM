/**
 * Trigger System
 * Handles line special activation (doors, platforms, switches)
 * Based on DOOM's linedef special types
 */

import type { MapData, MapLineDef } from '../level/types';
import type { DoorManager } from '../sectors/DoorSystem';
import { DoorType } from '../sectors/DoorSystem';
import type { PlatformManager, PlatformType } from '../sectors/PlatformSystem';
import { findBackSectorForLine, findSectorsByTag } from '../sectors';
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
  S1_EXIT: 11,             // Exit level (switch once)
  W1_EXIT: 52,             // Exit level (walk once)
  W1_FLOOR_TURBO_LOWER: 36,
  SCROLL_WALL: 48,
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
  private onLevelExit?: () => void;

  constructor(
    mapData: MapData,
    doorManager: DoorManager,
    platformManager: PlatformManager,
    onLevelExit?: () => void
  ) {
    this.mapData = mapData;
    this.doorManager = doorManager;
    this.platformManager = platformManager;
    this.onLevelExit = onLevelExit;
    this.activatedLines = new Set(); // Track W1/S1 (once-only) triggers
  }

  /** True if this linedef type responds to the USE key (player-activated lines only). */
  isUseActivatableSpecial(special: number): boolean {
    if (special === 0) return false;
    return this.checkActivationType(special, ActivationType.USE);
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
    const success = this.executeSpecial(lineIndex, line, player);

    // Mark as activated if once-only
    if (success && isOnceOnly) {
      this.activatedLines.add(lineIndex);
    }

    return success;
  }

  /**
   * Execute a line special
   */
  private executeSpecial(lineIndex: number, line: MapLineDef, player: Mobj): boolean {
    const special = line.special;

    // Locked switch doors (blazing open by tag) — vanilla 99, 133–137
    if (
      special === 99 ||
      special === 133 ||
      special === 134 ||
      special === 135 ||
      special === 136 ||
      special === 137
    ) {
      if (line.tag === 0) return false;
      if (!this.playerHasKeyForLock(player, special)) return false;
      return this.activateDoorByTag(line.tag, DoorType.BLAZING_OPEN_STAY);
    }

    // Manual vertical doors (USE, back sector) — vanilla 26–28 locked, 31/32–34, 117/118
    if (special === 26 || special === 27 || special === 28) {
      if (!this.playerHasKeyForLock(player, special)) return false;
      return this.activateManualDoor(lineIndex, DoorType.NORMAL);
    }
    if (special === 31) {
      return this.activateManualDoor(lineIndex, DoorType.OPEN_STAY);
    }
    if (special === 32 || special === 33 || special === 34) {
      if (!this.playerHasKeyForLock(player, special)) return false;
      return this.activateManualDoor(lineIndex, DoorType.OPEN_STAY);
    }
    if (special === 117) {
      return this.activateManualDoor(lineIndex, DoorType.BLAZING);
    }
    if (special === 118) {
      return this.activateManualDoor(lineIndex, DoorType.BLAZING_OPEN_STAY);
    }

    // Door specials
    if (special === LineSpecials.DR_DOOR ||
        special === LineSpecials.W1_DOOR_RAISE ||
        special === LineSpecials.SR_DOOR_RAISE) {
      return line.tag === 0
        ? this.activateManualDoor(lineIndex, DoorType.NORMAL)
        : this.activateDoorByTag(line.tag, DoorType.NORMAL);
    }

    if (special === LineSpecials.W1_DOOR_OPEN ||
        special === LineSpecials.SR_DOOR_OPEN) {
      return this.activateDoorByTag(line.tag, DoorType.OPEN_STAY);
    }

    if (special === LineSpecials.W1_DOOR_CLOSE ||
        special === LineSpecials.SR_DOOR_CLOSE) {
      return this.activateDoorByTag(line.tag, DoorType.CLOSE);
    }

    // Platform specials
    if (special === LineSpecials.SR_PLATFORM_DOWN ||
        special === LineSpecials.WR_PLATFORM_DOWN ||
        special === LineSpecials.W1_PLATFORM_DOWN) {
      return this.activatePlatformByTag(line.tag, 'LOWER_AND_WAIT');
    }

    if (special === LineSpecials.W1_FLOOR_TURBO_LOWER) {
      return this.activatePlatformByTag(line.tag, 'TURBO_LOWER');
    }

    if (special === LineSpecials.SR_PLATFORM_PERPETUAL) {
      return this.activatePlatformByTag(line.tag, 'PERPETUAL_RAISE');
    }

    if (special === LineSpecials.S1_EXIT || special === LineSpecials.W1_EXIT) {
      this.onLevelExit?.();
      return true;
    }

    console.warn(`Unhandled line special: ${special}`);
    return false;
  }

  /**
   * Activate all doors with matching tag
   */
  private activateDoorByTag(tag: number, doorType: DoorType): boolean {
    if (tag === 0) return false;

    let activated = false;
    for (const sectorIndex of findSectorsByTag(this.mapData, tag)) {
      const success = this.doorManager.activateDoor(sectorIndex, doorType);
      if (success) activated = true;
    }
    return activated;
  }

  private activateManualDoor(lineIndex: number, doorType: DoorType): boolean {
    const sectorIndex = findBackSectorForLine(this.mapData, lineIndex);
    if (sectorIndex === null) {
      return false;
    }

    return this.doorManager.activateDoor(sectorIndex, doorType);
  }

  /** EV_DoLockedDoor-style key check (blue/red/yellow card or skull). */
  private playerHasKeyForLock(player: Mobj, special: number): boolean {
    const p = player.player;
    if (!p) return false;
    const k = p.keys;
    switch (special) {
      case 26:
      case 32:
      case 99:
      case 133:
        if (k.blueCard || k.blueSkull) return true;
        p.message = 'You need a blue key';
        return false;
      case 28:
      case 33:
      case 134:
      case 135:
        if (k.redCard || k.redSkull) return true;
        p.message = 'You need a red key';
        return false;
      case 27:
      case 34:
      case 136:
      case 137:
        if (k.yellowCard || k.yellowSkull) return true;
        p.message = 'You need a yellow key';
        return false;
      default:
        return true;
    }
  }

  /**
   * Activate all platforms with matching tag
   */
  private activatePlatformByTag(tag: number, platformType: string): boolean {
    if (tag === 0) return false;

    let activated = false;
    for (const sectorIndex of findSectorsByTag(this.mapData, tag)) {
      const success = this.platformManager.activatePlatform(sectorIndex, platformType as PlatformType);
      if (success) activated = true;
    }
    return activated;
  }

  /**
   * Check if activation type matches line special
   */
  private checkActivationType(special: number, activation: ActivationType): boolean {
    // DR = Door Repeatable (use)
    // W1/WR = Walk Once/Repeatable
    // S1/SR = Switch Once/Repeatable

    // For simplicity, check first digit of special
    if (special === 1 || special === 11) return activation === ActivationType.USE; // DR / Exit switch

    // W1/WR types (walk triggers)
    const walkSpecials = [2, 3, 4, 10, 36, 48, 52, 88];
    if (walkSpecials.includes(special)) {
      return activation === ActivationType.WALK;
    }

    // USE: switches + manual / locked doors (see p_switch.c P_UseSpecialLine)
    const useSpecials = [
      26, 27, 28, 31, 32, 33, 34, 61, 62, 63, 42, 87, 99, 117, 118, 133, 134, 135, 136, 137,
    ];
    if (useSpecials.includes(special)) {
      return activation === ActivationType.USE;
    }

    return false;
  }

  /**
   * Check if special can only be activated once
   */
  private isOnceOnly(special: number): boolean {
    // W1/S1 types; locked SR blazing open clears line in vanilla (133,135,137)
    const onceOnlySpecials = [2, 3, 4, 10, 11, 36, 52, 133, 135, 137];
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
