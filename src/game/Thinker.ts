/**
 * Thinker System
 * Manages all active entities in the game
 * Based on linuxdoom-1.10/p_tick.c
 */

import type { Mobj } from './mobj';

/**
 * Thinker function type
 * Called every game tick to update an entity
 */
export type ThinkerFunction = (mobj: Mobj) => void;

/**
 * Thinker node in the linked list
 */
export interface Thinker {
  mobj: Mobj;
  thinkFunc: ThinkerFunction;
  prev?: Thinker;
  next?: Thinker;
}

/**
 * Thinker Manager
 * Maintains a linked list of all active thinkers
 */
export class ThinkerManager {
  private head?: Thinker;
  private tail?: Thinker;
  private thinkerCount: number = 0;

  /**
   * Add a thinker to the list
   */
  addThinker(mobj: Mobj, thinkFunc: ThinkerFunction): Thinker {
    const thinker: Thinker = {
      mobj,
      thinkFunc,
    };

    // Add to end of list
    if (!this.head) {
      this.head = thinker;
      this.tail = thinker;
    } else {
      thinker.prev = this.tail;
      if (this.tail) {
        this.tail.next = thinker;
      }
      this.tail = thinker;
    }

    this.thinkerCount++;
    return thinker;
  }

  /**
   * Remove a thinker from the list
   */
  removeThinker(thinker: Thinker): void {
    if (thinker.prev) {
      thinker.prev.next = thinker.next;
    } else {
      this.head = thinker.next;
    }

    if (thinker.next) {
      thinker.next.prev = thinker.prev;
    } else {
      this.tail = thinker.prev;
    }

    this.thinkerCount--;
  }

  /**
   * Run all thinkers (called each game tick)
   * Based on P_RunThinkers from p_tick.c
   */
  runThinkers(): void {
    let current = this.head;

    while (current) {
      const next = current.next; // Save next before potential removal

      // Call the thinker function
      if (current.thinkFunc) {
        current.thinkFunc(current.mobj);
      }

      current = next;
    }
  }

  /**
   * Get number of active thinkers
   */
  getCount(): number {
    return this.thinkerCount;
  }

  /**
   * Clear all thinkers
   */
  clear(): void {
    this.head = undefined;
    this.tail = undefined;
    this.thinkerCount = 0;
  }

  /**
   * Get all thinkers (for debugging)
   */
  getAllThinkers(): Thinker[] {
    const thinkers: Thinker[] = [];
    let current = this.head;

    while (current) {
      thinkers.push(current);
      current = current.next;
    }

    return thinkers;
  }

  /**
   * Get all mobjs from thinkers
   */
  getAllMobjs(): Mobj[] {
    const mobjs: Mobj[] = [];
    let current = this.head;

    while (current) {
      mobjs.push(current.mobj);
      current = current.next;
    }

    return mobjs;
  }
}
