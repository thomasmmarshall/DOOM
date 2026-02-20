/**
 * Door System
 * Manages opening and closing doors
 * Inspired by DOOM's door mechanics
 */

import type { MapData, MapSector } from '../level/types';
import type { Fixed } from '../core';
import { IntToFixed, FixedToFloat } from '../core/fixed';

/**
 * Door state
 */
export enum DoorState {
  CLOSED = 'CLOSED',
  OPENING = 'OPENING',
  OPEN = 'OPEN',
  WAITING = 'WAITING',
  CLOSING = 'CLOSING',
}

/**
 * Door type
 */
export enum DoorType {
  NORMAL = 'NORMAL',       // Opens, waits, closes
  OPEN_STAY = 'OPEN_STAY', // Opens and stays open
  CLOSE = 'CLOSE',         // Closes from open position
  RAISE = 'RAISE',         // Like normal but faster
  BLAZING = 'BLAZING',     // Very fast
}

/**
 * Door thinker data
 */
export interface DoorThinker {
  sectorIndex: number;
  type: DoorType;
  state: DoorState;
  speed: number;          // Units per tick
  topHeight: Fixed;       // Maximum height when open
  bottomHeight: Fixed;    // Minimum height when closed
  waitTimer: number;      // Ticks to wait when open
}

/**
 * Callback for when sector ceiling height changes
 */
export type SectorCeilingCallback = (sectorIndex: number, newHeight: number) => void;

/**
 * Active door registry
 */
export class DoorManager {
  private doors: Map<number, DoorThinker>;
  private mapData: MapData;
  private onCeilingChange?: SectorCeilingCallback;

  constructor(mapData: MapData, onCeilingChange?: SectorCeilingCallback) {
    this.doors = new Map();
    this.mapData = mapData;
    this.onCeilingChange = onCeilingChange;
  }

  /**
   * Activate a door
   */
  activateDoor(sectorIndex: number, type: DoorType = DoorType.NORMAL): boolean {
    if (this.doors.has(sectorIndex)) {
      return false; // Door already active
    }

    const sector = this.mapData.sectors[sectorIndex];
    if (!sector) return false;

    // Calculate door heights
    const bottomHeight = IntToFixed(sector.floorheight);
    const topHeight = IntToFixed(sector.floorheight + 128); // 128 units open

    // Door speed based on type
    let speed = 2; // Normal speed
    if (type === DoorType.RAISE) speed = 4;
    if (type === DoorType.BLAZING) speed = 8;

    const door: DoorThinker = {
      sectorIndex,
      type,
      state: DoorState.OPENING,
      speed,
      topHeight,
      bottomHeight,
      waitTimer: 0,
    };

    this.doors.set(sectorIndex, door);
    console.log(`Door activated in sector ${sectorIndex}`);
    return true;
  }

  /**
   * Update all active doors (called each tick)
   */
  updateDoors(): void {
    for (const [sectorIndex, door] of this.doors.entries()) {
      this.updateDoor(door);

      // Remove door if closed and type is CLOSE
      if (door.state === DoorState.CLOSED && door.type === DoorType.CLOSE) {
        this.doors.delete(sectorIndex);
      }
    }
  }

  /**
   * Update a single door
   */
  private updateDoor(door: DoorThinker): void {
    const sector = this.mapData.sectors[door.sectorIndex];
    const currentHeight = IntToFixed(sector.ceilingheight);

    switch (door.state) {
      case DoorState.OPENING:
        // Move ceiling up
        const newOpenHeight = currentHeight + door.speed;

        if (newOpenHeight >= door.topHeight) {
          // Fully open
          const newHeight = FixedToFloat(door.topHeight);
          sector.ceilingheight = newHeight;
          if (this.onCeilingChange) {
            this.onCeilingChange(door.sectorIndex, newHeight);
          }

          if (door.type === DoorType.OPEN_STAY) {
            door.state = DoorState.OPEN;
            this.doors.delete(door.sectorIndex); // Remove - stays open
          } else {
            door.state = DoorState.WAITING;
            door.waitTimer = 150; // Wait ~4 seconds (150 ticks at 35Hz)
          }
        } else {
          const newHeight = FixedToFloat(newOpenHeight);
          sector.ceilingheight = newHeight;
          if (this.onCeilingChange) {
            this.onCeilingChange(door.sectorIndex, newHeight);
          }
        }
        break;

      case DoorState.WAITING:
        door.waitTimer--;
        if (door.waitTimer <= 0) {
          door.state = DoorState.CLOSING;
        }
        break;

      case DoorState.CLOSING:
        // Move ceiling down
        const newCloseHeight = currentHeight - door.speed;

        if (newCloseHeight <= door.bottomHeight) {
          // Fully closed
          const newHeight = FixedToFloat(door.bottomHeight);
          sector.ceilingheight = newHeight;
          if (this.onCeilingChange) {
            this.onCeilingChange(door.sectorIndex, newHeight);
          }
          door.state = DoorState.CLOSED;
          this.doors.delete(door.sectorIndex); // Remove - no longer active
        } else {
          const newHeight = FixedToFloat(newCloseHeight);
          sector.ceilingheight = newHeight;
          if (this.onCeilingChange) {
            this.onCeilingChange(door.sectorIndex, newHeight);
          }
        }
        break;
    }
  }

  /**
   * Check if sector has an active door
   */
  hasDoor(sectorIndex: number): boolean {
    return this.doors.has(sectorIndex);
  }

  /**
   * Get door state
   */
  getDoorState(sectorIndex: number): DoorState | null {
    const door = this.doors.get(sectorIndex);
    return door ? door.state : null;
  }
}
