import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import type { PlayerState } from "../../simulation/gameState";
import { createKaruModelRig, type AmbientBlobRig } from "../objects/KaruAvatar";
import { MossuAvatar } from "../objects/MossuAvatar";
import { InterfaceAudio, isButtonLikeUiTarget } from "./InterfaceAudio";

type ModelViewerModel = "mossu" | "karu";
type ModelViewerPose = "idle" | "hop" | "roll" | "glide" | "sniff" | "rest";
type ModelViewerLighting = "meadow" | "forest" | "shore" | "shrine";

interface ViewerRig {
  readonly group: Group;
  update: (time: number, dt: number, pose: ModelViewerPose) => void;
}

const MODEL_OPTIONS: Array<{ id: ModelViewerModel; label: string; meta: string }> = [
  { id: "mossu", label: "Mossu", meta: "player" },
  { id: "karu", label: "Karu", meta: "companion" },
];

const POSE_OPTIONS: Array<{ id: ModelViewerPose; label: string }> = [
  { id: "idle", label: "Idle" },
  { id: "hop", label: "Hop" },
  { id: "roll", label: "Roll" },
  { id: "glide", label: "Glide" },
  { id: "sniff", label: "Sniff" },
  { id: "rest", label: "Rest" },
];

const LIGHTING_OPTIONS: Array<{ id: ModelViewerLighting; label: string }> = [
  { id: "meadow", label: "Meadow" },
  { id: "forest", label: "Forest" },
  { id: "shore", label: "Shore" },
  { id: "shrine", label: "Shrine" },
];

const CAMERA_TARGET = new Vector3(0, 1.6, 0);

export class ModelViewerApp {
  private readonly root = document.createElement("main");
  private readonly canvasWrap = document.createElement("div");
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly interfaceAudio = new InterfaceAudio();
  private readonly camera = new PerspectiveCamera(33, 1, 0.1, 120);
  private readonly stageRoot = new Group();
  private readonly propRoot = new Group();
  private readonly meadowLight = new DirectionalLight("#fff0c7", 2.2);
  private readonly rimLight = new DirectionalLight("#c7ecff", 0.95);
  private readonly fillLight = new AmbientLight("#eaf8ff", 1.15);
  private readonly cameraPosition = new Vector3();
  private activeRig: ViewerRig | null = null;
  private selectedModel: ModelViewerModel = "mossu";
  private selectedPose: ModelViewerPose = "idle";
  private selectedLighting: ModelViewerLighting = "meadow";
  private animationFrame: number | null = null;
  private lastTimestamp = 0;
  private time = 0;
  private manualOrbit = 0;
  private isPlaying = true;
  private turntable = true;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastScrubFrame = -1;

  constructor(private readonly container: HTMLElement) {
    this.root.className = "model-viewer";
    this.root.innerHTML = this.renderShell();
    this.canvasWrap.className = "model-viewer__stage";

    const stageSlot = this.root.querySelector<HTMLElement>("[data-stage-slot]");
    if (!stageSlot) {
      throw new Error("Missing model viewer stage slot");
    }
    stageSlot.appendChild(this.canvasWrap);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color("#dff7ff"), 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.1));
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.className = "model-viewer__canvas";
    this.canvasWrap.appendChild(this.renderer.domElement);

    this.scene.background = new Color("#dff7ff");
    this.scene.fog = new Fog("#dff7ff", 22, 62);
    this.scene.add(this.fillLight, this.meadowLight, this.rimLight, this.stageRoot, this.propRoot);

    this.meadowLight.position.set(8, 12, 8);
    this.meadowLight.castShadow = false;
    this.rimLight.position.set(-7, 7, -8);

    this.camera.position.set(0, 5.3, 12.5);
    this.camera.lookAt(CAMERA_TARGET);

    this.buildStageProps();
    this.installControls();
    this.switchModel(this.selectedModel);
    this.applyLighting(this.selectedLighting);
    this.updateUiState();
    this.resizeIfNeeded();
    this.render();
  }

  start() {
    const tick = (timestamp: number) => {
      const dt = this.lastTimestamp > 0 ? Math.min((timestamp - this.lastTimestamp) / 1000, 0.05) : 1 / 60;
      this.lastTimestamp = timestamp;
      this.advanceTime(dt * 1000);
      this.animationFrame = window.requestAnimationFrame(tick);
    };
    this.animationFrame = window.requestAnimationFrame(tick);
  }

  stop() {
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  advanceTime(ms: number) {
    const dt = MathUtils.clamp(ms / 1000, 0, 0.08);
    if (this.isPlaying) {
      this.time += dt;
    }
    this.resizeIfNeeded();
    this.updateTimelineScrub();
    this.activeRig?.update(this.time, dt, this.selectedPose);
    this.updateCamera(dt);
    this.render();
  }

  renderGameToText() {
    return JSON.stringify({
      mode: "model_viewer",
      selectedModel: this.selectedModel,
      selectedPose: this.selectedPose,
      lighting: this.selectedLighting,
      playing: this.isPlaying,
      turntable: this.turntable,
      time: Number(this.time.toFixed(3)),
      objectCount: this.stageRoot.children.length,
    });
  }

  dispose() {
    this.stop();
    this.root.removeEventListener("pointerdown", this.handleUiPointerDown, true);
    this.root.removeEventListener("keydown", this.handleUiKeyboardActivate, true);
    this.clearActiveRig();
    this.interfaceAudio.dispose();
    this.renderer.dispose();
  }

  private renderShell() {
    const modelButtons = MODEL_OPTIONS.map(
      (option) => `
        <button class="model-viewer__model-button" type="button" data-model="${option.id}">
          <span>${option.label}</span>
          <small>${option.meta}</small>
        </button>
      `,
    ).join("");

    const poseButtons = POSE_OPTIONS.map(
      (option) => `<button class="model-viewer__chip" type="button" data-pose="${option.id}">${option.label}</button>`,
    ).join("");

    const lightingButtons = LIGHTING_OPTIONS.map(
      (option) => `<button class="model-viewer__chip" type="button" data-lighting="${option.id}">${option.label}</button>`,
    ).join("");

    return `
      <section class="model-viewer__hero">
        <div class="model-viewer__title-block">
          <p class="model-viewer__kicker">Mossu Workshop</p>
          <h1>Character Viewer</h1>
          <p>Inspect one creature at a time, test poses, and tune the cozy world lighting before changes go back into the route.</p>
        </div>
        <a class="model-viewer__back-link" href="./">Back to game</a>
      </section>

      <section class="model-viewer__layout">
        <aside class="model-viewer__panel model-viewer__panel--left">
          <div>
            <p class="model-viewer__label">Model</p>
            <div class="model-viewer__model-list">${modelButtons}</div>
          </div>
          <div>
            <p class="model-viewer__label">Pose</p>
            <div class="model-viewer__chips">${poseButtons}</div>
          </div>
          <div>
            <p class="model-viewer__label">Lighting</p>
            <div class="model-viewer__chips">${lightingButtons}</div>
          </div>
        </aside>

        <div class="model-viewer__stage-card">
          <div class="model-viewer__stage-header">
            <div>
              <p class="model-viewer__label">Live Rig</p>
              <h2 data-viewer-heading>Mossu</h2>
            </div>
            <div class="model-viewer__stage-actions">
              <button class="model-viewer__icon-button" type="button" data-toggle-play>Pause</button>
              <button class="model-viewer__icon-button" type="button" data-toggle-turntable>Turntable</button>
            </div>
          </div>
          <div data-stage-slot></div>
          <div class="model-viewer__timeline">
            <span>0s</span>
            <input type="range" min="0" max="600" value="0" step="1" data-time-scrub />
            <span>10s</span>
          </div>
        </div>

        <aside class="model-viewer__panel model-viewer__panel--right">
          <div class="model-viewer__spec-card">
            <p class="model-viewer__label">Notes</p>
            <h3 data-viewer-note-title>Mossu idle loop</h3>
            <p data-viewer-note-copy>Soft squash, small leg motion, and enough turntable movement to read the fluffy silhouette.</p>
          </div>
          <div class="model-viewer__spec-list">
            <div><span>Keyboard</span><strong>A / D rotate</strong></div>
            <div><span>Playback</span><strong>Space pause</strong></div>
            <div><span>Switch</span><strong>1 Mossu · 2 Karu</strong></div>
          </div>
        </aside>
      </section>
    `;
  }

  private installControls() {
    this.container.textContent = "";
    this.container.appendChild(this.root);
    this.root.addEventListener("pointerdown", this.handleUiPointerDown, true);
    this.root.addEventListener("keydown", this.handleUiKeyboardActivate, true);

    this.root.querySelectorAll<HTMLButtonElement>("[data-model]").forEach((button) => {
      button.addEventListener("click", () => {
        const model = button.dataset.model as ModelViewerModel | undefined;
        if (model) {
          this.switchModel(model);
          this.updateUiState();
        }
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach((button) => {
      button.addEventListener("click", () => {
        const pose = button.dataset.pose as ModelViewerPose | undefined;
        if (pose) {
          this.selectedPose = pose;
          this.time = 0;
          this.updateUiState();
        }
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-lighting]").forEach((button) => {
      button.addEventListener("click", () => {
        const lighting = button.dataset.lighting as ModelViewerLighting | undefined;
        if (lighting) {
          this.selectedLighting = lighting;
          this.applyLighting(lighting);
          this.updateUiState();
        }
      });
    });

    this.root.querySelector<HTMLButtonElement>("[data-toggle-play]")?.addEventListener("click", () => {
      this.isPlaying = !this.isPlaying;
      this.updateUiState();
    });

    this.root.querySelector<HTMLButtonElement>("[data-toggle-turntable]")?.addEventListener("click", () => {
      this.turntable = !this.turntable;
      this.updateUiState();
    });

    this.root.querySelector<HTMLInputElement>("[data-time-scrub]")?.addEventListener("input", (event) => {
      const target = event.currentTarget as HTMLInputElement | null;
      if (!target) {
        return;
      }
      this.time = Number(target.value) / 60;
      this.render();
    });

    window.addEventListener("keydown", (event) => {
      if (event.repeat) {
        return;
      }
      if (event.key === "1") {
        this.switchModel("mossu");
        this.updateUiState();
      } else if (event.key === "2") {
        this.switchModel("karu");
        this.updateUiState();
      } else if (event.key === " ") {
        event.preventDefault();
        this.isPlaying = !this.isPlaying;
        this.updateUiState();
      } else if (event.key.toLowerCase() === "a" || event.key === "ArrowLeft") {
        this.manualOrbit -= 0.28;
      } else if (event.key.toLowerCase() === "d" || event.key === "ArrowRight") {
        this.manualOrbit += 0.28;
      }
    });
  }

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

  private switchModel(model: ModelViewerModel) {
    this.selectedModel = model;
    this.clearActiveRig();
    this.activeRig = model === "mossu" ? this.createMossuRig() : this.createKaruRig();
    this.stageRoot.add(this.activeRig.group);
    this.updateUiState();
  }

  private createMossuRig(): ViewerRig {
    const mossu = new MossuAvatar();
    const player = this.createPreviewPlayer();
    const groundLift = 2.16;
    mossu.group.scale.setScalar(0.62);
    mossu.group.position.set(0, 0, 0);

    return {
      group: mossu.group,
      update: (time, dt, pose) => {
        const cycle = (time % 1.2) / 1.2;
        const hopArc = Math.max(0, Math.sin(cycle * Math.PI));
        const rollActive = pose === "roll";
        player.position.set(
          0,
          groundLift + (pose === "hop" ? hopArc * 0.82 : pose === "glide" ? 0.92 + Math.sin(time * 1.8) * 0.08 : 0),
          0,
        );
        player.velocity.set(
          Math.sin(time * 1.4) * (pose === "sniff" ? 0.25 : 0.45),
          pose === "hop" ? Math.cos(cycle * Math.PI) * 5.5 : pose === "glide" ? 0.35 : 0,
          rollActive ? 9.2 : pose === "glide" ? 4.5 : pose === "idle" ? 1.5 : 0,
        );
        player.heading = rollActive ? time * 0.9 : Math.sin(time * 0.7) * 0.16;
        player.rolling = rollActive;
        player.rollingBoostActive = rollActive;
        player.rollHoldSeconds = rollActive ? 3.2 : 0;
        player.rollModeReady = rollActive;
        player.floating = pose === "glide";
        player.grounded = pose !== "hop" && pose !== "glide";
        player.swimming = false;
        player.justLanded = pose === "hop" && cycle < dt;
        player.landingImpact = player.justLanded ? 5 : 0;
        mossu.update(player, dt);
        if (pose === "rest") {
          mossu.group.rotation.z = Math.sin(time * 1.4) * 0.03;
          mossu.group.scale.set(0.72, 0.54 + Math.sin(time * 1.8) * 0.018, 0.68);
        } else {
          mossu.group.scale.setScalar(0.62);
        }
      },
    };
  }

  private createKaruRig(): ViewerRig {
    const karu = createKaruModelRig(1.58);
    karu.group.scale.setScalar(1.34);
    karu.group.position.set(0, 0.06, 0);

    return {
      group: karu.group,
      update: (time, dt, pose) => {
        this.updateKaruRig(karu, time, dt, pose);
      },
    };
  }

  private updateKaruRig(karu: AmbientBlobRig, time: number, dt: number, pose: ModelViewerPose) {
    const scale = karu.creatureScale;
    const cycle = time * 4.1;
    const hop = pose === "hop" ? Math.max(0, Math.sin((time * 2.4) % Math.PI)) : 0;
    const rolling = pose === "roll";
    const rest = pose === "rest";
    const sniff = pose === "sniff";
    const glide = pose === "glide";
    const rollSpin = rolling ? time * 8.5 : 0;
    const rollBlend = rolling ? 1 : 0;
    const sleepyBreath = rest ? Math.sin(time * 1.7) * 0.05 : 0;
    const bounce = hop * 0.38 * scale + (glide ? 0.42 * scale + Math.sin(time * 2.4) * 0.05 * scale : 0);

    karu.group.position.y = 0.06 + bounce;
    karu.group.rotation.y = rolling ? Math.sin(time * 1.2) * 0.16 : Math.sin(time * 0.45) * 0.18;
    karu.root.position.y = rest ? -0.08 * scale + sleepyBreath * scale : hop * 0.1 * scale;
    karu.root.rotation.x = rolling ? -0.1 + Math.sin(rollSpin) * 0.36 : sniff ? -0.18 + Math.sin(cycle) * 0.04 : rest ? -0.18 : -0.04 + hop * 0.1;
    karu.root.rotation.z = rolling ? Math.cos(rollSpin * 0.72) * 0.18 : Math.sin(time * 1.8) * 0.035;

    const squash = rolling ? 1.12 : rest ? 1.13 + sleepyBreath : 1 - hop * 0.08;
    const stretch = rolling ? 0.88 : rest ? 0.78 - sleepyBreath * 0.28 : 1 + hop * 0.16;
    karu.body.scale.set(1.16 * squash, 1.04 * stretch, 1.14 * (rolling ? 0.88 : 1));
    karu.body.position.y = 0.62 * scale - (rest ? 0.08 * scale : 0);

    karu.face.rotation.y = sniff ? Math.sin(time * 4.8) * 0.18 : Math.sin(time * 1.7) * 0.08;
    karu.face.position.y = 0.73 * scale + (sniff ? Math.max(0, Math.sin(time * 5.4)) * 0.05 * scale : 0) - (rest ? 0.08 * scale : 0);
    karu.face.position.z = 0.56 * scale + (sniff ? 0.05 * scale : 0) + (rolling ? -0.04 * scale : 0);

    const blink = rest ? 0.58 : Math.max(0, Math.sin(time * 0.9 - 0.8)) > 0.96 ? 1 : 0;
    const eyeSquish = blink + rollBlend * 0.14 + (sniff ? 0.08 : 0);
    karu.leftEye.scale.set(0.72 + eyeSquish * 0.12, 1.58 - eyeSquish * 0.7, 0.32);
    karu.rightEye.scale.copy(karu.leftEye.scale);

    karu.tail.position.set(
      Math.sin(time * 2.8) * 0.04 * scale,
      0.46 * scale + hop * 0.05 * scale - (rest ? 0.1 * scale : 0),
      -0.72 * scale + rollBlend * 0.12 * scale,
    );
    karu.tail.rotation.y = Math.sin(time * 3.4) * (rest ? 0.025 : 0.14);
    karu.tail.rotation.x = -0.12 + rollBlend * 0.46;
    karu.tail.scale.set(
      0.52 * MathUtils.lerp(1, 0.58, rollBlend),
      0.5 * MathUtils.lerp(1, 0.48, rollBlend),
      0.82 * MathUtils.lerp(1, 0.62, rollBlend),
    );

    karu.feet.forEach((foot, index) => {
      const homeX = typeof foot.userData.homeX === "number" ? foot.userData.homeX : index % 2 === 0 ? -0.3 : 0.3;
      const homeZ = typeof foot.userData.homeZ === "number" ? foot.userData.homeZ : index < 2 ? 0.38 : -0.38;
      const footPhase = index % 2 === 0 ? 0 : Math.PI;
      const step = pose === "idle" || pose === "hop" ? Math.max(0, Math.sin(cycle + footPhase)) : 0;
      foot.visible = rollBlend < 0.86 && !glide;
      foot.position.set(
        MathUtils.lerp(homeX * scale, homeX * 0.28 * scale, rollBlend),
        MathUtils.lerp(0.09 * scale + step * 0.04 * scale - (rest ? 0.045 * scale : 0), 0.16 * scale, rollBlend),
        MathUtils.lerp(homeZ * scale + (sniff && homeZ > 0 ? 0.05 * scale : 0), (homeZ * 0.24 + 0.04) * scale, rollBlend),
      );
      const footSize = homeZ > 0 ? 1 : 0.9;
      foot.scale.set(
        MathUtils.lerp((homeZ > 0 ? 1.1 : 0.94) * footSize, 0.36, rollBlend),
        MathUtils.lerp(rest ? 0.34 : 0.46 + step * 0.05, 0.26, rollBlend),
        MathUtils.lerp((homeZ > 0 ? 0.84 : 0.76) * footSize, 0.32, rollBlend),
      );
    });

    karu.fluffPuffs.forEach((puff, index) => {
      const baseScale = puff.userData.baseScale as { x?: number; y?: number; z?: number } | undefined;
      const baseX = baseScale?.x ?? 0.26 * scale;
      const baseY = baseScale?.y ?? 0.26 * scale;
      const baseZ = baseScale?.z ?? 0.24 * scale;
      const flutter = Math.sin(time * 2.8 + index * 0.72) * 0.035 + hop * 0.04 + rollBlend * 0.03;
      puff.scale.set(baseX * (1 + flutter), baseY * (1 - flutter * 0.42), baseZ * (1 + rollBlend * 0.03));
    });
  }

  private createPreviewPlayer(): PlayerState {
    return {
      position: new Vector3(),
      velocity: new Vector3(),
      heading: 0,
      stamina: 100,
      staminaMax: 100,
      staminaVisible: false,
      rolling: false,
      rollingBoostActive: false,
      rollHoldSeconds: 0,
      rollModeReady: false,
      floating: false,
      grounded: true,
      swimming: false,
      waterDepth: 0,
      waterSurfaceY: 0,
      fallingToVoid: false,
      voidFallTime: 0,
      justLanded: false,
      justRespawned: false,
      landingImpact: 0,
    };
  }

  private buildStageProps() {
    const groundMaterial = new MeshStandardMaterial({
      color: "#a9d777",
      roughness: 0.98,
      metalness: 0,
    });
    const ground = new Mesh(new CircleGeometry(4.8, 72), groundMaterial);
    ground.rotation.x = -Math.PI * 0.5;
    ground.receiveShadow = true;
    this.propRoot.add(ground);

    const path = new Mesh(
      new PlaneGeometry(1.35, 6.4, 1, 1),
      new MeshStandardMaterial({
        color: "#d9c28a",
        roughness: 1,
        transparent: true,
        opacity: 0.82,
        side: DoubleSide,
      }),
    );
    path.rotation.x = -Math.PI * 0.5;
    path.rotation.z = 0.18;
    path.position.y = 0.012;
    this.propRoot.add(path);

    const leafMaterial = new MeshStandardMaterial({ color: "#78be52", roughness: 0.94 });
    const trunkMaterial = new MeshStandardMaterial({ color: "#9b6b3f", roughness: 0.98 });
    [
      { x: -3.2, z: -1.8, s: 0.82 },
      { x: 3.35, z: -2.1, s: 0.7 },
      { x: -3.55, z: 2.2, s: 0.58 },
    ].forEach((tree) => {
      const trunk = new Mesh(new BoxGeometry(0.18, 0.7, 0.18), trunkMaterial);
      trunk.position.set(tree.x, 0.35, tree.z);
      trunk.castShadow = true;
      const leaves = new Mesh(new ConeGeometry(0.62 * tree.s, 1.1 * tree.s, 7), leafMaterial);
      leaves.position.set(tree.x, 0.98, tree.z);
      leaves.castShadow = true;
      this.propRoot.add(trunk, leaves);
    });
  }

  private applyLighting(lighting: ModelViewerLighting) {
    const settings = {
      meadow: { background: "#dff7ff", fog: "#dff7ff", ambient: 1.15, key: 2.2, rim: 0.95, ground: "#a9d777" },
      forest: { background: "#d8f1d9", fog: "#d8f1d9", ambient: 0.96, key: 1.72, rim: 1.2, ground: "#83bd69" },
      shore: { background: "#d5fbff", fog: "#d5fbff", ambient: 1.08, key: 2.0, rim: 1.08, ground: "#b9d68f" },
      shrine: { background: "#e9edff", fog: "#e9edff", ambient: 1.04, key: 1.88, rim: 1.45, ground: "#a8cf94" },
    }[lighting];

    this.scene.background = new Color(settings.background);
    this.scene.fog = new Fog(settings.fog, 22, 62);
    this.fillLight.intensity = settings.ambient;
    this.meadowLight.intensity = settings.key;
    this.rimLight.intensity = settings.rim;
    this.propRoot.children.forEach((child) => {
      if (child instanceof Mesh && child.geometry instanceof CircleGeometry) {
        const material = child.material;
        if (!Array.isArray(material) && "color" in material) {
          material.color.set(settings.ground);
        }
      }
    });
  }

  private updateCamera(dt: number) {
    const orbit = this.manualOrbit + (this.turntable ? this.time * 0.24 : 0);
    const radius = this.selectedModel === "mossu" ? 11.3 : 8.6;
    const height = this.selectedModel === "mossu" ? 5.7 : 4.2;
    this.cameraPosition.set(Math.sin(orbit) * radius, height, Math.cos(orbit) * radius);
    this.camera.position.lerp(this.cameraPosition, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(CAMERA_TARGET);
  }

  private updateUiState() {
    this.root.dataset.model = this.selectedModel;
    this.root.dataset.pose = this.selectedPose;
    this.root.dataset.lighting = this.selectedLighting;
    this.root.querySelectorAll<HTMLButtonElement>("[data-model]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.model === this.selectedModel);
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.pose === this.selectedPose);
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-lighting]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.lighting === this.selectedLighting);
    });

    const heading = this.root.querySelector<HTMLElement>("[data-viewer-heading]");
    if (heading) {
      heading.textContent = this.selectedModel === "mossu" ? "Mossu" : "Karu Companion";
    }

    const playButton = this.root.querySelector<HTMLButtonElement>("[data-toggle-play]");
    if (playButton) {
      playButton.textContent = this.isPlaying ? "Pause" : "Play";
      playButton.classList.toggle("is-active", this.isPlaying);
    }

    const turntableButton = this.root.querySelector<HTMLButtonElement>("[data-toggle-turntable]");
    if (turntableButton) {
      turntableButton.classList.toggle("is-active", this.turntable);
    }

    const scrub = this.root.querySelector<HTMLInputElement>("[data-time-scrub]");
    if (scrub) {
      scrub.value = `${this.lastScrubFrame >= 0 ? this.lastScrubFrame : Math.round((this.time % 10) * 60)}`;
    }

    const noteTitle = this.root.querySelector<HTMLElement>("[data-viewer-note-title]");
    const noteCopy = this.root.querySelector<HTMLElement>("[data-viewer-note-copy]");
    if (noteTitle && noteCopy) {
      const notes = this.viewerNote();
      noteTitle.textContent = notes.title;
      noteCopy.textContent = notes.copy;
    }
  }

  private viewerNote() {
    if (this.selectedModel === "karu") {
      return {
        title: this.selectedPose === "roll" ? "Karu rolling mimic" : "Karu companion rig",
        copy: "Use this to tune fluffy puffs, big eyes, paws, and companion poses without searching the route for a herd.",
      };
    }

    return {
      title: this.selectedPose === "glide" ? "Mossu glide silhouette" : "Mossu player rig",
      copy: "Check squash, roll readability, tiny legs, eyes, and soft body motion against the main traversal poses.",
    };
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  private updateTimelineScrub() {
    const frame = Math.round((this.time % 10) * 60);
    if (frame === this.lastScrubFrame) {
      return;
    }
    this.lastScrubFrame = frame;
    const scrub = this.root.querySelector<HTMLInputElement>("[data-time-scrub]");
    if (scrub && document.activeElement !== scrub) {
      scrub.value = `${frame}`;
    }
  }

  private resizeIfNeeded() {
    const width = Math.max(1, Math.round(this.canvasWrap.clientWidth));
    const height = Math.max(1, Math.round(this.canvasWrap.clientHeight));
    if (width === this.lastWidth && height === this.lastHeight) {
      return;
    }
    this.lastWidth = width;
    this.lastHeight = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private clearActiveRig() {
    if (!this.activeRig) {
      return;
    }
    this.stageRoot.remove(this.activeRig.group);
    disposeObject(this.activeRig.group);
    this.activeRig = null;
  }
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    disposeGeometry(child.geometry);
    disposeMaterial(child.material);
  });
}

function disposeGeometry(geometry: BufferGeometry) {
  geometry.dispose();
}

function disposeMaterial(material: Material | Material[]) {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  material.dispose();
}
