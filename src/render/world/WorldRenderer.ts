import {
  AmbientLight,
  BufferGeometry,
  Camera,
  CircleGeometry,
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
  Material,
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
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FrameState } from "../../simulation/gameState";
import {
  ForageableKind,
  sampleBaseTerrainHeight,
  sampleBiomeZone,
  sampleIslandBoundaryPoint,
  sampleTerrainHeight,
  sampleTerrainNormal,
  sampleWaterState,
  sampleWindField,
  shadowPockets,
  STARTING_WATER_POOLS,
  startingLookTarget,
  startingPosition,
  worldLandmarks,
  worldForageables,
  worldMapMarkers,
} from "../../simulation/world";
import { MossuAvatar } from "../objects/MossuAvatar";
import { OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";
import {
  createGrassMesh,
  createGrassPatchImpostorMesh,
  getGrassMeshLodStats,
  GrassShader,
  updateGrassMeshLod,
} from "./grassSystem";
import {
  buildClouds,
  buildMountainAtmosphere,
  buildSkyDome,
  buildStylizedSkySun,
  syncAtmosphereLighting,
  syncStylizedSkySun,
} from "./atmosphereSystem";
import { AmbientMoteSystem, buildAmbientMotes } from "./ambientMotes";
import { buildOceanSystem, type OceanSystem } from "./oceanSystem";
import {
  AMBIENT_BLOB_SPECIES_NAME,
  AmbientBlob,
  AmbientBlobUpdateStats,
  buildAmbientBlobs,
  buildAmbientBlobNests,
  updateAmbientBlobs,
} from "./ambientBlobs";
import {
  buildAnchorSceneAccents,
  buildBiomeTransitionAccents,
  buildForestGroveAccents,
  buildGroundLayer,
  buildHighlandAccents,
  buildLandmarkTrees,
  buildMidLayer,
  buildTreeClusters,
  buildWaterBankAccents,
} from "./terrainDecorations";
import { markCameraCollider } from "./sceneHelpers";
import {
  batchStaticDecorations,
  freezeStaticHierarchy,
  moveChildren,
} from "./staticBatching";
import {
  countGeometryTriangles,
  countGeometryVertices,
  countInstancedTriangles,
} from "./geometryStats";
import {
  applySceneLightingColors,
  applySceneLightingMood,
  applySunRig,
  getAtmosphereHorizonTints,
  getSunDirectionWorld,
  type SceneColorPairs,
  writePatchSceneLightingUniforms,
} from "./sceneLighting";
import { buildTerrainFormStrokes, makeTerrainMesh } from "./terrainMesh";
import {
  buildHighlandWaterways,
  WaterSystem,
} from "./waterSystem";
import {
  buildGrasslandImmersionSystem,
  updateGrasslandImmersionSystem,
} from "./grasslandImmersion";

const grasslandsArt = OOT_PS2_GRASSLANDS_PALETTE;

/** Instanced blade budgets — raise together when tuning meadow lushness vs GPU cost */
const GRASS_COUNT = 11500;
const FAR_GRASS_PATCH_COUNT = 1150;
const ALPINE_GRASS_COUNT = 1850;
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
  webGpuCompatibleMaterials?: boolean;
  waterDepthDebug?: boolean;
}

export interface WorldPerfStats {
  terrainVertices: number;
  terrainTriangles: number;
  grassMeshes: number;
  grassInstances: number;
  grassEstimatedTriangles: number;
  grassImpostorMeshes: number;
  grassImpostorInstances: number;
  grassImpostorEstimatedTriangles: number;
  grassLodCells: number;
  grassLodSourceInstances: number;
  grassLodVisitedCells: number;
  grassLodVisitedSources: number;
  forestMeshes: number;
  forestInstances: number;
  forestEstimatedTriangles: number;
  smallPropMeshes: number;
  smallPropInstances: number;
  smallPropEstimatedTriangles: number;
  waterSurfaces: number;
  waterVertices: number;
  waterTriangles: number;
  animatedShaderMeshes: number;
  grassShaderMeshes: number;
  treeShaderMeshes: number;
  waterShaderSurfaces: number;
}

export interface WorldQaStats {
  smallPropMeshes: number;
  smallPropInstances: number;
  smallPropMeshesUsingGeometryVertexColors: number;
  smallPropMeshesMissingInstanceColors: number;
  emptySmallPropMeshes: number;
}

function buildOpeningNestVista() {
  const group = new Group();
  group.name = "opening-nest-vista";

  const forward = new Vector3().subVectors(startingLookTarget, startingPosition).setY(0).normalize();
  const right = new Vector3(forward.z, 0, -forward.x).normalize();
  const nestCenter = startingPosition.clone().addScaledVector(forward, 25).addScaledVector(right, -0.7);
  nestCenter.y = sampleTerrainHeight(nestCenter.x, nestCenter.z);

  const nestFloorMaterial = new MeshLambertMaterial({
    color: "#b9a978",
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: DoubleSide,
  });
  const softLeafMaterial = new MeshLambertMaterial({ color: "#8fc86a" });
  const darkLeafMaterial = new MeshLambertMaterial({ color: "#6fa257" });
  const mossLeafMaterial = new MeshLambertMaterial({ color: "#b8d873" });
  const twigMaterial = new MeshLambertMaterial({ color: "#8a6a43" });
  const pebbleMaterial = new MeshStandardMaterial({ color: "#c8c3aa", roughness: 1, metalness: 0 });
  const flowerMaterial = new MeshBasicMaterial({ color: "#f7f4d6", transparent: true, opacity: 0.92 });
  const pollenMaterial = new MeshBasicMaterial({ color: "#ffd76a", transparent: true, opacity: 0.88 });

  const floor = new Mesh(new CircleGeometry(1, 34), nestFloorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = Math.atan2(forward.x, forward.z) + 0.2;
  floor.position.set(nestCenter.x, nestCenter.y + 0.045, nestCenter.z);
  floor.scale.set(5.9, 3.6, 1);
  group.add(floor);

  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2 + Math.sin(i * 1.7) * 0.12;
    const ringRadius = 3.6 + (i % 5) * 0.28 + Math.sin(i * 2.31) * 0.34;
    const x = nestCenter.x + Math.cos(angle) * ringRadius + forward.x * Math.sin(i * 0.9) * 0.55;
    const z = nestCenter.z + Math.sin(angle) * ringRadius + forward.z * Math.sin(i * 0.9) * 0.55;
    const y = sampleTerrainHeight(x, z);
    const material = i % 5 === 0 ? mossLeafMaterial : i % 3 === 0 ? darkLeafMaterial : softLeafMaterial;
    const clump = new Mesh(new SphereGeometry(1, 10, 8), material);
    clump.position.set(x, y + 0.16 + (i % 4) * 0.018, z);
    clump.rotation.y = angle;
    clump.scale.set(0.8 + (i % 4) * 0.16, 0.12 + (i % 3) * 0.03, 0.32 + (i % 5) * 0.05);
    group.add(clump);
  }

  for (let i = 0; i < 13; i += 1) {
    const angle = (i / 13) * Math.PI * 2 + 0.28;
    const radius = 2.3 + (i % 4) * 0.42;
    const x = nestCenter.x + Math.cos(angle) * radius;
    const z = nestCenter.z + Math.sin(angle) * radius;
    const twig = new Mesh(new CylinderGeometry(0.045, 0.06, 1.25 + (i % 4) * 0.2, 6), twigMaterial);
    twig.position.set(x, sampleTerrainHeight(x, z) + 0.18, z);
    twig.rotation.set(0.06 * Math.sin(i), angle + Math.PI / 2, Math.PI / 2 + Math.sin(i * 0.8) * 0.18);
    group.add(twig);
  }

  for (let i = 0; i < 14; i += 1) {
    const distance = 6.2 + i * 2.6;
    const lateral = Math.sin(i * 1.42) * 1.4 + (i % 2 === 0 ? -0.28 : 0.28);
    const x = nestCenter.x + forward.x * distance + right.x * lateral;
    const z = nestCenter.z + forward.z * distance + right.z * lateral;
    const y = sampleTerrainHeight(x, z);
    const stone = new Mesh(new SphereGeometry(1, 10, 8), pebbleMaterial);
    stone.position.set(x, y + 0.11, z);
    stone.rotation.y = Math.sin(i * 2.1);
    stone.scale.set(0.38 + (i % 4) * 0.06, 0.1, 0.28 + (i % 3) * 0.05);
    group.add(stone);
  }

  for (let i = 0; i < 18; i += 1) {
    const distance = 9 + (i % 9) * 4.2;
    const side = i < 9 ? -1 : 1;
    const lateral = side * (3.3 + Math.sin(i * 1.37) * 1.2);
    const x = nestCenter.x + forward.x * distance + right.x * lateral;
    const z = nestCenter.z + forward.z * distance + right.z * lateral;
    const y = sampleTerrainHeight(x, z);
    const stem = new Mesh(new ConeGeometry(0.06, 0.62 + (i % 3) * 0.08, 6), mossLeafMaterial);
    stem.position.set(x, y + 0.3, z);
    stem.rotation.z = side * 0.12 + Math.sin(i) * 0.08;
    group.add(stem);

    if (i % 3 === 0) {
      const flower = new Mesh(new SphereGeometry(0.12, 8, 6), i % 2 === 0 ? flowerMaterial : pollenMaterial);
      flower.position.set(x, y + 0.72, z);
      flower.scale.set(1.2, 0.45, 1.2);
      group.add(flower);
    }
  }

  return group;
}

function buildOpeningWaterComposition() {
  const group = new Group();
  group.name = "opening-water-composition";

  const dampMaterial = new MeshLambertMaterial({
    color: "#86a77b",
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    side: DoubleSide,
  });
  const sandMaterial = new MeshLambertMaterial({
    color: "#d6c487",
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
    side: DoubleSide,
  });
  const wetSandMaterial = new MeshLambertMaterial({
    color: "#9eb68b",
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: DoubleSide,
  });
  const reedMaterial = new MeshLambertMaterial({ color: "#6fa759", side: DoubleSide });
  const reedTipMaterial = new MeshLambertMaterial({ color: "#c89c58" });
  const stoneMaterial = new MeshStandardMaterial({ color: "#bfc5b2", roughness: 1, metalness: 0 });

  const patchGeometry = new CircleGeometry(1, 18);
  patchGeometry.rotateX(-Math.PI / 2);
  const reedGeometry = new ConeGeometry(0.08, 1, 6);
  const reedTipGeometry = new SphereGeometry(0.12, 8, 6);
  const stoneGeometry = new SphereGeometry(1, 10, 8);

  const addPatch = (material: MeshLambertMaterial, x: number, z: number, sx: number, sz: number, yaw: number) => {
    const patch = new Mesh(patchGeometry, material);
    patch.position.set(x, sampleTerrainHeight(x, z) + 0.066, z);
    patch.rotation.y = yaw;
    patch.scale.set(sx, 1, sz);
    patch.renderOrder = 1;
    group.add(patch);
  };

  const addReedCluster = (x: number, z: number, seed: number) => {
    const count = 3 + (seed % 3);
    for (let i = 0; i < count; i += 1) {
      const offsetX = Math.sin(seed * 1.7 + i * 2.1) * 0.42;
      const offsetZ = Math.cos(seed * 1.3 + i * 1.9) * 0.42;
      const reedX = x + offsetX;
      const reedZ = z + offsetZ;
      const height = 1.1 + ((seed + i) % 4) * 0.22;
      const reed = new Mesh(reedGeometry, reedMaterial);
      reed.position.set(reedX, sampleTerrainHeight(reedX, reedZ) + height * 0.5, reedZ);
      reed.rotation.z = Math.sin(seed + i) * 0.16;
      reed.scale.set(0.8, height, 0.8);
      group.add(reed);

      if ((seed + i) % 2 === 0) {
        const tip = new Mesh(reedTipGeometry, reedTipMaterial);
        tip.position.set(reedX, sampleTerrainHeight(reedX, reedZ) + height + 0.06, reedZ);
        tip.scale.set(0.68, 0.34, 0.68);
        group.add(tip);
      }
    }
  };

  STARTING_WATER_POOLS.forEach((pool, poolIndex) => {
    const isMainLake = pool.id === "opening-lake";
    const patchCount = isMainLake ? 48 : 18;
    for (let i = 0; i < patchCount; i += 1) {
      const angle = (i / patchCount) * Math.PI * 2 + Math.sin(i * 1.93 + poolIndex) * 0.08;
      const scallop = Math.sin(i * 2.37 + pool.x * 0.04 + pool.z * 0.02);
      const shoreScale = 0.96 + scallop * 0.06 + (i % 5) * 0.012;
      const edgeX = pool.x + Math.cos(angle) * pool.renderRadiusX * shoreScale;
      const edgeZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * shoreScale;
      const tangentYaw = -angle + Math.PI * 0.5;
      const longAxis = isMainLake ? 3.6 + (i % 4) * 0.4 : 2.5 + (i % 3) * 0.34;
      const shortAxis = isMainLake ? 0.8 + (i % 3) * 0.16 : 0.62 + (i % 2) * 0.16;
      addPatch(i % 4 === 0 ? wetSandMaterial : dampMaterial, edgeX, edgeZ, longAxis, shortAxis, tangentYaw);

      if (isMainLake && (i % 6 === 0 || (i > 28 && i < 40 && i % 3 === 0))) {
        const sandX = pool.x + Math.cos(angle) * pool.renderRadiusX * (0.78 + scallop * 0.04);
        const sandZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * (0.78 + scallop * 0.04);
        addPatch(sandMaterial, sandX, sandZ, 2.6 + (i % 5) * 0.3, 0.62 + (i % 4) * 0.12, tangentYaw + 0.2);
      }

      if ((isMainLake && i % 5 === 0) || (!isMainLake && i % 7 === 0)) {
        const reedX = pool.x + Math.cos(angle) * pool.renderRadiusX * 1.08;
        const reedZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * 1.08;
        addReedCluster(reedX, reedZ, i + poolIndex * 19);
      }
    }
  });

  const forward = new Vector3().subVectors(startingLookTarget, startingPosition).setY(0).normalize();
  const right = new Vector3(forward.z, 0, -forward.x).normalize();
  for (let i = 0; i < 18; i += 1) {
    const distance = 22 + i * 4.2;
    const lateral = Math.sin(i * 1.41) * 4.6 + (i % 2 === 0 ? -2.2 : 2.2);
    const x = startingPosition.x + forward.x * distance + right.x * lateral;
    const z = startingPosition.z + forward.z * distance + right.z * lateral;
    const stone = new Mesh(stoneGeometry, stoneMaterial);
    stone.position.set(x, sampleTerrainHeight(x, z) + 0.13, z);
    stone.rotation.y = Math.sin(i * 1.9);
    stone.scale.set(0.52 + (i % 4) * 0.12, 0.12, 0.36 + (i % 3) * 0.08);
    group.add(stone);
  }

  return group;
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
        color: new Color().setHSL(pocket.hue, 0.1, 0.7 + i * 0.035),
        transparent: true,
        opacity: 0.012 - i * 0.002,
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
    [-54, -118, 54, 20, 3.6, 0.026, -0.08],
    [-8, -28, 112, 34, 7.2, 0.036, 0.04],
    [26, 72, 92, 26, 10.2, 0.03, -0.14],
    [18, 134, 84, 28, 13.4, 0.024, 0.1],
    [2, 158, 120, 32, 16.4, 0.03, 0.04],
    [-18, 190, 134, 40, 17, 0.034, -0.02],
    [-36, 222, 148, 34, 21, 0.024, -0.06],
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
  group.name = "floating-island-shell";

  const upperMaterial = new MeshStandardMaterial({ color: "#d4cdb8", roughness: 0.98, side: DoubleSide });
  const lowerMaterial = new MeshStandardMaterial({ color: "#b9b7a2", roughness: 0.99, side: DoubleSide });
  const lowerShadowMaterial = new MeshStandardMaterial({ color: "#9fa28d", roughness: 0.99, side: DoubleSide });
  const underbellyMaterial = new MeshStandardMaterial({ color: "#788d77", roughness: 0.99, side: DoubleSide, metalness: 0.02 });
  const mossMaterial = new MeshStandardMaterial({
    color: "#6f965d",
    roughness: 0.97,
    side: DoubleSide,
    emissive: new Color("#1a2a16"),
    emissiveIntensity: 0.22,
  });
  const rimLipMaterial = new MeshStandardMaterial({ color: "#8a9f72", roughness: 0.9, side: DoubleSide });
  const hangMaterial = new MeshStandardMaterial({ color: "#727467", roughness: 0.97, side: DoubleSide });
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

  const maxR = Math.max(radiusX, radiusZ);
  const upperSkirt = new Mesh(new CylinderGeometry(1.04, 0.86, 90, 40, 5, true), upperMaterial);
  upperSkirt.scale.set(radiusX * 1.02, 1, radiusZ * 1.04);
  upperSkirt.position.set(center.x, rimHeight - 57, center.z);
  markCameraCollider(upperSkirt);

  const mossBand = new Mesh(new CylinderGeometry(1, 0.95, 12, 40, 1, true), mossMaterial);
  mossBand.scale.set(radiusX * 1.03, 1, radiusZ * 1.05);
  mossBand.position.set(center.x, rimHeight - 8, center.z);
  markCameraCollider(mossBand);

  /** Upper taper: soil → overhang; lower taper: stronger shadow and pinching before the belly. */
  const lowerSkirtTop = new Mesh(new CylinderGeometry(0.86, 0.62, 64, 40, 5, true), lowerMaterial);
  lowerSkirtTop.scale.set(radiusX * 0.95, 1, radiusZ * 0.98);
  lowerSkirtTop.position.set(center.x, rimHeight - 127, center.z);
  markCameraCollider(lowerSkirtTop);

  const lowerSkirtBottom = new Mesh(new CylinderGeometry(0.62, 0.3, 64, 40, 5, true), lowerShadowMaterial);
  lowerSkirtBottom.scale.set(radiusX * 0.95, 1, radiusZ * 0.98);
  lowerSkirtBottom.position.set(center.x, rimHeight - 191, center.z);
  markCameraCollider(lowerSkirtBottom);

  const lowerBelly = new Mesh(new SphereGeometry(1.2, 22, 18), underbellyMaterial);
  lowerBelly.scale.set(radiusX * 0.55, 54, radiusZ * 0.5);
  lowerBelly.position.set(center.x, rimHeight - 240, center.z);
  markCameraCollider(lowerBelly);

  const rimLip = new TorusGeometry(1, 0.04, 8, 56);
  const rimMesh = new Mesh(rimLip, rimLipMaterial);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.set(center.x, rimHeight - 2.2, center.z);
  rimMesh.scale.set(radiusX * 0.96, 1, radiusZ * 0.96);
  markCameraCollider(rimMesh);

  const mist1 = new Mesh(
    new CircleGeometry(maxR * 1.14, 56),
    new MeshBasicMaterial({
      color: "#d0e2ec",
      transparent: true,
      opacity: 0.065,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist1.rotation.x = -Math.PI / 2;
  mist1.position.set(center.x, rimHeight - 30, center.z);

  const mist2 = new Mesh(
    new CircleGeometry(maxR * 0.88, 48),
    new MeshBasicMaterial({
      color: "#bdd3dd",
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist2.rotation.x = -Math.PI / 2;
  mist2.position.set(center.x, rimHeight - 56, center.z);

  const mist3 = new Mesh(
    new CircleGeometry(maxR * 0.64, 40),
    new MeshBasicMaterial({
      color: "#aac1cb",
      transparent: true,
      opacity: 0.028,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist3.rotation.x = -Math.PI / 2;
  mist3.position.set(center.x, rimHeight - 88, center.z);

  group.add(upperSkirt, mossBand, lowerSkirtTop, lowerSkirtBottom, lowerBelly, rimMesh, mist1, mist2, mist3);

  for (let h = 0; h < 10; h += 1) {
    const ang = (h / 10) * Math.PI * 2 + 0.41;
    const hang = new Mesh(new ConeGeometry(1.4 + (h % 3) * 0.9, 5.5 + (h % 4) * 2, 5), hangMaterial);
    hang.position.set(
      center.x + Math.cos(ang) * radiusX * 0.8,
      rimHeight - 20 - (h % 3) * 2.5,
      center.z + Math.sin(ang) * radiusZ * 0.8,
    );
    hang.rotation.set(Math.PI, 0, -ang);
    markCameraCollider(hang);
    group.add(hang);
  }

  perimeter.forEach((point, index) => {
    const useUpper = index % 3 === 0;
    const cliffBulge = markCameraCollider(
      new Mesh(new SphereGeometry(1.08, 10, 8), useUpper ? upperMaterial : lowerMaterial),
    );
    cliffBulge.scale.set(14 + (index % 4) * 4, 24 + (index % 3) * 8, 16 + (index % 5) * 3);
    cliffBulge.position.set(
      point.x * 0.99 + center.x * 0.01,
      point.y - 28 - (index % 4) * 7.5,
      point.z * 0.99 + center.z * 0.01,
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

function createSeedPickup(seed: number) {
  const group = new Group();
  const huskMaterial = new MeshLambertMaterial({ color: seed % 2 === 0 ? "#d9a85f" : "#c88f52" });
  const capMaterial = new MeshLambertMaterial({ color: "#7aa55f" });

  [-0.28, 0, 0.27].forEach((offset, index) => {
    const seedMesh = new Mesh(new SphereGeometry(0.24 + index * 0.02, 12, 8), huskMaterial);
    seedMesh.position.set(offset, 0.24 + index * 0.02, (index - 1) * 0.08);
    seedMesh.scale.set(0.82, 1.18, 0.72);
    seedMesh.rotation.z = offset * -1.6;
    group.add(seedMesh);
  });

  const sprout = new Mesh(new PlaneGeometry(0.6, 0.22, 1, 1), capMaterial);
  sprout.position.set(0.06, 0.56, 0);
  sprout.rotation.set(-0.4, 0.2, -0.38);
  group.add(sprout);

  group.scale.setScalar(1 + (seed % 3) * 0.05);
  return group;
}

function createShellPickup(seed: number) {
  const group = new Group();
  const shellMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#f2dfc9" : "#e9d5c5",
  });
  const ridgeMaterial = new MeshLambertMaterial({ color: "#d6b89e" });

  const shell = new Mesh(new SphereGeometry(0.56, 16, 10), shellMaterial);
  shell.scale.set(1.18, 0.34, 0.8);
  shell.position.y = 0.25;
  group.add(shell);

  [-0.28, -0.12, 0.04, 0.2, 0.35].forEach((x, index) => {
    const ridge = new Mesh(new CylinderGeometry(0.024, 0.035, 0.72 - Math.abs(x) * 0.7, 6), ridgeMaterial);
    ridge.position.set(x, 0.32, 0.03);
    ridge.rotation.set(Math.PI / 2, 0, 0.15 + index * 0.05);
    group.add(ridge);
  });

  return group;
}

function createMossTuftPickup(seed: number) {
  const group = new Group();
  const baseMaterial = new MeshLambertMaterial({ color: seed % 2 === 0 ? "#5f9d68" : "#6baa62" });
  const tipMaterial = new MeshLambertMaterial({ color: "#9edc83" });

  [-0.34, -0.15, 0.05, 0.24, 0.38].forEach((offset, index) => {
    const strand = new Mesh(new ConeGeometry(0.12 + (index % 2) * 0.03, 0.72 + index * 0.08, 7), baseMaterial);
    strand.position.set(offset, 0.36 + index * 0.02, (index - 2) * 0.06);
    strand.rotation.z = offset * -0.8;
    group.add(strand);
  });

  const glowTip = new Mesh(new SphereGeometry(0.18, 10, 8), tipMaterial);
  glowTip.position.set(0.02, 0.82, 0);
  glowTip.scale.set(1.25, 0.55, 1);
  group.add(glowTip);

  group.scale.setScalar(0.96 + (seed % 3) * 0.06);
  return group;
}

function createBerryPickup(seed: number) {
  const group = new Group();
  const stemMaterial = new MeshLambertMaterial({ color: "#5f7845" });
  const berryMaterial = new MeshLambertMaterial({
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
    const berry = new Mesh(new SphereGeometry(index === 0 ? 0.34 : 0.28, 12, 10), berryMaterial);
    berry.position.set(x as number, y as number, z as number);
    berry.scale.set(1, 0.92, 1);
    group.add(berry);
  });

  const leaf = new Mesh(new PlaneGeometry(0.68, 0.3, 1, 1), leafMaterial);
  leaf.position.set(0.14, 1.03, -0.06);
  leaf.rotation.set(-0.5, 0.45, -0.28);
  group.add(leaf);

  group.scale.setScalar(1 + (seed % 3) * 0.08);
  return group;
}

function createSmoothStonePickup(seed: number) {
  const group = new Group();
  const stoneMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#9eb2b2" : "#8fa4b8",
  });
  const highlightMaterial = new MeshLambertMaterial({
    color: "#cbd9d4",
    transparent: true,
    opacity: 0.82,
    side: DoubleSide,
  });

  const stone = new Mesh(new SphereGeometry(0.52, 16, 10), stoneMaterial);
  stone.scale.set(1.34, 0.36, 0.86);
  stone.position.y = 0.24;
  group.add(stone);

  const shine = new Mesh(new PlaneGeometry(0.48, 0.12, 1, 1), highlightMaterial);
  shine.position.set(-0.12, 0.43, 0.24);
  shine.rotation.set(-0.5, 0.1, -0.22);
  group.add(shine);

  return group;
}

function createFeatherPickup(seed: number) {
  const group = new Group();
  const shaftMaterial = new MeshLambertMaterial({ color: "#d8bc88" });
  const vaneMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#f4ead2" : "#dbe9f3",
    transparent: true,
    opacity: 0.92,
    side: DoubleSide,
  });

  const shaft = new Mesh(new CylinderGeometry(0.025, 0.035, 1.18, 7), shaftMaterial);
  shaft.position.y = 0.58;
  shaft.rotation.z = -0.28;
  group.add(shaft);

  const leftVane = new Mesh(new PlaneGeometry(0.34, 0.9, 1, 1), vaneMaterial);
  leftVane.position.set(-0.16, 0.74, 0);
  leftVane.rotation.set(0, 0.1, -0.42);
  group.add(leftVane);

  const rightVane = new Mesh(new PlaneGeometry(0.32, 0.82, 1, 1), vaneMaterial.clone());
  rightVane.position.set(0.18, 0.7, 0.02);
  rightVane.rotation.set(0, -0.12, 0.22);
  group.add(rightVane);

  group.scale.setScalar(1.05 + (seed % 3) * 0.05);
  return group;
}

function createForageablePickup(kind: ForageableKind, seed: number) {
  switch (kind) {
    case "seed":
      return createSeedPickup(seed);
    case "shell":
      return createShellPickup(seed);
    case "moss_tuft":
      return createMossTuftPickup(seed);
    case "berry":
      return createBerryPickup(seed);
    case "smooth_stone":
      return createSmoothStonePickup(seed);
    case "feather":
      return createFeatherPickup(seed);
  }
}

function getForageablePickupLift(kind: ForageableKind) {
  switch (kind) {
    case "seed":
    case "shell":
    case "smooth_stone":
      return 0.58;
    case "moss_tuft":
      return 0.78;
    case "berry":
      return 1.15;
    case "feather":
      return 0.92;
  }
}

function buildForageableVisuals() {
  return worldForageables.map<ForageableVisual>((forageable, index) => {
    const group = createForageablePickup(forageable.kind, index);
    group.position.copy(forageable.position);
    group.position.y += getForageablePickupLift(forageable.kind);
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

export class WorldRenderer {
  readonly mossu = new MossuAvatar();
  readonly terrain = makeTerrainMesh();
  readonly skyDome: Mesh;
  readonly skySun = buildStylizedSkySun();
  readonly clouds = new Group();
  readonly windMeshes: Array<InstancedMesh> = [];
  private readonly treeWindMeshes: Array<InstancedMesh> = [];
  private readonly treeLeafWindMeshes: Mesh[] = [];
  private readonly grassImpostorMeshes: Array<InstancedMesh> = [];
  private readonly smallPropMeshes: Array<InstancedMesh> = [];
  private readonly waterSystem: WaterSystem;
  private readonly cameraCollisionMeshes: Mesh[] = [];
  private readonly gameplayFog = new FogExp2(grasslandsArt.scene.fog, 0.00054);
  private readonly lowlandBackground = new Color(grasslandsArt.scene.lowlandBackground);
  private readonly highlandBackground = new Color(grasslandsArt.scene.highlandBackground);
  private readonly lowlandFogColor = new Color(grasslandsArt.scene.lowlandFog);
  private readonly highlandFogColor = new Color(grasslandsArt.scene.highlandFog);
  private readonly lowlandSunColor = new Color(grasslandsArt.scene.lowlandSun);
  private readonly highlandSunColor = new Color(grasslandsArt.scene.highlandSun);
  private readonly lowlandSkyFillColor = new Color(grasslandsArt.scene.lowlandSkyFill);
  private readonly highlandSkyFillColor = new Color(grasslandsArt.scene.highlandSkyFill);
  private readonly lowlandGroundFillColor = new Color(grasslandsArt.scene.lowlandGroundFill);
  private readonly highlandGroundFillColor = new Color(grasslandsArt.scene.highlandGroundFill);
  private readonly sceneColorPairs: SceneColorPairs = {
    sun: { lowland: this.lowlandSunColor, highland: this.highlandSunColor },
    skyFill: { lowland: this.lowlandSkyFillColor, highland: this.highlandSkyFillColor },
    skyGround: { lowland: this.lowlandGroundFillColor, highland: this.highlandGroundFillColor },
    fog: { lowland: this.lowlandFogColor, highland: this.highlandFogColor },
    background: { lowland: this.lowlandBackground, highland: this.highlandBackground },
  };
  private readonly ambientLight = new AmbientLight(grasslandsArt.scene.ambient, 1.06);
  private readonly skyFill = new HemisphereLight(grasslandsArt.scene.skyFill, grasslandsArt.scene.skyGround, 1.24);
  private readonly skyBounce = new DirectionalLight(grasslandsArt.scene.skyBounce, 0.42);
  private readonly scenePatchHaze = new Color();
  private readonly scenePatchBright = new Color();
  private readonly scenePatchShadow = new Color();
  private readonly scenePatchHorizon = new Color();
  private readonly scenePatchSunDir = new Vector3();
  private elevationMood = 0;
  private waterDepthDebug = false;
  private grassLodFrame = 0;
  private heroGrassPulse = 0;
  private environmentPulse = 0;

  private readonly shrine = buildShrine();
  private readonly terrainFormStrokes = buildTerrainFormStrokes();
  private readonly openingNestVista = batchStaticDecorations(buildOpeningNestVista(), "opening-nest-vista-batch");
  private readonly openingWaterComposition = batchStaticDecorations(buildOpeningWaterComposition(), "opening-water-composition-batch");
  private readonly islandShell = buildFloatingIslandShell();
  private readonly groundLayer = new Group();
  private readonly midLayer = new Group();
  private readonly treeClusters = new Group();
  private readonly forestGroveAccents = new Group();
  private readonly biomeTransitionAccents = batchStaticDecorations(buildBiomeTransitionAccents(), "biome-transition-batch");
  private readonly waterBankAccents = batchStaticDecorations(buildWaterBankAccents(), "water-bank-batch");
  private readonly anchorSceneAccents = batchStaticDecorations(buildAnchorSceneAccents(), "anchor-scene-batch");
  private readonly highlandAccents = batchStaticDecorations(buildHighlandAccents(), "highland-accent-batch");
  private readonly grasslandImmersion = buildGrasslandImmersionSystem();
  private readonly mountainAtmosphere = new Group();
  private readonly valleyMist = new Group();
  private readonly ambientMotes: AmbientMoteSystem = buildAmbientMotes();
  private readonly ocean: OceanSystem = buildOceanSystem();
  private readonly _moteWindScratch = new Vector3();
  private readonly shadowVolumes = new Group();
  private readonly landmarkTrees = new Group();
  private readonly mountainSilhouettes = new Group();
  private readonly sun = new DirectionalLight(grasslandsArt.scene.sun, 3.28);
  private readonly mossuContactShadow = new Mesh(
    new CircleGeometry(1, 32),
    new MeshBasicMaterial({
      color: grasslandsArt.scene.contactShadow,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  private readonly meadowGlow = new PointLight(grasslandsArt.scene.meadowGlow, 1.48, 220, 1.4);
  private readonly alpineGlow = new PointLight(grasslandsArt.scene.alpineGlow, 0.74, 260, 1.1);
  private readonly landingSplash = new Group();
  private readonly landingParticles: LandingSplashParticle[] = [];
  private readonly snowTrail = new Group();
  private readonly snowTrailParticles: SnowTrailParticle[] = [];
  private readonly ambientBlobs: AmbientBlob[] = [];
  private readonly ambientNestGroup = new Group();
  private readonly ambientBlobGroup = new Group();
  private faunaStats: AmbientBlobUpdateStats = {
    speciesName: AMBIENT_BLOB_SPECIES_NAME,
    recruitedCount: 0,
    nearestRecruitableDistance: null,
    recruitedThisFrame: 0,
    firstEncounterActive: false,
    rollingCount: 0,
    mossuCollisionCount: 0,
    dominantMood: "curious",
    regroupActive: false,
    callHeardActive: false,
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
  private readonly forageableVisuals: ForageableVisual[] = [];
  private readonly startupContentQueue: Array<() => void> = [];
  private startupIdleBuildHandle = 0;
  private readonly playerMapMarker: MapMarker = {
    group: createMapMarker(grasslandsArt.scene.playerMapMarker, 3.2, 12, 0.42),
    baseScale: 1,
    pulseSpeed: 4.2,
  };
  private readonly shrineMapMarker: MapMarker = {
    group: createMapMarker(grasslandsArt.scene.shrineMapMarker, 4.2, 18, 0.38),
    baseScale: 1,
    pulseSpeed: 2.4,
  };
  private readonly landmarkMapMarkers: Array<MapMarker> = [];
  private readonly atlasMapMarkers: Array<MapMarker> = [];
  private readonly deferredWorldSlices: Array<() => void> = [];
  private deferredWorldFrame = 0;

  constructor(private readonly scene: Scene, options: WorldRendererOptions = {}) {
    this.waterDepthDebug = options.waterDepthDebug ?? false;
    this.waterSystem = new WaterSystem({ depthDebug: this.waterDepthDebug });
    this.skyDome = buildSkyDome({
      webGpuCompatible: options.webGpuCompatibleMaterials ?? false,
    });
    scene.background = this.lowlandBackground.clone();
    scene.fog = this.gameplayFog;

    this.skyBounce.position.set(148, 126, 196);
    scene.add(this.ambientLight, this.skyFill, this.skyBounce);

    this.sun.castShadow = false;
    applySunRig(this.sun);
    scene.add(this.sun.target);
    scene.add(this.sun);
    this.meadowGlow.color.set(grasslandsArt.scene.meadowGlowRuntime);
    this.meadowGlow.intensity = 0.46;
    this.meadowGlow.distance = 240;
    this.meadowGlow.position.set(-186, 38, -122);
    this.alpineGlow.color.set(grasslandsArt.scene.alpineGlowRuntime);
    this.alpineGlow.intensity = 0.56;
    this.alpineGlow.position.set(44, 128, 186);
    scene.add(this.meadowGlow, this.alpineGlow);

    scene.add(this.skyDome);
    scene.add(this.skySun);
    scene.add(this.ocean.mesh);
    scene.add(this.terrain);
    scene.add(this.terrainFormStrokes);
    scene.add(this.openingNestVista);
    scene.add(this.openingWaterComposition);
    this.mossuContactShadow.rotation.x = -Math.PI / 2;
    this.mossuContactShadow.renderOrder = 1;
    scene.add(this.mossuContactShadow);
    scene.add(this.islandShell);
    scene.add(this.waterSystem.group);
    scene.add(this.groundLayer);
    scene.add(this.midLayer);
    scene.add(this.treeClusters);
    scene.add(this.forestGroveAccents);
    scene.add(this.biomeTransitionAccents);
    scene.add(this.waterBankAccents);
    scene.add(this.anchorSceneAccents);
    scene.add(this.highlandAccents);
    scene.add(this.grasslandImmersion.group);
    scene.add(this.mountainAtmosphere);
    scene.add(this.valleyMist);
    scene.add(this.ambientMotes.group);
    scene.add(this.landmarkTrees);
    scene.add(this.shadowVolumes);
    scene.add(this.shrine);
    scene.add(this.clouds);
    scene.add(this.mossu.group);
    scene.add(this.landingSplash);
    scene.add(this.snowTrail);
    scene.add(this.forageableGroup);
    scene.add(this.ambientNestGroup);
    scene.add(this.ambientBlobGroup);
    scene.add(this.mapMarkerGroup);

    const meadowNearGrass = createGrassMesh(
      Math.round(GRASS_COUNT * 0.5),
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color(grasslandsArt.grass.nearBottom),
      new Color(grasslandsArt.grass.nearTop),
      {
        crossPlanes: 2,
        bladeWidth: 0.74,
        bladeHeight: 3.85,
        placementMultiplier: 1.52,
        scaleMultiplier: 1.16,
        widthMultiplier: 1.06,
        fadeInStart: 5,
        fadeInEnd: 12,
        fadeOutStart: 38,
        fadeOutEnd: 76,
        rootFillBoost: 0.05,
        selfShadowStrength: 0.72,
        distanceCompressionBoost: 0.04,
        playerPushRadius: 16.5,
        playerPushStrength: 1.86,
        windExaggeration: 1.38,
        windTimeScale: 1,
        broadWindScale: 1.14,
        fineWindScale: 1.25,
        lod: {
          label: "near",
          innerRadius: 0,
          outerRadius: 76,
          cellSize: 22,
          sampleStride: 1,
          updateEveryFrames: 4,
          movementThreshold: 1.8,
        },
      },
    );
    const meadowMidGrass = createGrassMesh(
      Math.round(GRASS_COUNT * 0.34),
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color(grasslandsArt.grass.midBottom),
      new Color(grasslandsArt.grass.midTop),
      {
        crossPlanes: 1,
        bladeWidth: 0.94,
        bladeHeight: 3.32,
        placementMultiplier: 1.42,
        scaleMultiplier: 1.08,
        widthMultiplier: 1.12,
        fadeInStart: 24,
        fadeInEnd: 44,
        fadeOutStart: 96,
        fadeOutEnd: 144,
        rootFillBoost: 0.18,
        selfShadowStrength: 0.58,
        distanceCompressionBoost: 0.14,
        playerPushRadius: 15.5,
        playerPushStrength: 1.6,
        windExaggeration: 1.34,
        windTimeScale: 0.82,
        broadWindScale: 0.96,
        fineWindScale: 0.55,
        lod: {
          label: "mid",
          innerRadius: 48,
          outerRadius: 168,
          cellSize: 34,
          sampleStride: 2,
          updateEveryFrames: 6,
          movementThreshold: 3,
        },
      },
    );
    const meadowFarGrassPatches = createGrassPatchImpostorMesh(
      FAR_GRASS_PATCH_COUNT,
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color(grasslandsArt.grass.farBottom),
      new Color(grasslandsArt.grass.farTop),
      {
        placementMultiplier: 1.28,
        scaleMultiplier: 1.04,
        opacity: 0.3,
      },
    );
    const alpineGrass = createGrassMesh(
      ALPINE_GRASS_COUNT,
      (zone) => zone === "alpine" || zone === "ridge",
      new Color(grasslandsArt.grass.alpineBottom),
      new Color(grasslandsArt.grass.alpineTop),
      {
        crossPlanes: 1,
        bladeHeight: 2.48,
        placementMultiplier: 1.12,
        scaleMultiplier: 0.86,
        selfShadowStrength: 0.42,
        distanceCompressionBoost: 0.24,
        playerPushRadius: 11.5,
        playerPushStrength: 1.08,
        windExaggeration: 1.26,
        windTimeScale: 0.58,
        broadWindScale: 0.96,
        fineWindScale: 0.24,
        lod: {
          label: "alpine",
          innerRadius: 34,
          outerRadius: 340,
          cellSize: 52,
          sampleStride: 2,
          updateEveryFrames: 10,
          movementThreshold: 8,
        },
      },
    );
    this.windMeshes.push(meadowNearGrass, meadowMidGrass, alpineGrass);
    this.grassImpostorMeshes.push(meadowFarGrassPatches);
    scene.add(meadowFarGrassPatches, meadowNearGrass, meadowMidGrass, alpineGrass);

    scene.add(this.mountainSilhouettes);

    const splashGeometry = new PlaneGeometry(0.3, 1.15, 1, 5);
    splashGeometry.translate(0, 0.58, 0);
    for (let i = 0; i < LANDING_SPLASH_PARTICLES; i += 1) {
      const material = new MeshLambertMaterial({
        color: i % 4 === 0 ? "#a7d17e" : i % 3 === 0 ? "#89bd68" : "#6da357",
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
    worldMapMarkers.forEach((atlasMarker, index) => {
      const color =
        atlasMarker.kind === "bridge" ? "#8edaf5" :
          atlasMarker.kind === "special" ? "#ffc75f" :
            "#aeea80";
      const radius =
        atlasMarker.kind === "bridge" ? 2.4 :
          atlasMarker.kind === "special" ? 2.8 :
            2.2;
      const marker: MapMarker = {
        group: createMapMarker(color, radius, atlasMarker.kind === "special" ? 12 : 9, 0.28),
        baseScale: 0.9,
        pulseSpeed: 1.2 + index * 0.12,
      };
      marker.group.position.set(
        atlasMarker.position.x,
        sampleTerrainHeight(atlasMarker.position.x, atlasMarker.position.z) + 0.1,
        atlasMarker.position.z,
      );
      this.atlasMapMarkers.push(marker);
      this.mapMarkerGroup.add(marker.group);
    });

    this.registerCameraCollider(this.terrain);
    this.collectCameraColliders(this.islandShell);
    this.collectCameraColliders(this.shrine);
    this.collectCameraColliders(this.treeClusters);
    this.collectCameraColliders(this.biomeTransitionAccents);
    this.collectCameraColliders(this.anchorSceneAccents);
    this.collectCameraColliders(this.highlandAccents);
    this.collectCameraColliders(this.landmarkTrees);
    [
      this.groundLayer,
      this.midLayer,
      this.treeClusters,
      this.forestGroveAccents,
      this.biomeTransitionAccents,
      this.waterBankAccents,
      this.anchorSceneAccents,
      this.highlandAccents,
      this.landmarkTrees,
    ].forEach((object) => this.collectTreeWindMeshes(object));
    [
      this.groundLayer,
      this.midLayer,
      this.treeClusters,
      this.forestGroveAccents,
      this.biomeTransitionAccents,
      this.waterBankAccents,
      this.anchorSceneAccents,
      this.highlandAccents,
    ].forEach((object) => this.collectSmallPropMeshes(object));
    [
      this.terrain,
      this.openingNestVista,
      this.openingWaterComposition,
      this.islandShell,
      this.waterSystem.group,
      this.groundLayer,
      this.midLayer,
      this.treeClusters,
      this.forestGroveAccents,
      this.biomeTransitionAccents,
      this.waterBankAccents,
      this.anchorSceneAccents,
      this.highlandAccents,
      this.grasslandImmersion.staticLayer,
      this.shadowVolumes,
      this.landmarkTrees,
      this.shrine,
      this.mountainSilhouettes,
    ].forEach((object) => freezeStaticHierarchy(object));

    this.queueDeferredWorldSlices(options);
  }

  getCameraCollisionMeshes() {
    return this.cameraCollisionMeshes;
  }

  getPerfStats() {
    return this.createPerfStats();
  }

  setWaterDepthDebugEnabled(enabled: boolean) {
    this.waterDepthDebug = enabled;
    this.waterSystem.setDepthDebugEnabled(enabled);
  }

  isWaterDepthDebugEnabled() {
    return this.waterDepthDebug;
  }

  getQaStats(): WorldQaStats {
    return {
      smallPropMeshes: this.smallPropMeshes.length,
      smallPropInstances: this.smallPropMeshes.reduce((sum, mesh) => sum + mesh.count, 0),
      smallPropMeshesUsingGeometryVertexColors: this.smallPropMeshes.filter((mesh) => {
        const material = mesh.material as Material & { vertexColors?: boolean };
        return material.vertexColors === true;
      }).length,
      smallPropMeshesMissingInstanceColors: this.smallPropMeshes.filter((mesh) => !mesh.instanceColor).length,
      emptySmallPropMeshes: this.smallPropMeshes.filter((mesh) => mesh.count <= 0).length,
    };
  }

  getFaunaStats() {
    return this.faunaStats;
  }

  private queueDeferredWorldSlices(options: WorldRendererOptions) {
    this.deferredWorldSlices.push(
      () => {
        moveChildren(this.groundLayer, buildGroundLayer());
        this.collectTreeWindMeshes(this.groundLayer);
        this.collectSmallPropMeshes(this.groundLayer);
        freezeStaticHierarchy(this.groundLayer);
      },
      () => {
        moveChildren(this.midLayer, buildMidLayer());
        this.collectTreeWindMeshes(this.midLayer);
        this.collectSmallPropMeshes(this.midLayer);
        freezeStaticHierarchy(this.midLayer);
      },
      () => {
        moveChildren(this.treeClusters, buildTreeClusters());
        this.collectCameraColliders(this.treeClusters);
        this.collectTreeWindMeshes(this.treeClusters);
        this.collectSmallPropMeshes(this.treeClusters);
        freezeStaticHierarchy(this.treeClusters);
      },
      () => {
        moveChildren(this.forestGroveAccents, buildForestGroveAccents());
        this.collectCameraColliders(this.forestGroveAccents);
        this.collectTreeWindMeshes(this.forestGroveAccents);
        this.collectSmallPropMeshes(this.forestGroveAccents);
        freezeStaticHierarchy(this.forestGroveAccents);
      },
      () => {
        const clouds = buildClouds();
        this.clouds.userData.cloudMaterial = clouds.userData.cloudMaterial;
        moveChildren(this.clouds, clouds);
      },
      () => {
        moveChildren(this.mountainAtmosphere, buildMountainAtmosphere());
        freezeStaticHierarchy(this.mountainAtmosphere);
      },
      () => {
        moveChildren(this.valleyMist, buildValleyMist());
        freezeStaticHierarchy(this.valleyMist);
      },
      () => {
        moveChildren(this.shadowVolumes, buildShadowPockets());
        freezeStaticHierarchy(this.shadowVolumes);
      },
      () => {
        const waterways = buildHighlandWaterways();
        this.waterSystem.addWaterGroup(waterways);
      },
      () => {
        const visuals = buildForageableVisuals();
        this.forageableVisuals.push(...visuals);
        visuals.forEach((visual) => {
          this.forageableGroup.add(visual.group);
        });
      },
      () => {
        // Build a cone-stack mountain silhouette with vertex-color snow caps.
        // Vertex colors drive the codex-like grass -> rock -> snow read without adding a custom shader.
        const buildMountainGeometry = (): BufferGeometry => {
          const SEG = 20;
          const lobes: BufferGeometry[] = [];

          // [radiusBottom, radiusTop, height, yOffset, snowFraction]
          const lobeSpec: [number, number, number, number, number][] = [
            [1.12, 0.74, 0.34, 0.0, 0.0],
            [0.82, 0.44, 0.44, 0.3, 0.08],
            [0.48, 0.12, 0.5, 0.68, 0.54],
            [0.24, 0.02, 0.34, 1.08, 0.86],
          ];

          const colorBase = new Color("#bdd89a");
          const colorRock = new Color("#bec8b3");
          const colorShade = new Color("#aebca8");
          const colorSnow = new Color("#fff8df");

          lobes.push(
            ...lobeSpec.map(([rb, rt, h, yOff, snowFrac]) => {
              const geo = new ConeGeometry(rb, h, SEG, 3, false);
              geo.translate(0, yOff + h * 0.5, 0);

              // Build per-vertex colors
              const posArr = geo.attributes.position.array as Float32Array;
              const vertCount = posArr.length / 3;
              const colors = new Float32Array(vertCount * 3);
              for (let v = 0; v < vertCount; v++) {
                const vx = posArr[v * 3];
                const vy = posArr[v * 3 + 1];
                const t = Math.max(0, Math.min(1, (vy - yOff) / h));
                const col = new Color();
                if (t < 0.5) {
                  col.lerpColors(colorBase, colorRock, t * 2);
                } else {
                  col.lerpColors(colorRock, colorSnow, (t - 0.5) * 2 * snowFrac);
                }
                col.lerp(colorShade, Math.max(0, -vx) * 0.035 + Math.max(0, 0.42 - t) * 0.035);
                colors[v * 3]     = col.r;
                colors[v * 3 + 1] = col.g;
                colors[v * 3 + 2] = col.b;
              }
              geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
              return geo;
            }),
          );

          const merged = mergeGeometries(lobes, false);
          lobes.forEach((g) => g.dispose());
          return merged;
        };

        const mountainMaterial = new MeshBasicMaterial({ vertexColors: true });
        const sharedGeo = buildMountainGeometry();

        // [worldX, worldZ, scaleX, scaleY, scaleZ, yaw, lift]
        for (const [x, z, sx, sy, sz, yaw, lift] of [
          [-174, 178, 82, 108, 96, -0.2, 8],
          [-128, 226, 112, 152, 122, 0.08, 12],
          [-58, 252, 126, 174, 128, -0.1, 15],
          [8, 238, 146, 184, 132, -0.04, 12],
          [82, 248, 122, 158, 116, 0.18, 14],
          [124, 212, 116, 148, 120, 0.22, 10],
          [166, 176, 72, 96, 82, 0.4, 7],
          [-48, 172, 58, 78, 66, -0.52, 6],
          [62, 162, 64, 84, 70, 0.34, 6],
        ]) {
          const mountain = new Mesh(sharedGeo, mountainMaterial);
          mountain.scale.set(sx as number, sy as number, sz as number);
          mountain.rotation.y = yaw as number;
          mountain.position.set(x as number, lift as number, z as number);
          this.mountainSilhouettes.add(mountain);
        }
        freezeStaticHierarchy(this.mountainSilhouettes);
      },
      () => {
        const blobs = buildAmbientBlobs(options);
        this.ambientBlobs.push(...blobs);
        this.ambientNestGroup.add(batchStaticDecorations(buildAmbientBlobNests(this.ambientBlobs), "karu-nest-batch"));
        this.ambientBlobs.forEach((blob) => {
          this.ambientBlobGroup.add(blob.group);
        });
      },
    );
  }

  private processDeferredWorldSlice() {
    if (this.deferredWorldSlices.length === 0) {
      return;
    }

    this.deferredWorldFrame += 1;
    if (this.deferredWorldFrame < 3 || this.deferredWorldFrame % 2 !== 0) {
      return;
    }

    this.deferredWorldSlices.shift()?.();
  }

  update(
    frame: FrameState,
    elapsed: number,
    dt: number,
    mapLookdown = false,
    recruitPressed = false,
    regroupPressed = false,
    viewCamera: Camera,
  ) {
    if (regroupPressed) {
      this.mossu.triggerKaruCall();
    }
    this.faunaStats = updateAmbientBlobs(
      this.ambientBlobs,
      this.ambientBlobGroup,
      frame,
      elapsed,
      dt,
      mapLookdown,
      recruitPressed,
      regroupPressed,
    );
    this.mossu.update(frame.player, dt);
    this.updateMossuContactShadow(frame, mapLookdown);
    this.skyDome.position.copy(frame.player.position);
    this.updateSceneMood(frame, dt, viewCamera, elapsed);
    this.scene.fog = mapLookdown ? null : this.gameplayFog;
    if (!mapLookdown) {
      this.updateWind(frame, elapsed, dt);
      this.updateClouds(elapsed);
      this.updateValleyMist(elapsed);
      this.updateAmbientMotes(frame, elapsed, dt, viewCamera);
      this.ocean.update(elapsed, this.sun, viewCamera);
    }
    updateGrasslandImmersionSystem(this.grasslandImmersion, elapsed, mapLookdown);
    this.updateWaterInteractions(frame, elapsed, mapLookdown);
    this.updateWater(elapsed, mapLookdown);
    this.updateLandingSplash(frame, dt);
    this.updateSnowTrail(frame, dt);
    this.updateForageables(frame, elapsed, mapLookdown);
    this.updateMapMarkers(frame, elapsed, mapLookdown);
    this.updateGrassLod(frame, mapLookdown);
    this.windMeshes.forEach((mesh) => {
      mesh.visible = !mapLookdown && mesh.count > 0;
    });
    this.skyDome.visible = !mapLookdown;
    this.islandShell.visible = !mapLookdown;
    this.clouds.visible = !mapLookdown;
    this.mountainSilhouettes.visible = !mapLookdown;
    this.mountainAtmosphere.visible = !mapLookdown;
    this.valleyMist.visible = !mapLookdown;
    this.ambientMotes.setVisible(!mapLookdown);
    this.ocean.setVisible(!mapLookdown);
    this.shadowVolumes.visible = !mapLookdown;
    this.terrainFormStrokes.visible = !mapLookdown;
    this.processDeferredWorldSlice();
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
      if (visual.kind === "berry" || visual.kind === "seed" || visual.kind === "shell") {
        visual.group.rotation.y = elapsed * 0.55 * visual.spinDirection + visual.swayOffset;
        visual.group.rotation.z = visual.kind === "shell"
          ? Math.sin(elapsed * 1.2 + visual.swayOffset) * 0.04
          : 0;
      } else if (visual.kind === "feather") {
        visual.group.rotation.y = visual.swayOffset + Math.sin(elapsed * 1.35 + visual.swayOffset) * 0.16;
        visual.group.rotation.z = Math.sin(elapsed * 1.8 + index * 0.3) * 0.11;
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
    const waterControllers = this.waterSystem.getControllers();
    const waterGeometryStats = waterControllers.reduce(
      (stats, controller) => {
        stats.vertices += countGeometryVertices(controller.mesh.geometry);
        stats.triangles += countGeometryTriangles(controller.mesh.geometry);
        return stats;
      },
      { vertices: 0, triangles: 0 },
    );
    const grassInstances = this.windMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const grassLodStats = this.windMeshes.map((mesh) => getGrassMeshLodStats(mesh));
    const grassImpostorInstances = this.grassImpostorMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const forestInstances = this.treeWindMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const staticTreeWindTriangles = this.treeLeafWindMeshes.reduce((sum, mesh) => sum + countGeometryTriangles(mesh.geometry), 0);
    const smallPropInstances = this.smallPropMeshes.reduce((sum, mesh) => sum + mesh.count, 0);

    return {
      terrainVertices: countGeometryVertices(this.terrain.geometry),
      terrainTriangles: countGeometryTriangles(this.terrain.geometry),
      grassMeshes: this.windMeshes.length,
      grassInstances,
      grassEstimatedTriangles: countInstancedTriangles(this.windMeshes),
      grassImpostorMeshes: this.grassImpostorMeshes.length,
      grassImpostorInstances,
      grassImpostorEstimatedTriangles: countInstancedTriangles(this.grassImpostorMeshes),
      grassLodCells: grassLodStats.reduce((sum, stats) => sum + (stats?.cells ?? 0), 0),
      grassLodSourceInstances: grassLodStats.reduce((sum, stats) => sum + (stats?.sourceInstances ?? 0), 0),
      grassLodVisitedCells: grassLodStats.reduce((sum, stats) => sum + (stats?.visitedCells ?? 0), 0),
      grassLodVisitedSources: grassLodStats.reduce((sum, stats) => sum + (stats?.visitedSources ?? 0), 0),
      forestMeshes: this.treeWindMeshes.length + this.treeLeafWindMeshes.length,
      forestInstances,
      forestEstimatedTriangles: countInstancedTriangles(this.treeWindMeshes) + staticTreeWindTriangles,
      smallPropMeshes: this.smallPropMeshes.length,
      smallPropInstances,
      smallPropEstimatedTriangles: countInstancedTriangles(this.smallPropMeshes),
      waterSurfaces: waterControllers.length,
      waterVertices: waterGeometryStats.vertices,
      waterTriangles: waterGeometryStats.triangles,
      animatedShaderMeshes: this.windMeshes.length + this.treeWindMeshes.length + this.treeLeafWindMeshes.length + waterControllers.length,
      grassShaderMeshes: this.windMeshes.length,
      treeShaderMeshes: this.treeWindMeshes.length + this.treeLeafWindMeshes.length,
      waterShaderSurfaces: waterControllers.length,
    };
  }

  private collectTreeWindMeshes(root: Object3D) {
    root.traverse((node) => {
      const instancedMesh = node as InstancedMesh;
      if (instancedMesh.isInstancedMesh && instancedMesh.userData.canopyWind && !this.treeWindMeshes.includes(instancedMesh)) {
        this.treeWindMeshes.push(instancedMesh);
      }

      const mesh = node as Mesh;
      if (mesh.isMesh && mesh.userData.treeLeafWind && !this.treeLeafWindMeshes.includes(mesh)) {
        this.treeLeafWindMeshes.push(mesh);
      }
    });
  }

  private collectSmallPropMeshes(root: Object3D) {
    root.traverse((node) => {
      const mesh = node as InstancedMesh;
      if (mesh.isInstancedMesh && mesh.userData.smallPropBatch) {
        this.smallPropMeshes.push(mesh);
      }
    });
  }

  private updateMossuContactShadow(frame: FrameState, mapLookdown: boolean) {
    const player = frame.player;
    const terrainY = sampleTerrainHeight(player.position.x, player.position.z);
    const water = sampleWaterState(player.position.x, player.position.z);
    const surfaceY = water ? Math.max(terrainY, water.surfaceY) : terrainY;
    const heightAboveSurface = MathUtils.clamp(player.position.y - surfaceY, 0, 16);
    const groundedFade = player.fallingToVoid ? 0 : 1 - MathUtils.smoothstep(heightAboveSurface, 2.4, 14);
    const waterFade = water && water.depth > 0.24 ? 0.48 : 1;
    const rollingScale = player.rolling ? 1.22 : 1;
    const shadowScale = MathUtils.lerp(4.8, 7.4, MathUtils.clamp(heightAboveSurface / 12, 0, 1)) * rollingScale;
    const material = this.mossuContactShadow.material as MeshBasicMaterial;

    this.mossuContactShadow.visible = !mapLookdown && groundedFade > 0.02;
    this.mossuContactShadow.position.set(player.position.x, surfaceY + 0.055, player.position.z);
    this.mossuContactShadow.scale.set(shadowScale * 1.08, shadowScale * 0.74, 1);
    material.opacity = 0.12 * groundedFade * waterFade;
  }

  private updateGrassLod(frame: FrameState, mapLookdown: boolean) {
    if (mapLookdown) {
      return;
    }

    this.grassLodFrame += 1;
    this.windMeshes.forEach((mesh) => {
      updateGrassMeshLod(mesh, frame.player.position, this.grassLodFrame);
    });
  }

  private updateWind(frame: FrameState, elapsed: number, dt: number) {
    const planarSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
    if (frame.player.justLanded && !frame.player.fallingToVoid) {
      this.heroGrassPulse = Math.max(
        this.heroGrassPulse,
        MathUtils.clamp(0.34 + frame.player.landingImpact * 0.25, 0.34, 0.72),
      );
    }
    const landingPulse = this.heroGrassPulse;
    const rollingWake = frame.player.rolling && frame.player.grounded
      ? MathUtils.clamp(planarSpeed / 22, 0.18, 0.5)
      : 0;
    const karuWatchWake = this.faunaStats.firstEncounterActive ? 0.22 : 0;
    const basePush = frame.player.fallingToVoid || !frame.player.grounded
      ? 0
      : frame.player.rolling
        ? MathUtils.clamp(planarSpeed / 24, 0.22, 1)
        : MathUtils.clamp(planarSpeed / 14, 0, 0.48);
    const playerPush = MathUtils.clamp(basePush + landingPulse + rollingWake + karuWatchWake, 0, 1.35);
    this.windMeshes.forEach((mesh) => {
      const shader = mesh.userData.shader;
      if (shader) {
        shader.uniforms.uTime.value = elapsed;
        (shader.uniforms.uPlayerPosition.value as Vector3).copy(frame.player.position);
        (shader.uniforms.uPlayerVelocity.value as Vector3).set(frame.player.velocity.x, 0, frame.player.velocity.z);
        shader.uniforms.uPlayerPush.value = playerPush;
      }
    });
    this.heroGrassPulse = MathUtils.damp(this.heroGrassPulse, 0, 3.2, dt);
    this.treeWindMeshes.forEach((mesh) => {
      const shader = mesh.userData.windShader;
      if (shader) {
        shader.uniforms.uTime.value = elapsed;
      }
    });
    this.treeLeafWindMeshes.forEach((mesh) => {
      const material = mesh.material;
      if (Array.isArray(material)) {
        return;
      }

      const shader = material.userData.windShader;
      if (shader?.uniforms.uTime) {
        shader.uniforms.uTime.value = elapsed;
      }
    });
  }

  private updateSceneMood(frame: FrameState, dt: number, viewCamera: Camera, elapsed: number) {
    const playerHeight = sampleTerrainHeight(frame.player.position.x, frame.player.position.z);
    const planarSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
    if (frame.player.justLanded && !frame.player.fallingToVoid) {
      this.environmentPulse = Math.max(
        this.environmentPulse,
        MathUtils.clamp(0.18 + frame.player.landingImpact * 0.1, 0.18, 0.36),
      );
    }
    if (this.faunaStats.firstEncounterActive) {
      this.environmentPulse = Math.max(this.environmentPulse, 0.24);
    }
    const heightMood = MathUtils.smoothstep(playerHeight, 34, 128);
    const routeMood = MathUtils.smoothstep(frame.player.position.z, 64, 202);
    const targetMood = MathUtils.clamp(heightMood * 0.72 + routeMood * 0.4, 0, 1);
    const blend = 1 - Math.exp(-dt * 1.8);
    this.elevationMood = MathUtils.lerp(this.elevationMood, targetMood, blend);
    const movementWake =
      (frame.player.rolling ? 0.055 : 0.026) *
      MathUtils.clamp(planarSpeed / 30, 0, 1) *
      (frame.player.fallingToVoid ? 0 : 1);
    const cinematicLift = MathUtils.clamp(this.environmentPulse + movementWake, 0, 0.42);
    const breath = Math.sin(elapsed * 0.34 + this.elevationMood * 1.8) * 0.5 + 0.5;

    applySceneLightingColors(
      {
        sun: this.sun,
        hemi: this.skyFill,
        fog: this.gameplayFog,
        background: this.scene.background instanceof Color ? this.scene.background : null,
      },
      this.sceneColorPairs,
      this.elevationMood,
    );
    applySceneLightingMood(
      {
        sun: this.sun,
        ambient: this.ambientLight,
        hemi: this.skyFill,
        bounce: this.skyBounce,
        meadowGlow: this.meadowGlow,
        alpineGlow: this.alpineGlow,
        fog: this.gameplayFog,
      },
      this.elevationMood,
      cinematicLift,
      breath,
    );
    this.environmentPulse = MathUtils.damp(this.environmentPulse, 0, 2.35, dt);
    syncAtmosphereLighting(this.skyDome, this.clouds, this.sun, this.elevationMood, viewCamera, elapsed);
    syncStylizedSkySun(this.skySun, this.sun, viewCamera, this.elevationMood);

    getAtmosphereHorizonTints(
      this.elevationMood,
      this.scenePatchHorizon,
      this.scenePatchHaze,
      this.scenePatchBright,
      this.scenePatchShadow,
    );
    getSunDirectionWorld(this.sun, this.scenePatchSunDir);
    const applyPatch = (shader: GrassShader | undefined) => {
      if (!shader) {
        return;
      }
      writePatchSceneLightingUniforms(
        shader,
        this.sun,
        this.ambientLight,
        this.skyFill,
        this.scenePatchHorizon,
        this.scenePatchSunDir,
        this.elevationMood,
      );
    };
    this.windMeshes.forEach((mesh) => {
      applyPatch(mesh.userData.shader);
    });
    this.treeWindMeshes.forEach((mesh) => {
      applyPatch(mesh.userData.windShader);
    });
    this.waterSystem.getControllers().forEach((controller) => {
      const mat = controller.mesh.material as MeshStandardMaterial & {
        userData?: { waterShader?: GrassShader };
      };
      applyPatch(mat.userData?.waterShader);
    });
  }

  private updateWaterInteractions(frame: FrameState, elapsed: number, mapLookdown: boolean) {
    this.waterSystem.beginFrame(elapsed);

    if (mapLookdown) {
      return;
    }

    const playerSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
    const playerWaterStrength =
      frame.player.swimming ? 1.18 :
      frame.player.rolling ? 1.16 :
      frame.player.justLanded ? 1.05 :
      0.86;
    this.waterSystem.emitRippleForActor(
      "mossu",
      frame.player.position,
      playerSpeed,
      elapsed,
      playerWaterStrength,
      frame.player.justLanded,
    );

    this.ambientBlobs.forEach((blob) => {
      if (!blob.recruited || (blob.waterReaction !== "splash" && blob.waterReaction !== "float")) {
        this.waterSystem.markActorDry(`karu-${blob.id}`);
        return;
      }

      this.waterSystem.emitRippleForActor(
        `karu-${blob.id}`,
        blob.group.position,
        blob.velocity.length(),
        elapsed,
        blob.waterReaction === "float" ? 0.48 : 0.58,
      );
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

  private updateAmbientMotes(frame: FrameState, elapsed: number, dt: number, camera: Camera) {
    const px = frame.player.position.x;
    const pz = frame.player.position.z;
    const ph = sampleTerrainHeight(px, pz);
    const biome = sampleBiomeZone(px, pz, ph);
    const wind = sampleWindField(px, pz, ph);
    this._moteWindScratch.set(wind.direction.x * wind.strength, 0, wind.direction.y * wind.strength);
    this.ambientMotes.update(
      elapsed,
      dt,
      frame.player.position,
      camera,
      biome,
      this._moteWindScratch,
      frame.player.velocity,
    );
  }

  private updateWater(elapsed: number, mapLookdown: boolean) {
    this.waterSystem.setDepthDebugEnabled(this.waterDepthDebug);
    this.waterSystem.update(elapsed, mapLookdown);
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

      const width = particle.width * (0.36 + easeOut * 0.64);
      const height = particle.height * (0.16 + easeOut * 0.72) * (1 - lifeT * 0.42);
      particle.mesh.scale.set(width, height, 1);
      particle.mesh.visible = true;
      const material = particle.mesh.material as MeshLambertMaterial;
      material.opacity = Math.max(0, (1 - lifeT) * 0.48);
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
      particle.height = (0.54 + Math.random() * 0.74) * (0.78 + impact * 0.18);
      particle.width = 0.42 + Math.random() * 0.22;
      particle.bend = (0.32 + Math.random() * 0.58) * impact;
      particle.twist = (Math.random() - 0.5) * 1.4;
      particle.mesh.position.copy(particle.origin);
      particle.mesh.scale.set(0.2, 0.12, 1);
      particle.mesh.visible = true;
      const material = particle.mesh.material as MeshLambertMaterial;
      material.opacity = 0.48;
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

    [this.playerMapMarker, this.shrineMapMarker, ...this.landmarkMapMarkers, ...this.atlasMapMarkers].forEach((marker, index) => {
      const pulse = 1 + Math.sin(elapsed * marker.pulseSpeed + index * 0.9) * 0.08;
      const highlightBoost = marker === this.playerMapMarker ? 1.95 : marker === this.shrineMapMarker ? 1.6 : 1.28;
      marker.group.scale.setScalar(marker.baseScale * pulse * highlightBoost);
    });
  }
}
