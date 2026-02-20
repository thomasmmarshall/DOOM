/**
 * Input Manager
 * Handles keyboard, mouse input and converts to game commands
 * Based on linuxdoom-1.10/g_game.c
 */

/**
 * Tick command structure
 * Captures player input for one tick
 */
export interface TicCmd {
  forwardmove: number; // Forward/backward movement (-1 to 1)
  sidemove: number; // Strafe movement (-1 to 1)
  angleturn: number; // Angle turn delta
  buttons: number; // Button flags (fire, use, etc.)
}

export enum Button {
  ATTACK = 1,
  USE = 2,
  JUMP = 4, // Not in original DOOM
}

export class InputManager {
  private keys: Set<string> = new Set();
  private mouseX: number = 0;
  private mouseY: number = 0;
  private mouseLocked: boolean = false;

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Keyboard events
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // Mouse events
    window.addEventListener('mousemove', (e) => {
      if (this.mouseLocked) {
        this.mouseX += e.movementX;
        this.mouseY += e.movementY;
      }
    });

    window.addEventListener('mousedown', (e) => {
      this.keys.add(`Mouse${e.button}`);
    });

    window.addEventListener('mouseup', (e) => {
      this.keys.delete(`Mouse${e.button}`);
    });

    // Pointer lock
    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement !== null;
    });
  }

  /**
   * Build tick command from current input state
   */
  buildTicCmd(): TicCmd {
    const cmd: TicCmd = {
      forwardmove: 0,
      sidemove: 0,
      angleturn: 0,
      buttons: 0,
    };

    // Forward/backward movement (use larger values for noticeable movement)
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      cmd.forwardmove = 25; // Run forward
    } else if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      cmd.forwardmove = -25; // Run backward
    }

    // Strafe movement
    if (this.keys.has('KeyA')) {
      cmd.sidemove = -20; // Strafe left
    } else if (this.keys.has('KeyD')) {
      cmd.sidemove = 20; // Strafe right
    }

    // Turn left/right (keyboard)
    if (this.keys.has('ArrowLeft')) {
      cmd.angleturn = 320; // Turn left
    } else if (this.keys.has('ArrowRight')) {
      cmd.angleturn = -320; // Turn right
    }

    // Mouse turning (much lower sensitivity, smooth accumulation)
    if (this.mouseLocked && this.mouseX !== 0) {
      cmd.angleturn += Math.floor(this.mouseX * 5); // Reduced from 100 to 5
      this.mouseX = 0; // Reset for next frame
    }

    // Buttons
    if (this.keys.has('Space') || this.keys.has('ControlLeft') || this.keys.has('Mouse0')) {
      cmd.buttons |= Button.ATTACK;
    }

    if (this.keys.has('KeyE') || this.keys.has('Mouse2')) {
      cmd.buttons |= Button.USE;
    }

    return cmd;
  }

  /**
   * Request pointer lock for mouse control
   */
  requestPointerLock(): void {
    document.body.requestPointerLock();
  }

  /**
   * Exit pointer lock
   */
  exitPointerLock(): void {
    document.exitPointerLock();
  }

  /**
   * Check if a key is pressed
   */
  isKeyPressed(code: string): boolean {
    return this.keys.has(code);
  }
}
