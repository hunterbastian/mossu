import { MathUtils, Vector2, Vector3 } from "three";

export type AbilityId = "breeze_float";

export type BiomeZone =
  | "plains"
  | "hills"
  | "foothills"
  | "alpine"
  | "ridge"
  | "peak_shrine";

export type HabitatZone = "shore" | "meadow" | "forest";

export interface HabitatLayerSample {
  zone: HabitatZone;
  shore: number;
  meadow: number;
  forest: number;
  clearing: number;
  edge: number;
}

export type LandmarkType =
  | "lone_tree"
  | "arch"
  | "burrow"
  | "river_bend"
  | "cliff_path"
  | "pass"
  | "ridge_shrine"
  | "overlook";

export type ForageableKind = "seed" | "shell" | "moss_tuft" | "berry" | "smooth_stone" | "feather";

export interface WindField {
  direction: Vector2;
  strength: number;
  gust: number;
}

export interface WorldLandmark {
  id: string;
  type: LandmarkType;
  position: Vector3;
  title: string;
  interactionRadius?: number;
  inventoryEntry?: {
    title: string;
    summary: string;
  };
}

export interface WorldForageable {
  id: string;
  kind: ForageableKind;
  position: Vector3;
  title: string;
  summary: string;
  interactionRadius?: number;
}

export interface ShadowPocket {
  id: string;
  position: Vector3;
  radius: number;
  depth: number;
  hue: number;
}

export interface ScenicPocket {
  id: string;
  kind: "meadow_clearing" | "stream_bend" | "moss_hollow" | "overlook";
  zone: BiomeZone;
  position: Vector3;
  radius: number;
}

export interface WaterState {
  kind: "river" | "creek" | "pool";
  surfaceY: number;
  depth: number;
  flowDirection: Vector2;
  flowStrength: number;
  swimAllowed: boolean;
}

export type RiverChannelId = "main" | "meadow-braid" | "silver-braid" | "fir-gate-braid" | "alpine-braid";

export interface RiverChannelSample {
  id: RiverChannelId;
  centerX: number;
  width: number;
  depthScale: number;
  flowStrength: number;
  envelope: number;
}

export interface RiverEdgeSample {
  zone: "dry" | "damp_bank" | "shallow_water" | "swim_water";
  surfaceMask: number;
  dampBankMask: number;
  wetness: number;
  nookMask: number;
  waterDepth: number;
  swimAllowed: boolean;
}

export interface WaterBankShape {
  shelfCut: number;
  coveCut: number;
  sandbarLift: number;
  rimLift: number;
  dampBand: number;
  dryLip: number;
  pebbleBand: number;
}

interface RiverBranchSegment {
  id: Exclude<RiverChannelId, "main">;
  startZ: number;
  endZ: number;
  offset: number;
  width: number;
  depthScale: number;
  flowStrength: number;
}

export interface StartingWaterPool {
  id: string;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  renderRadiusX: number;
  renderRadiusZ: number;
  surfaceOffset: number;
  basinDepth: number;
  shoreDepth: number;
  flowStrength: number;
  flowSpeed: number;
  opacity: number;
  swimAllowed: boolean;
  edgeSoftness: number;
}

const riverCenter = (z: number) => (
  Math.sin(z * 0.014) * 44 +
  Math.sin((z + 120) * 0.007) * 15 -
  18 +
  Math.exp(-(((z + 112) / 44) ** 2)) * 28
);
export const RIVER_BRANCH_SEGMENTS: readonly RiverBranchSegment[] = [
  { id: "meadow-braid", startZ: -74, endZ: 18, offset: 64, width: 24, depthScale: 0.66, flowStrength: 0.34 },
  { id: "fir-gate-braid", startZ: 52, endZ: 132, offset: -78, width: 26, depthScale: 0.72, flowStrength: 0.46 },
  { id: "alpine-braid", startZ: 134, endZ: 214, offset: 68, width: 21, depthScale: 0.64, flowStrength: 0.54 },
] as const;
// Total rendered-water footprint scale. Keep this aligned with waterSystem ribbon width.
export const MAIN_RIVER_RENDER_WIDTH_SCALE = 1.0608;
export const BRANCH_RIVER_RENDER_WIDTH_SCALE = 0.9996;
export const MAIN_RIVER_SURFACE_OFFSET = 4.1;
export const FOOTHILL_CREEK_SURFACE_OFFSET = 1.5;
export const ALPINE_RUNOFF_SURFACE_OFFSET = 1.3;
export const WATERFALL_OUTFLOW_SURFACE_OFFSET = 1.8;
export const OPENING_LAKE_CENTER_X = -34;
export const OPENING_LAKE_CENTER_Z = -112;
export const OPENING_LAKE_RADIUS = 24.5;
export const OPENING_LAKE_SURFACE_OFFSET = 3.8;
export const STARTING_WATER_POOLS: readonly StartingWaterPool[] = [
  {
    id: "opening-lake",
    x: OPENING_LAKE_CENTER_X,
    z: OPENING_LAKE_CENTER_Z,
    radiusX: OPENING_LAKE_RADIUS * 1.18,
    radiusZ: OPENING_LAKE_RADIUS * 1.02,
    renderRadiusX: OPENING_LAKE_RADIUS * 1.38,
    renderRadiusZ: OPENING_LAKE_RADIUS * 1.14,
    surfaceOffset: OPENING_LAKE_SURFACE_OFFSET,
    basinDepth: 8.6,
    shoreDepth: 1.4,
    flowStrength: 0.08,
    flowSpeed: 0.12,
    opacity: 0.9,
    swimAllowed: true,
    edgeSoftness: 0.44,
  },
  {
    id: "burrow-shoal",
    x: -76,
    z: -154,
    radiusX: 12.5,
    radiusZ: 7.4,
    renderRadiusX: 14.8,
    renderRadiusZ: 9.2,
    surfaceOffset: 1.45,
    basinDepth: 3.2,
    shoreDepth: 0.78,
    flowStrength: 0.04,
    flowSpeed: 0.08,
    opacity: 0.82,
    swimAllowed: false,
    edgeSoftness: 0.52,
  },
  {
    id: "sun-mirror-pond",
    x: 2,
    z: -121,
    radiusX: 18,
    radiusZ: 10.8,
    renderRadiusX: 21.2,
    renderRadiusZ: 13,
    surfaceOffset: 2,
    basinDepth: 3.8,
    shoreDepth: 0.95,
    flowStrength: 0.035,
    flowSpeed: 0.07,
    opacity: 0.8,
    swimAllowed: false,
    edgeSoftness: 0.56,
  },
  {
    id: "reed-cove",
    x: -79,
    z: -105,
    radiusX: 15.5,
    radiusZ: 12,
    renderRadiusX: 18.4,
    renderRadiusZ: 14.2,
    surfaceOffset: 2.35,
    basinDepth: 4.6,
    shoreDepth: 1.1,
    flowStrength: 0.045,
    flowSpeed: 0.09,
    opacity: 0.82,
    swimAllowed: false,
    edgeSoftness: 0.54,
  },
] as const;
const ridgePassCenter = (x: number) => Math.exp(-(((x - 12) / 46) ** 2));
const ISLAND_CENTER_X = -6;
const ISLAND_CENTER_Z = 30;
const ISLAND_RADIUS_X = 226;
const ISLAND_RADIUS_Z = 248;
const ISLAND_SUPERELLIPSE_EXPONENT = 3.4;
const ISLAND_EDGE_START = 0.8;
const ISLAND_EDGE_END = 1.03;
const PLAYABLE_ISLAND_LIMIT = 0.95;

function saturate(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smootherStep(edge0: number, edge1: number, x: number) {
  const t = saturate((x - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function sampleRiverBranchEnvelope(segment: RiverBranchSegment, z: number) {
  const length = segment.endZ - segment.startZ;
  const feather = Math.min(28, Math.max(12, length * 0.24));
  return smootherStep(segment.startZ, segment.startZ + feather, z) *
    (1 - smootherStep(segment.endZ - feather, segment.endZ, z));
}

function sampleRiverBranchCenter(segment: RiverBranchSegment, z: number, envelope = sampleRiverBranchEnvelope(segment, z)) {
  const sway = 0.9 + Math.sin(z * 0.032 + segment.offset * 0.08) * 0.06;
  return riverCenter(z) + segment.offset * envelope * sway;
}

function sampleRiverBedCut(x: number, z: number) {
  return sampleRiverChannels(z).reduce((best, channel) => {
    const coreRadius = Math.max(9, channel.width * 0.36);
    const shelfRadius = Math.max(18, channel.width * 0.72);
    const distance = x - channel.centerX;
    const coreFalloff = Math.exp(-((distance / coreRadius) ** 2));
    const shelfFalloff = Math.exp(-((distance / shelfRadius) ** 2));
    const depth = (
      coreFalloff * (8.8 + channel.width * 0.17) +
      shelfFalloff * (1.5 + channel.width * 0.035)
    ) * channel.depthScale * channel.envelope;
    return Math.max(best, depth);
  }, 0);
}

export function sampleRiverChannelAt(id: RiverChannelId, z: number): RiverChannelSample {
  if (id === "main") {
    return {
      id,
      centerX: riverCenter(z),
      width: sampleRiverWidth(z),
      depthScale: 1,
      flowStrength: 0.48,
      envelope: 1,
    };
  }

  const segment = RIVER_BRANCH_SEGMENTS.find((candidate) => candidate.id === id);
  if (!segment) {
    return sampleRiverChannelAt("main", z);
  }

  const envelope = sampleRiverBranchEnvelope(segment, z);
  return {
    id: segment.id,
    centerX: sampleRiverBranchCenter(segment, z, envelope),
    width: segment.width * (0.06 + envelope * 0.94),
    depthScale: segment.depthScale,
    flowStrength: segment.flowStrength,
    envelope,
  };
}

export function sampleRiverChannels(z: number): RiverChannelSample[] {
  const channels: RiverChannelSample[] = [sampleRiverChannelAt("main", z)];
  RIVER_BRANCH_SEGMENTS.forEach((segment) => {
    const channel = sampleRiverChannelAt(segment.id, z);
    if (channel.envelope > 0.015) {
      channels.push(channel);
    }
  });
  return channels;
}

export function sampleRiverChannelCenter(id: RiverChannelId, z: number) {
  return sampleRiverChannelAt(id, z).centerX;
}

export function sampleRiverRenderWidthScale(id: RiverChannelId) {
  return id === "main" ? MAIN_RIVER_RENDER_WIDTH_SCALE : BRANCH_RIVER_RENDER_WIDTH_SCALE;
}

export function sampleRiverSurfaceHalfWidth(channel: RiverChannelSample) {
  return Math.max(0.48, channel.width * sampleRiverRenderWidthScale(channel.id) * 0.5);
}

export function sampleRiverSurfaceMask(x: number, z: number) {
  return sampleRiverChannels(z).reduce((best, channel) => {
    const distance = Math.abs(x - channel.centerX);
    const halfWidth = sampleRiverSurfaceHalfWidth(channel);
    const surface = 1 - smootherStep(halfWidth * 0.92, halfWidth, distance);
    return Math.max(best, surface * channel.envelope);
  }, 0);
}

// Broad dampness mask for grass, forest, wind, and bank shaping; not the gameplay water width.
export function sampleRiverWetness(x: number, z: number) {
  return sampleRiverChannels(z).reduce((best, channel) => {
    const distance = Math.abs(x - channel.centerX);
    const halfWidth = channel.width * 0.5;
    const wetness = 1 - smootherStep(halfWidth * 0.78, halfWidth * 1.28, distance);
    return Math.max(best, wetness * channel.envelope);
  }, 0);
}

export function sampleRiverDampBankMask(x: number, z: number) {
  return sampleRiverWetness(x, z) * (1 - sampleRiverSurfaceMask(x, z));
}

function sampleRiverBankMask(x: number, z: number) {
  return sampleRiverChannels(z).reduce((best, channel) => {
    const distance = Math.abs(x - channel.centerX);
    const halfWidth = channel.width * 0.5;
    const innerBank = smootherStep(halfWidth * 0.86, halfWidth * 1.18, distance);
    const outerBank = 1 - smootherStep(halfWidth * 1.18, halfWidth * 1.92, distance);
    return Math.max(best, innerBank * outerBank * channel.envelope);
  }, 0);
}

function emptyWaterBankShape(): WaterBankShape {
  return {
    shelfCut: 0,
    coveCut: 0,
    sandbarLift: 0,
    rimLift: 0,
    dampBand: 0,
    dryLip: 0,
    pebbleBand: 0,
  };
}

function mergeWaterBankShape(best: WaterBankShape, next: WaterBankShape) {
  best.shelfCut = Math.max(best.shelfCut, next.shelfCut);
  best.coveCut = Math.max(best.coveCut, next.coveCut);
  best.sandbarLift = Math.max(best.sandbarLift, next.sandbarLift);
  best.rimLift = Math.max(best.rimLift, next.rimLift);
  best.dampBand = Math.max(best.dampBand, next.dampBand);
  best.dryLip = Math.max(best.dryLip, next.dryLip);
  best.pebbleBand = Math.max(best.pebbleBand, next.pebbleBand);
  return best;
}

function sampleRiverBankShape(x: number, z: number) {
  return sampleRiverChannels(z).reduce((best, channel) => {
    const distance = Math.abs(x - channel.centerX);
    const side = x >= channel.centerX ? 1 : -1;
    const halfWidth = sampleRiverSurfaceHalfWidth(channel);
    const bankWidth = channel.width * (channel.id === "main" ? 0.86 : 0.68);
    const bankNoise = fbmNoise(z * 0.026 + side * 8.7 + channel.width * 0.01, channel.centerX * 0.018 + side * 4.1, 3) * 0.5 + 0.5;
    const scallop = Math.sin(z * 0.082 + side * 1.9 + channel.centerX * 0.018) * 0.5 + 0.5;
    const coveCenter = halfWidth * (1.08 + bankNoise * 0.2 + scallop * 0.1);
    const shelfCenter = halfWidth * (0.94 + bankNoise * 0.08);
    const rimCenter = halfWidth * (1.42 + bankNoise * 0.18);
    const coveRing = Math.exp(-(((distance - coveCenter) / Math.max(4.2, bankWidth * 0.24)) ** 2));
    const shelfRing = Math.exp(-(((distance - shelfCenter) / Math.max(4.5, bankWidth * 0.3)) ** 2));
    const sandbarRing = Math.exp(-(((distance - halfWidth * (0.72 + scallop * 0.12)) / Math.max(3.8, bankWidth * 0.18)) ** 2));
    const rimRing = Math.exp(-(((distance - rimCenter) / Math.max(3.6, bankWidth * 0.18)) ** 2));
    const outerFade = 1 - smootherStep(halfWidth * 2.1, halfWidth * 2.72, distance);
    const innerWaterFade = 1 - sampleRiverSurfaceMask(x, z) * 0.5;
    const irregularity = 0.72 + bankNoise * 0.42 + scallop * 0.16;
    const envelope = channel.envelope * outerFade;

    return mergeWaterBankShape(best, {
      shelfCut: shelfRing * envelope * (0.64 + bankNoise * 0.28),
      coveCut: coveRing * envelope * innerWaterFade * irregularity,
      sandbarLift: sandbarRing * envelope * (0.26 + scallop * 0.2) * (channel.id === "main" ? 1 : 0.72),
      rimLift: rimRing * envelope * innerWaterFade * (0.52 + bankNoise * 0.3),
      dampBand: Math.max(shelfRing * 0.62, coveRing * 0.74) * envelope,
      dryLip: rimRing * envelope,
      pebbleBand: Math.max(rimRing * 0.84, sandbarRing * 0.42) * envelope,
    });
  }, emptyWaterBankShape());
}

function samplePoolBankShape(x: number, z: number) {
  return STARTING_WATER_POOLS.reduce((best, pool) => {
    const distance = ellipseDistance(x, z, pool.x, pool.z, pool.radiusX, pool.radiusZ);
    if (distance > 1.72) {
      return best;
    }

    const angle = Math.atan2((z - pool.z) / pool.radiusZ, (x - pool.x) / pool.radiusX);
    const edgeNoise = fbmNoise(Math.cos(angle) * 1.8 + pool.x * 0.015, Math.sin(angle) * 1.8 + pool.z * 0.015, 3) * 0.5 + 0.5;
    const scallop = Math.sin(angle * 5.0 + pool.x * 0.02 - pool.z * 0.01) * 0.5 + 0.5;
    const coveCenter = 0.98 + edgeNoise * 0.11 - scallop * 0.05;
    const shelfRing = Math.exp(-(((distance - 0.88) / 0.18) ** 2));
    const coveRing = Math.exp(-(((distance - coveCenter) / 0.16) ** 2));
    const sandbarRing = Math.exp(-(((distance - 0.72 - scallop * 0.07) / 0.12) ** 2));
    const rimRing = Math.exp(-(((distance - 1.16 - edgeNoise * 0.08) / 0.16) ** 2));
    const outerFade = 1 - smootherStep(1.42, 1.72, distance);
    const poolScale = pool.id === "opening-lake" ? 1.18 : 0.82;

    return mergeWaterBankShape(best, {
      shelfCut: shelfRing * outerFade * poolScale * (0.76 + edgeNoise * 0.24),
      coveCut: coveRing * outerFade * poolScale * (0.66 + scallop * 0.28),
      sandbarLift: sandbarRing * outerFade * poolScale * (0.36 + edgeNoise * 0.18),
      rimLift: rimRing * outerFade * poolScale * (0.48 + scallop * 0.24),
      dampBand: Math.max(shelfRing, coveRing) * outerFade,
      dryLip: rimRing * outerFade,
      pebbleBand: Math.max(rimRing * 0.72, sandbarRing * 0.56) * outerFade,
    });
  }, emptyWaterBankShape());
}

export function sampleWaterBankShape(x: number, z: number): WaterBankShape {
  const river = sampleRiverBankShape(x, z);
  const pool = samplePoolBankShape(x, z);
  return mergeWaterBankShape(river, pool);
}

export function sampleRiverNookMask(x: number, z: number) {
  return RIVER_BRANCH_SEGMENTS.reduce((best, segment) => {
    const branch = sampleRiverChannelAt(segment.id, z);
    if (branch.envelope <= 0.04) {
      return best;
    }

    const mainX = riverCenter(z);
    const main = sampleRiverChannelAt("main", z);
    const midpoint = (mainX + branch.centerX) * 0.5;
    const separation = Math.abs(branch.centerX - mainX);
    const dryGap = Math.max(0, separation - main.width * 0.5 - branch.width * 0.5);
    if (dryGap <= 4) {
      return best;
    }

    const lateral = Math.exp(-(((x - midpoint) / Math.max(4.5, dryGap * 0.46)) ** 2));
    const bankClear = (1 - sampleRiverWetness(x, z)) * (0.72 + sampleRiverBankMask(x, z) * 0.28);
    const longGrass = branch.envelope * (0.72 + (Math.sin(z * 0.048 + segment.offset * 0.08) * 0.5 + 0.5) * 0.28);
    return Math.max(best, lateral * bankClear * longGrass);
  }, 0);
}

function quantize(value: number, steps: number) {
  return Math.round(value * steps) / steps;
}

function distanceToSegment2D(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
) {
  const abx = bx - ax;
  const abz = bz - az;
  const abLengthSq = abx * abx + abz * abz;
  if (abLengthSq <= 1e-5) {
    return {
      distance: Math.hypot(px - ax, pz - az),
      t: 0,
      x: ax,
      z: az,
    };
  }

  const t = MathUtils.clamp(((px - ax) * abx + (pz - az) * abz) / abLengthSq, 0, 1);
  const x = ax + abx * t;
  const z = az + abz * t;
  return {
    distance: Math.hypot(px - x, pz - z),
    t,
    x,
    z,
  };
}

function fract(value: number) {
  return value - Math.floor(value);
}

function hash2(x: number, z: number) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123);
}

function valueNoise(x: number, z: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - fx * 2);
  const v = fz * fz * (3 - fz * 2);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const low = MathUtils.lerp(a, b, u);
  const high = MathUtils.lerp(c, d, u);
  return MathUtils.lerp(low, high, v) * 2 - 1;
}

function fbmNoise(x: number, z: number, octaves: number) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let normalizer = 0;

  for (let i = 0; i < octaves; i += 1) {
    value += valueNoise(x * frequency, z * frequency) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.52;
    frequency *= 2.03;
  }

  return normalizer > 0 ? value / normalizer : 0;
}

function ridgedNoise(x: number, z: number, octaves: number) {
  let value = 0;
  let amplitude = 0.56;
  let frequency = 1;
  let normalizer = 0;

  for (let i = 0; i < octaves; i += 1) {
    const ridge = 1 - Math.abs(valueNoise(x * frequency, z * frequency));
    value += ridge * ridge * amplitude;
    normalizer += amplitude;
    amplitude *= 0.48;
    frequency *= 2.18;
  }

  return normalizer > 0 ? value / normalizer : 0;
}

function domainWarp(x: number, z: number, strength: number) {
  const wx = fbmNoise(x * 0.004 + 17.2, z * 0.004 - 8.6, 4) * strength;
  const wz = fbmNoise(x * 0.004 - 42.7, z * 0.004 + 23.4, 4) * strength;
  return {
    x: x + wx,
    z: z + wz,
  };
}

function terrainNoise(x: number, z: number) {
  const warped = domainWarp(x, z, 34);
  const rolling = fbmNoise(warped.x * 0.01, warped.z * 0.01, 5);
  const mid = fbmNoise(warped.x * 0.024 + 11, warped.z * 0.024 - 7, 4);
  const broad = Math.sin(x * 0.012) * Math.cos(z * 0.009) * 0.18;
  return rolling * 0.72 + mid * 0.24 + broad;
}

function mountainRidgeNoise(x: number, z: number) {
  const warped = domainWarp(x + 80, z - 60, 26);
  return ridgedNoise(warped.x * 0.015, warped.z * 0.015, 5);
}

function bowlDepression(x: number, z: number, centerX: number, centerZ: number, radius: number, depth: number) {
  const dist = Math.hypot(x - centerX, z - centerZ);
  if (dist >= radius) {
    return 0;
  }
  const t = 1 - dist / radius;
  return -(t * t) * depth;
}

function ellipseDistance(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number) {
  return Math.hypot((x - centerX) / radiusX, (z - centerZ) / radiusZ);
}

function ellipticalDepressionCut(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
  depth: number,
) {
  const distance = ellipseDistance(x, z, centerX, centerZ, radiusX, radiusZ);
  if (distance >= 1) {
    return 0;
  }

  const t = 1 - distance;
  return t * t * depth;
}

function sampleRouteTerraceLift(x: number, z: number) {
  return ROUTE_TERRACE_SEGMENTS.reduce((best, [ax, az, bx, bz, width, lift], index) => {
    const segment = distanceToSegment2D(x, z, ax, az, bx, bz);
    const core = 1 - smootherStep(width * 0.16, width * 0.54, segment.distance);
    const shoulder = smootherStep(width * 0.42, width * 0.76, segment.distance) *
      (1 - smootherStep(width * 0.86, width * 1.34, segment.distance));
    const stepRhythm = Math.sin(segment.t * Math.PI * 1.7 + index * 0.58) * 0.5 + 0.5;
    const terrace = core * lift * 0.52 + shoulder * lift * (0.48 + stepRhythm * 0.14);
    return Math.max(best, terrace);
  }, 0);
}

function sampleStartingWaterBasinCut(x: number, z: number) {
  return STARTING_WATER_POOLS.reduce((best, pool) => {
    const basin = ellipticalDepressionCut(x, z, pool.x, pool.z, pool.radiusX, pool.radiusZ, pool.basinDepth);
    const shoreDistance = ellipseDistance(x, z, pool.x, pool.z, pool.radiusX * 1.42, pool.radiusZ * 1.42);
    const shoreCut = shoreDistance < 1
      ? (1 - smootherStep(0.62, 1, shoreDistance)) * pool.shoreDepth
      : 0;
    return Math.max(best, basin + shoreCut);
  }, 0);
}

export function sampleStartingWaterSurfaceMask(x: number, z: number) {
  return STARTING_WATER_POOLS.reduce((best, pool) => {
    const distance = ellipseDistance(x, z, pool.x, pool.z, pool.radiusX, pool.radiusZ);
    const surface = 1 - smootherStep(0.9, 1, distance);
    return Math.max(best, surface);
  }, 0);
}

export function sampleStartingWaterWetness(x: number, z: number) {
  return STARTING_WATER_POOLS.reduce((best, pool) => {
    const distance = ellipseDistance(x, z, pool.x, pool.z, pool.radiusX * 1.34, pool.radiusZ * 1.34);
    const wetness = 1 - smootherStep(0.74, 1, distance);
    return Math.max(best, wetness);
  }, 0);
}

export function sampleStartingWaterDampBankMask(x: number, z: number) {
  const bankShape = samplePoolBankShape(x, z);
  return Math.max(sampleStartingWaterWetness(x, z) * (1 - sampleStartingWaterSurfaceMask(x, z)), bankShape.dampBand * 0.5);
}

function sampleStartingWaterBankLipLift(x: number, z: number) {
  return STARTING_WATER_POOLS.reduce((best, pool) => {
    const distance = ellipseDistance(x, z, pool.x, pool.z, pool.radiusX * 1.1, pool.radiusZ * 1.1);
    const innerRim = smootherStep(0.78, 1.02, distance);
    const outerFade = 1 - smootherStep(1.02, 1.42, distance);
    const handPaintedBreakup = 0.82 + fbmNoise(x * 0.033 + 12.8, z * 0.033 - 6.1, 2) * 0.18;
    const lift = pool.id === "opening-lake" ? 1.05 : 0.58;
    return Math.max(best, innerRim * outerFade * handPaintedBreakup * lift);
  }, 0);
}

function sampleIslandContour(x: number, z: number) {
  const nx = Math.abs((x - ISLAND_CENTER_X) / ISLAND_RADIUS_X);
  const nz = Math.abs((z - ISLAND_CENTER_Z) / ISLAND_RADIUS_Z);
  return Math.pow(
    Math.pow(nx, ISLAND_SUPERELLIPSE_EXPONENT) + Math.pow(nz, ISLAND_SUPERELLIPSE_EXPONENT),
    1 / ISLAND_SUPERELLIPSE_EXPONENT,
  );
}

const ROUTE_TERRACE_SEGMENTS = [
  [-58, -158, -44, -134, 18, 0.55],
  [-44, -134, -4, -38, 26, 0.42],
  [-4, -38, riverCenter(24), 24, 24, 0.48],
  [riverCenter(24), 24, 24, 88, 22, 0.6],
  [24, 88, 20, 108, 18, 0.72],
  [20, 108, 42, 134, 20, 0.68],
  [42, 134, 10, 154, 18, 0.64],
  [10, 154, -26, 168, 18, 0.52],
  [-26, 168, 16, 186, 16, 0.46],
  [16, 186, 2, 214, 15, 0.38],
] as const;

const PAINTED_GROUND_CLEARINGS = [
  [-44, -134, 22, 0.42],
  [-4, -38, 20, 0.34],
  [24, 88, 24, 0.32],
  [20, 108, 18, 0.28],
  [42, 134, 19, 0.28],
  [10, 154, 20, 0.24],
  [-26, 168, 18, 0.24],
  [16, 186, 17, 0.22],
  [2, 214, 20, 0.26],
] as const;

function sampleRoutePathInfo(x: number, z: number) {
  return ROUTE_TERRACE_SEGMENTS.reduce((best, [ax, az, bx, bz, width], index) => {
    const segment = distanceToSegment2D(x, z, ax, az, bx, bz);
    const core = 1 - smootherStep(width * 0.18, width * 0.54, segment.distance);
    const paint = 1 - smootherStep(width * 0.36, width * 1.02, segment.distance);
    const shoulder = smootherStep(width * 0.46, width * 0.76, segment.distance) *
      (1 - smootherStep(width * 0.9, width * 1.36, segment.distance));
    const score = paint + core * 0.35 + shoulder * 0.16;
    return score > best.score
      ? {
        score,
        core,
        paint,
        shoulder,
        distance: segment.distance,
        t: segment.t,
        segmentIndex: index,
      }
      : best;
  }, {
    score: 0,
    core: 0,
    paint: 0,
    shoulder: 0,
    distance: Infinity,
    t: 0,
    segmentIndex: -1,
  });
}

function sampleRouteSmoothMask(x: number, z: number) {
  const route = sampleRoutePathInfo(x, z);
  const breakup = fbmNoise(x * 0.04 + 9.2, z * 0.04 - 13.7, 2) * 0.12;
  return saturate(route.core * 0.86 + route.paint * 0.28 + route.shoulder * 0.18 + breakup);
}

export function samplePaintedGroundMask(x: number, z: number) {
  const route = sampleRoutePathInfo(x, z);
  const routeBreakup = 0.82 + fbmNoise(x * 0.038 - 4.2, z * 0.038 + 6.1, 3) * 0.18;
  const pocketClear = PAINTED_GROUND_CLEARINGS.reduce((best, [cx, cz, radius, strength]) => {
    const distance = Math.hypot(x - cx, z - cz);
    const clear = 1 - smootherStep(radius * 0.42, radius * 0.96, distance);
    return Math.max(best, clear * strength);
  }, 0);
  const bankShape = sampleWaterBankShape(x, z);
  const shoreWear = Math.max(sampleRiverDampBankMask(x, z), sampleStartingWaterDampBankMask(x, z), bankShape.dampBand) * 0.46;
  return saturate(route.paint * routeBreakup + route.shoulder * 0.36 + pocketClear + shoreWear);
}

export function sampleIslandEdgeFactor(x: number, z: number) {
  return smootherStep(ISLAND_EDGE_START, ISLAND_EDGE_END, sampleIslandContour(x, z));
}

export function isInsideIslandPlayableBounds(x: number, z: number) {
  return sampleIslandContour(x, z) < PLAYABLE_ISLAND_LIMIT;
}

export function sampleIslandBoundaryPoint(angle: number) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const denom = Math.pow(
    Math.pow(Math.abs(cos), ISLAND_SUPERELLIPSE_EXPONENT) + Math.pow(Math.abs(sin), ISLAND_SUPERELLIPSE_EXPONENT),
    1 / ISLAND_SUPERELLIPSE_EXPONENT,
  );
  const scale = denom > 0 ? 1 / denom : 1;
  return new Vector3(
    ISLAND_CENTER_X + cos * ISLAND_RADIUS_X * scale,
    0,
    ISLAND_CENTER_Z + sin * ISLAND_RADIUS_Z * scale,
  );
}

export function sampleBaseTerrainHeight(x: number, z: number) {
  const highlandMask = smootherStep(58, 188, z);
  const routeSmooth = sampleRouteSmoothMask(x, z);
  const bankShape = sampleWaterBankShape(x, z);
  const rolling = terrainNoise(x, z) * (7.2 + highlandMask * 2.4) * (1 - routeSmooth * 0.36);
  const ridgeTexture = mountainRidgeNoise(x, z) * highlandMask;
  const peakCarve = (ridgeTexture - 0.34) * 24 * smootherStep(90, 214, z) * (1 - routeSmooth * 0.42);
  const fineSurface = fbmNoise(x * 0.045 - 3.4, z * 0.045 + 5.2, 3) * (0.9 + highlandMask * 1.9) * (1 - routeSmooth * 0.78);
  const meadowLift = 11 + Math.sin(z * 0.01) * 2.2;
  const riverCut = sampleRiverBedCut(x, z);
  const riverNookLift = sampleRiverNookMask(x, z) * 4.2;
  const riverBankLift = sampleRiverBankMask(x, z) * 1.25;
  const wetBankTerrace =
    Math.max(sampleRiverDampBankMask(x, z), sampleStartingWaterDampBankMask(x, z), bankShape.dampBand) *
    (0.58 + fbmNoise(x * 0.036 + 8.4, z * 0.036 - 4.2, 2) * 0.14);
  const startingWaterBankLip = sampleStartingWaterBankLipLift(x, z) * 0.72;
  const dryBankLip =
    sampleRiverBankMask(x, z) * (1 - sampleRiverSurfaceMask(x, z) * 0.75) * (0.52 + highlandMask * 0.44) +
    sampleStartingWaterDampBankMask(x, z) * (1 - sampleStartingWaterSurfaceMask(x, z) * 0.72) * 0.62 +
    bankShape.rimLift * (0.72 + highlandMask * 0.34);
  const bankShelfCut = bankShape.shelfCut * (1.05 + highlandMask * 0.32);
  const coveCut = bankShape.coveCut * (0.78 + highlandMask * 0.22);
  const sandbarLift = bankShape.sandbarLift * (0.46 + highlandMask * 0.18);
  const routeTerraceLift = sampleRouteTerraceLift(x, z) * (1 - sampleStartingWaterSurfaceMask(x, z) * 0.5);
  const routeSurfacePress = samplePaintedGroundMask(x, z) * (0.34 + highlandMask * 0.28) * (1 - sampleStartingWaterSurfaceMask(x, z) * 0.72);
  const hillBand = smootherStep(-170, 10, z) * 10;
  const foothillBand = smootherStep(-10, 95, z) * 18;
  const mountainMass =
    Math.exp(-(((x + 12) / 110) ** 2) - (((z - 174) / 92) ** 2)) * 96 +
    Math.exp(-(((x - 84) / 90) ** 2) - (((z - 140) / 88) ** 2)) * 44 +
    Math.exp(-(((x + 118) / 72) ** 2) - (((z - 118) / 78) ** 2)) * 28;
  const ridgeWall = smootherStep(78, 182, z) * 26 * (1 - ridgePassCenter(x));
  const shrineShelf = Math.exp(-(((x + 2) / 28) ** 2) - (((z - 214) / 20) ** 2)) * 18;
  const paintedSteps = quantize(Math.sin((x - z) * 0.028) * 0.5 + 0.5, 7) * 2.4;
  const alpineShelf = smootherStep(118, 195, z) * paintedSteps * (1 - routeSmooth * 0.62);
  const startBurrow = bowlDepression(x, z, -44, -134, 15, 12);
  const startingWaterBasin = sampleStartingWaterBasinCut(x, z);
  const mountainHollow = bowlDepression(x, z, 38, 128, 20, 10);
  const pineGateRise = Math.exp(-(((x - 24) / 34) ** 2) - (((z - 88) / 28) ** 2)) * 9;
  const passShelf = Math.exp(-(((x - 20) / 30) ** 2) - (((z - 108) / 24) ** 2)) * 11;
  const cascadeShelf = Math.exp(-(((x - 34) / 28) ** 2) - (((z - 130) / 22) ** 2)) * 14;
  const traverseShelf = Math.exp(-(((x - 10) / 34) ** 2) - (((z - 154) / 26) ** 2)) * 11;
  const ridgeLead = Math.exp(-(((x - 14) / 24) ** 2) - (((z - 186) / 18) ** 2)) * 8;
  return meadowLift + rolling + fineSurface + peakCarve + hillBand + foothillBand + mountainMass + ridgeWall + shrineShelf + alpineShelf + pineGateRise + passShelf + cascadeShelf + traverseShelf + ridgeLead + riverNookLift + riverBankLift + wetBankTerrace + startingWaterBankLip + dryBankLip + sandbarLift + routeTerraceLift - routeSurfacePress - bankShelfCut - coveCut - riverCut + startBurrow - startingWaterBasin + mountainHollow;
}

export function sampleTerrainHeight(x: number, z: number) {
  const baseHeight = sampleBaseTerrainHeight(x, z);
  const edgeFactor = sampleIslandEdgeFactor(x, z);
  const cliffDrop = edgeFactor * edgeFactor * (54 + edgeFactor * 286);
  return baseHeight - cliffDrop;
}

export function sampleIslandVoidThreshold(x: number, z: number) {
  const edgeFactor = sampleIslandEdgeFactor(x, z);
  return sampleBaseTerrainHeight(x, z) - 22 - edgeFactor * 120;
}

export function sampleTerrainNormal(x: number, z: number) {
  const eps = 0.5;
  const hL = sampleTerrainHeight(x - eps, z);
  const hR = sampleTerrainHeight(x + eps, z);
  const hD = sampleTerrainHeight(x, z - eps);
  const hU = sampleTerrainHeight(x, z + eps);
  const normal = new Vector3(hL - hR, eps * 2, hD - hU);
  return normal.normalize();
}

export function sampleRiverCenter(z: number) {
  return riverCenter(z);
}

export function sampleRiverWidth(z: number) {
  const lowerMeadow = smootherStep(-170, -96, z) * (1 - smootherStep(-20, 42, z));
  const centralValley = smootherStep(-72, 44, z) * (1 - smootherStep(154, 224, z));
  const foothillBroad = smootherStep(36, 108, z) * (1 - smootherStep(142, 204, z));
  const alpineTaper = smootherStep(166, 236, z);
  return 38 + (Math.sin(z * 0.019) * 0.5 + 0.5) * 10 + lowerMeadow * 3 + centralValley * 6 + foothillBroad * 5 - alpineTaper * 5;
}

interface CreekPath {
  kind: "creek";
  points: readonly (readonly [number, number])[];
  width: number;
  surfaceOffset: number;
  flowStrength: number;
  swimAllowed: boolean;
}

export interface HighlandCreekPath extends CreekPath {
  id: string;
  profile: "foothillCreek" | "alpineRunoff" | "waterfallOutflow";
  opacity: number;
}

export const HIGHLAND_CREEK_PATHS: readonly HighlandCreekPath[] = [
  {
    id: "fir-gate-brook",
    kind: "creek",
    profile: "foothillCreek",
    points: [
      [31, 108],
      [24, 92],
      [23, 78],
      [29, 62],
      [34, 48],
    ],
    width: 2.7,
    surfaceOffset: FOOTHILL_CREEK_SURFACE_OFFSET,
    flowStrength: 0.34,
    swimAllowed: false,
    opacity: 0.48,
  },
  {
    id: "mistfall-runoff",
    kind: "creek",
    profile: "waterfallOutflow",
    points: [
      [10, 154],
      [23, 148],
      [36, 138],
      [40, 128],
      [46, 116],
    ],
    width: 3.4,
    surfaceOffset: WATERFALL_OUTFLOW_SURFACE_OFFSET,
    flowStrength: 0.48,
    swimAllowed: false,
    opacity: 0.52,
  },
  {
    id: "cloudback-rill",
    kind: "creek",
    profile: "alpineRunoff",
    points: [
      [-34, 184],
      [-22, 170],
      [-8, 156],
      [-18, 146],
    ],
    width: 2.2,
    surfaceOffset: ALPINE_RUNOFF_SURFACE_OFFSET,
    flowStrength: 0.42,
    swimAllowed: false,
    opacity: 0.46,
  },
] as const;

const creekPaths: readonly CreekPath[] = HIGHLAND_CREEK_PATHS;

function sampleCreekWater(x: number, z: number): WaterState | null {
  let best: WaterState | null = null;
  let bestDepth = 0;

  for (const creek of creekPaths) {
    for (let i = 0; i < creek.points.length - 1; i += 1) {
      const [ax, az] = creek.points[i];
      const [bx, bz] = creek.points[i + 1];
      const sample = distanceToSegment2D(x, z, ax, az, bx, bz);
      if (sample.distance > creek.width) {
        continue;
      }

      const surfaceY = sampleTerrainHeight(sample.x, sample.z) + creek.surfaceOffset;
      const depth = surfaceY - sampleTerrainHeight(x, z);
      if (depth <= 0.2 || depth <= bestDepth) {
        continue;
      }

      const flowDirection = new Vector2(bx - ax, bz - az).normalize();
      bestDepth = depth;
      best = {
        kind: creek.kind,
        surfaceY,
        depth,
        flowDirection,
        flowStrength: creek.flowStrength,
        swimAllowed: creek.swimAllowed,
      };
    }
  }

  return best;
}

function samplePoolWater(x: number, z: number): WaterState | null {
  let best: WaterState | null = null;
  let bestDepth = 0;

  for (const pool of STARTING_WATER_POOLS) {
    const distance = ellipseDistance(x, z, pool.x, pool.z, pool.radiusX, pool.radiusZ);
    if (distance > 1) {
      continue;
    }

    const surfaceY = sampleTerrainHeight(pool.x, pool.z) + pool.surfaceOffset;
    const depth = surfaceY - sampleTerrainHeight(x, z);
    if (depth <= 0.2 || depth <= bestDepth) {
      continue;
    }

    const swirlAngle = Math.atan2(z - pool.z, x - pool.x) + Math.PI * 0.5;
    bestDepth = depth;
    best = {
      kind: "pool",
      surfaceY,
      depth,
      flowDirection: new Vector2(Math.cos(swirlAngle), Math.sin(swirlAngle)).normalize(),
      flowStrength: pool.flowStrength,
      swimAllowed: pool.swimAllowed,
    };
  }

  return best;
}

export function sampleWaterState(x: number, z: number): WaterState | null {
  let best: WaterState | null = null;
  let bestDepth = 0;

  for (const channel of sampleRiverChannels(z)) {
    const riverDistance = Math.abs(x - channel.centerX);
    const activeWidth = sampleRiverSurfaceHalfWidth(channel);
    if (riverDistance > activeWidth) {
      continue;
    }

    const surfaceY = sampleTerrainHeight(channel.centerX, z) + MAIN_RIVER_SURFACE_OFFSET;
    const depth = surfaceY - sampleTerrainHeight(x, z);
    if (depth > 0.2 && depth > bestDepth) {
      const tangent = new Vector2(
        sampleRiverChannelCenter(channel.id, z + 1.5) - sampleRiverChannelCenter(channel.id, z - 1.5),
        3,
      ).normalize();
      bestDepth = depth;
      best = {
        kind: "river",
        surfaceY,
        depth,
        flowDirection: tangent,
        flowStrength: channel.flowStrength,
        swimAllowed: depth >= 2.4,
      };
    }
  }

  const creek = sampleCreekWater(x, z);
  if (creek && creek.depth > bestDepth) {
    best = creek;
    bestDepth = creek.depth;
  }

  const pool = samplePoolWater(x, z);
  if (pool && (sampleStartingWaterSurfaceMask(x, z) > 0.82 || pool.depth > bestDepth)) {
    best = pool;
  }

  return best;
}

export function sampleRiverEdgeState(x: number, z: number): RiverEdgeSample {
  const water = sampleWaterState(x, z);
  const surfaceMask = Math.max(sampleRiverSurfaceMask(x, z), sampleStartingWaterSurfaceMask(x, z));
  const dampBankMask = Math.max(sampleRiverDampBankMask(x, z), sampleStartingWaterDampBankMask(x, z));
  const wetness = Math.max(sampleRiverWetness(x, z), sampleStartingWaterWetness(x, z));
  const nookMask = sampleRiverNookMask(x, z);
  const zone =
    water?.swimAllowed ? "swim_water" :
    water ? "shallow_water" :
    dampBankMask > 0.08 ? "damp_bank" :
    "dry";

  return {
    zone,
    surfaceMask,
    dampBankMask,
    wetness,
    nookMask,
    waterDepth: water?.depth ?? 0,
    swimAllowed: water?.swimAllowed ?? false,
  };
}

export function sampleWindStrength(x: number, z: number, height: number) {
  const altitudeBoost = smootherStep(40, 160, height) * 0.65;
  const valleyShield = sampleRiverWetness(x, z) * 0.2 + Math.exp(-(((x - riverCenter(z)) / 30) ** 2)) * 0.08;
  return 0.48 + altitudeBoost - valleyShield + (Math.sin((x + z) * 0.024) * 0.5 + 0.5) * 0.15;
}

export function sampleWindField(x: number, z: number, height: number): WindField {
  const dir = new Vector2(0.92 + Math.sin(z * 0.01) * 0.15, 0.34 + Math.cos(x * 0.012) * 0.11).normalize();
  const strength = sampleWindStrength(x, z, height);
  const gust = (Math.sin(x * 0.043 + z * 0.017) * 0.5 + 0.5) * 0.85;
  return { direction: dir, strength, gust };
}

export function sampleBiomeZone(x: number, z: number, height = sampleTerrainHeight(x, z)): BiomeZone {
  if (height > 178 || z > 206) {
    return "peak_shrine";
  }
  if (height > 150 || z > 166) {
    return "ridge";
  }
  if (height > 118 || z > 122) {
    return "alpine";
  }
  if (height > 48 || z > 42) {
    return "foothills";
  }
  if (z > -70) {
    return "hills";
  }
  return "plains";
}

function sampleScenicMeadowMask(x: number, z: number) {
  return scenicPockets.reduce((best, pocket) => {
    const distance = Math.hypot(x - pocket.position.x, z - pocket.position.z);
    const feather =
      pocket.kind === "meadow_clearing" ? 1.34 :
      pocket.kind === "moss_hollow" ? 0.94 :
      pocket.kind === "stream_bend" ? 0.72 :
      0.62;
    const strength =
      pocket.kind === "meadow_clearing" ? 1 :
      pocket.kind === "moss_hollow" ? 0.38 :
      pocket.kind === "stream_bend" ? 0.22 :
      0.18;
    const mask = 1 - smootherStep(pocket.radius * 0.34, pocket.radius * feather, distance);
    return Math.max(best, mask * strength);
  }, 0);
}

export function sampleHabitatLayer(x: number, z: number, height = sampleTerrainHeight(x, z)): HabitatLayerSample {
  const biome = sampleBiomeZone(x, z, height);
  const slope = 1 - sampleTerrainNormal(x, z).y;
  const route = sampleRoutePathInfo(x, z);
  const edgeState = sampleRiverEdgeState(x, z);
  const bankShape = sampleWaterBankShape(x, z);
  const pocketMeadow = sampleScenicMeadowMask(x, z);
  const lowlandOpen =
    biome === "plains" ? 0.52 :
    biome === "hills" ? 0.42 :
    biome === "foothills" ? 0.22 :
    0.08;
  const shore = saturate(
    edgeState.surfaceMask * 0.34 +
    edgeState.dampBankMask * 0.76 +
    edgeState.wetness * 0.48 +
    edgeState.nookMask * 0.26 +
    bankShape.dampBand * 0.48 +
    bankShape.sandbarLift * 0.24,
  );

  const openingMeadow = Math.exp(-(((x + 44) / 76) ** 2) - (((z + 112) / 72) ** 2));
  const meadowNoise = fbmNoise(x * 0.028 + 5.7, z * 0.028 - 3.1, 3) * 0.5 + 0.5;
  const meadow = saturate(
    pocketMeadow * 0.9 +
    openingMeadow * 0.52 +
    route.paint * 0.28 +
    route.shoulder * 0.2 +
    lowlandOpen * (0.3 + meadowNoise * 0.18) -
    shore * 0.42 -
    slope * 0.5,
  );

  const forestNoise = fbmNoise(x * 0.018 - 9.4, z * 0.018 + 2.3, 4) * 0.5 + 0.5;
  const forestBreakup = fbmNoise(x * 0.06 + 11.2, z * 0.06 - 7.8, 2) * 0.5 + 0.5;
  const lowlandRim = smootherStep(58, 148, Math.abs(x)) * smootherStep(-134, 44, z) * (1 - smootherStep(52, 96, z));
  const firGate = smootherStep(34, 138, z) * (1 - smootherStep(206, 236, z));
  const highlandPocket = Math.exp(-(((x + 2) / 104) ** 2) - (((z - 148) / 112) ** 2));
  const authoredGroves = Math.max(
    Math.exp(-(((x + 126) / 58) ** 2) - (((z + 78) / 62) ** 2)),
    Math.exp(-(((x - 108) / 62) ** 2) - (((z - 40) / 70) ** 2)),
    Math.exp(-(((x + 86) / 70) ** 2) - (((z - 132) / 78) ** 2)),
    Math.exp(-(((x - 84) / 68) ** 2) - (((z - 144) / 78) ** 2)),
  );
  const clearing = saturate(meadow * 0.72 + shore * 0.44 + route.core * 0.56 + route.paint * 0.18);
  const forest = saturate(
    Math.max(lowlandRim * 0.74, firGate * 0.52, highlandPocket * 0.58, authoredGroves * 0.82) +
    smootherStep(0.46, 0.72, forestNoise) * 0.42 +
    forestBreakup * 0.12 -
    clearing * 0.72 -
    openingMeadow * 0.4 -
    shore * 0.52 -
    slope * 0.18,
  );
  const edge = saturate(
    (1 - Math.abs(forest - 0.48) * 2.2) * smootherStep(0.18, 0.42, forest) +
    meadow * forest * 0.42 +
    route.shoulder * 0.24,
  );
  const zone =
    shore > 0.48 ? "shore" :
    forest > Math.max(0.32, meadow + 0.08) ? "forest" :
    "meadow";

  return { zone, shore, meadow, forest, clearing, edge };
}

export function sampleHabitatZone(x: number, z: number, height = sampleTerrainHeight(x, z)): HabitatZone {
  return sampleHabitatLayer(x, z, height).zone;
}

export function sampleHabitatMask(x: number, z: number, zone: HabitatZone, height = sampleTerrainHeight(x, z)) {
  return sampleHabitatLayer(x, z, height)[zone];
}

export function isGrassZone(zone: BiomeZone) {
  return zone !== "peak_shrine";
}

export function sampleGrassDensity(x: number, z: number) {
  const height = sampleTerrainHeight(x, z);
  const zone = sampleBiomeZone(x, z, height);
  const habitat = sampleHabitatLayer(x, z, height);
  const slope = 1 - sampleTerrainNormal(x, z).y;
  if (!isGrassZone(zone) || slope > 0.58) {
    return 0;
  }

  const riverGap = sampleRiverWetness(x, z);
  const riverNook = sampleRiverNookMask(x, z);
  const riverBank = sampleRiverBankMask(x, z) * (1 - riverGap);
  const lakeGap = sampleStartingWaterWetness(x, z);
  const base =
    zone === "plains" ? 1 :
    zone === "hills" ? 0.92 :
    zone === "foothills" ? 0.7 :
    zone === "alpine" ? 0.38 :
    zone === "ridge" ? 0.2 :
    0.08;

  const startClear = Math.exp(-(((x + 58) / 32) ** 2) - (((z + 150) / 24) ** 2)) * 0.34;
  const passClear = Math.exp(-(((x - 18) / 26) ** 2) - (((z - 106) / 28) ** 2)) * 0.18;
  const meadowLushness =
    zone === "plains" ? 1 :
    zone === "hills" ? 0.9 :
    zone === "foothills" ? 0.64 :
    0.3;
  const patchNoise = fbmNoise(x * 0.032 + 4.2, z * 0.032 - 1.4, 4) * 0.5 + 0.5;
  const finePatchNoise = fbmNoise(x * 0.076 - 2.8, z * 0.076 + 5.1, 2) * 0.5 + 0.5;
  const clumpMask = smootherStep(0.42, 0.66, patchNoise);
  const openGapMask = 1 - smootherStep(0.18, 0.38, patchNoise);
  const patchMultiplier =
    0.48 +
    clumpMask * (0.72 + meadowLushness * 0.12 + habitat.meadow * 0.14) +
    finePatchNoise * 0.1;
  return Math.max(
    0,
    base * patchMultiplier +
    clumpMask * meadowLushness * 0.24 -
    openGapMask * meadowLushness * 0.16 +
    habitat.meadow * (0.16 + clumpMask * 0.12) +
    habitat.edge * 0.08 -
    habitat.forest * 0.1 -
    habitat.shore * 0.38 +
    riverNook * (0.48 + meadowLushness * 0.16) +
    riverBank * (0.16 + riverNook * 0.18) -
    riverGap * 1.18 -
    lakeGap * 1.04 -
    slope * 0.72 -
    startClear -
    passClear,
  );
}

export const worldLandmarks: WorldLandmark[] = [
  {
    id: "start-burrow",
    type: "burrow",
    position: new Vector3(-44, sampleTerrainHeight(-44, -134), -134),
    title: "Burrow Hollow",
    interactionRadius: 16,
    inventoryEntry: {
      title: "Moss Quilt Scrap",
      summary: "A warm scrap of burrow lining. Mossu keeps it to remember the first hollow that made the floating island feel safe.",
    },
  },
  {
    id: "orange-tree-overlook",
    type: "lone_tree",
    position: new Vector3(-4, sampleTerrainHeight(-4, -38), -38),
    title: "Amber Tree Knoll",
    interactionRadius: 15,
    inventoryEntry: {
      title: "Amber Seed",
      summary: "A smooth orange seed tucked under the lone tree. It smells sun-warm and marks the first open lookout above the meadow.",
    },
  },
  {
    id: "river-bend",
    type: "river_bend",
    position: new Vector3(sampleRiverCenter(24), sampleTerrainHeight(sampleRiverCenter(24), 24), 24),
    title: "Silver Bend",
    interactionRadius: 15,
    inventoryEntry: {
      title: "River Glass",
      summary: "A polished shard of pale blue glass from the bend. It catches the same color as the calmer water channels below the pass.",
    },
  },
  {
    id: "fir-gate",
    type: "pass",
    position: new Vector3(24, sampleTerrainHeight(24, 88), 88),
    title: "Fir Gate",
    interactionRadius: 15,
    inventoryEntry: {
      title: "Fir Tassel",
      summary: "A tassel of soft fir needles tied with grass. Mossu keeps it as a marker for the point where the gentle hills start turning into a climb.",
    },
  },
  {
    id: "foothill-pass",
    type: "pass",
    position: new Vector3(20, sampleTerrainHeight(20, 108), 108),
    title: "Whisper Pass",
    interactionRadius: 15,
    inventoryEntry: {
      title: "Pass Thread",
      summary: "A braided trail thread caught on a stone lip. It feels like a reminder to keep following the river wind toward the high shelves.",
    },
  },
  {
    id: "mistfall-basin",
    type: "cliff_path",
    position: new Vector3(42, sampleTerrainHeight(42, 134), 134),
    title: "Mistfall Basin",
    interactionRadius: 15,
    inventoryEntry: {
      title: "Mistdrop Vial",
      summary: "A tiny glass vial beaded with basin spray. The satchel note says the air starts tasting colder here, even before the ridge proper.",
    },
  },
  {
    id: "windstep-shelf",
    type: "cliff_path",
    position: new Vector3(10, sampleTerrainHeight(10, 154), 154),
    title: "Windstep Shelf",
    interactionRadius: 15,
    inventoryEntry: {
      title: "Shelf Chime",
      summary: "A bent ribbon chime that hums whenever the updraft hits it. Mossu files it away as proof that the airy route is real.",
    },
  },
  {
    id: "ridge-overlook",
    type: "overlook",
    position: new Vector3(-26, sampleTerrainHeight(-26, 168), 168),
    title: "Cloudback Ridge",
    interactionRadius: 15,
    inventoryEntry: {
      title: "Cloudback Feather",
      summary: "A long pale feather caught against the overlook rocks. It turns the ridge from a destination into a place worth lingering in.",
    },
  },
  {
    id: "ridge-saddle-landmark",
    type: "cliff_path",
    position: new Vector3(16, sampleTerrainHeight(16, 186), 186),
    title: "Ridge Saddle",
    interactionRadius: 15,
    inventoryEntry: {
      title: "Lichen Knot",
      summary: "A springy knot of alpine lichen. It feels like something gathered from the seam between the last traverse and the shrine approach.",
    },
  },
  {
    id: "peak-shrine",
    type: "ridge_shrine",
    position: new Vector3(2, sampleTerrainHeight(2, 214), 214),
    title: "Moss Crown Shrine",
    interactionRadius: 18,
    inventoryEntry: {
      title: "Shrine Crown Moss",
      summary: "A bright crown of moss from the summit stones. Mossu tucks it away like a soft proof that the climb actually happened.",
    },
  },
];

export const worldForageables: WorldForageable[] = [
  {
    id: "meadow-seed-pouch",
    kind: "seed",
    position: new Vector3(-61, sampleTerrainHeight(-61, -154), -154),
    title: "Meadow Seeds",
    summary: "A tiny pinch of round meadow seeds, warm from the trailhead grass.",
    interactionRadius: 7,
  },
  {
    id: "lake-shell",
    kind: "shell",
    position: new Vector3(-50, sampleTerrainHeight(-50, -126), -126),
    title: "Lake Shell",
    summary: "A pearl-white shell from the soft lake edge. It clicks gently in Mossu's pouch.",
    interactionRadius: 7,
  },
  {
    id: "amber-berries",
    kind: "berry",
    position: new Vector3(-12, sampleTerrainHeight(-12, -30), -30),
    title: "Amber Berries",
    summary: "A bright berry cluster from the sunny meadow below the lone tree.",
    interactionRadius: 7,
  },
  {
    id: "river-smooth-stone",
    kind: "smooth_stone",
    position: new Vector3(sampleRiverCenter(18) - 5, sampleTerrainHeight(sampleRiverCenter(18) - 5, 18), 18),
    title: "Smooth River Stone",
    summary: "A cool oval stone from the quiet bend, polished by shallow water.",
    interactionRadius: 7,
  },
  {
    id: "moss-hollow-tuft",
    kind: "moss_tuft",
    position: new Vector3(28, sampleTerrainHeight(28, 92), 92),
    title: "Moss Tuft",
    summary: "A springy green tuft from the first fir shade at the climb.",
    interactionRadius: 7,
  },
  {
    id: "fir-seeds",
    kind: "seed",
    position: new Vector3(16, sampleTerrainHeight(16, 112), 112),
    title: "Fir Seeds",
    summary: "Small winged fir seeds gathered where the foothill breeze starts turning cold.",
    interactionRadius: 7,
  },
  {
    id: "mistfall-shell-chip",
    kind: "shell",
    position: new Vector3(34, sampleTerrainHeight(34, 128), 128),
    title: "Mistfall Shell Chip",
    summary: "A thin shell chip lifted from the spray around Mistfall's runoff stones.",
    interactionRadius: 7,
  },
  {
    id: "wind-shelf-feather",
    kind: "feather",
    position: new Vector3(12, sampleTerrainHeight(12, 156), 156),
    title: "Wind-Shelf Feather",
    summary: "A pale high-shelf feather with a faint updraft chill.",
    interactionRadius: 7,
  },
  {
    id: "cloudberries",
    kind: "berry",
    position: new Vector3(-30, sampleTerrainHeight(-30, 168), 168),
    title: "Cloudberries",
    summary: "A soft ridge berry cluster that grows where the air feels thin and bright.",
    interactionRadius: 7,
  },
  {
    id: "ridge-pocket-stone",
    kind: "smooth_stone",
    position: new Vector3(20, sampleTerrainHeight(20, 184), 184),
    title: "Ridge Pocket Stone",
    summary: "A flat blue-gray stone from the seam between the final ridge and the shrine approach.",
    interactionRadius: 7,
  },
  {
    id: "shrine-moss",
    kind: "moss_tuft",
    position: new Vector3(0, sampleTerrainHeight(0, 206), 206),
    title: "Shrine Moss",
    summary: "A tiny crown of summit moss that smells like rain on old stone.",
    interactionRadius: 7,
  },
  {
    id: "overlook-feather",
    kind: "feather",
    position: new Vector3(-22, sampleTerrainHeight(-22, 194), 194),
    title: "Overlook Feather",
    summary: "A long cream feather caught against the overlook rocks.",
    interactionRadius: 7,
  },
];

export const shadowPockets: ShadowPocket[] = [
  {
    id: "pocket-burrow",
    position: new Vector3(-44, sampleTerrainHeight(-44, -134) + 0.3, -134),
    radius: 13,
    depth: 8,
    hue: 0.62,
  },
  {
    id: "pocket-ravine",
    position: new Vector3(-58, sampleTerrainHeight(-58, 56) + 0.3, 56),
    radius: 8,
    depth: 6,
    hue: 0.63,
  },
  {
    id: "pocket-cave",
    position: new Vector3(38, sampleTerrainHeight(38, 128) + 0.2, 128),
    radius: 12,
    depth: 7,
    hue: 0.6,
  },
  {
    id: "pocket-shrine",
    position: new Vector3(2, sampleTerrainHeight(2, 210) + 0.2, 210),
    radius: 10,
    depth: 5,
    hue: 0.58,
  },
];

export const scenicPockets: ScenicPocket[] = [
  {
    id: "start-meadow",
    kind: "meadow_clearing",
    zone: "plains",
    position: new Vector3(-62, sampleTerrainHeight(-62, -150), -150),
    radius: 28,
  },
  {
    id: "burrow-bloom",
    kind: "moss_hollow",
    zone: "plains",
    position: new Vector3(-46, sampleTerrainHeight(-46, -132), -132),
    radius: 18,
  },
  {
    id: "amber-tree-meadow",
    kind: "meadow_clearing",
    zone: "hills",
    position: new Vector3(-8, sampleTerrainHeight(-8, -34), -34),
    radius: 24,
  },
  {
    id: "silver-bend-bank",
    kind: "stream_bend",
    zone: "hills",
    position: new Vector3(sampleRiverCenter(22), sampleTerrainHeight(sampleRiverCenter(22), 22), 22),
    radius: 22,
  },
  {
    id: "whisper-pass-ledge",
    kind: "overlook",
    zone: "foothills",
    position: new Vector3(20, sampleTerrainHeight(20, 106), 106),
    radius: 20,
  },
  {
    id: "fir-gate-entry",
    kind: "meadow_clearing",
    zone: "foothills",
    position: new Vector3(24, sampleTerrainHeight(24, 88), 88),
    radius: 18,
  },
  {
    id: "mistfall-cascade",
    kind: "stream_bend",
    zone: "alpine",
    position: new Vector3(34, sampleTerrainHeight(34, 126), 126),
    radius: 18,
  },
  {
    id: "mistfall-basin",
    kind: "stream_bend",
    zone: "alpine",
    position: new Vector3(42, sampleTerrainHeight(42, 134), 134),
    radius: 16,
  },
  {
    id: "fir-glen-hollow",
    kind: "moss_hollow",
    zone: "alpine",
    position: new Vector3(-12, sampleTerrainHeight(-12, 144), 144),
    radius: 18,
  },
  {
    id: "windstep-shelf",
    kind: "overlook",
    zone: "alpine",
    position: new Vector3(10, sampleTerrainHeight(10, 154), 154),
    radius: 18,
  },
  {
    id: "cloudback-overlook",
    kind: "overlook",
    zone: "ridge",
    position: new Vector3(-28, sampleTerrainHeight(-28, 166), 166),
    radius: 18,
  },
  {
    id: "ridge-saddle",
    kind: "moss_hollow",
    zone: "ridge",
    position: new Vector3(18, sampleTerrainHeight(18, 184), 184),
    radius: 16,
  },
  {
    id: "ridge-crossing",
    kind: "overlook",
    zone: "ridge",
    position: new Vector3(10, sampleTerrainHeight(10, 194), 194),
    radius: 16,
  },
  {
    id: "shrine-approach",
    kind: "overlook",
    zone: "peak_shrine",
    position: new Vector3(8, sampleTerrainHeight(8, 208), 208),
    radius: 14,
  },
];

export const startingPosition = new Vector3(-58, sampleTerrainHeight(-58, -158) + 2.2, -158);
export const startingLookTarget = new Vector3(18, sampleTerrainHeight(18, 108) + 12, 108);

export function sampleObjectiveText() {
  return {
    title: "Climb toward the shrine",
    body: "Follow the river through Whisper Pass, drift the high shelves, and cross the ridges to reach Moss Crown Shrine.",
  };
}
