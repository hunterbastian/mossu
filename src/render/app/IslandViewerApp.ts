import {
  AmbientLight,
  BufferAttribute,
  BackSide,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";

import {
  MOSSU_PLAYFIELD_EXTENT,
  RIVER_BRANCH_SEGMENTS,
  sampleBiomeZone,
  sampleBaseTerrainHeight,
  sampleHabitatLayer,
  sampleIslandBoundaryPoint,
  sampleIslandEdgeFactor,
  sampleRiverCenter,
  sampleRiverChannelCenter,
  sampleRiverWetness,
  sampleRouteReadabilityClearing,
  sampleStartingWaterWetness,
  sampleTerrainHeight,
  worldLandmarks,
  worldMapMarkers,
} from "../../simulation/world";
import { makeTerrainMesh } from "../world/terrainMesh";
import { buildFloatingIslandShell, ISLAND_EDGE_WATERFALL_TURNS } from "../world/worldSetPieces";
import { buildHighlandWaterways, WaterSystem } from "../world/waterSystem";
import { buildAtlasOceanDiscGeometry, buildAtlasOceanMaterial } from "./islandViewerOcean";

type IslandViewPreset = "overview" | "aerial" | "topdown" | "profile" | "under" | "custom";
type AtlasLayerId = "terrain" | "biomes" | "shell" | "ocean" | "water" | "guides" | "markers" | "falls";

const ATLAS_HIERARCHY_FOLDERS = [
  "Terrain",
  "Water",
  "Forests",
  "Meadows",
  "Rocks",
  "Landmarks",
  "Lighting",
  "Debug/Blockout",
] as const;
type AtlasHierarchyFolder = (typeof ATLAS_HIERARCHY_FOLDERS)[number];

const BIOME_LAYOUT_NOTES = [
  "A taller 2-3 peak mountain crown and rear skyline sit north/high center and feed the stepped waterfall source.",
  "Evergreen bands wrap the mid-slopes and cliff lips while leaving the route and river readable.",
  "A much larger west great lake anchors the lower island, with a silver-braid inlet and visible rock shelves.",
  "The reference aerial read is a clean meadow plateau with a visible walking loop, sheer cliff walls, and ocean surf contact.",
  "Open meadows now break into a south/front stack of terrace shelves, cove cuts, and a stronger hero waterfall face instead of one broad plate.",
  "Freshwater reads as one high source, a staged central cascade, a west lake basin, and a lower outlet to the sea.",
  "Warm stratified cliffs, rim groves, mossy hang accents, and larger front waterfalls define the floating-island silhouette.",
] as const;

const OCEAN_Y = -352;
const CAMERA_MIN_DISTANCE = 320;
const CAMERA_MAX_DISTANCE = 3200;
const CAMERA_MIN_PITCH = -0.12;
const CAMERA_MAX_PITCH = 1.48;
const FLY_MIN_PITCH = -1.1;
const FLY_MAX_PITCH = 1.1;
const FLY_LOOK_DISTANCE = 640;
const FLY_BASE_SPEED = 260;
const ROUTE_HEIGHT_OFFSET = 9;
const SKY_DOME_RADIUS = 4200;

const VIEW_PRESETS: Record<Exclude<IslandViewPreset, "custom">, {
  yaw: number;
  pitch: number;
  distance: number;
  target: Vector3;
}> = {
  overview: {
    yaw: Math.PI,
    pitch: 0.82,
    distance: 2180,
    target: new Vector3(-28, -18, -92),
  },
  aerial: {
    yaw: Math.PI,
    pitch: 0.62,
    distance: 2180,
    target: new Vector3(-10, -28, -44),
  },
  topdown: {
    yaw: -0.04,
    pitch: 1.42,
    distance: 2080,
    target: new Vector3(0, 18, 72),
  },
  profile: {
    yaw: -0.94,
    pitch: 0.18,
    distance: 1580,
    target: new Vector3(4, -210, 80),
  },
  under: {
    yaw: 0.54,
    pitch: -0.05,
    distance: 1320,
    target: new Vector3(0, -160, 72),
  },
};

type NamedViewPreset = keyof typeof VIEW_PRESETS;

const buildAtlasSkyDome = () => {
  const geometry = new SphereGeometry(SKY_DOME_RADIUS, 48, 28);
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uTopColor: { value: new Color("#3ec3ff") },
      uMidColor: { value: new Color("#b7f4ff") },
      uHorizonColor: { value: new Color("#edfff1") },
      uLowerColor: { value: new Color("#86e8e4") },
      uSunDirection: { value: new Vector3(-0.74, 0.18, 0.65).normalize() },
      uSunHazeColor: { value: new Color("#ffd39a") },
      uPeachHazeColor: { value: new Color("#ffd6ad") },
      uCreamHazeColor: { value: new Color("#fff4d2") },
      uCloudLightColor: { value: new Color("#fff9e9") },
      uCloudShadowColor: { value: new Color("#dff6ff") },
    },
    vertexShader: `
      varying vec3 vWorldDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uLowerColor;
      uniform vec3 uSunDirection;
      uniform vec3 uSunHazeColor;
      uniform vec3 uPeachHazeColor;
      uniform vec3 uCreamHazeColor;
      uniform vec3 uCloudLightColor;
      uniform vec3 uCloudShadowColor;
      varying vec3 vWorldDirection;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i += 1) {
          value += amplitude * noise(p);
          p = p * 2.03 + vec2(17.3, 9.1);
          amplitude *= 0.52;
        }
        return value;
      }

      void main() {
        vec3 dir = normalize(vWorldDirection);
        float skyLift = smoothstep(-0.1, 0.58, dir.y);
        vec3 color = mix(uLowerColor, uMidColor, skyLift);
        color = mix(color, uTopColor, smoothstep(0.38, 1.0, dir.y));

        float sunDot = max(dot(dir, uSunDirection), 0.0);
        float sunHaze = pow(sunDot, 2.2) * smoothstep(-0.22, 0.46, dir.y) * (1.0 - smoothstep(0.82, 1.0, dir.y));
        float afternoonWash = pow(sunDot, 5.0) * smoothstep(-0.36, 0.18, dir.y);
        color = mix(color, uSunHazeColor, sunHaze * 0.28 + afternoonWash * 0.16);

        float horizonCore = smoothstep(-0.28, 0.04, dir.y) * (1.0 - smoothstep(0.16, 0.42, dir.y));
        float horizonShelf = smoothstep(-0.3, 0.16, dir.y) * (1.0 - smoothstep(0.3, 0.64, dir.y));
        float horizonGrain = fbm(vec2(atan(dir.z, dir.x) * 1.25 + uTime * 0.01, dir.y * 4.4 + 7.0));
        color = mix(color, uHorizonColor, horizonCore * (0.82 + horizonGrain * 0.14));
        color = mix(color, vec3(0.86, 0.99, 0.97), horizonShelf * 0.22);

        float azimuth = atan(dir.z, dir.x);
        vec3 horizonDir = normalize(vec3(cos(azimuth), 0.12, sin(azimuth)));
        float sunFacing = smoothstep(-0.08, 0.78, dot(horizonDir, uSunDirection));
        float creamHaze = smoothstep(-0.34, -0.1, dir.y) * (1.0 - smoothstep(0.18, 0.46, dir.y));
        float peachHaze = smoothstep(-0.18, 0.04, dir.y) * (1.0 - smoothstep(0.2, 0.5, dir.y));
        float hazeBrush = 0.78 + horizonGrain * 0.22;
        color = mix(color, uCreamHazeColor, creamHaze * hazeBrush * 0.54);
        color = mix(color, uPeachHazeColor, peachHaze * hazeBrush * (0.32 + sunFacing * 0.28));

        float lowLayerMask = smoothstep(-0.12, 0.02, dir.y) * (1.0 - smoothstep(0.22, 0.42, dir.y));
        float lowLayerNoise = fbm(vec2(azimuth * 1.18 + uTime * 0.006, dir.y * 7.4 + 2.0));
        float lowCloud = lowLayerMask * smoothstep(0.26, 0.56, lowLayerNoise);
        vec3 lowCloudColor = mix(uCloudShadowColor, uCloudLightColor, 0.58 + sunFacing * 0.32);
        color = mix(color, lowCloudColor, lowCloud * 0.62);

        float rearLayerMask = smoothstep(0.0, 0.1, dir.y) * (1.0 - smoothstep(0.42, 0.72, dir.y));
        float rearLayerNoise = fbm(vec2(azimuth * 2.08 - uTime * 0.0038, dir.y * 10.2 + 8.0));
        float rearCloud = rearLayerMask * smoothstep(0.28, 0.62, rearLayerNoise);
        vec3 rearCloudColor = mix(vec3(0.86, 0.96, 1.0), uCloudLightColor, 0.42 + sunFacing * 0.28);
        color = mix(color, rearCloudColor, rearCloud * 0.48);

        float nearLayerMask = smoothstep(0.12, 0.26, dir.y) * (1.0 - smoothstep(0.6, 0.88, dir.y));
        float nearLayerNoise = fbm(vec2(azimuth * 2.9 + uTime * 0.0105, dir.y * 8.6 + 15.0));
        float nearCloud = nearLayerMask * smoothstep(0.3, 0.64, nearLayerNoise);
        color = mix(color, uCloudLightColor, nearCloud * (0.34 + sunFacing * 0.18));

        vec2 skyUv = dir.xz * (1.7 / max(0.24, dir.y + 0.42));
        float wisp = fbm(skyUv * vec2(0.52, 0.18) + vec2(uTime * 0.012, 6.0));
        float highCloud = smoothstep(0.32, 0.62, wisp) * smoothstep(-0.06, 0.32, dir.y) * (1.0 - smoothstep(0.86, 1.0, dir.y));
        color = mix(color, vec3(0.95, 0.99, 1.0), highCloud * 0.36);

        float paintedBandNoise = fbm(vec2(azimuth * 3.8 - uTime * 0.007, dir.y * 5.2 + 20.0));
        float paintedBandMask = smoothstep(0.18, 0.38, dir.y) * (1.0 - smoothstep(0.74, 0.96, dir.y));
        float paintedBand = paintedBandMask * smoothstep(0.34, 0.66, paintedBandNoise);
        vec3 paintedCloudColor = mix(vec3(0.9, 0.98, 1.0), uCloudLightColor, 0.48 + sunFacing * 0.28);
        color = mix(color, paintedCloudColor, paintedBand * 0.34);

        float lowBankNoise = fbm(vec2(atan(dir.z, dir.x) * 2.2, dir.y * 8.0) + vec2(uTime * 0.018, 2.0));
        float lowCloudBank = horizonShelf * smoothstep(0.46, 0.78, lowBankNoise);
        color = mix(color, uCloudLightColor, lowCloudBank * 0.14);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new Mesh(geometry, material);
  sky.name = "Island atlas sky dome";
  sky.renderOrder = -40;
  sky.frustumCulled = false;
  return sky;
};

const buildAtlasCloudBands = () => {
  const group = new Group();
  group.name = "Island atlas drifting cloud banks";

  const creamCloudMaterial = new MeshBasicMaterial({
    color: 0xfff8e6,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const peachCloudMaterial = new MeshBasicMaterial({
    color: 0xffe2c4,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const blueShadowMaterial = new MeshBasicMaterial({
    color: 0xd7f3ff,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });

  const addLobe = (
    bank: Group,
    axis: "x" | "z",
    along: number,
    lift: number,
    depth: number,
    width: number,
    height: number,
    thickness: number,
    material: MeshBasicMaterial,
  ) => {
    const lobe = new Mesh(new SphereGeometry(1, 18, 9), material);
    if (axis === "x") {
      lobe.position.set(along, lift, depth);
      lobe.scale.set(width, height, thickness);
    } else {
      lobe.position.set(depth, lift, along);
      lobe.scale.set(thickness, height, width);
    }
    lobe.renderOrder = -28;
    lobe.frustumCulled = false;
    bank.add(lobe);
  };

  const addBank = (
    x: number,
    y: number,
    z: number,
    axis: "x" | "z",
    size: number,
    phase: number,
    speed: number,
    drift: number,
  ) => {
    const bank = new Group();
    bank.position.set(x, y, z);
    bank.userData.basePosition = bank.position.clone();
    bank.userData.phase = phase;
    bank.userData.speed = speed;
    bank.userData.drift = drift;
    bank.frustumCulled = false;

    addLobe(bank, axis, -0.46 * size, -22, -10, 0.28 * size, 0.075 * size, 0.12 * size, blueShadowMaterial);
    addLobe(bank, axis, 0.02 * size, -24, -2, 0.38 * size, 0.07 * size, 0.14 * size, blueShadowMaterial);
    addLobe(bank, axis, 0.44 * size, -20, 4, 0.3 * size, 0.06 * size, 0.12 * size, blueShadowMaterial);
    addLobe(bank, axis, -0.36 * size, 4, 8, 0.24 * size, 0.095 * size, 0.1 * size, peachCloudMaterial);
    addLobe(bank, axis, -0.11 * size, 20, -4, 0.3 * size, 0.13 * size, 0.12 * size, creamCloudMaterial);
    addLobe(bank, axis, 0.18 * size, 12, 12, 0.34 * size, 0.12 * size, 0.13 * size, peachCloudMaterial);
    addLobe(bank, axis, 0.42 * size, 24, -8, 0.2 * size, 0.095 * size, 0.1 * size, creamCloudMaterial);
    addLobe(bank, axis, 0.68 * size, 3, 6, 0.18 * size, 0.07 * size, 0.09 * size, creamCloudMaterial);
    group.add(bank);
  };

  [
    [-760, 250, 1460, "x", 760, 0.2, 0.033, 36],
    [70, 262, 1510, "x", 920, 2.4, 0.026, 46],
    [900, 246, 1380, "x", 620, 4.5, 0.03, 40],
    [-900, 282, -1530, "x", 760, 0.8, 0.018, 38],
    [20, 308, -1580, "x", 980, 2.2, 0.02, 52],
    [900, 298, -1640, "x", 760, 5.3, 0.016, 50],
    [-1640, 282, -260, "z", 860, 4.1, 0.017, 54],
    [1640, 286, 160, "z", 860, 2.9, 0.019, 52],
  ].forEach(([x, y, z, axis, size, phase, speed, drift]) => {
    addBank(
      Number(x),
      Number(y),
      Number(z),
      axis as "x" | "z",
      Number(size),
      Number(phase),
      Number(speed),
      Number(drift),
    );
  });

  return group;
};

const makeLine = (points: Vector3[], color: Color | string | number, opacity: number, name: string) => {
  const geometry = new BufferGeometry().setFromPoints(points);
  const material = new LineBasicMaterial({
    color,
    depthWrite: false,
    transparent: opacity < 1,
    opacity,
  });
  const line = new Line(geometry, material);
  line.name = name;
  line.frustumCulled = false;
  return line;
};

const setDisposingMaterial = (material: Material | Material[], disposed: Set<Material>) => {
  if (Array.isArray(material)) {
    material.forEach((entry) => setDisposingMaterial(entry, disposed));
    return;
  }
  if (disposed.has(material)) {
    return;
  }
  disposed.add(material);
  material.dispose();
};

const isUiTypingTarget = (target: EventTarget | null) => {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
};

export class IslandViewerApp {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly statsNode: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(34, 1, 1, 3600);
  private readonly skyDome = buildAtlasSkyDome();
  private readonly cloudBands = buildAtlasCloudBands();
  private readonly cleanCapture = new URLSearchParams(window.location.search).has("cleanCapture");
  private readonly referenceAerialCapture =
    new URLSearchParams(window.location.search).has("referenceAerial") ||
    new URLSearchParams(window.location.search).has("aerialCapture");
  private readonly initialViewPreset: NamedViewPreset = this.referenceAerialCapture ? "aerial" : "overview";
  private readonly terrain = makeTerrainMesh({ edgeFragmentClip: true });
  private readonly waterSystem = new WaterSystem();
  private readonly markerRoot = new Group();
  private readonly waterfallMarkerRoot = new Group();
  private readonly markerMeshes = new Map<string, Mesh>();
  private readonly layerObjects = new Map<AtlasLayerId, Object3D>();
  private readonly hierarchyGroups = new Map<AtlasHierarchyFolder, Group>();
  private readonly layerVisibility: Record<AtlasLayerId, boolean> = {
    terrain: true,
    biomes: true,
    shell: true,
    ocean: true,
    water: true,
    guides: false,
    markers: false,
    falls: true,
  };
  private readonly panRight = new Vector3();
  private readonly panForward = new Vector3();
  private readonly flyPosition = new Vector3();
  private readonly flyForward = new Vector3();
  private readonly flyRight = new Vector3();
  private readonly flyVelocity = new Vector3();
  private readonly activeFlyKeys = new Set<string>();
  private readonly landmarkMarkerMaterial = new MeshBasicMaterial({ color: 0xfff4a8, depthWrite: false });
  private readonly selectedMarkerMaterial = new MeshBasicMaterial({ color: 0xff8f62, depthWrite: false });
  private readonly atlasOceanMaterial = buildAtlasOceanMaterial();

  private animationFrame = 0;
  private elapsed = 0;
  private dragMode: "orbit" | "pan" | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private width = 0;
  private height = 0;
  private yaw = VIEW_PRESETS[this.initialViewPreset].yaw;
  private pitch = VIEW_PRESETS[this.initialViewPreset].pitch;
  private distance = VIEW_PRESETS[this.initialViewPreset].distance;
  private target = VIEW_PRESETS[this.initialViewPreset].target.clone();
  private flyYaw = VIEW_PRESETS[this.initialViewPreset].yaw;
  private flyPitch = VIEW_PRESETS[this.initialViewPreset].pitch;
  private flyMode = false;
  private selectedLandmarkId = "start-burrow";
  private viewPreset: IslandViewPreset = this.initialViewPreset;

  constructor(private readonly container: HTMLElement) {
    this.root = document.createElement("main");
    this.root.className = this.referenceAerialCapture
      ? "island-viewer island-viewer--reference-capture"
      : "island-viewer";
    this.root.innerHTML = this.renderShell();

    const stage = this.root.querySelector<HTMLElement>("[data-island-stage]");
    const statsNode = this.root.querySelector<HTMLElement>("[data-island-stats]");
    if (!stage || !statsNode) {
      throw new Error("Island viewer shell failed to mount.");
    }
    this.stage = stage;
    this.statsNode = statsNode;

    this.renderer = new WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x86ddff, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.2));
    this.renderer.domElement.className = "island-viewer__canvas";
    this.renderer.domElement.tabIndex = 0;
    this.stage.appendChild(this.renderer.domElement);

    this.container.appendChild(this.root);
    this.buildScene();
    this.installControls();
    this.applyPreset(this.initialViewPreset);
    this.focusLandmark(this.selectedLandmarkId, { keepCamera: true });
    this.resize();
    this.renderFrame();
  }

  start() {
    if (this.animationFrame !== 0) {
      return;
    }
    const tick = () => {
      this.animationFrame = window.requestAnimationFrame(tick);
      this.advanceTime(1000 / 60);
    };
    this.animationFrame = window.requestAnimationFrame(tick);
  }

  stop() {
    if (this.animationFrame === 0) {
      return;
    }
    window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }

  advanceTime(deltaMs: number) {
    this.elapsed += MathUtils.clamp(deltaMs, 0, 100) / 1000;
    this.updateFlyMovement(MathUtils.clamp(deltaMs, 0, 100) / 1000);
    this.waterSystem.update(this.elapsed, true);
    this.updateMarkerPulse();
    this.resize();
    this.renderFrame();
  }

  renderGameToText() {
    const position = this.terrain.geometry.getAttribute("position");
    const terrainTriangles = this.terrain.geometry.index
      ? this.terrain.geometry.index.count / 3
      : position.count / 3;

    return JSON.stringify({
      mode: "island_viewer",
      viewPreset: this.viewPreset,
      referenceAerialCapture: this.referenceAerialCapture,
      markerCount: worldLandmarks.length,
      waterfallMarkers: ISLAND_EDGE_WATERFALL_TURNS.length,
      selectedLandmark: this.selectedLandmarkId,
      flyMode: this.flyMode,
      terrainVertices: position.count,
      terrainTriangles,
      waterSurfaces: this.waterSystem.group.children.length,
      visibleLayers: Object.entries(this.layerVisibility)
        .filter(([, visible]) => visible)
        .map(([layer]) => layer),
      hierarchy: this.getHierarchySnapshot(),
      biomeLayout: BIOME_LAYOUT_NOTES,
      camera: {
        distance: Math.round(this.distance),
        pitch: Number(this.pitch.toFixed(3)),
        yaw: Number(this.yaw.toFixed(3)),
        target: {
          x: Math.round(this.target.x),
          y: Math.round(this.target.y),
          z: Math.round(this.target.z),
        },
      },
      maxDistance: CAMERA_MAX_DISTANCE,
    });
  }

  dispose() {
    this.stop();
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    window.removeEventListener("blur", this.handleWindowBlur);
    this.root.removeEventListener("click", this.handleClick);
    this.root.removeEventListener("change", this.handleChange);
    this.renderer.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.removeEventListener("wheel", this.handleWheel);
    this.renderer.domElement.removeEventListener("contextmenu", this.preventContextMenu);

    const disposedMaterials = new Set<Material>();
    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        setDisposingMaterial(mesh.material, disposedMaterials);
      }
    });
    this.renderer.dispose();
    this.root.remove();
  }

  private renderShell() {
    const landmarkButtons = worldLandmarks
      .map((landmark) => `
        <button class="island-viewer__marker-button" type="button" data-landmark-id="${landmark.id}">
          <span>${landmark.title}</span>
          <small>${Math.round(landmark.position.x)}, ${Math.round(landmark.position.z)}</small>
        </button>
      `)
      .join("");

    return `
      <section class="island-viewer__stage" data-island-stage aria-label="Floating island atlas"></section>
      <aside class="island-viewer__panel" aria-label="Island atlas controls">
        <a class="island-viewer__back" href="./">Back to Mossu</a>
        <header class="island-viewer__header">
          <p>Debug atlas</p>
          <h1>Floating Island</h1>
        </header>
        <div class="island-viewer__toolbar" role="group" aria-label="View presets">
          <button class="island-viewer__tool-button" type="button" data-view-preset="overview">Overview</button>
          <button class="island-viewer__tool-button" type="button" data-view-preset="aerial">Aerial</button>
          <button class="island-viewer__tool-button" type="button" data-view-preset="topdown">Top</button>
          <button class="island-viewer__tool-button" type="button" data-view-preset="profile">Profile</button>
          <button class="island-viewer__tool-button" type="button" data-view-preset="under">Under</button>
        </div>
        <div class="island-viewer__modebar" role="group" aria-label="Navigation mode">
          <button class="island-viewer__fly-button" type="button" data-toggle-fly aria-pressed="false">
            <span data-fly-label>Fly WASD</span>
            <small>WASD + QE</small>
          </button>
          <span class="island-viewer__zoom-readout">Zoom out to ${CAMERA_MAX_DISTANCE}m</span>
        </div>
        <div class="island-viewer__layers" role="group" aria-label="Atlas layers">
          ${this.renderLayerToggle("terrain", "Terrain")}
          ${this.renderLayerToggle("biomes", "Biomes")}
          ${this.renderLayerToggle("shell", "Rocks")}
          ${this.renderLayerToggle("ocean", "Ocean")}
          ${this.renderLayerToggle("water", "Water")}
          ${this.renderLayerToggle("guides", "Guides")}
          ${this.renderLayerToggle("markers", "Landmarks")}
          ${this.renderLayerToggle("falls", "Falls")}
        </div>
        <nav class="island-viewer__landmarks" aria-label="Landmarks">
          ${landmarkButtons}
        </nav>
      </aside>
      <output class="island-viewer__stats" data-island-stats aria-live="polite"></output>
    `;
  }

  private renderLayerToggle(id: AtlasLayerId, label: string) {
    const checked = this.layerVisibility[id] ? " checked" : "";
    return `
      <label class="island-viewer__layer-toggle" data-layer-toggle="${id}">
        <input type="checkbox" data-layer-id="${id}"${checked}>
        <span>${label}</span>
      </label>
    `;
  }

  private buildScene() {
    this.scene.background = null;
    this.scene.fog = new Fog(0xc8f4ee, 2480, 4300);

    const lightingFolder = this.createHierarchyFolder("Lighting");
    const ambientLight = new AmbientLight(0xf6fbff, 1.8);
    ambientLight.name = "Lighting / warm atlas ambient fill";
    lightingFolder.add(ambientLight);

    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.name = "Lighting / late-afternoon key light";
    keyLight.position.set(-260, 420, 180);
    lightingFolder.add(keyLight);

    const rimLight = new DirectionalLight(0x9fd8ff, 1.35);
    rimLight.name = "Lighting / cool ocean rim light";
    rimLight.position.set(320, 220, -360);
    lightingFolder.add(rimLight);

    lightingFolder.add(this.skyDome);
    if (!this.cleanCapture) {
      lightingFolder.add(this.cloudBands);
    }
    this.scene.add(lightingFolder);

    const terrainFolder = this.createHierarchyFolder("Terrain");
    this.terrain.name = "Terrain / playable sampled heightfield mesh";
    this.terrain.receiveShadow = false;
    terrainFolder.add(this.terrain);
    this.scene.add(this.registerLayer("terrain", terrainFolder));

    const biomeFolder = new Group();
    biomeFolder.name = "Biome Layout / first-pass terrain readability masses";
    biomeFolder.add(this.buildMeadowFolder());
    biomeFolder.add(this.buildForestFolder());
    this.scene.add(this.registerLayer("biomes", biomeFolder));

    this.scene.add(this.registerLayer("shell", this.buildRockFolder()));

    const waterFolder = this.createHierarchyFolder("Water");
    const oceanLayer = new Group();
    oceanLayer.name = "Water / ocean plane below island";
    oceanLayer.add(this.buildOceanPlane());
    waterFolder.add(this.registerLayer("ocean", oceanLayer));

    this.waterSystem.addWaterGroup(buildHighlandWaterways());
    this.waterSystem.update(0, true);
    this.waterSystem.group.name = "Water / river, lake basin, and highland source";
    const waterwaysLayer = new Group();
    waterwaysLayer.name = "Water / visible rivers and lakes";
    waterwaysLayer.add(this.waterSystem.group);
    waterFolder.add(this.registerLayer("water", waterwaysLayer));
    this.scene.add(waterFolder);

    const landmarkFolder = this.createHierarchyFolder("Landmarks");
    landmarkFolder.add(this.registerLayer("markers", this.buildMarkers()));
    this.scene.add(landmarkFolder);

    const debugFolder = this.createHierarchyFolder("Debug/Blockout");
    const guides = this.buildGuideLines();
    guides.add(this.buildBlockoutAnchors());
    debugFolder.add(this.registerLayer("guides", guides));
    debugFolder.add(this.registerLayer("falls", this.buildWaterfallMarkers()));
    this.scene.add(debugFolder);
  }

  private registerLayer(id: AtlasLayerId, object: Object3D) {
    this.layerObjects.set(id, object);
    object.visible = this.layerVisibility[id];
    return object;
  }

  private createHierarchyFolder(name: AtlasHierarchyFolder) {
    const folder = new Group();
    folder.name = name;
    this.hierarchyGroups.set(name, folder);
    return folder;
  }

  private getHierarchySnapshot() {
    return ATLAS_HIERARCHY_FOLDERS.map((name) => ({
      name,
      children: this.hierarchyGroups.get(name)?.children.map((child) => child.name).filter(Boolean) ?? [],
    }));
  }

  private buildOceanPlane() {
    const geometry = buildAtlasOceanDiscGeometry(MOSSU_PLAYFIELD_EXTENT * 26, 224, 28);
    const ocean = new Mesh(geometry, this.atlasOceanMaterial);
    ocean.name = "Atlas visible ocean below";
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = OCEAN_Y;
    ocean.renderOrder = -12;
    return ocean;
  }

  private buildConformingPatch(
    x: number,
    z: number,
    radiusX: number,
    radiusZ: number,
    rotation: number,
    material: MeshBasicMaterial,
    name: string,
    lift = 0.7,
    renderOrder = 2,
  ) {
    const geometry = new CircleGeometry(1, 56);
    const positions = geometry.getAttribute("position") as BufferAttribute;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index) * radiusX;
      const localZ = positions.getY(index) * radiusZ;
      const worldX = x + localX * cos - localZ * sin;
      const worldZ = z + localX * sin + localZ * cos;
      positions.setXYZ(index, worldX, sampleTerrainHeight(worldX, worldZ) + lift, worldZ);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    const patch = new Mesh(geometry, material);
    patch.name = name;
    patch.renderOrder = renderOrder;
    patch.frustumCulled = false;
    return patch;
  }

  private buildMeadowFolder() {
    const meadows = this.createHierarchyFolder("Meadows");
    // Broad conforming patches mark the intended exploration bowls; final prop density comes later.
    const meadowMaterial = new MeshBasicMaterial({
      color: 0xdad870,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
    });
    const shoreMaterial = new MeshBasicMaterial({
      color: 0xd1c27d,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
    });

    meadows.add(this.buildConformingPatch(-188, -86, 196, 118, -0.12, shoreMaterial, "Meadows / great lake basin clearing ring"));
    meadows.add(this.buildConformingPatch(-48, -126, 126, 72, 0.18, meadowMaterial, "Meadows / south exploration field"));
    meadows.add(
      this.buildConformingPatch(18, -86, 190, 58, 0.02, meadowMaterial, "Meadows / stepped front terrace shelf"),
    );
    meadows.add(
      this.buildConformingPatch(8, -146, 212, 44, -0.04, meadowMaterial, "Meadows / layered front cliff-top shelves"),
    );
    meadows.add(this.buildConformingPatch(0, -174, 72, 42, -0.02, shoreMaterial, "Meadows / front waterfall face cut"));
    meadows.add(this.buildConformingPatch(-8, -24, 118, 66, -0.08, meadowMaterial, "Meadows / central route bowl"));
    meadows.add(this.buildConformingPatch(96, -54, 76, 52, 0.24, meadowMaterial, "Meadows / east terrace opening"));
    meadows.add(this.buildConformingPatch(-206, -8, 82, 46, -0.34, meadowMaterial, "Meadows / west cove grass shelf"));
    meadows.add(this.buildConformingPatch(34, -190, 88, 36, -0.24, meadowMaterial, "Meadows / lower river outlet field"));
    return meadows;
  }

  private buildForestFolder() {
    const forests = this.createHierarchyFolder("Forests");
    const forestPatchMaterial = new MeshBasicMaterial({
      color: 0x1b6a3e,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
    });

    forests.add(this.buildConformingPatch(-142, -48, 84, 116, 0.12, forestPatchMaterial, "Forests / west mid-slope evergreen band"));
    forests.add(this.buildConformingPatch(118, 18, 96, 124, -0.18, forestPatchMaterial, "Forests / east mid-slope evergreen band"));
    forests.add(this.buildConformingPatch(-92, 116, 74, 92, 0.28, forestPatchMaterial, "Forests / west ridge evergreen climb"));
    forests.add(this.buildConformingPatch(72, 132, 70, 92, -0.22, forestPatchMaterial, "Forests / east ridge evergreen climb"));
    forests.add(this.buildConformingPatch(-188, 28, 64, 76, -0.28, forestPatchMaterial, "Forests / west cliff-lip grove band"));
    forests.add(this.buildConformingPatch(178, 38, 68, 84, 0.24, forestPatchMaterial, "Forests / east cliff-lip grove band"));
    forests.add(this.buildConformingPatch(8, 198, 78, 74, 0.04, forestPatchMaterial, "Forests / mountain foot pine shelf"));

    const forestGeometry = new ConeGeometry(1, 1, 7);
    forestGeometry.translate(0, 0.5, 0);
    const forestMaterial = new MeshBasicMaterial({ color: 0x1f5938, fog: true });
    const maxForestInstances = 1280;
    const forest = new InstancedMesh(forestGeometry, forestMaterial, maxForestInstances);
    forest.name = "Forests / evergreen tree mass instances";
    forest.renderOrder = 5;

    const dummy = new Object3D();
    let count = 0;
    const seeded = (x: number, z: number, salt: number) =>
      Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453 -
      Math.floor(Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453);

    for (let z = -176; z <= 238; z += 12) {
      for (let x = -224; x <= 224; x += 12) {
        if (count >= maxForestInstances || sampleIslandEdgeFactor(x, z) > 0.9) {
          continue;
        }

        const y = sampleTerrainHeight(x, z);
        const zone = sampleBiomeZone(x, z, y);
        const habitat = sampleHabitatLayer(x, z, y);
        const waterWetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
        const routeOpen = sampleRouteReadabilityClearing(x, z);
        const frontMeadowOpen = Math.max(
          Math.exp(-(((x + 8) / 248) ** 2) - ((z + 128) / 86) ** 2),
          Math.exp(-(((x - 24) / 214) ** 2) - ((z + 82) / 68) ** 2),
        );
        const cliffLipEvergreen =
          sampleIslandEdgeFactor(x, z) > 0.58 && z > -12
            ? Math.max(
                Math.exp(-(((x + 188) / 90) ** 2) - ((z - 28) / 88) ** 2),
                Math.exp(-(((x - 178) / 96) ** 2) - ((z - 38) / 94) ** 2),
                Math.exp(-(((x + 92) / 98) ** 2) - ((z - 136) / 124) ** 2),
                Math.exp(-(((x - 72) / 94) ** 2) - ((z - 142) / 118) ** 2),
              )
            : 0;
        const evergreenBand = Math.max(
          Math.exp(-(((x + 142) / 104) ** 2) - ((z + 48) / 128) ** 2),
          Math.exp(-(((x - 118) / 118) ** 2) - ((z - 18) / 142) ** 2),
          Math.exp(-(((x + 92) / 102) ** 2) - ((z - 116) / 118) ** 2),
          Math.exp(-(((x - 72) / 96) ** 2) - ((z - 132) / 112) ** 2),
          Math.exp(-(((x + 188) / 90) ** 2) - ((z - 28) / 88) ** 2) * 0.86,
          Math.exp(-(((x - 178) / 96) ** 2) - ((z - 38) / 94) ** 2) * 0.88,
          Math.exp(-(((x - 8) / 82) ** 2) - ((z - 198) / 82) ** 2) * 0.92,
        );
        const biomeBoost =
          zone === "foothills"
            ? 0.42
            : zone === "alpine"
              ? 0.62
              : zone === "ridge"
                ? 0.38
                : zone === "hills"
                  ? 0.22
                  : 0;
        const density =
          evergreenBand * 1.1 +
          cliffLipEvergreen * 0.42 +
          habitat.forest * 0.78 +
          biomeBoost -
          routeOpen * 0.62 -
          waterWetness * 1.1 -
          habitat.meadow * 0.24 -
          frontMeadowOpen * 0.92;
        if (density < 0.1 || seeded(x, z, 3.4) > density * 1.35) {
          continue;
        }

        const size = 5.2 + seeded(x, z, 9.1) * 4.6 + (zone === "alpine" || zone === "ridge" ? 1.8 : 0);
        dummy.position.set(x + (seeded(x, z, 2.2) - 0.5) * 16, y + 0.55, z + (seeded(x, z, 7.7) - 0.5) * 16);
        dummy.rotation.set(0, seeded(x, z, 12.4) * Math.PI * 2, 0);
        dummy.scale.set(size * 0.9, size * (1.45 + seeded(x, z, 5.5) * 0.42), size * 0.9);
        dummy.updateMatrix();
        forest.setMatrixAt(count, dummy.matrix);
        count += 1;
      }
    }

    forest.count = count;
    if (count > 0) {
      forest.instanceMatrix.needsUpdate = true;
      forests.add(forest);
    }

    return forests;
  }

  private buildRockFolder() {
    const rocks = this.createHierarchyFolder("Rocks");
    const shell = buildFloatingIslandShell();
    shell.name = "Rocks / floating cliff shell and island underbelly";
    rocks.add(shell);

    const rockMaterial = new MeshBasicMaterial({
      color: 0x8f856e,
      transparent: true,
      opacity: 0.33,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
    });
    const snowMaterial = new MeshBasicMaterial({
      color: 0xf7fff2,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
    });

    rocks.add(this.buildConformingPatch(-8, 168, 92, 46, 0.04, rockMaterial, "Rocks / central alpine spine blockout", 1.2, 3));
    rocks.add(
      this.buildConformingPatch(0, 224, 62, 34, 0.02, rockMaterial, "Rocks / concept central mountain crown", 1.35, 3),
    );
    rocks.add(this.buildConformingPatch(-6, 274, 108, 34, 0.02, rockMaterial, "Rocks / rear skyline ridge wall", 1.28, 3));
    rocks.add(this.buildConformingPatch(-74, 116, 60, 32, -0.32, rockMaterial, "Rocks / west shoulder ridge blockout", 1.15, 3));
    rocks.add(this.buildConformingPatch(74, 126, 62, 34, 0.24, rockMaterial, "Rocks / east shoulder ridge blockout", 1.15, 3));
    rocks.add(this.buildConformingPatch(-132, 174, 46, 30, -0.28, rockMaterial, "Rocks / west side spire shoulder", 1.22, 3));
    rocks.add(this.buildConformingPatch(126, 178, 48, 32, 0.24, rockMaterial, "Rocks / east side spire shoulder", 1.22, 3));
    rocks.add(this.buildConformingPatch(-226, -86, 92, 28, -0.18, rockMaterial, "Rocks / great lake west stone shelf", 1.02, 3));
    rocks.add(this.buildConformingPatch(-152, -138, 70, 24, 0.32, rockMaterial, "Rocks / great lake south boulder shore", 1.02, 3));
    rocks.add(this.buildConformingPatch(-138, -48, 62, 22, -0.28, rockMaterial, "Rocks / great lake inlet stones", 1.02, 3));
    rocks.add(this.buildConformingPatch(-34, 174, 38, 24, 0.1, snowMaterial, "Rocks / west snow peak cap", 1.1, 4));
    rocks.add(this.buildConformingPatch(42, 188, 34, 22, -0.18, snowMaterial, "Rocks / east snow peak cap", 1.1, 4));
    rocks.add(this.buildConformingPatch(2, 248, 34, 18, 0.04, snowMaterial, "Rocks / high crown snow glint", 1.12, 4));
    rocks.add(this.buildConformingPatch(-2, 232, 48, 28, 0.06, snowMaterial, "Rocks / waterfall source snow cap", 1.1, 4));
    return rocks;
  }

  private buildGuideLines() {
    const guides = new Group();
    guides.name = "Island atlas guide lines";

    const routePoints = worldLandmarks.map(
      (landmark) => new Vector3(
        landmark.position.x,
        landmark.position.y + ROUTE_HEIGHT_OFFSET,
        landmark.position.z,
      ),
    );
    guides.add(makeLine(routePoints, 0xffe08a, 0.96, "Main route ribbon"));

    const boundaryPoints: Vector3[] = [];
    for (let index = 0; index <= 128; index += 1) {
      const angle = (index / 128) * Math.PI * 2;
      const point = sampleIslandBoundaryPoint(angle);
      boundaryPoints.push(new Vector3(point.x, sampleTerrainHeight(point.x, point.z) + 7, point.z));
    }
    guides.add(makeLine(boundaryPoints, 0x3f815f, 0.6, "Terrain edge outline"));

    const mainRiverPoints: Vector3[] = [];
    for (let z = -MOSSU_PLAYFIELD_EXTENT / 2; z <= MOSSU_PLAYFIELD_EXTENT / 2; z += 18) {
      const x = sampleRiverCenter(z);
      mainRiverPoints.push(new Vector3(x, sampleTerrainHeight(x, z) + 6, z));
    }
    guides.add(makeLine(mainRiverPoints, 0x4eb8f6, 0.86, "Main river centerline"));

    RIVER_BRANCH_SEGMENTS.forEach((segment, branchIndex) => {
      const points: Vector3[] = [];
      const steps = 28;
      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps;
        const z = MathUtils.lerp(segment.startZ, segment.endZ, t);
        const x = sampleRiverChannelCenter(segment.id, z);
        points.push(new Vector3(x, sampleTerrainHeight(x, z) + 6, z));
      }
      guides.add(makeLine(points, 0x75d7f4, 0.72, `River branch ${branchIndex + 1}`));
    });

    return guides;
  }

  private buildMarkers() {
    const markers = new Group();
    markers.name = "Island atlas markers";
    this.markerRoot.name = "Landmarks / route landmark and map POI pins";

    const pinGeometry = new CylinderGeometry(3.6, 5.2, 13, 12);
    worldLandmarks.forEach((landmark) => {
      const marker = new Mesh(
        pinGeometry,
        landmark.id === this.selectedLandmarkId ? this.selectedMarkerMaterial : this.landmarkMarkerMaterial,
      );
      marker.name = `Atlas marker ${landmark.title}`;
      marker.position.set(landmark.position.x, landmark.position.y + 14, landmark.position.z);
      marker.userData.landmarkId = landmark.id;
      marker.renderOrder = 22;
      markers.add(marker);
      this.markerMeshes.set(landmark.id, marker);
    });

    const poiGeometry = new SphereGeometry(3.4, 12, 8);
    const poiMaterial = new MeshBasicMaterial({ color: 0x9be8a6, depthWrite: false });
    worldMapMarkers.forEach((marker) => {
      const poi = new Mesh(poiGeometry, poiMaterial);
      poi.name = `Atlas point ${marker.title}`;
      poi.position.set(marker.position.x, marker.position.y + 9, marker.position.z);
      poi.renderOrder = 20;
      markers.add(poi);
    });

    this.markerRoot.add(markers);
    return this.markerRoot;
  }

  private buildWaterfallMarkers() {
    const markers = new Group();
    markers.name = "Island atlas waterfall markers";
    this.waterfallMarkerRoot.name = "Debug/Blockout / mirrored rim waterfall pins";
    const pinGeometry = new CylinderGeometry(2.6, 2.6, 8, 10);
    const dropGeometry = new SphereGeometry(4.2, 12, 8);
    const pinMaterial = new MeshBasicMaterial({ color: 0xc6f8ff, depthWrite: false });
    const dropMaterial = new MeshBasicMaterial({
      color: 0xf2ffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    ISLAND_EDGE_WATERFALL_TURNS.forEach((turn, index) => {
      const angle = turn * Math.PI * 2;
      const point = sampleIslandBoundaryPoint(angle);
      const rimY = sampleBaseTerrainHeight(point.x, point.z) - 22 - (index % 3) * 4;
      const pin = new Mesh(pinGeometry, pinMaterial);
      pin.name = `Atlas waterfall pin ${index + 1}`;
      pin.position.set(point.x, rimY, point.z);
      pin.rotation.z = Math.PI / 2;
      pin.renderOrder = 24;
      markers.add(pin);

      const drop = new Mesh(dropGeometry, dropMaterial);
      drop.name = `Atlas waterfall glow ${index + 1}`;
      drop.position.set(point.x, rimY + 8, point.z);
      drop.scale.set(0.85, 1.55, 0.85);
      drop.renderOrder = 25;
      markers.add(drop);
    });

    this.waterfallMarkerRoot.add(markers);
    return this.waterfallMarkerRoot;
  }

  private buildBlockoutAnchors() {
    const anchors = new Group();
    anchors.name = "Debug/Blockout / biome flow anchor pins";
    const geometry = new CylinderGeometry(2.4, 2.4, 10, 8);
    const material = new MeshBasicMaterial({
      color: 0xffd36c,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
    });
    [
      ["Debug/Blockout / waterfall source anchor", -2, 230],
      ["Debug/Blockout / west forest transition anchor", -142, -48],
      ["Debug/Blockout / east forest transition anchor", 118, 18],
      ["Debug/Blockout / lake basin anchor", -156, -124],
      ["Debug/Blockout / central meadow travel anchor", -8, -24],
      ["Debug/Blockout / lower outlet meadow anchor", 34, -190],
    ].forEach(([name, x, z]) => {
      const worldX = Number(x);
      const worldZ = Number(z);
      const pin = new Mesh(geometry, material);
      pin.name = String(name);
      pin.position.set(worldX, sampleTerrainHeight(worldX, worldZ) + 15, worldZ);
      pin.renderOrder = 30;
      anchors.add(pin);
    });
    return anchors;
  }

  private installControls() {
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    window.addEventListener("blur", this.handleWindowBlur);
    this.root.addEventListener("click", this.handleClick);
    this.root.addEventListener("change", this.handleChange);
    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("wheel", this.handleWheel, { passive: false });
    this.renderer.domElement.addEventListener("contextmenu", this.preventContextMenu);
  }

  private applyPreset(preset: NamedViewPreset) {
    if (this.flyMode) {
      this.setFlyMode(false);
    }
    const view = VIEW_PRESETS[preset];
    this.yaw = view.yaw;
    this.pitch = view.pitch;
    this.distance = view.distance;
    this.target = view.target.clone();
    this.viewPreset = preset;
    this.updateCamera();
    this.updateUiState();
  }

  private focusLandmark(id: string, options: { keepCamera?: boolean } = {}) {
    const landmark = worldLandmarks.find((entry) => entry.id === id);
    if (!landmark) {
      return;
    }
    this.selectedLandmarkId = id;
    if (!options.keepCamera) {
      this.target.set(landmark.position.x, landmark.position.y + 34, landmark.position.z);
    }
    if (!options.keepCamera) {
      this.distance = MathUtils.clamp(this.distance, 420, 860);
      this.viewPreset = "custom";
    }
    this.markerMeshes.forEach((marker, markerId) => {
      marker.material = markerId === this.selectedLandmarkId
        ? this.selectedMarkerMaterial
        : this.landmarkMarkerMaterial;
    });
    this.updateCamera();
    this.updateUiState();
  }

  private updateUiState() {
    this.root.querySelectorAll<HTMLElement>("[data-view-preset]").forEach((button) => {
      button.dataset.active = button.dataset.viewPreset === this.viewPreset ? "true" : "false";
    });
    this.root.querySelectorAll<HTMLInputElement>("[data-layer-id]").forEach((input) => {
      const layer = input.dataset.layerId as AtlasLayerId;
      const visible = this.layerVisibility[layer];
      input.checked = visible;
      input.closest<HTMLElement>("[data-layer-toggle]")?.setAttribute("data-active", visible ? "true" : "false");
    });
    const flyButton = this.root.querySelector<HTMLButtonElement>("[data-toggle-fly]");
    if (flyButton) {
      flyButton.classList.toggle("is-active", this.flyMode);
      flyButton.setAttribute("aria-pressed", this.flyMode ? "true" : "false");
      flyButton.querySelector<HTMLElement>("[data-fly-label]")!.textContent = this.flyMode ? "Exit fly" : "Fly WASD";
    }
    this.root.querySelectorAll<HTMLElement>("[data-landmark-id]").forEach((button) => {
      button.dataset.active = button.dataset.landmarkId === this.selectedLandmarkId ? "true" : "false";
    });
    this.updateStats();
  }

  private updateStats() {
    const selected = worldLandmarks.find((entry) => entry.id === this.selectedLandmarkId);
    const label = selected?.title ?? "Island";
    const mode = this.flyMode ? "fly" : `${Math.round(this.distance)}m view`;
    this.statsNode.textContent = `${label} | ${mode} | ${worldLandmarks.length} landmarks | ${ISLAND_EDGE_WATERFALL_TURNS.length} falls`;
  }

  private updateMarkerPulse() {
    this.markerMeshes.forEach((marker, markerId) => {
      const pulse = markerId === this.selectedLandmarkId ? 1.34 + Math.sin(this.elapsed * 4.2) * 0.08 : 1;
      marker.scale.setScalar(pulse);
    });
  }

  private updateCamera() {
    if (this.flyMode) {
      this.updateFlyCamera();
      return;
    }
    this.pitch = MathUtils.clamp(this.pitch, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
    this.distance = MathUtils.clamp(this.distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);

    const horizontalDistance = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horizontalDistance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * horizontalDistance,
    );
    this.camera.lookAt(this.target);
  }

  private renderFrame() {
    this.updateCamera();
    this.skyDome.position.copy(this.camera.position);
    this.skyDome.material.uniforms.uTime.value = this.elapsed;
    this.updateCloudBands();
    this.atlasOceanMaterial.uniforms.uTime.value = this.elapsed;
    this.atlasOceanMaterial.uniforms.uCameraWorld.value.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCloudBands() {
    if (this.cleanCapture) {
      return;
    }
    this.cloudBands.children.forEach((object) => {
      const basePosition = object.userData.basePosition as Vector3 | undefined;
      if (!basePosition) {
        return;
      }
      const phase = Number(object.userData.phase ?? 0);
      const speed = Number(object.userData.speed ?? 0.02);
      const drift = Number(object.userData.drift ?? 36);
      object.position.set(
        basePosition.x + Math.sin(this.elapsed * speed + phase) * drift,
        basePosition.y + Math.sin(this.elapsed * speed * 0.72 + phase * 1.3) * 7,
        basePosition.z + Math.cos(this.elapsed * speed * 0.64 + phase) * drift * 0.22,
      );
    });
  }

  private resize() {
    const nextWidth = Math.max(1, this.stage.clientWidth);
    const nextHeight = Math.max(1, this.stage.clientHeight);
    if (nextWidth === this.width && nextHeight === this.height) {
      return;
    }
    this.width = nextWidth;
    this.height = nextHeight;
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  private panCamera(deltaX: number, deltaY: number) {
    const scale = this.distance * 0.0021;
    this.panRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
    this.panForward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
    this.target.addScaledVector(this.panRight, -deltaX * scale);
    this.target.addScaledVector(this.panForward, deltaY * scale);
    this.viewPreset = "custom";
  }

  private handleResize = () => {
    this.resize();
    this.renderFrame();
  };

  private handleClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const flyButton = target?.closest<HTMLButtonElement>("[data-toggle-fly]");
    if (flyButton) {
      this.setFlyMode(!this.flyMode);
      return;
    }

    const presetButton = target?.closest<HTMLButtonElement>("[data-view-preset]");
    if (presetButton?.dataset.viewPreset) {
      this.applyPreset(presetButton.dataset.viewPreset as NamedViewPreset);
      return;
    }

    const landmarkButton = target?.closest<HTMLButtonElement>("[data-landmark-id]");
    if (landmarkButton?.dataset.landmarkId) {
      this.focusLandmark(landmarkButton.dataset.landmarkId);
    }
  };

  private handleChange = (event: Event) => {
    const target = event.target as HTMLElement | null;
    const layerInput = target?.closest<HTMLInputElement>("input[data-layer-id]");
    if (!layerInput) {
      return;
    }
    const layer = layerInput.dataset.layerId as AtlasLayerId | undefined;
    if (!layer || !(layer in this.layerVisibility)) {
      return;
    }
    this.layerVisibility[layer] = layerInput.checked;
    const object = this.layerObjects.get(layer);
    if (object) {
      object.visible = layerInput.checked;
    }
    this.updateUiState();
    this.renderFrame();
  };

  private handlePointerDown = (event: PointerEvent) => {
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.dragMode = event.shiftKey || event.button === 1 || event.button === 2 ? "pan" : "orbit";
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (!this.dragMode) {
      return;
    }
    const deltaX = event.clientX - this.lastPointerX;
    const deltaY = event.clientY - this.lastPointerY;
    this.lastPointerX = event.clientX;
    this.lastPointerY = event.clientY;

    if (this.dragMode === "pan") {
      this.panCamera(deltaX, deltaY);
    } else if (this.flyMode) {
      this.flyYaw -= deltaX * 0.005;
      this.flyPitch = MathUtils.clamp(this.flyPitch + deltaY * 0.004, FLY_MIN_PITCH, FLY_MAX_PITCH);
    } else {
      this.yaw -= deltaX * 0.006;
      this.pitch += deltaY * 0.0048;
      this.viewPreset = "custom";
    }
    this.updateUiState();
    this.renderFrame();
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (this.dragMode && this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    }
    this.dragMode = null;
  };

  private handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (this.flyMode) {
      const direction = Math.sign(event.deltaY);
      this.updateFlyDirection();
      this.flyPosition.addScaledVector(this.flyForward, -direction * 38);
      this.updateUiState();
      this.renderFrame();
      return;
    }
    const zoom = Math.exp(event.deltaY * 0.001);
    this.distance = MathUtils.clamp(this.distance * zoom, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
    this.viewPreset = "custom";
    this.updateUiState();
    this.renderFrame();
  };

  private preventContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private setFlyMode(enabled: boolean) {
    if (enabled === this.flyMode) {
      return;
    }

    this.flyMode = enabled;
    this.activeFlyKeys.clear();
    if (enabled) {
      this.flyPosition.copy(this.camera.position);
      this.flyYaw = this.yaw;
      this.flyPitch = MathUtils.clamp(this.pitch, FLY_MIN_PITCH, FLY_MAX_PITCH);
      this.viewPreset = "custom";
      this.renderer.domElement.focus();
    } else {
      this.updateFlyDirection();
      this.distance = MathUtils.clamp(760, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
      this.yaw = this.flyYaw;
      this.pitch = MathUtils.clamp(this.flyPitch, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
      this.target.copy(this.flyPosition).addScaledVector(this.flyForward, this.distance);
    }
    this.updateUiState();
    this.renderFrame();
  }

  private updateFlyDirection() {
    const horizontal = Math.cos(this.flyPitch);
    this.flyForward.set(
      -Math.sin(this.flyYaw) * horizontal,
      -Math.sin(this.flyPitch),
      -Math.cos(this.flyYaw) * horizontal,
    ).normalize();
    this.flyRight.set(Math.cos(this.flyYaw), 0, -Math.sin(this.flyYaw)).normalize();
  }

  private updateFlyMovement(dt: number) {
    if (!this.flyMode || this.activeFlyKeys.size === 0) {
      return;
    }
    this.updateFlyDirection();
    this.flyVelocity.set(0, 0, 0);
    if (this.activeFlyKeys.has("w")) {
      this.flyVelocity.add(this.flyForward);
    }
    if (this.activeFlyKeys.has("s")) {
      this.flyVelocity.sub(this.flyForward);
    }
    if (this.activeFlyKeys.has("d")) {
      this.flyVelocity.add(this.flyRight);
    }
    if (this.activeFlyKeys.has("a")) {
      this.flyVelocity.sub(this.flyRight);
    }
    if (this.activeFlyKeys.has("e") || this.activeFlyKeys.has(" ")) {
      this.flyVelocity.y += 1;
    }
    if (this.activeFlyKeys.has("q")) {
      this.flyVelocity.y -= 1;
    }
    if (this.flyVelocity.lengthSq() <= 0.0001) {
      return;
    }
    const speed = FLY_BASE_SPEED * (this.activeFlyKeys.has("shift") ? 2.05 : 1);
    this.flyPosition.addScaledVector(this.flyVelocity.normalize(), speed * dt);
  }

  private updateFlyCamera() {
    this.updateFlyDirection();
    this.camera.position.copy(this.flyPosition);
    this.target.copy(this.flyPosition).addScaledVector(this.flyForward, FLY_LOOK_DISTANCE);
    this.camera.lookAt(this.target);
  }

  private handleKeyDown = (event: KeyboardEvent) => {
    if (!this.flyMode || event.metaKey || event.ctrlKey || event.altKey || isUiTypingTarget(event.target)) {
      return;
    }
    const key = event.key === "Shift" ? "shift" : event.key.toLowerCase();
    if (!["w", "a", "s", "d", "q", "e", " ", "shift"].includes(key)) {
      return;
    }
    event.preventDefault();
    this.activeFlyKeys.add(key);
  };

  private handleKeyUp = (event: KeyboardEvent) => {
    const key = event.key === "Shift" ? "shift" : event.key.toLowerCase();
    this.activeFlyKeys.delete(key);
  };

  private handleWindowBlur = () => {
    this.activeFlyKeys.clear();
  };
}
