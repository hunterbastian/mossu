import {
  Clock,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { GameState } from "../../simulation/gameState";
import { InputController, InputSnapshot } from "../../simulation/input";
import { sampleWindStrength } from "../../simulation/world";
import { ViewMode } from "../../simulation/viewMode";
import { CharacterPreview } from "./CharacterPreview";
import { FollowCamera } from "./FollowCamera";
import { HudShell } from "./HudShell";
import { WorldRenderer } from "../world/WorldRenderer";

const QUALITY_SAMPLE_SECONDS = 0.9;
const QUALITY_MIN_SAMPLE_FRAMES = 18;
const PIXEL_RATIO_DOWNSHIFT_FRAME_SECONDS = 1 / 55;
const PIXEL_RATIO_UPSHIFT_FRAME_SECONDS = 1 / 68;
const PIXEL_RATIO_STEP_DOWN = 0.16;
const PIXEL_RATIO_STEP_UP = 0.04;

const PAUSED_INPUT: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  jumpHeld: false,
  jumpPressed: false,
  rollHeld: false,
  interactPressed: false,
  inventoryTogglePressed: false,
  mapTogglePressed: false,
  escapePressed: false,
};

export class GameApp {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly state = new GameState();
  private readonly input = new InputController(window);
  private readonly followCamera: FollowCamera;
  private readonly world: WorldRenderer;
  private readonly characterPreview = new CharacterPreview();
  private readonly clock = new Clock();
  private readonly hud: HudShell;
  private viewMode: ViewMode = "third_person";
  private pauseMenuOpen = false;
  private characterScreenOpen = false;
  private elapsed = 0;
  private focusedCollectionId: string | null = null;
  private suppressPauseOnPointerUnlock = false;
  private suppressPointerUnlockPauseUntil = 0;
  private readonly maxPixelRatio = Math.min(window.devicePixelRatio, 1.75);
  private readonly minPixelRatio = Math.min(this.maxPixelRatio, 0.9);
  private activePixelRatio = this.maxPixelRatio;
  private frameTimeAccumulator = 0;
  private frameSampleAccumulator = 0;
  private latestFrameMs = 1000 / 60;
  private smoothedFrameMs = 1000 / 60;
  private qualitySampleFrameMs = 1000 / 60;
  private readonly cameraDebugEnabled: boolean;
  private readonly perfDebugEnabled: boolean;
  private cameraDebugPanel: HTMLDivElement | null = null;
  private perfDebugPanel: HTMLDivElement | null = null;

  private raf = 0;

  constructor(private readonly container: HTMLElement) {
    const params = new URLSearchParams(window.location.search);
    const debugSpiritCloseup = params.has("spiritCloseup");
    this.cameraDebugEnabled = params.has("cameraDebug");
    this.perfDebugEnabled = params.has("perfDebug");
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(this.activePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    this.followCamera = new FollowCamera(this.renderer.domElement);
    this.world = new WorldRenderer(this.scene, { debugSpiritCloseup });
    this.followCamera.setCollisionMeshes(this.world.getCameraCollisionMeshes());
    this.hud = new HudShell(this.characterPreview.element);
    this.container.appendChild(this.hud.element);

    if (this.cameraDebugEnabled) {
      this.cameraDebugPanel = document.createElement("div");
      this.cameraDebugPanel.className = "camera-debug";
      this.container.appendChild(this.cameraDebugPanel);
    }

    if (this.perfDebugEnabled) {
      this.perfDebugPanel = document.createElement("div");
      this.perfDebugPanel.className = "perf-debug";
      this.container.appendChild(this.perfDebugPanel);
    }

    window.addEventListener("resize", this.handleResize);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    this.handleResize();
  }

  start() {
    this.clock.start();
    const loop = () => {
      const rawDt = Math.min(0.1, this.clock.getDelta());
      const dt = Math.min(0.033, rawDt);
      this.trackFrameTiming(rawDt);
      this.elapsed += dt;
      this.tick(dt, this.elapsed);
      this.updateRenderQuality(rawDt);
      this.raf = window.requestAnimationFrame(loop);
    };
    loop();
  }

  dispose() {
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.input.dispose();
    this.followCamera.dispose();
    this.characterPreview.dispose();
    this.cameraDebugPanel?.remove();
    this.perfDebugPanel?.remove();
    this.renderer.dispose();
  }

  advanceTime(ms: number) {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round(ms / (dt * 1000)));
    for (let i = 0; i < steps; i += 1) {
      this.elapsed += dt;
      this.tick(dt, this.elapsed);
    }
  }

  renderGameToText() {
    const frame = this.state.frame;
    const characterData = this.state.getCharacterScreenData();
    const faunaStats = this.world.getFaunaStats();
    const focusedCollection = characterData.collections.find(
      (entry) => entry.landmarkId === (characterData.latestCollectionId ?? this.focusedCollectionId),
    );
    const latestGatheredGood = characterData.gatheredGoods.find(
      (entry) => entry.forageableId === characterData.latestGatheredGoodId,
    );
    return JSON.stringify({
      coordinateSystem: "x right, y up, z forward across the island",
      mode: this.viewMode,
      pauseMenuOpen: this.pauseMenuOpen,
      characterScreenOpen: this.characterScreenOpen,
      player: {
        x: Number(frame.player.position.x.toFixed(1)),
        y: Number(frame.player.position.y.toFixed(1)),
        z: Number(frame.player.position.z.toFixed(1)),
        stamina: Number(frame.player.stamina.toFixed(1)),
        staminaMax: Number(frame.player.staminaMax.toFixed(1)),
        rolling: frame.player.rolling,
        grounded: frame.player.grounded,
        swimming: frame.player.swimming,
        waterDepth: Number(frame.player.waterDepth.toFixed(1)),
      },
      zone: frame.currentZone,
      landmark: frame.currentLandmark,
      characterScreen: {
        stats: characterData.stats.map((stat) => ({ label: stat.label, value: stat.value })),
        upgrades: {
          unlocked: characterData.upgrades.unlocked.map((upgrade) => upgrade.label),
          locked: characterData.upgrades.locked.map((upgrade) => upgrade.label),
        },
        collections: {
          discovered: characterData.totals.discovered,
          total: characterData.totals.total,
          focusedEntry: focusedCollection?.keepsakeTitle ?? null,
        },
        gatheredGoods: {
          gathered: characterData.gatheredTotals.gathered,
          total: characterData.gatheredTotals.total,
          latestEntry: latestGatheredGood?.title ?? null,
        },
      },
      fauna: {
        recruited: faunaStats.recruitedCount,
        nearestRecruitableDistance:
          faunaStats.nearestRecruitableDistance === null
            ? null
            : Number(faunaStats.nearestRecruitableDistance.toFixed(1)),
        recruitedThisFrame: faunaStats.recruitedThisFrame,
      },
      camera: this.followCamera.getDebugState(),
      performance: this.getPerformanceSnapshot(),
    });
  }

  private tick(dt: number, elapsed: number) {
    const input = this.input.sample();
    let faunaRecruitPressed = false;

    if (this.pauseMenuOpen) {
      if (input.escapePressed) {
        this.closePauseMenu();
      } else if (input.inventoryTogglePressed) {
        this.openCharacterScreen();
      } else if (input.mapTogglePressed) {
        this.openMap();
      }
      this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    } else if (this.characterScreenOpen) {
      if (input.escapePressed || input.inventoryTogglePressed) {
        this.closeCharacterScreen();
      } else if (input.mapTogglePressed) {
        this.openMap();
      }
      this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    } else if (this.viewMode === "map_lookdown") {
      if (input.escapePressed || input.mapTogglePressed) {
        this.closeMap();
      } else if (input.inventoryTogglePressed) {
        this.openCharacterScreen();
      }
      this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    } else {
      if (input.escapePressed) {
        this.openPauseMenu();
        this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
      } else if (input.inventoryTogglePressed) {
        this.openCharacterScreen();
        this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
      } else if (input.mapTogglePressed) {
        this.openMap();
        this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
      } else {
        faunaRecruitPressed = input.interactPressed;
        this.state.update(dt, input, this.followCamera.getYaw());
      }
    }

    if (this.state.frame.lastCatalogedLandmarkId) {
      this.focusedCollectionId = this.state.frame.lastCatalogedLandmarkId;
    } else if (!this.focusedCollectionId && this.state.frame.interactionTarget) {
      this.focusedCollectionId = this.state.frame.interactionTarget.landmarkId;
    }

    this.followCamera.update(this.state.frame.player, dt);
    this.world.update(this.state.frame, elapsed, dt, this.viewMode === "map_lookdown", faunaRecruitPressed);
    this.characterPreview.update(dt, this.characterScreenOpen);
    this.syncHud();
    this.renderer.render(this.scene, this.followCamera.camera);
    this.updateDebugPanels();
  }

  private syncHud() {
    this.hud.update({
      frame: this.state.frame,
      characterData: this.state.getCharacterScreenData(),
      viewMode: this.viewMode,
      pauseMenuOpen: this.pauseMenuOpen,
      characterScreenOpen: this.characterScreenOpen,
      pointerLocked: this.followCamera.isPointerLocked(),
      focusedCollectionId: this.focusedCollectionId,
      fauna: this.world.getFaunaStats(),
      windStrength: sampleWindStrength(
        this.state.frame.player.position.x,
        this.state.frame.player.position.z,
        this.state.frame.player.position.y,
      ),
    });
  }

  private updateRenderQuality(rawDt: number) {
    this.frameTimeAccumulator += rawDt;
    this.frameSampleAccumulator += 1;

    if (this.frameTimeAccumulator < QUALITY_SAMPLE_SECONDS || this.frameSampleAccumulator < QUALITY_MIN_SAMPLE_FRAMES) {
      return;
    }

    const averageFrameSeconds = this.frameTimeAccumulator / this.frameSampleAccumulator;
    this.qualitySampleFrameMs = averageFrameSeconds * 1000;
    this.frameTimeAccumulator = 0;
    this.frameSampleAccumulator = 0;

    const nextPixelRatio =
      averageFrameSeconds > PIXEL_RATIO_DOWNSHIFT_FRAME_SECONDS
        ? Math.max(this.minPixelRatio, this.activePixelRatio - PIXEL_RATIO_STEP_DOWN)
        : averageFrameSeconds < PIXEL_RATIO_UPSHIFT_FRAME_SECONDS
          ? Math.min(this.maxPixelRatio, this.activePixelRatio + PIXEL_RATIO_STEP_UP)
          : this.activePixelRatio;

    if (Math.abs(nextPixelRatio - this.activePixelRatio) < 0.01) {
      return;
    }

    this.activePixelRatio = nextPixelRatio;
    this.renderer.setPixelRatio(this.activePixelRatio);
  }

  private trackFrameTiming(rawDt: number) {
    this.latestFrameMs = Math.max(0.1, rawDt * 1000);
    this.smoothedFrameMs += (this.latestFrameMs - this.smoothedFrameMs) * 0.1;
  }

  private updateDebugPanels() {
    this.updateCameraDebug();
    this.updatePerfDebug();
  }

  private updateCameraDebug() {
    if (!this.cameraDebugPanel) {
      return;
    }

    const camera = this.followCamera.getDebugState();
    const player = this.state.frame.player;
    this.cameraDebugPanel.textContent = [
      `camera ${camera.style} / ${camera.profile}`,
      `distance ${camera.distance}  polar ${camera.polar} (${camera.minPolar}-${camera.maxPolar})  up ${camera.upLookLimitDegrees}deg`,
      `fov ${camera.fov}  shoulder ${camera.shoulder}  lookAhead ${camera.lookAhead}`,
      `focusY ${camera.focusHeight}  recenter ${camera.recenterCooldown}s  yaw ${camera.yawResponsiveness}  locked ${camera.pointerLocked}`,
      `player x ${player.position.x.toFixed(1)} y ${player.position.y.toFixed(1)} z ${player.position.z.toFixed(1)}`,
    ].join("\n");
  }

  private getPerformanceSnapshot() {
    const rendererInfo = this.renderer.info;
    const world = this.world.getPerfStats();
    return {
      fps: Number((1000 / Math.max(0.1, this.smoothedFrameMs)).toFixed(1)),
      frameMs: Number(this.smoothedFrameMs.toFixed(2)),
      latestFrameMs: Number(this.latestFrameMs.toFixed(2)),
      qualitySampleFrameMs: Number(this.qualitySampleFrameMs.toFixed(2)),
      pixelRatio: Number(this.activePixelRatio.toFixed(2)),
      maxPixelRatio: Number(this.maxPixelRatio.toFixed(2)),
      minPixelRatio: Number(this.minPixelRatio.toFixed(2)),
      renderer: {
        calls: rendererInfo.render.calls,
        triangles: rendererInfo.render.triangles,
        lines: rendererInfo.render.lines,
        points: rendererInfo.render.points,
      },
      memory: {
        geometries: rendererInfo.memory.geometries,
        textures: rendererInfo.memory.textures,
      },
      world,
    };
  }

  private updatePerfDebug() {
    if (!this.perfDebugPanel) {
      return;
    }

    const perf = this.getPerformanceSnapshot();
    this.perfDebugPanel.textContent = [
      `perf ${perf.fps}fps  avg ${perf.frameMs}ms  raw ${perf.latestFrameMs}ms`,
      `quality avg ${perf.qualitySampleFrameMs}ms  pixelRatio ${perf.pixelRatio} (${perf.minPixelRatio}-${perf.maxPixelRatio})`,
      `renderer calls ${perf.renderer.calls}  tris ${perf.renderer.triangles}  lines ${perf.renderer.lines}  points ${perf.renderer.points}`,
      `memory geometries ${perf.memory.geometries}  textures ${perf.memory.textures}`,
      `terrain ${perf.world.terrainVertices}v / ${perf.world.terrainTriangles}t`,
      `grass ${perf.world.grassMeshes} meshes / ${perf.world.grassInstances} inst / est ${perf.world.grassEstimatedTriangles}t`,
      `forest ${perf.world.forestMeshes} meshes / ${perf.world.forestInstances} inst / est ${perf.world.forestEstimatedTriangles}t`,
      `water ${perf.world.waterSurfaces} surfaces / ${perf.world.waterVertices}v / ${perf.world.waterTriangles}t`,
      `animated shaders ${perf.world.animatedShaderMeshes}  grass ${perf.world.grassShaderMeshes}  trees ${perf.world.treeShaderMeshes}  water ${perf.world.waterShaderSurfaces}`,
    ].join("\n");
  }

  private handleResize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.followCamera.resize(window.innerWidth, window.innerHeight);
  };

  private handlePointerLockChange = () => {
    if (document.pointerLockElement) {
      return;
    }

    if (this.suppressPauseOnPointerUnlock || this.elapsed <= this.suppressPointerUnlockPauseUntil) {
      this.suppressPauseOnPointerUnlock = false;
      return;
    }

    if (this.viewMode === "third_person" && !this.characterScreenOpen && !this.pauseMenuOpen) {
      this.pauseMenuOpen = true;
      this.syncHud();
    }
  };

  private openCharacterScreen() {
    this.pauseMenuOpen = false;
    this.characterScreenOpen = true;
    this.closeMap();
    this.releaseGameplayPointerLock();
  }

  private closeCharacterScreen() {
    this.characterScreenOpen = false;
  }

  private openPauseMenu() {
    this.characterScreenOpen = false;
    this.pauseMenuOpen = true;
    this.closeMap();
    this.releaseGameplayPointerLock();
  }

  private closePauseMenu() {
    this.pauseMenuOpen = false;
  }

  private openMap() {
    this.pauseMenuOpen = false;
    this.characterScreenOpen = false;
    this.setViewMode("map_lookdown");
  }

  private closeMap() {
    if (this.viewMode !== "third_person") {
      this.setViewMode("third_person");
    }
  }

  private releaseGameplayPointerLock() {
    this.suppressNextPointerUnlockPause();
    this.followCamera.releasePointerLock();
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.suppressPauseOnPointerUnlock = false;
    }
  }

  private setViewMode(viewMode: ViewMode) {
    this.viewMode = viewMode;
    if (viewMode === "map_lookdown") {
      this.suppressNextPointerUnlockPause();
    }
    this.followCamera.setViewMode(viewMode);
    this.syncHud();
  }

  private suppressNextPointerUnlockPause() {
    this.suppressPauseOnPointerUnlock = true;
    this.suppressPointerUnlockPauseUntil = this.elapsed + 0.65;
  }
}
