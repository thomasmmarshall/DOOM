/**
 * Platform System
 * Manages moving platforms (lifts)
 * Inspired by DOOM's platform mechanics
 */

import type { MapData } from '../level/types';
import type { Fixed } from '../core';
import { IntToFixed, FixedToFloat, FloatToFixed } from '../core/fixed';
import { findLowestNeighborFloor, findNextHighestNeighborFloor } from './sectorHeights';

/**
 * Platform state
 */
export enum PlatformState {
  UP = 'UP',
  DOWN = 'DOWN',
  WAITING = 'WAITING',
  IN_STASIS = 'IN_STASIS',
}

/**
 * Platform type
 */
export enum PlatformType {
  PERPETUAL_RAISE = 'PERPETUAL_RAISE', // Goes up and down continuously
  RAISE_AND_WAIT = 'RAISE_AND_WAIT',   // Raises, waits, lowers
  RAISE_TO_NEXT = 'RAISE_TO_NEXT',     // Raises to next floor height
  LOWER_AND_WAIT = 'LOWER_AND_WAIT',   // Lowers, waits, raises
  TURBO_LOWER = 'TURBO_LOWER',         // Lowers to neighboring floor and stays
}

/**
 * Platform thinker data
 */
export interface PlatformThinker {
  sectorIndex: number;
  type: PlatformType;
  state: PlatformState;
  speed: number;
  lowHeight: Fixed;
  highHeight: Fixed;
  waitTimer: number;
  waitTime: number;
}

/**
 * Callback for when sector floor height changes
 */
export type SectorFloorCallback = (sectorIndex: number, oldHeight: number, newHeight: number) => void;

/**
 * Platform manager
 */
export class PlatformManager {
  private platforms: Map<number, PlatformThinker>;
  private mapData: MapData;
  private onFloorChange?: SectorFloorCallback;

  constructor(mapData: MapData, onFloorChange?: SectorFloorCallback) {
    this.platforms = new Map();
    this.mapData = mapData;
    this.onFloorChange = onFloorChange;
  }

  /**
   * Activate a platform
   */
  activatePlatform(
    sectorIndex: number,
    type: PlatformType = PlatformType.RAISE_AND_WAIT,
    speed: number = 1
  ): boolean {
    if (this.platforms.has(sectorIndex)) {
      return false; // Platform already active
    }

    const sector = this.mapData.sectors[sectorIndex];
    if (!sector) return false;

    const currentHeight = IntToFixed(sector.floorheight);
    let lowHeight = currentHeight;
    let highHeight = currentHeight;
    let platformSpeed = speed;
    let state = PlatformState.UP;

    switch (type) {
      case PlatformType.LOWER_AND_WAIT:
        lowHeight = IntToFixed(findLowestNeighborFloor(this.mapData, sectorIndex));
        highHeight = currentHeight;
        platformSpeed = 4;
        state = PlatformState.DOWN;
        break;
      case PlatformType.TURBO_LOWER:
        lowHeight = IntToFixed(findLowestNeighborFloor(this.mapData, sectorIndex));
        highHeight = currentHeight;
        platformSpeed = 8;
        state = PlatformState.DOWN;
        break;
      case PlatformType.RAISE_TO_NEXT:
        lowHeight = currentHeight;
        highHeight = IntToFixed(findNextHighestNeighborFloor(this.mapData, sectorIndex));
        platformSpeed = 2;
        state = PlatformState.UP;
        break;
      default:
        lowHeight = currentHeight;
        highHeight = currentHeight + IntToFixed(64);
        state = PlatformState.UP;
        break;
    }

    const platform: PlatformThinker = {
      sectorIndex,
      type,
      state,
      speed: platformSpeed,
      lowHeight,
      highHeight,
      waitTimer: 0,
      waitTime: 105, // 3 seconds at 35Hz
    };

    this.platforms.set(sectorIndex, platform);
    console.log(`Platform activated in sector ${sectorIndex}`);
    return true;
  }

  /**
   * Update all platforms (called each tick)
   */
  updatePlatforms(): void {
    for (const platform of this.platforms.values()) {
      this.updatePlatform(platform);
    }
  }

  /**
   * Update a single platform
   */
  private updatePlatform(platform: PlatformThinker): void {
    const sector = this.mapData.sectors[platform.sectorIndex];
    const currentHeight = FloatToFixed(sector.floorheight);
    const speedFixed = IntToFixed(platform.speed);

    switch (platform.state) {
      case PlatformState.UP:
        const newUpHeight = currentHeight + speedFixed;
        const oldUpHeight = sector.floorheight;

        if (newUpHeight >= platform.highHeight) {
          const newHeight = FixedToFloat(platform.highHeight);
          sector.floorheight = newHeight;
          if (this.onFloorChange) {
            this.onFloorChange(platform.sectorIndex, oldUpHeight, newHeight);
          }

          if (platform.type === PlatformType.PERPETUAL_RAISE) {
            platform.state = PlatformState.WAITING;
            platform.waitTimer = platform.waitTime;
          } else {
            platform.state = PlatformState.WAITING;
            platform.waitTimer = platform.waitTime;
          }
        } else {
          const newHeight = FixedToFloat(newUpHeight);
          sector.floorheight = newHeight;
          if (this.onFloorChange) {
            this.onFloorChange(platform.sectorIndex, oldUpHeight, newHeight);
          }
        }
        break;

      case PlatformState.DOWN:
        const newDownHeight = currentHeight - speedFixed;
        const oldDownHeight = sector.floorheight;

        if (newDownHeight <= platform.lowHeight) {
          const newHeight = FixedToFloat(platform.lowHeight);
          sector.floorheight = newHeight;
          if (this.onFloorChange) {
            this.onFloorChange(platform.sectorIndex, oldDownHeight, newHeight);
          }

          if (platform.type === PlatformType.PERPETUAL_RAISE) {
            platform.state = PlatformState.WAITING;
            platform.waitTimer = platform.waitTime;
          } else if (platform.type === PlatformType.LOWER_AND_WAIT) {
            platform.state = PlatformState.WAITING;
            platform.waitTimer = platform.waitTime;
          } else {
            // Platform stopped at bottom
            this.platforms.delete(platform.sectorIndex);
          }
        } else {
          const newHeight = FixedToFloat(newDownHeight);
          sector.floorheight = newHeight;
          if (this.onFloorChange) {
            this.onFloorChange(platform.sectorIndex, oldDownHeight, newHeight);
          }
        }
        break;

      case PlatformState.WAITING:
        platform.waitTimer--;
        if (platform.waitTimer <= 0) {
          // Switch direction based on current height
          const atTop = currentHeight >= platform.highHeight;
          platform.state = atTop ? PlatformState.DOWN : PlatformState.UP;
        }
        break;
    }
  }

  /**
   * Check if sector has an active platform
   */
  hasPlatform(sectorIndex: number): boolean {
    return this.platforms.has(sectorIndex);
  }
}
