/**
 * Game Ticker
 * Maintains a deterministic 35 Hz tick rate for game logic
 * Based on linuxdoom-1.10/d_main.c (D_DoomLoop)
 */

export const TICRATE = 35; // 35 Hz tick rate
const TICK_DURATION = 1000 / TICRATE; // ~28.57 ms per tick

export type TickFunction = (tick: number) => void;

export class GameTicker {
  private tickFunction: TickFunction;
  private running: boolean = false;
  private currentTick: number = 0;
  private lastTime: number = 0;
  private accumulator: number = 0;

  constructor(tickFunction: TickFunction) {
    this.tickFunction = tickFunction;
  }

  /**
   * Start the ticker
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.currentTick = 0;

    this.tick();
  }

  /**
   * Stop the ticker
   */
  stop(): void {
    this.running = false;
  }

  /**
   * Main tick loop
   */
  private tick = (): void => {
    if (!this.running) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Accumulate time
    this.accumulator += deltaTime;

    // Run ticks for accumulated time
    // Cap to prevent spiral of death (if system is too slow)
    const maxTicks = 4; // Max 4 ticks per frame
    let ticksThisFrame = 0;

    while (this.accumulator >= TICK_DURATION && ticksThisFrame < maxTicks) {
      this.tickFunction(this.currentTick);
      this.currentTick++;
      this.accumulator -= TICK_DURATION;
      ticksThisFrame++;
    }

    // If we're too far behind, reset accumulator
    if (this.accumulator > TICK_DURATION * maxTicks) {
      console.warn('Game ticker falling behind, resetting accumulator');
      this.accumulator = 0;
    }

    // Schedule next tick
    requestAnimationFrame(this.tick);
  };

  /**
   * Get current tick number
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Get interpolation alpha for smooth rendering
   * Returns value between 0 and 1 representing how far we are to the next tick
   */
  getInterpolationAlpha(): number {
    return this.accumulator / TICK_DURATION;
  }
}
