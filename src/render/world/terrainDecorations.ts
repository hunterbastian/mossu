import {
  AdditiveBlending,
  BoxGeometry,
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
  Material,
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
import { markCameraCollider, scatterAroundPocket } from "./sceneHelpers";
import { ART_DIRECTION_IDS, OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";
import { sampleOpeningMeadowMask } from "./worldMasks";

type MaterialCompileShader = Parameters<MeshLambertMaterial["onBeforeCompile"]>[0];
type MaterialCompileRenderer = Parameters<MeshLambertMaterial["onBeforeCompile"]>[1];

export const TREE_SCALE_LOCK = 4;
const TREE_SIZE_MULTIPLIER = 2.45 * TREE_SCALE_LOCK;
const LANDMARK_TREE_SIZE_MULTIPLIER = 4 * TREE_SCALE_LOCK;
const INSTANCED_TREE_SCALE_MULTIPLIER = TREE_SCALE_LOCK;
const TREE_LEAF_WIND_CACHE_KEY = "mossu-static-tree-leaf-wind";
const FOREST_MIN_X = -182;
const FOREST_MAX_X = 174;
const FOREST_MIN_Z = -158;
const FOREST_MAX_Z = 226;
const grasslandProps = OOT_PS2_GRASSLANDS_PALETTE.props;
const forestGroveProps = grasslandProps.forestGroves;
const futureLakeArt = OOT_PS2_GRASSLANDS_PALETTE.futureLakes;

type InstancedForestKind = "round" | "pine";

interface InstancedTreePlacement {
  x: number;
  z: number;
  y: number;
  scale: number;
  /**
   * Y-only scale multiplier on top of `scale`. Most trees are 1.0; a fraction
   * become "old growth pillars" at 1.2-1.45 to break the canopy ceiling and
   * give the spec's tall connected forest read.
   */
  verticalLift: number;
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

function enableTreeLeafWindMaterial(material: Material, intensity = 1) {
  if (material.userData.treeLeafWindEnabled) {
    return;
  }

  const originalCompile = material.onBeforeCompile.bind(material);
  const originalProgramKey = material.customProgramCacheKey.bind(material);
  const windIntensity = intensity.toFixed(2);
  material.onBeforeCompile = (shader: MaterialCompileShader, renderer: MaterialCompileRenderer) => {
    originalCompile(shader, renderer);
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec3 mossuLeafWorld = (modelMatrix * vec4(position, 1.0)).xyz;
float mossuLeafFacing = smoothstep(-0.35, 0.85, normal.y * 0.5 + 0.5);
float mossuLeafCrown = smoothstep(0.0, 1.0, position.y * 0.08 + 0.35);
float mossuLeafBreeze = sin(uTime * 1.05 + mossuLeafWorld.x * 0.055 + mossuLeafWorld.z * 0.041);
float mossuLeafFlutter = sin(uTime * 2.45 + mossuLeafWorld.x * 0.13 - mossuLeafWorld.z * 0.09);
float mossuLeafWind = ${windIntensity} * mossuLeafFacing * mossuLeafCrown;
transformed.x += (mossuLeafBreeze * 0.09 + mossuLeafFlutter * 0.022) * mossuLeafWind;
transformed.z += (mossuLeafBreeze * 0.044 - mossuLeafFlutter * 0.014) * mossuLeafWind;
transformed.y += mossuLeafFlutter * 0.012 * mossuLeafWind;`,
      );
    material.userData.windShader = shader;
  };
  material.customProgramCacheKey = () => `${originalProgramKey()}-${TREE_LEAF_WIND_CACHE_KEY}-${windIntensity}`;
  material.userData.treeLeafWindEnabled = true;
}

function markTreeLeafWind<T extends Mesh>(mesh: T, intensity = 1) {
  mesh.userData.treeLeafWind = true;
  const material = mesh.material;
  if (!Array.isArray(material)) {
    enableTreeLeafWindMaterial(material, intensity);
  }
  return mesh;
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
  const routeClearing = Math.exp(-((x / 118) ** 2)) * MathUtils.smoothstep(z, -112, 236) * (1 - MathUtils.smoothstep(z, 246, 286));
  const routeReadability = sampleRouteReadabilityClearing(x, z);
  // Tight band on the main approach so ridge / shrine silhouettes stay visible from the path (not a wide deforest).
  const alpineRouteVista =
    Math.exp(-((x / 38) ** 2)) * MathUtils.smoothstep(z, 88, 198) * (1 - MathUtils.smoothstep(z, 208, 224));
  const overlookOpen = Math.max(
    Math.exp(-(((x + 24) / 42) ** 2) - (((z - 168) / 32) ** 2)),
    Math.exp(-(((x - 6) / 46) ** 2) - (((z - 180) / 36) ** 2)),
  );
  const startClearing = Math.exp(-(((x + 44) / 52) ** 2) - (((z + 132) / 44) ** 2));
  const islandFieldClearing = Math.exp(-(((x + 4) / 380) ** 2) - (((z - 42) / 420) ** 2));
  const waterClearing = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  const altitudeEdge = MathUtils.smoothstep(y, 44, 132);
  const edge = MathUtils.clamp(
    Math.abs(broadPatch - 0.52) * 2.2 + routeClearing * 0.4 + altitudeEdge * 0.18 + overlookOpen * 0.24,
    0,
    1,
  );

  return {
    patch: MathUtils.clamp(
      (broadPatch - 0.34) * 1.75 +
      localBreakup * 0.38 +
      grovePulse * 0.62 +
      habitat.forest * 0.46 -
      routeReadability * 0.78 -
      islandFieldClearing * 0.48 -
      overlookOpen * 0.38,
      0,
      1,
    ),
    clearing: MathUtils.clamp(
      routeClearing * 1.16 +
      routeReadability * 1.08 +
      startClearing * 0.95 +
      waterClearing * 0.74 +
      habitat.clearing * 0.52 +
      islandFieldClearing * 0.72 +
      alpineRouteVista * 0.78 +
      overlookOpen * 0.68,
      0,
      1,
    ),
    edge: MathUtils.clamp(edge + habitat.edge * 0.34, 0, 1),
  };
}

function sampleRouteVistaProtection(x: number, z: number) {
  const routeVista =
    Math.exp(-((x / 172) ** 2)) *
    MathUtils.smoothstep(z, -44, 204) *
    (1 - MathUtils.smoothstep(z, 222, 276));
  const creekVista =
    Math.exp(-(((x - 34) / 42) ** 2) - (((z - 132) / 42) ** 2));
  return Math.max(sampleRouteReadabilityClearing(x, z), routeVista, creekVista * 0.9);
}

function shouldSkipLargeRouteTree(kind: "round" | "pine" | "birch", x: number, z: number, scale: number) {
  if (kind === "birch") {
    return false;
  }
  const vistaProtection = sampleRouteVistaProtection(x, z);
  const threshold = kind === "pine"
    ? scale > 0.9 ? 0.18 : 0.28
    : scale > 0.82 ? 0.22 : 0.36;
  return vistaProtection > threshold;
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
  const routeVistaBand = sampleRouteVistaProtection(x, z);
  const waterWetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  if (
    waterWetness > 0.26 ||
    habitat.shore > 0.42 ||
    habitat.meadow > 0.54 ||
    routeReadability > 0.36 ||
    routeVistaBand > 0.22
  ) {
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
    const alpineFade = zone === "alpine" ? MathUtils.clamp(1 - MathUtils.smoothstep(y, 84, 118), 0, 1) * 0.18 : 0;
    const biomeDensity =
      zone === "plains" ? 0.16 :
      zone === "hills" ? 0.42 :
      zone === "foothills" ? 0.5 :
      alpineFade;
    return (biomeDensity + edgeBoost) * waterFade * forestEnvelope * clumpGate * clearingFade * (1 - habitat.meadow * 0.5) * (1 - routeReadability * 0.86);
  }

  // pines get a sparse plains/hills fringe density so the lowland edge crossfades rather than hard-cuts
  const lowlandPineFade = (zone === "plains" || zone === "hills") ? MathUtils.clamp(firApproach * 0.18, 0, 0.12) : 0;
  const biomeDensity =
    zone === "hills" ? 0.18 :
    zone === "foothills" ? 0.66 :
    zone === "alpine" ? 0.78 :
    zone === "ridge" ? 0.58 :
    lowlandPineFade;
  return (biomeDensity + edgeBoost) * waterFade * MathUtils.clamp(forestEnvelope + firApproach * 0.34, 0, 1) * clumpGate * clearingFade * (1 - habitat.meadow * 0.42) * (1 - routeReadability * 0.82);
}

function buildInstancedTreePlacements(kind: InstancedForestKind) {
  const placements: InstancedTreePlacement[] = [];
  // Poisson radius tightened to match the post-TREE_SCALE_LOCK crown size — at
  // the previous 17m/15.5m, 4× crowns barely touched. ~12m gives the spec's
  // overlapping connected canopy without crowns clipping into each other.
  const candidates = samplePoissonDisk(
    FOREST_MIN_X,
    FOREST_MAX_X,
    FOREST_MIN_Z,
    FOREST_MAX_Z,
    kind === "round" ? 12 : 10.5,
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

    // Vertical lift: ~30% of trees become old-growth pillars (1.18-1.42x Y),
    // the rest stay uniform. Bias toward pillars in foothills/forest where the
    // spec wants the connected-canopy ceiling broken by occasional towering
    // older trees. Pines lift more dramatically than rounded broadleaf since
    // their conical silhouette reads as "tallest in the stand" naturally.
    const pillarHash = forestHash(x, z, kind === "round" ? 113 : 127);
    const pillarChance =
      zone === "foothills" || zone === "alpine" || zone === "ridge" ? 0.34 :
      zone === "hills" ? 0.22 :
      0.12;
    const pillarStrength = kind === "pine" ? 1.42 : 1.28;
    const verticalLift = pillarHash < pillarChance
      ? 1.0 + (pillarStrength - 1.0) * (0.6 + forestHash(x, z, 131) * 0.4)
      : 1.0;

    placements.push({
      x,
      z,
      y,
      scale: scaleBase * altitudeScale * edgeLift,
      verticalLift,
      yaw: forestHash(x, z, 71 + index * 0.01) * Math.PI * 2,
    });
  });

  // Caps raised to absorb the denser Poisson sampling — without this the slice
  // would chop the new candidates and we'd see no canopy difference.
  return placements.slice(0, kind === "round" ? 220 : 320);
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
  const leafShade = "#4f7744";
  const leafDeep = "#3b623a";

  const trunk = new CylinderGeometry(0.3, 0.58, 3.5, 18);
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
    return transformGeometry(new SphereGeometry(1, 10, 7), {
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
    transformGeometry(new CylinderGeometry(0.04, 0.1, len as number, 10), {
      rotation: [pitch as number, 0, roll as number],
      position: [x as number, y as number, z as number],
    }),
  );

  const sphereSeg = 16;
  const sphereRow = 11;

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
      geometry: transformGeometry(new SphereGeometry(1, 12, 8), {
        scale: [size, size * 0.88, size],
        position: [x, y, z],
      }),
      color,
      windWeight: 0.95,
    })),
    ...blossomParts.map(([x, y, z, color, size]) => ({
      geometry: transformGeometry(new SphereGeometry(1, 10, 7), {
        scale: [size, size * 0.78, size],
        position: [x, y, z],
      }),
      color,
      windWeight: 0.88,
    })),
  ]);
}

function makePineForestGeometry() {
  const segs = 24;
  const trunk = new CylinderGeometry(0.16, 0.3, 4.6, 18);
  trunk.translate(0, 2.3, 0);
  const wood = "#5c4736";
  const t1 = "#4f6d49";
  const t2 = "#5f8052";
  const t3 = "#71945f";
  const t4 = "#86ad70";
  const t5 = "#9cc982";
  const tTop = "#c0dc9a";

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
  const hip = transformGeometry(new SphereGeometry(0.34, 14, 9), {
    scale: [0.52, 0.4, 0.5],
    position: [0, 5.8, 0],
  });
  // Dead stub for silhouette break (tucked under mid tier)
  const stub = transformGeometry(new CylinderGeometry(0.04, 0.08, 0.5, 10), {
    rotation: [0, 0, 0.5],
    position: [0.42, 3.5, 0.2],
  });

  return mergeTreeGeometry([
    { geometry: trunk, color: wood, windWeight: 0 },
    { geometry: stub, color: makeTint(wood, "#7a6448", 0.3), windWeight: 0 },
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
    const xz = placement.scale * scaleMultiplier;
    dummy.scale.set(xz, xz * placement.verticalLift, xz);
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
  applyTreeInstances(roundTrees, roundPlacements, 2.12 * INSTANCED_TREE_SCALE_MULTIPLIER);
  applyTreeInstances(pineTrees, pinePlacements, 2.22 * INSTANCED_TREE_SCALE_MULTIPLIER);
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
  const leafMist = new MeshLambertMaterial({ color: makeTint(leafColor, "#99bf83", 0.28) });
  const leafLightMaterial = new MeshLambertMaterial({ color: makeTint(leafColor, "#d5df88", 0.32) });
  const flowerMaterial = new MeshLambertMaterial({ color: "#fff2c8" });
  const fruitMaterial = new MeshLambertMaterial({ color: "#f0c878" });
  const sphereSeg = 16;
  const sphereRow = 11;

  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.3 * scaledSize, 0.58 * scaledSize, 3.5 * scaledSize, 18),
    barkMaterial,
  ));
  trunk.position.y = 1.75 * scaledSize;
  group.add(trunk);

  const trunkHighlight = new Mesh(new SphereGeometry(0.11 * scaledSize, 12, 8), barkLightMaterial);
  trunkHighlight.scale.set(0.72, 4.6, 0.3);
  trunkHighlight.rotation.set(0, 0.15, -0.12);
  trunkHighlight.position.set(0.18 * scaledSize, 1.9 * scaledSize, 0.32 * scaledSize);
  group.add(trunkHighlight);

  const nub = new Mesh(
    new SphereGeometry(0.05 * scaledSize, 8, 6),
    new MeshLambertMaterial({ color: makeTint("#7a5a3a", "#4a6a3a", 0.4) }),
  );
  nub.position.set(-0.2 * scaledSize, 1.1 * scaledSize, 0.28 * scaledSize);
  group.add(nub);

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + 0.08;
    const s = 0.34 + (i % 3) * 0.05;
    const root = markCameraCollider(new Mesh(
      new SphereGeometry(0.5 * s * scaledSize, 10, 7),
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
      new CylinderGeometry(0.04 * scaledSize, 0.1 * scaledSize, (length as number) * scaledSize, 10),
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
    const canopy = markTreeLeafWind(new Mesh(
      new SphereGeometry(scaledSize, sphereSeg, sphereRow),
      material as MeshLambertMaterial,
    ));
    canopy.scale.set(sx as number, sy as number, sz as number);
    canopy.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(canopy);
  }

  for (const [x, y, z, s] of [
    [0, 2.9, 0, 0.36],
  ]) {
    const puff = markTreeLeafWind(new Mesh(
      new SphereGeometry((s as number) * scaledSize, 12, 8),
      new MeshLambertMaterial({ color: makeTint(leafColor, "#1e3a24", 0.2) }),
    ), 0.72);
    puff.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(puff);
  }

  for (const [x, y, z, s] of [
    [0.4, 4.85, 0.1, 0.26],
  ]) {
    const puff = markTreeLeafWind(new Mesh(new SphereGeometry((s as number) * scaledSize, 12, 8), leafLightMaterial), 0.72);
    puff.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(puff);
  }

  for (const [x, y, z, size, material] of [
    [0.65, 4.0, 0.7, 0.14, flowerMaterial],
    [-0.55, 3.6, 0.65, 0.12, fruitMaterial],
  ]) {
    const ornament = new Mesh(new SphereGeometry((size as number) * scaledSize, 10, 7), material as MeshLambertMaterial);
    ornament.scale.set(1, 0.78, 1);
    ornament.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(ornament);
  }

  return group;
}

function makePineTree(scale: number, tone = "#5b7d4d") {
  const scaledSize = scale * TREE_SIZE_MULTIPLIER;
  const group = new Group();
  const segs = 24;
  const wood = new MeshLambertMaterial({ color: "#5c4736" });
  const stubMat = new MeshLambertMaterial({ color: makeTint("#5c4736", "#6f5a43", 0.34) });
  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.16 * scaledSize, 0.3 * scaledSize, 4.6 * scaledSize, 18),
    wood,
  ));
  trunk.position.y = 2.3 * scaledSize;
  group.add(trunk);

  const stub = new Mesh(
    new CylinderGeometry(0.04 * scaledSize, 0.08 * scaledSize, 0.5 * scaledSize, 10),
    stubMat,
  );
  stub.position.set(0.42 * scaledSize, 3.5 * scaledSize, 0.2 * scaledSize);
  stub.rotation.z = 0.5;
  group.add(stub);

  const t1 = makeTint(tone, "#587e4e", 0.26);
  const t2 = makeTint(tone, "#668a58", 0.24);
  const t3 = makeTint(tone, "#779a64", 0.2);
  const t4 = makeTint(tone, "#8aae72", 0.18);
  const t5 = makeTint(tone, "#9cc383", 0.16);
  const tTop = makeTint(tone, "#b8d79c", 0.2);
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
    const mesh = markTreeLeafWind(new Mesh(geom, new MeshLambertMaterial({ color: layer.color })), 0.82);
    mesh.position.y = layer.y * scaledSize;
    group.add(mesh);
  }

  const hip = markTreeLeafWind(new Mesh(new SphereGeometry(0.17 * scaledSize, 14, 9), new MeshLambertMaterial({ color: tTop })), 0.7);
  hip.scale.set(0.52, 0.4, 0.5);
  hip.position.set(0, 5.8 * scaledSize, 0);
  group.add(hip);

  return group;
}

function makeBirchGroveTree(scale: number, leafColor: string = forestGroveProps.birchCanopy) {
  const scaledSize = scale * TREE_SIZE_MULTIPLIER;
  const group = new Group();
  const barkMaterial = new MeshLambertMaterial({ color: forestGroveProps.birchBark });
  const stripeMaterial = new MeshLambertMaterial({ color: forestGroveProps.birchStripe });
  const leafMaterial = new MeshLambertMaterial({ color: leafColor });
  const leafShadowMaterial = new MeshLambertMaterial({ color: makeTint(leafColor, forestGroveProps.deepCanopyDark, 0.28) });
  const leafLightMaterial = new MeshLambertMaterial({ color: makeTint(leafColor, "#ecf1a0", 0.36) });

  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.22 * scaledSize, 0.32 * scaledSize, 4.25 * scaledSize, 16),
    barkMaterial,
  ));
  trunk.position.y = 2.12 * scaledSize;
  trunk.rotation.z = -0.04;
  group.add(trunk);

  for (const [y, sx, yaw] of [
    [1.22, 0.9, 0.12],
    [2.08, 0.72, -0.18],
    [2.92, 0.82, 0.26],
  ] as const) {
    const stripe = new Mesh(new BoxGeometry(0.5 * scaledSize, 0.12 * scaledSize, 0.05 * scaledSize), stripeMaterial);
    stripe.position.set(0.02 * scaledSize, y * scaledSize, 0.22 * scaledSize);
    stripe.scale.x = sx;
    stripe.rotation.y = yaw;
    stripe.rotation.z = -0.08;
    group.add(stripe);
  }

  for (const [x, y, z, sx, sy, sz, material] of [
    [0, 4.52, 0, 1.2, 0.82, 1.02, leafMaterial],
    [-0.62, 4.18, 0.18, 0.76, 0.5, 0.68, leafShadowMaterial],
    [0.64, 4.26, -0.12, 0.74, 0.52, 0.7, leafMaterial],
    [0.12, 4.88, 0.22, 0.56, 0.38, 0.52, leafLightMaterial],
  ] as const) {
    const leaf = markTreeLeafWind(new Mesh(new SphereGeometry(scaledSize, 14, 10), material as MeshLambertMaterial));
    leaf.scale.set(sx as number, sy as number, sz as number);
    leaf.position.set((x as number) * scaledSize, (y as number) * scaledSize, (z as number) * scaledSize);
    group.add(leaf);
  }

  return group;
}

function makeFallenLog(scale: number) {
  const group = new Group();
  const barkMaterial = new MeshLambertMaterial({ color: forestGroveProps.root });
  const cutMaterial = new MeshLambertMaterial({ color: "#b1885c" });
  const log = markCameraCollider(new Mesh(new CylinderGeometry(0.34 * scale, 0.42 * scale, 3.4 * scale, 16), barkMaterial));
  log.rotation.z = Math.PI * 0.5;
  log.position.y = 0.34 * scale;
  group.add(log);
  [-1.7, 1.7].forEach((x) => {
    const cut = new Mesh(new CircleGeometry(0.36 * scale, 16), cutMaterial);
    cut.position.set(x * scale, 0.34 * scale, 0);
    cut.rotation.y = Math.PI * 0.5;
    group.add(cut);
  });
  const moss = makeMossPatch(0.44 * scale, forestGroveProps.mossGlow);
  moss.position.set(-0.35 * scale, 0.72 * scale, 0.08 * scale);
  group.add(moss);
  return group;
}

function makeRootRun(scale: number) {
  const group = new Group();
  const rootMaterial = new MeshLambertMaterial({ color: forestGroveProps.rootDark });
  for (const [x, z, length, yaw, width] of [
    [0, 0, 2.9, -0.42, 0.16],
    [0.62, 0.42, 2.2, 0.38, 0.12],
    [-0.52, -0.36, 2.0, -0.9, 0.11],
  ] as const) {
    const root = markCameraCollider(new Mesh(new CylinderGeometry(width * scale, width * 1.45 * scale, length * scale, 12), rootMaterial));
    root.position.set(x * scale, 0.18 * scale, z * scale);
    root.rotation.set(Math.PI * 0.5, yaw, 0.08);
    group.add(root);
  }
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
    const leaf = markTreeLeafWind(new Mesh(
      new SphereGeometry((size as number) * scale, 8, 6),
      mat as MeshLambertMaterial,
    ), 0.64);
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
    const cone = markTreeLeafWind(new Mesh(
      g,
      new MeshLambertMaterial({ color: y > 1.4 ? c2 : c1 }),
    ), 0.66);
    cone.position.y = (y as number) * scale;
    group.add(cone);
  }

  return group;
}

function makeGrasslandSignpost(scale: number) {
  const group = new Group();
  group.name = `${ART_DIRECTION_IDS.grasslands}-signpost`;
  const postMaterial = new MeshLambertMaterial({ color: grasslandProps.signpost.post });
  const signMaterial = new MeshLambertMaterial({ color: grasslandProps.signpost.face });
  const trimMaterial = new MeshLambertMaterial({ color: grasslandProps.signpost.trim });

  const post = new Mesh(new BoxGeometry(0.34 * scale, 2.4 * scale, 0.34 * scale), postMaterial);
  post.position.y = 1.2 * scale;
  group.add(post);

  const face = new Mesh(new BoxGeometry(1.9 * scale, 0.78 * scale, 0.2 * scale), signMaterial);
  face.position.set(0.18 * scale, 2.12 * scale, 0);
  face.rotation.z = -0.04;
  group.add(face);

  const leaf = new Mesh(new SphereGeometry(0.16 * scale, 7, 5), trimMaterial);
  leaf.position.set(-0.78 * scale, 2.16 * scale, 0.12 * scale);
  leaf.scale.set(1.4, 0.42, 0.7);
  leaf.rotation.z = 0.36;
  group.add(leaf);

  const pointer = new Mesh(new BoxGeometry(0.8 * scale, 0.18 * scale, 0.16 * scale), trimMaterial);
  pointer.position.set(0.48 * scale, 2.13 * scale, 0.14 * scale);
  pointer.rotation.z = -0.04;
  group.add(pointer);

  return group;
}

type SmallPropGeometryKind =
  | "cone-5"
  | "flower-stem"
  | "mushroom-stem"
  | "sphere-5-4"
  | "sphere-6-5";

interface SmallPropBucket {
  kind: SmallPropGeometryKind;
  cellX: number;
  cellZ: number;
  geometry: BufferGeometry;
  material: MeshLambertMaterial;
  matrices: Matrix4[];
  colors: Color[];
}

class SmallPropInstancer {
  private static readonly CELL_SIZE = 112;
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
      mesh.userData.smallPropCellX = bucket.cellX;
      mesh.userData.smallPropCellZ = bucket.cellZ;
      bucket.matrices.forEach((matrix, index) => {
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, bucket.colors[index]);
      });
      let centerX = 0;
      let centerZ = 0;
      bucket.matrices.forEach((matrix) => {
        const elements = matrix.elements;
        centerX += elements[12];
        centerZ += elements[14];
      });
      centerX /= Math.max(1, bucket.matrices.length);
      centerZ /= Math.max(1, bucket.matrices.length);
      let radius = 0;
      bucket.matrices.forEach((matrix) => {
        const elements = matrix.elements;
        radius = Math.max(radius, Math.hypot(elements[12] - centerX, elements[14] - centerZ));
      });
      mesh.userData.smallPropCenterX = centerX;
      mesh.userData.smallPropCenterZ = centerZ;
      mesh.userData.smallPropRadius = radius + SmallPropInstancer.CELL_SIZE * 0.72;
      mesh.frustumCulled = true;
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
    const cellX = Math.floor(x / SmallPropInstancer.CELL_SIZE);
    const cellZ = Math.floor(z / SmallPropInstancer.CELL_SIZE);
    const key = `${kind}:${cellX},${cellZ}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        kind,
        cellX,
        cellZ,
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

function _makeFlower(color: string, scale: number, stemHeight: number) {
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

function _makeCloverPatch(radius: number, color: string) {
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

function _makeReedCluster(scale: number, color: string) {
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

function _makeTinyRock(scale: number, color: string) {
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

function _makeBankLipPebbleTrail(scale: number, tone: string) {
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
    opacity: opacity * 0.36,
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
    opacity: opacity * 0.3,
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

function makeCanopyShadowPatch(_scale: number, _tone: string, _opacity: number) {
  return new Group();
}

function _makeBankSedgePatch(scale: number, tone: "meadow" | "foothill" | "alpine") {
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

function makeMossyStump(scale: number) {
  const group = new Group();
  group.name = "forest-grove-mossy-stump";
  const barkMaterial = new MeshLambertMaterial({ color: forestGroveProps.stumpBark });
  const topMaterial = new MeshLambertMaterial({ color: forestGroveProps.stumpTop });
  const mossMaterial = new MeshLambertMaterial({ color: forestGroveProps.mossGlow });
  const rootMaterial = new MeshLambertMaterial({ color: forestGroveProps.rootDark });

  const trunk = markCameraCollider(new Mesh(new CylinderGeometry(0.54 * scale, 0.68 * scale, 1.26 * scale, 9), barkMaterial));
  trunk.position.y = 0.63 * scale;
  trunk.rotation.z = -0.04;
  group.add(trunk);

  const top = new Mesh(new CylinderGeometry(0.56 * scale, 0.5 * scale, 0.12 * scale, 9), topMaterial);
  top.position.y = 1.28 * scale;
  top.rotation.z = -0.035;
  group.add(top);

  const mossCap = new Mesh(new SphereGeometry(0.36 * scale, 7, 5), mossMaterial);
  mossCap.position.set(-0.18 * scale, 1.36 * scale, 0.12 * scale);
  mossCap.scale.set(1.25, 0.22, 0.9);
  group.add(mossCap);

  for (const [x, z, yaw, length] of [
    [-0.58, -0.16, -0.48, 1.12],
    [0.54, 0.12, 0.44, 0.94],
    [0.02, 0.64, 1.48, 0.78],
  ] as const) {
    const root = new Mesh(new CylinderGeometry(0.055 * scale, 0.09 * scale, length * scale, 6), rootMaterial);
    root.position.set(x * scale, 0.16 * scale, z * scale);
    root.rotation.z = Math.PI * 0.5;
    root.rotation.y = yaw;
    group.add(root);
  }

  const moss = makeMossPatch(0.42 * scale, forestGroveProps.mossGlow);
  moss.position.set(0.34 * scale, 0.05 * scale, -0.34 * scale);
  group.add(moss);

  return group;
}

function makeFernPatch(scale: number, tone: string = forestGroveProps.fern) {
  const group = new Group();
  group.name = "forest-grove-fern-patch";
  const leafMaterial = new MeshLambertMaterial({
    color: tone,
    side: DoubleSide,
  });
  const ribMaterial = new MeshLambertMaterial({ color: makeTint(tone, "#d3e58b", 0.18) });

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const length = scale * (0.88 + (i % 3) * 0.13);
    const width = scale * (0.18 + (i % 2) * 0.04);
    const leaf = new Mesh(new PlaneGeometry(width, length), leafMaterial);
    leaf.position.set(Math.cos(angle) * length * 0.26, 0.1 * scale, Math.sin(angle) * length * 0.26);
    leaf.rotation.x = -Math.PI / 2 + 0.24;
    leaf.rotation.y = angle;
    leaf.rotation.z = (i % 2 === 0 ? -0.08 : 0.08);
    group.add(leaf);
  }

  const rib = new Mesh(new ConeGeometry(0.055 * scale, 0.96 * scale, 5), ribMaterial);
  rib.position.y = 0.26 * scale;
  rib.rotation.z = 0.12;
  group.add(rib);

  return group;
}

function makeWoodlandLightShaft(scale: number) {
  const group = new Group();
  group.name = "forest-grove-light-shaft";
  const material = new MeshBasicMaterial({
    color: forestGroveProps.lightShaft,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });

  for (const [x, z, width, height, yaw, alpha] of [
    [0, 0, 1.25, 9.4, 0, 1],
    [0.92, 0.5, 0.72, 7.2, 0.18, 0.62],
    [-0.78, -0.36, 0.62, 6.4, -0.16, 0.5],
  ] as const) {
    const shaftMaterial = alpha === 1 ? material : material.clone();
    shaftMaterial.opacity *= alpha;
    const shaft = new Mesh(new PlaneGeometry(width * scale, height * scale), shaftMaterial);
    shaft.position.set(x * scale, (height * scale) * 0.5 + 0.45 * scale, z * scale);
    shaft.rotation.y = yaw;
    shaft.rotation.z = -0.16;
    group.add(shaft);
  }

  return group;
}

function makeCodexCaveMouth(scale: number) {
  const group = new Group();
  group.name = "codex-cave-mouth";
  const shadowMaterial = new MeshBasicMaterial({
    color: "#78856c",
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: DoubleSide,
  });
  const stoneMaterial = new MeshLambertMaterial({ color: "#9d998f" });
  const mossMaterial = new MeshLambertMaterial({ color: "#70865c" });

  const mouth = new Mesh(new CircleGeometry(1.12 * scale, 18), shadowMaterial);
  mouth.scale.set(1, 1.2, 0.7);
  mouth.position.set(0, 1.02 * scale, -0.18 * scale);
  group.add(mouth);

  for (const [x, y, z, sx, sy, sz] of [
    [-0.78, 0.58, 0, 0.42, 1.1, 0.34],
    [0.8, 0.54, 0, 0.42, 1.02, 0.36],
    [0, 1.42, -0.02, 1.32, 0.42, 0.44],
    [-0.32, 0.18, 0.1, 0.56, 0.26, 0.4],
    [0.42, 0.16, 0.1, 0.5, 0.22, 0.36],
  ] as const) {
    const stone = markCameraCollider(new Mesh(new SphereGeometry(0.72 * scale, 6, 5), stoneMaterial));
    stone.position.set(x * scale, y * scale, z * scale);
    stone.scale.set(sx * scale, sy * scale, sz * scale);
    group.add(stone);
  }

  const moss = makeMossPatch(0.52 * scale, "#70865c");
  moss.position.set(-0.38 * scale, 0.14 * scale, 0.42 * scale);
  group.add(moss);
  const sprig = makeGrassClump(0.46 * scale, "#819a62");
  sprig.position.set(0.55 * scale, 0.06 * scale, 0.38 * scale);
  group.add(sprig);

  const lip = new Mesh(new CylinderGeometry(0.04 * scale, 0.06 * scale, 1.18 * scale, 5), mossMaterial);
  lip.position.set(0, 1.63 * scale, 0.2 * scale);
  lip.rotation.z = Math.PI * 0.5;
  group.add(lip);
  return group;
}

function makeCodexRuinMarker(scale: number) {
  const group = new Group();
  group.name = "codex-ruin-marker";
  const stoneMaterial = new MeshLambertMaterial({ color: "#bdb5a2" });
  const capMaterial = new MeshLambertMaterial({ color: "#d1c7ad" });

  for (const x of [-0.48, 0.48]) {
    const pillar = markCameraCollider(new Mesh(new CylinderGeometry(0.16 * scale, 0.22 * scale, 1.65 * scale, 6), stoneMaterial));
    pillar.position.set(x * scale, 0.82 * scale, 0);
    pillar.rotation.z = x < 0 ? -0.05 : 0.04;
    group.add(pillar);
  }

  const lintel = markCameraCollider(new Mesh(new BoxGeometry(1.46 * scale, 0.28 * scale, 0.34 * scale), capMaterial));
  lintel.position.set(0, 1.68 * scale, 0);
  lintel.rotation.z = -0.04;
  group.add(lintel);

  const baseLeft = new Mesh(new BoxGeometry(0.54 * scale, 0.24 * scale, 0.42 * scale), stoneMaterial);
  baseLeft.position.set(-0.52 * scale, 0.12 * scale, 0.08 * scale);
  group.add(baseLeft);
  const baseRight = new Mesh(new BoxGeometry(0.62 * scale, 0.18 * scale, 0.38 * scale), stoneMaterial);
  baseRight.position.set(0.55 * scale, 0.09 * scale, -0.04 * scale);
  baseRight.rotation.y = 0.14;
  group.add(baseRight);

  const moss = makeMossPatch(0.36 * scale, "#728a5b");
  moss.position.set(0.2 * scale, 0.18 * scale, 0.34 * scale);
  group.add(moss);
  return group;
}

function makeAlpineHerbCluster(scale: number, flowerTone = "#f3e7aa") {
  const group = new Group();
  const leafMaterial = new MeshLambertMaterial({ color: "#708a61" });
  const flowerMaterial = new MeshLambertMaterial({ color: flowerTone });
  for (const [x, z, h, tilt] of [
    [-0.26, -0.08, 0.72, -0.2],
    [-0.08, 0.14, 0.84, 0.08],
    [0.16, -0.04, 0.68, 0.18],
    [0.34, 0.12, 0.56, 0.3],
  ] as const) {
    const stem = new Mesh(new ConeGeometry(0.055 * scale, h * scale, 6), leafMaterial);
    stem.position.set(x * scale, h * scale * 0.5, z * scale);
    stem.rotation.z = tilt;
    group.add(stem);
    if (h > 0.65) {
      const flower = new Mesh(new SphereGeometry(0.095 * scale, 7, 5), flowerMaterial);
      flower.position.set(x * scale, h * scale, z * scale);
      flower.scale.set(1.2, 0.56, 1.2);
      group.add(flower);
    }
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

  const veil = makeRibbon(width * 1.14, height, futureLakeArt.shallowEdge, 0.34, 0, -0.04);
  const blueFall = makeRibbon(width * 0.72, height * 0.96, futureLakeArt.clearSurface, 0.4, -width * 0.08, 0.03);
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

  const foamA = makeFoam(width * 0.58, -width * 0.12, 0.42, futureLakeArt.foam, 0.44);
  const foamB = makeFoam(width * 0.42, width * 0.24, 0.58, "#def6ff", 0.34);
  const warmSpray = makeFoam(width * 0.26, width * 0.02, 0.74, futureLakeArt.sunFoam, 0.18);

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

function makeHighlandSprayCloud(scale: number, opacity = 0.18) {
  const group = new Group();
  const colors = ["#f7fdff", "#fff6d8", "#e7fbff"];
  for (let i = 0; i < 7; i += 1) {
    const radius = scale * (0.14 + (i % 4) * 0.034);
    const puff = new Mesh(
      new CircleGeometry(radius, 14),
      new MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: opacity * (0.32 + (i % 3) * 0.1),
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    puff.position.set(
      Math.sin(i * 1.7) * scale * 0.58,
      scale * (0.14 + (i % 5) * 0.15),
      Math.cos(i * 1.1) * scale * 0.14,
    );
    puff.rotation.y = (i % 3 - 1) * 0.24;
    puff.rotation.z = Math.sin(i * 0.9) * 0.16;
    group.add(puff);
  }
  return group;
}

function makeHighlandFoamPatch(scale: number, opacity = 0.34) {
  const group = new Group();
  for (let i = 0; i < 4; i += 1) {
    const foam = new Mesh(
      new CircleGeometry(scale * (0.42 - i * 0.045), 20),
      new MeshBasicMaterial({
        color: i % 2 === 0 ? futureLakeArt.foam : futureLakeArt.foamCool,
        transparent: true,
        opacity: opacity * (0.62 - i * 0.08),
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.scale.z = 0.28 + i * 0.05;
    foam.position.set(Math.sin(i * 1.4) * scale * 0.22, 0.03 + i * 0.006, Math.cos(i * 1.9) * scale * 0.18);
    group.add(foam);
  }
  return group;
}

function makeHighlandWetStone(scale: number) {
  const group = makeRockFormation(scale, "#aeb5aa");
  const shine = new Mesh(
    new PlaneGeometry(0.72 * scale, 0.16 * scale, 1, 1),
    new MeshBasicMaterial({
      color: "#d7e8dd",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  shine.rotation.x = -Math.PI / 2;
  shine.rotation.z = -0.24;
  shine.position.set(-0.12 * scale, 0.42 * scale, 0.28 * scale);
  group.add(shine);
  return group;
}

function _makeMushroom(scale: number, capColor: string) {
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
    const isUpperRoutePocket =
      pocket.id === "highland-basin" ||
      pocket.id === "windstep-shelf" ||
      pocket.id === "cloudback-overlook" ||
      pocket.id === "skyward-ledge-rim" ||
      pocket.id === "ridge-crossing";
    const clusterCount =
      isStartPocket ? 8 :
      pocket.zone === "plains" ? 4 :
      pocket.zone === "hills" ? 3 :
      pocket.zone === "foothills" ? (pocket.id === "fir-gate-entry" ? 2 : 1) :
      pocket.zone === "alpine" ? (pocket.kind === "stream_bend" || isUpperRoutePocket ? 1 : 0) :
      pocket.zone === "ridge" ? (isUpperRoutePocket ? 1 : 0) :
      0;
    const cloverCount =
      isStartPocket ? 5 :
      pocket.zone === "plains" ? 2 :
      pocket.zone === "hills" ? 1 :
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
      isStartPocket ? 5 :
      pocket.zone === "foothills" ? 2 :
      pocket.zone === "alpine" ? 1 :
      pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? (isUpperRoutePocket ? 2 : 1) :
      2;
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
      pocket.zone === "foothills" ? 3 :
      pocket.zone === "alpine" ? (isUpperRoutePocket ? 5 : 4) :
      pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? (isUpperRoutePocket ? 5 : 4) :
      2;
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
      for (let i = 0; i < 2; i += 1) {
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
    const isUpperRoutePocket =
      pocket.id === "windstep-shelf" ||
      pocket.id === "cloudback-overlook" ||
      pocket.id === "skyward-ledge-rim" ||
      pocket.id === "ridge-crossing";
    const bushCount =
      isStartPocket ? 1 :
      pocket.zone === "plains" ? 1 :
      pocket.zone === "hills" ? 2 :
      pocket.zone === "foothills" ? (pocket.id === "fir-gate-entry" ? 3 : 2) :
      pocket.zone === "alpine" ? 1 :
      pocket.zone === "ridge" ? (isUpperRoutePocket ? 2 : 1) :
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
      const mushroomCount = isStartPocket ? 1 : pocket.zone === "plains" ? 1 : 1;
      for (let i = 0; i < mushroomCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 120 + i, 0.7);
        const y = sampleTerrainHeight(x, z);
        props.addMushroom(x, y, z, forestHash(x, z, 120 + i) * Math.PI * 2, 0.72 + i * 0.08, i % 2 === 0 ? "#d8a476" : "#e4b893");
      }
    }

    if (pocket.zone !== "peak_shrine") {
      const saplingCount =
        isStartPocket ? 0 :
        pocket.id === "fir-gate-entry" ? 1 :
        pocket.zone === "foothills" ? 1 :
        pocket.zone === "alpine" || pocket.zone === "ridge" ? (isUpperRoutePocket ? 1 : 0) :
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
    if (
      habitat.shore > 0.56 ||
      (habitat.meadow > 0.84 && habitat.forest < 0.34) ||
      shouldSkipLargeRouteTree(type, x, z, scale)
    ) {
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
    [24, 92, 0.78, "pine"],
    [42, 112, 0.86, "pine"],
    [-20, 126, 0.84, "pine"],
    [18, 154, 0.98, "pine"],
    [-30, 174, 0.96, "pine"],
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
    [-92, 72, 0.68, "pine"],
    [82, 86, 0.7, "pine"],
    [-64, 116, 0.78, "pine"],
    [74, 138, 0.82, "pine"],
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

export function buildForestGroveAccents() {
  const group = new Group();
  const props = new SmallPropInstancer("forest-grove-small-props");
  group.name = "forest-grove-codex-accents";
  group.userData.artDirection = ART_DIRECTION_IDS.forestGroves;

  const addTerrainObject = (object: Object3D, x: number, z: number, yOffset: number, yaw: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }
    const y = sampleTerrainHeight(x, z);
    const slope = 1 - sampleTerrainNormal(x, z).y;
    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    if (slope > 0.42 || wetness > 0.62) {
      return;
    }
    object.position.set(x, y + yOffset, z);
    object.rotation.y = yaw;
    group.add(object);
  };

  const addGroveFloor = (
    x: number,
    z: number,
    scale: number,
    yaw: number,
    tone: "deep" | "peaceful" | "ancient",
  ) => {
    const y = sampleTerrainHeight(x, z);
    const shadow = makeCanopyShadowPatch(
      scale,
      tone === "peaceful" ? forestGroveProps.shadowWarm : forestGroveProps.shadowDeep,
      tone === "peaceful" ? 0.12 : tone === "ancient" ? 0.2 : 0.24,
    );
    shadow.position.set(x, y + 0.036, z);
    shadow.rotation.y = yaw;
    group.add(shadow);

    for (let i = 0; i < (tone === "peaceful" ? 5 : 4); i += 1) {
      const angle = yaw + i * 1.38 + forestHash(x, z, 1800 + i) * 0.42;
      const radius = scale * (1.2 + (i % 3) * 0.62);
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      const py = sampleTerrainHeight(px, pz);
      if (!isInsideIslandPlayableBounds(px, pz)) {
        continue;
      }
      const propYaw = forestHash(px, pz, 1810 + i) * Math.PI * 2;
      props.addMossPatch(
        px,
        py + 0.04,
        pz,
        propYaw,
        scale * (tone === "peaceful" ? 0.48 : 0.62),
        tone === "ancient" ? forestGroveProps.mossGlow : tone === "deep" ? forestGroveProps.fern : grasslandProps.understory.clover,
      );
      if (tone === "peaceful") {
        props.addFlower(px + Math.cos(propYaw) * 0.7, py, pz + Math.sin(propYaw) * 0.7, propYaw, forestGroveProps.flower, 0.48 * scale, 0.68);
      } else if (i % 2 === 0) {
        props.addMushroom(px, py, pz, propYaw, 0.58 * scale, forestGroveProps.mushroomCap);
      } else {
        props.addGrassClump(px, py + 0.02, pz, propYaw, 0.72 * scale, forestGroveProps.fern);
      }
    }
  };

  const addVariantTree = (
    x: number,
    z: number,
    scale: number,
    kind: "round" | "pine" | "birch",
    tone: string,
    seed: number,
  ) => {
    const y = sampleTerrainHeight(x, z);
    const habitat = sampleHabitatLayer(x, z, y);
    const slope = 1 - sampleTerrainNormal(x, z).y;
    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    if (
      wetness > 0.42 ||
      slope > (kind === "pine" ? 0.42 : 0.34) ||
      (habitat.meadow > 0.9 && habitat.edge < 0.16) ||
      shouldSkipLargeRouteTree(kind, x, z, scale)
    ) {
      return;
    }
    const tree =
      kind === "birch" ? makeBirchGroveTree(scale, tone) :
      kind === "pine" ? makePineTree(scale, tone) :
      makeRoundTree(scale, tone);
    tree.position.set(x, y, z);
    tree.rotation.y = forestHash(x, z, seed) * Math.PI * 2;
    group.add(tree);
  };

  const anchors = [
    { x: -122, z: -66, scale: 1.18, tone: "deep" },
    { x: 94, z: 22, scale: 1.1, tone: "deep" },
    { x: 54, z: 96, scale: 1.18, tone: "deep" },
    { x: -88, z: -112, scale: 1.06, tone: "peaceful" },
    { x: 108, z: -34, scale: 1.08, tone: "peaceful" },
    { x: -26, z: 76, scale: 1.0, tone: "peaceful" },
    { x: -90, z: 132, scale: 1.12, tone: "ancient" },
    { x: 84, z: 148, scale: 1.16, tone: "ancient" },
  ] as const;

  anchors.forEach((anchor, index) => {
    const yaw = forestHash(anchor.x, anchor.z, 1740 + index) * Math.PI * 2;
    addGroveFloor(anchor.x, anchor.z, anchor.scale, yaw, anchor.tone);

    if (anchor.tone === "deep") {
      addVariantTree(anchor.x - 7 * anchor.scale, anchor.z + 2 * anchor.scale, 0.86 * anchor.scale, "pine", forestGroveProps.deepCanopy, 1860 + index);
      addVariantTree(anchor.x + 8 * anchor.scale, anchor.z - 4 * anchor.scale, 0.74 * anchor.scale, "round", forestGroveProps.deepCanopy, 1870 + index);
      addTerrainObject(makeFallenLog(1.28 * anchor.scale), anchor.x + 2.8 * anchor.scale, anchor.z + 5.6 * anchor.scale, 0.04, yaw + 0.5);
    } else if (anchor.tone === "peaceful") {
      addVariantTree(anchor.x - 6 * anchor.scale, anchor.z - 3 * anchor.scale, 0.72 * anchor.scale, "birch", forestGroveProps.birchCanopy, 1880 + index);
      addVariantTree(anchor.x + 7 * anchor.scale, anchor.z + 3 * anchor.scale, 0.76 * anchor.scale, "round", forestGroveProps.groveCanopy, 1890 + index);
      addVariantTree(anchor.x + 1 * anchor.scale, anchor.z + 8 * anchor.scale, 0.62 * anchor.scale, "round", forestGroveProps.fruitCanopy, 1900 + index);
      const fruitX = anchor.x + Math.cos(yaw + 0.7) * 3.2 * anchor.scale;
      const fruitZ = anchor.z + Math.sin(yaw + 0.7) * 3.2 * anchor.scale;
      props.addBush(fruitX, sampleTerrainHeight(fruitX, fruitZ), fruitZ, yaw, 0.7 * anchor.scale, forestGroveProps.fruitCanopy);
    } else {
      addVariantTree(anchor.x - 8 * anchor.scale, anchor.z + 1 * anchor.scale, 0.84 * anchor.scale, "pine", forestGroveProps.deepCanopy, 1910 + index);
      addTerrainObject(makeCodexRuinMarker(1.12 * anchor.scale), anchor.x + 2 * anchor.scale, anchor.z - 2 * anchor.scale, 0.04, yaw - 0.2);
      addTerrainObject(makeRootRun(1.26 * anchor.scale), anchor.x - 2.8 * anchor.scale, anchor.z + 5.4 * anchor.scale, 0.04, yaw + 0.34);
      addTerrainObject(makeFallenLog(1.04 * anchor.scale), anchor.x + 6 * anchor.scale, anchor.z + 4 * anchor.scale, 0.04, yaw - 0.64);
    }
  });

  // Forest & grove reference: frame the route with side canopies while keeping the path itself open.
  [
    [-58, 58, 0.78, "round", forestGroveProps.groveCanopy],
    [54, 66, 0.82, "round", forestGroveProps.groveCanopy],
    [-66, 96, 0.78, "pine", forestGroveProps.deepCanopy],
    [66, 106, 0.84, "pine", forestGroveProps.deepCanopy],
    [-58, 134, 0.76, "pine", forestGroveProps.deepCanopyDark],
    [62, 144, 0.78, "pine", forestGroveProps.deepCanopy],
    [-44, 170, 0.68, "pine", forestGroveProps.deepCanopyDark],
    [52, 176, 0.7, "pine", forestGroveProps.deepCanopyDark],
  ].forEach(([x, z, scale, kind, tone], index) => {
    addVariantTree(x as number, z as number, scale as number, kind as "round" | "pine" | "birch", tone as string, 1960 + index);
  });

  [
    [-32, 72, 1.3, "peaceful"],
    [30, 88, 1.24, "peaceful"],
    [-42, 116, 1.42, "deep"],
    [42, 128, 1.36, "deep"],
    [-22, 154, 1.18, "ancient"],
    [30, 166, 1.16, "ancient"],
  ].forEach(([x, z, scale, tone], index) => {
    const yaw = forestHash(x as number, z as number, 2010 + index) * Math.PI * 2;
    addGroveFloor(x as number, z as number, scale as number, yaw, tone as "deep" | "peaceful" | "ancient");
  });

  [
    [-46, 82, 1.22, -0.28],
    [38, 104, 1.08, 0.24],
    [-54, 128, 1.26, -0.16],
    [50, 148, 1.14, 0.34],
    [-18, 176, 0.96, -0.2],
  ].forEach(([x, z, scale, yaw]) => {
    addTerrainObject(makeFernPatch(scale, z > 140 ? "#587a4c" : forestGroveProps.fern), x, z, 0.05, yaw);
  });

  [
    [-52, 94, 0.68, -0.34],
    [44, 116, 0.6, 0.28],
    [-62, 148, 0.72, -0.14],
    [52, 162, 0.64, 0.48],
  ].forEach(([x, z, scale, yaw], index) => {
    addTerrainObject(makeRockFormation(scale, index % 2 === 0 ? "#9b9b82" : "#aaa58d"), x, z, 0, yaw);
    addTerrainObject(makeMossPatch(scale * 0.52, forestGroveProps.mossGlow), x + 1.5 * scale, z - 0.7 * scale, 0.04, yaw + 0.3);
  });

  [
    [-26, 104, 0.72, 0.22],
    [28, 140, 0.66, -0.38],
    [-36, 162, 0.58, 0.5],
  ].forEach(([x, z, scale, yaw]) => {
    addTerrainObject(makeMossyStump(scale), x, z, 0.02, yaw);
  });

  [
    [-18, 82, 1.16, -0.18],
    [16, 116, 1.04, 0.2],
    [-8, 150, 0.94, -0.08],
  ].forEach(([x, z, scale, yaw]) => {
    addTerrainObject(makeWoodlandLightShaft(scale), x, z, 0.08, yaw);
  });

  [
    [-18, 96, 0.58, -0.12, forestGroveProps.flower],
    [22, 122, 0.5, 0.3, forestGroveProps.flowerLavender],
    [-28, 142, 0.46, -0.22, "#f6d86f"],
    [20, 160, 0.42, 0.18, "#fff5d4"],
  ].forEach(([x, z, scale, yaw, flowerTone]) => {
    addTerrainObject(makeAlpineHerbCluster(scale as number, flowerTone as string), x as number, z as number, 0.04, yaw as number);
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
    [-34, 30, 1.08, "lowland", "none"],
    [38, 42, 1.04, "lowland", "none"],
    [-78, 58, 1.08, "foothill", "pine"],
    [76, 72, 1.12, "foothill", "pine"],
    [24, 94, 1.2, "foothill", "none"],
    [-56, 108, 1.08, "foothill", "pine"],
    [62, 114, 1.18, "foothill", "pine"],
    [-48, 132, 1.08, "foothill", "none"],
    [72, 138, 1.18, "foothill", "pine"],
    [-12, 148, 1.16, "foothill", "none"],
    [-42, 160, 1.02, "foothill", "pine"],
    [54, 168, 1.08, "foothill", "pine"],
    [-42, 184, 0.92, "foothill", "none"],
    [44, 194, 0.94, "foothill", "none"],
    [14, 206, 1.02, "foothill", "none"],
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
      0.96 * scale,
      z > 126 ? "#465142" : z > 48 ? "#4e6046" : "#5a7148",
      z > 126 ? 0.15 : 0.18,
    );
    shadow.position.set(x + Math.cos(index * 0.7) * 1.5 * scale, y + 0.032, z - Math.sin(index * 0.8) * 1.3 * scale);
    shadow.rotation.y = forestHash(x, z, 705 + index) * Math.PI * 2;
    group.add(shadow);

    if (
      treeKind === "none" ||
      habitat.meadow > 0.78 ||
      habitat.shore > 0.54 ||
      shouldSkipLargeRouteTree(treeKind as "round" | "pine", x, z, scale)
    ) {
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
    { id: "silver-braid", stations: [-110, -88, -64], scale: 0.62 },
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
    const accentCount = pool.id === "great-lake" ? 16 : pool.id === "opening-lake" ? 8 : 4;
    for (let i = 0; i < accentCount; i += 1) {
      const angle = (i / accentCount) * Math.PI * 2 + poolIndex * 0.47;
      const rimJitter = forestHash(pool.x + i, pool.z - i, 330 + poolIndex) * 0.1 + 0.98;
      const x = pool.x + Math.cos(angle) * pool.renderRadiusX * rimJitter;
      const z = pool.z + Math.sin(angle) * pool.renderRadiusZ * rimJitter;
      addAccent(
        x,
        z,
        pool.id === "great-lake" ? 0.96 : pool.id === "opening-lake" ? 0.9 : 0.72,
        pool.id === "great-lake" ? (i % 4 === 0 ? "pebble" : "reed") : i % 3 === 0 ? "pebble" : "reed",
        340 + i,
      );
      if (i % 2 === 0 || pool.id === "opening-lake") {
        const washAngle = angle + Math.PI * 0.5;
        const washX = pool.x + Math.cos(angle) * pool.renderRadiusX * (0.9 + rimJitter * 0.08);
        const washZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * (0.9 + rimJitter * 0.08);
        addBankWash(washX, washZ, pool.id === "great-lake" ? 0.94 : pool.id === "opening-lake" ? 0.88 : 0.62, washAngle, 360 + poolIndex * 20 + i);
        addShoreShelf(
          pool.x + Math.cos(angle) * pool.renderRadiusX * (0.96 + rimJitter * 0.05),
          pool.z + Math.sin(angle) * pool.renderRadiusZ * (0.96 + rimJitter * 0.05),
          pool.id === "great-lake" ? 0.9 : pool.id === "opening-lake" ? 0.86 : 0.58,
          washAngle,
          374 + poolIndex * 20 + i,
        );
        addSedgePatch(
          pool.x + Math.cos(angle) * pool.renderRadiusX * (1.04 + rimJitter * 0.04),
          pool.z + Math.sin(angle) * pool.renderRadiusZ * (1.04 + rimJitter * 0.04),
          pool.id === "great-lake" ? 0.78 : pool.id === "opening-lake" ? 0.72 : 0.54,
          390 + poolIndex * 20 + i,
        );
        addLipPebbles(
          pool.x + Math.cos(angle) * pool.renderRadiusX * (1.1 + rimJitter * 0.04),
          pool.z + Math.sin(angle) * pool.renderRadiusZ * (1.1 + rimJitter * 0.04),
          pool.id === "great-lake" ? 0.68 : pool.id === "opening-lake" ? 0.62 : 0.46,
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
  group.userData.artDirection = ART_DIRECTION_IDS.grasslands;

  const addTerrainObject = (object: Object3D, x: number, z: number, yOffset: number, yaw: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    object.position.set(x, sampleTerrainHeight(x, z) + yOffset, z);
    object.rotation.y = yaw;
    group.add(object);
  };

  const addGrasslandSignpost = (x: number, z: number, scale: number, yaw: number) => {
    const object = makeGrasslandSignpost(scale);
    addTerrainObject(object, x, z, 0.02, yaw);
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
    const shelfTone =
      tone === "alpine" ? grasslandProps.bank.alpineShelf :
      tone === "cool" ? grasslandProps.bank.coolShelf :
      grasslandProps.bank.warmShelf;
    const washTone =
      tone === "alpine" ? grasslandProps.bank.alpineWash :
      tone === "cool" ? grasslandProps.bank.coolWash :
      grasslandProps.bank.warmWash;
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
      tone === "alpine" ? grasslandProps.bank.alpinePebble : grasslandProps.bank.warmPebble,
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
    if (
      wetness > 0.4 ||
      slope > (kind === "pine" ? 0.42 : 0.34) ||
      habitat.meadow > 0.88 ||
      shouldSkipLargeRouteTree(kind, x, z, scale)
    ) {
      return;
    }

    const tree = kind === "round" ? makeRoundTree(scale, color) : makePineTree(scale, color);
    tree.position.set(x, y, z);
    tree.rotation.y = forestHash(x, z, yawSeed) * Math.PI * 2;
    group.add(tree);
  };

  const addHeroMeadowTree = (x: number, z: number, scale: number, color: string, yawSeed: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const slope = 1 - sampleTerrainNormal(x, z).y;
    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    if (wetness > 0.42 || slope > 0.36) {
      return;
    }

    const tree = makeRoundTree(scale, color);
    tree.position.set(x, y, z);
    tree.rotation.y = forestHash(x, z, yawSeed) * Math.PI * 2;
    group.add(tree);

    const shadow = makeCanopyShadowPatch(1.18 * scale, grasslandProps.understory.shadowStart, 0.16);
    shadow.position.set(x + 1.2 * scale, y + 0.034, z - 0.8 * scale);
    shadow.rotation.y = tree.rotation.y + 0.28;
    group.add(shadow);
  };

  const addShoreTree = (x: number, z: number, scale: number, color: string, yawSeed: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const slope = 1 - sampleTerrainNormal(x, z).y;
    const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
    if (wetness < 0.08 || wetness > 0.78 || slope > 0.36) {
      return;
    }

    const tree = makeRoundTree(scale, color);
    tree.position.set(x, y, z);
    tree.rotation.y = forestHash(x, z, yawSeed) * Math.PI * 2;
    group.add(tree);

    const shadow = makeCanopyShadowPatch(1.26 * scale, "#536f45", 0.18);
    shadow.position.set(x + 1.8 * scale, y + 0.04, z - 0.6 * scale);
    shadow.rotation.y = tree.rotation.y + 0.18;
    group.add(shadow);
  };

  const addFlowerDrift = (
    centerX: number,
    centerZ: number,
    radiusX: number,
    radiusZ: number,
    count: number,
    seed: number,
    colors: readonly string[],
  ) => {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + forestHash(centerX, centerZ, seed + i) * 0.38;
      const band = 0.3 + forestHash(centerX, centerZ, seed + i * 5) * 0.7;
      const x = centerX + Math.cos(angle) * radiusX * band + Math.sin(i * 1.7) * 1.4;
      const z = centerZ + Math.sin(angle) * radiusZ * band + Math.cos(i * 1.3) * 1.2;
      if (!isInsideIslandPlayableBounds(x, z)) {
        continue;
      }

      const y = sampleTerrainHeight(x, z);
      const slope = 1 - sampleTerrainNormal(x, z).y;
      const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
      if (slope > 0.28 || wetness > 0.42) {
        continue;
      }

      props.addFlower(
        x,
        y,
        z,
        forestHash(x, z, seed + i * 11) * Math.PI * 2,
        colors[i % colors.length],
        0.5 + forestHash(x, z, seed + i * 13) * 0.22,
        0.62 + forestHash(x, z, seed + i * 17) * 0.16,
      );
    }
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
      tone === "meadow" ? grasslandProps.understory.meadowMoss :
      tone === "shore" ? grasslandProps.understory.shoreMoss :
      tone === "forest" ? grasslandProps.understory.forestMoss :
      tone === "shrine" ? grasslandProps.understory.shrineMoss :
      grasslandProps.understory.highlandMoss;
    const grassColor =
      tone === "meadow" ? grasslandProps.understory.meadowGrass :
      tone === "shore" ? grasslandProps.understory.shoreGrass :
      tone === "forest" ? grasslandProps.understory.forestGrass :
      tone === "shrine" ? grasslandProps.understory.shrineGrass :
      grasslandProps.understory.highlandGrass;
    const bushColor =
      tone === "meadow" ? grasslandProps.understory.meadowBush :
      tone === "shore" ? grasslandProps.understory.shoreBush :
      tone === "forest" ? grasslandProps.understory.forestBush :
      tone === "shrine" ? grasslandProps.understory.shrineBush :
      grasslandProps.understory.highlandBush;

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
      props.addCloverPatch(x + clover.x, y + 0.02, z + clover.z, yaw, 0.34 * scale, grasslandProps.understory.clover);
      props.addFlower(
        x + Math.cos(yaw + 0.8) * 0.9 * scale,
        y,
        z + Math.sin(yaw + 0.8) * 0.9 * scale,
        yaw,
        grasslandProps.understory.flowerPink,
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
        tone === "highland" ? grasslandProps.understory.highlandReed : grasslandProps.understory.shoreReed,
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
        tone === "shrine" ? grasslandProps.understory.shrineRock : grasslandProps.understory.highlandRock,
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
  addShadow(-88, -146, 1.12, grasslandProps.understory.shadowStart, 0.13, 0.22);
  addShadow(-30, -154, 0.92, grasslandProps.understory.shadowStartAlt, 0.1, -0.3);
  addFramingTree(-118, -144, 0.84, "round", grasslandProps.understory.openingRoundTreeA, 900);
  addFramingTree(18, -146, 0.7, "round", grasslandProps.understory.openingRoundTreeB, 901);
  addHeroMeadowTree(-111, -132, 1.08, "#88bb68", 902);
  addGrasslandSignpost(-30, -118, 0.82, 0.34);
  addFlowerDrift(
    -80,
    -132,
    22,
    11,
    34,
    915,
    [grasslandProps.understory.flowerCream, grasslandProps.understory.flowerGold, "#c9b6ff", "#f8d8f0"],
  );
  addFlowerDrift(
    -18,
    -102,
    28,
    13,
    28,
    925,
    [grasslandProps.understory.flowerCream, grasslandProps.understory.flowerGold, "#d7cbff"],
  );
  [
    [-92, -124, 0.82, 0.7],
    [-72, -112, 0.74, 1.4],
    [-42, -118, 0.7, 0.2],
    [4, -120, 0.76, 2.2],
  ].forEach(([x, z, scale, yaw], index) => {
    addUnderstory(x, z, scale, yaw, "meadow");
    props.addFlower(
      x + Math.cos(yaw + index) * 1.2 * scale,
      sampleTerrainHeight(x, z),
      z + Math.sin(yaw + index) * 1.2 * scale,
      yaw + 0.4,
      index % 2 === 0 ? grasslandProps.understory.flowerCream : grasslandProps.understory.flowerGold,
      0.62 * scale,
      0.7,
    );
  });

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

  // 3. Great lake / lower river: broad water, a left shore tree, reeds, and shoreline rocks.
  [
    [-146, -116, 1.02, -0.2],
    [-136, -98, 0.94, 0.86],
    [-112, -92, 0.86, 1.5],
    [-86, -112, 1.04, 2.72],
    [-100, -136, 0.96, -2.35],
    [-128, -138, 0.9, -1.0],
    [-148, -104, 0.82, 0.28],
  ].forEach(([x, z, scale, yaw], index) => {
    addBankRead(x, z, scale, yaw, index % 3 === 0 ? "cool" : "warm");
    addUnderstory(x + Math.sin(index * 0.8) * 1.8, z + Math.cos(index * 1.2) * 1.5, scale * 0.88, yaw + 0.28, "shore");
  });
  addShoreTree(-154, -124, 1.06, "#83b564", 936);
  addShoreTree(-136, -92, 0.82, "#7fad62", 937);
  addFramingTree(-94, -88, 0.66, "round", "#7dab63", 938);
  addFlowerDrift(
    -144,
    -132,
    18,
    9,
    26,
    948,
    [grasslandProps.understory.flowerCream, grasslandProps.understory.flowerPink, grasslandProps.understory.flowerGold],
  );
  [
    [-88, -120, 0.64, 0.44],
    [-104, -92, 0.52, 1.1],
    [-138, -132, 0.58, -0.38],
    [-116, -88, 0.5, 0.82],
  ].forEach(([x, z, scale, yaw], index) => {
    const rock = makeRockFormation(scale, index % 2 === 0 ? "#bdb39a" : "#ccc29e");
    addTerrainObject(rock, x, z, 0, yaw);
  });

  // 4. River bend / creek shore: strengthen both banks at Silver Bend from normal gameplay distance.
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
  addFlowerDrift(
    -36,
    22,
    24,
    16,
    38,
    945,
    [grasslandProps.understory.flowerCream, grasslandProps.understory.flowerGold, "#d7cbff", "#ffffff"],
  );
  addFramingTree(-44, 30, 0.72, "round", grasslandProps.understory.silverBendRoundTreeA, 930);
  addFramingTree(54, 28, 0.7, "round", grasslandProps.understory.silverBendRoundTreeB, 931);
  addHeroMeadowTree(78, 16, 0.82, "#85b866", 932);

  // 5. Forest edge near route: use mature silhouettes at the sides, then understory, not random saplings.
  [
    [-44, 80, 0.58, "pine", grasslandProps.understory.forestPineA, 960],
    [55, 80, 0.62, "pine", grasslandProps.understory.forestPineB, 961],
    [-56, 108, 0.68, "pine", grasslandProps.understory.forestPineDeep, 962],
    [64, 112, 0.7, "pine", grasslandProps.understory.forestPineDeep, 963],
    [-24, 70, 0.55, "round", grasslandProps.understory.forestRoundA, 964],
    [36, 74, 0.56, "round", grasslandProps.understory.forestRoundB, 965],
  ].forEach(([x, z, scale, kind, color, seed]) => {
    addFramingTree(x as number, z as number, scale as number, kind as "round" | "pine", color as string, seed as number);
  });
  [
    [-36, 90, 1.02, 0.2],
    [44, 92, 1.08, 2.4],
    [-46, 116, 0.92, -0.8],
    [54, 118, 0.94, 1.1],
  ].forEach(([x, z, scale, yaw]) => {
    addShadow(x, z, scale, grasslandProps.understory.shadowForest, 0.16, yaw);
    addUnderstory(x, z, scale * 0.84, yaw + 0.36, "forest");
  });

  // 6. Highland creek / small waterfalls: add mossy lips and side trickles around existing water.
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

  // 6b. Right-side meadow plateau: make the travel view read like a soft cliff/ridge edge.
  [
    [84, 58, 1.08, -0.48],
    [98, 78, 1.18, 0.12],
    [112, 104, 1.04, 0.42],
    [72, 92, 0.9, -0.16],
  ].forEach(([x, z, scale, yaw]) => {
    const rock = makeRockFormation(scale, z > 88 ? "#aaa79b" : "#b9b19c");
    addTerrainObject(rock, x, z, 0, yaw);
    addUnderstory(x - 2.4 * scale, z + 1.6 * scale, 0.6 * scale, yaw + 0.36, "highland");
  });
  [
    [126, 82, 0.82, 0.34, "#b2aa94"],
    [72, 128, 0.78, -0.24, "#aaa391"],
    [132, 144, 0.88, 0.48, "#a89f8c"],
  ].forEach(([x, z, scale, yaw, tone]) => {
    const rock = makeRockFormation(scale as number, tone as string);
    addTerrainObject(rock, x as number, z as number, 0, yaw as number);
  });
  addFlowerDrift(
    94,
    70,
    26,
    14,
    32,
    1004,
    [grasslandProps.understory.flowerCream, grasslandProps.understory.flowerGold, "#d7cbff"],
  );
  addFlowerDrift(
    108,
    126,
    30,
    16,
    34,
    1016,
    [grasslandProps.understory.flowerCream, "#f0d865", "#cbb9ff", "#ffffff"],
  );
  addFlowerDrift(
    -26,
    152,
    24,
    12,
    24,
    1028,
    [grasslandProps.understory.flowerCream, "#efe9c8", "#f0d56c"],
  );

  // 7. Shrine approach: pale rocks and restrained greenery frame the final climb.
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
  group.userData.artDirection = ART_DIRECTION_IDS.hillsMountains;

  const addHighlandObject = (object: Object3D, x: number, z: number, yOffset: number, yaw: number) => {
    if (!isInsideIslandPlayableBounds(x, z)) {
      return;
    }
    object.position.set(x, sampleTerrainHeight(x, z) + yOffset, z);
    object.rotation.y = yaw;
    group.add(object);
  };

  const addSparseHighlandTree = (
    x: number,
    z: number,
    scale: number,
    yaw: number,
    kind: "pine" | "round",
    tone: string,
  ) => {
    if (shouldSkipLargeRouteTree(kind, x, z, scale)) {
      return;
    }

    const slope = 1 - sampleTerrainNormal(x, z).y;
    if (slope > 0.42) {
      return;
    }

    const tree = kind === "pine" ? makePineTree(scale, tone) : makeRoundTree(scale, tone);
    addHighlandObject(tree, x, z, 0, yaw);

    if (slope < 0.32) {
      const shadow = makeCanopyShadowPatch(scale * (kind === "pine" ? 0.74 : 1.02), "#515f49", 0.12);
      addHighlandObject(shadow, x + Math.sin(yaw) * 1.6 * scale, z + Math.cos(yaw) * 1.2 * scale, 0.034, yaw + 0.18);
    }
  };

  scenicPockets
    .filter((pocket) => pocket.zone === "foothills" || pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine")
    .forEach((pocket, pocketIndex) => {
      const isHeroOverlook =
        pocket.id === "windstep-shelf" ||
        pocket.id === "cloudback-overlook" ||
        pocket.id === "skyward-ledge-rim";
      const formationCount =
        isHeroOverlook ? 6 :
        pocket.zone === "foothills" ? 3 :
        pocket.zone === "alpine" ? 4 :
        pocket.zone === "ridge" ? 4 :
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

      const mossCount = isHeroOverlook ? 4 : pocket.zone === "foothills" ? 2 : 3;
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
        const pineCount = isHeroOverlook ? 4 : pocket.zone === "foothills" ? 2 : 3;
        for (let i = 0; i < pineCount; i += 1) {
          const { x, z } = scatterAroundPocket(pocket, 430 + pocketIndex * 20 + i, 0.98);
          const y = sampleTerrainHeight(x, z);
          const pineScale = pocket.zone === "foothills" ? 0.74 + i * 0.05 : 0.82 + i * 0.06;
          if (shouldSkipLargeRouteTree("pine", x, z, pineScale)) {
            continue;
          }
          const pine = makePineTree(
            pineScale,
            pocket.zone === "foothills" ? "#6a8c56" : pocket.zone === "alpine" ? "#57744a" : "#4f6845",
          );
          pine.position.set(x, y, z);
          pine.rotation.y = i * 0.8 + pocketIndex * 0.4;
          group.add(pine);
        }
      }

      if (pocket.id === "highland-cascade") {
        const waterfall = makeWaterfallRibbon(32, 9.4);
        waterfall.position.set(pocket.position.x + 10, pocket.position.y + 4, pocket.position.z - 2);
        waterfall.rotation.y = -0.18;
        waterfall.rotation.z = 0.08;
        group.add(waterfall);
        const lowerSpray = makeHighlandSprayCloud(2.6, 0.16);
        lowerSpray.position.set(pocket.position.x + 7.2, pocket.position.y + 4.2, pocket.position.z + 1.8);
        lowerSpray.rotation.y = -0.28;
        group.add(lowerSpray);
        const upperSpray = makeHighlandSprayCloud(1.45, 0.1);
        upperSpray.position.set(pocket.position.x + 11.2, pocket.position.y + 20.5, pocket.position.z - 2.4);
        upperSpray.rotation.y = -0.18;
        group.add(upperSpray);
        for (const [xOffset, zOffset, scale, yaw] of [
          [6.6, 2.6, 3.8, -0.24],
          [11.2, 5.8, 2.8, 0.34],
        ] as const) {
          addHighlandObject(makeHighlandFoamPatch(scale, scale > 3 ? 0.26 : 0.2), pocket.position.x + xOffset, pocket.position.z + zOffset, 0.13, yaw);
        }
        for (const [xOffset, zOffset, scale, yaw] of [
          [-2.8, 7.2, 1.18, -0.36],
          [13.8, 4.4, 0.92, 0.58],
          [4.4, -7.2, 0.84, 1.08],
        ] as const) {
          addHighlandObject(makeHighlandWetStone(scale), pocket.position.x + xOffset, pocket.position.z + zOffset, 0.02, yaw);
        }
        for (const [xOffset, zOffset, scale, yaw] of [
          [-5.4, 6.4, 0.86, -0.18],
          [9.4, 8.2, 0.78, 0.42],
        ] as const) {
          addHighlandObject(makeAlpineHerbCluster(scale, "#fff1b8"), pocket.position.x + xOffset, pocket.position.z + zOffset, 0.05, yaw);
        }
      }

      if (pocket.id === "highland-basin") {
        for (const [xOffset, zOffset, scale, yaw] of [
          [-4.2, -1.2, 2.9, -0.12],
          [3.8, 4.8, 2.35, 0.56],
        ] as const) {
          addHighlandObject(makeHighlandFoamPatch(scale, 0.18), pocket.position.x + xOffset, pocket.position.z + zOffset, 0.12, yaw);
        }
        for (const [xOffset, zOffset, scale, yaw] of [
          [-8.4, 3.4, 1.06, -0.64],
          [7.2, -3.6, 0.94, 0.84],
        ] as const) {
          addHighlandObject(makeHighlandWetStone(scale), pocket.position.x + xOffset, pocket.position.z + zOffset, 0.02, yaw);
        }
        addHighlandObject(makeHighlandSprayCloud(1.35, 0.08), pocket.position.x - 2.2, pocket.position.z - 3.4, 0.42, -0.18);
      }

      if (pocket.id === "fir-gate-entry") {
        for (const [xOffset, zOffset, scale] of [[-7, -1, 0.92], [6, 2, 0.98]] as const) {
          const x = pocket.position.x + xOffset;
          const z = pocket.position.z + zOffset;
          if (shouldSkipLargeRouteTree("pine", x, z, scale)) {
            continue;
          }
          const pine = makePineTree(scale, "#5f804f");
          pine.position.set(
            x,
            sampleTerrainHeight(x, z),
            z,
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
        for (const [xOffset, zOffset, scale, yaw] of [[-4, 6, 0.84, -0.2], [6, 8, 0.72, 0.34]] as const) {
          addHighlandObject(
            makeAlpineHerbCluster(scale, "#fff0b8"),
            pocket.position.x + xOffset,
            pocket.position.z + zOffset,
            0.04,
            yaw,
          );
        }
        for (const [xOffset, zOffset, scale] of [[-12, 4, 0.96], [11, 7, 0.9]] as const) {
          const x = pocket.position.x + xOffset;
          const z = pocket.position.z + zOffset;
          if (shouldSkipLargeRouteTree("pine", x, z, scale)) {
            continue;
          }
          const pine = makePineTree(scale, "#526c47");
          pine.position.set(
            x,
            sampleTerrainHeight(x, z),
            z,
          );
          pine.rotation.y = xOffset * 0.06;
          group.add(pine);
        }
      }

      if (pocket.id === "cloudback-overlook") {
        for (const [xOffset, zOffset, scale] of [[-10, -3, 1.58], [10, 1, 1.44], [0, 8, 1.28]] as const) {
          const rock = makeRockFormation(scale, "#a7a396");
          rock.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset),
            pocket.position.z + zOffset,
          );
          rock.rotation.y = xOffset * 0.06 + zOffset * 0.04;
          group.add(rock);
        }
        addHighlandObject(
          makeCodexRuinMarker(1.08),
          pocket.position.x - 3.6,
          pocket.position.z + 9.4,
          0.02,
          -0.28,
        );
        for (const [xOffset, zOffset, scale] of [[-14, 6, 0.9], [13, 8, 0.86]] as const) {
          const x = pocket.position.x + xOffset;
          const z = pocket.position.z + zOffset;
          if (shouldSkipLargeRouteTree("pine", x, z, scale)) {
            continue;
          }
          const pine = makePineTree(scale, "#4e6643");
          pine.position.set(
            x,
            sampleTerrainHeight(x, z),
            z,
          );
          pine.rotation.y = xOffset * 0.05;
          group.add(pine);
        }
      }

      if (pocket.id === "skyward-ledge-rim") {
        for (const [xOffset, zOffset, scale, tone] of [
          [-12, -2, 1.66, "#a9a59a"],
          [12, 0, 1.58, "#a7a396"],
          [0, 10, 1.36, "#b1aca0"],
        ] as const) {
          const rock = makeRockFormation(scale, tone);
          rock.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset),
            pocket.position.z + zOffset,
          );
          rock.rotation.y = xOffset * 0.05 + zOffset * 0.03;
          group.add(rock);
        }
        for (const [xOffset, zOffset, scale] of [[-15, 8, 0.88], [15, 10, 0.92], [0, 14, 0.82]] as const) {
          const x = pocket.position.x + xOffset;
          const z = pocket.position.z + zOffset;
          if (shouldSkipLargeRouteTree("pine", x, z, scale)) {
            continue;
          }
          const pine = makePineTree(scale, "#4d6542");
          pine.position.set(
            x,
            sampleTerrainHeight(x, z),
            z,
          );
          pine.rotation.y = xOffset * 0.04;
          group.add(pine);
        }
        for (const [xOffset, zOffset, scale, yaw] of [[-7, 3, 1.06, -0.2], [7, 4, 1.02, 0.18]] as const) {
          const shadow = makeCanopyShadowPatch(scale, "#4a5543", 0.14);
          shadow.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset) + 0.028,
            pocket.position.z + zOffset,
          );
          shadow.rotation.y = yaw;
          group.add(shadow);
        }
        addHighlandObject(
          makeCodexCaveMouth(1.08),
          pocket.position.x - 17,
          pocket.position.z + 5,
          0.02,
          0.36,
        );
        for (const [xOffset, zOffset, scale, yaw] of [[-9, 11, 0.78, 0.2], [8, 12, 0.84, -0.3], [2, 16, 0.7, 0.1]] as const) {
          addHighlandObject(
            makeAlpineHerbCluster(scale, "#e7e3c0"),
            pocket.position.x + xOffset,
            pocket.position.z + zOffset,
            0.04,
            yaw,
          );
        }
      }

      if (pocket.id === "ridge-crossing") {
        for (const [xOffset, zOffset, scale] of [[-8, -2, 1.02], [8, 2, 0.98]] as const) {
          const x = pocket.position.x + xOffset;
          const z = pocket.position.z + zOffset;
          if (shouldSkipLargeRouteTree("pine", x, z, scale)) {
            continue;
          }
          const pine = makePineTree(scale, "#4d6743");
          pine.position.set(
            x,
            sampleTerrainHeight(x, z),
            z,
          );
          group.add(pine);
        }
        addHighlandObject(
          makeCodexRuinMarker(0.86),
          pocket.position.x + 12,
          pocket.position.z + 6,
          0.02,
          0.46,
        );
      }
    });

  // Mountain & hill reference: sparse trees, slope rocks, and flower flecks along the highland path.
  [
    [-70, 112, 0.42, -0.28, "pine", "#617c50"],
    [78, 118, 0.4, 0.42, "pine", "#5e784e"],
    [-48, 148, 0.36, -0.62, "pine", "#586f49"],
    [58, 162, 0.34, 0.34, "pine", "#526b46"],
    [-24, 188, 0.32, -0.18, "pine", "#4f6745"],
    [88, 176, 0.26, 0.56, "round", "#789f5b"],
    [-118, 126, 0.34, -0.14, "pine", "#556c49"],
    [118, 142, 0.32, 0.42, "pine", "#536a47"],
    [-92, 206, 0.3, -0.38, "pine", "#4d6342"],
    [104, 218, 0.28, 0.34, "round", "#718f58"],
  ].forEach(([x, z, scale, yaw, kind, tone]) => {
    addSparseHighlandTree(x as number, z as number, scale as number, yaw as number, kind as "pine" | "round", tone as string);
  });

  [
    [-88, 138, 1.14, -0.44, "#b6aa8a"],
    [96, 126, 1.28, 0.32, "#b2a489"],
    [-62, 172, 1.06, 0.2, "#aaa08a"],
    [112, 174, 1.22, -0.28, "#a89d87"],
    [-8, 202, 0.9, 0.54, "#b8b2a3"],
    [74, 96, 0.92, 0.16, "#b4aa90"],
    [-104, 164, 0.96, -0.18, "#a99f8b"],
    [72, 214, 0.84, 0.38, "#b2aca0"],
  ].forEach(([x, z, scale, yaw, tone]) => {
    addHighlandObject(makeRockFormation(scale as number, tone as string), x as number, z as number, 0, yaw as number);
  });

  [
    [-28, 112, 0.78, -0.22, "#fff0b3"],
    [34, 120, 0.74, 0.28, "#f0d865"],
    [-42, 156, 0.7, -0.12, "#e9e5c2"],
    [28, 168, 0.66, 0.36, "#cbb9ff"],
    [-18, 190, 0.58, -0.3, "#efe9c8"],
    [18, 202, 0.54, 0.24, "#f0d56c"],
    [66, 132, 0.64, 0.18, "#fff0b3"],
    [-72, 182, 0.56, -0.26, "#e9e5c2"],
    [54, 226, 0.52, 0.32, "#f0d56c"],
  ].forEach(([x, z, scale, yaw, flowerTone]) => {
    addHighlandObject(makeAlpineHerbCluster(scale as number, flowerTone as string), x as number, z as number, 0.04, yaw as number);
  });

  [
    [-44, 92, 0.86, -0.42],
    [54, 132, 0.76, 0.28],
    [-34, 174, 0.72, -0.18],
    [24, 206, 0.68, 0.32],
  ].forEach(([x, z, scale, yaw]) => {
    addHighlandObject(makeAlpineHerbCluster(scale, z > 168 ? "#e4e2c2" : "#fff0b3"), x, z, 0.04, yaw);
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
      const leaf = markTreeLeafWind(new Mesh(new SphereGeometry((size as number) * 0.92, 10, 8), y > 7.5 ? topMat : color), 0.34);
      leaf.position.set(ox as number, y as number, oz as number);
      tree.add(leaf);
    }
    for (const [y, s, ox, oz] of [
      [4.2, 0.5, 0, 0],
      [5.1, 0.36, 0.6, 0.2],
    ]) {
      const sub = markTreeLeafWind(new Mesh(new SphereGeometry(s as number, 8, 6), color), 0.3);
      sub.position.set(ox as number, y as number, oz as number);
      tree.add(sub);
    }

    for (const y of [2.7, 4.2, 5.7]) {
      const stripe = new Mesh(new SphereGeometry(0.11, 6, 4), blackStripe);
      stripe.scale.set(0.58, 1, 0.08);
      stripe.position.set(0, y, 0.4);
      tree.add(stripe);
    }

    tree.scale.setScalar(LANDMARK_TREE_SIZE_MULTIPLIER);
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
