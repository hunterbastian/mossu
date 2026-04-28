import {
  BufferGeometry,
  CircleGeometry,
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
  sampleRouteReadabilityClearing,
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
  const routeReadability = sampleRouteReadabilityClearing(x, z);
  // Tight band on the main approach so ridge / shrine silhouettes stay visible from the path (not a wide deforest).
  const alpineRouteVista =
    Math.exp(-((x / 26) ** 2)) * MathUtils.smoothstep(z, 96, 188) * (1 - MathUtils.smoothstep(z, 198, 218));
  const startClearing = Math.exp(-(((x + 44) / 52) ** 2) - (((z + 132) / 44) ** 2));
  const waterClearing = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  const altitudeEdge = MathUtils.smoothstep(y, 44, 132);
  const edge = MathUtils.clamp(
    Math.abs(broadPatch - 0.52) * 2.2 + routeClearing * 0.42 + altitudeEdge * 0.18,
    0,
    1,
  );

  return {
    patch: MathUtils.clamp((broadPatch - 0.34) * 1.75 + localBreakup * 0.38 + grovePulse * 0.62 + habitat.forest * 0.46 - routeReadability * 0.46, 0, 1),
    clearing: MathUtils.clamp(
      routeClearing * 0.88 + routeReadability * 0.78 + startClearing * 0.95 + waterClearing * 0.74 + habitat.clearing * 0.52 + alpineRouteVista * 0.62,
      0,
      1,
    ),
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
  const routeReadability = sampleRouteReadabilityClearing(x, z);
  const waterWetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  if (waterWetness > 0.26 || habitat.shore > 0.42 || habitat.meadow > 0.72 || routeReadability > 0.76) {
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
    // Allow sparse spill into lower alpine for crossfade band (density will taper via sampleInstancedTreeDensity)
    return (zone === "plains" || zone === "hills" || zone === "foothills" || zone === "alpine") && y < 112;
  }

  // Allow occasional pines in plains/hills fringe so the lowland edge isn't a hard line
  return (zone === "plains" || zone === "hills" || zone === "foothills" || zone === "alpine" || zone === "ridge" || (zone === "hills" && z > 42)) && y < 176;
}

function sampleInstancedTreeDensity(kind: InstancedForestKind, x: number, z: number, y: number) {
  const zone = sampleBiomeZone(x, z, y);
  const habitat = sampleHabitatLayer(x, z, y);
  const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  const waterFade = Math.max(0, 1 - wetness * 0.92);
  const composition = sampleForestComposition(x, z, y);
  const routeReadability = sampleRouteReadabilityClearing(x, z);
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
    // alpine gets a low crossfade density that tapers with altitude so round trees thin out gracefully
    const alpineFade = zone === "alpine" ? MathUtils.clamp(1 - MathUtils.smoothstep(y, 82, 112), 0, 1) * 0.1 : 0;
    const biomeDensity =
      zone === "plains" ? 0.13 :
      zone === "hills" ? 0.34 :
      zone === "foothills" ? 0.32 :
      alpineFade;
    return (biomeDensity + edgeBoost) * waterFade * forestEnvelope * clumpGate * clearingFade * (1 - habitat.meadow * 0.5) * (1 - routeReadability * 0.72);
  }

  // pines get a sparse plains/hills fringe density so the lowland edge crossfades rather than hard-cuts
  const lowlandPineFade = (zone === "plains" || zone === "hills") ? MathUtils.clamp(firApproach * 0.12, 0, 0.08) : 0;
  const biomeDensity =
    zone === "hills" ? 0.1 :
    zone === "foothills" ? 0.56 :
    zone === "alpine" ? 0.72 :
    zone === "ridge" ? 0.5 :
    lowlandPineFade;
  return (biomeDensity + edgeBoost) * waterFade * MathUtils.clamp(forestEnvelope + firApproach * 0.34, 0, 1) * clumpGate * clearingFade * (1 - habitat.meadow * 0.42) * (1 - routeReadability * 0.68);
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

function makeTint(base: string, target: string, amount: number) {
  return `#${new Color(base).lerp(new Color(target), amount).getHexString()}`;
}

function transformGeometry(
  geometry: BufferGeometry,
  options: {
    scale?: [number, number, number];
    rotation?: [number, number, number];
    position?: [number, number, number];
  },
) {
  const clone = geometry.clone();
  if (options.scale) {
    clone.scale(options.scale[0], options.scale[1], options.scale[2]);
  }
  if (options.rotation) {
    clone.rotateX(options.rotation[0]);
    clone.rotateY(options.rotation[1]);
    clone.rotateZ(options.rotation[2]);
  }
  if (options.position) {
    clone.translate(options.position[0], options.position[1], options.position[2]);
  }
  return clone;
}

function makeRoundForestGeometry() {
  // Storybook broadleaf: warm bark, 3-lobe crown, fewer noisy micro-puffs
  const bark = "#7a5a3a";
  const softBark = "#b8956a";
  const rootBark = "#5c4228";
  const leafBase = "#6ba848";
  const leafLight = "#cde87a";
  const leafMist = "#9dcc88";
  const leafShade = "#2f5530";
  const leafDeep = "#1e3a24";

  const trunk = new CylinderGeometry(0.3, 0.58, 3.5, 14);
  trunk.translate(0, 1.75, 0);
  const trunkHighlight = transformGeometry(new SphereGeometry(0.22, 9, 7), {
    scale: [0.72, 4.8, 0.3],
    rotation: [0, 0.15, -0.12],
    position: [0.18, 1.9, 0.32],
  });
  const trunkMossNub = transformGeometry(new SphereGeometry(0.1, 6, 5), {
    position: [-0.2, 1.1, 0.28],
  });

  const rootParts = Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2 + 0.08;
    const s = 0.34 + (index % 3) * 0.05;
    return transformGeometry(new SphereGeometry(1, 7, 5), {
      scale: [s, 0.16 + (index % 2) * 0.03, 0.8 + (index % 2) * 0.08],
      rotation: [0.1, angle, (index % 2) * 0.1],
      position: [Math.cos(angle) * 0.45, 0.16, Math.sin(angle) * 0.45],
    });
  });

  const branchParts = [
    [-0.26, 2.7, 0.1, 0.1, 0.2, 0.88],
    [0.28, 2.85, -0.06, -0.08, -0.24, 0.82],
    [0.1, 3.2, 0.24, 0.1, 0.16, 0.6],
  ].map(([x, y, z, pitch, roll, len]) =>
    transformGeometry(new CylinderGeometry(0.04, 0.1, len as number, 7), {
      rotation: [pitch as number, 0, roll as number],
      position: [x as number, y as number, z as number],
    }),
  );

  const sphereSeg = 12;
  const sphereRow = 9;

  // Three dominant ellipsoids + back/side fill (readable silhouette)
  const canopyParts = [
    [0, 4.1, 0, 1.75, 1.02, 1.38, leafBase],
    [-0.95, 3.9, 0.12, 1.1, 0.7, 0.98, leafShade],
    [0.95, 3.95, 0, 1.12, 0.7, 0.96, leafMist],
    [-0.4, 4.7, -0.2, 0.9, 0.55, 0.9, leafLight],
    [0.5, 4.6, 0.2, 0.88, 0.58, 0.88, leafLight],
    [-0.15, 3.5, 0.55, 0.82, 0.48, 0.7, leafDeep],
    [0.15, 3.5, -0.58, 0.82, 0.5, 0.72, leafShade],
  ] as const;

  const puffParts = [
    [0, 2.9, 0, 0.36, makeTint(leafBase, leafDeep, 0.2)],
    [0.4, 4.85, 0.1, 0.26, leafLight],
  ] as const;

  const blossomParts = [
    [0.65, 4.0, 0.7, "#fff2c8", 0.14],
    [-0.55, 3.6, 0.65, "#f0c878", 0.12],
  ] as const;

  return mergeTreeGeometry([
    { geometry: trunk, color: bark, windWeight: 0 },
    { geometry: trunkHighlight, color: softBark, windWeight: 0 },
    { geometry: trunkMossNub, color: makeTint(softBark, "#4a6a3a", 0.4), windWeight: 0 },
    ...rootParts.map((geometry) => ({ geometry, color: rootBark, windWeight: 0 })),
    ...branchParts.map((geometry) => ({ geometry, color: rootBark, windWeight: 0.2 })),
    ...canopyParts.map(([x, y, z, sx, sy, sz, color]) => ({
      geometry: transformGeometry(new SphereGeometry(1, sphereSeg, sphereRow), {
        scale: [sx, sy, sz],
        position: [x, y, z],
      }),
      color,
      windWeight: 1,
    })),
    ...puffParts.map(([x, y, z, size, color]) => ({
      geometry: transformGeometry(new SphereGeometry(1, 8, 6), {
        scale: [size, size * 0.88, size],
        position: [x, y, z],
      }),
      color,
      windWeight: 0.95,
    })),
    ...blossomParts.map(([x, y, z, color, size]) => ({
      geometry: transformGeometry(new SphereGeometry(1, 7, 5), {
        scale: [size, size * 0.78, size],
        position: [x, y, z],
      }),
      color,
      windWeight: 0.88,
    })),
  ]);
}

function makePineForestGeometry() {
  const segs = 12;
  const trunk = new CylinderGeometry(0.16, 0.3, 4.6, 12);
  trunk.translate(0, 2.3, 0);
  const wood = "#5c4736";
  const t1 = "#2a4030";
  const t2 = "#3a5038";
  const t3 = "#4a6242";
  const t4 = "#5a7852";
  const t5 = "#729466";
  const tTop = "#8fb078";

  const lower = new ConeGeometry(1.32, 2.1, segs);
  lower.rotateY(0.5);
  lower.translate(0, 2.4, 0);
  const lowMid = new ConeGeometry(1.1, 1.85, segs);
  lowMid.rotateY(1.25);
  lowMid.scale(1.04, 1, 0.96);
  lowMid.translate(0, 3.2, 0);
  const middle = new ConeGeometry(0.95, 1.75, segs);
  middle.rotateY(0.15);
  middle.translate(0, 3.95, 0);
  const upper = new ConeGeometry(0.76, 1.5, segs);
  upper.rotateY(0.95);
  upper.translate(0, 4.7, 0);
  const tip = new ConeGeometry(0.48, 0.9, segs);
  tip.translate(0, 5.38, 0);
  const hip = transformGeometry(new SphereGeometry(0.34, 8, 7), {
    scale: [0.52, 0.4, 0.5],
    position: [0, 5.8, 0],
  });
  // Dead stub for silhouette break (tucked under mid tier)
  const stub = transformGeometry(new CylinderGeometry(0.04, 0.08, 0.5, 6), {
    rotation: [0, 0, 0.5],
    position: [0.42, 3.5, 0.2],
  });

  return mergeTreeGeometry([
    { geometry: trunk, color: wood, windWeight: 0 },
    { geometry: stub, color: makeTint(wood, "#1a1a1a", 0.25), windWeight: 0 },
    { geometry: lower, color: t1, windWeight: 0.78 },
    { geometry: lowMid, color: t2, windWeight: 0.86 },
    { geometry: middle, color: t3, windWeight: 0.92 },
    { geometry: upper, color: t4, windWeight: 0.98 },
    { geometry: tip, color: t5, windWeight: 1 },
    { geometry: hip, color: tTop, windWeight: 0.85 },
  ]);
}

function makeWindTreeMaterial(kind: "round" | "pine" = "round") {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader: MaterialCompileShader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float windWeight;
uniform float uTime;
varying float vFoliage;`,
      )
      .replace(
        "#include <begin_vertex>",
        kind === "round"
          ? `#include <begin_vertex>
vFoliage = windWeight;
#ifdef USE_INSTANCING
vec3 treeRoot = instanceMatrix[3].xyz;
#else
vec3 treeRoot = vec3(0.0);
#endif
float treeDistance = length(cameraPosition.xz - treeRoot.xz);
float treeDetailLod = 1.0 - smoothstep(88.0, 210.0, treeDistance);
float highlandDamp = mix(1.0, 0.46, smoothstep(48.0, 136.0, treeRoot.y));
// Round trees: broad canopy sway — wider lateral arc, strong gust response
float slowSway = sin(uTime * 1.05 + treeRoot.x * 0.038 + treeRoot.z * 0.031);
float quickFlutter = sin(uTime * 3.1 + treeRoot.x * 0.12 - treeRoot.z * 0.08) * 0.38;
slowSway *= mix(1.0, 1.18, 1.0 - treeDetailLod);
quickFlutter *= treeDetailLod * highlandDamp;
float gust = sin(uTime * 1.9 + treeRoot.x * 0.07 + treeRoot.z * 0.055) * 0.12;
transformed.x += (slowSway + quickFlutter + gust) * 0.19 * windWeight;
transformed.z += (slowSway * 0.07 + quickFlutter * 0.14) * windWeight;
transformed.y += quickFlutter * 0.035 * windWeight;`
          : `#include <begin_vertex>
vFoliage = windWeight;
#ifdef USE_INSTANCING
vec3 treeRoot = instanceMatrix[3].xyz;
#else
vec3 treeRoot = vec3(0.0);
#endif
float treeDistance = length(cameraPosition.xz - treeRoot.xz);
float treeDetailLod = 1.0 - smoothstep(88.0, 210.0, treeDistance);
float highlandDamp = mix(1.0, 0.46, smoothstep(48.0, 136.0, treeRoot.y));
// Pine trees: tight columnar form — less lateral sway, vertical needle shimmer
float slowSway = sin(uTime * 1.28 + treeRoot.x * 0.045 + treeRoot.z * 0.038) * 0.62;
float quickFlutter = sin(uTime * 4.2 + treeRoot.x * 0.16 - treeRoot.z * 0.11) * 0.22;
slowSway *= mix(1.0, 1.06, 1.0 - treeDetailLod);
quickFlutter *= treeDetailLod * highlandDamp;
float gust = sin(uTime * 2.4 + treeRoot.x * 0.09 + treeRoot.z * 0.07) * 0.06;
// Vertical shimmer: tips bounce subtly up/down as needles catch wind
float needleShimmer = sin(uTime * 5.8 + treeRoot.x * 0.21 + treeRoot.z * 0.17) * 0.18 * treeDetailLod;
transformed.x += (slowSway + quickFlutter + gust) * 0.09 * windWeight;
transformed.z += (slowSway * 0.04 + quickFlutter * 0.07) * windWeight;
transformed.y += (quickFlutter * 0.06 + needleShimmer * 0.05) * windWeight;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying float vFoliage;
uniform vec3 uSceneSunColor;
uniform vec3 uSceneAmbient;
uniform vec3 uSceneHorizon;
uniform float uSceneElevationMood;`,
      )
      .replace(
        "vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",
        `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
float ff = clamp( vFoliage, 0.0, 1.0 );
float lowWarm = 1.0 - uSceneElevationMood;
vec3 sunTint = mix( vec3(1.0), uSceneSunColor, (0.32 + 0.08 * lowWarm) * ff );
vec3 hemiHaze = mix( vec3(1.0), uSceneHorizon, (0.12 + 0.14 * lowWarm) * ff );
outgoingLight = outgoingLight * sunTint * hemiHaze;
outgoingLight = mix( outgoingLight, outgoingLight * uSceneAmbient, 0.04 * ff );
outgoingLight += vec3(0.04,0.05,0.02) * ff;
outgoingLight = mix( outgoingLight, ( outgoingLight * 0.88 + uSceneHorizon * 0.22 * length(outgoingLight) ) * 1.12, 0.1 * ff );`,
      );
    shader.uniforms.uSceneSunColor = { value: new Color("#fff8e8") };
    shader.uniforms.uSceneAmbient = { value: new Color("#b8c8e0") };
    shader.uniforms.uSceneHorizon = { value: new Color("#f3e3d4") };
    shader.uniforms.uSceneElevationMood = { value: 0 };
    material.userData.windShader = shader;
  };
  material.customProgramCacheKey = () => "mossu-instanced-tree-wind-ghibli";
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

  const roundTrees = new InstancedMesh(makeRoundForestGeometry(), makeWindTreeMaterial("round"), roundPlacements.length);
  const pineTrees = new InstancedMesh(makePineForestGeometry(), makeWindTreeMaterial("pine"), pinePlacements.length);
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
  const barkMaterial = new MeshLambertMaterial({ color: "#7a5a3a" });
  const barkShadowMaterial = new MeshLambertMaterial({ color: "#5c4228" });
  const barkLightMaterial = new MeshLambertMaterial({ color: "#b8956a" });
  const leafMaterial = new MeshLambertMaterial({ color: leafColor });
  const leafShadowMaterial = new MeshLambertMaterial({ color: makeTint(leafColor, "#1f4a2a", 0.5) });
  const leafMist = new MeshLambertMaterial({ color: makeTint(leafColor, "#9dcc88", 0.32) });
  const leafLightMaterial = new MeshLambertMaterial({ color: makeTint(leafColor, "#cde87a", 0.45) });
  const flowerMaterial = new MeshLambertMaterial({ color: "#fff2c8" });
  const fruitMaterial = new MeshLambertMaterial({ color: "#f0c878" });
  const sphereSeg = 12;
  const sphereRow = 9;

  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.3 * scaledSize, 0.58 * scaledSize, 3.5 * scaledSize, 14),
    barkMaterial,
  ));
  trunk.position.y = 1.75 * scaledSize;
  group.add(trunk);

  const trunkHighlight = new Mesh(new SphereGeometry(0.11 * scaledSize, 9, 7), barkLightMaterial);
  trunkHighlight.scale.set(0.72, 4.6, 0.3);
  trunkHighlight.rotation.set(0, 0.15, -0.12);
  trunkHighlight.position.set(0.18 * scaledSize, 1.9 * scaledSize, 0.32 * scaledSize);
  group.add(trunkHighlight);

  const nub = new Mesh(
    new SphereGeometry(0.05 * scaledSize, 6, 5),
    new MeshLambertMaterial({ color: makeTint("#7a5a3a", "#4a6a3a", 0.4) }),
  );
  nub.position.set(-0.2 * scaledSize, 1.1 * scaledSize, 0.28 * scaledSize);
  group.add(nub);

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.08;
    const s = 0.34 + (i % 3) * 0.05;
    const root = markCameraCollider(new Mesh(
      new SphereGeometry(0.5 * s * scaledSize, 7, 5),
      barkShadowMaterial,
    ));
    root.position.set(Math.cos(angle) * 0.45 * scaledSize, 0.16 * scaledSize, Math.sin(angle) * 0.45 * scaledSize);
    root.rotation.set(0.1, angle, (i % 2) * 0.1);
    root.scale.set(1, 0.38 + (i % 2) * 0.03, 1.7);
    group.add(root);
  }

  for (const [x, y, z, pitch, roll, length] of [
    [-0.26, 2.7, 0.1, 0.1, 0.2, 0.88],
    [0.28, 2.85, -0.06, -0.08, -0.24, 0.82],
    [0.1, 3.2, 0.24, 0.1, 0.16, 0.6],
  ]) {
    const branch = new Mesh(
      new CylinderGeometry(0.04 * scaledSize, 0.1 * scaledSize, (length as number) * scaledSize, 7),
      barkShadowMaterial,
    );
    branch.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    branch.rotation.set(pitch as number, 0, roll as number);
    group.add(branch);
  }

  for (const [x, y, z, sx, sy, sz, material] of [
    [0, 4.1, 0, 1.75, 1.02, 1.38, leafMaterial],
    [-0.95, 3.9, 0.12, 1.1, 0.7, 0.98, leafShadowMaterial],
    [0.95, 3.95, 0, 1.12, 0.7, 0.96, leafMist],
    [-0.4, 4.7, -0.2, 0.9, 0.55, 0.9, leafLightMaterial],
    [0.5, 4.6, 0.2, 0.88, 0.58, 0.88, leafLightMaterial],
    [-0.15, 3.5, 0.55, 0.82, 0.48, 0.7, leafShadowMaterial],
    [0.15, 3.5, -0.58, 0.82, 0.5, 0.72, leafShadowMaterial],
  ]) {
    const canopy = new Mesh(
      new SphereGeometry(scaledSize, sphereSeg, sphereRow),
      material as MeshLambertMaterial,
    );
    canopy.scale.set(sx as number, sy as number, sz as number);
    canopy.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(canopy);
  }

  for (const [x, y, z, s] of [
    [0, 2.9, 0, 0.36],
  ]) {
    const puff = new Mesh(
      new SphereGeometry((s as number) * scaledSize, 8, 6),
      new MeshLambertMaterial({ color: makeTint(leafColor, "#1e3a24", 0.2) }),
    );
    puff.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(puff);
  }

  for (const [x, y, z, s] of [
    [0.4, 4.85, 0.1, 0.26],
  ]) {
    const puff = new Mesh(new SphereGeometry((s as number) * scaledSize, 8, 6), leafLightMaterial);
    puff.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(puff);
  }

  for (const [x, y, z, size, material] of [
    [0.65, 4.0, 0.7, 0.14, flowerMaterial],
    [-0.55, 3.6, 0.65, 0.12, fruitMaterial],
  ]) {
    const ornament = new Mesh(new SphereGeometry((size as number) * scaledSize, 7, 5), material as MeshLambertMaterial);
    ornament.scale.set(1, 0.78, 1);
    ornament.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(ornament);
  }

  return group;
}

function makePineTree(scale: number, tone = "#5b7d4d") {
  const scaledSize = scale * TREE_SIZE_MULTIPLIER;
  const group = new Group();
  const segs = 12;
  const wood = new MeshLambertMaterial({ color: "#5c4736" });
  const stubMat = new MeshLambertMaterial({ color: makeTint("#5c4736", "#1a1a1a", 0.25) });
  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.16 * scaledSize, 0.3 * scaledSize, 4.6 * scaledSize, 12),
    wood,
  ));
  trunk.position.y = 2.3 * scaledSize;
  group.add(trunk);

  const stub = new Mesh(
    new CylinderGeometry(0.04 * scaledSize, 0.08 * scaledSize, 0.5 * scaledSize, 6),
    stubMat,
  );
  stub.position.set(0.42 * scaledSize, 3.5 * scaledSize, 0.2 * scaledSize);
  stub.rotation.z = 0.5;
  group.add(stub);

  const t1 = makeTint(tone, "#1a2818", 0.62);
  const t2 = makeTint(tone, "#1e3020", 0.5);
  const t3 = makeTint(tone, "#2a4028", 0.35);
  const t4 = makeTint(tone, "#4a6a40", 0.18);
  const t5 = makeTint(tone, "#6a9058", 0.15);
  const tTop = makeTint(tone, "#8fb078", 0.28);
  const layers: Array<{ y: number; r: number; h: number; color: string; rot: number; sx?: number; sz?: number }> = [
    { y: 2.4, r: 1.32, h: 2.1, color: t1, rot: 0.5 },
    { y: 3.2, r: 1.1, h: 1.85, color: t2, rot: 1.25, sx: 1.04, sz: 0.96 },
    { y: 3.95, r: 0.95, h: 1.75, color: t3, rot: 0.15 },
    { y: 4.7, r: 0.76, h: 1.5, color: t4, rot: 0.95 },
    { y: 5.38, r: 0.48, h: 0.9, color: t5, rot: 0 },
  ];
  for (const layer of layers) {
    const geom = new ConeGeometry(layer.r * scaledSize, layer.h * scaledSize, segs);
    geom.rotateY(layer.rot);
    if (layer.sx) {
      geom.scale(layer.sx, 1, layer.sz ?? 1);
    }
    const mesh = new Mesh(geom, new MeshLambertMaterial({ color: layer.color }));
    mesh.position.y = layer.y * scaledSize;
    group.add(mesh);
  }

  const hip = new Mesh(new SphereGeometry(0.17 * scaledSize, 8, 7), new MeshLambertMaterial({ color: tTop }));
  hip.scale.set(0.52, 0.4, 0.5);
  hip.position.set(0, 5.8 * scaledSize, 0);
  group.add(hip);

  return group;
}

function makeRoundSapling(scale: number, leafColor: string) {
  const group = new Group();
  const leafMaterial = new MeshLambertMaterial({ color: leafColor });
  const leafMist = new MeshLambertMaterial({ color: makeTint(leafColor, "#b0e8a0", 0.28) });
  const leafLightMaterial = new MeshLambertMaterial({ color: makeTint(leafColor, "#e8f0a0", 0.38) });
  const trunk = new Mesh(
    new CylinderGeometry(0.11 * scale, 0.2 * scale, 1.32 * scale, 8),
    new MeshLambertMaterial({ color: "#7d5a38" }),
  );
  trunk.position.y = 0.66 * scale;
  group.add(trunk);

  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 + 0.2;
    const root = new Mesh(
      new CylinderGeometry(0.03 * scale, 0.08 * scale, 0.48 * scale, 5),
      new MeshLambertMaterial({ color: "#5c4228" }),
    );
    root.position.set(Math.cos(angle) * 0.16 * scale, 0.1 * scale, Math.sin(angle) * 0.16 * scale);
    root.rotation.set(Math.PI * 0.5, 0, angle);
    group.add(root);
  }

  for (const [x, y, z, size, mat] of [
    [0, 1.45, 0, 0.5, leafMaterial],
    [0.3, 1.3, 0.08, 0.3, leafMist],
    [-0.28, 1.28, -0.04, 0.3, leafMaterial],
    [0.04, 1.76, -0.06, 0.26, leafLightMaterial],
    [0.2, 1.15, 0.15, 0.22, leafMist],
    [-0.16, 1.5, 0.12, 0.2, leafLightMaterial],
  ] as const) {
    const leaf = new Mesh(
      new SphereGeometry((size as number) * scale, 8, 6),
      mat as MeshLambertMaterial,
    );
    leaf.scale.set(1.16, 0.78, 1.04);
    leaf.position.set((x as number) * scale, (y as number) * scale, (z as number) * scale);
    group.add(leaf);
  }

  return group;
}

function makePineSapling(scale: number, tone = "#668a55") {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.07 * scale, 0.12 * scale, 1.72 * scale, 8),
    new MeshLambertMaterial({ color: "#6a5240" }),
  );
  trunk.position.y = 0.86 * scale;
  group.add(trunk);
  const c1 = makeTint(tone, "#1a2418", 0.4);
  const c2 = makeTint(tone, "#5a7a4a", 0.1);

  for (const [y, radius, height, rot] of [
    [1.1, 0.4, 0.8, 0.25],
    [1.58, 0.32, 0.7, 0.9],
    [2.02, 0.2, 0.52, 0.5],
  ] as const) {
    const g = new ConeGeometry((radius as number) * scale, (height as number) * scale, 8);
    g.rotateY(rot as number);
    const cone = new Mesh(
      g,
      new MeshLambertMaterial({ color: y > 1.4 ? c2 : c1 }),
    );
    cone.position.y = (y as number) * scale;
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
    const darkLeaf = makeTint(color, "#315b39", 0.34);
    const lightLeaf = makeTint(color, "#e6df6a", 0.34);
    const branchColor = "#725238";
    const blossomColor = "#fff6de";
    const berryColor = forestHash(x, z, 431) > 0.5 ? "#ef9a38" : "#d95636";

    for (const [lx, lz, height, roll] of [
      [-0.34, 0.12, 0.72, -0.34],
      [-0.12, -0.12, 0.82, -0.12],
      [0.18, 0.04, 0.78, 0.2],
      [0.38, -0.08, 0.62, 0.36],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      this.addPrimitive(
        "mushroom-stem",
        branchColor,
        x + local.x,
        y + height * scale * 0.34,
        z + local.z,
        yaw,
        0.05 * scale,
        height * scale,
        0.05 * scale,
        0,
        roll,
      );
    }

    for (const [lx, ly, lz, sx, sy, sz, tint] of [
      [0, 0.58, 0, 0.92, 0.56, 0.82, color],
      [-0.5, 0.48, 0.02, 0.62, 0.42, 0.58, darkLeaf],
      [0.5, 0.5, -0.02, 0.62, 0.42, 0.58, color],
      [-0.2, 0.88, -0.08, 0.54, 0.34, 0.5, lightLeaf],
      [0.26, 0.82, 0.1, 0.5, 0.32, 0.46, lightLeaf],
      [0.02, 0.32, 0.46, 0.62, 0.24, 0.42, darkLeaf],
      [-0.08, 0.34, -0.44, 0.58, 0.24, 0.42, darkLeaf],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      this.addPrimitive(
        "sphere-6-5",
        tint,
        x + local.x,
        y + ly * scale,
        z + local.z,
        yaw,
        sx * scale,
        sy * scale,
        sz * scale,
      );
    }

    for (const [lx, ly, lz, size] of [
      [-0.42, 0.72, 0.42, 0.09],
      [0.42, 0.68, 0.34, 0.08],
      [0.1, 0.96, -0.34, 0.075],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      const isBerry = forestHash(x + lx, z + lz, 439) > 0.58;
      this.addPrimitive(
        "sphere-5-4",
        isBerry ? berryColor : blossomColor,
        x + local.x,
        y + ly * scale,
        z + local.z,
        yaw,
        size * scale,
        size * scale * 0.82,
        size * scale,
      );
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
  const leafMaterial = new MeshLambertMaterial({ color });
  const darkLeafMaterial = new MeshLambertMaterial({ color: makeTint(color, "#315b39", 0.34) });
  const lightLeafMaterial = new MeshLambertMaterial({ color: makeTint(color, "#e6df6a", 0.34) });
  const branchMaterial = new MeshLambertMaterial({ color: "#725238" });
  const blossomMaterial = new MeshLambertMaterial({ color: "#fff6de" });

  for (const [x, z, height, roll] of [
    [-0.34, 0.12, 0.72, -0.34],
    [-0.12, -0.12, 0.82, -0.12],
    [0.18, 0.04, 0.78, 0.2],
    [0.38, -0.08, 0.62, 0.36],
  ]) {
    const branch = new Mesh(new CylinderGeometry(0.035 * scale, 0.055 * scale, height * scale, 6), branchMaterial);
    branch.position.set((x as number) * scale, (height as number) * scale * 0.34, (z as number) * scale);
    branch.rotation.z = roll as number;
    group.add(branch);
  }

  for (const [x, y, z, sx, sy, sz, material] of [
    [0, 0.58, 0, 0.92, 0.56, 0.82, leafMaterial],
    [-0.5, 0.48, 0.02, 0.62, 0.42, 0.58, darkLeafMaterial],
    [0.5, 0.5, -0.02, 0.62, 0.42, 0.58, leafMaterial],
    [-0.2, 0.88, -0.08, 0.54, 0.34, 0.5, lightLeafMaterial],
    [0.26, 0.82, 0.1, 0.5, 0.32, 0.46, lightLeafMaterial],
    [0.02, 0.32, 0.46, 0.62, 0.24, 0.42, darkLeafMaterial],
    [-0.08, 0.34, -0.44, 0.58, 0.24, 0.42, darkLeafMaterial],
  ]) {
    const puff = new Mesh(new SphereGeometry(scale, 6, 5), material as MeshLambertMaterial);
    puff.scale.set(sx as number, sy as number, sz as number);
    puff.position.set((x as number) * scale, (y as number) * scale, (z as number) * scale);
    group.add(puff);
  }

  for (const [x, y, z, size] of [
    [-0.42, 0.72, 0.42, 0.09],
    [0.42, 0.68, 0.34, 0.08],
    [0.1, 0.96, -0.34, 0.075],
  ]) {
    const blossom = new Mesh(new SphereGeometry((size as number) * scale, 6, 4), blossomMaterial);
    blossom.scale.set(1, 0.82, 1);
    blossom.position.set((x as number) * scale, (y as number) * scale, (z as number) * scale);
    group.add(blossom);
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

  const makeRibbon = (ribbonWidth: number, ribbonHeight: number, color: string, opacity: number, x: number, z: number) => {
    const ribbon = new Mesh(
      new PlaneGeometry(ribbonWidth, ribbonHeight, 1, 8),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    ribbon.position.set(x, ribbonHeight * 0.5, z);
    return ribbon;
  };

  const veil = makeRibbon(width * 1.14, height, "#bfefff", 0.34, 0, -0.04);
  const blueFall = makeRibbon(width * 0.72, height * 0.96, "#8bd7eb", 0.4, -width * 0.08, 0.03);
  const brightFall = makeRibbon(width * 0.44, height * 0.94, "#fbfffb", 0.54, width * 0.08, 0.09);
  const leftThread = makeRibbon(width * 0.12, height * 0.54, "#ffffff", 0.5, -width * 0.34, 0.14);
  const rightThread = makeRibbon(width * 0.1, height * 0.46, "#e8fbff", 0.42, width * 0.36, 0.16);
  leftThread.position.y = height * 0.66;
  rightThread.position.y = height * 0.42;

  const makeFoam = (radius: number, x: number, z: number, color: string, opacity: number) => {
    const foam = new Mesh(
      new CircleGeometry(radius, 18),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.scale.z = 0.4;
    foam.position.set(x, 0.06, z);
    return foam;
  };

  const foamA = makeFoam(width * 0.58, -width * 0.12, 0.42, "#f8fff7", 0.44);
  const foamB = makeFoam(width * 0.42, width * 0.24, 0.58, "#def6ff", 0.34);
  const warmSpray = makeFoam(width * 0.26, width * 0.02, 0.74, "#fff2cb", 0.18);

  for (let i = 0; i < 6; i += 1) {
    const spray = new Mesh(
      new CircleGeometry(width * (0.045 + i * 0.006), 10),
      new MeshBasicMaterial({
        color: i % 2 === 0 ? "#f3fdff" : "#fff4d5",
        transparent: true,
        opacity: 0.14 + (i % 3) * 0.04,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    spray.position.set(
      Math.sin(i * 1.4) * width * 0.5,
      height * (0.08 + (i % 4) * 0.08),
      0.2 + i * 0.035,
    );
    group.add(spray);
  }

  group.add(veil, blueFall, brightFall, leftThread, rightThread, foamA, foamB, warmSpray);
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
      isStartPocket ? 10 :
      pocket.zone === "plains" ? 5 :
      pocket.zone === "hills" ? 4 :
      pocket.zone === "foothills" ? (pocket.id === "fir-gate-entry" ? 3 : 2) :
      pocket.zone === "alpine" ? (pocket.kind === "stream_bend" || isUpperRoutePocket ? 1 : 0) :
      pocket.zone === "ridge" ? (isUpperRoutePocket ? 1 : 0) :
      0;
    const cloverCount =
      isStartPocket ? 7 :
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
        const flowerJitter = forestHash(x, z, i * 17 + j * 23);
        props.addFlower(
          x + Math.cos(localAngle) * localRadius,
          y,
          z + Math.sin(localAngle) * localRadius,
          forestHash(x, z, i * 17 + j) * Math.PI * 2,
          flowerPalette[(i + j) % flowerPalette.length],
          0.58 + ((i + j) % 3) * 0.1 + flowerJitter * 0.14,
          pocket.zone === "foothills" ? 0.9 : 0.7 + (j % 2) * 0.1 + flowerJitter * 0.06,
        );
      }
    }

    for (let i = 0; i < cloverCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 30 + i, 0.78);
      const y = sampleTerrainHeight(x, z);
      props.addCloverPatch(x, y, z, forestHash(x, z, 30 + i) * Math.PI * 2, 0.42 + i * 0.05, i % 2 === 0 ? "#7fb765" : "#90c777");
    }

    const grassPatchCount =
      isStartPocket ? 6 :
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

  const addTreeBushes = (treeX: number, treeZ: number, treeScale: number, type: "round" | "pine", seed: number) => {
    const count = type === "round" ? 2 : 1;
    const baseDistance = type === "round" ? 5.6 : 4.4;
    const baseColor =
      type === "round" ? "#8fc86a" :
      treeZ > 146 ? "#667d60" :
      treeZ > 72 ? "#73995e" :
      "#7fae63";

    for (let i = 0; i < count; i += 1) {
      const angle = forestHash(treeX, treeZ, seed + 230 + i * 13) * Math.PI * 2;
      const distance = baseDistance * (0.76 + forestHash(treeX, treeZ, seed + 270 + i) * 0.34) * MathUtils.clamp(treeScale, 0.8, 1.35);
      const x = treeX + Math.cos(angle) * distance;
      const z = treeZ + Math.sin(angle) * distance;
      if (!isInsideIslandPlayableBounds(x, z)) {
        continue;
      }

      const y = sampleTerrainHeight(x, z);
      const habitat = sampleHabitatLayer(x, z, y);
      const slope = 1 - sampleTerrainNormal(x, z).y;
      if (habitat.shore > 0.5 || slope > 0.36) {
        continue;
      }

      props.addBush(
        x,
        y,
        z,
        forestHash(x, z, seed + 310 + i) * Math.PI * 2,
        MathUtils.clamp(0.72 + treeScale * 0.28 + i * 0.08, 0.82, 1.18),
        baseColor,
      );
    }
  };

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
    addTreeBushes(x, z, scale, type, yawSeed);
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
      if (!isSapling) {
        addTreeBushes(x, z, scale, type === "round" ? "round" : "pine", seed + index);
      }
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
    addTreeBushes(x as number, z as number, scale as number, "round", 1510 + index);
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
    addTreeBushes(x as number, z as number, scale as number, type === "round" ? "round" : "pine", 1540 + index);
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
    addTreeBushes(x as number, z as number, scale as number, type === "round" ? "round" : "pine", 1570 + index);
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

export function buildAnchorSceneAccents() {
  const group = new Group();
  const props = new SmallPropInstancer("anchor-scene-small-props");
  group.name = "anchor-scene-accents";

  const addTerrainObject = (object: Object3D, x: number, z: number, yOffset: number, yaw: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    object.position.set(x, sampleTerrainHeight(x, z) + yOffset, z);
    object.rotation.y = yaw;
    group.add(object);
  };

  const addShadow = (x: number, z: number, scale: number, tone: string, opacity: number, yaw: number) => {
    const shadow = makeCanopyShadowPatch(scale, tone, opacity);
    addTerrainObject(shadow, x, z, 0.036, yaw);
  };

  const addBankRead = (x: number, z: number, scale: number, yaw: number, tone: "warm" | "cool" | "alpine") => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    const slope = 1 - sampleTerrainNormal(x, z).y;
    if (wetness < 0.04 || wetness > 0.86 || slope > 0.38) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const shelfTone = tone === "alpine" ? "#babbae" : tone === "cool" ? "#aab58a" : "#d0bf8a";
    const washTone = tone === "alpine" ? "#c6c7b9" : tone === "cool" ? "#b9c098" : "#d9ca91";
    const shelf = makeShoreShelfPatch(scale, shelfTone, tone === "warm" ? 0.2 : 0.16);
    shelf.position.set(x, y + 0.05, z);
    shelf.rotation.y = yaw;
    group.add(shelf);

    const wash = makeBankWashPatch(scale * 0.86, washTone, tone === "warm" ? 0.26 : 0.2);
    wash.position.set(x + Math.cos(yaw) * 0.6 * scale, y + 0.06, z + Math.sin(yaw) * 0.6 * scale);
    wash.rotation.y = yaw + 0.16;
    group.add(wash);

    const pebble = props.transformLocal(0.24 * scale, -0.86 * scale, yaw);
    props.addBankLipPebbleTrail(
      x + pebble.x,
      y + 0.09,
      z + pebble.z,
      yaw + 0.28,
      tone === "alpine" ? 0.58 * scale : 0.52 * scale,
      tone === "alpine" ? "#b8b8aa" : "#cfbf91",
    );
  };

  const addFramingTree = (
    x: number,
    z: number,
    scale: number,
    kind: "round" | "pine",
    color: string,
    yawSeed: number,
  ) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const habitat = sampleHabitatLayer(x, z, y);
    const slope = 1 - sampleTerrainNormal(x, z).y;
    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    if (wetness > 0.4 || slope > (kind === "pine" ? 0.42 : 0.34) || habitat.meadow > 0.88) {
      return;
    }

    const tree = kind === "round" ? makeRoundTree(scale, color) : makePineTree(scale, color);
    tree.position.set(x, y, z);
    tree.rotation.y = forestHash(x, z, yawSeed) * Math.PI * 2;
    group.add(tree);
  };

  const addUnderstory = (
    x: number,
    z: number,
    scale: number,
    yaw: number,
    tone: "meadow" | "shore" | "forest" | "highland" | "shrine",
  ) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const mossColor =
      tone === "meadow" ? "#90bf72" :
      tone === "shore" ? "#7fa268" :
      tone === "forest" ? "#6f8c5d" :
      tone === "shrine" ? "#7e8c77" :
      "#6f8365";
    const grassColor =
      tone === "meadow" ? "#82b761" :
      tone === "shore" ? "#759b5d" :
      tone === "forest" ? "#6d8759" :
      tone === "shrine" ? "#77856d" :
      "#657b5f";
    const bushColor =
      tone === "meadow" ? "#8fcf70" :
      tone === "shore" ? "#7faa68" :
      tone === "forest" ? "#6f965c" :
      tone === "shrine" ? "#74836d" :
      "#617b5b";

    const moss = props.transformLocal(-0.52 * scale, -0.18 * scale, yaw);
    props.addMossPatch(x + moss.x, y + 0.04, z + moss.z, yaw, 0.7 * scale, mossColor);
    const grass = props.transformLocal(0.36 * scale, 0.18 * scale, yaw);
    props.addGrassClump(x + grass.x, y + 0.04, z + grass.z, yaw + 0.18, 0.78 * scale, grassColor);

    if (tone === "forest" || tone === "shore") {
      const bush = props.transformLocal(0.84 * scale, -0.2 * scale, yaw);
      props.addBush(x + bush.x, y, z + bush.z, yaw, 0.62 * scale, bushColor);
    }

    if (tone === "meadow") {
      const clover = props.transformLocal(-0.08 * scale, 0.8 * scale, yaw);
      props.addCloverPatch(x + clover.x, y + 0.02, z + clover.z, yaw, 0.34 * scale, "#87c76b");
      props.addFlower(
        x + Math.cos(yaw + 0.8) * 0.9 * scale,
        y,
        z + Math.sin(yaw + 0.8) * 0.9 * scale,
        yaw,
        "#f7d5e8",
        0.54 * scale,
        0.68,
      );
    }

    if (tone === "shore" || tone === "highland") {
      const reed = props.transformLocal(0.08 * scale, -0.92 * scale, yaw);
      props.addReedCluster(
        x + reed.x,
        y + 0.04,
        z + reed.z,
        yaw,
        tone === "highland" ? 0.68 * scale : 0.78 * scale,
        tone === "highland" ? "#667b5d" : "#749c58",
      );
    }

    if (tone === "highland" || tone === "shrine") {
      const rock = props.transformLocal(0.68 * scale, 0.52 * scale, yaw);
      props.addBankPebbleCluster(
        x + rock.x,
        y + 0.08,
        z + rock.z,
        yaw + 0.34,
        0.5 * scale,
        tone === "shrine" ? "#b5b3a9" : "#aaa99f",
      );
    }
  };

  // 1. Title screen into opening meadow: keep the start readable, with meadow detail at the edges.
  [
    [-82, -158, 1.18, 0.2],
    [-58, -166, 0.94, 1.35],
    [-38, -146, 1.02, 2.1],
    [-96, -134, 0.9, 2.9],
    [-72, -138, 0.82, -0.54],
    [-48, -126, 0.76, 0.96],
    [-24, -134, 0.72, 2.46],
  ].forEach(([x, z, scale, yaw]) => {
    addUnderstory(x, z, scale, yaw, "meadow");
  });
  addShadow(-88, -146, 1.12, "#5f754a", 0.13, 0.22);
  addShadow(-30, -154, 0.92, "#688452", 0.1, -0.3);
  addFramingTree(-118, -144, 0.84, "round", "#95d273", 900);
  addFramingTree(18, -146, 0.7, "round", "#9bd978", 901);

  // 2. Opening lake shore: make the lake edge legible without filling the shallows with props.
  [
    [-67, -112, 1.08, -0.1],
    [-51, -88, 0.96, 0.74],
    [-17, -88, 0.9, 1.24],
    [0, -112, 1.02, 2.92],
    [-44, -140, 0.96, -2.44],
    [-77, -102, 0.86, -0.7],
  ].forEach(([x, z, scale, yaw], index) => {
    addBankRead(x, z, scale, yaw, "warm");
    addUnderstory(x + Math.sin(index * 1.1) * 1.6, z + Math.cos(index * 0.9) * 1.3, scale * 0.82, yaw + 0.4, "shore");
  });

  // 3. River bend / creek shore: strengthen both banks at Silver Bend from normal gameplay distance.
  [12, 24, 36].forEach((z, stationIndex) => {
    const channel = sampleRiverChannelAt("main", z);
    const halfWidth = sampleRiverSurfaceHalfWidth(channel);
    [-1, 1].forEach((side, sideIndex) => {
      const x = channel.centerX + side * (halfWidth + 4.4 + stationIndex * 0.8);
      const yaw = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      addBankRead(x, z + (sideIndex === 0 ? -1.4 : 1.2), 0.82 + stationIndex * 0.06, yaw, "cool");
      addUnderstory(
        x + side * (2.8 + stationIndex * 0.5),
        z + (stationIndex - 1) * 3.2,
        0.72,
        yaw + 0.3,
        stationIndex === 1 ? "shore" : "meadow",
      );
    });
  });
  addFramingTree(-44, 30, 0.72, "round", "#89c96c", 930);
  addFramingTree(54, 28, 0.7, "round", "#84bd68", 931);

  // 4. Forest edge near route: use mature silhouettes at the sides, then understory, not random saplings.
  [
    [-44, 80, 0.92, "pine", "#5f804f", 960],
    [55, 80, 0.96, "pine", "#668a55", 961],
    [-56, 108, 1.02, "pine", "#58764b", 962],
    [64, 112, 1.08, "pine", "#58764b", 963],
    [-24, 70, 0.72, "round", "#86bf69", 964],
    [36, 74, 0.74, "round", "#83bc66", 965],
  ].forEach(([x, z, scale, kind, color, seed]) => {
    addFramingTree(x as number, z as number, scale as number, kind as "round" | "pine", color as string, seed as number);
  });
  [
    [-36, 90, 1.02, 0.2],
    [44, 92, 1.08, 2.4],
    [-46, 116, 0.92, -0.8],
    [54, 118, 0.94, 1.1],
  ].forEach(([x, z, scale, yaw]) => {
    addShadow(x, z, scale, "#485943", 0.16, yaw);
    addUnderstory(x, z, scale * 0.84, yaw + 0.36, "forest");
  });

  // 5. Highland creek / small waterfalls: add mossy lips and side trickles around existing water.
  [
    [25, 89, 0.78, -0.2],
    [38, 128, 0.96, -0.34],
    [34, 136, 0.82, 0.6],
    [-16, 158, 0.72, 0.5],
    [-28, 174, 0.74, -0.45],
  ].forEach(([x, z, scale, yaw]) => {
    addBankRead(x, z, scale, yaw, "alpine");
    addUnderstory(x, z, scale * 0.86, yaw + 0.2, "highland");
  });
  for (const [x, z, width, height, yaw] of [[34, 126, 2.4, 9.2, -0.26], [21, 91, 1.8, 5.8, 0.18]] as const) {
    const waterfall = makeWaterfallRibbon(height, width);
    waterfall.name = `anchor-side-waterfall-${Math.round(x)}-${Math.round(z)}`;
    addTerrainObject(waterfall, x, z, -height * 0.12, yaw);
  }

  // 6. Shrine approach: pale rocks and restrained greenery frame the final climb.
  [
    [-16, 204, 1.08, -0.4],
    [22, 204, 1.12, 0.34],
    [-26, 218, 0.92, 1.2],
    [30, 222, 0.96, -1.1],
  ].forEach(([x, z, scale, yaw], index) => {
    addUnderstory(x, z, scale, yaw, "shrine");
    const rock = makeRockFormation(index % 2 === 0 ? 0.82 * scale : 0.72 * scale, "#b7b5ab");
    addTerrainObject(rock, x + Math.cos(yaw) * 2.2 * scale, z + Math.sin(yaw) * 2.2 * scale, 0, yaw + 0.4);
  });
  addFramingTree(-42, 204, 0.84, "pine", "#4f6845", 990);
  addFramingTree(48, 210, 0.86, "pine", "#526b47", 991);
  addShadow(6, 206, 0.86, "#626b5e", 0.1, 0.14);

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
  const trunkMaterial = new MeshStandardMaterial({ color: "#e8e4dc", roughness: 0.9, metalness: 0 });
  const blackStripe = new MeshStandardMaterial({ color: "#3a3c3a", roughness: 0.88 });
  const mkLeaf = (hex: string, emissive: string) =>
    new MeshStandardMaterial({
      color: hex,
      roughness: 0.72,
      metalness: 0,
      emissive: new Color(emissive),
      emissiveIntensity: 0.18,
    });
  const orangeLeaves = mkLeaf("#e87838", "#4a2010");
  const greenLeaves = mkLeaf("#6cb64a", "#1a300c");

  const makeTree = (x: number, z: number, color: MeshStandardMaterial) => {
    const tree = new Group();
    const trunk = markCameraCollider(
      new Mesh(new CylinderGeometry(0.3, 0.42, 7.0, 12), trunkMaterial),
    );
    trunk.position.y = 3.5;
    tree.add(trunk);

    const topMat = new MeshStandardMaterial({
      color: (color as MeshStandardMaterial).color,
      roughness: 0.6,
      emissive: (color as MeshStandardMaterial).emissive,
      emissiveIntensity: 0.28,
    });
    for (const [y, size, ox, oz] of [
      [7, 2.6, 0, 0],
      [8.1, 2.0, 1.05, 0.2],
      [7.9, 1.85, -0.95, 0.12],
      [6.6, 1.75, 0.5, 0.95],
      [8.4, 1.35, -0.4, 0.55],
      [6.2, 1.25, 0, -0.6],
    ]) {
      const leaf = new Mesh(new SphereGeometry((size as number) * 0.92, 10, 8), y > 7.5 ? topMat : color);
      leaf.position.set(ox as number, y as number, oz as number);
      tree.add(leaf);
    }
    for (const [y, s, ox, oz] of [
      [4.2, 0.5, 0, 0],
      [5.1, 0.36, 0.6, 0.2],
    ]) {
      const sub = new Mesh(new SphereGeometry(s as number, 8, 6), color);
      sub.position.set(ox as number, y as number, oz as number);
      tree.add(sub);
    }

    for (const y of [2.7, 4.2, 5.7]) {
      const stripe = new Mesh(new SphereGeometry(0.11, 6, 4), blackStripe);
      stripe.scale.set(0.58, 1, 0.08);
      stripe.position.set(0, y, 0.4);
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
