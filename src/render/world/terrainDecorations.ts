import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import {
  STARTING_WATER_POOLS,
  isInsideIslandPlayableBounds,
  sampleBiomeZone,
  sampleHabitatLayer,
  sampleRiverChannelAt,
  sampleRiverChannelCenter,
  sampleRiverSurfaceHalfWidth,
  sampleRiverWetness,
  sampleStartingWaterWetness,
  sampleTerrainHeight,
  sampleTerrainNormal,
  sampleWaterBankShape,
  scenicPockets,
  type RiverChannelId,
} from "../../simulation/world";
import { sampleOpeningMeadowMask } from "./grassSystem";
import { markCameraCollider, scatterAroundPocket } from "./sceneHelpers";

type MaterialCompileShader = Parameters<MeshLambertMaterial["onBeforeCompile"]>[0];
type MaterialCompileRenderer = Parameters<MeshLambertMaterial["onBeforeCompile"]>[1];

const TREE_SIZE_MULTIPLIER = 4;
const FOREST_MIN_X = -182;
const FOREST_MAX_X = 174;
const FOREST_MIN_Z = -158;
const FOREST_MAX_Z = 226;

type InstancedForestKind = "round" | "pine";

interface InstancedTreePlacement {
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
}

interface ForestPoint {
  x: number;
  z: number;
}

interface ForestComposition {
  patch: number;
  clearing: number;
  edge: number;
}

function fract(value: number) {
  return value - Math.floor(value);
}

function forestHash(x: number, z: number, salt: number) {
  return fract(Math.sin(x * 47.13 + z * 91.71 + salt * 17.97) * 43758.5453123);
}

function forestValueNoise(x: number, z: number, scale: number, salt: number) {
  const sx = x * scale;
  const sz = z * scale;
  const ix = Math.floor(sx);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fz = sz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = forestHash(ix, iz, salt);
  const b = forestHash(ix + 1, iz, salt);
  const c = forestHash(ix, iz + 1, salt);
  const d = forestHash(ix + 1, iz + 1, salt);
  return MathUtils.lerp(MathUtils.lerp(a, b, ux), MathUtils.lerp(c, d, ux), uz);
}

function sampleForestComposition(x: number, z: number, y: number): ForestComposition {
  const habitat = sampleHabitatLayer(x, z, y);
  const broadPatch = forestValueNoise(x, z, 0.018, 41);
  const localBreakup = forestValueNoise(x, z, 0.052, 91);
  const grovePulse = Math.max(
    Math.exp(-(((x + 120) / 54) ** 2) - (((z + 64) / 60) ** 2)),
    Math.exp(-(((x - 104) / 58) ** 2) - (((z - 54) / 64) ** 2)),
    Math.exp(-(((x + 72) / 62) ** 2) - (((z - 126) / 70) ** 2)),
    Math.exp(-(((x - 76) / 58) ** 2) - (((z - 146) / 72) ** 2)),
  );
  const routeClearing = Math.exp(-((x / 34) ** 2)) * MathUtils.smoothstep(z, -28, 186) * (1 - MathUtils.smoothstep(z, 204, 230));
  const startClearing = Math.exp(-(((x + 44) / 52) ** 2) - (((z + 132) / 44) ** 2));
  const waterClearing = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  const altitudeEdge = MathUtils.smoothstep(y, 44, 132);
  const edge = MathUtils.clamp(
    Math.abs(broadPatch - 0.52) * 2.2 + routeClearing * 0.42 + altitudeEdge * 0.18,
    0,
    1,
  );

  return {
    patch: MathUtils.clamp((broadPatch - 0.34) * 1.75 + localBreakup * 0.38 + grovePulse * 0.62 + habitat.forest * 0.46, 0, 1),
    clearing: MathUtils.clamp(routeClearing * 0.88 + startClearing * 0.95 + waterClearing * 0.74 + habitat.clearing * 0.52, 0, 1),
    edge: MathUtils.clamp(edge + habitat.edge * 0.34, 0, 1),
  };
}

function makeSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function samplePoissonDisk(minX: number, maxX: number, minZ: number, maxZ: number, radius: number, seed: number) {
  const random = makeSeededRandom(seed);
  const cellSize = radius / Math.SQRT2;
  const gridWidth = Math.ceil((maxX - minX) / cellSize);
  const gridHeight = Math.ceil((maxZ - minZ) / cellSize);
  const grid = new Array<number>(gridWidth * gridHeight).fill(-1);
  const points: ForestPoint[] = [];
  const active: ForestPoint[] = [];

  const gridIndex = (x: number, z: number) => {
    const gx = Math.floor((x - minX) / cellSize);
    const gz = Math.floor((z - minZ) / cellSize);
    return { gx, gz, index: gz * gridWidth + gx };
  };

  const canAdd = (point: ForestPoint) => {
    if (point.x < minX || point.x > maxX || point.z < minZ || point.z > maxZ) {
      return false;
    }

    const { gx, gz } = gridIndex(point.x, point.z);
    for (let oz = -2; oz <= 2; oz += 1) {
      for (let ox = -2; ox <= 2; ox += 1) {
        const nx = gx + ox;
        const nz = gz + oz;
        if (nx < 0 || nz < 0 || nx >= gridWidth || nz >= gridHeight) {
          continue;
        }

        const neighborIndex = grid[nz * gridWidth + nx];
        if (neighborIndex < 0) {
          continue;
        }

        const neighbor = points[neighborIndex];
        if (Math.hypot(neighbor.x - point.x, neighbor.z - point.z) < radius) {
          return false;
        }
      }
    }

    return true;
  };

  const addPoint = (point: ForestPoint) => {
    const { index } = gridIndex(point.x, point.z);
    grid[index] = points.length;
    points.push(point);
    active.push(point);
  };

  addPoint({
    x: minX + random() * (maxX - minX),
    z: minZ + random() * (maxZ - minZ),
  });

  while (active.length > 0) {
    const activeIndex = Math.floor(random() * active.length);
    const origin = active[activeIndex];
    let accepted = false;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const distance = radius * (1 + random());
      const candidate = {
        x: origin.x + Math.cos(angle) * distance,
        z: origin.z + Math.sin(angle) * distance,
      };

      if (canAdd(candidate)) {
        addPoint(candidate);
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      active.splice(activeIndex, 1);
    }
  }

  return points;
}

function canPlaceInstancedTree(kind: InstancedForestKind, x: number, z: number) {
  if (!isInsideIslandPlayableBounds(x, z)) {
    return false;
  }

  const y = sampleTerrainHeight(x, z);
  const habitat = sampleHabitatLayer(x, z, y);
  const waterWetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  if (waterWetness > 0.26 || habitat.shore > 0.42 || habitat.meadow > 0.72) {
    return false;
  }

  const zone = sampleBiomeZone(x, z, y);
  if (zone === "peak_shrine") {
    return false;
  }

  const slope = 1 - sampleTerrainNormal(x, z).y;
  if (slope > (kind === "pine" ? 0.42 : 0.32)) {
    return false;
  }

  if (kind === "round") {
    return (zone === "plains" || zone === "hills" || zone === "foothills") && y < 96;
  }

  return (zone === "foothills" || zone === "alpine" || zone === "ridge" || (zone === "hills" && z > 42)) && y < 176;
}

function sampleInstancedTreeDensity(kind: InstancedForestKind, x: number, z: number, y: number) {
  const zone = sampleBiomeZone(x, z, y);
  const habitat = sampleHabitatLayer(x, z, y);
  const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  const waterFade = Math.max(0, 1 - wetness * 0.92);
  const composition = sampleForestComposition(x, z, y);
  const openingMeadow = sampleOpeningMeadowMask(x, z);
  const lowlandEdge = MathUtils.smoothstep(Math.abs(x), 62, 142) * MathUtils.smoothstep(z, -126, 44);
  const firApproach = MathUtils.smoothstep(z, 44, 130);
  const highlandPocket = Math.exp(-(((x - 10) / 86) ** 2) - (((z - 142) / 104) ** 2));
  const burrowClear = Math.exp(-(((x + 46) / 44) ** 2) - (((z + 134) / 34) ** 2));
  const forestEnvelope = MathUtils.clamp(
    Math.max(lowlandEdge * 0.82, firApproach * 0.56, highlandPocket * 0.74, habitat.forest * 0.96) -
      openingMeadow * 0.92 -
      burrowClear * 0.68,
    0,
    1,
  );
  const clumpGate = MathUtils.smoothstep(0.38, 0.72, composition.patch);
  const clearingFade = 1 - composition.clearing * 0.92;
  const edgeBoost = composition.edge * 0.16 + habitat.edge * 0.12;

  if (kind === "round") {
    const biomeDensity =
      zone === "plains" ? 0.16 :
      zone === "hills" ? 0.34 :
      zone === "foothills" ? 0.28 :
      0;
    return (biomeDensity + edgeBoost) * waterFade * forestEnvelope * clumpGate * clearingFade * (1 - habitat.meadow * 0.5);
  }

  const biomeDensity =
    zone === "hills" ? 0.08 :
    zone === "foothills" ? 0.54 :
    zone === "alpine" ? 0.68 :
    zone === "ridge" ? 0.42 :
    0;
  return (biomeDensity + edgeBoost) * waterFade * MathUtils.clamp(forestEnvelope + firApproach * 0.34, 0, 1) * clumpGate * clearingFade * (1 - habitat.meadow * 0.42);
}

function buildInstancedTreePlacements(kind: InstancedForestKind) {
  const placements: InstancedTreePlacement[] = [];
  const candidates = samplePoissonDisk(
    FOREST_MIN_X,
    FOREST_MAX_X,
    FOREST_MIN_Z,
    FOREST_MAX_Z,
    kind === "round" ? 17 : 15.5,
    kind === "round" ? 184031 : 92713,
  );

  candidates.forEach(({ x, z }, index) => {
    if (!canPlaceInstancedTree(kind, x, z)) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const density = sampleInstancedTreeDensity(kind, x, z, y);
    if (forestHash(x, z, kind === "round" ? 83 : 97) > density) {
      return;
    }

    const zone = sampleBiomeZone(x, z, y);
    const scaleBase =
      kind === "round"
        ? 0.88 + forestHash(x, z, 59) * 0.42
        : 0.86 + forestHash(x, z, 61) * 0.48;
    const altitudeScale = zone === "ridge" || zone === "alpine" ? 1.08 : zone === "foothills" ? 1 : 0.92;
    const edgeLift = 1 + sampleForestComposition(x, z, y).edge * 0.1;
    placements.push({
      x,
      z,
      y,
      scale: scaleBase * altitudeScale * edgeLift,
      yaw: forestHash(x, z, 71 + index * 0.01) * Math.PI * 2,
    });
  });

  return placements.slice(0, kind === "round" ? 82 : 112);
}

function mergeTreeGeometry(parts: Array<{ geometry: BufferGeometry; color: string; windWeight: number }>) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const windWeights: number[] = [];
  const tint = new Color();

  parts.forEach((part) => {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geometry.computeVertexNormals();
    const positionAttribute = geometry.getAttribute("position");
    const normalAttribute = geometry.getAttribute("normal");
    tint.set(part.color);

    for (let i = 0; i < positionAttribute.count; i += 1) {
      positions.push(positionAttribute.getX(i), positionAttribute.getY(i), positionAttribute.getZ(i));
      normals.push(normalAttribute.getX(i), normalAttribute.getY(i), normalAttribute.getZ(i));
      colors.push(tint.r, tint.g, tint.b);
      windWeights.push(part.windWeight);
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("windWeight", new Float32BufferAttribute(windWeights, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function makeRoundForestGeometry() {
  const trunk = new CylinderGeometry(0.18, 0.3, 3.8, 7);
  trunk.translate(0, 1.9, 0);
  const canopy = new SphereGeometry(1.58, 9, 8);
  canopy.translate(0, 4.32, 0);
  return mergeTreeGeometry([
    { geometry: trunk, color: "#7b6145", windWeight: 0 },
    { geometry: canopy, color: "#94d36c", windWeight: 1 },
  ]);
}

function makePineForestGeometry() {
  const trunk = new CylinderGeometry(0.15, 0.26, 4.4, 7);
  trunk.translate(0, 2.2, 0);
  const lower = new ConeGeometry(1.22, 2.2, 6);
  lower.translate(0, 2.55, 0);
  const middle = new ConeGeometry(1.02, 2, 6);
  middle.translate(0, 3.65, 0);
  const upper = new ConeGeometry(0.76, 1.68, 6);
  upper.translate(0, 4.76, 0);

  return mergeTreeGeometry([
    { geometry: trunk, color: "#7b6145", windWeight: 0 },
    { geometry: lower, color: "#5d7b4e", windWeight: 0.82 },
    { geometry: middle, color: "#668756", windWeight: 0.94 },
    { geometry: upper, color: "#71925f", windWeight: 1 },
  ]);
}

function makeWindTreeMaterial() {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader: MaterialCompileShader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float windWeight;
uniform float uTime;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 treeRoot = instanceMatrix[3].xyz;
#else
vec3 treeRoot = vec3(0.0);
#endif
float slowSway = sin(uTime * 1.15 + treeRoot.x * 0.041 + treeRoot.z * 0.034);
float quickFlutter = sin(uTime * 3.4 + treeRoot.x * 0.13 - treeRoot.z * 0.09) * 0.34;
transformed.x += (slowSway + quickFlutter) * 0.14 * windWeight;
transformed.z += slowSway * 0.05 * windWeight;`,
      );
    material.userData.windShader = shader;
  };
  material.customProgramCacheKey = () => "mossu-instanced-tree-wind";
  return material;
}

function applyTreeInstances(mesh: InstancedMesh, placements: InstancedTreePlacement[], scaleMultiplier = 1) {
  const dummy = new Object3D();
  placements.forEach((placement, index) => {
    dummy.position.set(placement.x, placement.y, placement.z);
    dummy.rotation.set(0, placement.yaw, 0);
    dummy.scale.setScalar(placement.scale * scaleMultiplier);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function markInstancedTreeWind(mesh: InstancedMesh) {
  mesh.userData.canopyWind = true;
  const material = mesh.material as MeshLambertMaterial;
  const originalCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader: MaterialCompileShader, renderer: MaterialCompileRenderer) => {
    originalCompile.call(material, shader, renderer);
    mesh.userData.windShader = shader;
  };
}

function buildInstancedForest() {
  const group = new Group();
  const roundPlacements = buildInstancedTreePlacements("round");
  const pinePlacements = buildInstancedTreePlacements("pine");

  const roundTrees = new InstancedMesh(makeRoundForestGeometry(), makeWindTreeMaterial(), roundPlacements.length);
  const pineTrees = new InstancedMesh(makePineForestGeometry(), makeWindTreeMaterial(), pinePlacements.length);
  applyTreeInstances(roundTrees, roundPlacements, 2.35);
  applyTreeInstances(pineTrees, pinePlacements, 2.52);
  markInstancedTreeWind(roundTrees);
  markInstancedTreeWind(pineTrees);
  roundTrees.frustumCulled = true;
  pineTrees.frustumCulled = true;
  group.add(roundTrees, pineTrees);

  return group;
}

function makeRoundTree(scale: number, leafColor: string) {
  const scaledSize = scale * TREE_SIZE_MULTIPLIER;
  const group = new Group();
  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.22 * scaledSize, 0.34 * scaledSize, 3.8 * scaledSize, 6),
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
      new SphereGeometry(size * scaledSize, 7, 5),
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
    new CylinderGeometry(0.18 * scaledSize, 0.28 * scaledSize, 4.8 * scaledSize, 6),
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

function makeRoundSapling(scale: number, leafColor: string) {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.08 * scale, 0.13 * scale, 1.45 * scale, 6),
    new MeshLambertMaterial({ color: "#8a6b4b" }),
  );
  trunk.position.y = 0.72 * scale;
  group.add(trunk);

  for (const [x, y, z, size] of [
    [0, 1.52, 0, 0.44],
    [0.28, 1.34, 0.08, 0.28],
    [-0.24, 1.3, -0.04, 0.24],
  ]) {
    const leaf = new Mesh(new SphereGeometry(size * scale, 6, 4), new MeshLambertMaterial({ color: leafColor }));
    leaf.position.set(x * scale, y * scale, z * scale);
    group.add(leaf);
  }

  return group;
}

function makePineSapling(scale: number, tone = "#668a55") {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.07 * scale, 0.12 * scale, 1.72 * scale, 6),
    new MeshLambertMaterial({ color: "#7a6347" }),
  );
  trunk.position.y = 0.86 * scale;
  group.add(trunk);

  for (const [y, radius, height] of [
    [1.18, 0.42, 0.84],
    [1.7, 0.3, 0.66],
  ]) {
    const cone = new Mesh(new ConeGeometry(radius * scale, height * scale, 6), new MeshLambertMaterial({ color: tone }));
    cone.position.y = y * scale;
    group.add(cone);
  }

  return group;
}

type SmallPropGeometryKind =
  | "cone-5"
  | "flower-stem"
  | "mushroom-stem"
  | "sphere-5-4"
  | "sphere-6-5";

interface SmallPropBucket {
  geometry: BufferGeometry;
  material: MeshLambertMaterial;
  matrices: Matrix4[];
  colors: Color[];
}

class SmallPropInstancer {
  private readonly buckets = new Map<string, SmallPropBucket>();
  private readonly dummy = new Object3D();

  constructor(private readonly name: string) {}

  addFlower(x: number, y: number, z: number, yaw: number, color: string, scale: number, stemHeight: number) {
    const height = stemHeight * scale;
    this.addPrimitive("flower-stem", "#699953", x, y + height * 0.5, z, yaw, 0.05 * scale, height, 0.05 * scale);
    this.addPrimitive("sphere-5-4", "#f6d888", x, y + height, z, yaw, 0.12 * scale, 0.12 * scale, 0.12 * scale);

    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      const local = this.transformLocal(Math.cos(angle) * 0.18 * scale, Math.sin(angle) * 0.18 * scale, yaw);
      this.addPrimitive(
        "sphere-5-4",
        color,
        x + local.x,
        y + height,
        z + local.z,
        yaw,
        0.14 * scale * 1.2,
        0.14 * scale * 0.72,
        0.14 * scale * 1.05,
      );
    }
  }

  addCloverPatch(x: number, y: number, z: number, yaw: number, radius: number, color: string) {
    for (const [lx, lz, s] of [
      [0, 0, 1],
      [0.24, 0.08, 0.82],
      [-0.22, -0.1, 0.88],
      [0.04, -0.22, 0.76],
    ] as const) {
      const local = this.transformLocal(lx * radius * 2.4, lz * radius * 2.4, yaw);
      this.addPrimitive(
        "sphere-5-4",
        color,
        x + local.x,
        y + 0.05,
        z + local.z,
        yaw,
        radius * s * 1.2,
        radius * s * 0.18,
        radius * s * 1.2,
      );
    }
  }

  addGrassClump(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, rotZ, h] of [
      [-0.16, -0.28, 0.7],
      [0, 0, 0.84],
      [0.16, 0.26, 0.72],
    ] as const) {
      const local = this.transformLocal(lx * scale, 0, yaw);
      this.addPrimitive(
        "cone-5",
        color,
        x + local.x,
        y + h * scale * 0.5,
        z + local.z,
        yaw,
        0.1 * scale,
        h * scale,
        0.1 * scale,
        0,
        rotZ,
      );
    }
  }

  addReedCluster(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, lz, rotZ, h] of [
      [-0.24, -0.08, -0.18, 1],
      [-0.08, 0.12, 0.06, 1.18],
      [0.12, -0.02, 0.2, 1.08],
      [0.28, 0.14, 0.34, 0.86],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      this.addPrimitive(
        "cone-5",
        color,
        x + local.x,
        y + h * scale * 0.5,
        z + local.z,
        yaw,
        0.055 * scale,
        h * scale,
        0.055 * scale,
        0,
        rotZ,
      );
    }
  }

  addTinyRock(x: number, y: number, z: number, yaw: number, rotZ: number, scale: number, color: string) {
    const radius = 0.28 * scale;
    this.addPrimitive("sphere-6-5", color, x, y, z, yaw, radius * 1.15, radius * 0.72, radius, 0, rotZ);
  }

  addBankPebbleCluster(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, lz, sx, sy, sz] of [
      [0, 0, 1.28, 0.28, 0.86],
      [0.46, -0.16, 0.78, 0.22, 0.56],
      [-0.42, 0.18, 0.92, 0.24, 0.64],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      const radius = 0.34 * scale;
      this.addPrimitive(
        "sphere-5-4",
        color,
        x + local.x,
        y + 0.08 * scale,
        z + local.z,
        yaw,
        radius * sx * scale,
        radius * sy * scale,
        radius * sz * scale,
      );
    }
  }

  addBankLipPebbleTrail(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, lz, width, depth, localYaw] of [
      [-1.16, -0.08, 0.78, 0.36, -0.18],
      [-0.46, 0.12, 0.54, 0.28, 0.28],
      [0.18, -0.02, 0.66, 0.32, -0.08],
      [0.86, 0.1, 0.5, 0.26, 0.2],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      const radius = 0.28 * scale;
      this.addPrimitive(
        "sphere-5-4",
        color,
        x + local.x,
        y + 0.07 * scale,
        z + local.z,
        yaw + localYaw,
        radius * width * scale,
        radius * 0.18 * scale,
        radius * depth * scale,
      );
    }
  }

  addBush(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, ly, lz, s] of [
      [0, 0.5, 0, 1],
      [0.34, 0.42, 0.08, 0.72],
      [-0.32, 0.38, -0.04, 0.68],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      const radius = 0.6 * scale * s;
      this.addPrimitive("sphere-6-5", color, x + local.x, y + ly * scale, z + local.z, yaw, radius, radius, radius);
    }
  }

  addMossPatch(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, lz, radius] of [
      [0, 0, 0.72],
      [0.34, -0.12, 0.46],
      [-0.28, 0.16, 0.42],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      this.addPrimitive(
        "sphere-6-5",
        color,
        x + local.x,
        y + 0.06 * scale,
        z + local.z,
        yaw,
        radius * scale * 1.35,
        radius * scale * 0.24,
        radius * scale * 1.18,
      );
    }
  }

  addMushroom(x: number, y: number, z: number, yaw: number, scale: number, capColor: string) {
    this.addPrimitive("mushroom-stem", "#f3ead5", x, y + 0.28 * scale, z, yaw, 0.08 * scale, 0.55 * scale, 0.08 * scale);
    this.addPrimitive(
      "sphere-6-5",
      capColor,
      x,
      y + 0.56 * scale,
      z,
      yaw,
      0.2 * scale * 1.4,
      0.2 * scale * 0.72,
      0.2 * scale * 1.4,
    );
  }

  buildGroup() {
    const group = new Group();
    group.name = this.name;
    this.buckets.forEach((bucket, key) => {
      const mesh = new InstancedMesh(bucket.geometry, bucket.material, bucket.matrices.length);
      mesh.name = `${this.name}-${key}`;
      mesh.userData.smallPropBatch = true;
      mesh.userData.smallPropInstances = bucket.matrices.length;
      bucket.matrices.forEach((matrix, index) => {
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, bucket.colors[index]);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
      group.add(mesh);
    });
    return group;
  }

  private addPrimitive(
    kind: SmallPropGeometryKind,
    color: string,
    x: number,
    y: number,
    z: number,
    yaw: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    pitch = 0,
    roll = 0,
  ) {
    const key = kind;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        geometry: this.createGeometry(kind),
        material: new MeshLambertMaterial({ color: "#ffffff" }),
        matrices: [],
        colors: [],
      };
      this.buckets.set(key, bucket);
    }

    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(pitch, yaw, roll);
    this.dummy.scale.set(scaleX, scaleY, scaleZ);
    this.dummy.updateMatrix();
    bucket.matrices.push(this.dummy.matrix.clone());
    bucket.colors.push(new Color(color));
  }

  transformLocal(x: number, z: number, yaw: number) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return {
      x: x * cos + z * sin,
      z: -x * sin + z * cos,
    };
  }

  private createGeometry(kind: SmallPropGeometryKind) {
    switch (kind) {
      case "cone-5":
        return new ConeGeometry(1, 1, 5);
      case "flower-stem":
        return new CylinderGeometry(0.6, 1, 1, 5);
      case "mushroom-stem":
        return new CylinderGeometry(0.75, 1, 1, 6);
      case "sphere-6-5":
        return new SphereGeometry(1, 6, 5);
      case "sphere-5-4":
      default:
        return new SphereGeometry(1, 5, 4);
    }
  }
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
    new SphereGeometry(0.12 * scale, 5, 4),
    new MeshLambertMaterial({ color: "#f6d888" }),
  );
  center.position.y = stemHeight * scale;
  group.add(center);

  for (let i = 0; i < 5; i += 1) {
    const petal = new Mesh(
      new SphereGeometry(0.14 * scale, 5, 4),
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
    const leaf = new Mesh(new SphereGeometry(radius * s, 5, 4), material);
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

function makeReedCluster(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, z, rot, h] of [
    [-0.24, -0.08, -0.18, 1],
    [-0.08, 0.12, 0.06, 1.18],
    [0.12, -0.02, 0.2, 1.08],
    [0.28, 0.14, 0.34, 0.86],
  ]) {
    const reed = new Mesh(new ConeGeometry(0.055 * scale, h * scale, 5), material);
    reed.position.set(x * scale, h * scale * 0.5, z * scale);
    reed.rotation.z = rot;
    group.add(reed);
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

function makeBankPebbleCluster(scale: number, tone: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: tone });
  for (const [x, z, sx, sy, sz] of [
    [0, 0, 1.28, 0.28, 0.86],
    [0.46, -0.16, 0.78, 0.22, 0.56],
    [-0.42, 0.18, 0.92, 0.24, 0.64],
  ]) {
    const pebble = new Mesh(new SphereGeometry(0.34 * scale, 5, 4), material);
    pebble.scale.set(sx * scale, sy * scale, sz * scale);
    pebble.position.set(x * scale, 0.08 * scale, z * scale);
    group.add(pebble);
  }
  return group;
}

function makeBankLipPebbleTrail(scale: number, tone: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: tone });
  for (const [x, z, width, depth, yaw] of [
    [-1.16, -0.08, 0.78, 0.36, -0.18],
    [-0.46, 0.12, 0.54, 0.28, 0.28],
    [0.18, -0.02, 0.66, 0.32, -0.08],
    [0.86, 0.1, 0.5, 0.26, 0.2],
  ]) {
    const pebble = new Mesh(new SphereGeometry(0.28 * scale, 5, 4), material);
    pebble.scale.set(width * scale, 0.18 * scale, depth * scale);
    pebble.position.set(x * scale, 0.07 * scale, z * scale);
    pebble.rotation.y = yaw;
    group.add(pebble);
  }
  return group;
}

function makeBankWashPatch(scale: number, tone: string, opacity: number) {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: tone,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });

  for (const [x, z, width, depth, rotation, alpha] of [
    [0, 0, 3.2, 1.28, 0, 1],
    [0.84, -0.28, 1.8, 0.62, 0.42, 0.72],
    [-0.94, 0.22, 1.54, 0.52, -0.36, 0.58],
  ]) {
    const patchMaterial = alpha === 1 ? material : material.clone();
    patchMaterial.opacity *= alpha;
    const patch = new Mesh(new PlaneGeometry(width * scale, depth * scale), patchMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rotation;
    patch.position.set(x * scale, 0.035, z * scale);
    group.add(patch);
  }

  return group;
}

function makeShoreShelfPatch(scale: number, tone: string, opacity: number) {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: tone,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });

  for (const [x, z, width, depth, rotation, alpha] of [
    [0, 0, 4.8, 1.35, 0.02, 1],
    [1.24, -0.18, 2.5, 0.68, 0.28, 0.58],
    [-1.32, 0.22, 2.2, 0.6, -0.32, 0.46],
  ]) {
    const patchMaterial = alpha === 1 ? material : material.clone();
    patchMaterial.opacity *= alpha;
    const patch = new Mesh(new PlaneGeometry(width * scale, depth * scale), patchMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rotation;
    patch.position.set(x * scale, 0.032, z * scale);
    group.add(patch);
  }

  return group;
}

function makeCanopyShadowPatch(scale: number, tone: string, opacity: number) {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: tone,
    transparent: true,
    opacity,
    depthWrite: false,
    side: DoubleSide,
  });

  for (const [x, z, width, depth, rotation, alpha] of [
    [0, 0, 4.6, 2.1, -0.08, 1],
    [1.5, 0.32, 2.4, 1.2, 0.36, 0.46],
    [-1.28, -0.26, 2.1, 1.05, -0.42, 0.38],
  ]) {
    const patchMaterial = alpha === 1 ? material : material.clone();
    patchMaterial.opacity *= alpha;
    const patch = new Mesh(new PlaneGeometry(width * scale, depth * scale), patchMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rotation;
    patch.position.set(x * scale, 0.025, z * scale);
    group.add(patch);
  }

  return group;
}

function makeBankSedgePatch(scale: number, tone: "meadow" | "foothill" | "alpine") {
  const group = new Group();
  const mossColor =
    tone === "meadow" ? "#8fb66b" :
    tone === "foothill" ? "#738f61" :
    "#697d68";
  const grassColor =
    tone === "meadow" ? "#7fa958" :
    tone === "foothill" ? "#6f8b5a" :
    "#667960";
  const pebbleColor = tone === "alpine" ? "#aeb0a2" : "#c5bb9a";

  const moss = makeMossPatch(0.62 * scale, mossColor);
  moss.position.set(-0.34 * scale, 0, -0.1 * scale);
  group.add(moss);

  const grass = makeGrassClump(0.62 * scale, grassColor);
  grass.position.set(0.34 * scale, 0, 0.18 * scale);
  group.add(grass);

  const pebble = makeBankPebbleCluster(0.44 * scale, pebbleColor);
  pebble.position.set(0.05 * scale, 0.02 * scale, -0.42 * scale);
  group.add(pebble);

  return group;
}

function makeBush(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, y, z, s] of [
    [0, 0.5, 0, 1],
    [0.34, 0.42, 0.08, 0.72],
    [-0.32, 0.38, -0.04, 0.68],
  ]) {
    const puff = new Mesh(new SphereGeometry(0.6 * scale * s, 6, 5), material);
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
    const puff = new Mesh(new SphereGeometry(radius * scale, 6, 5), material);
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
    const rock = markCameraCollider(new Mesh(new SphereGeometry(0.72 * scale, 6, 5), material));
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

function makeMushroom(scale: number, capColor: string) {
  const group = new Group();
  const stem = new Mesh(
    new CylinderGeometry(0.06 * scale, 0.08 * scale, 0.55 * scale, 6),
    new MeshLambertMaterial({ color: "#f3ead5" }),
  );
  stem.position.y = 0.28 * scale;
  const cap = new Mesh(
    new SphereGeometry(0.2 * scale, 6, 4),
    new MeshLambertMaterial({ color: capColor }),
  );
  cap.scale.set(1.4, 0.72, 1.4);
  cap.position.y = 0.56 * scale;
  group.add(stem, cap);
  return group;
}

function addForestUnderstoryPatch(group: Group, x: number, z: number, scale: number, seed: number, tone: "lowland" | "foothill", props?: SmallPropInstancer) {
  const y = sampleTerrainHeight(x, z);
  const habitat = sampleHabitatLayer(x, z, y);
  if (habitat.meadow > 0.82 && habitat.forest < 0.28 && habitat.edge < 0.22) {
    return;
  }

  const patch = new Group();
  const mossColor = habitat.shore > 0.36 ? "#76956d" : tone === "lowland" ? "#86a965" : "#748760";
  const bushColor = habitat.edge > 0.28 ? (tone === "lowland" ? "#94c978" : "#789b65") : tone === "lowland" ? "#88bd68" : "#6f8b5d";
  const grassColor = habitat.shore > 0.32 ? "#6f9461" : tone === "lowland" ? "#83aa5c" : "#71865d";
  const yaw = forestHash(x, z, seed) * Math.PI * 2;

  if (props) {
    const moss = props.transformLocal(-0.62 * scale, -0.18 * scale, yaw);
    props.addMossPatch(x + moss.x, y, z + moss.z, yaw, 0.9 * scale, mossColor);
    const bush = props.transformLocal(0.42 * scale, 0.2 * scale, yaw);
    props.addBush(x + bush.x, y, z + bush.z, yaw, 0.74 * scale, bushColor);
    const grass = props.transformLocal(0.02 * scale, -0.76 * scale, yaw);
    props.addGrassClump(x + grass.x, y, z + grass.z, yaw, 0.82 * scale, grassColor);
    if (habitat.forest > 0.34 && habitat.edge > 0.16) {
      const secondBush = props.transformLocal(-0.9 * scale, 0.5 * scale, yaw);
      props.addBush(x + secondBush.x, y, z + secondBush.z, yaw, 0.56 * scale, tone === "lowland" ? "#7fb361" : "#647f55");
    }
    return;
  }

  const moss = makeMossPatch(0.9 * scale, mossColor);
  moss.position.set(-0.62 * scale, 0, -0.18 * scale);
  patch.add(moss);

  const bush = makeBush(0.74 * scale, bushColor);
  bush.position.set(0.42 * scale, 0, 0.2 * scale);
  patch.add(bush);

  const grass = makeGrassClump(0.82 * scale, grassColor);
  grass.position.set(0.02 * scale, 0, -0.76 * scale);
  patch.add(grass);

  if (habitat.forest > 0.34 && habitat.edge > 0.16) {
    const secondBush = makeBush(0.56 * scale, tone === "lowland" ? "#7fb361" : "#647f55");
    secondBush.position.set(-0.9 * scale, 0, 0.5 * scale);
    patch.add(secondBush);
  }

  patch.position.set(x, y, z);
  patch.rotation.y = yaw;
  group.add(patch);
}

export function buildGroundLayer() {
  const group = new Group();
  const props = new SmallPropInstancer("ground-small-props");
  const flowerPalette = ["#fff7f0", "#ffd969", "#f6c6df", "#fdf8b9", "#f7d7ff"];

  scenicPockets.forEach((pocket) => {
    const isStartPocket = pocket.id === "start-meadow";
    const isUpperRoutePocket = pocket.id === "mistfall-basin" || pocket.id === "windstep-shelf" || pocket.id === "ridge-crossing";
    const clusterCount =
      isStartPocket ? 3 :
      pocket.zone === "plains" ? 5 :
      pocket.zone === "hills" ? 4 :
      pocket.zone === "foothills" ? (pocket.id === "fir-gate-entry" ? 3 : 2) :
      pocket.zone === "alpine" ? (pocket.kind === "stream_bend" || isUpperRoutePocket ? 1 : 0) :
      pocket.zone === "ridge" ? (isUpperRoutePocket ? 1 : 0) :
      0;
    const cloverCount =
      isStartPocket ? 2 :
      pocket.zone === "plains" ? 3 :
      pocket.zone === "hills" ? 2 :
      0;

    for (let i = 0; i < clusterCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, i, pocket.kind === "stream_bend" ? 0.72 : 0.9);
      const y = sampleTerrainHeight(x, z);
      const bloomCount =
        pocket.zone === "plains" ? 6 :
        pocket.zone === "hills" ? 5 :
        pocket.zone === "foothills" ? 3 :
        pocket.zone === "alpine" ? 2 :
        2;
      for (let j = 0; j < bloomCount; j += 1) {
        const localAngle = (j / Math.max(1, bloomCount)) * Math.PI * 2;
        const localRadius = 0.35 + (j % 3) * 0.16;
        props.addFlower(
          x + Math.cos(localAngle) * localRadius,
          y,
          z + Math.sin(localAngle) * localRadius,
          forestHash(x, z, i * 17 + j) * Math.PI * 2,
          flowerPalette[(i + j) % flowerPalette.length],
          0.66 + ((i + j) % 3) * 0.08,
          pocket.zone === "foothills" ? 0.9 : 0.72 + (j % 2) * 0.08,
        );
      }
    }

    for (let i = 0; i < cloverCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 30 + i, 0.78);
      const y = sampleTerrainHeight(x, z);
      props.addCloverPatch(x, y, z, forestHash(x, z, 30 + i) * Math.PI * 2, 0.42 + i * 0.05, i % 2 === 0 ? "#7fb765" : "#90c777");
    }

    const grassPatchCount =
      isStartPocket ? 2 :
      pocket.zone === "foothills" ? 3 :
      pocket.zone === "alpine" ? 2 :
      pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 2 :
      3;
    for (let i = 0; i < grassPatchCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 50 + i, 0.82);
      const y = sampleTerrainHeight(x, z);
      props.addGrassClump(
        x,
        y,
        z,
        forestHash(x, z, 50 + i) * Math.PI * 2,
        pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 0.64 + (i % 2) * 0.1 : 0.8 + (i % 2) * 0.18,
        pocket.zone === "plains" ? "#7fb764" : pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? "#6d8a63" : "#739f5f",
      );
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
      props.addTinyRock(
        x,
        y + 0.08,
        z,
        i * 0.8,
        0.22 - i * 0.03,
        pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 0.78 + (i % 3) * 0.2 : 0.6 + (i % 3) * 0.18,
        pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? "#a7a79d" : pocket.zone === "alpine" ? "#b3b0a2" : "#c5b99d",
      );
    }

    if (pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine") {
      for (let i = 0; i < 3; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 90 + i, 0.72);
        const y = sampleTerrainHeight(x, z);
        props.addMossPatch(x, y, z, forestHash(x, z, 90 + i) * Math.PI * 2, 0.9 + i * 0.12, pocket.zone === "peak_shrine" ? "#7b8f76" : "#6e8c67");
      }
    }
  });

  group.add(props.buildGroup());
  return group;
}

export function buildMidLayer() {
  const group = new Group();
  const props = new SmallPropInstancer("mid-small-props");

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
      props.addBush(
        x,
        y,
        z,
        forestHash(x, z, 100 + i) * Math.PI * 2,
        pocket.zone === "foothills" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 1.08 : pocket.zone === "alpine" ? 0.94 : 0.92,
        pocket.zone === "plains"
          ? "#8ec86e"
          : pocket.zone === "foothills"
            ? "#73995e"
            : pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine"
              ? "#667d60"
              : "#6f895e",
      );
    }

    if (pocket.zone === "plains" || pocket.zone === "hills" || pocket.zone === "foothills") {
      const mushroomCount = isStartPocket ? 1 : pocket.zone === "plains" ? 2 : 2;
      for (let i = 0; i < mushroomCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 120 + i, 0.7);
        const y = sampleTerrainHeight(x, z);
        props.addMushroom(x, y, z, forestHash(x, z, 120 + i) * Math.PI * 2, 0.72 + i * 0.08, i % 2 === 0 ? "#d8a476" : "#e4b893");
      }
    }

    if (pocket.zone !== "peak_shrine") {
      const saplingCount =
        isStartPocket ? 0 :
        pocket.id === "fir-gate-entry" ? 2 :
        pocket.zone === "foothills" ? 1 :
        pocket.zone === "alpine" || pocket.zone === "ridge" ? 1 :
        0;
      for (let i = 0; i < saplingCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 140 + i, 0.9);
        const y = sampleTerrainHeight(x, z);
        const sapling = pocket.zone === "plains" || pocket.zone === "hills"
          ? makeRoundSapling(2.3, "#95cb78")
          : makePineSapling(
            pocket.zone === "alpine" || pocket.zone === "ridge" ? 3.1 + i * 0.18 : 2.72,
            pocket.zone === "alpine" || pocket.zone === "ridge" ? "#5f7f55" : "#6b8a55",
          );
        sapling.position.set(x, y, z);
        group.add(sapling);
      }
    }
  });

  group.add(props.buildGroup());
  return group;
}

export function buildTreeClusters() {
  const group = new Group();
  const props = new SmallPropInstancer("forest-understory-small-props");
  group.name = "forest-composition";
  group.add(buildInstancedForest());

  const addTree = (x: number, z: number, scale: number, type: "round" | "pine", tone: string, yawSeed: number) => {
    const y = sampleTerrainHeight(x, z);
    const habitat = sampleHabitatLayer(x, z, y);
    if (habitat.shore > 0.56 || (habitat.meadow > 0.84 && habitat.forest < 0.34)) {
      return;
    }

    const tree = type === "round" ? makeRoundTree(scale, tone) : makePineTree(scale, tone);
    tree.position.set(x, y, z);
    tree.rotation.y = forestHash(x, z, yawSeed) * Math.PI * 2;
    group.add(tree);
  };

  const addGrove = (
    originX: number,
    originZ: number,
    tone: "lowland" | "foothill" | "ridge",
    members: Array<[number, number, number, "round" | "pine"]>,
    seed: number,
  ) => {
    members.forEach(([dx, dz, scale, type], index) => {
      const color =
        type === "round"
          ? tone === "lowland" ? (index % 2 === 0 ? "#9ed875" : "#8ec96c") : "#83bd69"
          : tone === "ridge" ? "#4e6844" : tone === "foothill" ? "#5f804f" : "#668a55";
      addTree(originX + dx, originZ + dz, scale, type, color, seed + index);
    });
  };

  const addScaleRamp = (
    originX: number,
    originZ: number,
    tone: "lowland" | "foothill",
    members: Array<[number, number, number, "round" | "pine" | "round_sapling" | "pine_sapling"]>,
    seed: number,
  ) => {
    members.forEach(([dx, dz, scale, type], index) => {
      const x = originX + dx;
      const z = originZ + dz;
      const y = sampleTerrainHeight(x, z);
      const habitat = sampleHabitatLayer(x, z, y);
      const isSapling = type === "round_sapling" || type === "pine_sapling";
      if (habitat.shore > 0.62 || (habitat.meadow > 0.84 && habitat.edge < 0.22)) {
        return;
      }
      if (isSapling && habitat.edge < 0.12 && habitat.shore < 0.18) {
        return;
      }

      const tree =
        type === "round_sapling"
          ? makeRoundSapling(scale * 2.25, tone === "lowland" ? "#9bd477" : "#86ba69")
          : type === "pine_sapling"
            ? makePineSapling(scale * 2.45, tone === "lowland" ? "#6f9259" : "#5f7e50")
            : type === "round"
              ? makeRoundTree(scale, tone === "lowland" ? "#94d873" : "#85bd68")
              : makePineTree(scale, tone === "lowland" ? "#668a55" : "#557348");
      tree.position.set(x, y, z);
      tree.rotation.y = forestHash(x, z, seed + index) * Math.PI * 2;
      group.add(tree);
    });
  };

  addGrove(-126, -84, "lowland", [
    [-8, -10, 1.42, "round"],
    [6, -2, 1.18, "round"],
    [-2, 12, 1.28, "round"],
  ], 1320);
  addGrove(110, 18, "lowland", [
    [-10, -4, 1.2, "round"],
    [4, 8, 1.38, "round"],
    [14, -10, 1.08, "round"],
  ], 1340);
  addGrove(-88, 88, "foothill", [
    [-8, -8, 1.26, "pine"],
    [7, -2, 1.48, "pine"],
    [-2, 12, 1.16, "round"],
  ], 1360);
  addGrove(82, 132, "foothill", [
    [-10, -6, 1.42, "pine"],
    [6, 6, 1.54, "pine"],
    [16, -8, 1.2, "pine"],
  ], 1380);
  addGrove(-62, 176, "ridge", [
    [-8, -4, 1.48, "pine"],
    [6, 8, 1.64, "pine"],
    [14, -8, 1.28, "pine"],
  ], 1400);

  addScaleRamp(-154, -54, "lowland", [
    [0, -10, 0.54, "round_sapling"],
    [10, -2, 0.72, "round"],
    [-8, 12, 1.18, "round"],
    [18, 16, 1.34, "round"],
  ], 1420);
  addScaleRamp(136, 12, "lowland", [
    [-10, -10, 0.58, "round_sapling"],
    [2, 0, 0.82, "round"],
    [14, 12, 1.24, "round"],
    [-4, 20, 1.06, "pine"],
  ], 1440);
  addScaleRamp(-126, 104, "foothill", [
    [0, -12, 0.56, "pine_sapling"],
    [10, -2, 0.82, "pine"],
    [-8, 12, 1.18, "pine"],
    [16, 18, 1.42, "pine"],
  ], 1460);
  addScaleRamp(116, 126, "foothill", [
    [-8, -14, 0.62, "pine_sapling"],
    [4, -2, 0.92, "pine"],
    [16, 10, 1.28, "pine"],
    [-10, 18, 1.06, "pine"],
  ], 1480);

  const roundClusters = [
    [-108, -146, 1.24, "#9fd571"],
    [-76, -104, 1.08, "#91cf74"],
    [-22, -56, 1.12, "#aedf80"],
    [28, -8, 0.96, "#88c86c"],
    [-60, 22, 0.92, "#8dcc6d"],
  ];
  roundClusters.forEach(([x, z, scale, color], index) => {
    const habitat = sampleHabitatLayer(x as number, z as number);
    if (habitat.meadow > 0.82 && habitat.forest < 0.34) {
      return;
    }
    const tree = makeRoundTree(scale as number, color as string);
    tree.position.set(x as number, sampleTerrainHeight(x as number, z as number), z as number);
    tree.rotation.y = index * 0.8;
    group.add(tree);
  });

  const mixedClusters = [
    [-4, 72, 1.02, "round"],
    [24, 92, 1.18, "pine"],
    [42, 112, 1.28, "pine"],
    [-20, 126, 1.2, "pine"],
    [18, 154, 1.34, "pine"],
    [-30, 174, 1.3, "pine"],
    [20, 190, 1.42, "pine"],
    [48, 214, 1.2, "pine"],
  ];
  mixedClusters.forEach(([x, z, scale, type], index) => {
    const habitat = sampleHabitatLayer(x as number, z as number);
    if (habitat.meadow > 0.84 && habitat.forest < 0.34) {
      return;
    }
    const tree = type === "round"
      ? makeRoundTree(scale as number, index % 2 === 0 ? "#83be68" : "#92c974")
      : makePineTree(scale as number, z as number > 150 ? "#58754b" : "#628552");
    tree.position.set(x as number, sampleTerrainHeight(x as number, z as number), z as number);
    tree.rotation.y = index * 0.55;
    group.add(tree);
  });

  const transitionClusters = [
    [-78, 34, 0.74, "round"],
    [72, 48, 0.82, "round"],
    [-92, 72, 0.9, "pine"],
    [82, 86, 0.96, "pine"],
    [-64, 116, 1.04, "pine"],
    [74, 138, 1.1, "pine"],
  ];
  transitionClusters.forEach(([x, z, scale, type], index) => {
    const habitat = sampleHabitatLayer(x as number, z as number);
    if (habitat.meadow > 0.82 && habitat.edge < 0.2) {
      return;
    }
    const tree = type === "round"
      ? makeRoundTree(scale as number, index % 2 === 0 ? "#8ecf70" : "#98d47a")
      : makePineTree(scale as number, z as number > 100 ? "#58764b" : "#668a55");
    tree.position.set(x as number, sampleTerrainHeight(x as number, z as number), z as number);
    tree.rotation.y = index * 0.72 + 0.3;
    group.add(tree);
  });

  const forestEdgeAnchors = [
    [-136, -106, 1.18, "lowland"],
    [-116, -46, 1.08, "lowland"],
    [102, -18, 1.02, "lowland"],
    [112, 54, 1.14, "foothill"],
    [-112, 76, 1.22, "foothill"],
    [92, 118, 1.26, "foothill"],
    [-82, 142, 1.2, "foothill"],
  ] as const;
  forestEdgeAnchors.forEach(([x, z, scale, tone], index) => {
    addForestUnderstoryPatch(group, x, z, scale, 520 + index, tone, props);
  });

  group.add(props.buildGroup());
  return group;
}

export function buildBiomeTransitionAccents() {
  const group = new Group();
  const props = new SmallPropInstancer("biome-transition-small-props");
  group.name = "biome-transition-accents";

  const anchors = [
    [-104, -74, 1.1, "lowland", "round"],
    [52, -58, 0.92, "lowland", "round"],
    [-82, -26, 1.02, "lowland", "none"],
    [76, -8, 0.96, "lowland", "none"],
    [-78, 58, 1.08, "foothill", "pine"],
    [76, 72, 1.12, "foothill", "pine"],
    [-56, 108, 1.08, "foothill", "pine"],
    [62, 114, 1.18, "foothill", "pine"],
    [-48, 132, 1.08, "foothill", "none"],
    [72, 138, 1.18, "foothill", "pine"],
    [-42, 160, 1.02, "foothill", "pine"],
    [54, 168, 1.08, "foothill", "pine"],
    [-42, 184, 0.92, "foothill", "none"],
    [44, 194, 0.94, "foothill", "none"],
  ] as const;

  anchors.forEach(([x, z, scale, tone, treeKind], index) => {
    const y = sampleTerrainHeight(x, z);
    const habitat = sampleHabitatLayer(x, z, y);
    addForestUnderstoryPatch(group, x, z, scale, 620 + index, tone, props);

    props.addTinyRock(
      x + Math.sin(index * 1.7) * 2.2 * scale,
      y + 0.08,
      z + Math.cos(index * 1.3) * 1.8 * scale,
      index * 0.64,
      0.18,
      0.62 * scale,
      z > 126 ? "#aaa99f" : z > 48 ? "#b9b19e" : "#cabd99",
    );

    props.addGrassClump(
      x - Math.cos(index * 1.1) * 2.4 * scale,
      y,
      z + Math.sin(index * 1.2) * 2 * scale,
      forestHash(x, z, 690 + index) * Math.PI * 2,
      0.78 * scale,
      z > 126 ? "#6c815f" : z > 48 ? "#738f5e" : "#85ad60",
    );

    const shadow = makeCanopyShadowPatch(
      0.82 * scale,
      z > 126 ? "#465142" : z > 48 ? "#4e6046" : "#5a7148",
      z > 126 ? 0.16 : 0.19,
    );
    shadow.position.set(x + Math.cos(index * 0.7) * 1.5 * scale, y + 0.032, z - Math.sin(index * 0.8) * 1.3 * scale);
    shadow.rotation.y = forestHash(x, z, 705 + index) * Math.PI * 2;
    group.add(shadow);

    if (treeKind === "none" || habitat.meadow > 0.78 || habitat.shore > 0.54) {
      return;
    }

    const tree = treeKind === "round"
      ? makeRoundTree(0.56 * scale, index % 2 === 0 ? "#9edb79" : "#90cf72")
      : makePineTree(0.68 * scale, z > 126 ? "#536f49" : "#638754");
    tree.position.set(x + Math.sin(index * 0.9) * 3.4 * scale, y, z - Math.cos(index * 1.1) * 3.2 * scale);
    tree.rotation.y = forestHash(x, z, 710 + index) * Math.PI * 2;
    group.add(tree);
  });

  group.add(props.buildGroup());
  return group;
}

export function buildWaterBankAccents() {
  const group = new Group();
  const props = new SmallPropInstancer("water-bank-small-props");
  group.name = "water-bank-accents";

  const addBankWash = (x: number, z: number, scale: number, yaw: number, seed: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const slope = 1 - sampleTerrainNormal(x, z).y;
    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    if (slope > 0.32 || wetness < 0.16 || wetness > 0.78) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const zone = sampleBiomeZone(x, z, y);
    const bank = makeBankWashPatch(
      scale,
      zone === "alpine" || zone === "ridge" ? "#c7c6b4" : "#d7c88d",
      zone === "plains" || zone === "hills" ? 0.34 : 0.26,
    );
    bank.position.set(x, y + 0.045, z);
    bank.rotation.y = yaw + (forestHash(x, z, seed) - 0.5) * 0.24;
    group.add(bank);
  };

  const addShoreShelf = (x: number, z: number, scale: number, yaw: number, seed: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const bankShape = sampleWaterBankShape(x, z);
    const slope = 1 - sampleTerrainNormal(x, z).y;
    if (slope > 0.34 || Math.max(bankShape.sandbarLift, bankShape.shelfCut, bankShape.dampBand) < 0.16) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const zone = sampleBiomeZone(x, z, y);
    const shelf = makeShoreShelfPatch(
      scale,
      zone === "alpine" || zone === "ridge" || zone === "peak_shrine"
        ? "#b9bbac"
        : bankShape.sandbarLift > 0.24
          ? "#d3c286"
          : "#aeb58a",
      zone === "plains" || zone === "hills" ? 0.24 : 0.18,
    );
    shelf.position.set(x, y + 0.038, z);
    shelf.rotation.y = yaw + (forestHash(x, z, seed) - 0.5) * 0.42;
    group.add(shelf);
  };

  const addAccent = (x: number, z: number, scale: number, kind: "reed" | "pebble", seed: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const slope = 1 - sampleTerrainNormal(x, z).y;
    const bankShape = sampleWaterBankShape(x, z);
    if (slope > 0.38 || Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z)) > 0.72 || Math.max(bankShape.dampBand, bankShape.pebbleBand) < 0.06) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const zone = sampleBiomeZone(x, z, y);
    const habitat = sampleHabitatLayer(x, z, y);
    const yaw = forestHash(x, z, seed) * Math.PI * 2;
    if (kind === "reed") {
      props.addReedCluster(
        x,
        y + 0.04,
        z,
        yaw,
        scale * (1 + habitat.shore * 0.16),
        zone === "plains" || zone === "hills" ? "#759f50" : "#657f53",
      );
    } else {
      props.addBankPebbleCluster(
        x,
        y + 0.04,
        z,
        yaw,
        scale,
        zone === "alpine" || zone === "ridge" ? "#aeb0a2" : "#c5ba96",
      );
    }
  };

  const addSedgePatch = (x: number, z: number, scale: number, seed: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    const bankShape = sampleWaterBankShape(x, z);
    const slope = 1 - sampleTerrainNormal(x, z).y;
    if (wetness < 0.08 || wetness > 0.68 || slope > 0.36 || Math.max(bankShape.dampBand, bankShape.shelfCut) < 0.06) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const zone = sampleBiomeZone(x, z, y);
    const habitat = sampleHabitatLayer(x, z, y);
    const tone =
      zone === "alpine" || zone === "ridge" || zone === "peak_shrine" ? "alpine" :
      zone === "foothills" ? "foothill" :
      "meadow";
    const sedgeScale = scale * (1 + habitat.shore * 0.12);
    const yaw = forestHash(x, z, seed) * Math.PI * 2;
    const mossColor =
      tone === "meadow" ? "#8fb66b" :
      tone === "foothill" ? "#738f61" :
      "#697d68";
    const grassColor =
      tone === "meadow" ? "#7fa958" :
      tone === "foothill" ? "#6f8b5a" :
      "#667960";
    const pebbleColor = tone === "alpine" ? "#aeb0a2" : "#c5bb9a";
    const moss = props.transformLocal(-0.34 * sedgeScale, -0.1 * sedgeScale, yaw);
    props.addMossPatch(x + moss.x, y + 0.052, z + moss.z, yaw, 0.62 * sedgeScale, mossColor);
    const grass = props.transformLocal(0.34 * sedgeScale, 0.18 * sedgeScale, yaw);
    props.addGrassClump(x + grass.x, y + 0.052, z + grass.z, yaw, 0.62 * sedgeScale, grassColor);
    const pebble = props.transformLocal(0.05 * sedgeScale, -0.42 * sedgeScale, yaw);
    props.addBankPebbleCluster(x + pebble.x, y + 0.052 + 0.02 * sedgeScale, z + pebble.z, yaw, 0.44 * sedgeScale, pebbleColor);
  };

  const addLipPebbles = (x: number, z: number, scale: number, yaw: number, seed: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    const bankShape = sampleWaterBankShape(x, z);
    const slope = 1 - sampleTerrainNormal(x, z).y;
    if (wetness < 0.1 || wetness > 0.72 || slope > 0.34 || bankShape.pebbleBand < 0.08) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const zone = sampleBiomeZone(x, z, y);
    props.addBankLipPebbleTrail(
      x,
      y + 0.062,
      z,
      yaw + (forestHash(x, z, seed) - 0.5) * 0.32,
      scale,
      zone === "alpine" || zone === "ridge" || zone === "peak_shrine" ? "#b7b7aa" : "#d1c08f",
    );
  };

  const addRiparianPocket = (
    x: number,
    z: number,
    scale: number,
    tone: "lowland" | "foothill",
    treeKind: "round_sapling" | "pine_sapling" | "none",
    seed: number,
  ) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    const slope = 1 - sampleTerrainNormal(x, z).y;
    if (wetness < 0.04 || wetness > 0.56 || slope > 0.36) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const zone = sampleBiomeZone(x, z, y);
    const habitat = sampleHabitatLayer(x, z, y);
    const highland = zone === "foothills" || zone === "alpine" || zone === "ridge" || zone === "peak_shrine";
    const pocketYaw = forestHash(x, z, seed + 23) * Math.PI * 2;
    const pocket = new Group();

    const shadow = makeCanopyShadowPatch(
      scale,
      highland ? "#465243" : "#557044",
      highland ? 0.15 : 0.18,
    );
    shadow.position.y = 0.028;
    shadow.rotation.y = forestHash(x, z, seed) * Math.PI * 2;
    pocket.add(shadow);

    const moss = props.transformLocal(-0.7 * scale, -0.16 * scale, pocketYaw);
    props.addMossPatch(x + moss.x, y + 0.036 + 0.02, z + moss.z, pocketYaw, 0.72 * scale, highland ? "#71845f" : "#86a865");

    const grass = props.transformLocal(0.5 * scale, 0.24 * scale, pocketYaw);
    props.addGrassClump(
      x + grass.x,
      y + 0.036,
      z + grass.z,
      pocketYaw + forestHash(x, z, seed + 7) * Math.PI * 2,
      0.72 * scale,
      highland ? "#6e805d" : "#82a95f",
    );

    const pebbles = props.transformLocal(0.12 * scale, -0.7 * scale, pocketYaw);
    props.addBankLipPebbleTrail(
      x + pebbles.x,
      y + 0.036 + 0.044,
      z + pebbles.z,
      pocketYaw + forestHash(x, z, seed + 11) * Math.PI * 2,
      0.48 * scale,
      highland ? "#b3b3a6" : "#cdbc93",
    );

    if (treeKind !== "none" && habitat.edge > 0.08 && habitat.meadow < 0.78) {
      const sapling = treeKind === "round_sapling"
        ? makeRoundSapling(1.62 * scale, tone === "lowland" ? "#91ce70" : "#81b968")
        : makePineSapling(1.72 * scale, highland ? "#5f7d50" : "#6b8f58");
      sapling.position.set(-1.32 * scale, 0, 0.78 * scale);
      sapling.rotation.y = forestHash(x, z, seed + 17) * Math.PI * 2;
      pocket.add(sapling);
    }

    pocket.position.set(x, y + 0.036, z);
    pocket.rotation.y = pocketYaw;
    group.add(pocket);
  };

  [-206, -182, -154, -70, -38, -6, 26, 58, 90, 122, 154, 188, 218].forEach((z, stationIndex) => {
    const channel = sampleRiverChannelAt("main", z);
    const halfWidth = sampleRiverSurfaceHalfWidth(channel);
    [-1, 1].forEach((side, sideIndex) => {
      const noise = forestHash(channel.centerX, z, 210 + stationIndex * 5 + sideIndex);
      const centerX = sampleRiverChannelCenter("main", z);
      const x = centerX + side * (halfWidth + 3.2 + noise * 3.8);
      const scale = z > 126 ? 1.28 : 0.92 + noise * 0.32;
      addAccent(x, z + (noise - 0.5) * 4.6, scale, z > 118 || stationIndex % 3 === 0 ? "pebble" : "reed", 230 + stationIndex);
      addBankWash(
        centerX + side * (halfWidth + 1.35 + noise * 1.35),
        z + (noise - 0.5) * 5.2,
        z > 126 ? 1.18 : 0.9 + noise * 0.22,
        side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        250 + stationIndex * 2 + sideIndex,
      );
      addShoreShelf(
        centerX + side * (halfWidth + 0.55 + noise * 1.1),
        z + (noise - 0.5) * 5.6,
        z > 126 ? 1.08 : 0.86 + noise * 0.18,
        side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        263 + stationIndex * 2 + sideIndex,
      );
      if (stationIndex % 2 === 0) {
        addSedgePatch(
          centerX + side * (halfWidth + 5.8 + noise * 2.4),
          z + (noise - 0.5) * 5.8,
          z > 126 ? 0.92 : 0.72 + noise * 0.16,
          275 + stationIndex * 2 + sideIndex,
        );
        addLipPebbles(
          centerX + side * (halfWidth + 4.6 + noise * 1.4),
          z + (noise - 0.5) * 6.2,
          z > 126 ? 0.84 : 0.62 + noise * 0.14,
          side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
          298 + stationIndex * 2 + sideIndex,
        );
      }
    });
  });

  const branchStations: Array<{ id: RiverChannelId; stations: number[]; scale: number }> = [
    { id: "meadow-braid", stations: [-58, -34, -10, 12], scale: 0.66 },
    { id: "fir-gate-braid", stations: [66, 90, 116], scale: 0.78 },
    { id: "alpine-braid", stations: [148, 172, 198], scale: 0.84 },
  ];
  branchStations.forEach(({ id, stations, scale }, branchIndex) => {
    stations.forEach((z, stationIndex) => {
      const channel = sampleRiverChannelAt(id, z);
      if (channel.envelope <= 0.12) {
        return;
      }

      const halfWidth = sampleRiverSurfaceHalfWidth(channel);
      [-1, 1].forEach((side, sideIndex) => {
        const noise = forestHash(channel.centerX, z, 430 + branchIndex * 31 + stationIndex * 3 + sideIndex);
        const x = channel.centerX + side * (halfWidth + 2.8 + noise * 2.4);
        const bankZ = z + (noise - 0.5) * 4.2;
        const highland = z > 126;
        addBankWash(
          channel.centerX + side * (halfWidth + 1.1 + noise * 0.8),
          bankZ,
          scale * (highland ? 0.94 : 0.78),
          side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
          455 + branchIndex * 41 + stationIndex * 4 + sideIndex,
        );
        addShoreShelf(
          channel.centerX + side * (halfWidth + 0.42 + noise * 0.72),
          bankZ + (noise - 0.5) * 1.4,
          scale * (highland ? 0.84 : 0.68),
          side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
          466 + branchIndex * 41 + stationIndex * 4 + sideIndex,
        );
        addSedgePatch(
          x,
          bankZ,
          scale * (highland ? 0.88 : 0.76),
          480 + branchIndex * 43 + stationIndex * 4 + sideIndex,
        );
        if ((stationIndex + sideIndex) % 2 === 1) {
          addLipPebbles(
            channel.centerX + side * (halfWidth + 3.5 + noise * 1.4),
            bankZ + (noise - 0.5) * 1.8,
            scale * (highland ? 0.76 : 0.58),
            side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
            492 + branchIndex * 43 + stationIndex * 4 + sideIndex,
          );
        }
        if ((stationIndex + sideIndex) % 2 === 0) {
          addAccent(
            channel.centerX + side * (halfWidth + 4.2 + noise * 2.2),
            bankZ + (noise - 0.5) * 2.2,
            scale * (highland ? 0.9 : 0.78),
            highland ? "pebble" : "reed",
            505 + branchIndex * 47 + stationIndex * 5 + sideIndex,
          );
        }
      });
    });
  });

  STARTING_WATER_POOLS.forEach((pool, poolIndex) => {
    const accentCount = pool.id === "opening-lake" ? 8 : 4;
    for (let i = 0; i < accentCount; i += 1) {
      const angle = (i / accentCount) * Math.PI * 2 + poolIndex * 0.47;
      const rimJitter = forestHash(pool.x + i, pool.z - i, 330 + poolIndex) * 0.1 + 0.98;
      const x = pool.x + Math.cos(angle) * pool.renderRadiusX * rimJitter;
      const z = pool.z + Math.sin(angle) * pool.renderRadiusZ * rimJitter;
      addAccent(x, z, pool.id === "opening-lake" ? 0.9 : 0.72, i % 3 === 0 ? "pebble" : "reed", 340 + i);
      if (i % 2 === 0 || pool.id === "opening-lake") {
        const washAngle = angle + Math.PI * 0.5;
        const washX = pool.x + Math.cos(angle) * pool.renderRadiusX * (0.9 + rimJitter * 0.08);
        const washZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * (0.9 + rimJitter * 0.08);
        addBankWash(washX, washZ, pool.id === "opening-lake" ? 0.88 : 0.62, washAngle, 360 + poolIndex * 20 + i);
        addShoreShelf(
          pool.x + Math.cos(angle) * pool.renderRadiusX * (0.96 + rimJitter * 0.05),
          pool.z + Math.sin(angle) * pool.renderRadiusZ * (0.96 + rimJitter * 0.05),
          pool.id === "opening-lake" ? 0.86 : 0.58,
          washAngle,
          374 + poolIndex * 20 + i,
        );
        addSedgePatch(
          pool.x + Math.cos(angle) * pool.renderRadiusX * (1.04 + rimJitter * 0.04),
          pool.z + Math.sin(angle) * pool.renderRadiusZ * (1.04 + rimJitter * 0.04),
          pool.id === "opening-lake" ? 0.72 : 0.54,
          390 + poolIndex * 20 + i,
        );
        addLipPebbles(
          pool.x + Math.cos(angle) * pool.renderRadiusX * (1.1 + rimJitter * 0.04),
          pool.z + Math.sin(angle) * pool.renderRadiusZ * (1.1 + rimJitter * 0.04),
          pool.id === "opening-lake" ? 0.62 : 0.46,
          washAngle,
          410 + poolIndex * 20 + i,
        );
      }
    }
  });

  const riparianAnchors = [
    [-72, -122, 1.06, "lowland", "round_sapling"],
    [-8, -112, 0.94, "lowland", "round_sapling"],
    [-90, -94, 0.86, "lowland", "round_sapling"],
    [18, -26, 0.88, "lowland", "round_sapling"],
    [-54, 18, 0.92, "lowland", "none"],
    [38, 54, 0.96, "foothill", "pine_sapling"],
    [-64, 86, 0.98, "foothill", "pine_sapling"],
    [68, 112, 1.04, "foothill", "pine_sapling"],
    [-34, 146, 0.92, "foothill", "pine_sapling"],
    [48, 174, 0.88, "foothill", "none"],
  ] as const;
  riparianAnchors.forEach(([x, z, scale, tone, treeKind], index) => {
    addRiparianPocket(x, z, scale, tone, treeKind, 540 + index * 13);
  });

  group.add(props.buildGroup());
  return group;
}

export function buildHighlandAccents() {
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

export function buildLandmarkTrees() {
  const group = new Group();
  const trunkMaterial = new MeshStandardMaterial({ color: "#f5f5f1", roughness: 1 });
  const blackStripe = new MeshStandardMaterial({ color: "#464846", roughness: 1 });
  const orangeLeaves = new MeshStandardMaterial({ color: "#ea8845", roughness: 1 });
  const greenLeaves = new MeshStandardMaterial({ color: "#7ac35f", roughness: 1 });

  const makeTree = (x: number, z: number, color: MeshStandardMaterial) => {
    const tree = new Group();
    const trunk = markCameraCollider(new Mesh(new CylinderGeometry(0.33, 0.44, 7.2, 6), trunkMaterial));
    trunk.position.y = 3.6;
    tree.add(trunk);

    for (const [y, size, ox, oz] of [
      [7.1, 2.8, 0, 0],
      [8.2, 2.2, 1.1, 0.2],
      [8.1, 2, -1, 0.1],
      [6.8, 1.9, 0.5, 1],
    ]) {
      const leaf = new Mesh(new SphereGeometry(size, 8, 6), color);
      leaf.position.set(ox as number, y as number, oz as number);
      tree.add(leaf);
    }

    for (const y of [2.8, 4.4, 5.9]) {
      const stripe = new Mesh(new SphereGeometry(0.12, 6, 4), blackStripe);
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
