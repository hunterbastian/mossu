import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import { FrameState } from "../../simulation/gameState";
import {
  ForageableKind,
  sampleBaseTerrainHeight,
  sampleBiomeZone,
  sampleIslandBoundaryPoint,
  sampleTerrainHeight,
  sampleTerrainNormal,
  shadowPockets,
  worldLandmarks,
  worldForageables,
} from "../../simulation/world";
import { MossuAvatar } from "../objects/MossuAvatar";
import { createGrassMesh, GrassShader, sampleOpeningMeadowMask } from "./grassSystem";
import { buildClouds, buildMountainAtmosphere, buildSkyDome } from "./atmosphereSystem";
import {
  AMBIENT_BLOB_SPECIES_NAME,
  AmbientBlob,
  AmbientBlobUpdateStats,
  buildAmbientBlobs,
  updateAmbientBlobs,
} from "./ambientBlobs";
import {
  buildGroundLayer,
  buildHighlandAccents,
  buildLandmarkTrees,
  buildMidLayer,
  buildTreeClusters,
} from "./terrainDecorations";
import { markCameraCollider } from "./sceneHelpers";
import {
  buildRiverSystem,
  buildHighlandWaterways,
  makeOpeningLakeSurface,
  WaterSurfaceController,
  WaterSurfaceGroup,
} from "./waterSystem";

const WORLD_SIZE = 560;
const TERRAIN_SEGMENTS = 240;
const GRASS_COUNT = 6400;
const ALPINE_GRASS_COUNT = 1700;
const LANDING_SPLASH_PARTICLES = 18;
const SNOW_TRAIL_PARTICLES = 20;

interface LandingSplashParticle {
  mesh: Mesh;
  origin: Vector3;
  normal: Vector3;
  direction: Vector3;
  age: number;
  life: number;
  height: number;
  width: number;
  bend: number;
  twist: number;
}

interface SnowTrailParticle {
  mesh: Mesh;
  origin: Vector3;
  velocity: Vector3;
  age: number;
  life: number;
  drift: number;
}

interface MapMarker {
  group: Group;
  baseScale: number;
  pulseSpeed: number;
}

interface ForageableVisual {
  id: string;
  kind: ForageableKind;
  group: Group;
  baseY: number;
  bobOffset: number;
  swayOffset: number;
  spinDirection: number;
}

interface WorldRendererOptions {
  debugSpiritCloseup?: boolean;
}

export interface WorldPerfStats {
  terrainVertices: number;
  terrainTriangles: number;
  grassMeshes: number;
  grassInstances: number;
  grassEstimatedTriangles: number;
  forestMeshes: number;
  forestInstances: number;
  forestEstimatedTriangles: number;
  waterSurfaces: number;
  waterVertices: number;
  waterTriangles: number;
  animatedShaderMeshes: number;
  grassShaderMeshes: number;
  treeShaderMeshes: number;
  waterShaderSurfaces: number;
}

function colorForTerrain(x: number, y: number, z: number) {
  const zone = sampleBiomeZone(x, z, y);
  const normal = sampleTerrainNormal(x, z);
  const slope = 1 - normal.y;
  const painterlyNoise = Math.sin(x * 0.07) * 0.04 + Math.cos(z * 0.05) * 0.03 + Math.sin((x - z) * 0.03) * 0.05;
  const patch = Math.round((Math.sin(x * 0.12 + z * 0.08) * 0.5 + 0.5) * 5) / 5;
  const mixValue = MathUtils.clamp(patch * 0.5 + painterlyNoise + y / 220, 0, 1);
  const openingMask = sampleOpeningMeadowMask(x, z);
  const sunWash = Math.sin(x * 0.018 - z * 0.014 + 1.2) * 0.5 + 0.5;
  const fieldBands = Math.sin(x * 0.022 + z * 0.006 - 1.2) * 0.5 + 0.5;
  const meadowBloom = MathUtils.clamp((1 - slope * 2.8) * (0.04 + sunWash * 0.1 + openingMask * 0.08), 0, 0.18);
  const heightGrass = MathUtils.clamp(MathUtils.smoothstep(y, 8, 82), 0, 1);
  const foothillTint = MathUtils.clamp(MathUtils.smoothstep(y, 38, 98), 0, 1);
  const alpineTint = MathUtils.clamp(MathUtils.smoothstep(y, 84, 148), 0, 1);
  const slopeRock = MathUtils.smoothstep(slope, 0.16, 0.62);
  const altitudeRock = MathUtils.smoothstep(y, 72, 138) * 0.26;
  const zoneRockBoost =
    zone === "foothills" ? 0.1 :
    zone === "alpine" ? 0.28 :
    zone === "ridge" ? 0.4 :
    zone === "peak_shrine" ? 0.5 :
    0;
  const rockMask = MathUtils.clamp(slopeRock + altitudeRock + zoneRockBoost, 0, 0.92);
  const snowMask = MathUtils.clamp(
    MathUtils.smoothstep(y, 132, 178) * 0.86 +
    MathUtils.smoothstep(z, 184, 232) * 0.2 +
    (zone === "peak_shrine" ? 0.36 : 0),
    0,
    0.88,
  );
  const grass = new Color("#53683d")
    .lerp(new Color("#7fa254"), 0.36 + mixValue * 0.34 + heightGrass * 0.12)
    .lerp(new Color("#a9c76b"), openingMask * (0.08 + fieldBands * 0.12) + meadowBloom * 0.9)
    .lerp(new Color("#6f8a55"), foothillTint * 0.28)
    .lerp(new Color("#829071"), alpineTint * 0.2);
  const rock = new Color("#b5ad9c")
    .lerp(new Color("#d6d1c4"), 0.18 + mixValue * 0.22)
    .lerp(new Color("#8f958d"), MathUtils.clamp(slope * 1.3 + alpineTint * 0.34, 0, 0.78));
  const snow = new Color("#f7f3e7").lerp(new Color("#dce8f0"), MathUtils.clamp(slope * 0.8 + painterlyNoise * 1.6, 0, 0.44));

  return grass
    .lerp(new Color("#d6c57d"), meadowBloom * (0.28 + openingMask * 0.16))
    .lerp(rock, rockMask * (1 - snowMask * 0.46))
    .lerp(snow, snowMask);
}

function makeTerrainMesh() {
  const geometry = new PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position as BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const y = sampleTerrainHeight(x, z);
    positions.setY(i, y);
    const color = colorForTerrain(x, y, z);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    dithering: true,
  });

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildShrine() {
  const shrine = new Group();
  const stoneMaterial = new MeshStandardMaterial({ color: "#f0e7ce", roughness: 1 });
  const mossMaterial = new MeshStandardMaterial({ color: "#8bb66f", roughness: 1 });
  const base = markCameraCollider(new Mesh(new CylinderGeometry(4.4, 5.6, 2.2, 7), stoneMaterial));
  const cap = markCameraCollider(new Mesh(new CylinderGeometry(3.5, 3.8, 3.2, 7), stoneMaterial));
  const moss = markCameraCollider(new Mesh(new CylinderGeometry(4.6, 4.4, 0.7, 7), mossMaterial));
  base.position.y = 1.1;
  cap.position.y = 3.6;
  moss.position.y = 2.2;
  shrine.add(base, cap, moss);
  shrine.position.set(2, sampleTerrainHeight(2, 214), 214);
  return shrine;
}

function buildShadowPockets() {
  const group = new Group();
  shadowPockets.forEach((pocket) => {
    const layers = new Group();
    for (let i = 0; i < 4; i += 1) {
      const radius = pocket.radius * (1 - i * 0.16);
      const depth = pocket.depth * (1 - i * 0.18);
      const material = new MeshBasicMaterial({
        color: new Color().setHSL(pocket.hue, 0.18, 0.1 + i * 0.03),
        transparent: true,
        opacity: 0.18 - i * 0.03,
        depthWrite: false,
      });
      const layer = new Mesh(new CylinderGeometry(radius, radius * 0.86, depth, 24), material);
      layer.position.y = -i * 0.68;
      layers.add(layer);
    }
    layers.position.copy(pocket.position);
    group.add(layers);
  });
  return group;
}

function buildValleyMist() {
  const group = new Group();
  const patches = [
    [-54, -126, 92, 34, 5.2, 0.18, -0.08],
    [-8, -28, 138, 42, 7.8, 0.13, 0.04],
    [26, 72, 128, 38, 9.4, 0.15, -0.14],
    [18, 134, 118, 36, 12.6, 0.12, 0.1],
    [-18, 190, 146, 44, 17, 0.1, -0.02],
  ] as const;

  patches.forEach(([x, z, width, depth, lift, opacity, rotation], index) => {
    const material = new MeshBasicMaterial({
      color: index < 2 ? "#effbf4" : "#eef8ff",
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
    });
    const mist = new Mesh(new PlaneGeometry(width, depth), material);
    mist.rotation.x = -Math.PI / 2;
    mist.rotation.z = rotation;
    mist.position.set(x, sampleTerrainHeight(x, z) + lift, z);
    mist.userData.baseX = x;
    mist.userData.baseZ = z;
    mist.userData.baseOpacity = opacity;
    group.add(mist);
  });

  return group;
}

function buildFloatingIslandShell() {
  const group = new Group();
  const upperMaterial = new MeshStandardMaterial({ color: "#d3ccb9", roughness: 1, side: DoubleSide });
  const lowerMaterial = new MeshStandardMaterial({ color: "#b6af9d", roughness: 1, side: DoubleSide });
  const mossMaterial = new MeshStandardMaterial({ color: "#7ea36a", roughness: 1, side: DoubleSide });
  const perimeter: Vector3[] = [];
  const center = new Vector3();

  for (let i = 0; i < 28; i += 1) {
    const boundary = sampleIslandBoundaryPoint((i / 28) * Math.PI * 2);
    boundary.y = sampleBaseTerrainHeight(boundary.x, boundary.z) - 12;
    perimeter.push(boundary);
    center.add(boundary);
  }

  center.multiplyScalar(1 / perimeter.length);
  let radiusX = 0;
  let radiusZ = 0;
  let rimHeight = 0;
  perimeter.forEach((point) => {
    radiusX = Math.max(radiusX, Math.abs(point.x - center.x));
    radiusZ = Math.max(radiusZ, Math.abs(point.z - center.z));
    rimHeight += point.y;
  });
  rimHeight /= perimeter.length;

  const upperSkirt = new Mesh(new CylinderGeometry(1.02, 0.88, 88, 40, 5, true), upperMaterial);
  upperSkirt.scale.set(radiusX * 1.02, 1, radiusZ * 1.04);
  upperSkirt.position.set(center.x, rimHeight - 56, center.z);
  markCameraCollider(upperSkirt);

  const mossBand = new Mesh(new CylinderGeometry(1, 0.96, 10, 40, 1, true), mossMaterial);
  mossBand.scale.set(radiusX * 1.03, 1, radiusZ * 1.05);
  mossBand.position.set(center.x, rimHeight - 8, center.z);
  markCameraCollider(mossBand);

  const lowerSkirt = new Mesh(new CylinderGeometry(0.88, 0.42, 124, 40, 6, true), lowerMaterial);
  lowerSkirt.scale.set(radiusX * 0.96, 1, radiusZ * 0.98);
  lowerSkirt.position.set(center.x, rimHeight - 158, center.z);
  markCameraCollider(lowerSkirt);

  const lowerBelly = new Mesh(new SphereGeometry(1.2, 20, 18), lowerMaterial);
  lowerBelly.scale.set(radiusX * 0.56, 58, radiusZ * 0.5);
  lowerBelly.position.set(center.x, rimHeight - 238, center.z);
  markCameraCollider(lowerBelly);

  group.add(upperSkirt, mossBand, lowerSkirt, lowerBelly);

  perimeter.forEach((point, index) => {
    const cliffBulge = markCameraCollider(new Mesh(new SphereGeometry(1.08, 10, 8), index % 3 === 0 ? lowerMaterial : upperMaterial));
    cliffBulge.scale.set(
      14 + (index % 4) * 4,
      22 + (index % 3) * 8,
      16 + (index % 5) * 3,
    );
    cliffBulge.position.set(
      point.x * 0.96 + center.x * 0.04,
      point.y - 26 - (index % 4) * 7,
      point.z * 0.96 + center.z * 0.04,
    );
    group.add(cliffBulge);
  });

  return group;
}

function createMapMarker(color: string, radius: number, height: number, opacity: number) {
  const group = new Group();
  const ringMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const coreMaterial = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: opacity * 0.78,
    depthWrite: false,
  });

  const ring = new Mesh(new CylinderGeometry(radius, radius, 0.18, 24), ringMaterial);
  ring.position.y = 0.1;
  const core = new Mesh(new CylinderGeometry(radius * 0.42, radius * 0.42, height, 18), coreMaterial);
  core.position.y = height * 0.5;
  const cap = new Mesh(new SphereGeometry(radius * 0.3, 12, 10), coreMaterial);
  cap.position.y = height + radius * 0.12;
  group.add(ring, core, cap);
  return group;
}

function createFruitPickup(seed: number) {
  const group = new Group();
  const stemMaterial = new MeshLambertMaterial({ color: "#5f7845" });
  const fruitMaterial = new MeshLambertMaterial({
    color: seed % 3 === 0 ? "#ffba66" : seed % 2 === 0 ? "#ff8b78" : "#ffd06b",
  });
  const leafMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#7cc170" : "#6aa462",
    side: DoubleSide,
  });

  const stem = new Mesh(new CylinderGeometry(0.1, 0.16, 0.95, 8), stemMaterial);
  stem.position.y = 0.52;
  group.add(stem);

  [
    [0, 0.98, 0],
    [-0.34, 0.72, 0.1],
    [0.31, 0.78, -0.12],
    [0.06, 0.58, 0.3],
  ].forEach(([x, y, z], index) => {
    const fruit = new Mesh(new SphereGeometry(index === 0 ? 0.34 : 0.28, 12, 10), fruitMaterial);
    fruit.position.set(x as number, y as number, z as number);
    fruit.scale.set(1, 0.92, 1);
    group.add(fruit);
  });

  const leaf = new Mesh(new PlaneGeometry(0.68, 0.3, 1, 1), leafMaterial);
  leaf.position.set(0.14, 1.03, -0.06);
  leaf.rotation.set(-0.5, 0.45, -0.28);
  group.add(leaf);

  group.scale.setScalar(1 + (seed % 3) * 0.08);
  return group;
}

function createPlantPickup(seed: number) {
  const group = new Group();
  const stemMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#74b06e" : "#6aa46d",
  });
  const bloomMaterial = new MeshLambertMaterial({
    color: seed % 3 === 0 ? "#d8efff" : seed % 2 === 0 ? "#bfe1ff" : "#d5f3e3",
    transparent: true,
    opacity: 0.9,
    side: DoubleSide,
  });

  [-0.22, 0, 0.24].forEach((offset, index) => {
    const stem = new Mesh(new ConeGeometry(0.14 + index * 0.02, 1.25 + index * 0.14, 7), stemMaterial);
    stem.position.set(offset, 0.62 + index * 0.04, (index - 1) * 0.08);
    stem.rotation.z = offset * -0.42;
    group.add(stem);
  });

  const bloom = new Mesh(new SphereGeometry(0.28, 10, 8), bloomMaterial);
  bloom.position.set(0.02, 1.24, 0);
  bloom.scale.set(0.95, 0.72, 0.95);
  group.add(bloom);

  const leafPlane = new Mesh(new PlaneGeometry(0.76, 0.28, 1, 1), bloomMaterial.clone());
  (leafPlane.material as MeshLambertMaterial).color.set("#93d798");
  leafPlane.position.set(-0.02, 0.72, 0);
  leafPlane.rotation.set(-0.15, 0.2, 0.48);
  group.add(leafPlane);

  group.scale.setScalar(0.94 + (seed % 3) * 0.06);
  return group;
}

function buildForageableVisuals() {
  return worldForageables.map<ForageableVisual>((forageable, index) => {
    const group = forageable.kind === "fruit" ? createFruitPickup(index) : createPlantPickup(index);
    group.position.copy(forageable.position);
    group.position.y += forageable.kind === "fruit" ? 1.15 : 0.88;
    return {
      id: forageable.id,
      kind: forageable.kind,
      group,
      baseY: group.position.y,
      bobOffset: index * 0.9,
      swayOffset: index * 0.55,
      spinDirection: index % 2 === 0 ? 1 : -1,
    };
  });
}

function freezeStaticHierarchy(object: Object3D) {
  object.traverse((child) => {
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
}

function countGeometryVertices(geometry: BufferGeometry) {
  return geometry.getAttribute("position")?.count ?? 0;
}

function countGeometryTriangles(geometry: BufferGeometry) {
  const index = geometry.getIndex();
  if (index) {
    return Math.floor(index.count / 3);
  }

  return Math.floor(countGeometryVertices(geometry) / 3);
}

function countInstancedTriangles(meshes: readonly InstancedMesh[]) {
  return meshes.reduce((total, mesh) => total + countGeometryTriangles(mesh.geometry) * mesh.count, 0);
}

export class WorldRenderer {
  readonly mossu = new MossuAvatar();
  readonly terrain = makeTerrainMesh();
  readonly skyDome = buildSkyDome();
  readonly clouds = buildClouds();
  readonly windMeshes: Array<InstancedMesh> = [];
  private readonly treeWindMeshes: Array<InstancedMesh> = [];
  private readonly waterControllers: Array<WaterSurfaceController> = [];
  private readonly cameraCollisionMeshes: Mesh[] = [];
  private readonly gameplayFog = new FogExp2("#c8d6cf", 0.00112);

  private readonly shrine = buildShrine();
  private readonly riverSystem = buildRiverSystem();
  private readonly openingLake = makeOpeningLakeSurface();
  private readonly islandShell = buildFloatingIslandShell();
  private readonly groundLayer = buildGroundLayer();
  private readonly midLayer = buildMidLayer();
  private readonly treeClusters = buildTreeClusters();
  private readonly highlandAccents = buildHighlandAccents();
  private readonly highlandWaterways = buildHighlandWaterways();
  private readonly mountainAtmosphere = buildMountainAtmosphere();
  private readonly valleyMist = buildValleyMist();
  private readonly shadowVolumes = buildShadowPockets();
  private readonly landmarkTrees = buildLandmarkTrees();
  private readonly mountainSilhouettes = new Group();
  private readonly sun = new DirectionalLight("#fff0cf", 3.12);
  private readonly meadowGlow = new PointLight("#ffe6b3", 1.48, 220, 1.4);
  private readonly alpineGlow = new PointLight("#cddcff", 0.74, 260, 1.1);
  private readonly landingSplash = new Group();
  private readonly landingParticles: LandingSplashParticle[] = [];
  private readonly snowTrail = new Group();
  private readonly snowTrailParticles: SnowTrailParticle[] = [];
  private readonly ambientBlobs: AmbientBlob[];
  private readonly ambientBlobGroup = new Group();
  private faunaStats: AmbientBlobUpdateStats = {
    speciesName: AMBIENT_BLOB_SPECIES_NAME,
    recruitedCount: 0,
    nearestRecruitableDistance: null,
    recruitedThisFrame: 0,
  };
  private readonly landingUp = new Vector3(0, 1, 0);
  private readonly landingQuat = new Quaternion();
  private readonly landingPosition = new Vector3();
  private readonly landingNormal = new Vector3();
  private readonly trailVelocity = new Vector3();
  private readonly trailDirection = new Vector3();
  private trailEmissionCarry = 0;
  private readonly mapMarkerGroup = new Group();
  private readonly forageableGroup = new Group();
  private readonly forageableVisuals = buildForageableVisuals();
  private readonly perfStats: WorldPerfStats;
  private readonly playerMapMarker: MapMarker = {
    group: createMapMarker("#78f3ff", 3.2, 12, 0.42),
    baseScale: 1,
    pulseSpeed: 4.2,
  };
  private readonly shrineMapMarker: MapMarker = {
    group: createMapMarker("#ffe08a", 4.2, 18, 0.38),
    baseScale: 1,
    pulseSpeed: 2.4,
  };
  private readonly landmarkMapMarkers: Array<MapMarker> = [];

  constructor(private readonly scene: Scene, options: WorldRendererOptions = {}) {
    this.ambientBlobs = buildAmbientBlobs(options);
    scene.background = new Color("#d8f6ff");
    scene.fog = this.gameplayFog;

    const ambient = new AmbientLight("#f4fff9", 0.84);
    const skyFill = new HemisphereLight("#c8f7ff", "#d5e7a4", 1.02);
    const skyBounce = new DirectionalLight("#dffcff", 0.32);
    skyBounce.position.set(148, 126, 196);
    scene.add(ambient, skyFill, skyBounce);

    this.sun.position.set(-244, 84, -46);
    this.sun.castShadow = false;
    this.sun.target.position.set(58, 12, 98);
    scene.add(this.sun.target);
    scene.add(this.sun);
    this.meadowGlow.color.set("#ffe1a2");
    this.meadowGlow.intensity = 0.46;
    this.meadowGlow.distance = 240;
    this.meadowGlow.position.set(-186, 38, -122);
    this.alpineGlow.color.set("#dbe8ff");
    this.alpineGlow.intensity = 0.56;
    this.alpineGlow.position.set(44, 128, 186);
    scene.add(this.meadowGlow, this.alpineGlow);

    scene.add(this.skyDome);
    scene.add(this.terrain);
    scene.add(this.islandShell);
    scene.add(this.riverSystem.group);
    scene.add(this.openingLake.mesh);
    scene.add(this.groundLayer);
    scene.add(this.midLayer);
    scene.add(this.treeClusters);
    scene.add(this.highlandAccents);
    scene.add(this.highlandWaterways.group);
    scene.add(this.mountainAtmosphere);
    scene.add(this.valleyMist);
    scene.add(this.landmarkTrees);
    scene.add(this.shadowVolumes);
    scene.add(this.shrine);
    scene.add(this.clouds);
    scene.add(this.mossu.group);
    scene.add(this.landingSplash);
    scene.add(this.snowTrail);
    scene.add(this.forageableGroup);
    scene.add(this.ambientBlobGroup);
    scene.add(this.mapMarkerGroup);

    const meadowNearGrass = createGrassMesh(
      Math.round(GRASS_COUNT * 0.37),
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color("#3f7a34"),
      new Color("#c5ea68"),
      {
        crossPlanes: 2,
        bladeWidth: 0.72,
        bladeHeight: 3.6,
        placementMultiplier: 0.72,
        scaleMultiplier: 1.14,
        widthMultiplier: 0.94,
        fadeInStart: -1,
        fadeInEnd: 0,
        fadeOutStart: 34,
        fadeOutEnd: 68,
        rootFillBoost: 0.08,
        selfShadowStrength: 0.92,
        distanceCompressionBoost: 0.04,
        playerPushRadius: 10.6,
        playerPushStrength: 1.34,
        windExaggeration: 1.2,
      },
    );
    const meadowMidGrass = createGrassMesh(
      Math.round(GRASS_COUNT * 0.56),
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color("#427333"),
      new Color("#b9df65"),
      {
        crossPlanes: 1,
        bladeWidth: 0.94,
        bladeHeight: 3.1,
        placementMultiplier: 0.92,
        scaleMultiplier: 1.06,
        widthMultiplier: 1.12,
        fadeInStart: 24,
        fadeInEnd: 44,
        fadeOutStart: 96,
        fadeOutEnd: 144,
        rootFillBoost: 0.18,
        selfShadowStrength: 0.72,
        distanceCompressionBoost: 0.14,
        playerPushRadius: 11.8,
        playerPushStrength: 1.22,
        windExaggeration: 1.15,
      },
    );
    const meadowFarGrass = createGrassMesh(
      GRASS_COUNT - 260,
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color("#496f35"),
      new Color("#aacf63"),
      {
        crossPlanes: 1,
        bladeWidth: 1.1,
        bladeHeight: 2.7,
        placementMultiplier: 1.02,
        scaleMultiplier: 0.98,
        widthMultiplier: 1.24,
        fadeInStart: 84,
        fadeInEnd: 118,
        fadeOutStart: 220,
        fadeOutEnd: 320,
        rootFillBoost: 0.28,
        selfShadowStrength: 0.6,
        distanceCompressionBoost: 0.26,
        playerPushRadius: 9.8,
        playerPushStrength: 0.92,
        windExaggeration: 1.08,
      },
    );
    const alpineGrass = createGrassMesh(
      ALPINE_GRASS_COUNT,
      (zone) => zone === "alpine" || zone === "ridge",
      new Color("#64785a"),
      new Color("#c5d8a0"),
      {
        crossPlanes: 1,
        selfShadowStrength: 0.42,
        windExaggeration: 1.06,
      },
    );
    this.windMeshes.push(meadowNearGrass, meadowMidGrass, meadowFarGrass, alpineGrass);
    scene.add(meadowNearGrass, meadowMidGrass, meadowFarGrass, alpineGrass);

    const stoneMaterial = new MeshStandardMaterial({ color: "#bcc8ba", roughness: 1 });
    for (const [x, z, sx, sy, sz] of [
      [-152, 184, 86, 118, 114],
      [118, 198, 102, 136, 120],
      [8, 232, 126, 162, 122],
      [76, 240, 66, 94, 70],
    ]) {
      const mountain = new Mesh(new SphereGeometry(1.2, 16, 14), stoneMaterial);
      mountain.scale.set(sx as number, sy as number, sz as number);
      mountain.position.set(x as number, 12, z as number);
      this.mountainSilhouettes.add(mountain);
    }
    scene.add(this.mountainSilhouettes);

    const splashGeometry = new PlaneGeometry(0.42, 1.7, 1, 5);
    splashGeometry.translate(0, 0.85, 0);
    for (let i = 0; i < LANDING_SPLASH_PARTICLES; i += 1) {
      const material = new MeshLambertMaterial({
        color: i % 4 === 0 ? "#cfe8a8" : i % 3 === 0 ? "#a9d27c" : "#7fb863",
        side: DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new Mesh(splashGeometry, material);
      mesh.visible = false;
      this.landingSplash.add(mesh);
      this.landingParticles.push({
        mesh,
        origin: new Vector3(),
        normal: new Vector3(0, 1, 0),
        direction: new Vector3(1, 0, 0),
        age: 1,
        life: 0.45,
        height: 1,
        width: 1,
        bend: 0,
        twist: 0,
      });
    }

    for (let i = 0; i < SNOW_TRAIL_PARTICLES; i += 1) {
      const material = new MeshLambertMaterial({
        color: i % 3 === 0 ? "#f6fbff" : "#edf5ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new Mesh(new SphereGeometry(0.18 + (i % 4) * 0.02, 10, 8), material);
      mesh.visible = false;
      this.snowTrail.add(mesh);
      this.snowTrailParticles.push({
        mesh,
        origin: new Vector3(),
        velocity: new Vector3(),
        age: 1,
        life: 0.36,
        drift: 0,
      });
    }

    this.mapMarkerGroup.visible = false;
    this.forageableVisuals.forEach((visual) => {
      this.forageableGroup.add(visual.group);
    });
    this.mapMarkerGroup.add(this.playerMapMarker.group);
    this.mapMarkerGroup.add(this.shrineMapMarker.group);
    worldLandmarks.forEach((landmark, index) => {
      if (landmark.id === "peak-shrine") {
        return;
      }

      const marker: MapMarker = {
        group: createMapMarker("#f7fbff", 1.7, 8 + (index % 2) * 2, 0.22),
        baseScale: 0.82,
        pulseSpeed: 1.6 + index * 0.18,
      };
      marker.group.position.set(landmark.position.x, landmark.position.y, landmark.position.z);
      this.landmarkMapMarkers.push(marker);
      this.mapMarkerGroup.add(marker.group);
    });

    this.ambientBlobs.forEach((blob) => {
      this.ambientBlobGroup.add(blob.group);
    });

    this.waterControllers.push(...this.riverSystem.controllers, this.openingLake, ...this.highlandWaterways.controllers);
    this.registerCameraCollider(this.terrain);
    this.collectCameraColliders(this.islandShell);
    this.collectCameraColliders(this.shrine);
    this.collectCameraColliders(this.treeClusters);
    this.collectCameraColliders(this.highlandAccents);
    this.collectCameraColliders(this.landmarkTrees);
    this.collectTreeWindMeshes(this.treeClusters);
    this.perfStats = this.createPerfStats();

    [
      this.terrain,
      this.islandShell,
      this.riverSystem.group,
      this.openingLake.mesh,
      this.groundLayer,
      this.midLayer,
      this.treeClusters,
      this.highlandAccents,
      this.highlandWaterways.group,
      this.shadowVolumes,
      this.landmarkTrees,
      this.shrine,
      this.mountainSilhouettes,
    ].forEach((object) => freezeStaticHierarchy(object));
  }

  getCameraCollisionMeshes() {
    return this.cameraCollisionMeshes;
  }

  getPerfStats() {
    return this.perfStats;
  }

  getFaunaStats() {
    return this.faunaStats;
  }

  update(frame: FrameState, elapsed: number, dt: number, mapLookdown = false, recruitPressed = false) {
    this.mossu.update(frame.player, dt);
    this.skyDome.position.copy(frame.player.position);
    this.scene.fog = mapLookdown ? null : this.gameplayFog;
    if (!mapLookdown) {
      this.updateWind(frame, elapsed);
      this.updateClouds(elapsed);
      this.updateValleyMist(elapsed);
    }
    this.updateWater(elapsed);
    this.faunaStats = updateAmbientBlobs(
      this.ambientBlobs,
      this.ambientBlobGroup,
      frame,
      elapsed,
      dt,
      mapLookdown,
      recruitPressed,
    );
    this.updateLandingSplash(frame, dt);
    this.updateSnowTrail(frame, dt);
    this.updateForageables(frame, elapsed, mapLookdown);
    this.updateMapMarkers(frame, elapsed, mapLookdown);
    this.windMeshes.forEach((mesh) => {
      mesh.visible = !mapLookdown;
    });
    this.skyDome.visible = !mapLookdown;
    this.islandShell.visible = !mapLookdown;
    this.clouds.visible = !mapLookdown;
    this.mountainSilhouettes.visible = !mapLookdown;
    this.mountainAtmosphere.visible = !mapLookdown;
    this.valleyMist.visible = !mapLookdown;
  }

  private updateForageables(frame: FrameState, elapsed: number, mapLookdown: boolean) {
    this.forageableGroup.visible = !mapLookdown;
    if (mapLookdown) {
      return;
    }

    this.forageableVisuals.forEach((visual, index) => {
      const gathered = frame.save.gatheredForageableIds.has(visual.id);
      visual.group.visible = !gathered;
      if (gathered) {
        return;
      }

      const bob = Math.sin(elapsed * 1.8 + visual.bobOffset) * 0.18;
      visual.group.position.y = visual.baseY + bob;
      if (visual.kind === "fruit") {
        visual.group.rotation.y = elapsed * 0.55 * visual.spinDirection + visual.swayOffset;
      } else {
        visual.group.rotation.y = visual.swayOffset;
        visual.group.rotation.z = Math.sin(elapsed * 1.5 + visual.swayOffset + index * 0.3) * 0.08;
      }
    });
  }

  private collectCameraColliders(root: Object3D) {
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && mesh.userData.cameraCollider) {
        this.registerCameraCollider(mesh);
      }
    });
  }

  private registerCameraCollider(mesh: Mesh) {
    if (!this.cameraCollisionMeshes.includes(mesh)) {
      this.cameraCollisionMeshes.push(mesh);
    }
  }

  private createPerfStats(): WorldPerfStats {
    const waterGeometryStats = this.waterControllers.reduce(
      (stats, controller) => {
        stats.vertices += countGeometryVertices(controller.mesh.geometry);
        stats.triangles += countGeometryTriangles(controller.mesh.geometry);
        return stats;
      },
      { vertices: 0, triangles: 0 },
    );
    const grassInstances = this.windMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const forestInstances = this.treeWindMeshes.reduce((sum, mesh) => sum + mesh.count, 0);

    return {
      terrainVertices: countGeometryVertices(this.terrain.geometry),
      terrainTriangles: countGeometryTriangles(this.terrain.geometry),
      grassMeshes: this.windMeshes.length,
      grassInstances,
      grassEstimatedTriangles: countInstancedTriangles(this.windMeshes),
      forestMeshes: this.treeWindMeshes.length,
      forestInstances,
      forestEstimatedTriangles: countInstancedTriangles(this.treeWindMeshes),
      waterSurfaces: this.waterControllers.length,
      waterVertices: waterGeometryStats.vertices,
      waterTriangles: waterGeometryStats.triangles,
      animatedShaderMeshes: this.windMeshes.length + this.treeWindMeshes.length + this.waterControllers.length,
      grassShaderMeshes: this.windMeshes.length,
      treeShaderMeshes: this.treeWindMeshes.length,
      waterShaderSurfaces: this.waterControllers.length,
    };
  }

  private collectTreeWindMeshes(root: Object3D) {
    root.traverse((node) => {
      const mesh = node as InstancedMesh;
      if (mesh.isInstancedMesh && mesh.userData.canopyWind) {
        this.treeWindMeshes.push(mesh);
      }
    });
  }

  private updateWind(frame: FrameState, elapsed: number) {
    const planarSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
    const playerPush = frame.player.fallingToVoid || !frame.player.grounded
      ? 0
      : frame.player.rolling
        ? MathUtils.clamp(planarSpeed / 28, 0.18, 1)
        : MathUtils.clamp(planarSpeed / 20, 0, 0.28);
    this.windMeshes.forEach((mesh) => {
      const shader = mesh.userData.shader;
      if (shader) {
        shader.uniforms.uTime.value = elapsed;
        (shader.uniforms.uPlayerPosition.value as Vector3).copy(frame.player.position);
        (shader.uniforms.uPlayerVelocity.value as Vector3).set(frame.player.velocity.x, 0, frame.player.velocity.z);
        shader.uniforms.uPlayerPush.value = playerPush;
      }
    });
    this.treeWindMeshes.forEach((mesh) => {
      const shader = mesh.userData.windShader;
      if (shader) {
        shader.uniforms.uTime.value = elapsed;
      }
    });
  }

  private updateValleyMist(elapsed: number) {
    this.valleyMist.children.forEach((patch, index) => {
      const baseX = (patch.userData.baseX as number | undefined) ?? patch.position.x;
      const baseZ = (patch.userData.baseZ as number | undefined) ?? patch.position.z;
      patch.position.x = baseX + Math.sin(elapsed * 0.06 + index * 1.7) * 2.4;
      patch.position.z = baseZ + Math.cos(elapsed * 0.04 + index * 0.9) * 1.6;

      const mesh = patch as Mesh;
      const material = mesh.material as MeshBasicMaterial;
      material.opacity = ((patch.userData.baseOpacity as number | undefined) ?? 0.12) *
        (0.82 + Math.sin(elapsed * 0.18 + index) * 0.18);
    });
  }

  private updateWater(elapsed: number) {
    this.waterControllers.forEach((controller) => {
      controller.update(elapsed);
    });
  }

  private updateClouds(elapsed: number) {
    this.clouds.children.forEach((cloud: Object3D, index: number) => {
      const baseX = [-88, 42, -12, 98, -122][index] ?? 0;
      cloud.position.x = baseX + Math.sin(elapsed * 0.04 + index) * (6 + index * 1.4);
      cloud.position.z += 0.006 * (index + 1);
      if (cloud.position.z > 260) {
        cloud.position.z = -160;
      }
    });

    this.mountainAtmosphere.children.forEach((cluster: Object3D, index: number) => {
      const baseX = (cluster.userData.baseX as number | undefined) ?? cluster.position.x;
      const baseZ = (cluster.userData.baseZ as number | undefined) ?? cluster.position.z;
      cluster.position.x = baseX + Math.sin(elapsed * 0.09 + index * 1.7) * 1.8;
      cluster.position.z = baseZ + Math.cos(elapsed * 0.07 + index * 0.8) * 2.2;
      cluster.children.forEach((puff: Object3D, puffIndex: number) => {
        const baseY = (puff.userData.baseY as number | undefined) ?? puff.position.y;
        puff.position.y = baseY + Math.sin(elapsed * 0.28 + puffIndex * 0.9 + index) * 0.7;
      });
    });
  }

  private updateLandingSplash(frame: FrameState, dt: number) {
    if (frame.player.justLanded) {
      this.emitLandingSplash(frame.player.position, frame.player.landingImpact);
    }

    this.landingParticles.forEach((particle) => {
      if (particle.age >= particle.life) {
        particle.mesh.visible = false;
        return;
      }

      particle.age += dt;
      const lifeT = Math.min(1, particle.age / particle.life);
      const easeOut = Math.sin(lifeT * Math.PI);
      const spread = easeOut * particle.bend;
      this.landingPosition
        .copy(particle.origin)
        .addScaledVector(particle.direction, spread)
        .addScaledVector(particle.normal, 0.05 + easeOut * 0.18);
      particle.mesh.position.copy(this.landingPosition);

      this.landingQuat.setFromUnitVectors(this.landingUp, particle.normal);
      particle.mesh.quaternion.copy(this.landingQuat);
      particle.mesh.rotateOnAxis(this.landingUp, particle.twist);
      particle.mesh.rotateX(-0.28 - (1 - lifeT) * 0.42);
      particle.mesh.rotateZ((Math.sin(lifeT * Math.PI * 1.2) * 0.16 + 0.06) * (particle.twist > 0 ? 1 : -1));

      const width = particle.width * (0.45 + easeOut * 0.85);
      const height = particle.height * (0.2 + easeOut * 0.95) * (1 - lifeT * 0.32);
      particle.mesh.scale.set(width, height, 1);
      particle.mesh.visible = true;
      const material = particle.mesh.material as MeshLambertMaterial;
      material.opacity = Math.max(0, (1 - lifeT) * 0.88);
      if (lifeT >= 1) {
        particle.mesh.visible = false;
      }
    });
  }

  private emitLandingSplash(origin: Vector3, impact: number) {
    this.landingParticles.forEach((particle, index) => {
      const angle = (index / this.landingParticles.length) * Math.PI * 2 + Math.random() * 0.28;
      const radius = 0.45 + Math.random() * 1.4 * Math.max(0.7, impact);
      const x = origin.x + Math.cos(angle) * radius;
      const z = origin.z + Math.sin(angle) * radius;
      const y = sampleTerrainHeight(x, z) + 0.04;
      this.landingNormal.copy(sampleTerrainNormal(x, z));

      particle.origin.set(x, y, z);
      particle.normal.copy(this.landingNormal);
      particle.direction
        .set(Math.cos(angle), 0, Math.sin(angle))
        .projectOnPlane(this.landingNormal)
        .normalize();

      if (particle.direction.lengthSq() < 0.001) {
        particle.direction.set(Math.cos(angle), 0, Math.sin(angle)).normalize();
      }

      particle.age = 0;
      particle.life = 0.26 + Math.random() * 0.14;
      particle.height = (0.9 + Math.random() * 1.2) * (0.85 + impact * 0.35);
      particle.width = 0.65 + Math.random() * 0.38;
      particle.bend = (0.45 + Math.random() * 0.9) * impact;
      particle.twist = (Math.random() - 0.5) * 1.4;
      particle.mesh.position.copy(particle.origin);
      particle.mesh.scale.set(0.2, 0.12, 1);
      particle.mesh.visible = true;
      const material = particle.mesh.material as MeshLambertMaterial;
      material.opacity = 0.88;
    });
  }

  private updateSnowTrail(frame: FrameState, dt: number) {
    const player = frame.player;
    const planarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const shouldEmit = player.rolling && player.grounded && planarSpeed > 3.4;

    if (shouldEmit) {
      this.trailEmissionCarry += dt * MathUtils.clamp(planarSpeed * 0.45, 2.2, 9);
      while (this.trailEmissionCarry >= 1) {
        this.emitSnowTrailPuff(player.position, player.velocity);
        this.trailEmissionCarry -= 1;
      }
    } else {
      this.trailEmissionCarry = 0;
    }

    this.snowTrailParticles.forEach((particle) => {
      if (particle.age >= particle.life) {
        particle.mesh.visible = false;
        return;
      }

      particle.age += dt;
      const lifeT = Math.min(1, particle.age / particle.life);
      particle.origin.addScaledVector(particle.velocity, dt);
      particle.velocity.y += dt * 1.4;
      particle.mesh.position.copy(particle.origin);
      const size = MathUtils.lerp(0.16, 0.34 + particle.drift * 0.08, lifeT);
      particle.mesh.scale.setScalar(size);
      particle.mesh.visible = true;
      const material = particle.mesh.material as MeshLambertMaterial;
      material.opacity = Math.max(0, (1 - lifeT) * 0.55);
      if (lifeT >= 1) {
        particle.mesh.visible = false;
      }
    });
  }

  private emitSnowTrailPuff(origin: Vector3, velocity: Vector3) {
    const particle = this.snowTrailParticles.find((entry) => entry.age >= entry.life) ?? this.snowTrailParticles[0];
    this.trailVelocity.set(velocity.x, 0, velocity.z);
    if (this.trailVelocity.lengthSq() > 0.001) {
      this.trailDirection.copy(this.trailVelocity).normalize();
    } else {
      this.trailDirection.set(0, 0, -1);
    }

    const side = Math.random() > 0.5 ? 1 : -1;
    const sideX = -this.trailDirection.z * 0.35 * side;
    const sideZ = this.trailDirection.x * 0.35 * side;
    const x = origin.x - this.trailDirection.x * 1.05 + sideX;
    const z = origin.z - this.trailDirection.z * 1.05 + sideZ;
    const y = sampleTerrainHeight(x, z) + 0.22;

    particle.origin.set(x, y, z);
    particle.velocity.set(
      -this.trailDirection.x * (0.8 + Math.random() * 0.55) + sideX * 0.12,
      0.5 + Math.random() * 0.45,
      -this.trailDirection.z * (0.8 + Math.random() * 0.55) + sideZ * 0.12,
    );
    particle.age = 0;
    particle.life = 0.24 + Math.random() * 0.16;
    particle.drift = 0.7 + Math.random() * 0.8;
    particle.mesh.position.copy(particle.origin);
    particle.mesh.scale.setScalar(0.12);
    particle.mesh.visible = true;
    const material = particle.mesh.material as MeshLambertMaterial;
    material.opacity = 0.55;
  }

  private updateMapMarkers(frame: FrameState, elapsed: number, mapLookdown: boolean) {
    this.mapMarkerGroup.visible = mapLookdown;
    if (!mapLookdown) {
      return;
    }

    const player = frame.player.position;
    const playerGround = sampleTerrainHeight(player.x, player.z);
    this.playerMapMarker.group.position.set(player.x, playerGround + 0.2, player.z);
    this.shrineMapMarker.group.position.set(2, sampleTerrainHeight(2, 214) + 0.2, 214);

    [this.playerMapMarker, this.shrineMapMarker, ...this.landmarkMapMarkers].forEach((marker, index) => {
      const pulse = 1 + Math.sin(elapsed * marker.pulseSpeed + index * 0.9) * 0.08;
      const highlightBoost = marker === this.playerMapMarker ? 1.95 : marker === this.shrineMapMarker ? 1.6 : 1.28;
      marker.group.scale.setScalar(marker.baseScale * pulse * highlightBoost);
    });
  }
}
