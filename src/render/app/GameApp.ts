import {
  ACESFilmicToneMapping,
  Clock,
  MathUtils,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from "three";
import type { WebGPURenderer as ThreeWebGpuRenderer } from "three/webgpu";
import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GameState } from "../../simulation/gameState";
import { InputController, InputSnapshot } from "../../simulation/input";
import { sampleRiverEdgeState, sampleTerrainHeight, sampleWaterAmbience, sampleWaterState, sampleWindStrength } from "../../simulation/world";
import type { AbilityId } from "../../simulation/world";
import { ViewMode } from "../../simulation/viewMode";
import { AmbientWaterAudio } from "./AmbientWaterAudio";
import { CharacterPreview } from "./CharacterPreview";
import { DebugRouteCameraOptions, FollowCamera } from "./FollowCamera";
import { HudShell } from "./HudShell";
import { InterfaceAudio, isButtonLikeUiTarget } from "./InterfaceAudio";
import { MovementAudio } from "./MovementAudio";
import { GameplayFeedbackAudio } from "./GameplayFeedbackAudio";
import { routeLandmarks } from "./worldMap";
import type { WorldRenderer as WorldRendererType } from "../world/WorldRenderer";
import { UnderwaterEffect } from "./UnderwaterEffect";

const QUALITY_SAMPLE_SECONDS = 0.55;
const QUALITY_MIN_SAMPLE_FRAMES = 12;
const PIXEL_RATIO_DOWNSHIFT_FRAME_SECONDS = 1 / 60;
const PIXEL_RATIO_UPSHIFT_FRAME_SECONDS = 1 / 76;
const PIXEL_RATIO_STEP_DOWN = 0.18;
const PIXEL_RATIO_STEP_UP = 0.02;
const NORMAL_HUD_UPDATE_INTERVAL = 1 / 12;
const BLOOM_STRENGTH = 0.14;
const BLOOM_RADIUS = 0.48;
const BLOOM_THRESHOLD = 0.82;
const BLOOM_MIN_PIXEL_RATIO = 0.74;
const RETRO_TEXTURE_GRAIN_STRENGTH = 0.008;
const RETRO_TEXTURE_DITHER_STRENGTH = 0.004;
const RETRO_TEXTURE_SCANLINE_STRENGTH = 0;
const RETRO_TEXTURE_VIGNETTE_STRENGTH = 0.025;
const RETRO_TEXTURE_QUANTIZE_STRENGTH = 0.035;
const OPENING_SEQUENCE_SECONDS = 5.4;
const OPENING_SEQUENCE_SKIP_AFTER_SECONDS = 1.05;
const PERF_HUD_SAMPLE_LIMIT = 240;
const PERF_HUD_UPDATE_MS = 250;
const PERF_CAPTURE_FLASH_MS = 2200;

type RequestedRendererBackend = "webgl" | "webgpu" | "auto";
type ActiveRendererBackend = "webgl" | "webgpu" | "webgpu-webgl2";
type GameRenderer = WebGLRenderer | ThreeWebGpuRenderer;

type DebugSaveStatePayload = {
  player?: {
    x?: number;
    y?: number;
    z?: number;
    heading?: number;
  };
  save?: {
    unlockedAbilities?: string[];
    catalogedLandmarkIds?: string[];
    gatheredForageableIds?: string[];
  };
};

type RendererBundle = {
  renderer: GameRenderer;
  requestedBackend: RequestedRendererBackend;
  activeBackend: ActiveRendererBackend;
  webGpuAvailable: boolean;
  fallbackReason: string | null;
};

const PAUSED_INPUT: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  jumpHeld: false,
  jumpPressed: false,
  abilityHeld: false,
  abilityPressed: false,
  interactHeld: false,
  interactHoldSeconds: 0,
  rollHeld: false,
  interactPressed: false,
  inventoryTogglePressed: false,
  mapTogglePressed: false,
  mapViewResetPressed: false,
  mapFocusNextPressed: false,
  escapePressed: false,
};

function isLowQuality(params: URLSearchParams): boolean {
  const q = params.get("quality")?.toLowerCase();
  return q === "low" || params.has("lowQuality");
}

function getRequestedRendererBackend(params: URLSearchParams): RequestedRendererBackend {
  const rendererParam = params.get("renderer")?.toLowerCase();
  if (rendererParam === "webgpu" || params.has("webgpu")) {
    return "webgpu";
  }
  if (rendererParam === "auto") {
    return "auto";
  }
  return "webgl";
}

function hasNavigatorWebGpu() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function createWebGlRendererBundle(
  requestedBackend: RequestedRendererBackend,
  webGpuAvailable: boolean,
  fallbackReason: string | null = null,
): RendererBundle {
  return {
    renderer: new WebGLRenderer({ antialias: true, powerPreference: "high-performance" }),
    requestedBackend,
    activeBackend: "webgl",
    webGpuAvailable,
    fallbackReason,
  };
}

function getWebGpuBackendName(renderer: ThreeWebGpuRenderer): ActiveRendererBackend {
  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  return backend.isWebGPUBackend ? "webgpu" : "webgpu-webgl2";
}

async function createRendererBundle(params: URLSearchParams): Promise<RendererBundle> {
  const requestedBackend = getRequestedRendererBackend(params);
  const webGpuAvailable = hasNavigatorWebGpu();
  const shouldTryWebGpu =
    requestedBackend === "webgpu" || (requestedBackend === "auto" && webGpuAvailable);

  if (!shouldTryWebGpu) {
    return createWebGlRendererBundle(requestedBackend, webGpuAvailable);
  }

  try {
    const { WebGPURenderer } = await import("three/webgpu");
    const renderer = new WebGPURenderer({ alpha: false, antialias: true });
    await renderer.init();
    return {
      renderer,
      requestedBackend,
      activeBackend: getWebGpuBackendName(renderer),
      webGpuAvailable,
      fallbackReason: null,
    };
  } catch (error) {
    const fallbackReason =
      error instanceof Error ? error.message : "WebGPU renderer could not be initialized.";
    return createWebGlRendererBundle(requestedBackend, webGpuAvailable, fallbackReason);
  }
}

function isWebGlRenderer(renderer: GameRenderer): renderer is WebGLRenderer {
  return renderer instanceof WebGLRenderer;
}

function formatPerfNumber(value: number) {
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(2))}M`;
  }
  if (value >= 10_000) {
    return `${Number((value / 1_000).toFixed(1))}k`;
  }
  return `${value}`;
}

const RETRO_RENDER_TEXTURE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uGrainStrength: { value: RETRO_TEXTURE_GRAIN_STRENGTH },
    uDitherStrength: { value: RETRO_TEXTURE_DITHER_STRENGTH },
    uScanlineStrength: { value: RETRO_TEXTURE_SCANLINE_STRENGTH },
    uVignetteStrength: { value: RETRO_TEXTURE_VIGNETTE_STRENGTH },
    uQuantizeStrength: { value: RETRO_TEXTURE_QUANTIZE_STRENGTH },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGrainStrength;
    uniform float uDitherStrength;
    uniform float uScanlineStrength;
    uniform float uVignetteStrength;
    uniform float uQuantizeStrength;
    varying vec2 vUv;

    float retroHash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 pixel = floor(vUv * uResolution);
      float luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
      float grain = retroHash(pixel + floor(uTime * 24.0)) - 0.5;
      float dither = retroHash(mod(pixel, vec2(4.0)) * 11.0 + vec2(3.7, 9.2)) - 0.5;
      float scanline = step(1.0, mod(pixel.y, 2.0));
      vec3 color = texel.rgb;
      color += grain * uGrainStrength * (0.72 + luma * 0.28);
      color += dither * uDitherStrength;
      color *= 1.0 - scanline * uScanlineStrength;

      vec3 quantized = floor(color * 128.0 + dither * 0.38) / 128.0;
      color = mix(color, quantized, uQuantizeStrength);

      vec2 centered = vUv * 2.0 - 1.0;
      float vignette = smoothstep(1.35, 0.3, dot(centered, centered));
      color *= mix(1.0 - uVignetteStrength, 1.0, vignette);

      float warmLift = smoothstep(0.15, 0.85, luma);
      color = mix(color, color * vec3(1.03, 1.016, 0.97), 0.07 * warmLift);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }
  `,
};

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
  private readonly maxPixelRatio: number;
  private readonly minPixelRatio: number;
  private activePixelRatio: number;
  private frameTimeAccumulator = 0;
  private frameSampleAccumulator = 0;
  private hudUpdateAccumulator = 0;
  private latestFrameMs = 1000 / 60;
  private smoothedFrameMs = 1000 / 60;
  private qualitySampleFrameMs = 1000 / 60;
  private readonly cameraDebugEnabled: boolean;
  private readonly perfDebugEnabled: boolean;
  private readonly perfHudCompact: boolean;
  private readonly qaDebugEnabled: boolean;
  /** `?e2e=1` — small render_game_to_text for Playwright (avoids heavy sync snapshot on main thread). */
  private readonly e2eMinimal: boolean;
  private cameraDebugPanel: HTMLDivElement | null = null;
  private perfDebugPanel: HTMLDivElement | null = null;
  private perfDebugVisible = true;
  private perfPanelLastUpdatedAt = 0;
  private perfFrameSamples: number[] = [];
  private perfFrameSampleIndex = 0;
  private perfCaptureLatest: { capturedAt: string; route: string; performance: ReturnType<GameApp["getPerformanceSnapshot"]> } | null = null;
  private perfCaptureFlashUntil = 0;
  private waterDepthDebugEnabled = false;
  private faunaRegroupReady = true;
  private mapFocusedRouteIndex = -1;
  private mapDragPointerId: number | null = null;
  private mapDragX = 0;
  private mapDragY = 0;
  private postProcessingInitStarted = false;
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
    this.perfDebugEnabled = params.has("perfDebug") || params.has("perfHud");
    this.perfHudCompact = params.has("perfHud");
    this.qaDebugEnabled = params.has("qaDebug");
    this.e2eMinimal = params.has("e2e");
    this.waterDepthDebugEnabled = params.has("waterDebugDepth") || params.get("waterDebug") === "depth";
    this.qualityLow = isLowQuality(params);
    const pixelCap = this.qualityLow ? 0.85 : 1.1;
    this.maxPixelRatio = Math.min(window.devicePixelRatio, pixelCap);
    this.minPixelRatio = Math.min(this.maxPixelRatio, this.qualityLow ? 0.5 : 0.85);
    this.activePixelRatio = Math.min(this.maxPixelRatio, 1);
    this.renderer = rendererBundle.renderer;
    this.requestedRendererBackend = rendererBundle.requestedBackend;
    this.activeRendererBackend = rendererBundle.activeBackend;
    this.webGpuAvailable = rendererBundle.webGpuAvailable;
    this.rendererFallbackReason = rendererBundle.fallbackReason;
    this.renderer.setPixelRatio(this.activePixelRatio);
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

    this.titleScreen = this.createTitleScreen();
    this.container.appendChild(this.titleScreen);
    this.openingSequenceOverlay = this.createOpeningSequenceOverlay();
    this.container.appendChild(this.openingSequenceOverlay);

    if (this.cameraDebugEnabled) {
      this.cameraDebugPanel = document.createElement("div");
      this.cameraDebugPanel.className = "camera-debug";
      this.container.appendChild(this.cameraDebugPanel);
    }

    if (this.perfDebugEnabled) {
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

  private schedulePostProcessingInit() {
    if (
      this.postProcessingInitStarted ||
      this.qualityLow ||
      !isWebGlRenderer(this.renderer)
    ) {
      return;
    }

    this.postProcessingInitStarted = true;
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
  }

  advanceTime(ms: number) {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round(ms / (dt * 1000)));
    for (let i = 0; i < steps; i += 1) {
      this.trackFrameTiming(dt);
      this.elapsed += dt;
      this.tick(dt, this.elapsed, !this.e2eMinimal);
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
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return;
    }

    const player = this.state.frame.player;
    player.position.set(x, sampleTerrainHeight(x, z) + 2.2, z);
    player.velocity.set(0, 0, 0);
    player.grounded = true;
    player.swimming = false;
    player.waterMode = "onLand";
    player.fallingToVoid = false;
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
    const x = payload.player?.x;
    const z = payload.player?.z;
    if (typeof x === "number" && Number.isFinite(x) && typeof z === "number" && Number.isFinite(z)) {
      const y =
        typeof payload.player?.y === "number" && Number.isFinite(payload.player.y)
          ? payload.player.y
          : sampleTerrainHeight(x, z) + 2.2;
      player.position.set(x, y, z);
    }
    if (typeof payload.player?.heading === "number" && Number.isFinite(payload.player.heading)) {
      player.heading = payload.player.heading;
      this.followCamera.debugSnapToPlayerHeading(player, payload.player.heading);
    }
    player.velocity.set(0, 0, 0);
    player.grounded = true;
    player.swimming = false;
    player.waterMode = "onLand";
    player.fallingToVoid = false;
    player.floating = false;
    player.justLanded = false;
    player.justRespawned = false;

    const save = payload.save;
    if (save?.unlockedAbilities) {
      this.state.frame.save.unlockedAbilities = new Set(save.unlockedAbilities as AbilityId[]);
    }
    if (save?.catalogedLandmarkIds) {
      this.state.frame.save.catalogedLandmarkIds = new Set(save.catalogedLandmarkIds);
    }
    if (save?.gatheredForageableIds) {
      this.state.frame.save.gatheredForageableIds = new Set(save.gatheredForageableIds);
    }

    this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    this.syncHud();
  }

  debugSetWaterDepthDebug(enabled: boolean) {
    this.waterDepthDebugEnabled = enabled;
    this.world.setWaterDepthDebugEnabled(enabled);
  }

  renderGameToText() {
    if (this.e2eMinimal) {
      const frame = this.state.frame;
      return JSON.stringify({
        e2e: true,
        titleScreenOpen: this.titleScreenOpen,
        viewMode: this.viewMode,
        openingSequence: {
          active: this.openingSequenceActive,
          progress: Number(this.getOpeningSequenceProgress().toFixed(3)),
        },
        pauseMenuOpen: this.pauseMenuOpen,
        characterScreenOpen: this.characterScreenOpen,
        player: {
          x: Number(frame.player.position.x.toFixed(1)),
          y: Number(frame.player.position.y.toFixed(1)),
          z: Number(frame.player.position.z.toFixed(1)),
          heading: Number(frame.player.heading.toFixed(3)),
          swimming: frame.player.swimming,
          waterMode: frame.player.waterMode,
        },
        zone: frame.currentZone,
        landmark: frame.currentLandmark,
      });
    }
    const frame = this.state.frame;
    const characterData = this.state.getCharacterScreenData();
    const faunaStats = this.world.getFaunaStats();
    const focusedCollection = characterData.collections.find(
      (entry) => entry.landmarkId === (characterData.latestCollectionId ?? this.focusedCollectionId),
    );
    const latestGatheredGood = characterData.gatheredGoods.find(
      (entry) => entry.forageableId === characterData.latestGatheredGoodId,
    );
    const pouchCounts = characterData.gatheredGoods.reduce<Record<string, number>>((counts, entry) => {
      if (entry.gathered) {
        counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
      }
      return counts;
    }, {});
    return JSON.stringify({
      coordinateSystem: "x right, y up, z forward across the island",
      mode: this.viewMode,
      titleScreenOpen: this.titleScreenOpen,
      openingSequence: {
        active: this.openingSequenceActive,
        progress: Number(this.getOpeningSequenceProgress().toFixed(3)),
      },
      pauseMenuOpen: this.pauseMenuOpen,
      characterScreenOpen: this.characterScreenOpen,
      player: {
        x: Number(frame.player.position.x.toFixed(1)),
        y: Number(frame.player.position.y.toFixed(1)),
        z: Number(frame.player.position.z.toFixed(1)),
        stamina: Number(frame.player.stamina.toFixed(1)),
        staminaMax: Number(frame.player.staminaMax.toFixed(1)),
        rolling: frame.player.rolling,
        rollHoldSeconds: Number(frame.player.rollHoldSeconds.toFixed(2)),
        rollModeReady: frame.player.rollModeReady,
        floating: frame.player.floating,
        grounded: frame.player.grounded,
        swimming: frame.player.swimming,
        waterMode: frame.player.waterMode,
        waterDepth: Number(frame.player.waterDepth.toFixed(1)),
        heading: Number(frame.player.heading.toFixed(3)),
        velocity: {
          x: Number(frame.player.velocity.x.toFixed(2)),
          y: Number(frame.player.velocity.y.toFixed(2)),
          z: Number(frame.player.velocity.z.toFixed(2)),
        },
      },
      zone: frame.currentZone,
      landmark: frame.currentLandmark,
      save: {
        unlockedAbilities: [...frame.save.unlockedAbilities],
        catalogedLandmarkIds: [...frame.save.catalogedLandmarkIds],
        gatheredForageableIds: [...frame.save.gatheredForageableIds],
      },
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
          pouchCounts,
          nearby: frame.forageableTarget
            ? {
              title: frame.forageableTarget.title,
              kind: frame.forageableTarget.kind,
              distance: Number(frame.forageableTarget.distance.toFixed(1)),
            }
            : null,
        },
      },
      fauna: {
        name: faunaStats.speciesName,
        recruited: faunaStats.recruitedCount,
        nearestRecruitableDistance:
          faunaStats.nearestRecruitableDistance === null
            ? null
            : Number(faunaStats.nearestRecruitableDistance.toFixed(1)),
        recruitedThisFrame: faunaStats.recruitedThisFrame,
        rollingCount: faunaStats.rollingCount,
        mossuCollisionCount: faunaStats.mossuCollisionCount,
        dominantMood: faunaStats.dominantMood,
        regroupActive: faunaStats.regroupActive,
        callHeardActive: faunaStats.callHeardActive,
      },
      audio: {
        ...this.movementAudio.getState(),
        waterAmbience: this.waterAudio.getState(),
      },
      camera: this.followCamera.getDebugState(),
      performance: this.getPerformanceSnapshot(),
      waterDebug: {
        depthView: this.waterDepthDebugEnabled,
        underwaterIntensity: Number(this.underwaterEffect.getIntensity().toFixed(3)),
      },
      qa: this.world.getQaStats(),
    });
  }

  private tick(dt: number, elapsed: number, renderFrame = true) {
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

    if (preZoneForFeedback !== null && preSwimForFeedback !== null) {
      const frame = this.state.frame;
      if (preZoneForFeedback !== frame.currentZone) {
        this.gameplayFeedback.playZoneChange();
        this.followCamera.kickPolar(0.022);
      }
      if (preSwimForFeedback !== frame.player.swimming) {
        this.gameplayFeedback.playSwimSurface(frame.player.swimming);
      }
      if (frame.player.justLanded) {
        this.gameplayFeedback.playLand(frame.player.landingImpact);
        this.followCamera.kickPolar(-0.055 * Math.min(1.2, frame.player.landingImpact));
      }
      if (frame.lastCatalogedLandmarkId || frame.lastGatheredForageableId) {
        this.gameplayFeedback.playInteract();
        this.followCamera.kickPolar(0.018);
      }
    }

    this.updateMovementAudio(dt);
    this.updateWaterAudio(dt);

    if (this.state.frame.lastCatalogedLandmarkId) {
      this.focusedCollectionId = this.state.frame.lastCatalogedLandmarkId;
    } else if (!this.focusedCollectionId && this.state.frame.interactionTarget) {
      this.focusedCollectionId = this.state.frame.interactionTarget.landmarkId;
    }

    this.followCamera.update(this.state.frame.player, dt);
    this.updateUnderwaterEffect(dt, elapsed);
    this.world.update(
      this.state.frame,
      elapsed,
      dt,
      this.viewMode === "map_lookdown",
      faunaRecruitPressed,
      faunaRegroupPressed,
      this.followCamera.camera,
    );
    this.characterPreview.update(dt, this.characterScreenOpen);
    this.syncHudForFrame(dt);
    if (renderFrame) {
      this.renderScene();
      this.updateDebugPanels();
    }
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
    const camera = this.followCamera.camera;
    const player = this.state.frame.player;
    const cameraWater = sampleWaterState(camera.position.x, camera.position.z);
    const depthBelowSurface = cameraWater ? cameraWater.surfaceY - camera.position.y : 0;
    const cameraIntensity = cameraWater && depthBelowSurface > 0.08
      ? MathUtils.clamp(0.22 + depthBelowSurface / 8.5, 0, 1)
      : 0;
    const playerIntensity = player.waterMode === "underwater"
      ? MathUtils.clamp(0.38 + player.waterDepth / 10, 0.38, 0.82)
      : 0;
    const targetIntensity = Math.max(cameraIntensity, playerIntensity);
    this.underwaterEffect.update({ dt, elapsed, targetIntensity });
  }

  private renderScene() {
    const postProcessingEnabled = this.shouldUsePostProcessing();
    if (this.bloomPass) {
      this.bloomPass.enabled = postProcessingEnabled;
    }
    if (this.retroTexturePass) {
      this.retroTexturePass.enabled = postProcessingEnabled;
    }
    if (postProcessingEnabled && this.composer) {
      this.updateRetroTexturePass();
      this.composer.render();
      return;
    }

    this.renderer.render(this.scene, this.followCamera.camera);
  }

  private updateRetroTexturePass() {
    if (!this.retroTexturePass) {
      return;
    }

    this.retroTexturePass.uniforms.uTime.value = this.elapsed;
    this.retroTexturePass.uniforms.uResolution.value.set(
      window.innerWidth * this.activePixelRatio,
      window.innerHeight * this.activePixelRatio,
    );
  }

  private shouldUsePostProcessing() {
    return (
      this.composer !== null &&
      this.viewMode !== "map_lookdown" &&
      this.activePixelRatio >= BLOOM_MIN_PIXEL_RATIO
    );
  }

  private shouldUseBloom() {
    return this.shouldUsePostProcessing();
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
      frame.forageableTarget !== null ||
      frame.interactionTarget !== null ||
      frame.lastCatalogedLandmarkId !== null ||
      frame.lastGatheredForageableId !== null ||
      faunaStats.recruitedThisFrame > 0 ||
      faunaStats.rollingCount > 0 ||
      faunaStats.regroupActive ||
      faunaStats.callHeardActive ||
      (faunaStats.nearestRecruitableDistance !== null && faunaStats.nearestRecruitableDistance <= 14.5);

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
    this.composer?.setPixelRatio(this.activePixelRatio);
    this.underwaterEffect.resize(window.innerWidth, window.innerHeight, this.activePixelRatio);
  }

  private trackFrameTiming(rawDt: number) {
    this.latestFrameMs = Math.max(0.1, rawDt * 1000);
    this.smoothedFrameMs += (this.latestFrameMs - this.smoothedFrameMs) * 0.1;
    this.recordPerfFrameSample(this.latestFrameMs);
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
      `player x ${player.position.x.toFixed(1)} y ${player.position.y.toFixed(1)} z ${player.position.z.toFixed(1)}`,
      `river ${riverEdge.zone}  surface ${riverEdge.surfaceMask.toFixed(2)}  wet ${riverEdge.wetness.toFixed(2)}  damp ${riverEdge.dampBankMask.toFixed(2)}  nook ${riverEdge.nookMask.toFixed(2)}  depth ${riverEdge.waterDepth.toFixed(2)}`,
    ].join("\n");
  }

  private getPerformanceSnapshot() {
    const rendererInfo = this.renderer.info;
    const world = this.world.getPerfStats();
    return {
      fps: Number((1000 / Math.max(0.1, this.smoothedFrameMs)).toFixed(1)),
      frameMs: Number(this.smoothedFrameMs.toFixed(2)),
      latestFrameMs: Number(this.latestFrameMs.toFixed(2)),
      rollingP95FrameMs: Number(this.getPerfFramePercentile(0.95).toFixed(2)),
      rollingSampleCount: this.perfFrameSamples.length,
      qualitySampleFrameMs: Number(this.qualitySampleFrameMs.toFixed(2)),
      pixelRatio: Number(this.activePixelRatio.toFixed(2)),
      maxPixelRatio: Number(this.maxPixelRatio.toFixed(2)),
      minPixelRatio: Number(this.minPixelRatio.toFixed(2)),
      bloomEnabled: this.shouldUseBloom(),
      retroTextureEnabled: this.retroTexturePass !== null && this.shouldUsePostProcessing(),
      waterDepthDebug: this.waterDepthDebugEnabled,
      underwaterIntensity: Number(this.underwaterEffect.getIntensity().toFixed(3)),
      qualityLow: this.qualityLow,
      requestedBackend: this.requestedRendererBackend,
      activeBackend: this.activeRendererBackend,
      webGpuAvailable: this.webGpuAvailable,
      rendererFallbackReason: this.rendererFallbackReason,
      mapZoom: this.followCamera.getMapZoomFactor(),
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
      this.perfDebugPanel.textContent = [
        "Mossu perf",
        `${perf.fps}fps  avg ${perf.frameMs}ms  p95 ${perf.rollingP95FrameMs}ms  last ${perf.latestFrameMs}ms`,
        `pixel ${perf.pixelRatio}  bloom ${perf.bloomEnabled ? "on" : "off"}  texture ${perf.retroTextureEnabled ? "on" : "off"}  water debug ${perf.waterDepthDebug ? "on" : "off"}  ${perf.activeBackend}`,
        `draw ${formatPerfNumber(perf.renderer.calls)} calls  ${formatPerfNumber(perf.renderer.triangles)} tris`,
        `grass ${formatPerfNumber(perf.world.grassInstances)} inst  lod ${perf.world.grassLodVisitedCells}/${perf.world.grassLodCells} cells`,
        `water ${perf.world.waterSurfaces} surfaces  shaders ${perf.world.animatedShaderMeshes}`,
        captureState,
      ].join("\n");
      return;
    }

    this.perfDebugPanel.textContent = [
      `perf ${perf.fps}fps  avg ${perf.frameMs}ms  p95 ${perf.rollingP95FrameMs}ms  raw ${perf.latestFrameMs}ms`,
      `quality avg ${perf.qualitySampleFrameMs}ms  pixelRatio ${perf.pixelRatio} (${perf.minPixelRatio}-${perf.maxPixelRatio})  bloom ${perf.bloomEnabled ? "on" : "off"}  texture ${perf.retroTextureEnabled ? "on" : "off"}  waterDebug ${perf.waterDepthDebug ? "on" : "off"}  lowQuality ${this.qualityLow ? "yes" : "no"}  mapZoom ${perf.mapZoom.toFixed(2)}`,
      `backend ${perf.activeBackend}  requested ${perf.requestedBackend}  webgpu ${perf.webGpuAvailable ? "available" : "unavailable"}${perf.rendererFallbackReason ? `  fallback ${perf.rendererFallbackReason}` : ""}`,
      `renderer calls ${perf.renderer.calls}  tris ${perf.renderer.triangles}  lines ${perf.renderer.lines}  points ${perf.renderer.points}`,
      `memory geometries ${perf.memory.geometries}  textures ${perf.memory.textures}`,
      `terrain ${perf.world.terrainVertices}v / ${perf.world.terrainTriangles}t`,
      `grass ${perf.world.grassMeshes} meshes / ${perf.world.grassInstances} inst / est ${perf.world.grassEstimatedTriangles}t`,
      `grass impostors ${perf.world.grassImpostorMeshes} meshes / ${perf.world.grassImpostorInstances} patches / est ${perf.world.grassImpostorEstimatedTriangles}t`,
      `grass lod ${perf.world.grassLodVisitedCells}/${perf.world.grassLodCells} cells / ${perf.world.grassLodVisitedSources}/${perf.world.grassLodSourceInstances} src`,
      `forest ${perf.world.forestMeshes} meshes / ${perf.world.forestInstances} inst / est ${perf.world.forestEstimatedTriangles}t`,
      `small props ${perf.world.smallPropMeshes} meshes / ${perf.world.smallPropInstances} inst / est ${perf.world.smallPropEstimatedTriangles}t`,
      `water ${perf.world.waterSurfaces} surfaces / ${perf.world.waterVertices}v / ${perf.world.waterTriangles}t`,
      `animated shaders ${perf.world.animatedShaderMeshes}  grass ${perf.world.grassShaderMeshes}  trees ${perf.world.treeShaderMeshes}  water ${perf.world.waterShaderSurfaces}`,
    ].join("\n");
  }

  private recordPerfFrameSample(frameMs: number) {
    if (this.perfFrameSamples.length < PERF_HUD_SAMPLE_LIMIT) {
      this.perfFrameSamples.push(frameMs);
      return;
    }
    this.perfFrameSamples[this.perfFrameSampleIndex] = frameMs;
    this.perfFrameSampleIndex = (this.perfFrameSampleIndex + 1) % PERF_HUD_SAMPLE_LIMIT;
  }

  private getPerfFramePercentile(percentile: number) {
    if (this.perfFrameSamples.length === 0) {
      return this.latestFrameMs;
    }
    const sorted = [...this.perfFrameSamples].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
    return sorted[index];
  }

  private capturePerfSnapshot() {
    if (!this.perfDebugPanel) {
      return;
    }

    const capture = {
      capturedAt: new Date().toISOString(),
      route: `${window.location.pathname}${window.location.search}`,
      performance: this.getPerformanceSnapshot(),
    };
    this.perfCaptureLatest = capture;
    this.perfCaptureFlashUntil = performance.now() + PERF_CAPTURE_FLASH_MS;
    this.perfPanelLastUpdatedAt = 0;
    (window as Window & { __MOSSU_PERF_CAPTURE__?: typeof capture }).__MOSSU_PERF_CAPTURE__ = capture;
    console.info("Mossu perf capture", capture);
    navigator.clipboard?.writeText(JSON.stringify(capture, null, 2)).catch(() => undefined);
  }

  private handleResize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    this.underwaterEffect.resize(window.innerWidth, window.innerHeight, this.activePixelRatio);
    this.followCamera.resize(window.innerWidth, window.innerHeight);
  };

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
    event.preventDefault();
    this.mapDragPointerId = event.pointerId;
    this.mapDragX = event.clientX;
    this.mapDragY = event.clientY;
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  };

  private handleMapPointerMove = (event: PointerEvent) => {
    if (this.mapDragPointerId !== event.pointerId || this.viewMode !== "map_lookdown") {
      return;
    }
    const deltaX = event.clientX - this.mapDragX;
    const deltaY = event.clientY - this.mapDragY;
    this.mapDragX = event.clientX;
    this.mapDragY = event.clientY;
    this.followCamera.panMapViewFromDrag(deltaX, deltaY);
  };

  private handleMapPointerUp = (event: PointerEvent) => {
    if (this.mapDragPointerId !== event.pointerId) {
      return;
    }
    this.mapDragPointerId = null;
    try {
      this.renderer.domElement.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can already be released if the browser cancels a drag.
    }
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
  }

  private openMap() {
    this.pauseMenuOpen = false;
    this.characterScreenOpen = false;
    this.setViewMode("map_lookdown");
    this.movementAudio.stop();
    this.focusGameplaySurface();
  }

  private closeMap() {
    this.mapDragPointerId = null;
    if (this.viewMode !== "third_person") {
      this.setViewMode("third_person");
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

  private createTitleScreen() {
    const titleScreen = document.createElement("div");
    titleScreen.className = "title-screen";
    titleScreen.setAttribute("role", "dialog");
    titleScreen.setAttribute("aria-label", "Mossu title screen");
    titleScreen.innerHTML = `
      <div class="title-screen__sky" aria-hidden="true"></div>
      <div class="title-screen__shade" aria-hidden="true"></div>
      <div class="title-screen__sun" aria-hidden="true"></div>
      <div class="title-screen__trail" aria-hidden="true"></div>
      <div class="title-screen__fireflies" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="title-screen__hills" aria-hidden="true">
        <span class="title-screen__hill title-screen__hill--back"></span>
        <span class="title-screen__hill title-screen__hill--mid"></span>
        <span class="title-screen__hill title-screen__hill--front"></span>
      </div>
      <div class="title-screen__menu">
        <div class="title-screen__crest" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <p class="title-screen__eyebrow">The Meadowlight Isles</p>
        <h1 class="title-screen__logo">Mossu</h1>
        <p class="title-screen__splash">wake in the meadow, fill the holo binder, and climb toward Moss Crown</p>
        <button class="title-screen__button" type="button">
          <span>Begin Quest</span>
          <small>Enter / Space</small>
        </button>
        <div class="title-screen__opening-cards" aria-hidden="true">
          <span><strong>01</strong> Meadow</span>
          <span><strong>02</strong> Lake</span>
          <span><strong>03</strong> Karu</span>
        </div>
        <div class="title-screen__tool-flow" aria-label="Workshop flow">
          <button class="title-screen__tool-step title-screen__tool-step--active title-screen__tool-step--play" type="button">
            <span>Adventure</span>
            <small>opening minute</small>
          </button>
          <a class="title-screen__tool-step title-screen__tool-step--active" href="?modelViewer=1">
            <span>Companions</span>
            <small>Mossu + Karu</small>
          </a>
          <span class="title-screen__tool-step title-screen__tool-step--locked" aria-disabled="true">
            <span>Realm Atlas</span>
            <small>coming soon</small>
          </span>
        </div>
        <div class="title-screen__starter-row" aria-hidden="true">
          <span>stamp cards</span>
          <span>glide</span>
          <span>befriend Karu</span>
        </div>
        <p class="title-screen__note">Tab opens the field guide · M unfolds the realm map</p>
      </div>
    `;
    titleScreen
      .querySelectorAll<HTMLButtonElement>(".title-screen__button, .title-screen__tool-step--play")
      .forEach((button) => {
        button.addEventListener("click", this.startFromTitle);
      });
    return titleScreen;
  }

  private createOpeningSequenceOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "opening-sequence";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="opening-sequence__panel">
        <p class="opening-sequence__kicker">Opening Route</p>
        <strong>Mossu wakes by Burrow Hollow</strong>
        <span>grass bends around the lake path; the first Karu are close enough to hear</span>
        <div class="opening-sequence__beats" aria-hidden="true">
          <i>meadow</i>
          <i>water</i>
          <i>Karu</i>
        </div>
      </div>
      <p class="opening-sequence__skip">Press any move key to begin</p>
    `;
    return overlay;
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
    this.syncHud();
    this.focusGameplaySurface();
  }

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
