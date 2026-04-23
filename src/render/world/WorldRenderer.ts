import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
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
  sampleWindField,
  shadowPockets,
  worldLandmarks,
  worldForageables,
} from "../../simulation/world";
import { MossuAvatar } from "../objects/MossuAvatar";
import { createGrassMesh, GrassShader, sampleOpeningMeadowMask } from "./grassSystem";
import { buildClouds, buildMountainAtmosphere, buildSkyDome } from "./atmosphereSystem";
import { AmbientBlob, buildAmbientBlobs, updateAmbientBlobs } from "./ambientBlobs";
import {
  buildGroundLayer,
  buildHighlandAccents,
  buildLandmarkTrees,
  buildMidLayer,
  buildTreeClusters,
} from "./terrainDecorations";
import { markCameraCollider } from "./sceneHelpers";
import {
  buildHighlandWaterways,
  makeOpeningLakeSurface,
  makeRiverMesh,
  WaterSurfaceController,
  WaterSurfaceGroup,
} from "./waterSystem";

const WORLD_SIZE = 560;
const TERRAIN_SEGMENTS = 240;
const GRASS_COUNT = 7600;
const ALPINE_GRASS_COUNT = 2400;
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

function colorForTerrain(x: number, y: number, z: number) {
  const zone = sampleBiomeZone(x, z, y);
  const normal = sampleTerrainNormal(x, z);
  const slope = 1 - normal.y;
  const painterlyNoise = Math.sin(x * 0.07) * 0.04 + Math.cos(z * 0.05) * 0.03 + Math.sin((x - z) * 0.03) * 0.05;
  const patch = Math.round((Math.sin(x * 0.12 + z * 0.08) * 0.5 + 0.5) * 5) / 5;
  const mixValue = Math.min(1, Math.max(0, patch * 0.5 + painterlyNoise + y / 220));
  const openingMask = sampleOpeningMeadowMask(x, z);
  const sunWash = Math.sin(x * 0.018 - z * 0.014 + 1.2) * 0.5 + 0.5;
  const fieldBands = Math.sin(x * 0.022 + z * 0.006 - 1.2) * 0.5 + 0.5;
  const meadowBloom = MathUtils.clamp((1 - slope * 2.8) * (0.04 + sunWash * 0.1 + openingMask * 0.08), 0, 0.18);

  if (zone === "plains" || zone === "hills") {
    const shadow = zone === "plains" ? new Color("#4b6137") : new Color("#53683c");
    const low = zone === "plains" ? new Color("#648144") : new Color("#6e8749");
    const high = zone === "plains" ? new Color("#98b25c") : new Color("#90aa57");
    const fieldTint = new Color("#7d9551");
    const color = shadow
      .lerp(low, 0.46 + mixValue * 0.28)
      .lerp(high, mixValue * 0.46 + openingMask * 0.08)
      .lerp(fieldTint, openingMask * (0.12 + fieldBands * 0.14));
    return color
      .lerp(new Color("#cdbf77"), meadowBloom * (0.42 + openingMask * 0.12))
      .lerp(new Color("#e5dab0"), Math.min(0.04 + openingMask * 0.05, slope * 0.06 + openingMask * 0.05));
  }

  if (zone === "foothills") {
    const grassy = new Color("#73895a");
    const moss = new Color("#5d7348");
    const stone = new Color("#c0b39b");
    const color = grassy.lerp(moss, mixValue * 0.45);
    return color
      .lerp(new Color("#d5c183"), meadowBloom * 0.28)
      .lerp(stone, Math.min(0.55, slope * 1.6));
  }

  if (zone === "alpine" || zone === "ridge") {
    const rockA = new Color("#ddd8cc");
    const rockB = new Color(zone === "ridge" ? "#9ea29b" : "#a9a79d");
    const moss = new Color(zone === "ridge" ? "#6d7f66" : "#728a67");
    const rockMix = zone === "ridge" ? 0.58 : 0.42;
    const color = rockA.lerp(rockB, 0.3 + mixValue * 0.35);
    return moss.lerp(color, Math.min(1, slope * 2.2 + rockMix));
  }

  return new Color("#f4efe2").lerp(new Color("#bcb6ab"), Math.min(1, slope * 1.9 + mixValue * 0.3));
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

function buildLandmarkTrees() {
  const group = new Group();
  const trunkMaterial = new MeshStandardMaterial({ color: "#f5f5f1", roughness: 1 });
  const blackStripe = new MeshStandardMaterial({ color: "#464846", roughness: 1 });
  const orangeLeaves = new MeshStandardMaterial({ color: "#ea8845", roughness: 1 });
  const greenLeaves = new MeshStandardMaterial({ color: "#7ac35f", roughness: 1 });

  const makeTree = (x: number, z: number, color: MeshStandardMaterial) => {
    const tree = new Group();
    const trunk = markCameraCollider(new Mesh(new CylinderGeometry(0.33, 0.44, 7.2, 8), trunkMaterial));
    trunk.position.y = 3.6;
    tree.add(trunk);

    for (const [y, size, ox, oz] of [
      [7.1, 2.8, 0, 0],
      [8.2, 2.2, 1.1, 0.2],
      [8.1, 2, -1, 0.1],
      [6.8, 1.9, 0.5, 1],
    ]) {
      const leaf = new Mesh(new SphereGeometry(size, 12, 10), color);
      leaf.position.set(ox as number, y as number, oz as number);
      tree.add(leaf);
    }

    for (const y of [2.8, 4.4, 5.9]) {
      const stripe = new Mesh(new SphereGeometry(0.12, 8, 6), blackStripe);
      stripe.scale.set(0.6, 1, 0.08);
      stripe.position.set(0, y, 0.42);
      tree.add(stripe);
    }

    tree.scale.setScalar(TREE_SIZE_MULTIPLIER);
    tree.position.set(x, sampleTerrainHeight(x, z), z);
    group.add(tree);
  };

  makeTree(-10, -28, orangeLeaves);
  makeTree(-36, 8, orangeLeaves);
  makeTree(28, 34, greenLeaves);
  makeTree(-18, 88, orangeLeaves);
  makeTree(-28, 162, greenLeaves);
  return group;
}

function freezeStaticHierarchy(object: Object3D) {
  object.traverse((node) => {
    node.updateMatrix();
    node.matrixAutoUpdate = false;
  });
}

function markCameraCollider(mesh: Mesh) {
  mesh.userData.cameraCollider = true;
  return mesh;
}

function scatterAroundPocket(
  pocket: { position: Vector3; radius: number },
  index: number,
  radiusScale = 1,
) {
  const angleSeed = Math.sin((index + 1) * 12.9898 + pocket.position.x * 0.013 + pocket.position.z * 0.019) * 43758.5453;
  const radiusSeed = Math.sin((index + 1) * 78.233 + pocket.position.x * 0.031 - pocket.position.z * 0.017) * 12415.713;
  const angle = (angleSeed - Math.floor(angleSeed)) * Math.PI * 2;
  const radius = (0.16 + (radiusSeed - Math.floor(radiusSeed)) * 0.82) * pocket.radius * radiusScale;
  return {
    x: pocket.position.x + Math.cos(angle) * radius,
    z: pocket.position.z + Math.sin(angle) * radius,
  };
}

const TREE_SIZE_MULTIPLIER = 4;

function makeRoundTree(scale: number, leafColor: string) {
  const scaledSize = scale * TREE_SIZE_MULTIPLIER;
  const group = new Group();
  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.22 * scaledSize, 0.34 * scaledSize, 3.8 * scaledSize, 7),
    new MeshLambertMaterial({ color: "#8f7253" }),
  ));
  trunk.position.y = 1.9 * scaledSize;
  group.add(trunk);

  for (const [x, y, z, size] of [
    [0, 4.6, 0, 1.8],
    [0.95, 4.2, 0.22, 1.2],
    [-0.9, 4.0, -0.12, 1.16],
    [0.18, 5.45, -0.18, 1.05],
  ]) {
    const canopy = new Mesh(
      new SphereGeometry(size * scaledSize, 10, 8),
      new MeshLambertMaterial({ color: leafColor }),
    );
    canopy.position.set(x * scaledSize, y * scaledSize, z * scaledSize);
    group.add(canopy);
  }

  return group;
}

function makePineTree(scale: number, tone = "#5b7d4d") {
  const scaledSize = scale * TREE_SIZE_MULTIPLIER;
  const group = new Group();
  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.18 * scaledSize, 0.28 * scaledSize, 4.8 * scaledSize, 7),
    new MeshLambertMaterial({ color: "#7a6347" }),
  ));
  trunk.position.y = 2.4 * scaledSize;
  group.add(trunk);

  for (const [y, radius, height] of [
    [2.3, 1.2, 2.2],
    [3.4, 0.98, 1.9],
    [4.45, 0.72, 1.55],
  ]) {
    const cone = new Mesh(
      new ConeGeometry(radius * scaledSize, height * scaledSize, 6),
      new MeshLambertMaterial({ color: tone }),
    );
    cone.position.y = y * scaledSize;
    group.add(cone);
  }

  return group;
}

function makeFlower(color: string, scale: number, stemHeight: number) {
  const group = new Group();
  const stem = new Mesh(
    new CylinderGeometry(0.03 * scale, 0.05 * scale, stemHeight * scale, 5),
    new MeshLambertMaterial({ color: "#699953" }),
  );
  stem.position.y = stemHeight * scale * 0.5;
  group.add(stem);

  const center = new Mesh(
    new SphereGeometry(0.12 * scale, 7, 6),
    new MeshLambertMaterial({ color: "#f6d888" }),
  );
  center.position.y = stemHeight * scale;
  group.add(center);

  for (let i = 0; i < 5; i += 1) {
    const petal = new Mesh(
      new SphereGeometry(0.14 * scale, 6, 5),
      new MeshLambertMaterial({ color }),
    );
    const angle = (i / 5) * Math.PI * 2;
    petal.scale.set(1.2, 0.72, 1.05);
    petal.position.set(Math.cos(angle) * 0.18 * scale, stemHeight * scale, Math.sin(angle) * 0.18 * scale);
    group.add(petal);
  }

  return group;
}

function makeCloverPatch(radius: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, z, s] of [
    [0, 0, 1],
    [0.24, 0.08, 0.82],
    [-0.22, -0.1, 0.88],
    [0.04, -0.22, 0.76],
  ]) {
    const leaf = new Mesh(new SphereGeometry(radius * s, 7, 6), material);
    leaf.scale.set(1.2, 0.18, 1.2);
    leaf.position.set(x * radius * 2.4, 0.05, z * radius * 2.4);
    group.add(leaf);
  }
  return group;
}

function makeGrassClump(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, rot, h] of [
    [-0.16, -0.28, 0.7],
    [0, 0, 0.84],
    [0.16, 0.26, 0.72],
  ]) {
    const blade = new Mesh(new ConeGeometry(0.1 * scale, h * scale, 5), material);
    blade.position.set(x * scale, h * scale * 0.5, 0);
    blade.rotation.z = rot;
    group.add(blade);
  }
  return group;
}

function makeTinyRock(scale: number, color: string) {
  const rock = new Mesh(
    new SphereGeometry(0.28 * scale, 6, 5),
    new MeshLambertMaterial({ color }),
  );
  rock.scale.set(1.15, 0.72, 1);
  return rock;
}

function makeBush(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, y, z, s] of [
    [0, 0.5, 0, 1],
    [0.34, 0.42, 0.08, 0.72],
    [-0.32, 0.38, -0.04, 0.68],
  ]) {
    const puff = new Mesh(new SphereGeometry(0.6 * scale * s, 8, 7), material);
    puff.position.set(x * scale, y * scale, z * scale);
    group.add(puff);
  }
  return group;
}

function makeMossPatch(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, z, radius] of [
    [0, 0, 0.72],
    [0.34, -0.12, 0.46],
    [-0.28, 0.16, 0.42],
  ]) {
    const puff = new Mesh(new SphereGeometry(radius * scale, 8, 7), material);
    puff.scale.set(1.35, 0.24, 1.18);
    puff.position.set(x * scale, 0.06 * scale, z * scale);
    group.add(puff);
  }
  return group;
}

function makeRockFormation(scale: number, tone: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: tone });
  for (const [x, y, z, sx, sy, sz] of [
    [0, 0.56, 0, 1.3, 1.8, 1.1],
    [0.48, 0.42, -0.18, 0.92, 1.24, 0.86],
    [-0.44, 0.34, 0.22, 0.82, 1.02, 0.78],
  ]) {
    const rock = markCameraCollider(new Mesh(new SphereGeometry(0.72 * scale, 8, 7), material));
    rock.scale.set(sx * scale, sy * scale, sz * scale);
    rock.position.set(x * scale, y * scale, z * scale);
    group.add(rock);
  }
  return group;
}

function makeWaterfallRibbon(height: number, width: number) {
  const group = new Group();
  const outer = new Mesh(
    new PlaneGeometry(width, height, 1, 8),
    new MeshBasicMaterial({
      color: "#d8f4ff",
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  const inner = new Mesh(
    new PlaneGeometry(width * 0.56, height * 0.96, 1, 8),
    new MeshBasicMaterial({
      color: "#f7fdff",
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  outer.position.y = height * 0.5;
  inner.position.y = height * 0.48;
  inner.position.z = 0.08;
  group.add(outer, inner);
  return group;
}

function makeCreekSurface(
  points: Vector3[],
  radius: number,
  profile: WaterProfile,
  opacity = profile.opacity,
) {
  return createWaterSurface(points, {
    profile,
    width: radius * 2.35,
    segments: 52,
    opacity,
  });
}

function makeMistPuff(scale: number, color: string, opacity: number) {
  const puff = new Mesh(
    new SphereGeometry(1, 12, 10),
    new MeshLambertMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  puff.scale.set(scale * 1.5, scale, scale * 1.2);
  return puff;
}

function makeMushroom(scale: number, capColor: string) {
  const group = new Group();
  const stem = new Mesh(
    new CylinderGeometry(0.06 * scale, 0.08 * scale, 0.55 * scale, 6),
    new MeshLambertMaterial({ color: "#f3ead5" }),
  );
  stem.position.y = 0.28 * scale;
  const cap = new Mesh(
    new SphereGeometry(0.2 * scale, 8, 6),
    new MeshLambertMaterial({ color: capColor }),
  );
  cap.scale.set(1.4, 0.72, 1.4);
  cap.position.y = 0.56 * scale;
  group.add(stem, cap);
  return group;
}

function makeAmbientBlob(scale: number) {
  const group = new Group();
  const root = new Group();
  const bodyMaterial = new MeshStandardMaterial({
    color: "#effbff",
    emissive: "#dff2ff",
    emissiveIntensity: 0.06,
    roughness: 0.98,
    metalness: 0,
  });
  const fluffMaterial = new MeshStandardMaterial({ color: "#d9f2ff", roughness: 1, metalness: 0 });
  const deepFluffMaterial = new MeshStandardMaterial({ color: "#b9ddf5", roughness: 1, metalness: 0 });
  const footMaterial = new MeshStandardMaterial({ color: "#f3fbff", roughness: 1, metalness: 0 });
  const eyeMaterial = new MeshStandardMaterial({ color: "#121b24", roughness: 0.08, metalness: 0.02 });
  const eyeHighlightMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.25,
    roughness: 0.18,
    metalness: 0,
  });

  group.add(root);

  const body = new Mesh(new SphereGeometry(0.58 * scale, 18, 16), bodyMaterial);
  body.scale.set(1.12, 1.42, 1.08);
  body.position.y = 0.76 * scale;
  root.add(body);

  const fluffPuffs: Mesh[] = [];
  [
    { x: -0.35, y: 0.74, z: 0.08, sx: 0.48, sy: 0.56, sz: 0.46, material: fluffMaterial },
    { x: 0.35, y: 0.74, z: 0.08, sx: 0.48, sy: 0.56, sz: 0.46, material: fluffMaterial },
    { x: -0.28, y: 0.38, z: 0.16, sx: 0.36, sy: 0.22, sz: 0.3, material: fluffMaterial },
    { x: 0.28, y: 0.38, z: 0.16, sx: 0.36, sy: 0.22, sz: 0.3, material: fluffMaterial },
    { x: -0.18, y: 1.15, z: 0.04, sx: 0.3, sy: 0.36, sz: 0.28, material: deepFluffMaterial },
    { x: 0.18, y: 1.13, z: 0.05, sx: 0.29, sy: 0.35, sz: 0.27, material: deepFluffMaterial },
    { x: 0, y: 1.34, z: 0.02, sx: 0.24, sy: 0.28, sz: 0.22, material: fluffMaterial },
    { x: -0.26, y: 0.46, z: 0.3, sx: 0.2, sy: 0.17, sz: 0.18, material: deepFluffMaterial },
    { x: 0.26, y: 0.46, z: 0.3, sx: 0.2, sy: 0.17, sz: 0.18, material: deepFluffMaterial },
    { x: 0, y: 0.28, z: 0.22, sx: 0.24, sy: 0.14, sz: 0.18, material: deepFluffMaterial },
    { x: 0, y: 0.74, z: -0.08, sx: 0.34, sy: 0.4, sz: 0.26, material: deepFluffMaterial },
  ].forEach(({ x, y, z, sx, sy, sz, material }) => {
    const puff = new Mesh(new SphereGeometry(0.5 * scale, 10, 9), material);
    puff.position.set(x * scale, y * scale, z * scale);
    puff.scale.set(sx * scale, sy * scale, sz * scale);
    root.add(puff);
    fluffPuffs.push(puff);
  });

  const face = new Group();
  face.position.set(0, 0.88 * scale, 0.5 * scale);
  root.add(face);

  const leftEye = new Mesh(new SphereGeometry(0.112 * scale, 10, 9), eyeMaterial);
  leftEye.scale.set(0.86, 1.34, 0.68);
  leftEye.position.set(-0.18 * scale, -0.01 * scale, 0);
  face.add(leftEye);
  const leftEyeHighlight = new Mesh(new SphereGeometry(0.028 * scale, 8, 7), eyeHighlightMaterial);
  leftEyeHighlight.scale.set(0.72, 0.9, 0.45);
  leftEyeHighlight.position.set(-0.028 * scale, 0.04 * scale, 0.07 * scale);
  leftEye.add(leftEyeHighlight);

  const rightEye = leftEye.clone();
  rightEye.position.x = 0.18 * scale;
  face.add(rightEye);

  const leftFoot = new Mesh(new SphereGeometry(0.1 * scale, 10, 9), footMaterial);
  leftFoot.scale.set(1.08, 0.72, 0.9);
  leftFoot.position.set(-0.18 * scale, 0.1 * scale, 0.26 * scale);
  root.add(leftFoot);

  const rightFoot = leftFoot.clone();
  rightFoot.position.x = 0.18 * scale;
  root.add(rightFoot);

  return {
    group,
    root,
    body,
    face,
    leftEye,
    rightEye,
    feet: [leftFoot, rightFoot] as [Mesh, Mesh],
    fluffPuffs,
    creatureScale: scale,
  };
}

function buildGroundLayer() {
  const group = new Group();
  const flowerPalette = ["#fff7f0", "#ffd969", "#f6c6df", "#fdf8b9", "#f7d7ff"];

  scenicPockets.forEach((pocket) => {
    const isStartPocket = pocket.id === "start-meadow";
    const isUpperRoutePocket = pocket.id === "mistfall-basin" || pocket.id === "windstep-shelf" || pocket.id === "ridge-crossing";
    const clusterCount =
      isStartPocket ? 4 :
      pocket.zone === "plains" ? 8 :
      pocket.zone === "hills" ? 5 :
      pocket.zone === "foothills" ? (pocket.id === "fir-gate-entry" ? 4 : 3) :
      pocket.zone === "alpine" ? (pocket.kind === "stream_bend" || isUpperRoutePocket ? 2 : 0) :
      pocket.zone === "ridge" ? (isUpperRoutePocket ? 1 : 0) :
      0;
    const cloverCount =
      isStartPocket ? 2 :
      pocket.zone === "plains" ? 5 :
      pocket.zone === "hills" ? 2 :
      0;

    for (let i = 0; i < clusterCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, i, pocket.kind === "stream_bend" ? 0.72 : 0.9);
      const y = sampleTerrainHeight(x, z);
      const flowerGroup = new Group();
      const bloomCount =
        pocket.zone === "plains" ? 10 :
        pocket.zone === "hills" ? 7 :
        pocket.zone === "foothills" ? 4 :
        pocket.zone === "alpine" ? 3 :
        2;
      for (let j = 0; j < bloomCount; j += 1) {
        const localAngle = (j / Math.max(1, bloomCount)) * Math.PI * 2;
        const localRadius = 0.35 + (j % 3) * 0.16;
        const flower = makeFlower(
          flowerPalette[(i + j) % flowerPalette.length],
          0.66 + ((i + j) % 3) * 0.08,
          pocket.zone === "foothills" ? 0.9 : 0.72 + (j % 2) * 0.08,
        );
        flower.position.set(Math.cos(localAngle) * localRadius, 0, Math.sin(localAngle) * localRadius);
        flowerGroup.add(flower);
      }

      flowerGroup.position.set(x, y, z);
      group.add(flowerGroup);
    }

    for (let i = 0; i < cloverCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 30 + i, 0.78);
      const y = sampleTerrainHeight(x, z);
      const patch = makeCloverPatch(0.42 + i * 0.05, i % 2 === 0 ? "#7fb765" : "#90c777");
      patch.position.set(x, y, z);
      group.add(patch);
    }

    const grassPatchCount =
      isStartPocket ? 3 :
      pocket.zone === "foothills" ? 5 :
      pocket.zone === "alpine" ? 3 :
      pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 2 :
      4;
    for (let i = 0; i < grassPatchCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 50 + i, 0.82);
      const y = sampleTerrainHeight(x, z);
      const grass = makeGrassClump(
        pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 0.64 + (i % 2) * 0.1 : 0.8 + (i % 2) * 0.18,
        pocket.zone === "plains" ? "#7fb764" : pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? "#6d8a63" : "#739f5f",
      );
      grass.position.set(x, y, z);
      group.add(grass);
    }

    const rockCount =
      isStartPocket ? 1 :
      pocket.zone === "foothills" ? 5 :
      pocket.zone === "alpine" ? 7 :
      pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 7 :
      3;
    for (let i = 0; i < rockCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 70 + i, 0.88);
      const y = sampleTerrainHeight(x, z);
      const rock = makeTinyRock(
        pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 0.78 + (i % 3) * 0.2 : 0.6 + (i % 3) * 0.18,
        pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? "#a7a79d" : pocket.zone === "alpine" ? "#b3b0a2" : "#c5b99d",
      );
      rock.position.set(x, y + 0.08, z);
      rock.rotation.set(0, i * 0.8, 0.22 - i * 0.03);
      group.add(rock);
    }

    if (pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine") {
      for (let i = 0; i < 3; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 90 + i, 0.72);
        const y = sampleTerrainHeight(x, z);
        const moss = makeMossPatch(0.9 + i * 0.12, pocket.zone === "peak_shrine" ? "#7b8f76" : "#6e8c67");
        moss.position.set(x, y, z);
        group.add(moss);
      }
    }
  });

  return group;
}

function buildMidLayer() {
  const group = new Group();

  scenicPockets.forEach((pocket) => {
    const isStartPocket = pocket.id === "start-meadow";
    const bushCount =
      isStartPocket ? 1 :
      pocket.zone === "plains" ? 2 :
      pocket.zone === "hills" ? 3 :
      pocket.zone === "foothills" ? (pocket.id === "fir-gate-entry" ? 5 : 4) :
      pocket.zone === "alpine" ? 2 :
      pocket.zone === "ridge" ? 1 :
      1;
    for (let i = 0; i < bushCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 100 + i, 0.82);
      const y = sampleTerrainHeight(x, z);
      const bush = makeBush(
        pocket.zone === "foothills" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 1.08 : pocket.zone === "alpine" ? 0.94 : 0.92,
        pocket.zone === "plains"
          ? "#8ec86e"
          : pocket.zone === "foothills"
            ? "#73995e"
            : pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine"
              ? "#667d60"
              : "#6f895e",
      );
      bush.position.set(x, y, z);
      group.add(bush);
    }

    if (pocket.zone === "plains" || pocket.zone === "hills" || pocket.zone === "foothills") {
      const mushroomCount = isStartPocket ? 1 : pocket.zone === "plains" ? 3 : 2;
      for (let i = 0; i < mushroomCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 120 + i, 0.7);
        const y = sampleTerrainHeight(x, z);
        const mushroom = makeMushroom(0.72 + i * 0.08, i % 2 === 0 ? "#d8a476" : "#e4b893");
        mushroom.position.set(x, y, z);
        group.add(mushroom);
      }
    }

    if (pocket.zone !== "peak_shrine") {
      const saplingCount =
        pocket.zone === "foothills" ? 3 :
        pocket.zone === "alpine" || pocket.zone === "ridge" ? 4 :
        2;
      for (let i = 0; i < saplingCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 140 + i, 0.9);
        const y = sampleTerrainHeight(x, z);
        const sapling = pocket.zone === "plains" || pocket.zone === "hills"
          ? makeRoundTree(0.46, "#95cb78")
          : makePineTree(
            pocket.zone === "alpine" || pocket.zone === "ridge" ? 0.82 + i * 0.04 : 0.68,
            pocket.zone === "alpine" || pocket.zone === "ridge" ? "#5f7f55" : "#6b8a55",
          );
        sapling.position.set(x, y, z);
        group.add(sapling);
      }
    }
  });

  return group;
}

function buildTreeClusters() {
  const group = new Group();
  const roundClusters = [
    [-108, -146, 1.12, "#9fd571"],
    [-76, -104, 0.96, "#91cf74"],
    [-22, -56, 1.04, "#aedf80"],
    [28, -8, 0.84, "#88c86c"],
    [-60, 22, 0.82, "#8dcc6d"],
  ];
  roundClusters.forEach(([x, z, scale, color], index) => {
    const tree = makeRoundTree(scale as number, color as string);
    tree.position.set(x as number, sampleTerrainHeight(x as number, z as number), z as number);
    tree.rotation.y = index * 0.8;
    group.add(tree);
  });

  const mixedClusters = [
    [-4, 72, 0.9, "round"],
    [18, 86, 0.96, "pine"],
    [34, 100, 1.08, "pine"],
    [-10, 106, 0.8, "round"],
    [14, 118, 1.04, "pine"],
    [42, 130, 1.12, "pine"],
    [-14, 146, 0.96, "pine"],
    [10, 156, 1.16, "pine"],
    [-28, 168, 1.12, "pine"],
    [20, 186, 1.22, "pine"],
    [-4, 198, 1.18, "pine"],
    [48, 210, 1.08, "pine"],
  ];
  mixedClusters.forEach(([x, z, scale, type], index) => {
    const tree = type === "round"
      ? makeRoundTree(scale as number, index % 2 === 0 ? "#83be68" : "#92c974")
      : makePineTree(scale as number, z as number > 150 ? "#58754b" : "#628552");
    tree.position.set(x as number, sampleTerrainHeight(x as number, z as number), z as number);
    tree.rotation.y = index * 0.55;
    group.add(tree);
  });

  return group;
}

function buildHighlandAccents() {
  const group = new Group();

  scenicPockets
    .filter((pocket) => pocket.zone === "foothills" || pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine")
    .forEach((pocket, pocketIndex) => {
      const formationCount =
        pocket.zone === "foothills" ? 2 :
        pocket.zone === "alpine" ? 3 :
        pocket.zone === "ridge" ? 3 :
        2;
      for (let i = 0; i < formationCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 300 + pocketIndex * 20 + i, pocket.kind === "overlook" ? 0.74 : 0.9);
        const y = sampleTerrainHeight(x, z);
        const rock = makeRockFormation(
          pocket.zone === "foothills" ? 1.1 + i * 0.12 : 1.34 + i * 0.14,
          pocket.zone === "peak_shrine" ? "#b8b4ac" : pocket.zone === "ridge" ? "#aba99e" : "#b7b1a5",
        );
        rock.position.set(x, y, z);
        rock.rotation.y = pocketIndex * 0.7 + i * 1.2;
        group.add(rock);
      }

      const mossCount = pocket.zone === "foothills" ? 2 : 3;
      for (let i = 0; i < mossCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 380 + pocketIndex * 20 + i, 0.76);
        const y = sampleTerrainHeight(x, z);
        const moss = makeMossPatch(
          pocket.zone === "foothills" ? 1.18 + i * 0.1 : 1.34 + i * 0.12,
          pocket.zone === "foothills" ? "#7c965f" : pocket.zone === "peak_shrine" ? "#71806d" : "#697f62",
        );
        moss.position.set(x, y, z);
        group.add(moss);
      }

      if (pocket.zone !== "peak_shrine") {
        const pineCount = pocket.zone === "foothills" ? 2 : 3;
        for (let i = 0; i < pineCount; i += 1) {
          const { x, z } = scatterAroundPocket(pocket, 430 + pocketIndex * 20 + i, 0.98);
          const y = sampleTerrainHeight(x, z);
          const pine = makePineTree(
            pocket.zone === "foothills" ? 1.02 + i * 0.08 : 1.18 + i * 0.12,
            pocket.zone === "foothills" ? "#6a8c56" : pocket.zone === "alpine" ? "#57744a" : "#4f6845",
          );
          pine.position.set(x, y, z);
          pine.rotation.y = i * 0.8 + pocketIndex * 0.4;
          group.add(pine);
        }
      }

      if (pocket.id === "mistfall-cascade") {
        const waterfall = makeWaterfallRibbon(28, 8);
        waterfall.position.set(pocket.position.x + 10, pocket.position.y + 4, pocket.position.z - 2);
        waterfall.rotation.y = -0.18;
        waterfall.rotation.z = 0.08;
        group.add(waterfall);

        const pool = new Mesh(
          new SphereGeometry(3.6, 12, 10),
          new MeshStandardMaterial({ color: "#99c6d4", roughness: 0.28, metalness: 0 }),
        );
        pool.scale.set(1.6, 0.18, 1.18);
        pool.position.set(pocket.position.x + 12, sampleTerrainHeight(pocket.position.x + 12, pocket.position.z + 6) + 0.4, pocket.position.z + 6);
        group.add(pool);
      }

      if (pocket.id === "fir-gate-entry") {
        for (const [xOffset, zOffset, scale] of [[-6, -1, 1.32], [5, 2, 1.46]] as const) {
          const pine = makePineTree(scale, "#5f804f");
          pine.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset),
            pocket.position.z + zOffset,
          );
          pine.rotation.y = xOffset * 0.12;
          group.add(pine);
        }
      }

      if (pocket.id === "mistfall-basin") {
        const basinPool = new Mesh(
          new SphereGeometry(3.8, 12, 10),
          new MeshStandardMaterial({ color: "#a9d1de", roughness: 0.24, metalness: 0 }),
        );
        basinPool.scale.set(1.85, 0.2, 1.28);
        basinPool.position.set(pocket.position.x + 4, sampleTerrainHeight(pocket.position.x + 4, pocket.position.z + 4) + 0.36, pocket.position.z + 4);
        group.add(basinPool);
      }

      if (pocket.id === "windstep-shelf") {
        for (const [xOffset, zOffset, scale] of [[-7, -4, 1.46], [0, 0, 1.62], [7, 3, 1.38]] as const) {
          const rock = makeRockFormation(scale, "#aca79c");
          rock.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset),
            pocket.position.z + zOffset,
          );
          rock.rotation.y = xOffset * 0.08 + zOffset * 0.04;
          group.add(rock);
        }
      }

      if (pocket.id === "ridge-crossing") {
        for (const [xOffset, zOffset, scale] of [[-8, -2, 1.52], [8, 2, 1.44]] as const) {
          const pine = makePineTree(scale, "#4d6743");
          pine.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset),
            pocket.position.z + zOffset,
          );
          group.add(pine);
        }
      }
    });

  return group;
}

function buildHighlandWaterways(): WaterSurfaceGroup {
  const group = new Group();
  const controllers: WaterSurfaceController[] = [];
  const waterfallPocket = scenicPockets.find((pocket) => pocket.id === "mistfall-cascade");
  const basinPocket = scenicPockets.find((pocket) => pocket.id === "mistfall-basin");
  const shelfPocket = scenicPockets.find((pocket) => pocket.id === "windstep-shelf");
  if (waterfallPocket) {
    const ridgeRun = makeCreekSurface(
      [
        new Vector3(56, sampleTerrainHeight(56, 112) + 0.5, 112),
        new Vector3(48, sampleTerrainHeight(48, 120) + 0.55, 120),
        new Vector3(42, sampleTerrainHeight(42, 124) + 0.5, 124),
        new Vector3(waterfallPocket.position.x + 8, sampleTerrainHeight(waterfallPocket.position.x + 8, waterfallPocket.position.z - 4) + 0.5, waterfallPocket.position.z - 4),
      ],
      1.3,
      WATER_PROFILES.alpineRunoff,
    );
    group.add(ridgeRun.mesh);
    controllers.push(ridgeRun);

    const lowerRun = makeCreekSurface(
      [
        new Vector3(waterfallPocket.position.x + 12, sampleTerrainHeight(waterfallPocket.position.x + 12, waterfallPocket.position.z + 8) + 0.45, waterfallPocket.position.z + 8),
        new Vector3(26, sampleTerrainHeight(26, 142) + 0.42, 142),
        new Vector3(14, sampleTerrainHeight(14, 156) + 0.38, 156),
        new Vector3(4, sampleTerrainHeight(4, 170) + 0.35, 170),
      ],
      1.05,
      WATER_PROFILES.waterfallOutflow,
      0.74,
    );
    group.add(lowerRun.mesh);
    controllers.push(lowerRun);
  }

  if (basinPocket && shelfPocket) {
    const shelfRun = makeCreekSurface(
      [
        new Vector3(basinPocket.position.x + 4, sampleTerrainHeight(basinPocket.position.x + 4, basinPocket.position.z + 6) + 0.38, basinPocket.position.z + 6),
        new Vector3(24, sampleTerrainHeight(24, 146) + 0.34, 146),
        new Vector3(shelfPocket.position.x + 4, sampleTerrainHeight(shelfPocket.position.x + 4, shelfPocket.position.z + 8) + 0.32, shelfPocket.position.z + 8),
        new Vector3(10, sampleTerrainHeight(10, 184) + 0.28, 184),
      ],
      0.92,
      WATER_PROFILES.alpineRunoff,
      0.66,
    );
    group.add(shelfRun.mesh);
    controllers.push(shelfRun);
  }

  const foothillRun = makeCreekSurface(
    [
      new Vector3(26, sampleTerrainHeight(26, 84) + 0.32, 84),
      new Vector3(22, sampleTerrainHeight(22, 96) + 0.3, 96),
      new Vector3(18, sampleTerrainHeight(18, 106) + 0.28, 106),
      new Vector3(8, sampleTerrainHeight(8, 120) + 0.25, 120),
    ],
    0.9,
    WATER_PROFILES.foothillCreek,
    0.68,
  );
  group.add(foothillRun.mesh);
  controllers.push(foothillRun);

  return { group, controllers };
}

function buildMountainAtmosphere() {
  const group = new Group();

  scenicPockets
    .filter((pocket) => pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine")
    .forEach((pocket, pocketIndex) => {
      const cluster = new Group();
      const baseY = pocket.position.y + (pocket.zone === "peak_shrine" ? 14 : pocket.zone === "ridge" ? 10 : 8);
      const puffCount = pocket.zone === "peak_shrine" ? 5 : pocket.zone === "ridge" ? 5 : 4;
      for (let i = 0; i < puffCount; i += 1) {
        const puff = makeMistPuff(
          pocket.zone === "peak_shrine" ? 14 + i * 2 : pocket.zone === "ridge" ? 12 + i * 1.9 : 10 + i * 1.8,
          pocket.zone === "peak_shrine" ? "#eef6ff" : "#e2eef6",
          pocket.zone === "peak_shrine" ? 0.16 - i * 0.02 : 0.14 - i * 0.02,
        );
        const baseY = i * (pocket.zone === "peak_shrine" ? 3.4 : pocket.zone === "ridge" ? 3 : 2.8);
        puff.position.set(
          Math.cos(i * 1.4 + pocketIndex) * (8 + i * 5),
          baseY,
          Math.sin(i * 1.2 + pocketIndex * 0.7) * (10 + i * 4),
        );
        puff.userData.baseY = baseY;
        cluster.add(puff);
      }
      cluster.position.set(pocket.position.x, baseY, pocket.position.z);
      cluster.userData.baseX = cluster.position.x;
      cluster.userData.baseZ = cluster.position.z;
      group.add(cluster);
    });

  return group;
}

function stageAmbientBlobCloseup(blobs: AmbientBlob[]) {
  const forward = new Vector3().subVectors(startingLookTarget, startingPosition).setY(0).normalize();
  const right = new Vector3(forward.z, 0, -forward.x).normalize();
  const layouts = [
    { forwardOffset: 9.2, rightOffset: 9.8, restUntil: 0.2, groupScale: 1.32 },
    { forwardOffset: 12.8, rightOffset: 5.2, restUntil: 1.1, groupScale: 1.14 },
    { forwardOffset: 15.6, rightOffset: 11.6, restUntil: 1.8, groupScale: 1.08 },
  ];

  layouts.forEach((layout, index) => {
    const blob = blobs[index];
    if (!blob) {
      return;
    }

    const x = startingPosition.x + forward.x * layout.forwardOffset + right.x * layout.rightOffset;
    const z = startingPosition.z + forward.z * layout.forwardOffset + right.z * layout.rightOffset;
    const y = sampleTerrainHeight(x, z);
    const facingYaw = Math.atan2(startingPosition.x - x, startingPosition.z - z);
    blob.group.position.set(x, y, z);
    blob.home.set(x, y, z);
    blob.target.set(x, y, z);
    blob.velocity.set(0, 0, 0);
    blob.mode = "rest";
    blob.restUntil = layout.restUntil;
    blob.facingYaw = facingYaw;
    blob.group.rotation.y = facingYaw;
    blob.group.scale.setScalar(layout.groupScale);
  });

  const stagedHerdId = blobs[0]?.herdId;
  if (stagedHerdId !== undefined) {
    const stagedCenter = new Vector3();
    let stagedCount = 0;
    layouts.forEach((_layout, index) => {
      const blob = blobs[index];
      if (!blob || blob.herdId !== stagedHerdId) {
        return;
      }
      stagedCenter.add(blob.group.position);
      stagedCount += 1;
    });
    if (stagedCount > 0) {
      stagedCenter.multiplyScalar(1 / stagedCount);
      layouts.forEach((_layout, index) => {
        const blob = blobs[index];
        if (blob && blob.herdId === stagedHerdId) {
          blob.herdCenter.copy(stagedCenter);
        }
      });
    }
  }

  return blobs;
}

function buildAmbientBlobs(options: WorldRendererOptions = {}) {
  const plainsHomes = scenicPockets.filter((pocket) => pocket.zone === "plains");
  const blobs = plainsHomes.flatMap((pocket, pocketIndex): AmbientBlob[] =>
    Array.from({ length: pocketIndex === 0 ? 3 : 2 }, (_, index) => {
      const { x, z } = scatterAroundPocket(pocket, 200 + pocketIndex * 20 + index, 0.46);
      const y = sampleTerrainHeight(x, z);
      const herdCenter = new Vector3(
        pocket.position.x,
        sampleTerrainHeight(pocket.position.x, pocket.position.z),
        pocket.position.z,
      );
      const creatureScale = 1.18 + index * 0.12;
      const rig = makeAmbientBlob(creatureScale);
      rig.group.position.set(x, y, z);
      const facingYaw = Math.sin((pocketIndex + 1) * 2.6 + index * 1.9) * 0.7;
      rig.group.rotation.y = facingYaw;
      const blob: AmbientBlob = {
        ...rig,
        herdId: pocketIndex,
        herdCenter,
        home: new Vector3(x, y, z),
        target: new Vector3(x, y, z),
        velocity: new Vector3(),
        restUntil: 0.8 + index * 0.5,
        avoidPlayerUntil: 0,
        investigateAgainAt: 0,
        nextBlinkAt: 0.9 + pocketIndex * 0.28 + index * 0.34,
        blinkUntil: 0,
        nextIdlePoseAt: 1.8 + pocketIndex * 0.4 + index * 0.45,
        idlePoseStartAt: 0,
        idlePoseUntil: 0,
        idlePose: "none",
        nextHopAt: 1.6 + pocketIndex * 0.35 + index * 0.5,
        hopUntil: 0,
        mode: "rest",
        bobOffset: pocketIndex * 0.9 + index * 0.7,
        poseSeed: pocketIndex * 2.2 + index * 1.4,
        facingYaw,
        creatureScale,
      };
      return blob;
    }),
  );

  return options.debugSpiritCloseup ? stageAmbientBlobCloseup(blobs) : blobs;
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

export class WorldRenderer {
  readonly mossu = new MossuAvatar();
  readonly terrain = makeTerrainMesh();
  readonly skyDome = buildSkyDome();
  readonly clouds = buildClouds();
  readonly windMeshes: Array<InstancedMesh> = [];
  private readonly waterControllers: Array<WaterSurfaceController> = [];
  private readonly cameraCollisionMeshes: Mesh[] = [];
  private readonly gameplayFog = new Fog("#c4d1c2", 360, 860);

  private readonly shrine = buildShrine();
  private readonly river = makeRiverMesh();
  private readonly openingLake = makeOpeningLakeSurface();
  private readonly islandShell = buildFloatingIslandShell();
  private readonly groundLayer = buildGroundLayer();
  private readonly midLayer = buildMidLayer();
  private readonly treeClusters = buildTreeClusters();
  private readonly highlandAccents = buildHighlandAccents();
  private readonly highlandWaterways = buildHighlandWaterways();
  private readonly mountainAtmosphere = buildMountainAtmosphere();
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
  private readonly landingUp = new Vector3(0, 1, 0);
  private readonly landingQuat = new Quaternion();
  private readonly landingPosition = new Vector3();
  private readonly landingNormal = new Vector3();
  private readonly trailVelocity = new Vector3();
  private readonly trailDirection = new Vector3();
  private readonly ambientPlayerMotion = new Vector3();
  private readonly ambientToPlayer = new Vector3();
  private readonly ambientNeighborOffset = new Vector3();
  private readonly ambientGroupCenter = new Vector3();
  private readonly ambientCohesion = new Vector3();
  private readonly ambientSeparation = new Vector3();
  private readonly ambientDesiredTarget = new Vector3();
  private trailEmissionCarry = 0;
  private readonly mapMarkerGroup = new Group();
  private readonly forageableGroup = new Group();
  private readonly forageableVisuals = buildForageableVisuals();
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
    scene.add(this.river.mesh);
    scene.add(this.openingLake.mesh);
    scene.add(this.groundLayer);
    scene.add(this.midLayer);
    scene.add(this.treeClusters);
    scene.add(this.highlandAccents);
    scene.add(this.highlandWaterways.group);
    scene.add(this.mountainAtmosphere);
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
      new Color("#4e6540"),
      new Color("#d4e492"),
      {
        crossPlanes: 3,
        bladeWidth: 0.72,
        bladeHeight: 3.6,
        placementMultiplier: 0.72,
        scaleMultiplier: 1.1,
        widthMultiplier: 0.92,
        fadeInStart: -1,
        fadeInEnd: 0,
        fadeOutStart: 34,
        fadeOutEnd: 68,
        rootFillBoost: 0.08,
        selfShadowStrength: 0.92,
        distanceCompressionBoost: 0.04,
      },
    );
    const meadowMidGrass = createGrassMesh(
      Math.round(GRASS_COUNT * 0.56),
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color("#4a623c"),
      new Color("#c7d987"),
      {
        crossPlanes: 2,
        bladeWidth: 0.86,
        bladeHeight: 3.1,
        placementMultiplier: 0.94,
        scaleMultiplier: 1.04,
        widthMultiplier: 1.06,
        fadeInStart: 24,
        fadeInEnd: 44,
        fadeOutStart: 96,
        fadeOutEnd: 144,
        rootFillBoost: 0.18,
        selfShadowStrength: 0.72,
        distanceCompressionBoost: 0.14,
      },
    );
    const meadowFarGrass = createGrassMesh(
      GRASS_COUNT - 260,
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color("#49603a"),
      new Color("#b7c777"),
      {
        crossPlanes: 1,
        bladeWidth: 1.02,
        bladeHeight: 2.7,
        placementMultiplier: 1.1,
        scaleMultiplier: 0.98,
        widthMultiplier: 1.18,
        fadeInStart: 84,
        fadeInEnd: 118,
        fadeOutStart: 220,
        fadeOutEnd: 320,
        rootFillBoost: 0.28,
        selfShadowStrength: 0.6,
        distanceCompressionBoost: 0.26,
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

    this.waterControllers.push(this.river, this.openingLake, ...this.highlandWaterways.controllers);
    this.registerCameraCollider(this.terrain);
    this.collectCameraColliders(this.islandShell);
    this.collectCameraColliders(this.shrine);
    this.collectCameraColliders(this.treeClusters);
    this.collectCameraColliders(this.highlandAccents);
    this.collectCameraColliders(this.landmarkTrees);

    [
      this.terrain,
      this.islandShell,
      this.river.mesh,
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

  update(frame: FrameState, elapsed: number, dt: number, mapLookdown = false) {
    this.mossu.update(frame.player, dt);
    this.skyDome.position.copy(frame.player.position);
    this.scene.fog = mapLookdown ? null : this.gameplayFog;
    this.updateWind(frame, elapsed);
    this.updateWater(elapsed);
    this.updateClouds(elapsed);
    this.updateAmbientBlobs(frame, elapsed, dt, mapLookdown);
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

  private updateAmbientBlobs(frame: FrameState, elapsed: number, dt: number, mapLookdown: boolean) {
    this.ambientBlobGroup.visible = !mapLookdown;
    if (mapLookdown) {
      return;
    }

    const playerPosition = frame.player.position;
    const playerPlanarSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
    this.ambientPlayerMotion.set(frame.player.velocity.x, 0, frame.player.velocity.z);
    this.ambientBlobs.forEach((blob, index) => {
      const groundY = sampleTerrainHeight(blob.group.position.x, blob.group.position.z);
      const toPlayer = this.ambientToPlayer.subVectors(playerPosition, blob.group.position);
      const planarToPlayer = Math.hypot(toPlayer.x, toPlayer.z);
      const playerTooClose = planarToPlayer < 8.5;
      const playerApproachAlignment =
        playerPlanarSpeed > 0.001 && planarToPlayer > 0.001
          ? this.ambientPlayerMotion.dot(toPlayer) / (playerPlanarSpeed * planarToPlayer)
          : 0;
      const playerApproaching =
        frame.player.grounded &&
        !frame.player.swimming &&
        planarToPlayer < 15.5 &&
        playerPlanarSpeed > 5 &&
        playerApproachAlignment > 0.55;
      const stillAvoidingPlayer = elapsed < blob.avoidPlayerUntil;

      this.ambientGroupCenter.copy(blob.group.position);
      this.ambientCohesion.set(0, 0, 0);
      this.ambientSeparation.set(0, 0, 0);

      let herdMateCount = 1;
      let nearbyMateCount = 0;
      let nearestMateDistance = Number.POSITIVE_INFINITY;
      this.ambientBlobs.forEach((otherBlob, otherIndex) => {
        if (otherIndex === index || otherBlob.herdId !== blob.herdId) {
          return;
        }

        this.ambientNeighborOffset
          .subVectors(otherBlob.group.position, blob.group.position)
          .setY(0);
        const neighborDistance = this.ambientNeighborOffset.length();
        if (neighborDistance <= 0.001) {
          return;
        }

        herdMateCount += 1;
        nearestMateDistance = Math.min(nearestMateDistance, neighborDistance);
        this.ambientGroupCenter.add(otherBlob.group.position);

        if (neighborDistance < 5.8) {
          nearbyMateCount += 1;
        }
        if (neighborDistance < 3.1) {
          this.ambientSeparation.addScaledVector(
            this.ambientNeighborOffset,
            -((3.1 - neighborDistance) / (3.1 * neighborDistance)),
          );
        }
      });

      if (herdMateCount > 1) {
        this.ambientGroupCenter.multiplyScalar(1 / herdMateCount);
      } else {
        this.ambientGroupCenter.copy(blob.herdCenter);
      }
      this.ambientGroupCenter.y = groundY;

      const herdOffset = this.ambientCohesion
        .subVectors(this.ambientGroupCenter, blob.group.position)
        .setY(0);
      const herdDistance = herdOffset.length();
      if (herdDistance > 0.001) {
        herdOffset.multiplyScalar(1 / herdDistance);
      }
      const separatedFromHerd =
        herdDistance > 4.8 || (herdMateCount > 1 && nearbyMateCount === 0 && nearestMateDistance > 6.4);
      const herdPullStrength = herdDistance > 2.2 ? MathUtils.clamp((herdDistance - 2.2) / 4.4, 0, 1.25) : 0;
      const separationStrength = this.ambientSeparation.length();

      if (blob.mode === "curious" && blob.restUntil < elapsed) {
        blob.investigateAgainAt = elapsed + 2.6 + (index % 2) * 0.5;
      }

      if (playerTooClose || playerApproaching || stillAvoidingPlayer) {
        blob.mode = "shy";
        const away = planarToPlayer > 0.001 ? toPlayer.multiplyScalar(-1 / planarToPlayer) : toPlayer.set(1, 0, 0);
        this.ambientDesiredTarget.copy(blob.group.position).addScaledVector(away, playerApproaching ? 6.6 : 4.8);
        if (herdPullStrength > 0) {
          this.ambientDesiredTarget.addScaledVector(herdOffset, 1.6 + herdPullStrength * 1.5);
        }
        blob.target.set(
          this.ambientDesiredTarget.x,
          blob.home.y,
          this.ambientDesiredTarget.z,
        );
        if (playerTooClose || playerApproaching) {
          blob.avoidPlayerUntil = Math.max(
            blob.avoidPlayerUntil,
            elapsed + (playerApproaching ? 3 : 2.8 + (index % 3) * 0.35),
          );
        }
        blob.restUntil = Math.max(blob.restUntil, elapsed + (playerApproaching ? 1.4 : 1.1));
      } else if (
        planarToPlayer < 16 &&
        blob.mode !== "shy" &&
        blob.restUntil < elapsed &&
        elapsed >= blob.avoidPlayerUntil &&
        elapsed >= blob.investigateAgainAt
      ) {
        blob.mode = "curious";
        blob.target.set(
          playerPosition.x - toPlayer.x * 0.35,
          playerPosition.y,
          playerPosition.z - toPlayer.z * 0.35,
        );
        blob.restUntil = elapsed + 1.3;
      } else if (blob.restUntil < elapsed) {
        if (separatedFromHerd && elapsed >= blob.avoidPlayerUntil) {
          blob.mode = "wander";
          const regroupAngle = blob.poseSeed + elapsed * 0.2;
          blob.target.set(
            this.ambientGroupCenter.x + Math.cos(regroupAngle) * 1.4,
            blob.home.y,
            this.ambientGroupCenter.z + Math.sin(regroupAngle) * 1.2,
          );
          blob.restUntil = elapsed + 1.5;
        } else if (blob.mode === "rest") {
          blob.mode = "wander";
          const wanderAngle = elapsed * 0.45 + index * 1.7;
          blob.target.set(
            blob.home.x + Math.cos(wanderAngle) * (1.6 + (index % 3) * 1.1),
            blob.home.y,
            blob.home.z + Math.sin(wanderAngle) * (1.2 + (index % 2) * 1.4),
          );
          blob.restUntil = elapsed + 2.2 + (index % 3) * 0.5;
        } else {
          blob.mode = "rest";
          blob.target.copy(blob.group.position);
          blob.restUntil = elapsed + 1.8 + (index % 2) * 0.8;
        }
      }

      if (elapsed >= blob.nextBlinkAt) {
        blob.blinkUntil = elapsed + 0.12;
        blob.nextBlinkAt =
          elapsed +
          1.8 +
          (((Math.sin(blob.poseSeed * 2.7 + elapsed * 0.42) + 1) * 0.5) * 2.4) +
          (blob.mode === "rest" ? 0.2 : 0);
      }

      const canDoIdlePose =
        (blob.mode === "rest" || blob.mode === "wander") &&
        elapsed >= blob.avoidPlayerUntil &&
        planarToPlayer > 10.5;
      if (canDoIdlePose && elapsed >= blob.nextIdlePoseAt) {
        const idleRoll = (Math.sin(blob.poseSeed * 3.1 + elapsed * 0.58) + 1) * 0.5;
        blob.idlePose =
          idleRoll < 0.24 ? "look_left" :
          idleRoll < 0.48 ? "look_right" :
          idleRoll < 0.74 ? "sniff" :
          "settle";
        const idleDuration =
          blob.idlePose === "sniff" ? 0.9 :
          blob.idlePose === "settle" ? 1.35 :
          1.05;
        blob.idlePoseStartAt = elapsed;
        blob.idlePoseUntil = elapsed + idleDuration;
        blob.nextIdlePoseAt =
          elapsed +
          idleDuration +
          1.8 +
          (((Math.sin(blob.poseSeed * 1.6 + elapsed * 0.31) + 1) * 0.5) * 2.6);
        if (blob.mode === "rest") {
          blob.restUntil = Math.max(blob.restUntil, elapsed + idleDuration * 0.9);
        }
      } else if (!canDoIdlePose && blob.idlePoseUntil > elapsed) {
        blob.idlePose = "none";
        blob.idlePoseUntil = elapsed;
      }

      const canDoIdleHop =
        (blob.mode === "rest" || blob.mode === "wander") &&
        elapsed >= blob.avoidPlayerUntil &&
        planarToPlayer > 10.5;
      if (canDoIdleHop && elapsed >= blob.nextHopAt) {
        blob.hopUntil = elapsed + 0.42;
        blob.nextHopAt =
          elapsed +
          2.8 +
          (((Math.sin(blob.poseSeed * 1.9 + elapsed * 0.35) + 1) * 0.5) * 2.4) +
          (index % 3) * 0.25;
        if (blob.mode === "rest") {
          blob.restUntil = Math.max(blob.restUntil, elapsed + 0.45);
        }
      } else if (!canDoIdleHop && blob.hopUntil > elapsed) {
        blob.hopUntil = elapsed;
      }

      const moveStrength = blob.mode === "shy" ? 4.2 : blob.mode === "curious" ? 2.2 : blob.mode === "wander" ? 1.4 : 0;
      if (moveStrength > 0) {
        this.ambientDesiredTarget.copy(blob.target);
        if (herdPullStrength > 0 && blob.mode !== "curious") {
          this.ambientDesiredTarget.addScaledVector(
            herdOffset,
            (blob.mode === "shy" ? 1.2 : 1.8) * herdPullStrength,
          );
        }
        if (separationStrength > 0.001) {
          this.ambientDesiredTarget.addScaledVector(
            this.ambientSeparation,
            blob.mode === "shy" ? 1.8 : 1.2,
          );
        }
        this.trailDirection
          .subVectors(this.ambientDesiredTarget, blob.group.position)
          .setY(0);
        const distance = this.trailDirection.length();
        if (distance > 0.12) {
          this.trailDirection.normalize();
          blob.velocity.lerp(this.trailDirection.multiplyScalar(moveStrength), 1 - Math.exp(-dt * 2.6));
          blob.group.position.addScaledVector(blob.velocity, dt);
        } else {
          blob.velocity.multiplyScalar(0.72);
          if (blob.mode === "shy") {
            blob.mode = "rest";
          }
        }
      } else {
        blob.velocity.multiplyScalar(0.84);
      }

      const planarSpeed = blob.velocity.length();
      const scale = blob.creatureScale;
      const restPulse = Math.sin(elapsed * 2.3 + blob.poseSeed);
      const curiousSway = Math.sin(elapsed * 2.1 + blob.poseSeed * 1.4);
      const wanderHop = Math.max(0, Math.sin(elapsed * 6.8 + blob.poseSeed));
      const shyHop = Math.max(0, Math.sin(elapsed * 9.6 + blob.poseSeed));
      const blinkT = blob.blinkUntil > elapsed ? 1 - (blob.blinkUntil - elapsed) / 0.12 : 0;
      const blink = blinkT > 0 && blinkT < 1 ? Math.sin(blinkT * Math.PI) : 0;
      const idlePoseDuration = Math.max(0.001, blob.idlePoseUntil - blob.idlePoseStartAt);
      const idlePoseT =
        blob.idlePoseUntil > elapsed && elapsed >= blob.idlePoseStartAt
          ? MathUtils.clamp((elapsed - blob.idlePoseStartAt) / idlePoseDuration, 0, 1)
          : 0;
      const idlePoseBlend = idlePoseT > 0 && idlePoseT < 1 ? Math.sin(idlePoseT * Math.PI) : 0;
      const idleLookYaw =
        blob.idlePose === "look_left" ? -0.42 * idlePoseBlend :
        blob.idlePose === "look_right" ? 0.42 * idlePoseBlend :
        0;
      const idleSniff = blob.idlePose === "sniff" ? idlePoseBlend : 0;
      const idleSettle = blob.idlePose === "settle" ? idlePoseBlend : 0;
      const idleHopT = blob.hopUntil > elapsed ? 1 - (blob.hopUntil - elapsed) / 0.42 : 0;
      const idleHop = idleHopT > 0 && idleHopT < 1 ? Math.sin(idleHopT * Math.PI) : 0;
      const idleHopSettle = idleHopT > 0 && idleHopT < 0.2 ? 1 - idleHopT / 0.2 : 0;
      const groundedBob = Math.max(0, Math.sin(elapsed * 4.2 + blob.bobOffset)) * planarSpeed * 0.08;
      const poseLift =
        blob.mode === "wander" ? Math.max(wanderHop * 0.2 * scale, idleHop * 0.15 * scale) :
        blob.mode === "shy" ? shyHop * 0.16 * scale :
        idleHop * 0.15 * scale;
      const poseDrop =
        blob.mode === "rest" ? (0.03 + restPulse * 0.012 + idleHopSettle * 0.028 + idleSettle * 0.022) * scale :
        blob.mode === "shy" ? (0.05 + (1 - shyHop) * 0.04) * scale :
        (idleHopSettle * 0.024 + idleSettle * 0.016) * scale;
      const stretch =
        blob.mode === "wander" ? 1 + wanderHop * 0.08 + idleHop * 0.03 :
        blob.mode === "shy" ? 1 + shyHop * 0.05 :
        1 + Math.max(0, restPulse) * 0.02 + idleHop * 0.05 + idleSniff * 0.03;
      const squash =
        blob.mode === "rest" ? 1 - (0.06 + Math.max(0, -restPulse) * 0.04 + idleHopSettle * 0.05 + idleSettle * 0.05) :
        blob.mode === "shy" ? 1 - (0.08 + (1 - shyHop) * 0.06) :
        blob.mode === "wander" ? 1 - (wanderHop * 0.06 + idleHopSettle * 0.04 + idleSettle * 0.03) :
        1 - idleHop * 0.04;
      const desiredYaw =
        planarSpeed > 0.05 ? Math.atan2(blob.velocity.x, blob.velocity.z) :
        blob.mode === "curious" && planarToPlayer > 0.001 ? Math.atan2(toPlayer.x, toPlayer.z) :
        blob.facingYaw + (blob.mode === "rest" ? curiousSway * 0.06 : 0);
      const yawBlend = 1 - Math.exp(-dt * (blob.mode === "shy" ? 8 : 5));
      blob.facingYaw = MathUtils.lerp(blob.facingYaw, desiredYaw, yawBlend);

      blob.group.position.y = groundY + 0.08 + groundedBob;
      blob.group.rotation.y = blob.facingYaw;
      blob.root.position.y = poseLift - poseDrop;
      blob.root.rotation.x =
        blob.mode === "curious" ? -0.12 + curiousSway * 0.03 :
        blob.mode === "shy" ? -0.08 :
        blob.mode === "wander" ? -0.03 + wanderHop * 0.02 - idleSniff * 0.07 - idleSettle * 0.05 :
        -0.02 + restPulse * 0.015 - idleHop * 0.03 - idleSniff * 0.12 - idleSettle * 0.06;
      blob.root.rotation.z =
        blob.mode === "curious" ? curiousSway * 0.08 :
        blob.mode === "wander" ? Math.sin(elapsed * 3.6 + blob.poseSeed) * 0.04 + idleLookYaw * 0.18 :
        restPulse * 0.02 + idleLookYaw * 0.22;

      blob.body.scale.set(1.12 * squash, 1.42 * stretch, 1.08 * squash);
      blob.body.position.y =
        0.76 * scale +
        (blob.mode === "rest" ? restPulse * 0.015 * scale : 0) -
        idleSettle * 0.015 * scale;
      blob.face.rotation.y =
        blob.mode === "curious" ? curiousSway * 0.28 :
        (blob.mode === "rest" ? curiousSway * 0.08 : 0) + idleLookYaw;
      blob.face.position.y =
        0.88 * scale +
        (blob.mode === "rest" ? restPulse * 0.012 * scale : 0) +
        idleSniff * 0.05 * scale -
        idleSettle * 0.015 * scale;
      blob.face.position.z =
        0.5 * scale +
        (blob.mode === "shy" ? -0.03 * scale : 0) +
        idleSniff * 0.035 * scale;

      const eyeSquish =
        blob.mode === "rest" ? 0.35 + Math.max(0, -restPulse) * 0.22 + idleSettle * 0.16 + blink * 1.35 :
        blob.mode === "shy" ? 0.24 :
        blink * 1.35 + idleSniff * 0.08;
      blob.leftEye.scale.set(0.86 + eyeSquish * 0.18, 1.34 - eyeSquish * 0.56, 0.68);
      blob.rightEye.scale.copy(blob.leftEye.scale);

      blob.feet.forEach((foot, footIndex) => {
        const footHop =
          blob.mode === "wander" ? Math.max(0, Math.sin(elapsed * 6.8 + blob.poseSeed + footIndex * Math.PI * 0.65)) * 0.05 * scale :
          blob.mode === "shy" ? Math.max(0, Math.sin(elapsed * 9.6 + blob.poseSeed + footIndex * Math.PI * 0.75)) * 0.04 * scale :
          idleHop * 0.02 * scale;
        foot.position.set(
          (footIndex === 0 ? -0.18 : 0.18) * scale,
          0.1 * scale + footHop - idleSettle * 0.015 * scale,
          (blob.mode === "shy" ? 0.18 : 0.26) * scale - idleSniff * 0.015 * scale,
        );
        foot.scale.set(
          1.08 - eyeSquish * 0.08,
          0.72 - eyeSquish * 0.08 + footHop / Math.max(0.001, scale),
          0.9,
        );
      });

      blob.fluffPuffs.forEach((puff, puffIndex) => {
        const sway = Math.sin(elapsed * 2.8 + blob.poseSeed + puffIndex * 0.8);
        const puffScale = 1 + sway * 0.03 + (blob.mode === "wander" ? wanderHop * 0.02 : 0);
        if (puffIndex < 4) {
          puff.scale.set(0.42 * scale * puffScale, 0.4 * scale * (1 - sway * 0.02), 0.38 * scale);
        } else if (puffIndex < 7) {
          puff.scale.set(0.28 * scale * puffScale, 0.34 * scale, 0.26 * scale);
        } else {
          puff.scale.set(0.22 * scale * puffScale, 0.16 * scale, 0.18 * scale);
        }
      });
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
