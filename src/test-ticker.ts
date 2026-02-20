/**
 * Test the game ticker to ensure it runs at 35 Hz
 */

import { GameTicker, TICRATE } from './core/ticker';

// Track ticks and timing
let tickCount = 0;
let startTime = 0;
const tickTimes: number[] = [];

function testTick(tick: number): void {
  tickCount++;
  const now = performance.now();

  if (startTime === 0) {
    startTime = now;
  }

  tickTimes.push(now);

  // Log every second
  if (tickCount % TICRATE === 0) {
    const elapsed = (now - startTime) / 1000;
    const actualRate = tickCount / elapsed;
    console.log(`Tick ${tick}: ${tickCount} ticks in ${elapsed.toFixed(2)}s = ${actualRate.toFixed(2)} Hz (target: ${TICRATE} Hz)`);
  }

  // Stop after 10 seconds
  if (tickCount >= TICRATE * 10) {
    ticker.stop();
    const totalTime = (now - startTime) / 1000;
    const avgRate = tickCount / totalTime;
    console.log(`\nTest complete:`);
    console.log(`  Total ticks: ${tickCount}`);
    console.log(`  Total time: ${totalTime.toFixed(2)}s`);
    console.log(`  Average rate: ${avgRate.toFixed(2)} Hz`);
    console.log(`  Target rate: ${TICRATE} Hz`);
    console.log(`  Deviation: ${((avgRate - TICRATE) / TICRATE * 100).toFixed(2)}%`);
  }
}

const ticker = new GameTicker(testTick);
console.log('Starting ticker test (10 seconds)...');
ticker.start();
