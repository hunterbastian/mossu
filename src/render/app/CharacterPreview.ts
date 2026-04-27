import {
  AmbientLight,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { PlayerState } from "../../simulation/gameState";
import { MossuAvatar } from "../objects/MossuAvatar";

const CAMERA_TARGET = new Vector3(0, 2.6, 0);

export class CharacterPreview {
  readonly element = document.createElement("div");

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(28, 1, 0.1, 80);
  private readonly mossu = new MossuAvatar();
  private readonly previewPlayer: PlayerState = {
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
  private readonly stageShadow: Mesh;
  private readonly cameraPosition = new Vector3();
  private time = 0;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor() {
    this.element.className = "character-preview";

    this.renderer = new WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color("#000000"), 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.domElement.className = "character-preview__canvas";
    this.element.appendChild(this.renderer.domElement);

    this.scene.add(new AmbientLight("#fefcf6", 1.15));
    this.scene.add(new DirectionalLight("#fff2d8", 1.65));
    this.scene.add(new DirectionalLight("#d7ecff", 0.85));

    const sun = this.scene.children[1] as DirectionalLight;
    sun.position.set(6, 10, 8);
    const rim = this.scene.children[2] as DirectionalLight;
    rim.position.set(-7, 8, -5);

    this.stageShadow = new Mesh(
      new CircleGeometry(4.6, 40),
      new MeshStandardMaterial({
        color: "#879f7b",
        opacity: 0.14,
        transparent: true,
        roughness: 1,
        side: DoubleSide,
      }),
    );
    this.stageShadow.rotation.x = -Math.PI * 0.5;
    this.stageShadow.position.set(0, 0.08, 0);
    this.scene.add(this.stageShadow);

    this.mossu.group.position.set(0, 0, 0);
    this.scene.add(this.mossu.group);

    this.camera.position.set(0, 7.2, 15.2);
    this.camera.lookAt(CAMERA_TARGET);
  }

  update(dt: number, visible: boolean) {
    if (!visible) {
      return;
    }

    this.time += dt;
    this.resizeIfNeeded();

    this.previewPlayer.position.set(0, 0, 0);
    this.previewPlayer.velocity.set(0.8 + Math.sin(this.time * 1.8) * 0.25, 0, 3.1);
    this.previewPlayer.heading = Math.sin(this.time * 0.45) * 0.2;
    this.previewPlayer.rolling = Math.sin(this.time * 0.55) > 0.82;
    this.previewPlayer.rollingBoostActive = this.previewPlayer.rolling && Math.sin(this.time * 1.3) > 0.3;
    this.previewPlayer.rollHoldSeconds = this.previewPlayer.rolling ? 3.2 : 0;
    this.previewPlayer.rollModeReady = this.previewPlayer.rollHoldSeconds >= 3;
    this.previewPlayer.grounded = true;
    this.previewPlayer.swimming = false;
    this.previewPlayer.waterDepth = 0;
    this.previewPlayer.waterSurfaceY = 0;
    this.previewPlayer.fallingToVoid = false;
    this.previewPlayer.justLanded = false;
    this.previewPlayer.justRespawned = false;
    this.previewPlayer.landingImpact = 0;
    this.mossu.update(this.previewPlayer, dt);

    this.stageShadow.scale.setScalar(1 + Math.sin(this.time * 1.1) * 0.04);
    this.cameraPosition.set(
      Math.sin(this.time * 0.22) * 1.1,
      7.2 + Math.sin(this.time * 0.4) * 0.18,
      15.2,
    );
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(CAMERA_TARGET);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }

  private resizeIfNeeded() {
    const width = Math.max(1, Math.round(this.element.clientWidth));
    const height = Math.max(1, Math.round(this.element.clientHeight));
    if (width === this.lastWidth && height === this.lastHeight) {
      return;
    }

    this.lastWidth = width;
    this.lastHeight = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
