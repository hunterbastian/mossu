import type { Vector2, Vector3 } from "three";

export type AbilityId = "breeze_float";

export type BiomeZone = "plains" | "hills" | "foothills" | "alpine" | "ridge" | "peak_shrine";

export type HabitatZone = "shore" | "meadow" | "forest";

export type WorldRegionKind = "meadow" | "shore" | "lake" | "forest" | "highland" | "ridge" | "shrine";

export type WorldSurfaceMaterial =
  | "meadow_grass"
  | "sand"
  | "water"
  | "forest_floor"
  | "highland_grass"
  | "rock"
  | "shrine_moss";

export interface HabitatLayerSample {
  zone: HabitatZone;
  shore: number;
  meadow: number;
  forest: number;
  clearing: number;
  edge: number;
}

export interface WorldRegionSample {
  region: WorldRegionKind;
  material: WorldSurfaceMaterial;
  regionStrength: number;
  meadow: number;
  shore: number;
  lake: number;
  forest: number;
  highland: number;
  ridge: number;
  shrine: number;
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
  /** Short one-line toast when the player first enters the landmark's ping radius (session-scoped). */
  flavorPing?: string;
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

export type WorldMapMarkerKind = "bridge" | "poi" | "special";

export interface WorldMapMarker {
  id: string;
  kind: WorldMapMarkerKind;
  title: string;
  position: Vector3;
  landmarkId?: string;
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

export type WaterProfileHint = "mainRiver" | "stillPool" | "foothillCreek" | "alpineRunoff" | "waterfallOutflow";

export interface WaterProbeSample {
  kind: WaterState["kind"] | null;
  profile: WaterProfileHint | null;
  insideWater: boolean;
  depth: number;
  bankMask: number;
  swimAllowed: boolean;
  terrainY: number;
  gameplaySurfaceY: number | null;
  renderedSurfaceY: number | null;
  flowStrength: number;
  flowDirection: { x: number; z: number };
}

export interface WaterAmbienceSample {
  kind: WaterState["kind"] | null;
  proximity: number;
  distanceToWater: number;
  flowStrength: number;
  insideWater: boolean;
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

export interface CreekPath {
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

export type BiomeThresholdLandmarkKind = "moss_cairn" | "stone_cairn" | "hero_pine" | "wind_pine" | "prayer_cairn";

export interface BiomeThresholdLandmark {
  id: string;
  fromZone: BiomeZone;
  toZone: BiomeZone;
  position: Vector3;
  kind: BiomeThresholdLandmarkKind;
  /** How far the clearing widening reaches at this landmark. */
  clearingRadius: number;
  /** 0-1 weight contributed to sampleRouteReadabilityClearing. */
  clearingStrength: number;
}
