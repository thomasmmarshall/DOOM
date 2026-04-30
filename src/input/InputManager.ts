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
  /** Reserved; not produced by {@link InputManager.buildTicCmd} in vanilla mode. */
  JUMP = 4,
}

export class InputManager {
  private keys: Set<string> = new Set();
  private mouseX: number = 0;
  private mouseY: number = 0;
  private mouseLocked: boolean = false;

  /**
   * When true (default), ticcmd buttons match DOS DOOM (attack + use only; no jump).
   * Set false only for extension ports that wire extra keys to {@link Button.JUMP}.
   */
  vanillaDoom: boolean = true;

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

    // Avoid stuck movement/shoot after alt-tab or losing focus (keys never get keyup).
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  /**
   * Build tick command from current input state.
   * Movement values match vanilla g_game.c:
   *   forwardmove[2] = {0x19, 0x32}  (25 walk, 50 run)
   *   sidemove[2]    = {0x18, 0x28}  (24 walk, 40 run)
   */
  buildTicCmd(): TicCmd {
    const cmd: TicCmd = {
      forwardmove: 0,
      sidemove: 0,
      angleturn: 0,
      buttons: 0,
    };

    // Default to run speed (most modern players expect always-run).
    // Hold Shift to walk at vanilla normal speed.
    const walking = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const fwdSpeed = walking ? 0x19 : 0x32; // walk: 25, run: 50
    const sideSpeed = walking ? 0x18 : 0x28; // walk: 24, run: 40

    // Forward/backward
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
      cmd.forwardmove = fwdSpeed;
    } else if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
      cmd.forwardmove = -fwdSpeed;
    }

    // Strafe
    if (this.keys.has('KeyA')) {
      cmd.sidemove = -sideSpeed;
    } else if (this.keys.has('KeyD')) {
      cmd.sidemove = sideSpeed;
    }

    // Keyboard turning — vanilla angleturn[3] = {640, 1280, 320}
    // Run = fast turn (1280), walk = normal turn (640)
    const turnSpeed = walking ? 640 : 1280;
    if (this.keys.has('ArrowLeft')) {
      cmd.angleturn = turnSpeed;
    } else if (this.keys.has('ArrowRight')) {
      cmd.angleturn = -turnSpeed;
    }

    // Mouse turning
    if (this.mouseLocked && this.mouseX !== 0) {
      const sensitivity = 25;
      cmd.angleturn -= Math.floor(this.mouseX * sensitivity);
      this.mouseX = 0;
    }

    // Buttons
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('Mouse0')) {
      cmd.buttons |= Button.ATTACK;
    }

    if (this.keys.has('Space') || this.keys.has('KeyE') || this.keys.has('Mouse2')) {
      cmd.buttons |= Button.USE;
    }

    if (!this.vanillaDoom && this.keys.has('KeyQ')) {
      cmd.buttons |= Button.JUMP;
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
