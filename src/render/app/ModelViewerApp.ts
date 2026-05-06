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
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
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
  private dragPointerId: number | null = null;
  private dragStartX = 0;
  private dragStartOrbit = 0;

  constructor(private readonly container: HTMLElement) {
    this.root.className = "model-viewer";
    this.selectedModel = this.getInitialModel();
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
    this.canvasWrap.insertAdjacentHTML("beforeend", this.renderKaruViewport());
    this.canvasWrap.appendChild(this.renderer.domElement);
    this.canvasWrap.insertAdjacentHTML(
      "beforeend",
      `
        <div class="model-viewer__orbit-hint" aria-hidden="true">
          <span class="model-viewer__orbit-icon"></span>
          <span>Drag to orbit</span>
        </div>
      `,
    );

    this.scene.background = null;
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
    this.renderer.domElement.removeEventListener("pointerdown", this.handleStagePointerDown);
    window.removeEventListener("pointermove", this.handleStagePointerMove);
    window.removeEventListener("pointerup", this.handleStagePointerEnd);
    window.removeEventListener("pointercancel", this.handleStagePointerEnd);
    this.clearActiveRig();
    this.interfaceAudio.dispose();
    this.renderer.dispose();
  }

  private renderShell() {
    const karuFirst = this.selectedModel === "karu";
    const title = karuFirst ? "Karu Viewer" : "Character Viewer";
    const kicker = karuFirst ? "Karu Workshop" : "Mossu Workshop";
    const intro = karuFirst
      ? "Open directly on Karu, test companion poses, and read the fluffy rig close-up before changes go back into the route."
      : "Inspect one creature at a time, test poses, and tune the cozy world lighting before changes go back into the route.";
    const stageHeading = karuFirst ? "Karu Companion" : "Mossu";
    const initialNote = karuFirst
      ? "Use this to tune fluffy puffs, big eyes, paws, and companion poses without searching the route for a herd."
      : "Soft squash, small leg motion, and enough turntable movement to read the fluffy silhouette.";
    const modelButtons = MODEL_OPTIONS.map((option) =>
      this.renderControlButton("model", option.id, option.label, option.meta),
    ).join("");

    const poseButtons = POSE_OPTIONS.map((option) => this.renderControlButton("pose", option.id, option.label)).join(
      "",
    );

    const lightingButtons = LIGHTING_OPTIONS.map((option) =>
      this.renderControlButton("lighting", option.id, option.label),
    ).join("");

    return this.renderAppShell({
      heroHeader: this.renderHeroHeader({ kicker, title, intro }),
      sidebar: this.renderSidebar({ modelButtons, poseButtons, lightingButtons }),
      liveRigPanel: this.renderLiveRigPanel(stageHeading),
      infoPanel: this.renderInfoPanel({
        initialTitle: karuFirst ? "Karu companion rig" : "Mossu idle loop",
        initialNote,
      }),
    });
  }

  private renderAppShell(parts: { heroHeader: string; sidebar: string; liveRigPanel: string; infoPanel: string }) {
    return `
      <div class="model-viewer__window">
        ${this.renderTrafficLights()}
        ${parts.heroHeader}
        <section class="model-viewer__layout">
          ${parts.sidebar}
          ${parts.liveRigPanel}
          ${parts.infoPanel}
        </section>
      </div>
    `;
  }

  private renderTrafficLights() {
    return `
      <div class="model-viewer__traffic-lights" aria-hidden="true">
        <span class="model-viewer__traffic-light model-viewer__traffic-light--close"></span>
        <span class="model-viewer__traffic-light model-viewer__traffic-light--minimize"></span>
        <span class="model-viewer__traffic-light model-viewer__traffic-light--zoom"></span>
      </div>
    `;
  }

  private renderHeroHeader(copy: { kicker: string; title: string; intro: string }) {
    return `
      <section class="model-viewer__hero">
        <div class="model-viewer__crest" aria-hidden="true">
          ${this.renderKaruCharacter("icon")}
        </div>
        <div class="model-viewer__title-block">
          <p class="model-viewer__kicker">${copy.kicker}</p>
          <h1>${copy.title}</h1>
          <p>${copy.intro}</p>
        </div>
        <a class="model-viewer__back-link" href="./">
          <span class="model-viewer__back-arrow" aria-hidden="true"></span>
          <span>Back to game</span>
        </a>
      </section>
    `;
  }

  private renderSidebar(groups: { modelButtons: string; poseButtons: string; lightingButtons: string }) {
    return `
      <aside class="model-viewer__panel model-viewer__panel--left">
        ${this.renderControlSection("Model", "model", groups.modelButtons, "model-viewer__model-list")}
        ${this.renderControlSection("Pose", "pose", groups.poseButtons, "model-viewer__chips")}
        ${this.renderControlSection("Lighting", "lighting", groups.lightingButtons, "model-viewer__chips")}
      </aside>
    `;
  }

  private renderControlSection(title: string, icon: string, controls: string, listClass: string) {
    return `
      <section class="model-viewer__control-section" aria-labelledby="model-viewer-${icon}">
        <p class="model-viewer__label" id="model-viewer-${icon}">
          <span class="model-viewer__section-icon model-viewer__section-icon--${icon}" aria-hidden="true"></span>
          <span>${title}</span>
        </p>
        <div class="${listClass}">${controls}</div>
      </section>
    `;
  }

  private renderControlButton(kind: "model" | "pose" | "lighting", id: string, label: string, meta?: string) {
    if (kind === "model") {
      return `
        <button class="model-viewer__model-button" type="button" data-model="${id}" aria-pressed="false">
          <span class="model-viewer__model-thumb model-viewer__model-thumb--${id}" aria-hidden="true"></span>
          <span class="model-viewer__model-copy">
            <span>${label}</span>
            <small>${meta ?? ""}</small>
          </span>
        </button>
      `;
    }

    return `
      <button class="model-viewer__chip" type="button" data-${kind}="${id}" aria-pressed="false">
        <span class="model-viewer__chip-art model-viewer__chip-art--${id}" aria-hidden="true"></span>
        <span>${label}</span>
      </button>
    `;
  }

  private renderLiveRigPanel(stageHeading: string) {
    return `
      <div class="model-viewer__stage-card">
        <div class="model-viewer__stage-header">
          <div>
            <p class="model-viewer__label">
              <span class="model-viewer__section-icon model-viewer__section-icon--live" aria-hidden="true"></span>
              <span>Live Rig</span>
            </p>
            <div class="model-viewer__stage-title-row">
              <h2 data-viewer-heading>${stageHeading}</h2>
              <button class="model-viewer__edit-button" type="button" aria-label="Edit selected rig notes">
                <span class="model-viewer__edit-dot" aria-hidden="true"></span>
              </button>
            </div>
          </div>
          <div class="model-viewer__stage-actions">
            <button class="model-viewer__icon-button" type="button" data-toggle-play aria-label="Pause animation" aria-pressed="true">
              <span class="model-viewer__button-icon model-viewer__button-icon--playback" aria-hidden="true"></span>
              <span data-toggle-play-label>Pause</span>
            </button>
            <button class="model-viewer__icon-button" type="button" data-toggle-turntable aria-label="Toggle turntable rotation" aria-pressed="true">
              <span class="model-viewer__button-icon model-viewer__button-icon--turntable" aria-hidden="true"></span>
              <span>Turntable</span>
            </button>
          </div>
        </div>
        <div data-stage-slot></div>
        ${this.renderTimelineScrubber()}
      </div>
    `;
  }

  private renderKaruViewport() {
    return `
      <div class="model-viewer__viewport-illustration" aria-hidden="true">
        <span class="model-viewer__viewport-cloud model-viewer__viewport-cloud--one"></span>
        <span class="model-viewer__viewport-cloud model-viewer__viewport-cloud--two"></span>
        <span class="model-viewer__viewport-hill model-viewer__viewport-hill--far"></span>
        <span class="model-viewer__viewport-hill model-viewer__viewport-hill--left"></span>
        <span class="model-viewer__viewport-hill model-viewer__viewport-hill--right"></span>
        <span class="model-viewer__viewport-path"></span>
        <span class="model-viewer__viewport-tree model-viewer__viewport-tree--left"></span>
        <span class="model-viewer__viewport-tree model-viewer__viewport-tree--right"></span>
        <span class="model-viewer__viewport-flowers model-viewer__viewport-flowers--left"></span>
        <span class="model-viewer__viewport-flowers model-viewer__viewport-flowers--right"></span>
      </div>
    `;
  }

  private renderTimelineScrubber() {
    return `
      <div class="model-viewer__timeline">
        <button class="model-viewer__timeline-play" type="button" data-timeline-play aria-label="Toggle animation playback"></button>
        <span class="model-viewer__timeline-time">0s</span>
        <input type="range" min="0" max="600" value="0" step="1" data-time-scrub aria-label="Animation timeline" />
        <span class="model-viewer__timeline-time">10s</span>
      </div>
    `;
  }

  private renderInfoPanel(copy: { initialTitle: string; initialNote: string }) {
    return `
      <aside class="model-viewer__panel model-viewer__panel--right">
        <div class="model-viewer__spec-card">
          <p class="model-viewer__label">
            <span class="model-viewer__section-icon model-viewer__section-icon--notes" aria-hidden="true"></span>
            <span>Notes</span>
          </p>
          <h3 data-viewer-note-title>${copy.initialTitle}</h3>
          <p data-viewer-note-copy>${copy.initialNote}</p>
        </div>
        <div class="model-viewer__spec-list">
          ${this.renderShortcutCard("Keyboard", "keyboard", "<kbd>A</kbd> / <kbd>D</kbd> <span>Rotate</span>")}
          ${this.renderShortcutCard("Playback", "playback", "<kbd>Space</kbd> <span>Pause</span>")}
          ${this.renderShortcutCard("Switch", "switch", "<kbd>1</kbd> <span>Mossu</span> <span>·</span> <kbd>2</kbd> <span>Karu</span>")}
        </div>
        <div class="model-viewer__mascot-card" aria-hidden="true">
          <span class="model-viewer__sparkle model-viewer__sparkle--left"></span>
          <span class="model-viewer__sparkle model-viewer__sparkle--right"></span>
          ${this.renderKaruCharacter("mascot")}
        </div>
      </aside>
    `;
  }

  private renderShortcutCard(title: string, icon: string, shortcut: string) {
    return `
      <section class="model-viewer__shortcut-card">
        <p class="model-viewer__label">
          <span class="model-viewer__section-icon model-viewer__section-icon--${icon}" aria-hidden="true"></span>
          <span>${title}</span>
        </p>
        <strong>${shortcut}</strong>
      </section>
    `;
  }

  private renderKaruCharacter(size: "icon" | "mascot") {
    return `
      <span class="model-viewer__karu-character model-viewer__karu-character--${size}">
        <span class="model-viewer__karu-tail"></span>
        <span class="model-viewer__karu-body">
          <span class="model-viewer__karu-crest"></span>
          <span class="model-viewer__karu-spots"></span>
          <span class="model-viewer__karu-eye model-viewer__karu-eye--left"></span>
          <span class="model-viewer__karu-eye model-viewer__karu-eye--right"></span>
          <span class="model-viewer__karu-cheek model-viewer__karu-cheek--left"></span>
          <span class="model-viewer__karu-cheek model-viewer__karu-cheek--right"></span>
          <span class="model-viewer__karu-smile"></span>
          <span class="model-viewer__karu-arm model-viewer__karu-arm--left"></span>
          <span class="model-viewer__karu-arm model-viewer__karu-arm--right"></span>
          <span class="model-viewer__karu-foot model-viewer__karu-foot--left"></span>
          <span class="model-viewer__karu-foot model-viewer__karu-foot--right"></span>
        </span>
      </span>
    `;
  }

  private getInitialModel(): ModelViewerModel {
    const params = new URLSearchParams(window.location.search);
    const requestedModel = params.get("model") ?? params.get("modelViewer");
    return requestedModel === "karu" || requestedModel === "mossu" ? requestedModel : "mossu";
  }

  private installControls() {
    this.container.textContent = "";
    this.container.appendChild(this.root);
    this.root.addEventListener("pointerdown", this.handleUiPointerDown, true);
    this.root.addEventListener("keydown", this.handleUiKeyboardActivate, true);
    this.renderer.domElement.addEventListener("pointerdown", this.handleStagePointerDown);
    window.addEventListener("pointermove", this.handleStagePointerMove);
    window.addEventListener("pointerup", this.handleStagePointerEnd);
    window.addEventListener("pointercancel", this.handleStagePointerEnd);

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

    const togglePlayback = () => {
      this.isPlaying = !this.isPlaying;
      this.updateUiState();
    };
    this.root.querySelector<HTMLButtonElement>("[data-toggle-play]")?.addEventListener("click", togglePlayback);
    this.root.querySelector<HTMLButtonElement>("[data-timeline-play]")?.addEventListener("click", togglePlayback);

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

  private handleStagePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.dragPointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartOrbit = this.manualOrbit;
    this.canvasWrap.classList.add("is-dragging");
    this.renderer.domElement.setPointerCapture(event.pointerId);
  };

  private handleStagePointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.dragPointerId) {
      return;
    }
    const width = Math.max(1, this.canvasWrap.clientWidth);
    const dragDelta = (event.clientX - this.dragStartX) / width;
    this.manualOrbit = this.dragStartOrbit - dragDelta * Math.PI * 1.15;
  };

  private handleStagePointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== this.dragPointerId) {
      return;
    }
    this.dragPointerId = null;
    this.canvasWrap.classList.remove("is-dragging");
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };

  private switchModel(model: ModelViewerModel) {
    this.selectedModel = model;
    this.clearActiveRig();
    let rig: ViewerRig;
    if (model === "mossu") {
      rig = this.createMossuRig();
    } else {
      rig = this.createKaruRig();
    }
    this.activeRig = rig;
    this.stageRoot.add(rig.group);
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
    karu.group.scale.setScalar(1.06);
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
    karu.root.rotation.x = rolling
      ? -0.1 + Math.sin(rollSpin) * 0.36
      : sniff
        ? -0.18 + Math.sin(cycle) * 0.04
        : rest
          ? -0.18
          : -0.04 + hop * 0.1;
    karu.root.rotation.z = rolling ? Math.cos(rollSpin * 0.72) * 0.18 : Math.sin(time * 1.8) * 0.035;

    const squash = rolling ? 1.12 : rest ? 1.13 + sleepyBreath : 1 - hop * 0.08;
    const stretch = rolling ? 0.88 : rest ? 0.78 - sleepyBreath * 0.28 : 1 + hop * 0.16;
    karu.body.scale.set(1.16 * squash, 1.04 * stretch, 1.14 * (rolling ? 0.88 : 1));
    karu.body.position.y = 0.62 * scale - (rest ? 0.08 * scale : 0);

    karu.face.rotation.y = sniff ? Math.sin(time * 4.8) * 0.18 : Math.sin(time * 1.7) * 0.08;
    karu.face.position.y =
      0.73 * scale + (sniff ? Math.max(0, Math.sin(time * 5.4)) * 0.05 * scale : 0) - (rest ? 0.08 * scale : 0);
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
        MathUtils.lerp(
          homeZ * scale + (sniff && homeZ > 0 ? 0.05 * scale : 0),
          (homeZ * 0.24 + 0.04) * scale,
          rollBlend,
        ),
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
      waterMode: "onLand",
      waterDepth: 0,
      waterSurfaceY: 0,
      fallingToVoid: false,
      voidFallTime: 0,
      justLanded: false,
      justRespawned: false,
      landingImpact: 0,
      jumpChargeReleasedThisFrame: false,
      jumpChargeReleasedRatio: 0,
      airBoostFiredThisFrame: false,
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
    ground.userData.viewerGround = true;
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

    const hillMaterial = new MeshBasicMaterial({
      color: "#96d5ad",
      transparent: true,
      opacity: 0.72,
      side: DoubleSide,
    });
    [
      { x: -4.2, y: 1.12, z: -4.65, sx: 2.8, sy: 1.05, color: "#8ccba5", opacity: 0.7 },
      { x: 0.5, y: 1.36, z: -4.9, sx: 3.6, sy: 1.22, color: "#b8dfbf", opacity: 0.62 },
      { x: 4.3, y: 1.06, z: -4.55, sx: 2.5, sy: 0.95, color: "#76bf96", opacity: 0.56 },
    ].forEach((hill) => {
      const material = hillMaterial.clone();
      material.color.set(hill.color);
      material.opacity = hill.opacity;
      const mesh = new Mesh(new CircleGeometry(1, 32, 0, Math.PI), material);
      mesh.position.set(hill.x, hill.y, hill.z);
      mesh.scale.set(hill.sx, hill.sy, 1);
      this.propRoot.add(mesh);
    });

    const cloudMaterial = new MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.76,
      side: DoubleSide,
    });
    [
      { x: -2.9, y: 3.45, z: -4.2, s: 0.48 },
      { x: 2.75, y: 3.72, z: -4.8, s: 0.58 },
      { x: 4.1, y: 2.88, z: -3.95, s: 0.38 },
    ].forEach((cloud) => {
      const group = new Group();
      group.position.set(cloud.x, cloud.y, cloud.z);
      [
        { x: -0.42, y: -0.02, s: 0.72 },
        { x: 0, y: 0.16, s: 0.95 },
        { x: 0.45, y: 0, s: 0.72 },
      ].forEach((puff) => {
        const mesh = new Mesh(new CircleGeometry(cloud.s * puff.s, 18), cloudMaterial.clone());
        mesh.position.set(puff.x * cloud.s, puff.y * cloud.s, 0);
        group.add(mesh);
      });
      this.propRoot.add(group);
    });

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

    const flowerCenter = new SphereGeometry(0.035, 8, 6);
    const flowerPetal = new SphereGeometry(0.045, 8, 6);
    const flowerMaterials = {
      white: new MeshStandardMaterial({ color: "#fff8d9", roughness: 0.9 }),
      yellow: new MeshStandardMaterial({ color: "#ffd86a", roughness: 0.88 }),
      coral: new MeshStandardMaterial({ color: "#ffb27a", roughness: 0.88 }),
      center: new MeshStandardMaterial({ color: "#e3a632", roughness: 0.86 }),
    };
    [
      { x: -2.7, z: 2.1, s: 1, material: flowerMaterials.white },
      { x: -1.8, z: 2.85, s: 0.78, material: flowerMaterials.yellow },
      { x: 2.55, z: 1.85, s: 0.9, material: flowerMaterials.coral },
      { x: 3.15, z: 0.75, s: 0.72, material: flowerMaterials.yellow },
      { x: 0.7, z: 2.9, s: 0.68, material: flowerMaterials.white },
    ].forEach((flower) => {
      const group = new Group();
      group.position.set(flower.x, 0.09, flower.z);
      for (let index = 0; index < 5; index += 1) {
        const angle = (index / 5) * Math.PI * 2;
        const petal = new Mesh(flowerPetal, flower.material);
        petal.position.set(Math.cos(angle) * 0.07 * flower.s, 0.025, Math.sin(angle) * 0.07 * flower.s);
        petal.scale.setScalar(flower.s);
        group.add(petal);
      }
      const center = new Mesh(flowerCenter, flowerMaterials.center);
      center.scale.setScalar(flower.s);
      group.add(center);
      this.propRoot.add(group);
    });
  }

  private applyLighting(lighting: ModelViewerLighting) {
    const settings = {
      meadow: { background: "#dff7ff", fog: "#dff7ff", ambient: 1.15, key: 2.2, rim: 0.95, ground: "#a9d777" },
      forest: { background: "#d8f1d9", fog: "#d8f1d9", ambient: 0.96, key: 1.72, rim: 1.2, ground: "#83bd69" },
      shore: { background: "#d5fbff", fog: "#d5fbff", ambient: 1.08, key: 2.0, rim: 1.08, ground: "#b9d68f" },
      shrine: { background: "#e9edff", fog: "#e9edff", ambient: 1.04, key: 1.88, rim: 1.45, ground: "#a8cf94" },
    }[lighting];

    this.scene.background = null;
    this.scene.fog = new Fog(settings.fog, 22, 62);
    this.fillLight.intensity = settings.ambient;
    this.meadowLight.intensity = settings.key;
    this.rimLight.intensity = settings.rim;
    this.propRoot.children.forEach((child) => {
      if (child instanceof Mesh && child.userData.viewerGround) {
        const material = child.material;
        if (!Array.isArray(material) && "color" in material) {
          material.color.set(settings.ground);
        }
      }
    });
  }

  private updateCamera(dt: number) {
    const orbit = this.manualOrbit + (this.turntable ? this.time * 0.24 : 0);
    const radius = this.selectedModel === "mossu" ? 10.9 : 9.15;
    const height = this.selectedModel === "mossu" ? 5.5 : 3.18;
    this.cameraPosition.set(Math.sin(orbit) * radius, height, Math.cos(orbit) * radius);
    this.camera.position.lerp(this.cameraPosition, 1 - Math.exp(-dt * 7));
    this.camera.lookAt(this.getCameraTarget());
  }

  private getCameraTarget() {
    if (this.selectedModel === "mossu") {
      CAMERA_TARGET.set(0, 1.6, 0);
    } else {
      CAMERA_TARGET.set(0, 0.82, 0);
    }
    return CAMERA_TARGET;
  }

  private updateUiState() {
    this.root.dataset.model = this.selectedModel;
    this.root.dataset.pose = this.selectedPose;
    this.root.dataset.lighting = this.selectedLighting;
    this.root.querySelectorAll<HTMLButtonElement>("[data-model]").forEach((button) => {
      const isActive = button.dataset.model === this.selectedModel;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-pose]").forEach((button) => {
      const isActive = button.dataset.pose === this.selectedPose;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-lighting]").forEach((button) => {
      const isActive = button.dataset.lighting === this.selectedLighting;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    const heading = this.root.querySelector<HTMLElement>("[data-viewer-heading]");
    if (heading) {
      heading.textContent = this.selectedModel === "mossu" ? "Mossu" : "Karu Companion";
    }

    const playButton = this.root.querySelector<HTMLButtonElement>("[data-toggle-play]");
    if (playButton) {
      playButton.dataset.state = this.isPlaying ? "pause" : "play";
      playButton.classList.toggle("is-active", this.isPlaying);
      playButton.setAttribute("aria-pressed", String(this.isPlaying));
      playButton.setAttribute("aria-label", this.isPlaying ? "Pause animation" : "Play animation");
      const playLabel = playButton.querySelector<HTMLElement>("[data-toggle-play-label]");
      if (playLabel) {
        playLabel.textContent = this.isPlaying ? "Pause" : "Play";
      }
    }

    const timelinePlayButton = this.root.querySelector<HTMLButtonElement>("[data-timeline-play]");
    if (timelinePlayButton) {
      timelinePlayButton.setAttribute("aria-label", this.isPlaying ? "Pause animation" : "Play animation");
    }

    const turntableButton = this.root.querySelector<HTMLButtonElement>("[data-toggle-turntable]");
    if (turntableButton) {
      turntableButton.classList.toggle("is-active", this.turntable);
      turntableButton.setAttribute("aria-pressed", String(this.turntable));
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
