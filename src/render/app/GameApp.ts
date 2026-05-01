import {
  ACESFilmicToneMapping,
  Clock,
  Scene,
  SRGBColorSpace,
  Vector2,
} from "three";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GameState } from "../../simulation/gameState";
import { InputController, InputSnapshot } from "../../simulation/input";
import { sampleRiverEdgeState, sampleWaterAmbience, sampleWindStrength } from "../../simulation/world";
import {
  CoopStressSimulator,
  getCoopStressRemoteCount,
  type CoopStressSnapshot,
} from "../../simulation/coopStress";
import { ViewMode } from "../../simulation/viewMode";
import { AmbientWaterAudio } from "./AmbientWaterAudio";
import {
  applyDebugPlayerSnapshot,
  applyDebugSaveSnapshot,
  resetDebugPlayerMovement,
  teleportDebugPlayerTo,
} from "./appDebugReplay";
import {
  BLOOM_MIN_PIXEL_RATIO,
  BLOOM_RADIUS,
  BLOOM_STRENGTH,
  BLOOM_THRESHOLD,
  IDLE_CAMERA_ORBIT_DELAY_SECONDS,
  NORMAL_HUD_UPDATE_INTERVAL,
  OPENING_SEQUENCE_SECONDS,
  OPENING_SEQUENCE_SKIP_AFTER_SECONDS,
  PAUSED_INPUT,
  POST_PROCESSING_RESUME_DELAY_SECONDS,
  hasControlActivity,
  isLowQuality,
  type DebugSaveStatePayload,
} from "./appRuntimeConfig";
import { CharacterPreview } from "./CharacterPreview";
import { DebugRouteCameraOptions, FollowCamera } from "./FollowCamera";
import { HudShell } from "./HudShell";
import { InterfaceAudio, isButtonLikeUiTarget } from "./InterfaceAudio";
import { MovementAudio } from "./MovementAudio";
import { GameplayFeedbackAudio } from "./GameplayFeedbackAudio";
import { routeLandmarks } from "./worldMap";
import type { WorldPerfStats, WorldRenderer as WorldRendererType } from "../world/WorldRenderer";
import { UnderwaterEffect } from "./UnderwaterEffect";
import { RETRO_RENDER_TEXTURE_SHADER } from "./retroTextureShader";
import {
  PERF_CAPTURE_FLASH_MS,
  PERF_HUD_UPDATE_MS,
  WORLD_PERF_STATS_UPDATE_MS,
  buildCompactPerfDebugText,
  buildFullPerfDebugText,
  createPerfCapture,
  createPerformanceSnapshot,
  getPerfFramePercentile,
  recordPerfFrameSample,
  type MossuPerformanceSnapshot,
  type PerfCapture,
} from "./appPerformance";
import {
  createPostProcessingRuntime,
  getPostProcessingSuppressedMs,
  getRenderPath,
  markPostProcessingScheduled,
  shouldUsePostProcessing as shouldUsePostProcessingRuntime,
  shouldUseRetroTexture as shouldUseRetroTextureRuntime,
  suppressPostProcessing as suppressPostProcessingRuntime,
  updateRenderPath,
  updateRetroTexturePass,
} from "./appPostProcessing";
import {
  createRenderQualityRuntime,
  createRenderResolutionPolicy,
  getRenderResolutionSnapshot,
  type RenderResolutionPolicy,
  sampleAdaptivePixelRatio,
} from "./appRenderQuality";
import { getUnderwaterEffectTargetIntensity } from "./appUnderwaterEffect";
import { MapDragController } from "./appMapDrag";
import { shouldUsePersistentSave } from "./localSave";
import {
  createLocalSaveRuntime,
  persistLocalSaveState as persistStoredSaveState,
  restoreLocalSaveState as restoreStoredSaveState,
} from "./appSaveState";
import {
  createRendererBundle,
  isWebGlRenderer,
  setSafeRendererClearColor,
  type ActiveRendererBackend,
  type GameRenderer,
  type RendererBundle,
  type RequestedRendererBackend,
} from "./rendererBackend";
import { createOpeningSequenceOverlay, createTitleScreen } from "./appTitleScreen";
import { serializeE2eGameTextState, serializeGameTextState } from "./appTextState";

export class GameApp {
  private readonly renderer: GameRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private retroTexturePass: ShaderPass | null = null;
  private readonly requestedRendererBackend: RequestedRendererBackend;
  private readonly activeRendererBackend: ActiveRendererBackend;
  private readonly webGpuAvailable: boolean;
  private readonly rendererFallbackReason: string | null;
  private readonly scene = new Scene();
  private readonly state = new GameState();
  private readonly input = new InputController(window);
  private readonly followCamera: FollowCamera;
  private readonly world: WorldRendererType;
  private readonly characterPreview = new CharacterPreview();
  private readonly interfaceAudio = new InterfaceAudio();
  private readonly movementAudio = new MovementAudio();
  private readonly gameplayFeedback = new GameplayFeedbackAudio();
  private readonly waterAudio = new AmbientWaterAudio();
  private readonly underwaterEffect: UnderwaterEffect;
  private readonly qualityLow: boolean;
  private readonly clock = new Clock();
  private readonly hud: HudShell;
  private readonly titleScreen: HTMLDivElement;
  private readonly openingSequenceOverlay: HTMLDivElement;
  private titleScreenOpen = true;
  private openingSequenceActive = false;
  private openingSequenceStartedAt = 0;
  private viewMode: ViewMode = "third_person";
  private pauseMenuOpen = false;
  private characterScreenOpen = false;
  private elapsed = 0;
  private focusedCollectionId: string | null = null;
  private suppressPauseOnPointerUnlock = false;
  private suppressPointerUnlockPauseUntil = 0;
  private maxPixelRatio: number;
  private minPixelRatio: number;
  private activePixelRatio: number;
  private renderResolutionPolicy: RenderResolutionPolicy;
  private hudUpdateAccumulator = 0;
  private latestFrameMs = 1000 / 60;
  private smoothedFrameMs = 1000 / 60;
  private readonly renderQuality = createRenderQualityRuntime();
  private readonly cameraDebugEnabled: boolean;
  private readonly perfDebugEnabled: boolean;
  private readonly perfHudEnabled: boolean;
  private readonly perfHudCompact: boolean;
  private readonly qaDebugEnabled: boolean;
  private readonly retroRenderEnabled: boolean;
  /** `?e2e=1` — small render_game_to_text for Playwright (avoids heavy sync snapshot on main thread). */
  private readonly e2eMinimal: boolean;
  /** `?visualProbe=1` keeps e2e startup light but lets advanceTime render deterministic canvas probes. */
  private readonly visualProbeEnabled: boolean;
  /** `?deterministicPerf=1` lets perfGuard own the render clock through advanceTime(). */
  private readonly deterministicPerf: boolean;
  private readonly savePersistenceEnabled: boolean;
  private readonly localSaveRuntime = createLocalSaveRuntime();
  private lastSavePersistenceRevision = -1;
  private readonly coopStress: CoopStressSimulator | null;
  private latestCoopStressSnapshot: CoopStressSnapshot | null = null;
  private cameraDebugPanel: HTMLDivElement | null = null;
  private perfDebugPanel: HTMLDivElement | null = null;
  private perfDebugVisible = true;
  private perfDebugWorldPrewarmed = false;
  private lastPerfFrameProfile: Record<string, number> | null = null;
  private perfPanelLastUpdatedAt = 0;
  private perfFrameSamples: number[] = [];
  private perfFrameSampleIndex = 0;
  private perfCaptureLatest: PerfCapture | null = null;
  private perfCaptureFlashUntil = 0;
  private cachedWorldPerfStats: WorldPerfStats | null = null;
  private cachedWorldPerfStatsAt = -Infinity;
  private waterDepthDebugEnabled = false;
  private idleControlSeconds = 0;
  private faunaRegroupReady = true;
  private firstKaruEncounterSeen = false;
  private summitCompletionSeen = false;
  private mapFocusedRouteIndex = -1;
  private readonly mapDrag = new MapDragController();
  private readonly postProcessing = createPostProcessingRuntime();
  private webGlContextLostCount = 0;
  private webGlContextRestoredCount = 0;
  private disposed = false;

  private raf = 0;

  static async create(container: HTMLElement) {
    const params = new URLSearchParams(window.location.search);
    const rendererBundle = await createRendererBundle(params);
    const { WorldRenderer } = await import("../world/WorldRenderer");
    return new GameApp(container, params, rendererBundle, WorldRenderer);
  }

  private constructor(
    private readonly container: HTMLElement,
    params: URLSearchParams,
    rendererBundle: RendererBundle,
    WorldRendererCtor: typeof import("../world/WorldRenderer").WorldRenderer,
  ) {
    const debugSpiritCloseup = params.has("spiritCloseup");
    this.cameraDebugEnabled = params.has("cameraDebug");
    this.perfHudEnabled = params.has("perfHud");
    this.perfDebugEnabled = params.has("perfDebug") || this.perfHudEnabled;
    this.perfHudCompact = this.perfHudEnabled;
    this.qaDebugEnabled = params.has("qaDebug");
    this.retroRenderEnabled = params.get("retro") !== "0" && !params.has("noRetro");
    this.e2eMinimal = params.has("e2e") && !params.has("perfDebug") && !params.has("perfHud");
    this.visualProbeEnabled = params.has("visualProbe");
    this.deterministicPerf = params.has("deterministicPerf");
    this.savePersistenceEnabled = shouldUsePersistentSave(params);
    const coopStressRemoteCount = getCoopStressRemoteCount(params);
    this.coopStress = coopStressRemoteCount > 0 ? new CoopStressSimulator(coopStressRemoteCount) : null;
    this.waterDepthDebugEnabled = params.has("waterDebugDepth") || params.get("waterDebug") === "depth";
    this.qualityLow = isLowQuality(params) || coopStressRemoteCount > 0;
    this.renderResolutionPolicy = createRenderResolutionPolicy({
      qualityLow: this.qualityLow,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    });
    this.maxPixelRatio = this.renderResolutionPolicy.maxPixelRatio;
    this.minPixelRatio = this.renderResolutionPolicy.minPixelRatio;
    this.activePixelRatio = this.coopStress || this.deterministicPerf
      ? this.minPixelRatio
      : this.renderResolutionPolicy.initialPixelRatio;
    this.renderer = rendererBundle.renderer;
    this.requestedRendererBackend = rendererBundle.requestedBackend;
    this.activeRendererBackend = rendererBundle.activeBackend;
    this.webGpuAvailable = rendererBundle.webGpuAvailable;
    this.rendererFallbackReason = rendererBundle.fallbackReason;
    this.restoreLocalSaveState();
    this.renderer.setPixelRatio(this.activePixelRatio);
    setSafeRendererClearColor(this.renderer);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);
    this.underwaterEffect = new UnderwaterEffect(this.container);

    this.followCamera = new FollowCamera(this.renderer.domElement);
    this.world = new WorldRendererCtor(this.scene, {
      debugSpiritCloseup,
      webGpuCompatibleMaterials: this.activeRendererBackend !== "webgl",
      waterDepthDebug: this.waterDepthDebugEnabled,
    });
    this.followCamera.setCollisionMeshes(this.world.getCameraCollisionMeshes());
    this.hud = new HudShell(this.characterPreview.element);
    this.container.appendChild(this.hud.element);
    this.hud.element.classList.add("hud--title-hidden");
    this.hud.element.classList.toggle("hud--coop-stress", this.coopStress !== null);

    this.titleScreen = createTitleScreen(this.startFromTitle);
    this.container.appendChild(this.titleScreen);
    this.openingSequenceOverlay = createOpeningSequenceOverlay();
    this.container.appendChild(this.openingSequenceOverlay);

    if (this.cameraDebugEnabled) {
      this.cameraDebugPanel = document.createElement("div");
      this.cameraDebugPanel.className = "camera-debug";
      this.container.appendChild(this.cameraDebugPanel);
    }

    if (this.perfHudEnabled) {
      this.perfDebugPanel = document.createElement("div");
      this.perfDebugPanel.className = "perf-debug";
      this.perfDebugPanel.classList.toggle("perf-debug--compact", this.perfHudCompact);
      this.container.appendChild(this.perfDebugPanel);
    }

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleTitleKeyDown);
    window.addEventListener("keydown", this.handlePerfHotkeys);
    window.addEventListener("wheel", this.handleMapWheel, { passive: false });
    window.addEventListener("pointermove", this.handleMapPointerMove);
    window.addEventListener("pointerup", this.handleMapPointerUp);
    window.addEventListener("pointercancel", this.handleMapPointerUp);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    this.renderer.domElement.addEventListener("webglcontextlost", this.handleWebGlContextLost);
    this.renderer.domElement.addEventListener("webglcontextrestored", this.handleWebGlContextRestored);
    this.renderer.domElement.addEventListener("pointerdown", this.handleMapPointerDown);
    this.container.addEventListener("pointerdown", this.handleUiPointerDown, true);
    this.container.addEventListener("click", this.handleUiCommandClick);
    this.container.addEventListener("keydown", this.handleUiKeyboardActivate, true);
    this.handleResize();
    window.setTimeout(() => {
      this.titleScreen.querySelector<HTMLButtonElement>(".title-screen__button")?.focus();
    }, 0);
  }

  start() {
    this.clock.start();
    if (this.e2eMinimal) {
      return;
    }
    this.prewarmShaders();
    if (this.deterministicPerf) {
      return;
    }

    this.schedulePostProcessingInit();
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
    this.disposed = true;
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleTitleKeyDown);
    window.removeEventListener("keydown", this.handlePerfHotkeys);
    window.removeEventListener("wheel", this.handleMapWheel);
    window.removeEventListener("pointermove", this.handleMapPointerMove);
    window.removeEventListener("pointerup", this.handleMapPointerUp);
    window.removeEventListener("pointercancel", this.handleMapPointerUp);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.handleWebGlContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.handleWebGlContextRestored);
    this.renderer.domElement.removeEventListener("pointerdown", this.handleMapPointerDown);
    this.container.removeEventListener("pointerdown", this.handleUiPointerDown, true);
    this.container.removeEventListener("click", this.handleUiCommandClick);
    this.container.removeEventListener("keydown", this.handleUiKeyboardActivate, true);
    this.input.dispose();
    this.followCamera.dispose();
    this.characterPreview.dispose();
    this.interfaceAudio.dispose();
    this.movementAudio.dispose();
    this.gameplayFeedback.dispose();
    this.waterAudio.dispose();
    this.underwaterEffect.dispose();
    this.retroTexturePass?.material.dispose();
    this.composer?.dispose();
    this.cameraDebugPanel?.remove();
    this.perfDebugPanel?.remove();
    this.titleScreen.remove();
    this.openingSequenceOverlay.remove();
    this.renderer.dispose();
  }

  private prewarmShaders() {
    if (!isWebGlRenderer(this.renderer)) {
      return;
    }
    try {
      this.renderer.compile(this.scene, this.followCamera.camera);
    } catch {
      // Compile is best-effort: a missing material or context loss shouldn't block start.
    }
  }

  private schedulePostProcessingInit() {
    if (!markPostProcessingScheduled(this.postProcessing, this.qualityLow, this.renderer)) {
      return;
    }

    const start = () => {
      void this.initializePostProcessing();
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(start, { timeout: 1500 });
    } else {
      globalThis.setTimeout(start, 700);
    }
  }

  private async initializePostProcessing() {
    if (this.disposed || this.composer || !isWebGlRenderer(this.renderer)) {
      return;
    }

    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }] = await Promise.all([
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
      import("three/examples/jsm/postprocessing/ShaderPass.js"),
    ]);
    if (this.disposed || this.composer || !isWebGlRenderer(this.renderer)) {
      return;
    }

    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(this.activePixelRatio);
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(this.scene, this.followCamera.camera));
    const bloomPass = new UnrealBloomPass(
      new Vector2(window.innerWidth, window.innerHeight),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD,
    );
    composer.addPass(bloomPass);
    const retroTexturePass = new ShaderPass(RETRO_RENDER_TEXTURE_SHADER);
    retroTexturePass.uniforms.uResolution.value.set(
      window.innerWidth * this.activePixelRatio,
      window.innerHeight * this.activePixelRatio,
    );
    composer.addPass(retroTexturePass);
    const underwaterPass = this.underwaterEffect.createShaderPass(ShaderPass);
    underwaterPass.uniforms.uResolution.value.set(
      window.innerWidth * this.activePixelRatio,
      window.innerHeight * this.activePixelRatio,
    );
    composer.addPass(underwaterPass);
    this.composer = composer;
    this.bloomPass = bloomPass;
    this.retroTexturePass = retroTexturePass;
    this.suppressPostProcessing(POST_PROCESSING_RESUME_DELAY_SECONDS);
    this.logRenderPathEvent("postprocessing-ready");
  }

  advanceTime(ms: number, renderFrame = true) {
    const dt = 1 / 60;
    const shouldRender = renderFrame && (!this.e2eMinimal || this.visualProbeEnabled);
    const steps = Math.max(1, Math.round(ms / (dt * 1000)));
    for (let i = 0; i < steps; i += 1) {
      this.trackFrameTiming(dt);
      this.elapsed += dt;
      this.tick(dt, this.elapsed, shouldRender);
      this.updateRenderQuality(dt);
    }
  }

  debugCompleteOpeningSequence() {
    if (this.titleScreenOpen) {
      this.startFromTitle();
    }
    this.completeOpeningSequence();
  }

  debugTeleportPlayerTo(x: number, z: number) {
    const player = this.state.frame.player;
    if (!teleportDebugPlayerTo(player, x, z)) {
      return;
    }

    this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    this.syncHud();
  }

  debugFaceRouteHeading(heading: number, cameraOptions?: DebugRouteCameraOptions) {
    if (!Number.isFinite(heading)) {
      return;
    }
    const player = this.state.frame.player;
    player.heading = heading;
    this.followCamera.debugSnapToPlayerHeading(player, heading, cameraOptions);
  }

  debugApplySaveState(payload: DebugSaveStatePayload) {
    const player = this.state.frame.player;
    const debugHeading = applyDebugPlayerSnapshot(player, payload.player);
    if (debugHeading !== null) {
      this.followCamera.debugSnapToPlayerHeading(player, debugHeading);
    }
    resetDebugPlayerMovement(player);

    if (this.perfDebugEnabled) {
      if (!this.perfDebugWorldPrewarmed) {
        this.world.flushDeferredWorldSlices();
        this.cachedWorldPerfStats = null;
        this.prewarmShaders();
        this.perfDebugWorldPrewarmed = true;
      }
    }

    applyDebugSaveSnapshot(this.state.frame.save, payload.save);
    this.state.markSaveDirty();

    this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    this.persistLocalSaveState();
    this.syncHud();
  }

  private restoreLocalSaveState() {
    if (!this.savePersistenceEnabled) {
      return;
    }

    if (restoreStoredSaveState(this.state.frame.save, this.localSaveRuntime)) {
      this.state.update(0, PAUSED_INPUT, 0);
    }
  }

  private persistLocalSaveState() {
    if (!this.savePersistenceEnabled) {
      return;
    }

    const saveRevision = this.state.getSaveRevision();
    if (saveRevision === this.lastSavePersistenceRevision) {
      return;
    }

    persistStoredSaveState(this.state.frame.save, this.localSaveRuntime);
    this.lastSavePersistenceRevision = saveRevision;
  }

  debugSetWaterDepthDebug(enabled: boolean) {
    this.waterDepthDebugEnabled = enabled;
    this.world.setWaterDepthDebugEnabled(enabled);
  }

  debugSetLayerVisibility(layer: string, visible: boolean) {
    this.world.debugSetLayerVisibility(layer, visible);
  }

  debugGetLastFrameProfile() {
    return this.lastPerfFrameProfile;
  }

  renderGameToText() {
    const openingSequence = {
      active: this.openingSequenceActive,
      progress: Number(this.getOpeningSequenceProgress().toFixed(3)),
    };

    if (this.e2eMinimal) {
      return serializeE2eGameTextState({
        frame: this.state.frame,
        viewMode: this.viewMode,
        titleScreenOpen: this.titleScreenOpen,
        openingSequence,
        pauseMenuOpen: this.pauseMenuOpen,
        characterScreenOpen: this.characterScreenOpen,
        coopStressSnapshot: this.latestCoopStressSnapshot,
        camera: this.followCamera.getDebugState(),
      });
    }

    return serializeGameTextState({
      frame: this.state.frame,
      viewMode: this.viewMode,
      titleScreenOpen: this.titleScreenOpen,
      openingSequence,
      pauseMenuOpen: this.pauseMenuOpen,
      characterScreenOpen: this.characterScreenOpen,
      characterData: this.state.getCharacterScreenData(),
      focusedCollectionId: this.focusedCollectionId,
      faunaStats: this.world.getFaunaStats(),
      savePersistenceEnabled: this.savePersistenceEnabled,
      coopStressSnapshot: this.latestCoopStressSnapshot,
      movementAudio: this.movementAudio.getState(),
      waterAudio: this.waterAudio.getState(),
      camera: this.followCamera.getDebugState(),
      performance: this.getPerformanceSnapshot(),
      waterDepthDebugEnabled: this.waterDepthDebugEnabled,
      underwaterIntensity: this.underwaterEffect.getIntensity(),
      qa: this.world.getQaStats(),
    });
  }

  private tick(dt: number, elapsed: number, renderFrame = true) {
    const profile = this.perfDebugEnabled
      ? {
          stateMs: 0,
          cameraMs: 0,
          underwaterMs: 0,
          worldMs: 0,
          hudMs: 0,
          renderMs: 0,
          debugMs: 0,
          totalMs: 0,
        }
      : null;
    const profileStart = profile ? performance.now() : 0;
    let profileMark = profileStart;
    const markProfile = (key: Exclude<keyof NonNullable<typeof profile>, "totalMs">) => {
      if (!profile) {
        return;
      }
      const now = performance.now();
      profile[key] = Number((now - profileMark).toFixed(2));
      profileMark = now;
    };

    const input = this.input.sample();
    let faunaRecruitPressed = false;
    let faunaRegroupPressed = false;
    let preZoneForFeedback: (typeof this.state.frame.currentZone) | null = null;
    let preSwimForFeedback: boolean | null = null;

    if (this.titleScreenOpen) {
      this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    } else if (this.openingSequenceActive) {
      const progress = this.updateOpeningSequence(input);
      this.followCamera.setOpeningSequenceProgress(this.openingSequenceActive ? progress : null);
      this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    } else if (this.pauseMenuOpen) {
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
      if (input.mapViewResetPressed) {
        this.followCamera.recenterMapView();
        this.mapFocusedRouteIndex = -1;
      } else if (input.mapFocusNextPressed) {
        this.focusNextRouteMapMarker();
      }
      this.followCamera.panMapViewFromInput(input.moveX, input.moveY, dt);
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
        faunaRecruitPressed = input.interactPressed && !this.state.frame.forageableTarget;
        if (input.interactHeld && input.interactHoldSeconds >= 0.45 && this.faunaRegroupReady) {
          faunaRegroupPressed = true;
          this.faunaRegroupReady = false;
        }
        if (!input.interactHeld) {
          this.faunaRegroupReady = true;
        }
        preZoneForFeedback = this.state.frame.currentZone;
        preSwimForFeedback = this.state.frame.player.swimming;
        this.state.update(dt, input, this.followCamera.getYaw());
      }
    }

    this.latestCoopStressSnapshot = this.updateCoopStress(elapsed, dt);

    if (preZoneForFeedback !== null && preSwimForFeedback !== null) {
      const frame = this.state.frame;
      if (preZoneForFeedback !== frame.currentZone) {
        this.gameplayFeedback.playZoneChange();
        this.followCamera.kickCinematic({ polar: 0.022, distance: 0.75, shoulder: 0.08 });
      }
      if (preSwimForFeedback !== frame.player.swimming) {
        this.gameplayFeedback.playSwimSurface(frame.player.swimming);
      }
      if (frame.player.justLanded) {
        this.gameplayFeedback.playLand(frame.player.landingImpact);
        this.followCamera.kickCinematic({
          polar: -0.055 * Math.min(1.2, frame.player.landingImpact),
          distance: 0.75 * Math.min(1.2, frame.player.landingImpact),
          shoulder: 0.08 * Math.min(1.2, frame.player.landingImpact),
        });
      }
      if (frame.lastCatalogedLandmarkId || frame.lastGatheredForageableId) {
        this.gameplayFeedback.playInteract();
        this.followCamera.kickCinematic({ polar: 0.018, distance: 0.48, shoulder: -0.05 });
      }
      if (frame.lastCatalogedLandmarkId === "peak-shrine" && !this.summitCompletionSeen) {
        this.summitCompletionSeen = true;
        this.followCamera.kickCinematic({ polar: -0.045, distance: 3.2, shoulder: 0.22 });
        this.hud.showFlavorPing("Moss Crown reached. Summit Circuit unlocked in the field guide.");
      }
    }

    this.updateIdleCameraOrbit(input, dt);
    this.updateMovementAudio(dt);
    this.updateWaterAudio(dt);
    markProfile("stateMs");

    if (this.state.frame.lastCatalogedLandmarkId) {
      this.focusedCollectionId = this.state.frame.lastCatalogedLandmarkId;
    } else if (!this.focusedCollectionId && this.state.frame.interactionTarget) {
      this.focusedCollectionId = this.state.frame.interactionTarget.landmarkId;
    }

    this.followCamera.update(this.state.frame.player, dt);
    markProfile("cameraMs");
    this.updateUnderwaterEffect(dt, elapsed);
    markProfile("underwaterMs");
    this.world.update(
      this.state.frame,
      elapsed,
      dt,
      this.viewMode === "map_lookdown",
      faunaRecruitPressed,
      faunaRegroupPressed,
      this.followCamera.camera,
      this.titleScreenOpen || this.openingSequenceActive,
    );
    markProfile("worldMs");
    const faunaStats = this.world.getFaunaStats();
    if (
      faunaStats.firstEncounterActive &&
      !this.firstKaruEncounterSeen &&
      !this.titleScreenOpen &&
      !this.openingSequenceActive &&
      !this.pauseMenuOpen &&
      !this.characterScreenOpen &&
      this.viewMode === "third_person"
    ) {
      this.firstKaruEncounterSeen = true;
      this.followCamera.kickCinematic({ polar: -0.026, distance: 2.4, shoulder: 0.34 });
      this.hud.showFlavorPing("A Karu pauses in the grass.");
      this.syncHud();
    }
    this.characterPreview.update(dt, this.characterScreenOpen);
    this.persistLocalSaveState();
    this.syncHudForFrame(dt);
    markProfile("hudMs");
    if (renderFrame) {
      this.renderScene();
      markProfile("renderMs");
      this.updateDebugPanels();
      markProfile("debugMs");
    }
    if (profile) {
      profile.totalMs = Number((performance.now() - profileStart).toFixed(2));
      this.lastPerfFrameProfile = profile;
    }
  }

  private updateCoopStress(elapsed: number, dt: number) {
    if (!this.coopStress) {
      return null;
    }

    if (this.titleScreenOpen || this.openingSequenceActive) {
      if (this.latestCoopStressSnapshot !== null) {
        this.world.setRemoteMossus([]);
      }
      return null;
    }

    const snapshot = this.coopStress.update(this.state.frame, elapsed, dt);
    this.world.setRemoteMossus(snapshot.remotePlayers);
    return snapshot;
  }

  private updateMovementAudio(dt: number) {
    const player = this.state.frame.player;
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const shouldPlay =
      !this.titleScreenOpen &&
      !this.openingSequenceActive &&
      !this.pauseMenuOpen &&
      !this.characterScreenOpen &&
      this.viewMode === "third_person" &&
      player.grounded &&
      !player.swimming &&
      !player.fallingToVoid &&
      speed > 1.25;

    this.movementAudio.update({
      dt,
      shouldPlay,
      speed,
      rolling: player.rolling,
    });
  }

  private updateWaterAudio(dt: number) {
    const player = this.state.frame.player;
    this.waterAudio.update({
      dt,
      ambience: sampleWaterAmbience(player.position.x, player.position.z),
      muted: this.titleScreenOpen,
    });
  }

  private updateUnderwaterEffect(dt: number, elapsed: number) {
    const targetIntensity = getUnderwaterEffectTargetIntensity(
      this.followCamera.camera,
      this.state.frame.player,
    );
    this.underwaterEffect.update({ dt, elapsed, targetIntensity });
  }

  private renderScene() {
    const postProcessingEnabled = this.shouldUsePostProcessing();
    const renderPath = getRenderPath(postProcessingEnabled, this.composer);
    if (updateRenderPath(this.postProcessing, renderPath)) {
      this.logRenderPathEvent(`render-path-${renderPath}`);
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = postProcessingEnabled;
    }
    if (this.retroTexturePass) {
      this.retroTexturePass.enabled = this.shouldUseRetroTexture();
    }
    if (postProcessingEnabled && this.composer) {
      updateRetroTexturePass(this.retroTexturePass, this.elapsed, this.activePixelRatio);
      this.composer.render();
      return;
    }

    this.renderer.render(this.scene, this.followCamera.camera);
  }

  private shouldUsePostProcessing() {
    const overlayBlocksPostProcessing =
      this.titleScreenOpen ||
      this.openingSequenceActive ||
      this.pauseMenuOpen ||
      this.characterScreenOpen ||
      this.viewMode === "map_lookdown";
    return shouldUsePostProcessingRuntime({
      composer: this.composer,
      overlayBlocksPostProcessing,
      elapsed: this.elapsed,
      runtime: this.postProcessing,
      activePixelRatio: this.activePixelRatio,
      minPixelRatio: BLOOM_MIN_PIXEL_RATIO,
    });
  }

  private shouldUseBloom() {
    return this.shouldUsePostProcessing();
  }

  private shouldUseRetroTexture() {
    return shouldUseRetroTextureRuntime(this.retroRenderEnabled, this.shouldUsePostProcessing());
  }

  private syncHudForFrame(dt: number) {
    const frame = this.state.frame;
    const faunaStats = this.world.getFaunaStats();
    const overlayActive =
      this.titleScreenOpen ||
      this.openingSequenceActive ||
      this.pauseMenuOpen ||
      this.characterScreenOpen ||
      this.viewMode === "map_lookdown";
    const contextualFeedbackActive =
      frame.player.staminaVisible ||
      frame.player.rolling ||
      frame.player.rollHoldSeconds > 0 ||
      frame.player.rollModeReady ||
      frame.player.floating ||
      frame.player.waterMode !== "onLand" ||
      frame.forageableTarget !== null ||
      frame.interactionTarget !== null ||
      frame.lastCatalogedLandmarkId !== null ||
      frame.lastGatheredForageableId !== null ||
      faunaStats.recruitedThisFrame > 0 ||
      faunaStats.rollingCount > 0 ||
      faunaStats.regroupActive ||
      faunaStats.callHeardActive;

    this.hudUpdateAccumulator += dt;
    if (!overlayActive && !contextualFeedbackActive && this.hudUpdateAccumulator < NORMAL_HUD_UPDATE_INTERVAL) {
      return;
    }

    this.hudUpdateAccumulator = 0;
    this.syncHud();
  }

  private syncHud() {
    this.hud.element.classList.toggle("hud--title-hidden", this.titleScreenOpen || this.openingSequenceActive);
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
    const nextPixelRatio = sampleAdaptivePixelRatio(
      this.renderQuality,
      rawDt,
      this.activePixelRatio,
      this.minPixelRatio,
      this.maxPixelRatio,
    );
    if (nextPixelRatio === null) {
      return;
    }

    this.activePixelRatio = nextPixelRatio;
    this.renderer.setPixelRatio(this.activePixelRatio);
    this.composer?.setPixelRatio(this.activePixelRatio);
    this.underwaterEffect.resize(window.innerWidth, window.innerHeight, this.activePixelRatio);
  }

  private trackFrameTiming(rawDt: number) {
    this.latestFrameMs = Math.max(0.1, rawDt * 1000);
    this.smoothedFrameMs += (this.latestFrameMs - this.smoothedFrameMs) * 0.1;
    this.perfFrameSampleIndex = recordPerfFrameSample(
      this.perfFrameSamples,
      this.perfFrameSampleIndex,
      this.latestFrameMs,
    );
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
    const riverEdge = sampleRiverEdgeState(player.position.x, player.position.z);
    this.cameraDebugPanel.textContent = [
      `camera ${camera.style} / ${camera.profile}`,
      `distance ${camera.distance}  polar ${camera.polar} (${camera.minPolar}-${camera.maxPolar})  up ${camera.upLookLimitDegrees}deg`,
      `fov ${camera.fov}  shoulder ${camera.shoulder}  lookAhead ${camera.lookAhead}`,
      `focusY ${camera.focusHeight}  recenter ${camera.recenterCooldown}s  yaw ${camera.yawResponsiveness}  locked ${camera.pointerLocked}`,
      `idle orbit ${camera.idleOrbitActive ? "on" : "off"}  blend ${camera.idleOrbitBlend}  idle ${this.idleControlSeconds.toFixed(1)}s`,
      `player x ${player.position.x.toFixed(1)} y ${player.position.y.toFixed(1)} z ${player.position.z.toFixed(1)}`,
      `river ${riverEdge.zone}  surface ${riverEdge.surfaceMask.toFixed(2)}  wet ${riverEdge.wetness.toFixed(2)}  damp ${riverEdge.dampBankMask.toFixed(2)}  nook ${riverEdge.nookMask.toFixed(2)}  depth ${riverEdge.waterDepth.toFixed(2)}`,
    ].join("\n");
  }

  private getPerformanceSnapshot(): MossuPerformanceSnapshot {
    const rendererInfo = this.renderer.info;
    const world = this.getCachedWorldPerfStats();
    return createPerformanceSnapshot({
      rendererInfo,
      world,
      smoothedFrameMs: this.smoothedFrameMs,
      latestFrameMs: this.latestFrameMs,
      rollingP95FrameMs: getPerfFramePercentile(this.perfFrameSamples, this.latestFrameMs, 0.95),
      rollingSampleCount: this.perfFrameSamples.length,
      qualitySampleFrameMs: this.renderQuality.qualitySampleFrameMs,
      activePixelRatio: this.activePixelRatio,
      maxPixelRatio: this.maxPixelRatio,
      minPixelRatio: this.minPixelRatio,
      renderResolution: getRenderResolutionSnapshot(
        this.renderResolutionPolicy,
        window.innerWidth,
        window.innerHeight,
        this.activePixelRatio,
      ),
      bloomEnabled: this.shouldUseBloom(),
      retroTextureEnabled: this.retroTexturePass !== null && this.shouldUseRetroTexture(),
      renderPath: this.postProcessing.activeRenderPath,
      postProcessingReady: this.composer !== null,
      postProcessingSuppressedMs: getPostProcessingSuppressedMs(this.postProcessing, this.elapsed),
      waterDepthDebug: this.waterDepthDebugEnabled,
      underwaterIntensity: this.underwaterEffect.getIntensity(),
      webGlContextLostCount: this.webGlContextLostCount,
      webGlContextRestoredCount: this.webGlContextRestoredCount,
      coopStress: {
        enabled: this.latestCoopStressSnapshot !== null,
        remoteCount: this.latestCoopStressSnapshot?.remoteCount ?? 0,
        sharedEvents: this.latestCoopStressSnapshot?.shared.recentEvents.length ?? 0,
      },
      qualityLow: this.qualityLow,
      requestedBackend: this.requestedRendererBackend,
      activeBackend: this.activeRendererBackend,
      webGpuAvailable: this.webGpuAvailable,
      rendererFallbackReason: this.rendererFallbackReason,
      mapZoom: this.followCamera.getMapZoomFactor(),
    });
  }

  private getCachedWorldPerfStats() {
    const now = performance.now();
    if (
      this.cachedWorldPerfStats === null ||
      now - this.cachedWorldPerfStatsAt >= WORLD_PERF_STATS_UPDATE_MS
    ) {
      this.cachedWorldPerfStats = this.world.getPerfStats();
      this.cachedWorldPerfStatsAt = now;
    }
    return this.cachedWorldPerfStats;
  }

  private updatePerfDebug() {
    if (!this.perfDebugPanel) {
      return;
    }

    this.perfDebugPanel.classList.toggle("perf-debug--hidden", !this.perfDebugVisible);
    if (!this.perfDebugVisible) {
      return;
    }

    const now = performance.now();
    if (now - this.perfPanelLastUpdatedAt < PERF_HUD_UPDATE_MS) {
      return;
    }
    this.perfPanelLastUpdatedAt = now;

    const perf = this.getPerformanceSnapshot();
    if (this.perfHudCompact) {
      const captureState =
        this.perfCaptureLatest && now < this.perfCaptureFlashUntil
          ? `capture ${new Date(this.perfCaptureLatest.capturedAt).toLocaleTimeString()}`
          : "capture idle";
      this.perfDebugPanel.textContent = buildCompactPerfDebugText(perf, captureState);
      return;
    }

    this.perfDebugPanel.textContent = buildFullPerfDebugText(perf);
  }

  private updateIdleCameraOrbit(input: InputSnapshot, dt: number) {
    const canIdleOrbit =
      !this.titleScreenOpen &&
      !this.openingSequenceActive &&
      !this.pauseMenuOpen &&
      !this.characterScreenOpen &&
      this.viewMode === "third_person";
    const controlActive = hasControlActivity(input) || this.followCamera.consumeControlActivity();

    if (!canIdleOrbit || controlActive || dt <= 0) {
      this.idleControlSeconds = 0;
      this.followCamera.setIdleOrbitActive(false);
      return;
    }

    this.idleControlSeconds = Math.min(
      IDLE_CAMERA_ORBIT_DELAY_SECONDS + 1,
      this.idleControlSeconds + dt,
    );
    this.followCamera.setIdleOrbitActive(this.idleControlSeconds >= IDLE_CAMERA_ORBIT_DELAY_SECONDS);
  }

  private capturePerfSnapshot() {
    if (!this.perfDebugPanel) {
      return;
    }

    const route = `${window.location.pathname}${window.location.search}`;
    const capture = createPerfCapture(route, this.getPerformanceSnapshot());
    this.perfCaptureLatest = capture;
    this.perfCaptureFlashUntil = performance.now() + PERF_CAPTURE_FLASH_MS;
    this.perfPanelLastUpdatedAt = 0;
    (window as Window & { __MOSSU_PERF_CAPTURE__?: typeof capture }).__MOSSU_PERF_CAPTURE__ = capture;
    console.info("Mossu perf capture", capture);
    navigator.clipboard?.writeText(JSON.stringify(capture, null, 2)).catch(() => undefined);
  }

  private handleResize = () => {
    this.updateRenderResolutionPolicy();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    this.underwaterEffect.resize(window.innerWidth, window.innerHeight, this.activePixelRatio);
    this.followCamera.resize(window.innerWidth, window.innerHeight);
  };

  private updateRenderResolutionPolicy() {
    this.renderResolutionPolicy = createRenderResolutionPolicy({
      qualityLow: this.qualityLow,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    });
    this.maxPixelRatio = this.renderResolutionPolicy.maxPixelRatio;
    this.minPixelRatio = this.renderResolutionPolicy.minPixelRatio;
    const nextPixelRatio = Math.min(
      this.maxPixelRatio,
      Math.max(this.minPixelRatio, this.activePixelRatio),
    );
    if (Math.abs(nextPixelRatio - this.activePixelRatio) < 0.01) {
      return;
    }

    this.activePixelRatio = nextPixelRatio;
    this.renderer.setPixelRatio(this.activePixelRatio);
    this.composer?.setPixelRatio(this.activePixelRatio);
  }

  private handlePerfHotkeys = (event: KeyboardEvent) => {
    if (event.repeat || !event.shiftKey) {
      return;
    }

    if (event.code === "KeyY") {
      event.preventDefault();
      this.debugSetWaterDepthDebug(!this.waterDepthDebugEnabled);
      this.perfPanelLastUpdatedAt = 0;
      return;
    }

    if (!this.perfDebugPanel) {
      return;
    }

    if (event.code === "KeyP") {
      event.preventDefault();
      this.perfDebugVisible = !this.perfDebugVisible;
      this.perfPanelLastUpdatedAt = 0;
      return;
    }

    if (event.code === "KeyC") {
      event.preventDefault();
      this.capturePerfSnapshot();
    }
  };

  private handleMapWheel = (event: WheelEvent) => {
    if (this.viewMode !== "map_lookdown" || this.titleScreenOpen) {
      return;
    }
    event.preventDefault();
    this.followCamera.adjustMapZoomFromWheel(event.deltaY);
  };

  private handleMapPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || this.viewMode !== "map_lookdown" || this.titleScreenOpen) {
      return;
    }
    this.mapDrag.begin(event, this.renderer.domElement);
  };

  private handleMapPointerMove = (event: PointerEvent) => {
    if (this.viewMode !== "map_lookdown") {
      return;
    }
    this.mapDrag.move(event, (deltaX, deltaY) => {
      this.followCamera.panMapViewFromDrag(deltaX, deltaY);
    });
  };

  private handleMapPointerUp = (event: PointerEvent) => {
    this.mapDrag.end(event, this.renderer.domElement);
  };

  private handleUiPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !isButtonLikeUiTarget(event.target)) {
      return;
    }
    this.interfaceAudio.playClick();
  };

  private handleUiKeyboardActivate = (event: KeyboardEvent) => {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ") || !isButtonLikeUiTarget(event.target)) {
      return;
    }
    this.interfaceAudio.playClick();
  };

  private handleUiCommandClick = (event: MouseEvent) => {
    const commandTarget =
      event.target instanceof Element ? event.target.closest<HTMLElement>("[data-ui-command]") : null;
    if (!commandTarget) {
      return;
    }

    switch (commandTarget.dataset.uiCommand) {
      case "resume":
        this.closePauseMenu();
        this.focusGameplaySurface();
        break;
      case "handbook":
        this.openCharacterScreen();
        break;
      case "map":
        this.openMap();
        break;
    }
  };

  private handlePointerLockChange = () => {
    if (this.titleScreenOpen) {
      return;
    }

    if (document.pointerLockElement) {
      return;
    }

    if (this.suppressPauseOnPointerUnlock || this.elapsed <= this.suppressPointerUnlockPauseUntil) {
      this.suppressPauseOnPointerUnlock = false;
      return;
    }

    if (this.qaDebugEnabled) {
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
    this.movementAudio.stop();
    this.releaseGameplayPointerLock();
    this.syncHud();
    this.focusHudElement(".character-screen__tab--active");
  }

  private closeCharacterScreen() {
    this.characterScreenOpen = false;
    this.syncHud();
    this.focusGameplaySurface();
  }

  private openPauseMenu() {
    this.characterScreenOpen = false;
    this.pauseMenuOpen = true;
    this.closeMap();
    this.movementAudio.stop();
    this.releaseGameplayPointerLock();
    this.syncHud();
    this.focusHudElement("[data-ui-command='resume']");
  }

  private closePauseMenu() {
    this.pauseMenuOpen = false;
    this.syncHud();
    this.suppressPostProcessing(POST_PROCESSING_RESUME_DELAY_SECONDS);
    this.focusGameplaySurface();
  }

  private openMap() {
    this.pauseMenuOpen = false;
    this.characterScreenOpen = false;
    this.setViewMode("map_lookdown");
    this.movementAudio.stop();
    this.focusGameplaySurface();
  }

  private closeMap() {
    this.mapDrag.cancel();
    if (this.viewMode !== "third_person") {
      this.setViewMode("third_person");
      this.followCamera.kickCinematic({ polar: 0.012, distance: 1.1, shoulder: -0.08 });
      this.suppressPostProcessing(POST_PROCESSING_RESUME_DELAY_SECONDS);
      this.focusGameplaySurface();
    }
  }

  private focusNextRouteMapMarker() {
    if (routeLandmarks.length === 0) {
      return;
    }
    this.mapFocusedRouteIndex = (this.mapFocusedRouteIndex + 1) % routeLandmarks.length;
    const landmark = routeLandmarks[this.mapFocusedRouteIndex];
    this.followCamera.focusMapOnWorldPoint(landmark.position.x, landmark.position.z);
  }

  private focusHudElement(selector: string) {
    window.requestAnimationFrame(() => {
      this.hud.element.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  private focusGameplaySurface() {
    window.requestAnimationFrame(() => {
      if (!this.titleScreenOpen && !this.pauseMenuOpen && !this.characterScreenOpen) {
        this.renderer.domElement.focus();
      }
    });
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

  private startFromTitle = () => {
    if (!this.titleScreenOpen) {
      return;
    }

    this.titleScreenOpen = false;
    this.openingSequenceActive = true;
    this.openingSequenceStartedAt = this.elapsed;
    this.pauseMenuOpen = false;
    this.characterScreenOpen = false;
    this.movementAudio.unlock();
    this.gameplayFeedback.unlock();
    this.waterAudio.unlock();
    this.titleScreen.classList.add("title-screen--hidden");
    this.titleScreen.setAttribute("aria-hidden", "true");
    this.openingSequenceOverlay.classList.add("opening-sequence--visible");
    this.openingSequenceOverlay.setAttribute("aria-hidden", "false");
    this.followCamera.setOpeningSequenceProgress(0);
    this.suppressPostProcessing(OPENING_SEQUENCE_SECONDS + POST_PROCESSING_RESUME_DELAY_SECONDS);
    this.renderer.domElement.tabIndex = -1;
    this.syncHud();
    this.focusGameplaySurface();
  };

  private getOpeningSequenceProgress() {
    if (!this.openingSequenceActive) {
      return 1;
    }
    return Math.min(1, Math.max(0, (this.elapsed - this.openingSequenceStartedAt) / OPENING_SEQUENCE_SECONDS));
  }

  private updateOpeningSequence(input: InputSnapshot) {
    const progress = this.getOpeningSequenceProgress();
    const sequenceAge = this.elapsed - this.openingSequenceStartedAt;
    const skipRequested =
      sequenceAge >= OPENING_SEQUENCE_SKIP_AFTER_SECONDS &&
      (
        Math.abs(input.moveX) > 0.01 ||
        Math.abs(input.moveY) > 0.01 ||
        input.jumpPressed ||
        input.abilityPressed ||
        input.abilityHeld ||
        input.rollHeld ||
        input.interactPressed ||
        input.inventoryTogglePressed ||
        input.mapTogglePressed ||
        input.escapePressed
      );

    this.openingSequenceOverlay.style.setProperty("--opening-progress", progress.toFixed(3));
    if (progress >= 1 || skipRequested) {
      this.completeOpeningSequence();
      return 1;
    }

    return progress;
  }

  private completeOpeningSequence() {
    if (!this.openingSequenceActive) {
      return;
    }
    this.openingSequenceActive = false;
    this.followCamera.setOpeningSequenceProgress(null);
    this.openingSequenceOverlay.classList.remove("opening-sequence--visible");
    this.openingSequenceOverlay.setAttribute("aria-hidden", "true");
    this.suppressPostProcessing(POST_PROCESSING_RESUME_DELAY_SECONDS);
    this.syncHud();
    this.focusGameplaySurface();
  }

  private suppressPostProcessing(seconds: number) {
    suppressPostProcessingRuntime(this.postProcessing, this.elapsed, seconds);
  }

  private logRenderPathEvent(event: string) {
    if (!this.perfDebugEnabled && !this.qaDebugEnabled) {
      return;
    }
    console.info("Mossu render path", {
      event,
      elapsed: Number(this.elapsed.toFixed(3)),
      path: this.postProcessing.activeRenderPath,
      title: this.titleScreenOpen,
      opening: this.openingSequenceActive,
      pause: this.pauseMenuOpen,
      character: this.characterScreenOpen,
      viewMode: this.viewMode,
      postReady: this.composer !== null,
      suppressedMs: getPostProcessingSuppressedMs(this.postProcessing, this.elapsed),
      pixelRatio: Number(this.activePixelRatio.toFixed(2)),
      contextLost: this.webGlContextLostCount,
    });
  }

  private handleWebGlContextLost = (event: Event) => {
    this.webGlContextLostCount += 1;
    event.preventDefault();
    this.logRenderPathEvent("webgl-context-lost");
  };

  private handleWebGlContextRestored = () => {
    this.webGlContextRestoredCount += 1;
    this.suppressPostProcessing(POST_PROCESSING_RESUME_DELAY_SECONDS);
    this.logRenderPathEvent("webgl-context-restored");
  };

  private handleTitleKeyDown = (event: KeyboardEvent) => {
    if (!this.titleScreenOpen) {
      return;
    }

    if (event.code === "Enter" || event.code === "Space") {
      event.preventDefault();
      if (!isButtonLikeUiTarget(event.target)) {
        this.interfaceAudio.playClick();
      }
      this.startFromTitle();
    }
  };
}
