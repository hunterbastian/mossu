import {
  RIVER_BRANCH_SEGMENTS,
  sampleIslandBoundaryPoint,
  sampleRiverChannelCenter,
  sampleRiverCenter,
  WorldLandmark,
  worldLandmarks,
  worldMapMarkers,
} from "../../simulation/world";

const MAP_SVG_NS = "http://www.w3.org/2000/svg";

export const MAP_VIEWBOX_WIDTH = 960;
export const MAP_VIEWBOX_HEIGHT = 760;

const MAP_PADDING_X = 92;
const MAP_PADDING_Y = 74;
const MAP_ROUTE_IDS = [
  "start-burrow",
  "river-bend",
  "fir-gate",
  "foothill-pass",
  "mistfall-basin",
  "windstep-shelf",
  "ridge-overlook",
  "peak-shrine",
] as const;

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
  "mistfall-basin": { dx: 16, dy: 22, anchor: "start" },
  "windstep-shelf": { dx: -18, dy: -18, anchor: "end" },
  "ridge-overlook": { dx: -20, dy: -20, anchor: "end" },
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

export const mapAtlasMarkers: readonly MapAtlasMarker[] = worldMapMarkers.map((marker) => ({
  id: marker.id,
  kind: marker.kind,
  title: marker.title,
  point: projectWorldToMap(marker.position.x, marker.position.z),
  landmarkId: marker.landmarkId,
}));

const mapRegionDefinitions = [
  ["forest-southwest", "forest", -100, -112, 58, 44, 0.2],
  ["forest-low-east", "forest", 92, -38, 68, 56, 1.1],
  ["forest-fir-gate", "forest", 54, 82, 74, 46, 2.2],
  ["forest-ridge-west", "forest", -78, 164, 58, 42, 0.7],
  ["meadow-burrow", "meadow", -54, -130, 76, 54, 2.7],
  ["meadow-silver", "meadow", -6, 8, 86, 58, 1.8],
  ["ridge-crown", "ridge", 6, 204, 86, 46, 0.3],
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
