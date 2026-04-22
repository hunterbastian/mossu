import {
  Clock,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { GameState } from "../../simulation/gameState";
import { InputController, InputSnapshot } from "../../simulation/input";
import { sampleWindField } from "../../simulation/world";
import { ViewMode } from "../../simulation/viewMode";
import { FollowCamera } from "./FollowCamera";
import { WorldRenderer } from "../world/WorldRenderer";

const PAUSED_INPUT: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  jumpHeld: false,
  jumpPressed: false,
  shiftPressed: false,
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
  private readonly clock = new Clock();
  private readonly hud: HTMLDivElement;
  private viewMode: ViewMode = "third_person";

  private raf = 0;
  private readonly statusValues = {
    zone: document.createElement("p"),
    orb: document.createElement("p"),
    landmark: document.createElement("p"),
    wind: document.createElement("p"),
    ability: document.createElement("div"),
    objectiveTitle: document.createElement("h1"),
    objectiveBody: document.createElement("p"),
    hint: document.createElement("div"),
  };

  constructor(private readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);

    this.followCamera = new FollowCamera(this.renderer.domElement);
    this.world = new WorldRenderer(this.scene);
    this.hud = this.buildHud();
    this.container.appendChild(this.hud);

    window.addEventListener("resize", this.handleResize);
    this.handleResize();
  }

  start() {
    this.clock.start();
    const loop = () => {
      const dt = Math.min(0.033, this.clock.getDelta());
      const elapsed = this.clock.elapsedTime;
      this.tick(dt, elapsed);
      this.raf = window.requestAnimationFrame(loop);
    };
    loop();
  }

  dispose() {
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.handleResize);
    this.input.dispose();
    this.followCamera.dispose();
    this.renderer.dispose();
  }

  private tick(dt: number, elapsed: number) {
    const input = this.input.sample();
    if (input.mapTogglePressed) {
      this.setViewMode(this.viewMode === "third_person" ? "map_lookdown" : "third_person");
    } else if (this.viewMode === "map_lookdown" && input.escapePressed) {
      this.setViewMode("third_person");
    }

    if (this.viewMode === "third_person") {
      this.state.update(dt, input, this.followCamera.getYaw());
    } else {
      this.state.update(0, PAUSED_INPUT, this.followCamera.getYaw());
    }

    this.followCamera.update(this.state.frame.player, dt);
    this.world.update(this.state.frame, elapsed, dt, this.viewMode === "map_lookdown");
    this.updateHud();
    this.renderer.render(this.scene, this.followCamera.camera);
  }

  private updateHud() {
    const frame = this.state.frame;
    const orbCount = frame.save.collectedOrbIds.size;
    const wind = sampleWindField(frame.player.position.x, frame.player.position.z, frame.player.position.y);
    const isMapMode = this.viewMode === "map_lookdown";

    this.statusValues.zone.textContent = this.prettyZone(frame.currentZone);
    this.statusValues.orb.textContent = `${orbCount} / 14`;
    this.statusValues.landmark.textContent = frame.currentLandmark;
    this.statusValues.wind.textContent = `${Math.round(wind.strength * 100)}%`;
    this.hud.classList.toggle("hud--map", isMapMode);

    if (isMapMode) {
      this.statusValues.objectiveTitle.textContent = "World Map";
      this.statusValues.objectiveBody.textContent = "Mossu glows blue. Moss Crown Shrine glows gold. M or Esc returns to the trail.";
      this.statusValues.ability.textContent = frame.save.unlockedAbilities.has("breeze_float")
        ? "Breeze Float is ready for ridge crossings and alpine shortcuts."
        : "Collect 8 light-orbs to wake Breeze Float before pushing deeper into the mountains.";
      this.statusValues.hint.innerHTML = "<strong>Map View</strong> Full world lookdown &nbsp; <strong>Close</strong> M or Esc";
      return;
    }

    this.statusValues.objectiveTitle.textContent = frame.objective.title;
    this.statusValues.objectiveBody.textContent = frame.objective.body;
    this.statusValues.ability.textContent = frame.save.unlockedAbilities.has("breeze_float")
      ? "Breeze Float awakened: hold Space in the air to drift across ravines."
      : "Breeze Float asleep: collect 8 light-orbs to unlock airy traversal.";
    this.statusValues.hint.innerHTML = this.followCamera.isPointerLocked()
      ? "<strong>Move</strong> WASD or arrows &nbsp; <strong>Roll Toggle</strong> Shift &nbsp; <strong>Jump</strong> Space &nbsp; <strong>Camera</strong> mouse look &nbsp; <strong>Map</strong> M &nbsp; <strong>Release</strong> Esc"
      : "<strong>Click</strong> capture mouse &nbsp; <strong>Move</strong> WASD or arrows &nbsp; <strong>Roll Toggle</strong> Shift &nbsp; <strong>Jump</strong> Space &nbsp; <strong>Map</strong> M";
  }

  private prettyZone(zone: string) {
    return zone.replace("_", " ");
  }

  private buildHud() {
    const hud = document.createElement("div");
    hud.className = "hud";

    const top = document.createElement("div");
    top.className = "hud-top";

    const objective = document.createElement("section");
    objective.className = "objective-chip";
    const eyebrow = document.createElement("p");
    eyebrow.className = "objective-chip__eyebrow";
    eyebrow.textContent = "Mossu";
    this.statusValues.objectiveTitle.className = "objective-chip__title";
    this.statusValues.objectiveBody.className = "objective-chip__body";
    objective.append(eyebrow, this.statusValues.objectiveTitle, this.statusValues.objectiveBody);

    const status = document.createElement("section");
    status.className = "status-strip";
    status.append(
      this.buildMetric("Zone", this.statusValues.zone),
      this.buildMetric("Orbs", this.statusValues.orb),
      this.buildMetric("Landmark", this.statusValues.landmark),
      this.buildMetric("Wind", this.statusValues.wind),
    );

    const bottom = document.createElement("div");
    bottom.className = "hud-bottom";
    this.statusValues.hint.className = "hint-chip";

    this.statusValues.ability.className = "ability-pill";
    bottom.append(this.statusValues.hint, this.statusValues.ability);
    top.append(objective, status);
    hud.append(top, bottom);
    return hud;
  }

  private buildMetric(label: string, value: HTMLElement) {
    const wrapper = document.createElement("div");
    wrapper.className = "status-metric";
    const labelNode = document.createElement("p");
    labelNode.className = "status-label";
    labelNode.textContent = label;
    value.className = "status-value";
    wrapper.append(labelNode, value);
    return wrapper;
  }

  private handleResize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.followCamera.resize(window.innerWidth, window.innerHeight);
  };

  private setViewMode(viewMode: ViewMode) {
    this.viewMode = viewMode;
    this.followCamera.setViewMode(viewMode);
  }
}
