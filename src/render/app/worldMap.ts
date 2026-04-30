import {
  RIVER_BRANCH_SEGMENTS,
  sampleIslandBoundaryPoint,
  sampleRiverChannelCenter,
  sampleRiverCenter,
  STARTING_WATER_POOLS,
  WorldLandmark,
  worldLandmarks,
  worldMapMarkers,
} from "../../simulation/world";

const MAP_SVG_NS = "http://www.w3.org/2000/svg";

export const MAP_VIEWBOX_WIDTH = 960;
export const MAP_VIEWBOX_HEIGHT = 760;

const MAP_PADDING_X = 92;
const MAP_PADDING_Y = 74;
export const MAP_ROUTE_IDS = [
  "start-burrow",
  "river-bend",
  "fir-gate",
  "foothill-pass",
  "highland-basin",
  "windstep-shelf",
  "ridge-overlook",
  "skyward-ledge",
  "peak-shrine",
] as const;

/** Primary route — full marker + label on the parchment map. */
export const routeLandmarkIdSet = new Set<string>([...MAP_ROUTE_IDS]);

export type MapTextAnchor = "start" | "middle" | "end";

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapMarkerElements {
  group: SVGGElement;
  ring: SVGCircleElement;
  dot: SVGCircleElement;
  label: SVGTextElement;
}

export interface MapAtlasMarker {
  id: string;
  kind: "bridge" | "poi" | "special";
  title: string;
  point: MapPoint;
  landmarkId?: string;
}

export interface MapForestGlyph {
  id: string;
  kind: "deep" | "grove" | "ancient" | "fruit";
  title: string;
  point: MapPoint;
}

export interface MapRegionPatch {
  id: string;
  kind: "forest" | "meadow" | "ridge";
  /** Map viewBox-space center for the silhouette `<use>`. */
  center: MapPoint;
  /** Rendered width of the silhouette (viewBox units). */
  width: number;
  /** Rendered height of the silhouette (viewBox units). */
  height: number;
  /** Small rotation in degrees for organic variety. */
  rotationDeg: number;
}

const MAP_LABEL_LAYOUT: Record<string, { dx: number; dy: number; anchor: MapTextAnchor }> = {
  "start-burrow": { dx: -18, dy: 24, anchor: "end" },
  "orange-tree-overlook": { dx: -8, dy: -20, anchor: "end" },
  "river-bend": { dx: -18, dy: -20, anchor: "end" },
  "fir-gate": { dx: 16, dy: -18, anchor: "start" },
  "foothill-pass": { dx: -18, dy: 26, anchor: "end" },
  "highland-basin": { dx: 16, dy: 22, anchor: "start" },
  "windstep-shelf": { dx: -18, dy: -18, anchor: "end" },
  "ridge-overlook": { dx: -20, dy: -20, anchor: "end" },
  "skyward-ledge": { dx: 0, dy: -22, anchor: "middle" },
  "ridge-saddle-landmark": { dx: 18, dy: 24, anchor: "start" },
  "peak-shrine": { dx: 0, dy: -24, anchor: "middle" },
};

const boundarySamples = Array.from({ length: 96 }, (_, index) => (
  sampleIslandBoundaryPoint((index / 96) * Math.PI * 2)
));

const mapBounds = boundarySamples.reduce((bounds, point) => ({
  minX: Math.min(bounds.minX, point.x),
  maxX: Math.max(bounds.maxX, point.x),
  minZ: Math.min(bounds.minZ, point.z),
  maxZ: Math.max(bounds.maxZ, point.z),
}), {
  minX: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  minZ: Number.POSITIVE_INFINITY,
  maxZ: Number.NEGATIVE_INFINITY,
});

function buildPath(points: MapPoint[], closed = false) {
  if (points.length === 0) {
    return "";
  }
  const commands = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`);
  return `${commands.join(" ")}${closed ? " Z" : ""}`;
}

/** Map-space size for a world XZ ellipse (for scaling reusable silhouettes). */
function patchFrameFromWorldEllipse(
  x: number,
  z: number,
  radiusX: number,
  radiusY: number,
): { center: MapPoint; width: number; height: number } {
  const center = projectWorldToMap(x, z);
  const east = projectWorldToMap(x + radiusX, z);
  const north = projectWorldToMap(x, z + radiusY);
  const width = 2 * Math.abs(east.x - center.x);
  const height = 2 * Math.abs(north.y - center.y);
  return {
    center,
    width: Math.max(width, 28),
    height: Math.max(height, 22),
  };
}

export const routeLandmarks = MAP_ROUTE_IDS
  .map((id) => worldLandmarks.find((landmark) => landmark.id === id))
  .filter((landmark): landmark is WorldLandmark => Boolean(landmark));

export const mapBoundaryPath = buildPath(boundarySamples.map((point) => projectWorldToMap(point.x, point.z)), true);
export const mapRiverPath = buildPath(
  Array.from({ length: 64 }, (_, index) => {
    const t = index / 63;
    const z = mapBounds.minZ + (mapBounds.maxZ - mapBounds.minZ) * t;
    return projectWorldToMap(sampleRiverCenter(z), z);
  }),
);
export const mapRiverBranchPaths = RIVER_BRANCH_SEGMENTS.map((segment) => buildPath(
  Array.from({ length: 36 }, (_, index) => {
    const t = index / 35;
    const z = segment.startZ + (segment.endZ - segment.startZ) * t;
    return projectWorldToMap(sampleRiverChannelCenter(segment.id, z), z);
  }),
));
export const mapRoutePath = buildPath(routeLandmarks.map((landmark) => projectWorldToMap(landmark.position.x, landmark.position.z)));

const mountainRidgeWorldLines: readonly (readonly (readonly [number, number])[])[] = [
  [[-142, 168], [-106, 198], [-62, 216], [-18, 232], [30, 226], [82, 206], [128, 178]],
  [[-72, 138], [-34, 166], [12, 184], [58, 178], [100, 150]],
  [[-118, 110], [-82, 132], [-44, 148], [-8, 144], [28, 128], [64, 112]],
];

export const mapMountainRidgePaths: readonly string[] = mountainRidgeWorldLines.map((line) => (
  buildPath(line.map(([x, z]) => projectWorldToMap(x, z)))
));

export const mapAtlasMarkers: readonly MapAtlasMarker[] = worldMapMarkers.map((marker) => ({
  id: marker.id,
  kind: marker.kind,
  title: marker.title,
  point: projectWorldToMap(marker.position.x, marker.position.z),
  landmarkId: marker.landmarkId,
}));

const mapRegionDefinitions = [
  ["forest-southwest", "forest", -98, -108, 64, 48, 0.35],
  ["forest-low-east", "forest", 90, -42, 72, 58, 1.2],
  ["forest-fir-gate", "forest", 52, 80, 78, 50, 1.9],
  ["forest-ridge-west", "forest", -84, 170, 60, 44, 0.85],
  ["forest-deep-west", "forest", -128, -64, 54, 62, 2.2],
  ["forest-ancient-east", "forest", 86, 146, 54, 50, 1.1],
  ["meadow-burrow", "meadow", -50, -126, 82, 58, 2.4],
  ["meadow-silver", "meadow", -4, 4, 92, 62, 1.5],
  ["ridge-crown", "ridge", 4, 210, 94, 52, 0.45],
] as const;

export const mapRegionPatches: readonly MapRegionPatch[] = mapRegionDefinitions.map(
  ([id, kind, x, z, radiusX, radiusY, phase]) => {
    const { center, width, height } = patchFrameFromWorldEllipse(x, z, radiusX, radiusY);
    return {
      id,
      kind,
      center,
      width,
      height,
      rotationDeg: phase * 6.5 - 3.25,
    };
  },
);

export const mapForestGlyphs: readonly MapForestGlyph[] = [
  ["deep-west", "deep", "Deep woods", -122, -66],
  ["sunlit-grove", "grove", "Peaceful grove", -88, -112],
  ["fruit-grove", "fruit", "Wild fruit grove", 108, -34],
  ["fir-gate-deep", "deep", "Fir gate woods", 54, 96],
  ["root-ruins-west", "ancient", "Ancient grounds", -90, 132],
  ["root-ruins-east", "ancient", "Root-swallowed ruins", 84, 148],
].map(([id, kind, title, x, z]) => ({
  id: id as string,
  kind: kind as MapForestGlyph["kind"],
  title: title as string,
  point: projectWorldToMap(x as number, z as number),
}));

export interface MapLakePatch {
  id: string;
  center: MapPoint;
  width: number;
  height: number;
  rotationDeg: number;
}

/** Still pools from sim — same footprint as in-world water (render radii). */
export const mapLakePatches: readonly MapLakePatch[] = STARTING_WATER_POOLS.map((pool) => {
  const { center, width, height } = patchFrameFromWorldEllipse(
    pool.x,
    pool.z,
    pool.renderRadiusX * 0.88,
    pool.renderRadiusZ * 0.88,
  );
  return {
    id: pool.id,
    center,
    width: Math.max(width, 20),
    height: Math.max(height, 16),
    rotationDeg: (pool.x * 0.011 + pool.z * 0.007) * 3.1,
  };
});

/** Northern hills / back ridge: soft mass behind alpine areas (viewBox-anchored). */
export const mapHighlandBackdrop: {
  center: MapPoint;
  width: number;
  height: number;
  rotationDeg: number;
} = (() => {
  const { center, width, height } = patchFrameFromWorldEllipse(2, 198, 168, 52);
  return { center, width: width * 1.12, height: height * 1.18, rotationDeg: -1.1 };
})();

const NORTH_RIDGE_Z_FRAC = 0.5;

/** Simplified ridgeline along the high-z part of the island (silhouette “hills in back”). */
export function buildMapNorthRidgePath(): string {
  const zSpan = mapBounds.maxZ - mapBounds.minZ;
  const zMin = mapBounds.minZ + zSpan * NORTH_RIDGE_Z_FRAC;
  const arc = boundarySamples
    .filter((p) => p.z >= zMin)
    .sort((a, b) => a.x - b.x);
  if (arc.length < 3) {
    return "";
  }
  return buildPath(arc.map((p) => projectWorldToMap(p.x, p.z)));
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(tag: K) {
  return document.createElementNS(MAP_SVG_NS, tag);
}

export function projectWorldToMap(x: number, z: number): MapPoint {
  const usableWidth = MAP_VIEWBOX_WIDTH - MAP_PADDING_X * 2;
  const usableHeight = MAP_VIEWBOX_HEIGHT - MAP_PADDING_Y * 2;
  const xNorm = (x - mapBounds.minX) / (mapBounds.maxX - mapBounds.minX);
  const zNorm = (z - mapBounds.minZ) / (mapBounds.maxZ - mapBounds.minZ);
  return {
    x: MAP_PADDING_X + usableWidth * xNorm,
    y: MAP_PADDING_Y + usableHeight * (1 - zNorm),
  };
}

export function getMapLabelLayout(landmarkId: string) {
  return MAP_LABEL_LAYOUT[landmarkId] ?? { dx: 12, dy: -16, anchor: "start" as const };
}
