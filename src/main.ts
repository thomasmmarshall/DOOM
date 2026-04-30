/**
 * DOOM three.js - Main Entry Point
 *
 * This is the entry point for the DOOM three.js port.
 * Initializes the renderer, loads WAD files, and starts the game loop.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { loadWAD } from './demo';
import { MapParser, findSectorAtPoint } from './level';
import { PaletteLoader } from './graphics';
import { LevelRenderer, WeaponRenderer } from './renderer';
import { doomToThree, doomAngleToThreeRadians, initTables, GameTicker, TICRATE, IntToFixed, FixedToFloat, DegreesToAngle, FloatToFixed, pRandom } from './core';
import { InputManager, Button } from './input';
import { createPlayerMobj, type Mobj, MobjFlags, ThinkerManager, TriggerSystem, ThingSpawner } from './game';
import { movePlayer, applyFriction, applyGravity, applyZMomentum, calculateViewZ, applyCollision, clampMomentum, updateViewHeight } from './physics';
import type { MapData } from './level';
import { DoorManager, PlatformManager } from './sectors';
import { StatusBar, TitleScreen, BorderFrame, MainMenu, IntermissionScreen, type PlayerStats, type IntermissionStats } from './ui';
import {
  createPlayerWeapon,
  updateWeapon,
  fireWeapon,
  WeaponType,
  performHitscan,
  bulletSlope,
  WEAPON_INFO,
  switchPlayerWeapon,
  canPlayerUseWeapon,
  consumeWeaponAmmo,
} from './weapons/WeaponSystem';
import { spawnPlayerProjectile } from './weapons/projectiles';
import { damageActor, gunshotPelletDamage, punchDamage, chainsawDamage, setPlayerCountedKillHook } from './game/Damage';
import { tryPickupItem, checkItemCollision } from './game/Pickups';
import { updateMonster, type MonsterAttackCallback } from './ai';
import { MusicPlayer, SoundManager, type SoundSpatial } from './audio';

const DOOM_DISPLAY_ASPECT = 4 / 3;
const DOOM_INTERNAL_WIDTH = 320;
const DOOM_VIEW_HEIGHT = 168;  // 3D view area; status bar 32px below
const DOOM_STATUS_HEIGHT = 32;
const DOOM_FRAMEBUFFER_HEIGHT = DOOM_VIEW_HEIGHT + DOOM_STATUS_HEIGHT; // 320×200 VGA surface
/** How the 3D view maps to the screen when 320×200 is displayed at 4:3 (non-square pixels). */
const DOOM_VIEW_DISPLAY_ASPECT = DOOM_DISPLAY_ASPECT * (DOOM_FRAMEBUFFER_HEIGHT / DOOM_VIEW_HEIGHT);
const DOOM_HORIZONTAL_FOV = 73.74;

function horizontalToVerticalFov(horizontalFov: number, aspect: number): number {
  const horizontalRadians = THREE.MathUtils.degToRad(horizontalFov);
  const verticalRadians = 2 * Math.atan(Math.tan(horizontalRadians / 2) / aspect);
  return THREE.MathUtils.radToDeg(verticalRadians);
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'Unknown error';
  }
}

class DoomGame {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private infoElement: HTMLElement;
  private levelRenderer?: LevelRenderer;
  private ticker?: GameTicker;
  private inputManager: InputManager;
  private tickCount: number = 0;
  private playerMobj?: Mobj;
  private useOrbitControls: boolean = false;
  private mapData?: MapData;
  private thinkerManager: ThinkerManager;
  private doorManager?: DoorManager;
  private platformManager?: PlatformManager;
  private triggerSystem?: TriggerSystem;
  private weaponRenderer?: WeaponRenderer;
  private statusBar?: StatusBar;
  private soundManager?: SoundManager;
  private musicPlayer?: MusicPlayer;
  private previousButtons: number = 0;
  private visitedSecretSectors: Set<number> = new Set();
  private noiseOrigin?: { x: number; y: number };
  private sectorBaseLightLevels: number[] = [];
  private levelTime: number = 0;
  private playerDied: boolean = false;
  private gameContainer?: HTMLElement;
  private viewContainer?: HTMLElement;
  private borderFrame?: BorderFrame;
  /** Tick until which to show muzzle flash (game-tick driven, not frame). */
  private weaponFlashUntilTick: number = 0;
  /** ST_Ticker `st_oldhealth`: health at end of previous gametic. */
  private playerHealthAtLastTickEnd: number = 100;
  /** Full-viewport red tint while `damageCount` &gt; 0 (classic pain flash). */
  private damageFlashMesh?: THREE.Mesh;

  private sessionWad?: Awaited<ReturnType<typeof loadWAD>>;
  private sessionPalette?: Uint8Array;
  private sessionColormap?: Uint8Array;
  private sessionRgbaPalette?: Uint8ClampedArray;
  private mapList: string[] = [];
  private currentMapName: string = '';
  private gameSkill: number = 3;
  private levelTransitioning: boolean = false;
  private levelKills: number = 0;
  private levelItems: number = 0;
  private levelMaxKills: number = 0;
  private levelMaxItems: number = 0;
  private levelMaxSecrets: number = 0;

  constructor() {
    // Initialize trigonometry tables
    initTables();

    // Initialize thinker manager
    this.thinkerManager = new ThinkerManager();

    // Initialize input manager
    this.inputManager = new InputManager();
    // Initialize three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Internal buffer 320×168; on hardware the full 320×200 frame is shown at 4:3.
    this.camera = new THREE.PerspectiveCamera(
      horizontalToVerticalFov(DOOM_HORIZONTAL_FOV, DOOM_VIEW_DISPLAY_ASPECT),
      DOOM_VIEW_DISPLAY_ASPECT,
      1,
      10000
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: false });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.imageRendering = 'pixelated';
    this.renderer.domElement.style.imageRendering = 'crisp-edges';

    this.gameContainer = document.createElement('div');
    this.gameContainer.id = 'game-container';
    this.gameContainer.style.cssText = 'position:absolute; display:flex; flex-direction:column; align-items:stretch;';
    document.body.appendChild(this.gameContainer);

    this.viewContainer = document.createElement('div');
    this.viewContainer.style.cssText = 'position:relative; flex:1 1 auto; min-height:0; width:100%; overflow:visible;';
    this.gameContainer.appendChild(this.viewContainer);
    this.viewContainer.appendChild(this.renderer.domElement);

    this.updateRendererSize();

    // Set up orbit controls for camera navigation
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 5000;

    // Get info element
    this.infoElement = document.getElementById('info')!;

    // Handle window resize
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('pointerdown', () => {
      void this.musicPlayer?.activate();
      // Request pointer lock on click (required when starting in first-person - browser needs user gesture)
      if (!this.useOrbitControls && this.playerMobj && !document.pointerLockElement) {
        this.inputManager.requestPointerLock();
      }
    });

    // Update info
    this.updateInfo('DOOM three.js - Loading...');

    window.addEventListener('keydown', this.onGameplayKeydown);
  }

  private onGameplayKeydown = (e: KeyboardEvent): void => {
    void this.musicPlayer?.activate();

    if (this.levelTransitioning) return;

    if (this.playerDied) {
      if (e.code === 'KeyR') {
        window.location.reload();
      }
      return;
    }

    if (e.code === 'KeyF') {
      this.useOrbitControls = !this.useOrbitControls;
      this.controls.enabled = this.useOrbitControls;
      if (!this.useOrbitControls && this.playerMobj) {
        this.inputManager.requestPointerLock();
        this.infoElement.style.display = 'none';
      }
      console.log(`${this.useOrbitControls ? 'Orbit controls' : 'First-person mode'} enabled`);
    } else if (e.code.startsWith('Digit') && this.playerMobj?.player?.weapon) {
      const digit = parseInt(e.code.substring(5), 10);
      const mobj = this.playerMobj;
      if (!mobj.player) return;
      if (digit === 1) {
        const p = mobj.player;
        const w = p.weapon!;
        if (
          p.weapons[WeaponType.CHAINSAW] &&
          !(w.currentWeapon === WeaponType.CHAINSAW && (p.powerups.berserk ?? 0) !== 0)
        ) {
          switchPlayerWeapon(mobj, WeaponType.CHAINSAW);
        } else {
          switchPlayerWeapon(mobj, WeaponType.FIST);
        }
      } else if (digit >= 2 && digit <= 7) {
        switchPlayerWeapon(mobj, (digit - 1) as WeaponType);
      } else if (digit === 8 && mobj.player.weapons[WeaponType.SUPER_SHOTGUN]) {
        switchPlayerWeapon(mobj, WeaponType.SUPER_SHOTGUN);
      }
    }
  };

  private initLevelKillItemTotals(): void {
    this.levelKills = 0;
    this.levelItems = 0;
    this.levelMaxKills = 0;
    this.levelMaxItems = 0;
    this.levelMaxSecrets = 0;
    if (!this.mapData) return;

    for (const s of this.mapData.sectors) {
      if (s.special === 9) this.levelMaxSecrets++;
    }
    for (const m of this.thinkerManager.getAllMobjs()) {
      if (m.countsTowardKill) this.levelMaxKills++;
      if (m.countsTowardItem) this.levelMaxItems++;
    }
  }

  private getNextMapName(current: string): string | null {
    const u = current.toUpperCase();
    const epMap = /^E(\d+)M(\d+)$/.exec(u);
    if (epMap) {
      const ep = epMap[1];
      const inEpisode = this.mapList.filter((n) => {
        const m = /^E(\d+)M(\d+)$/.exec(n.toUpperCase());
        return m !== null && m[1] === ep;
      });
      const idx = inEpisode.indexOf(u);
      if (idx >= 0 && idx + 1 < inEpisode.length) {
        return inEpisode[idx + 1] ?? null;
      }
      return null;
    }
    if (/^MAP\d\d$/i.test(u)) {
      const idx = this.mapList.indexOf(u);
      if (idx < 0 || idx + 1 >= this.mapList.length) return null;
      const next = this.mapList[idx + 1];
      return next && /^MAP\d\d$/i.test(next) ? next : null;
    }
    const idx = this.mapList.indexOf(u);
    if (idx < 0 || idx + 1 >= this.mapList.length) return null;
    return this.mapList[idx + 1] ?? null;
  }

  private teardownPlaySession(): void {
    if (this.damageFlashMesh) {
      this.camera.remove(this.damageFlashMesh);
      this.damageFlashMesh.geometry.dispose();
      (this.damageFlashMesh.material as THREE.MeshBasicMaterial).dispose();
      this.damageFlashMesh = undefined;
    }
    setPlayerCountedKillHook(undefined);
    this.ticker?.stop();
    this.ticker = undefined;
    this.thinkerManager.clear();
    this.triggerSystem = undefined;
    this.doorManager = undefined;
    this.platformManager = undefined;
    this.playerMobj = undefined;
    this.mapData = undefined;

    if (this.levelRenderer) {
      this.levelRenderer.dispose();
      this.levelRenderer = undefined;
    }

    if (this.borderFrame && this.viewContainer) {
      const c = this.borderFrame.getCanvas();
      if (c.parentNode === this.viewContainer) {
        this.viewContainer.removeChild(c);
      }
      this.borderFrame = undefined;
    }

    this.statusBar?.dispose();
    this.statusBar = undefined;
    this.weaponRenderer = undefined;

    this.visitedSecretSectors.clear();
    this.sectorBaseLightLevels = [];
    this.levelTime = 0;
    this.previousButtons = 0;
  }

  private handleLevelExit = (): void => {
    if (this.levelTransitioning || !this.sessionWad || !this.sessionRgbaPalette) return;

    this.levelTransitioning = true;
    this.ticker?.stop();
    setPlayerCountedKillHook(undefined);
    void document.exitPointerLock();
    this.musicPlayer?.stop();

    if (this.gameContainer) this.gameContainer.style.visibility = 'hidden';

    const stats: IntermissionStats = {
      kills: this.levelKills,
      maxKills: this.levelMaxKills,
      items: this.levelItems,
      maxItems: this.levelMaxItems,
      secrets: this.visitedSecretSectors.size,
      maxSecrets: this.levelMaxSecrets,
      timeTics: this.levelTime,
    };
    const next = this.getNextMapName(this.currentMapName);

    const intermission = new IntermissionScreen(this.sessionWad, this.sessionRgbaPalette, {
      finishedMap: this.currentMapName,
      nextMap: next,
      stats,
      onContinue: () => {
        if (this.gameContainer) this.gameContainer.style.visibility = 'visible';
        this.levelTransitioning = false;

        if (next && this.sessionPalette && this.sessionColormap && this.sessionRgbaPalette) {
          void this.loadLevel(this.sessionWad!, this.sessionPalette, this.sessionColormap, this.sessionRgbaPalette, next, this.gameSkill);
        } else {
          this.updateInfo('Episode or WAD complete. Refresh the page to play again.');
          this.infoElement.style.display = 'block';
        }
      },
    });
    intermission.show();
  };

  /**
   * Update renderer size maintaining 4:3 aspect ratio
   */
  private updateRendererSize(): void {
    const windowAspect = window.innerWidth / window.innerHeight;
    const targetAspect = DOOM_DISPLAY_ASPECT;

    let displayWidth: number;
    let displayHeight: number;

    if (windowAspect > targetAspect) {
      // Window is wider - pillarbox (black bars on sides)
      displayHeight = window.innerHeight;
      displayWidth = displayHeight * targetAspect;
    } else {
      // Window is taller - letterbox (black bars on top/bottom)
      displayWidth = window.innerWidth;
      displayHeight = displayWidth / targetAspect;
    }

    this.renderer.setSize(DOOM_INTERNAL_WIDTH, DOOM_VIEW_HEIGHT, false);
    const container = this.gameContainer ?? document.getElementById('game-container');
    if (container) {
      container.style.width = `${displayWidth}px`;
      container.style.height = `${displayHeight}px`;
      container.style.left = `${(window.innerWidth - displayWidth) / 2}px`;
      container.style.top = `${(window.innerHeight - displayHeight) / 2}px`;
      this.renderer.domElement.style.width = '100%';
      this.renderer.domElement.style.height = '100%';
    }
    if (this.viewContainer && this.borderFrame) {
      this.borderFrame.resize(this.viewContainer.offsetWidth, this.viewContainer.offsetHeight);
    }
    this.statusBar?.syncLayout(displayWidth);
  }

  private onResize(): void {
    this.updateRendererSize();
    this.camera.aspect = DOOM_VIEW_DISPLAY_ASPECT;
    this.camera.updateProjectionMatrix();
  }

  private updateInfo(text: string): void {
    this.infoElement.textContent = text;
  }

  private addWorldMobj(mobj: Mobj, thinker?: (mobj: Mobj) => void): void {
    this.thinkerManager.addThinker(mobj, thinker ?? (() => {}));
  }

  private spawnPuff(x: number, y: number, z: number): void {
    const puffFrames = ['A', 'B', 'C', 'D'];
    const sectorIndex = this.mapData ? findSectorAtPoint(x, y, this.mapData) : -1;
    const puff: Mobj = {
      x: FloatToFixed(x),
      y: FloatToFixed(y),
      z: FloatToFixed(z),
      angle: 0,
      momx: 0,
      momy: 0,
      momz: IntToFixed(1),
      radius: IntToFixed(16),
      height: IntToFixed(16),
      floorz: FloatToFixed(z),
      ceilingz: FloatToFixed(z + 64),
      flags: 0,
      health: 1,
      type: 0,
      sprite: 'PUFF',
      frame: 'A',
      rotation: 0,
      sectorIndex: sectorIndex >= 0 ? sectorIndex : undefined,
    };
    let tics = 16;
    this.addWorldMobj(puff, () => {
      tics--;
      puff.frame = puffFrames[Math.max(0, 4 - Math.ceil(tics / 4))] ?? 'D';
      puff.z += puff.momz;
      if (tics <= 0) puff.removed = true;
    });
  }

  private monsterSpatial(enemy: Mobj): SoundSpatial | undefined {
    if (!this.playerMobj) return undefined;
    return {
      origin: { x: FixedToFloat(enemy.x), y: FixedToFloat(enemy.y) },
      listener: {
        x: FixedToFloat(this.playerMobj.x),
        y: FixedToFloat(this.playerMobj.y),
        angleBam: this.playerMobj.angle,
      },
    };
  }

  private onMonsterAttack: MonsterAttackCallback = (enemy, melee) => {
    const sp = this.monsterSpatial(enemy);
    switch (enemy.type) {
      case 3001:
        this.soundManager?.play(melee ? 'impClaw' : 'impFireball', melee ? 0.48 : 0.42, sp);
        break;
      case 3002:
        this.soundManager?.play('demonAttack', 0.45, sp);
        break;
      case 3004:
        this.soundManager?.play('pistol', 0.38, sp);
        break;
      case 9:
        this.soundManager?.play('shotgun', 0.42, sp);
        break;
      default:
        break;
    }
  };

  private ensureDamageFlashMesh(): void {
    if (this.damageFlashMesh) return;
    const geom = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x881100,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 9998;
    mesh.visible = false;
    mesh.rotation.y = Math.PI;
    this.camera.add(mesh);
    this.damageFlashMesh = mesh;
  }

  private updateDamageFlashFromPlayer(): void {
    if (!this.damageFlashMesh || !this.playerMobj?.player || this.playerDied) return;
    const dc = this.playerMobj.player.damageCount;
    const mat = this.damageFlashMesh.material as THREE.MeshBasicMaterial;
    const dist = 0.12;
    const vFOV = THREE.MathUtils.degToRad(this.camera.fov);
    const h = 2 * Math.tan(vFOV / 2) * dist;
    const w = h * this.camera.aspect;
    this.damageFlashMesh.scale.set(w, h, 1);
    this.damageFlashMesh.position.set(0, 0, -dist);
    if (dc > 0) {
      mat.opacity = Math.min(0.5, (dc / 100) * 0.55);
      this.damageFlashMesh.visible = true;
    } else {
      mat.opacity = 0;
      this.damageFlashMesh.visible = false;
    }
  }

  private playDeathSound(type: number): void {
    const sound =
      type === 3001 ? 'impDeath' :
      type === 3002 ? 'demonDeath' :
      type === 9 ? 'shotgunGuyDeath' :
      type === 3004 ? 'zombieDeath' :
      'monsterDeath';
    this.soundManager?.play(sound, 0.5);
  }

  private handlePlayerDeath(): void {
    if (this.playerDied || !this.playerMobj?.player) {
      return;
    }

    this.playerDied = true;
    this.playerMobj.momx = 0;
    this.playerMobj.momy = 0;
    this.playerMobj.momz = 0;
    this.previousButtons = 0;
    this.ticker?.stop();
    this.controls.enabled = false;
    this.infoElement.style.display = 'block';
    this.updateInfo('You died. Press R to restart.');

    if (document.pointerLockElement) {
      void document.exitPointerLock();
    }
  }

  private spawnMapThings(skill: number = 3): void {
    if (!this.mapData) {
      return;
    }

    const spawner = new ThingSpawner();
    const spawnedThings = spawner.spawnThings(this.mapData, skill);

    for (const spawned of spawnedThings) {
      const thinker = spawned.mobj.countsTowardKill
        ? (mobj: Mobj) => {
            if (this.playerMobj && this.mapData) {
              updateMonster(mobj, this.playerMobj, this.mapData, this.noiseOrigin, this.onMonsterAttack, {
                getAllMobjs: () => this.thinkerManager.getAllMobjs(),
                addWorldMobj: (m, t) => this.addWorldMobj(m, t),
              });
            }
          }
        : undefined;
      this.addWorldMobj(spawned.mobj, thinker);
    }

    this.levelRenderer?.syncWorldMobjs(this.thinkerManager.getAllMobjs());
  }

  private cleanupRemovedMobjs(): void {
    const mobjs = this.thinkerManager.getAllMobjs();
    for (const mobj of mobjs) {
      if (mobj.removed) {
        this.thinkerManager.removeThinkerByMobj(mobj);
      }
    }
  }

  /** Null when ready weapon has `am_noammo` (st_lib largeammo / skip draw). */
  private getReadyAmmoForHud(): number | null {
    if (!this.playerMobj?.player?.weapon) return null;
    const info = WEAPON_INFO.get(this.playerMobj.player.weapon.currentWeapon);
    if (!info?.ammoType) return null;
    return this.playerMobj.player.ammo[info.ammoType];
  }

  private updateSectorSpecials(): void {
    if (!this.playerMobj?.player || !this.mapData) {
      return;
    }

    const sectorIndex = this.playerMobj.sectorIndex;
    if (typeof sectorIndex === 'number') {
      const sector = this.mapData.sectors[sectorIndex];
      if (this.playerMobj.z <= this.playerMobj.floorz) {
        const hasRadsuit = !!this.playerMobj.player.powerups.radsuit;

        // Vanilla p_spec.c damage sectors (checked every 32 tics):
        // Type 5: -10 HP, Type 7: -5 HP, Type 4/11/16: -20 HP
        if ((this.levelTime & 0x1f) === 0) {
          let sectorDamage = 0;
          switch (sector.special) {
            case 5: sectorDamage = 10; break;
            case 7: sectorDamage = 5; break;
            case 4: case 11: case 16: sectorDamage = 20; break;
          }
          if (sectorDamage > 0 && !hasRadsuit) {
            damageActor(this.playerMobj, sectorDamage);
            this.soundManager?.play('playerPain', 0.35);
          }
        }

        if (sector.special === 9 && !this.visitedSecretSectors.has(sectorIndex)) {
          this.visitedSecretSectors.add(sectorIndex);
          this.playerMobj.player.message = 'A secret is revealed!';
          this.playerMobj.player.bonusCount = 10;
        }
      }
    }

    for (let i = 0; i < this.mapData.sectors.length; i++) {
      const base = this.sectorBaseLightLevels[i] ?? this.mapData.sectors[i].lightlevel;
      const sector = this.mapData.sectors[i];
      let nextLight = base;

      switch (sector.special) {
        case 1: // Random flicker (like broken light)
          nextLight = (this.levelTime % 16) < 2 ? Math.max(32, base - 96) : base;
          break;
        case 2: // Strobe fast (T_StrobeFlash: bright 5, dark 15)
        case 4: // Strobe fast + -20% damage
          nextLight = (this.levelTime % 20) < 5 ? base : Math.max(32, base - 128);
          break;
        case 3: // Strobe slow (bright 5, dark 35)
          nextLight = (this.levelTime % 40) < 5 ? base : Math.max(32, base - 128);
          break;
        case 8: // Oscillate (T_Glow)
          nextLight = (this.levelTime % 64) < 32 ? base : Math.max(32, base - 48);
          break;
        case 12: // Strobe slow sync
          nextLight = (this.levelTime % 40) < 20 ? base : Math.max(32, base - 64);
          break;
        case 13: // Strobe fast sync
          nextLight = (this.levelTime % 20) < 10 ? base : Math.max(32, base - 64);
          break;
        case 17: // Fire flicker (random between base and base-48)
          nextLight = (pRandom() & 3) === 0 ? Math.max(32, base - 48) : base;
          break;
      }

      if (sector.lightlevel !== nextLight) {
        sector.lightlevel = nextLight;
        this.levelRenderer?.updateSectorLight(i, nextLight);
      }
    }

    for (const line of this.mapData.linedefs) {
      if (line.special === 48 && line.sidenum[0] !== -1) {
        this.mapData.sidedefs[line.sidenum[0]].textureoffset += 1;
      }
    }

    this.levelRenderer?.updateAnimatedWallOffsets();
  }

  public async init(): Promise<void> {
    try {
      this.updateInfo('Loading WAD file...');

      const wad = await loadWAD('/DOOM.WAD');
      console.log('WAD loaded successfully');

      const playpalData = wad.readLump('PLAYPAL');
      if (!playpalData) throw new Error('PLAYPAL not found');
      const palette = PaletteLoader.loadPalette(playpalData);
      const colormapData = wad.readLump('COLORMAP');
      if (!colormapData) throw new Error('COLORMAP not found');
      const colormap = PaletteLoader.loadColormap(colormapData);
      const rgbaPalette = PaletteLoader.paletteToRGBA(palette, 255);

      this.sessionWad = wad;
      this.sessionPalette = palette;
      this.sessionColormap = colormap;
      this.sessionRgbaPalette = rgbaPalette;
      this.mapList = wad.findMapLumps();

      // Create audio for menu/splash (before level load)
      this.soundManager = new SoundManager(wad);
      this.musicPlayer = new MusicPlayer(wad);

      const titleScreen = new TitleScreen(
        wad,
        rgbaPalette,
        () => {
          titleScreen.hide();
          void this.musicPlayer?.activate();
          this.showMainMenu(wad, palette, colormap, rgbaPalette);
        },
        () => {
          this.musicPlayer?.prepareIntroMusic();
          void this.musicPlayer?.activate();
        }
      );
      await titleScreen.init();
      titleScreen.show();
      titleScreen.startRenderLoop();
      this.updateInfo('');
    } catch (error) {
      console.error('Error initializing game:', error);
      this.updateInfo(`Error: ${formatError(error)}`);
    }
  }

  private showMainMenu(
    wad: Awaited<ReturnType<typeof loadWAD>>,
    palette: Uint8Array,
    colormap: Uint8Array,
    rgbaPalette: Uint8ClampedArray
  ): void {
    const mainMenu = new MainMenu(wad, rgbaPalette, {
      onStartGame: (mapName: string, skill: number) => {
        mainMenu.hide();
        this.musicPlayer?.stop();
        void this.loadLevel(wad, palette, colormap, rgbaPalette, mapName, skill);
      },
      onMenuSound: () => this.soundManager?.play('switch', 0.3),
      onFirstInteraction: () => void this.musicPlayer?.activate(),
    });
    mainMenu.init().then(() => {
      mainMenu.show();
      mainMenu.startRenderLoop();
    });
  }

  private async loadLevel(
    wad: Awaited<ReturnType<typeof loadWAD>>,
    palette: Uint8Array,
    colormap: Uint8Array,
    rgbaPalette: Uint8ClampedArray,
    mapName: string,
    skill: number = 3
  ): Promise<void> {
    try {
      if (this.levelRenderer) {
        this.teardownPlaySession();
      }

      const mapLumps = wad.getMapLumps(mapName);
      if (!mapLumps) {
        throw new Error(`Map ${mapName} not found`);
      }

      this.updateInfo(`Parsing ${mapName}...`);

      this.playerDied = false;
      this.currentMapName = mapName;
      this.gameSkill = skill;

      this.mapData = MapParser.parseMap(mapName, mapLumps, wad);
      console.log(`Parsed ${mapName}`);

      // Create level renderer (need this first for callbacks)
      this.updateInfo(`Building ${mapName} geometry...`);
      this.levelRenderer = new LevelRenderer(this.scene, wad, palette, colormap, this.mapData);

      // Create weapon renderer and HUD
      this.weaponRenderer = new WeaponRenderer(wad, rgbaPalette);
      this.statusBar = new StatusBar(wad, rgbaPalette, this.gameContainer);
      this.borderFrame = new BorderFrame(wad, rgbaPalette);
      await this.borderFrame.init();
      this.borderFrame.setViewportGameSize(DOOM_INTERNAL_WIDTH, DOOM_VIEW_HEIGHT);
      if (this.viewContainer) {
        this.viewContainer.appendChild(this.borderFrame.getCanvas());
        this.borderFrame.resize(this.viewContainer.offsetWidth, this.viewContainer.offsetHeight);
      }
      // soundManager and musicPlayer created in init()
      await this.statusBar.init();
      this.onResize();
      this.sectorBaseLightLevels = this.mapData.sectors.map((sector) => sector.lightlevel);
      this.musicPlayer?.prepareMapMusic(mapName);

      // Initialize sector managers with renderer callbacks
      this.doorManager = new DoorManager(
        this.mapData,
        (sectorIndex, oldHeight, newHeight) => this.levelRenderer?.updateSectorCeiling(sectorIndex, oldHeight, newHeight),
        (sectorIndex, newCeilingHeight) => {
          // Check if any mobj in this sector would be crushed
          const allMobjs = this.thinkerManager.getAllMobjs();
          for (const mobj of allMobjs) {
            if (mobj.removed || mobj.sectorIndex !== sectorIndex) continue;
            const mobjTop = FixedToFloat(mobj.z) + FixedToFloat(mobj.height);
            if (mobjTop > newCeilingHeight) return true;
          }
          if (this.playerMobj && this.playerMobj.sectorIndex === sectorIndex) {
            const playerTop = FixedToFloat(this.playerMobj.z) + FixedToFloat(this.playerMobj.height);
            if (playerTop > newCeilingHeight) return true;
          }
          return false;
        }
      );
      this.platformManager = new PlatformManager(
        this.mapData,
        (sectorIndex, oldHeight, newHeight) => this.levelRenderer?.updateSectorFloor(sectorIndex, oldHeight, newHeight)
      );
      this.triggerSystem = new TriggerSystem(
        this.mapData,
        this.doorManager,
        this.platformManager,
        this.handleLevelExit
      );

      // Continue with level building

      // Add sky
      this.levelRenderer.addSky();

      // Build level geometry (async - loads textures)
      await this.levelRenderer.buildLevel();
      this.spawnMapThings(skill);
      this.initLevelKillItemTotals();
      setPlayerCountedKillHook(() => {
        this.levelKills++;
      });

      // Create player mobj at player start
      const playerStart = this.levelRenderer.getPlayerStart();
      if (playerStart) {
        const x = IntToFixed(playerStart.x);
        const y = IntToFixed(playerStart.y);
        const z = IntToFixed(playerStart.z);
        const angle = DegreesToAngle(playerStart.angle);

        this.playerMobj = createPlayerMobj(x, y, z, angle);

        // Set proper floor and ceiling heights from sector
        this.playerMobj.floorz = IntToFixed(playerStart.floorz);
        this.playerMobj.ceilingz = IntToFixed(playerStart.ceilingz);

        // Initialize player weapon
        if (this.playerMobj.player) {
          this.playerMobj.player.weapon = createPlayerWeapon();
          this.playerHealthAtLastTickEnd = this.playerMobj.health;
        }

        console.log(`Player created at (${playerStart.x}, ${playerStart.y}, ${playerStart.z}) angle ${playerStart.angle}°`);
        console.log(`Floor: ${playerStart.floorz}, Ceiling: ${playerStart.ceilingz}`);

        // Position camera at player
        this.updateCamera();
        this.ensureDamageFlashMesh();
      } else {
        // Default camera position
        this.camera.position.set(0, 100, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
      }

      this.updateInfo(`${mapName} - WASD to move, mouse to look, SPACE to use, 1-7 weapons, CTRL to fire.`);
      this.infoElement.style.display = 'none';
      console.log('Level rendering complete');

      // Set up ticker and start immediately
      this.ticker = new GameTicker((tick) => this.gameTick(tick));
      this.ticker.start();

      // Start in first-person mode with pointer lock
      this.controls.enabled = false;
      if (this.playerMobj) {
        this.inputManager.requestPointerLock();
      }
    } catch (error) {
      console.error('Error initializing game:', error);
      this.updateInfo(`Error: ${formatError(error)}`);
    }
  }

  /**
   * Game tick - runs at 35 Hz
   */
  private gameTick(tick: number): void {
    this.tickCount++;

    if (!this.playerMobj || !this.mapData) return;
    if (this.playerMobj.health <= 0) {
      this.handlePlayerDeath();
      return;
    }

    // Save old position for walk trigger detection
    const oldX = FixedToFloat(this.playerMobj.x);
    const oldY = FixedToFloat(this.playerMobj.y);

    const healthPrevTick = this.playerHealthAtLastTickEnd;
    const cmd = this.inputManager.buildTicCmd();
    const refire = (this.previousButtons & Button.ATTACK) !== 0;
    const attackHeld = (cmd.buttons & Button.ATTACK) !== 0;

    if ((cmd.buttons & Button.USE) && !(this.previousButtons & Button.USE) && this.triggerSystem) {
      this.tryUseAction();
    }

    if (cmd.buttons & Button.ATTACK) {
      this.firePlayerWeapon(refire);
    }

    this.previousButtons = cmd.buttons;

    // Apply player movement (P_MovePlayer)
    movePlayer(this.playerMobj, cmd);

    // Clamp momentum to MAXMOVE (vanilla P_XYMovement)
    clampMomentum(this.playerMobj);

    // Apply XY momentum with collision detection (sub-stepped like vanilla)
    applyCollision(this.playerMobj, this.mapData, this.thinkerManager.getAllMobjs());

    // Apply friction after XY movement (vanilla order)
    applyFriction(this.playerMobj, cmd);

    // Apply gravity and Z momentum (P_ZMovement)
    applyGravity(this.playerMobj);
    applyZMomentum(this.playerMobj);

    // Update player view height (landing squat, rise from spawn)
    updateViewHeight(this.playerMobj);

    // Check for item pickups
    const allMobjs = this.thinkerManager.getAllMobjs();
    for (const item of allMobjs) {
      // Skip non-special items
      if (!(item.flags & MobjFlags.SPECIAL)) continue;

      // Check collision with player
      if (checkItemCollision(this.playerMobj, item)) {
        const result = tryPickupItem(item, this.playerMobj);
        if (result.success) {
          this.soundManager?.play('pickup', 0.35);
          if (item.countsTowardItem) this.levelItems++;
        }
      }
    }

    this.cleanupRemovedMobjs();

    // Check for walk triggers (lines crossed by player movement)
    if (this.triggerSystem) {
      this.triggerSystem.checkWalkTriggers(this.playerMobj, oldX, oldY);
    }

    // Save player health before enemies act (for damage feedback)
    const healthBeforeThinkers = this.playerMobj.health;

    // Run all thinkers (enemies, projectiles, etc.)
    this.thinkerManager.runThinkers();
    this.noiseOrigin = undefined;

    // Play pain sound when player takes damage from enemies
    if (
      this.playerMobj.health > 0 &&
      this.playerMobj.health < healthBeforeThinkers
    ) {
      this.soundManager?.play('playerPain', 0.5);
    }

    // Update doors and platforms
    if (this.doorManager) {
      this.doorManager.updateDoors();
    }
    if (this.platformManager) {
      this.platformManager.updatePlatforms();
    }

    // Update player weapon state
    if (this.playerMobj.player?.weapon) {
      updateWeapon(this.playerMobj.player.weapon);
    }

    this.updateSectorSpecials();

    if (this.playerMobj.health <= 0) {
      this.handlePlayerDeath();
    }

    if (this.playerMobj.player) {
      const p = this.playerMobj.player;
      if (p.damageCount > 0) {
        p.damageCount--;
      }
      if (p.bonusCount > 0) {
        p.bonusCount--;
      } else if (p.message) {
        p.message = '';
      }

      for (const [powerup, duration] of Object.entries(p.powerups)) {
        if (duration > 0) {
          p.powerups[powerup] = duration - 1;
        }
      }
    }

    this.levelTime++; // Match DOOM: increment at end of tick (p_tick.c)

    this.levelRenderer?.syncWorldMobjs(this.thinkerManager.getAllMobjs());

    if (this.statusBar && this.playerMobj.player) {
      const p = this.playerMobj.player;
      const weaponJustPickedFace = !!p.weaponJustPicked;
      if (p.weaponJustPicked) {
        p.weaponJustPicked = false;
      }
      const stats: PlayerStats = {
        health: this.playerMobj.health,
        armor: p.armor,
        ammo: this.getReadyAmmoForHud(),
        ammoCounts: [p.ammo.bullets, p.ammo.shells, p.ammo.rockets, p.ammo.cells],
        maxAmmoCounts: [p.maxAmmo.bullets, p.maxAmmo.shells, p.maxAmmo.rockets, p.maxAmmo.cells],
        keys: p.keys,
        weapons: p.weapons,
        currentWeapon: p.weapon?.currentWeapon ?? 0,
        message: p.message,
        faceContext: {
          healthPrevTick,
          damageCount: p.damageCount,
          bonusCount: p.bonusCount,
          weaponJustPicked: weaponJustPickedFace,
          attackHeld,
          invulnTics: p.powerups.invulnerability ?? 0,
          angleBam: this.playerMobj.angle,
          playerX: FixedToFloat(this.playerMobj.x),
          playerY: FixedToFloat(this.playerMobj.y),
          playerMo: this.playerMobj,
          damageAttacker: p.damageAttacker,
        },
      };
      this.statusBar.render(stats);
      if (p.damageAttacker) {
        p.damageAttacker = undefined;
      }
    }

    this.playerHealthAtLastTickEnd = this.playerMobj.health;

    if (import.meta.env.DEV && this.tickCount % TICRATE === 0) {
      const x = FixedToFloat(this.playerMobj.x);
      const y = FixedToFloat(this.playerMobj.y);
      const z = FixedToFloat(this.playerMobj.z);
      const thinkerCount = this.thinkerManager.getCount();
      console.log(`Tick ${tick}: Player at (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) | Thinkers: ${thinkerCount}`);
    }
  }

  /**
   * Fire player weapon (`refire` = attack held last tic; first shot accurate for pistol/chaingun).
   */
  private firePlayerWeapon(refire: boolean): void {
    if (!this.playerMobj?.player?.weapon || !this.mapData) return;

    const player = this.playerMobj;
    const pstate = player.player!;
    const weapon = pstate.weapon!;
    if (!canPlayerUseWeapon(player, weapon.currentWeapon)) {
      return;
    }
    if (!fireWeapon(weapon, player)) {
      return;
    }

    this.weaponFlashUntilTick = this.tickCount + 4;
    this.noiseOrigin = { x: FixedToFloat(player.x), y: FixedToFloat(player.y) };

    const w = weapon.currentWeapon;
    if (w === WeaponType.SHOTGUN || w === WeaponType.SUPER_SHOTGUN) {
      this.soundManager?.play('shotgun', 0.45);
    } else if (w === WeaponType.CHAINGUN) {
      this.soundManager?.play('chaingun', 0.35);
    } else if (w === WeaponType.ROCKET_LAUNCHER) {
      this.soundManager?.play('rocket', 0.45);
    } else if (w === WeaponType.PLASMA_RIFLE || w === WeaponType.BFG9000) {
      this.soundManager?.play('chaingun', 0.25);
    } else {
      this.soundManager?.play('pistol', 0.35);
    }

    const allMobjs = this.thinkerManager.getAllMobjs();
    const angleBam = player.angle;
    const accurate = !refire;

    const applyHitscan = (result: ReturnType<typeof performHitscan>): void => {
      if (result?.hit && result.target) {
        const dmg = damageActor(result.target, result.damage, player);
        if (dmg.killed) this.playDeathSound(result.target.type);
        this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
      } else if (result && !result.hit && !result.hitSky) {
        this.spawnPuff(result.hitPoint.x, result.hitPoint.y, result.hitPoint.z);
      }
    };

    if (w === WeaponType.PISTOL) {
      applyHitscan(performHitscan(player, angleBam, gunshotPelletDamage(), allMobjs, this.mapData, { accurate }));
      consumeWeaponAmmo(player, w);
    } else if (w === WeaponType.CHAINGUN) {
      applyHitscan(performHitscan(player, angleBam, gunshotPelletDamage(), allMobjs, this.mapData, { accurate }));
      consumeWeaponAmmo(player, w);
    } else if (w === WeaponType.SHOTGUN) {
      const bs = bulletSlope(player, this.mapData, allMobjs);
      for (let i = 0; i < 7; i++) {
        applyHitscan(
          performHitscan(player, angleBam, gunshotPelletDamage(), allMobjs, this.mapData, {
            spreadBits: 18,
            overrideAimSlope: bs,
          })
        );
      }
      consumeWeaponAmmo(player, w);
    } else if (w === WeaponType.SUPER_SHOTGUN) {
      const bs = bulletSlope(player, this.mapData, allMobjs);
      for (let i = 0; i < 20; i++) {
        applyHitscan(
          performHitscan(player, angleBam, gunshotPelletDamage(), allMobjs, this.mapData, {
            spreadBits: 19,
            overrideAimSlope: bs,
            slopePerturbShift: 5,
          })
        );
      }
      consumeWeaponAmmo(player, w);
    } else if (w === WeaponType.FIST) {
      const berserk = (pstate.powerups.berserk ?? 0) !== 0;
      applyHitscan(
        performHitscan(player, angleBam, punchDamage(berserk), allMobjs, this.mapData, {
          accurate: false,
          maxRange: 64,
          aimMode: 'melee',
        })
      );
    } else if (w === WeaponType.CHAINSAW) {
      applyHitscan(
        performHitscan(player, angleBam, chainsawDamage(), allMobjs, this.mapData, {
          accurate: false,
          maxRange: 65,
          aimMode: 'melee',
        })
      );
    } else if (w === WeaponType.ROCKET_LAUNCHER) {
      spawnPlayerProjectile(player, 'rocket', this.mapData, () => this.thinkerManager.getAllMobjs(), (m, t) =>
        this.addWorldMobj(m, t)
      );
      consumeWeaponAmmo(player, w);
    } else if (w === WeaponType.PLASMA_RIFLE) {
      spawnPlayerProjectile(player, 'plasma', this.mapData, () => this.thinkerManager.getAllMobjs(), (m, t) =>
        this.addWorldMobj(m, t)
      );
      consumeWeaponAmmo(player, w);
    } else if (w === WeaponType.BFG9000) {
      spawnPlayerProjectile(player, 'bfg', this.mapData, () => this.thinkerManager.getAllMobjs(), (m, t) =>
        this.addWorldMobj(m, t)
      );
      consumeWeaponAmmo(player, w);
    }
  }

  /**
   * Try to use/activate a line (spacebar)
   */
  private tryUseAction(): void {
    if (!this.playerMobj || !this.triggerSystem || !this.mapData) return;

    const px = FixedToFloat(this.playerMobj.x);
    const py = FixedToFloat(this.playerMobj.y);

    // Find nearest usable line within range
    let nearestLine = -1;
    let nearestDist = 64; // Use range

    for (let i = 0; i < this.mapData.linedefs.length; i++) {
      const line = this.mapData.linedefs[i];
      if (line.special === 0) continue;
      if (!this.triggerSystem.isUseActivatableSpecial(line.special)) continue;

      const v1 = this.mapData.vertexes[line.v1];
      const v2 = this.mapData.vertexes[line.v2];

      // Calculate distance to line
      const dx = v2.x - v1.x;
      const dy = v2.y - v1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      // Project player position onto line
      const t = Math.max(0, Math.min(1, ((px - v1.x) * dx + (py - v1.y) * dy) / (len * len)));
      const projX = v1.x + t * dx;
      const projY = v1.y + t * dy;

      const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestLine = i;
      }
    }

    if (nearestLine >= 0) {
      const special = this.mapData.linedefs[nearestLine].special;
      const success = this.triggerSystem.useLine(this.playerMobj, nearestLine);
      if (success) {
        console.log(`Activated line ${nearestLine} (special ${special})`);
        this.soundManager?.play('switch', 0.3);
        if (special === 1) {
          this.soundManager?.play('doorOpen', 0.35);
        }
      }
    }
  }

  /**
   * Update camera to follow player
   */
  private updateCamera(): void {
    if (!this.playerMobj) return;

    // Calculate view position with bobbing
    const viewZ = calculateViewZ(this.playerMobj, this.levelTime);

    // Convert to three.js coordinates
    const pos = doomToThree(
      FixedToFloat(this.playerMobj.x),
      FixedToFloat(this.playerMobj.y),
      FixedToFloat(viewZ)
    );

    // Look direction from player angle (BAM to radians)
    // DOOM coordinates: angle 0 = East, 90° = North
    const angleRad = doomAngleToThreeRadians(this.playerMobj.angle);

    // In DOOM/three.js conversion: X stays X, Y becomes -Z
    const lookTarget = pos.clone();
    lookTarget.x += Math.cos(angleRad) * 100;
    lookTarget.z -= Math.sin(angleRad) * 100;

    if (this.useOrbitControls) {
      // Keep the orbit camera anchored near the player instead of whatever
      // position OrbitControls happened to initialize with.
      const orbitOffset = new THREE.Vector3(
        -Math.cos(angleRad) * 160,
        96,
        Math.sin(angleRad) * 160
      );
      this.camera.position.copy(pos.clone().add(orbitOffset));
      this.controls.target.copy(pos);
      this.controls.update();
    } else {
      // First-person mode
      this.camera.position.copy(pos);
      this.camera.lookAt(lookTarget);
    }
  }

  public start(): void {
    this.animate();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    // Update camera to follow player in both first-person and orbit modes.
    if (this.playerMobj) {
      this.updateCamera();
    }

    // Update BSP visibility based on player/camera position
    if (this.levelRenderer && this.playerMobj) {
      const x = FixedToFloat(this.playerMobj.x);
      const y = FixedToFloat(this.playerMobj.y);
      this.levelRenderer.updateVisibility(x, y, this.playerMobj.angle, this.camera.position);
      // Update sky to follow camera
      this.levelRenderer.updateSky(this.camera.position);
    }

    // Update weapon every frame (not just in game tick)
    if (this.weaponRenderer && this.playerMobj?.player?.weapon && !this.playerDied) {
      const bob = this.playerMobj.player.bob;
      const showFlash = this.weaponFlashUntilTick > this.tickCount;
      this.weaponRenderer.update(this.playerMobj.player.weapon, bob, this.tickCount, showFlash);
    }

    this.updateDamageFlashFromPlayer();

    // Render scene
    this.renderer.render(this.scene, this.camera);

    // Render weapon overlay (in first-person mode only)
    if (!this.useOrbitControls && this.weaponRenderer && !this.playerDied) {
      this.weaponRenderer.render(this.renderer);
    }
  };
}

// Initialize the game when DOM is ready
const game = new DoomGame();
game.start();
game.init();
