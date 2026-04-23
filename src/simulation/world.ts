import { MathUtils, Vector2, Vector3 } from "three";

export type AbilityId = "breeze_float";

export type BiomeZone =
  | "plains"
  | "hills"
  | "foothills"
  | "alpine"
  | "ridge"
  | "peak_shrine";

export type LandmarkType =
  | "lone_tree"
  | "arch"
  | "burrow"
  | "river_bend"
  | "cliff_path"
  | "pass"
  | "ridge_shrine"
  | "overlook";

export type ForageableKind = "fruit" | "plant";

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

interface RiverBranchSegment {
  id: Exclude<RiverChannelId, "main">;
  startZ: number;
  endZ: number;
  offset: number;
  width: number;
  depthScale: number;
  flowStrength: number;
}

const riverCenter = (z: number) => (
  Math.sin(z * 0.014) * 44 +
  Math.sin((z + 120) * 0.007) * 15 -
  18 +
  Math.exp(-(((z + 112) / 44) ** 2)) * 28
);
export const RIVER_BRANCH_SEGMENTS: readonly RiverBranchSegment[] = [
  { id: "meadow-braid", startZ: -74, endZ: 18, offset: 58, width: 22, depthScale: 0.66, flowStrength: 0.34 },
  { id: "fir-gate-braid", startZ: 52, endZ: 132, offset: -62, width: 24, depthScale: 0.72, flowStrength: 0.46 },
  { id: "alpine-braid", startZ: 134, endZ: 214, offset: 54, width: 19, depthScale: 0.64, flowStrength: 0.54 },
] as const;
export const MAIN_RIVER_SURFACE_OFFSET = 4.1;
export const FOOTHILL_CREEK_SURFACE_OFFSET = 1.5;
export const ALPINE_RUNOFF_SURFACE_OFFSET = 1.3;
export const WATERFALL_OUTFLOW_SURFACE_OFFSET = 1.8;
export const OPENING_LAKE_CENTER_X = -34;
export const OPENING_LAKE_CENTER_Z = -112;
export const OPENING_LAKE_RADIUS = 24.5;
export const OPENING_LAKE_SURFACE_OFFSET = 3.8;
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

export function sampleRiverWetness(x: number, z: number) {
  return sampleRiverChannels(z).reduce((best, channel) => {
    const distance = Math.abs(x - channel.centerX);
    const halfWidth = channel.width * 0.5;
    const wetness = 1 - smootherStep(halfWidth * 0.78, halfWidth * 1.28, distance);
    return Math.max(best, wetness * channel.envelope);
  }, 0);
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

function sampleIslandContour(x: number, z: number) {
  const nx = Math.abs((x - ISLAND_CENTER_X) / ISLAND_RADIUS_X);
  const nz = Math.abs((z - ISLAND_CENTER_Z) / ISLAND_RADIUS_Z);
  return Math.pow(
    Math.pow(nx, ISLAND_SUPERELLIPSE_EXPONENT) + Math.pow(nz, ISLAND_SUPERELLIPSE_EXPONENT),
    1 / ISLAND_SUPERELLIPSE_EXPONENT,
  );
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
  const rolling = terrainNoise(x, z) * (7.2 + highlandMask * 2.4);
  const ridgeTexture = mountainRidgeNoise(x, z) * highlandMask;
  const peakCarve = (ridgeTexture - 0.34) * 24 * smootherStep(90, 214, z);
  const fineSurface = fbmNoise(x * 0.045 - 3.4, z * 0.045 + 5.2, 3) * (0.9 + highlandMask * 1.9);
  const meadowLift = 11 + Math.sin(z * 0.01) * 2.2;
  const riverCut = sampleRiverBedCut(x, z);
  const riverNookLift = sampleRiverNookMask(x, z) * 4.2;
  const riverBankLift = sampleRiverBankMask(x, z) * 1.6;
  const hillBand = smootherStep(-170, 10, z) * 10;
  const foothillBand = smootherStep(-10, 95, z) * 18;
  const mountainMass =
    Math.exp(-(((x + 12) / 110) ** 2) - (((z - 174) / 92) ** 2)) * 96 +
    Math.exp(-(((x - 84) / 90) ** 2) - (((z - 140) / 88) ** 2)) * 44 +
    Math.exp(-(((x + 118) / 72) ** 2) - (((z - 118) / 78) ** 2)) * 28;
  const ridgeWall = smootherStep(78, 182, z) * 26 * (1 - ridgePassCenter(x));
  const shrineShelf = Math.exp(-(((x + 2) / 28) ** 2) - (((z - 214) / 20) ** 2)) * 18;
  const paintedSteps = quantize(Math.sin((x - z) * 0.028) * 0.5 + 0.5, 7) * 2.4;
  const alpineShelf = smootherStep(118, 195, z) * paintedSteps;
  const startBurrow = bowlDepression(x, z, -44, -134, 15, 12);
  const openingLakeBasin = bowlDepression(x, z, OPENING_LAKE_CENTER_X, OPENING_LAKE_CENTER_Z, OPENING_LAKE_RADIUS, 8.2);
  const mountainHollow = bowlDepression(x, z, 38, 128, 20, 10);
  const pineGateRise = Math.exp(-(((x - 24) / 34) ** 2) - (((z - 88) / 28) ** 2)) * 9;
  const passShelf = Math.exp(-(((x - 20) / 30) ** 2) - (((z - 108) / 24) ** 2)) * 11;
  const cascadeShelf = Math.exp(-(((x - 34) / 28) ** 2) - (((z - 130) / 22) ** 2)) * 14;
  const traverseShelf = Math.exp(-(((x - 10) / 34) ** 2) - (((z - 154) / 26) ** 2)) * 11;
  const ridgeLead = Math.exp(-(((x - 14) / 24) ** 2) - (((z - 186) / 18) ** 2)) * 8;
  return meadowLift + rolling + fineSurface + peakCarve + hillBand + foothillBand + mountainMass + ridgeWall + shrineShelf + alpineShelf + pineGateRise + passShelf + cascadeShelf + traverseShelf + ridgeLead + riverNookLift + riverBankLift - riverCut + startBurrow + openingLakeBasin + mountainHollow;
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

const creekPaths: CreekPath[] = [];

const waterPools = [
  {
    kind: "pool" as const,
    x: OPENING_LAKE_CENTER_X,
    z: OPENING_LAKE_CENTER_Z,
    radius: OPENING_LAKE_RADIUS,
    surfaceOffset: OPENING_LAKE_SURFACE_OFFSET,
    flowStrength: 0.08,
    swimAllowed: true,
  },
] as const;

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

  for (const pool of waterPools) {
    const distance = Math.hypot(x - pool.x, z - pool.z);
    if (distance > pool.radius) {
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
      kind: pool.kind,
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
    const activeWidth = channel.width * 0.53;
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
  if (pool && pool.depth > bestDepth) {
    best = pool;
  }

  return best;
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
  if (height > 144 || z > 198) {
    return "peak_shrine";
  }
  if (height > 112 || z > 160) {
    return "ridge";
  }
  if (height > 78 || z > 108) {
    return "alpine";
  }
  if (height > 42 || z > 42) {
    return "foothills";
  }
  if (z > -70) {
    return "hills";
  }
  return "plains";
}

export function isGrassZone(zone: BiomeZone) {
  return zone !== "peak_shrine";
}

export function sampleGrassDensity(x: number, z: number) {
  const height = sampleTerrainHeight(x, z);
  const zone = sampleBiomeZone(x, z, height);
  const slope = 1 - sampleTerrainNormal(x, z).y;
  if (!isGrassZone(zone) || slope > 0.58) {
    return 0;
  }

  const riverGap = sampleRiverWetness(x, z);
  const riverNook = sampleRiverNookMask(x, z);
  const riverBank = sampleRiverBankMask(x, z);
  const lakeGap = Math.exp(-(((x - OPENING_LAKE_CENTER_X) / (OPENING_LAKE_RADIUS * 0.95)) ** 2) - (((z - OPENING_LAKE_CENTER_Z) / (OPENING_LAKE_RADIUS * 0.85)) ** 2));
  const base =
    zone === "plains" ? 1 :
    zone === "hills" ? 0.92 :
    zone === "foothills" ? 0.7 :
    zone === "alpine" ? 0.38 :
    zone === "ridge" ? 0.2 :
    0.08;

  const startClear = Math.exp(-(((x + 58) / 32) ** 2) - (((z + 150) / 24) ** 2)) * 0.34;
  const passClear = Math.exp(-(((x - 18) / 26) ** 2) - (((z - 106) / 28) ** 2)) * 0.18;
  return Math.max(0, base + riverNook * 0.42 + riverBank * 0.14 - riverGap * 1.05 - lakeGap * 0.98 - slope * 0.75 - startClear - passClear);
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
    id: "sunberry-cluster",
    kind: "fruit",
    position: new Vector3(-74, sampleTerrainHeight(-74, -150), -150),
    title: "Sunberry Cluster",
    summary: "A pocketful of warm meadow berries gathered from the soft grass near the trailhead.",
    interactionRadius: 7,
  },
  {
    id: "burrow-mint",
    kind: "plant",
    position: new Vector3(-50, sampleTerrainHeight(-50, -126), -126),
    title: "Burrow Mint",
    summary: "A cool mint sprig from the moss hollow, tucked away for later comfort.",
    interactionRadius: 7,
  },
  {
    id: "amber-plum",
    kind: "fruit",
    position: new Vector3(-12, sampleTerrainHeight(-12, -30), -30),
    title: "Amber Plum",
    summary: "A bright hillside plum from the sunny meadow below the lone tree.",
    interactionRadius: 7,
  },
  {
    id: "river-reed",
    kind: "plant",
    position: new Vector3(sampleRiverCenter(18) - 5, sampleTerrainHeight(sampleRiverCenter(18) - 5, 18), 18),
    title: "River Reed",
    summary: "A smooth river reed with a pale ribbon tip, gathered from the quiet bend.",
    interactionRadius: 7,
  },
  {
    id: "fircone-bunch",
    kind: "fruit",
    position: new Vector3(28, sampleTerrainHeight(28, 92), 92),
    title: "Fircone Bunch",
    summary: "A cluster of resin-sweet cones from the first fir trees at the climb.",
    interactionRadius: 7,
  },
  {
    id: "pass-thyme",
    kind: "plant",
    position: new Vector3(16, sampleTerrainHeight(16, 112), 112),
    title: "Pass Thyme",
    summary: "A tiny alpine herb gathered where the foothill breeze starts turning cold.",
    interactionRadius: 7,
  },
  {
    id: "mistcap-bloom",
    kind: "plant",
    position: new Vector3(34, sampleTerrainHeight(34, 128), 128),
    title: "Mistcap Bloom",
    summary: "A silver-blue bloom lifted from the spray around Mistfall's runoff stones.",
    interactionRadius: 7,
  },
  {
    id: "windpear",
    kind: "fruit",
    position: new Vector3(12, sampleTerrainHeight(12, 156), 156),
    title: "Windpear",
    summary: "A pale high-shelf fruit with a crisp skin and a faint updraft chill.",
    interactionRadius: 7,
  },
  {
    id: "cloudberry-spray",
    kind: "fruit",
    position: new Vector3(-30, sampleTerrainHeight(-30, 168), 168),
    title: "Cloudberry Spray",
    summary: "A soft ridge berry cluster that grows where the air feels thin and bright.",
    interactionRadius: 7,
  },
  {
    id: "ridge-sage",
    kind: "plant",
    position: new Vector3(20, sampleTerrainHeight(20, 184), 184),
    title: "Ridge Sage",
    summary: "A resilient sage tuft from the seam between the final ridge and the shrine approach.",
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

export const startingPosition = new Vector3(-58, sampleTerrainHeight(-58, -158) + 2.6, -158);
export const startingLookTarget = new Vector3(18, sampleTerrainHeight(18, 108) + 12, 108);

export function sampleObjectiveText() {
  return {
    title: "Climb toward the shrine",
    body: "Follow the river through Whisper Pass, drift the high shelves, and cross the ridges to reach Moss Crown Shrine.",
  };
}
