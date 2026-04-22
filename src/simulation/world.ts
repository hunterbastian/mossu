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

export interface WindField {
  direction: Vector2;
  strength: number;
  gust: number;
}

export interface CollectibleOrb {
  id: string;
  position: Vector3;
  value: number;
  routeGroup?: string;
}

export interface WorldLandmark {
  id: string;
  type: LandmarkType;
  position: Vector3;
  title: string;
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

const riverCenter = (z: number) => Math.sin(z * 0.018) * 52 - 18;
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

function quantize(value: number, steps: number) {
  return Math.round(value * steps) / steps;
}

function hash2(x: number, z: number) {
  return Math.sin(x * 12.9898 + z * 78.233) * 43758.5453123;
}

function terrainNoise(x: number, z: number) {
  const a = Math.sin(x * 0.018) * Math.cos(z * 0.015);
  const b = Math.sin((x + z) * 0.033) * 0.5;
  const c = Math.cos(x * 0.061 - z * 0.021) * 0.25;
  return a + b + c;
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
  const rolling = terrainNoise(x, z) * 5.5;
  const meadowLift = 11 + Math.sin(z * 0.01) * 2.2;
  const river = riverCenter(z);
  const riverCut = Math.exp(-(((x - river) / 20) ** 2)) * 12;
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
  const mountainHollow = bowlDepression(x, z, 38, 128, 20, 10);
  return meadowLift + rolling + hillBand + foothillBand + mountainMass + ridgeWall + shrineShelf + alpineShelf - riverCut + startBurrow + mountainHollow;
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
  return 11 + (Math.sin(z * 0.03) * 0.5 + 0.5) * 7;
}

export function sampleWindField(x: number, z: number, height: number): WindField {
  const dir = new Vector2(0.92 + Math.sin(z * 0.01) * 0.15, 0.34 + Math.cos(x * 0.012) * 0.11).normalize();
  const altitudeBoost = smootherStep(40, 160, height) * 0.65;
  const valleyShield = Math.exp(-(((x - riverCenter(z)) / 18) ** 2)) * 0.25;
  const strength = 0.48 + altitudeBoost - valleyShield + (Math.sin((x + z) * 0.024) * 0.5 + 0.5) * 0.15;
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

  const riverGap = Math.exp(-(((x - riverCenter(z)) / 13) ** 2));
  const base =
    zone === "plains" ? 1 :
    zone === "hills" ? 0.92 :
    zone === "foothills" ? 0.7 :
    zone === "alpine" ? 0.38 :
    zone === "ridge" ? 0.2 :
    0.08;

  return Math.max(0, base - riverGap * 0.92 - slope * 0.75);
}

export const worldLandmarks: WorldLandmark[] = [
  {
    id: "start-burrow",
    type: "burrow",
    position: new Vector3(-44, sampleTerrainHeight(-44, -134), -134),
    title: "Burrow Hollow",
  },
  {
    id: "orange-tree-overlook",
    type: "lone_tree",
    position: new Vector3(-4, sampleTerrainHeight(-4, -38), -38),
    title: "Amber Tree Knoll",
  },
  {
    id: "river-bend",
    type: "river_bend",
    position: new Vector3(sampleRiverCenter(24), sampleTerrainHeight(sampleRiverCenter(24), 24), 24),
    title: "Silver Bend",
  },
  {
    id: "foothill-pass",
    type: "pass",
    position: new Vector3(18, sampleTerrainHeight(18, 108), 108),
    title: "Whisper Pass",
  },
  {
    id: "ridge-overlook",
    type: "overlook",
    position: new Vector3(-26, sampleTerrainHeight(-26, 168), 168),
    title: "Cloudback Ridge",
  },
  {
    id: "peak-shrine",
    type: "ridge_shrine",
    position: new Vector3(2, sampleTerrainHeight(2, 214), 214),
    title: "Moss Crown Shrine",
  },
];

export const collectibleOrbs: CollectibleOrb[] = [
  { id: "orb-01", position: new Vector3(-36, sampleTerrainHeight(-36, -118) + 4.4, -118), value: 1, routeGroup: "burrow" },
  { id: "orb-02", position: new Vector3(-18, sampleTerrainHeight(-18, -96) + 4.1, -96), value: 1, routeGroup: "meadow" },
  { id: "orb-03", position: new Vector3(10, sampleTerrainHeight(10, -72) + 4.2, -72), value: 1, routeGroup: "meadow" },
  { id: "orb-04", position: new Vector3(-8, sampleTerrainHeight(-8, -26) + 5.2, -26), value: 1, routeGroup: "hills" },
  { id: "orb-05", position: new Vector3(20, sampleTerrainHeight(20, 14) + 4.5, 14), value: 1, routeGroup: "river" },
  { id: "orb-06", position: new Vector3(-44, sampleTerrainHeight(-44, 42) + 5.2, 42), value: 1, routeGroup: "river" },
  { id: "orb-07", position: new Vector3(26, sampleTerrainHeight(26, 76) + 4.6, 76), value: 1, routeGroup: "foothills" },
  { id: "orb-08", position: new Vector3(-6, sampleTerrainHeight(-6, 92) + 4.8, 92), value: 1, routeGroup: "foothills" },
  { id: "orb-09", position: new Vector3(46, sampleTerrainHeight(46, 122) + 5.2, 122), value: 1, routeGroup: "float-route" },
  { id: "orb-10", position: new Vector3(2, sampleTerrainHeight(2, 138) + 5.4, 138), value: 1, routeGroup: "alpine" },
  { id: "orb-11", position: new Vector3(-34, sampleTerrainHeight(-34, 162) + 5.5, 162), value: 1, routeGroup: "ridge" },
  { id: "orb-12", position: new Vector3(24, sampleTerrainHeight(24, 174) + 5.8, 174), value: 1, routeGroup: "ridge" },
  { id: "orb-13", position: new Vector3(-10, sampleTerrainHeight(-10, 196) + 6, 196), value: 1, routeGroup: "summit" },
  { id: "orb-14", position: new Vector3(6, sampleTerrainHeight(6, 218) + 6.2, 218), value: 1, routeGroup: "summit" },
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
    id: "mistfall-cascade",
    kind: "stream_bend",
    zone: "alpine",
    position: new Vector3(34, sampleTerrainHeight(34, 126), 126),
    radius: 18,
  },
  {
    id: "fir-glen-hollow",
    kind: "moss_hollow",
    zone: "alpine",
    position: new Vector3(-12, sampleTerrainHeight(-12, 144), 144),
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
    id: "shrine-approach",
    kind: "overlook",
    zone: "peak_shrine",
    position: new Vector3(8, sampleTerrainHeight(8, 208), 208),
    radius: 14,
  },
];

export const startingPosition = new Vector3(-58, sampleTerrainHeight(-58, -158) + 2.6, -158);
export const startingLookTarget = new Vector3(-28, sampleTerrainHeight(-28, -112) + 18, 84);

export function sampleObjectiveText(orbCount: number, hasFloat: boolean) {
  if (!hasFloat) {
    return {
      title: "Gather the hillside glow",
      body: `Collect ${Math.max(0, 8 - orbCount)} more light-orbs to awaken Breeze Float and open the upper climb.`,
    };
  }

  if (orbCount < collectibleOrbs.length) {
    return {
      title: "Climb toward the shrine",
      body: "Ride the high winds through the foothills, then cross the ridges to reach Moss Crown Shrine.",
    };
  }

  return {
    title: "The mountain is awake",
    body: "You have gathered every orb in the slice. Wander the plains, hills, and peaks to study the full world rhythm.",
  };
}
