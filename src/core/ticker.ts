/**
 * Game Ticker
 * Maintains a deterministic 35 Hz tick rate for game logic
 * Based on linuxdoom-1.10/d_main.c (D_DoomLoop)
 */

export const TICRATE = 35; // 35 Hz nominal (original DOOM, d_main.c)

/** 1 = linuxdoom tic rate; &lt;1 slows simulation for playtesting only. */
let gameSpeedScale = 1.0;

export function getGameSpeedScale(): number {
  return gameSpeedScale;
}

/** Clamp and apply optional speed (e.g. menu/cheat). Default 1.0 matches vanilla. */
export function setGameSpeedScale(scale: number): void {
  gameSpeedScale = Math.max(0.25, Math.min(4, scale));
}

function tickDurationMs(): number {
  return 1000 / (TICRATE * gameSpeedScale);
}

/** Max wall-clock ms per frame used for tick accumulation (background tab / hitch cap). */
const MAX_DELTA_MS = 2 * (1000 / TICRATE); // align with vanilla ~2 tics max catch-up feel

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
    let deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Cap delta to avoid burst of ticks when tab was in background (keeps feel consistent)
    if (deltaTime > MAX_DELTA_MS) deltaTime = MAX_DELTA_MS;

    // Accumulate time
    this.accumulator += deltaTime;

    // Run ticks for accumulated time
    // Cap to prevent spiral of death (if system is too slow)
    const maxTicks = 4; // Max 4 ticks per frame
    let ticksThisFrame = 0;

    const step = tickDurationMs();
    while (this.accumulator >= step && ticksThisFrame < maxTicks) {
      this.tickFunction(this.currentTick);
      this.currentTick++;
      this.accumulator -= step;
      ticksThisFrame++;
    }

    // If we're too far behind, reset accumulator
    if (this.accumulator > step * maxTicks) {
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
    const step = tickDurationMs();
    return step > 0 ? this.accumulator / step : 0;
  }
}
