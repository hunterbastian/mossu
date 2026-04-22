import {
  AmbientLight,
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
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
  RepeatWrapping,
  Scene,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { FrameState } from "../../simulation/gameState";
import {
  collectibleOrbs,
  sampleBaseTerrainHeight,
  sampleBiomeZone,
  sampleIslandBoundaryPoint,
  sampleGrassDensity,
  sampleRiverCenter,
  sampleRiverWidth,
  sampleTerrainHeight,
  sampleTerrainNormal,
  sampleWindField,
  scenicPockets,
  shadowPockets,
  worldLandmarks,
} from "../../simulation/world";
import { MossuAvatar } from "../objects/MossuAvatar";

const WORLD_SIZE = 560;
const TERRAIN_SEGMENTS = 240;
const GRASS_COUNT = 7600;
const ALPINE_GRASS_COUNT = 2400;
const LANDING_SPLASH_PARTICLES = 18;
const SNOW_TRAIL_PARTICLES = 20;

interface GrassShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

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

interface AmbientBlob {
  group: Group;
  home: Vector3;
  target: Vector3;
  velocity: Vector3;
  restUntil: number;
  mode: "rest" | "wander" | "curious" | "shy";
  bobOffset: number;
}

function colorForTerrain(x: number, y: number, z: number) {
  const zone = sampleBiomeZone(x, z, y);
  const normal = sampleTerrainNormal(x, z);
  const slope = 1 - normal.y;
  const painterlyNoise = Math.sin(x * 0.07) * 0.04 + Math.cos(z * 0.05) * 0.03 + Math.sin((x - z) * 0.03) * 0.05;
  const patch = Math.round((Math.sin(x * 0.12 + z * 0.08) * 0.5 + 0.5) * 5) / 5;
  const mixValue = Math.min(1, Math.max(0, patch * 0.5 + painterlyNoise + y / 220));

  if (zone === "plains" || zone === "hills") {
    const low = new Color("#88c66c");
    const high = zone === "plains" ? new Color("#b7de83") : new Color("#9fce73");
    const color = low.lerp(high, mixValue);
    return color.lerp(new Color("#c6e4a6"), Math.min(0.22, slope * 0.2));
  }

  if (zone === "foothills") {
    const grassy = new Color("#7ea868");
    const moss = new Color("#67895a");
    const stone = new Color("#b9b09a");
    const color = grassy.lerp(moss, mixValue * 0.45);
    return color.lerp(stone, Math.min(0.55, slope * 1.6));
  }

  if (zone === "alpine" || zone === "ridge") {
    const rockA = new Color("#e2dccd");
    const rockB = new Color("#a9a89d");
    const moss = new Color("#708b67");
    const rockMix = zone === "ridge" ? 0.58 : 0.42;
    const color = rockA.lerp(rockB, 0.3 + mixValue * 0.35);
    return moss.lerp(color, Math.min(1, slope * 2.2 + rockMix));
  }

  return new Color("#f1e9d4").lerp(new Color("#b8b0a0"), Math.min(1, slope * 1.9 + mixValue * 0.3));
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

function makeRiverMesh() {
  const points: Vector3[] = [];
  for (let i = 0; i <= 140; i += 1) {
    const t = i / 140;
    const z = -180 + t * 300;
    const x = sampleRiverCenter(z);
    const y = sampleTerrainHeight(x, z) + 0.35;
    points.push(new Vector3(x, y, z));
  }

  const curve = new CatmullRomCurve3(points);
  const geometry = new TubeGeometry(curve, 180, 8, 8, false);
  const material = new MeshStandardMaterial({
    color: "#9fd0dc",
    roughness: 0.22,
    metalness: 0,
    transparent: true,
    opacity: 0.86,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.y -= 0.8;
  return mesh;
}

function makeCloudCluster(position: Vector3, scale: number) {
  const group = new Group();
  const puffGeometry = new SphereGeometry(1.2, 14, 12);
  const puffMaterial = new MeshLambertMaterial({
    color: "#fffdf6",
    transparent: true,
    opacity: 0.94,
  });

  const puffs = [
    [0, 0, 0, 3.5],
    [3.2, 0.8, -0.3, 2.8],
    [-3, 0.5, 0.2, 2.4],
    [1.6, 1.6, 0.8, 2.2],
    [-1.8, 1.4, -0.8, 2.5],
  ];

  puffs.forEach(([x, y, z, size]) => {
    const puff = new Mesh(puffGeometry, puffMaterial);
    puff.position.set(x as number, y as number, z as number);
    puff.scale.setScalar((size as number) * scale);
    group.add(puff);
  });

  group.position.copy(position);
  return group;
}

function buildClouds() {
  const clouds = new Group();
  const sets = [
    new Vector3(-88, 112, -84),
    new Vector3(42, 126, 12),
    new Vector3(-12, 146, 128),
    new Vector3(98, 162, 182),
    new Vector3(-122, 154, 150),
  ];

  sets.forEach((position, index) => {
    clouds.add(makeCloudCluster(position, 3.4 + index * 0.38));
  });

  return clouds;
}

function buildShrine() {
  const shrine = new Group();
  const stoneMaterial = new MeshStandardMaterial({ color: "#f0e7ce", roughness: 1 });
  const mossMaterial = new MeshStandardMaterial({ color: "#8bb66f", roughness: 1 });
  const base = new Mesh(new CylinderGeometry(4.4, 5.6, 2.2, 7), stoneMaterial);
  const cap = new Mesh(new CylinderGeometry(3.5, 3.8, 3.2, 7), stoneMaterial);
  const moss = new Mesh(new CylinderGeometry(4.6, 4.4, 0.7, 7), mossMaterial);
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
    const trunk = new Mesh(new CylinderGeometry(0.33, 0.44, 7.2, 8), trunkMaterial);
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

function makeRoundTree(scale: number, leafColor: string) {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.22 * scale, 0.34 * scale, 3.8 * scale, 7),
    new MeshLambertMaterial({ color: "#8f7253" }),
  );
  trunk.position.y = 1.9 * scale;
  group.add(trunk);

  for (const [x, y, z, size] of [
    [0, 4.6, 0, 1.8],
    [0.95, 4.2, 0.22, 1.2],
    [-0.9, 4.0, -0.12, 1.16],
    [0.18, 5.45, -0.18, 1.05],
  ]) {
    const canopy = new Mesh(
      new SphereGeometry(size * scale, 10, 8),
      new MeshLambertMaterial({ color: leafColor }),
    );
    canopy.position.set(x * scale, y * scale, z * scale);
    group.add(canopy);
  }

  return group;
}

function makePineTree(scale: number, tone = "#5b7d4d") {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.18 * scale, 0.28 * scale, 4.8 * scale, 7),
    new MeshLambertMaterial({ color: "#7a6347" }),
  );
  trunk.position.y = 2.4 * scale;
  group.add(trunk);

  for (const [y, radius, height] of [
    [2.3, 1.2, 2.2],
    [3.4, 0.98, 1.9],
    [4.45, 0.72, 1.55],
  ]) {
    const cone = new Mesh(
      new ConeGeometry(radius * scale, height * scale, 6),
      new MeshLambertMaterial({ color: tone }),
    );
    cone.position.y = y * scale;
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
    const rock = new Mesh(new SphereGeometry(0.72 * scale, 8, 7), material);
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

function makeCreekRibbon(points: Vector3[], radius: number, color: string, opacity = 0.82) {
  const curve = new CatmullRomCurve3(points);
  const mesh = new Mesh(
    new TubeGeometry(curve, 48, radius, 6, false),
    new MeshStandardMaterial({
      color,
      roughness: 0.24,
      metalness: 0,
      transparent: true,
      opacity,
    }),
  );
  return mesh;
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
  const bodyMaterial = new MeshLambertMaterial({ color: "#7f96ff" });
  const fluffMaterial = new MeshLambertMaterial({ color: "#96aaff" });
  const deepFluffMaterial = new MeshLambertMaterial({ color: "#6478df" });
  const eyeMaterial = new MeshStandardMaterial({ color: "#141c24", roughness: 0.12 });
  const body = new Mesh(new SphereGeometry(0.52 * scale, 12, 10), bodyMaterial);
  body.scale.set(1, 0.94, 1);
  body.position.y = 0.78 * scale;
  group.add(body);

  const fluffPuffs = [
    { x: -0.24, y: 0.92, z: 0.06, s: 0.24, material: fluffMaterial },
    { x: 0.24, y: 0.9, z: 0.08, s: 0.22, material: fluffMaterial },
    { x: -0.16, y: 1.08, z: -0.02, s: 0.17, material: deepFluffMaterial },
    { x: 0.18, y: 1.06, z: -0.04, s: 0.16, material: deepFluffMaterial },
    { x: -0.32, y: 0.72, z: -0.08, s: 0.18, material: fluffMaterial },
    { x: 0.3, y: 0.7, z: -0.05, s: 0.18, material: fluffMaterial },
    { x: 0, y: 1.15, z: 0.05, s: 0.14, material: deepFluffMaterial },
  ];

  fluffPuffs.forEach(({ x, y, z, s, material }) => {
    const puff = new Mesh(new SphereGeometry(s * scale, 8, 7), material);
    puff.position.set(x * scale, y * scale, z * scale);
    puff.scale.set(1.08, 0.92, 1);
    group.add(puff);
  });

  for (const x of [-0.16, 0.16]) {
    const leg = new Mesh(new SphereGeometry(0.12 * scale, 8, 7), fluffMaterial);
    leg.scale.set(1.1, 1.3, 1);
    leg.position.set(x * scale, 0.14 * scale, 0.16 * scale);
    group.add(leg);
  }

  for (const x of [-0.16, 0.16]) {
    const eye = new Mesh(new SphereGeometry(0.07 * scale, 8, 7), eyeMaterial);
    eye.scale.set(0.82, 1.18, 0.68);
    eye.position.set(x * scale, 0.86 * scale, 0.46 * scale);
    group.add(eye);
  }

  return group;
}

function buildGroundLayer() {
  const group = new Group();
  const flowerPalette = ["#fff7f0", "#ffd969", "#f6c6df", "#fdf8b9", "#f7d7ff"];

  scenicPockets.forEach((pocket) => {
    const clusterCount =
      pocket.zone === "plains" ? 7 :
      pocket.zone === "hills" ? 5 :
      pocket.zone === "foothills" ? 3 :
      pocket.zone === "alpine" ? (pocket.kind === "stream_bend" ? 1 : 0) :
      0;
    const cloverCount = pocket.zone === "plains" ? 4 : pocket.zone === "hills" ? 2 : 0;

    for (let i = 0; i < clusterCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, i, pocket.kind === "stream_bend" ? 0.72 : 0.9);
      const y = sampleTerrainHeight(x, z);
      const flowerGroup = new Group();
      const bloomCount = pocket.zone === "plains" ? 9 : pocket.zone === "hills" ? 7 : pocket.zone === "foothills" ? 4 : 3;
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

    const grassPatchCount = pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 2 : 4;
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
      pocket.zone === "foothills" ? 5 :
      pocket.zone === "alpine" ? 6 :
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
    const bushCount =
      pocket.zone === "plains" ? 2 :
      pocket.zone === "hills" ? 3 :
      pocket.zone === "foothills" ? 4 :
      pocket.zone === "alpine" ? 3 :
      pocket.zone === "ridge" ? 2 :
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
      for (let i = 0; i < (pocket.zone === "plains" ? 3 : 2); i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 120 + i, 0.7);
        const y = sampleTerrainHeight(x, z);
        const mushroom = makeMushroom(0.72 + i * 0.08, i % 2 === 0 ? "#d8a476" : "#e4b893");
        mushroom.position.set(x, y, z);
        group.add(mushroom);
      }
    }

    if (pocket.zone !== "peak_shrine") {
      const saplingCount = pocket.zone === "alpine" || pocket.zone === "ridge" ? 3 : 2;
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
    [-96, -138, 1.12, "#9ed46f"],
    [-76, -94, 0.92, "#89c96f"],
    [-18, -58, 1.04, "#a8da79"],
    [42, -24, 0.88, "#7fc362"],
    [-52, 18, 0.84, "#8ecc68"],
  ];
  roundClusters.forEach(([x, z, scale, color], index) => {
    const tree = makeRoundTree(scale as number, color as string);
    tree.position.set(x as number, sampleTerrainHeight(x as number, z as number), z as number);
    tree.rotation.y = index * 0.8;
    group.add(tree);
  });

  const mixedClusters = [
    [-8, 74, 0.92, "round"],
    [34, 92, 0.86, "pine"],
    [-26, 102, 0.76, "round"],
    [12, 122, 0.98, "pine"],
    [48, 144, 1.08, "pine"],
    [-44, 154, 1.02, "pine"],
    [22, 182, 1.12, "pine"],
    [-4, 136, 0.92, "pine"],
    [60, 132, 0.96, "pine"],
    [-38, 176, 1.18, "pine"],
    [42, 196, 1.2, "pine"],
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
    });

  return group;
}

function buildHighlandWaterways() {
  const group = new Group();
  const waterfallPocket = scenicPockets.find((pocket) => pocket.id === "mistfall-cascade");
  if (waterfallPocket) {
    const ridgeRun = makeCreekRibbon(
      [
        new Vector3(56, sampleTerrainHeight(56, 112) + 0.5, 112),
        new Vector3(48, sampleTerrainHeight(48, 120) + 0.55, 120),
        new Vector3(42, sampleTerrainHeight(42, 124) + 0.5, 124),
        new Vector3(waterfallPocket.position.x + 8, sampleTerrainHeight(waterfallPocket.position.x + 8, waterfallPocket.position.z - 4) + 0.5, waterfallPocket.position.z - 4),
      ],
      1.3,
      "#8fc8db",
    );
    group.add(ridgeRun);

    const lowerRun = makeCreekRibbon(
      [
        new Vector3(waterfallPocket.position.x + 12, sampleTerrainHeight(waterfallPocket.position.x + 12, waterfallPocket.position.z + 8) + 0.45, waterfallPocket.position.z + 8),
        new Vector3(26, sampleTerrainHeight(26, 142) + 0.42, 142),
        new Vector3(14, sampleTerrainHeight(14, 156) + 0.38, 156),
        new Vector3(4, sampleTerrainHeight(4, 170) + 0.35, 170),
      ],
      1.05,
      "#99cedf",
      0.74,
    );
    group.add(lowerRun);
  }

  const foothillRun = makeCreekRibbon(
    [
      new Vector3(26, sampleTerrainHeight(26, 84) + 0.32, 84),
      new Vector3(22, sampleTerrainHeight(22, 96) + 0.3, 96),
      new Vector3(18, sampleTerrainHeight(18, 106) + 0.28, 106),
      new Vector3(8, sampleTerrainHeight(8, 120) + 0.25, 120),
    ],
    0.9,
    "#9ecfda",
    0.68,
  );
  group.add(foothillRun);

  return group;
}

function buildMountainAtmosphere() {
  const group = new Group();

  scenicPockets
    .filter((pocket) => pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine")
    .forEach((pocket, pocketIndex) => {
      const cluster = new Group();
      const baseY = pocket.position.y + (pocket.zone === "peak_shrine" ? 14 : pocket.zone === "ridge" ? 10 : 8);
      for (let i = 0; i < 4; i += 1) {
        const puff = makeMistPuff(
          pocket.zone === "peak_shrine" ? 14 + i * 2 : 10 + i * 1.8,
          pocket.zone === "peak_shrine" ? "#eef6ff" : "#e2eef6",
          pocket.zone === "peak_shrine" ? 0.16 - i * 0.02 : 0.14 - i * 0.02,
        );
        const baseY = i * (pocket.zone === "peak_shrine" ? 3.6 : 2.8);
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

function buildAmbientBlobs() {
  const plainsHomes = scenicPockets.filter((pocket) => pocket.zone === "plains");
  return plainsHomes.flatMap((pocket, pocketIndex): AmbientBlob[] =>
    Array.from({ length: pocketIndex === 0 ? 3 : 2 }, (_, index) => {
      const { x, z } = scatterAroundPocket(pocket, 200 + pocketIndex * 20 + index, 0.46);
      const y = sampleTerrainHeight(x, z);
      const group = makeAmbientBlob(1 + index * 0.08);
      group.position.set(x, y, z);
      const blob: AmbientBlob = {
        group,
        home: new Vector3(x, y, z),
        target: new Vector3(x, y, z),
        velocity: new Vector3(),
        restUntil: 0.8 + index * 0.5,
        mode: "rest",
        bobOffset: pocketIndex * 0.9 + index * 0.7,
      };
      return blob;
    }),
  );
}

function makeGrassBladeGeometry(width: number, height: number) {
  const geometry = new PlaneGeometry(width, height, 4, 6);
  geometry.translate(0, height * 0.5, 0);

  const positions = geometry.attributes.position as BufferAttribute;
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i);
    const x = positions.getX(i);
    const yNorm = MathUtils.clamp(y / height, 0, 1);
    const center = 1 - Math.abs(x / (width * 0.5));
    const tuftWidth = MathUtils.lerp(0.14, 1.08, (1 - yNorm) ** 0.32);
    const topPinch = MathUtils.lerp(1, 0.38, yNorm ** 1.7);
    const shoulderLift = Math.sin(yNorm * Math.PI) * 0.18;

    positions.setX(i, x * tuftWidth * topPinch);
    positions.setZ(i, shoulderLift * center * 0.26);
  }

  return geometry;
}

function makeGrass(count: number, zoneFilter: (zone: ReturnType<typeof sampleBiomeZone>) => boolean, tintBottom: Color, tintTop: Color) {
  const bladeGeometry = makeGrassBladeGeometry(0.98, 2.45);
  const material = new MeshLambertMaterial({
    color: "#9fd97d",
    side: DoubleSide,
    transparent: true,
    alphaTest: 0.12,
  });

  const mesh = new InstancedMesh(bladeGeometry, material, count);
  const dummy = new Object3D();
  const phases = new Float32Array(count);
  const tints = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const widths = new Float32Array(count);
  const roots = new Float32Array(count * 3);
  let placed = 0;

  while (placed < count) {
    const x = (Math.random() - 0.5) * (WORLD_SIZE - 32);
    const z = (Math.random() - 0.5) * (WORLD_SIZE - 32);
    const height = sampleTerrainHeight(x, z);
    const zone = sampleBiomeZone(x, z, height);
    if (!zoneFilter(zone)) {
      continue;
    }

    const density = sampleGrassDensity(x, z);
    if (Math.random() > density) {
      continue;
    }

    const normal = sampleTerrainNormal(x, z);
    if (normal.y < 0.62) {
      continue;
    }

    dummy.position.set(x, height + 0.1, z);
    dummy.rotation.set((Math.random() - 0.5) * 0.18, Math.random() * Math.PI, (Math.random() - 0.5) * 0.14);
    const scale = 0.62 + Math.random() * (zone === "alpine" || zone === "ridge" ? 0.28 : 0.78);
    const width = zone === "alpine" || zone === "ridge"
      ? 0.64 + Math.random() * 0.22
      : 0.86 + Math.random() * 0.38;
    dummy.scale.set(width, scale, width);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    const sunPatch = Math.sin(x * 0.022 + z * 0.017) * 0.5 + 0.5;
    const coolPatch = Math.cos(x * 0.018 - z * 0.013) * 0.5 + 0.5;
    const patchMix = MathUtils.clamp(sunPatch * 0.7 + coolPatch * 0.3, 0, 1);
    const color = tintBottom.clone().lerp(tintTop, MathUtils.clamp(0.08 + patchMix * 0.82 + Math.random() * 0.08, 0, 1));
    tints[placed * 3] = color.r;
    tints[placed * 3 + 1] = color.g;
    tints[placed * 3 + 2] = color.b;
    phases[placed] = Math.random() * Math.PI * 2;
    scales[placed] = scale;
    widths[placed] = width;
    roots[placed * 3] = x;
    roots[placed * 3 + 1] = height;
    roots[placed * 3 + 2] = z;
    placed += 1;
  }

  mesh.geometry.setAttribute("instancePhase", new InstancedBufferAttribute(phases, 1));
  mesh.geometry.setAttribute("instanceTint", new InstancedBufferAttribute(tints, 3));
  mesh.geometry.setAttribute("instanceScale", new InstancedBufferAttribute(scales, 1));
  mesh.geometry.setAttribute("instanceWidth", new InstancedBufferAttribute(widths, 1));
  mesh.geometry.setAttribute("instanceRoot", new InstancedBufferAttribute(roots, 3));

  material.onBeforeCompile = (shader: GrassShader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uPlayerPosition = { value: new Vector3() };
    shader.uniforms.uPlayerVelocity = { value: new Vector3() };
    shader.uniforms.uPlayerPush = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float instancePhase;
        attribute float instanceScale;
        attribute float instanceWidth;
        attribute vec3 instanceTint;
        attribute vec3 instanceRoot;
        varying float vBladeMix;
        varying float vSoftEdge;
        varying float vPlayerFade;
        varying vec3 vTint;
        uniform float uTime;
        uniform vec3 uPlayerPosition;
        uniform vec3 uPlayerVelocity;
        uniform float uPlayerPush;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vBladeMix = uv.y;
        float bladeSide = abs(uv.x - 0.5) * 2.0;
        vSoftEdge = bladeSide;
        vTint = instanceTint;
        vec2 playerOffset = instanceRoot.xz - uPlayerPosition.xz;
        float playerDistance = length(playerOffset);
        vec2 playerAway = playerDistance > 0.001 ? normalize(playerOffset) : vec2(0.0, 0.0);
        float playerMask = (1.0 - smoothstep(5.4, 12.5, playerDistance)) * uPlayerPush;
        float macroWind = sin(instanceRoot.x * 0.016 + uTime * 0.48 + instanceRoot.z * 0.012)
          + cos(instanceRoot.z * 0.015 - uTime * 0.37 + instanceRoot.x * 0.006);
        float microWind = sin(instanceRoot.x * 0.094 + uTime * 1.6 + instancePhase * 1.3) * 0.56
          + cos(instanceRoot.z * 0.072 + uTime * 1.18 + instancePhase * 0.7) * 0.42;
        float patchWind = macroWind * 0.56 + microWind * 0.24;
        float tuftWeight = pow(uv.y, 1.25);
        float bend = (0.12 + patchWind * 0.12) * tuftWeight * instanceScale;
        float playerDisplace = playerMask * (0.2 + tuftWeight * 0.72);
        transformed.x *= mix(0.94, 1.22, instanceWidth - 0.7);
        transformed.x += bend * sin(instancePhase);
        transformed.z += bend * cos(instancePhase);
        transformed.z += (0.18 - bladeSide * 0.08) * sin(instancePhase * 0.8) * tuftWeight * instanceScale;
        transformed.x += playerAway.x * playerDisplace;
        transformed.z += playerAway.y * playerDisplace;
        vPlayerFade = 1.0 - playerMask * 0.28;
      `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vBladeMix;
        varying float vSoftEdge;
        varying float vPlayerFade;
        varying vec3 vTint;
      `,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float sideMask = smoothstep(1.0, 0.32, vSoftEdge);
        float tipMask = 1.0 - smoothstep(0.82, 1.0, vBladeMix + vSoftEdge * 0.14);
        float alphaShape = sideMask * tipMask;
        vec3 meadowColor = mix(vTint * 0.9, vTint * 1.08 + vec3(0.04, 0.055, 0.01), pow(vBladeMix, 0.72));
        vec4 diffuseColor = vec4(meadowColor, opacity * alphaShape * vPlayerFade);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb = floor(diffuseColor.rgb * 7.0) / 7.0;
      `,
      );

    mesh.userData.shader = shader;
  };

  return mesh;
}

function buildOrbMeshes() {
  const material = new MeshBasicMaterial({ color: "#96fff4" });
  const glowMaterial = new MeshBasicMaterial({
    color: "#caffff",
    transparent: true,
    opacity: 0.25,
  });
  const group = new Group();

  collectibleOrbs.forEach((orb) => {
    const orbGroup = new Group();
    const orbMesh = new Mesh(new SphereGeometry(0.7, 14, 12), material);
    const glow = new Mesh(new SphereGeometry(1.3, 12, 10), glowMaterial);
    orbGroup.add(glow, orbMesh);
    orbGroup.position.copy(orb.position);
    orbGroup.userData.orbId = orb.id;
    group.add(orbGroup);
  });

  return group;
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

  const mossBand = new Mesh(new CylinderGeometry(1, 0.96, 10, 40, 1, true), mossMaterial);
  mossBand.scale.set(radiusX * 1.03, 1, radiusZ * 1.05);
  mossBand.position.set(center.x, rimHeight - 8, center.z);

  const lowerSkirt = new Mesh(new CylinderGeometry(0.88, 0.42, 124, 40, 6, true), lowerMaterial);
  lowerSkirt.scale.set(radiusX * 0.96, 1, radiusZ * 0.98);
  lowerSkirt.position.set(center.x, rimHeight - 158, center.z);

  const lowerBelly = new Mesh(new SphereGeometry(1.2, 20, 18), lowerMaterial);
  lowerBelly.scale.set(radiusX * 0.56, 58, radiusZ * 0.5);
  lowerBelly.position.set(center.x, rimHeight - 238, center.z);

  group.add(upperSkirt, mossBand, lowerSkirt, lowerBelly);

  perimeter.forEach((point, index) => {
    const cliffBulge = new Mesh(new SphereGeometry(1.08, 10, 8), index % 3 === 0 ? lowerMaterial : upperMaterial);
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

export class WorldRenderer {
  readonly mossu = new MossuAvatar();
  readonly terrain = makeTerrainMesh();
  readonly clouds = buildClouds();
  readonly orbGroup = buildOrbMeshes();
  readonly windMeshes: Array<InstancedMesh> = [];

  private readonly shrine = buildShrine();
  private readonly river = makeRiverMesh();
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
  private readonly sun = new DirectionalLight("#fff7dc", 2.4);
  private readonly meadowGlow = new PointLight("#ffe6b3", 1.55, 210, 1.4);
  private readonly alpineGlow = new PointLight("#cddcff", 0.74, 260, 1.1);
  private readonly landingSplash = new Group();
  private readonly landingParticles: LandingSplashParticle[] = [];
  private readonly snowTrail = new Group();
  private readonly snowTrailParticles: SnowTrailParticle[] = [];
  private readonly ambientBlobs = buildAmbientBlobs();
  private readonly ambientBlobGroup = new Group();
  private readonly landingUp = new Vector3(0, 1, 0);
  private readonly landingQuat = new Quaternion();
  private readonly landingPosition = new Vector3();
  private readonly landingNormal = new Vector3();
  private readonly trailVelocity = new Vector3();
  private readonly trailDirection = new Vector3();
  private trailEmissionCarry = 0;
  private readonly mapMarkerGroup = new Group();
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

  constructor(private readonly scene: Scene) {
    scene.background = new Color("#dcefff");
    scene.fog = new Fog("#dee7df", 210, 510);

    const ambient = new AmbientLight("#fff4df", 1.34);
    const skyFill = new HemisphereLight("#f2f8ff", "#c7dcb1", 1.28);
    scene.add(ambient, skyFill);

    this.sun.position.set(108, 176, 46);
    this.sun.castShadow = false;
    scene.add(this.sun);
    this.meadowGlow.position.set(-52, 34, -118);
    this.alpineGlow.position.set(24, 112, 164);
    scene.add(this.meadowGlow, this.alpineGlow);

    scene.add(this.terrain);
    scene.add(this.islandShell);
    scene.add(this.river);
    scene.add(this.groundLayer);
    scene.add(this.midLayer);
    scene.add(this.treeClusters);
    scene.add(this.highlandAccents);
    scene.add(this.highlandWaterways);
    scene.add(this.mountainAtmosphere);
    scene.add(this.landmarkTrees);
    scene.add(this.shadowVolumes);
    scene.add(this.shrine);
    scene.add(this.clouds);
    scene.add(this.orbGroup);
    scene.add(this.mossu.group);
    scene.add(this.landingSplash);
    scene.add(this.snowTrail);
    scene.add(this.ambientBlobGroup);
    scene.add(this.mapMarkerGroup);

    const meadowGrass = makeGrass(
      GRASS_COUNT + 1200,
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color("#78ad5e"),
      new Color("#c2e28d"),
    );
    const alpineGrass = makeGrass(
      ALPINE_GRASS_COUNT,
      (zone) => zone === "alpine" || zone === "ridge",
      new Color("#739a67"),
      new Color("#bcd6a2"),
    );
    this.windMeshes.push(meadowGrass, alpineGrass);
    scene.add(meadowGrass, alpineGrass);

    const stoneMaterial = new MeshStandardMaterial({ color: "#d8d1bc", roughness: 1 });
    for (const [x, z, sx, sy, sz] of [
      [-140, 176, 90, 120, 120],
      [110, 188, 110, 145, 120],
      [22, 206, 150, 180, 132],
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

    [
      this.terrain,
      this.islandShell,
      this.river,
      this.groundLayer,
      this.midLayer,
      this.treeClusters,
      this.highlandAccents,
      this.highlandWaterways,
      this.shadowVolumes,
      this.landmarkTrees,
      this.shrine,
      this.mountainSilhouettes,
    ].forEach((object) => freezeStaticHierarchy(object));
  }

  update(frame: FrameState, elapsed: number, dt: number, mapLookdown = false) {
    this.mossu.update(frame.player, dt);
    this.updateWind(frame, elapsed);
    this.updateClouds(elapsed);
    this.updateOrbs(frame, elapsed);
    this.updateAmbientBlobs(frame, elapsed, dt, mapLookdown);
    this.updateLandingSplash(frame, dt);
    this.updateSnowTrail(frame, dt);
    this.updateMapMarkers(frame, elapsed, mapLookdown);
    this.windMeshes.forEach((mesh) => {
      mesh.visible = !mapLookdown;
    });
    this.islandShell.visible = !mapLookdown;
    this.clouds.visible = !mapLookdown;
    this.mountainSilhouettes.visible = !mapLookdown;
    this.mountainAtmosphere.visible = !mapLookdown;
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

  private updateOrbs(frame: FrameState, elapsed: number) {
    this.orbGroup.children.forEach((orbNode: Object3D, index: number) => {
      const id = orbNode.userData.orbId as string;
      orbNode.visible = !frame.save.collectedOrbIds.has(id);
      if (!orbNode.visible) {
        return;
      }
      const base = collectibleOrbs[index];
      orbNode.position.copy(base.position);
      orbNode.position.y += Math.sin(elapsed * 1.9 + index) * 0.45;
      orbNode.rotation.y += 0.025;
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
    this.ambientBlobs.forEach((blob, index) => {
      const groundY = sampleTerrainHeight(blob.group.position.x, blob.group.position.z);
      const toPlayer = new Vector3().subVectors(playerPosition, blob.group.position);
      const planarToPlayer = Math.hypot(toPlayer.x, toPlayer.z);

      if (planarToPlayer < 8.5) {
        blob.mode = "shy";
        const away = planarToPlayer > 0.001 ? toPlayer.multiplyScalar(-1 / planarToPlayer) : new Vector3(1, 0, 0);
        blob.target.set(
          blob.home.x + away.x * 6,
          blob.home.y,
          blob.home.z + away.z * 6,
        );
        blob.restUntil = elapsed + 1.1;
      } else if (planarToPlayer < 16 && blob.mode !== "shy" && blob.restUntil < elapsed) {
        blob.mode = "curious";
        blob.target.set(
          playerPosition.x - toPlayer.x * 0.35,
          playerPosition.y,
          playerPosition.z - toPlayer.z * 0.35,
        );
        blob.restUntil = elapsed + 1.3;
      } else if (blob.restUntil < elapsed) {
        if (blob.mode === "rest") {
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

      const moveStrength = blob.mode === "shy" ? 4.2 : blob.mode === "curious" ? 2.2 : blob.mode === "wander" ? 1.4 : 0;
      if (moveStrength > 0) {
        this.trailDirection
          .subVectors(blob.target, blob.group.position)
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

      blob.group.position.y = groundY + 0.08 + Math.max(0, Math.sin(elapsed * 4.2 + blob.bobOffset)) * blob.velocity.length() * 0.08;
      blob.group.rotation.y = Math.atan2(blob.velocity.x || 0.001, blob.velocity.z || 0.001);
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
      marker.group.scale.setScalar(marker.baseScale * pulse);
    });
  }
}
