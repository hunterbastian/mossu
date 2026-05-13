import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from "three";
import { sampleBaseTerrainHeight, sampleIslandBoundaryPoint } from "../../simulation/world";

const ISLAND_UNDERSIDE_SEGMENTS = 128;

export function buildSmoothIslandUnderside(center: Vector3, rimHeight: number) {
  const ringProfiles = [
    { scale: 0.99, drop: 34, wobble: 2.2, tone: 0 },
    { scale: 0.74, drop: 74, wobble: 5.0, tone: 0.18 },
    { scale: 0.54, drop: 116, wobble: 7.2, tone: 0.34 },
    { scale: 0.37, drop: 158, wobble: 7.4, tone: 0.5 },
    { scale: 0.23, drop: 202, wobble: 6.1, tone: 0.64 },
    { scale: 0.12, drop: 238, wobble: 4.2, tone: 0.75 },
    { scale: 0.052, drop: 266, wobble: 2.6, tone: 0.84 },
    { scale: 0.022, drop: 288, wobble: 1.2, tone: 0.9 },
  ] as const;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const topColor = new Color("#b7a875");
  const bellyColor = new Color("#788173");

  ringProfiles.forEach((profile, ringIndex) => {
    const ringT = ringIndex / (ringProfiles.length - 1);
    for (let segment = 0; segment < ISLAND_UNDERSIDE_SEGMENTS; segment += 1) {
      const angle = (segment / ISLAND_UNDERSIDE_SEGMENTS) * Math.PI * 2;
      const boundary = sampleIslandBoundaryPoint(angle);
      const baseY = sampleBaseTerrainHeight(boundary.x, boundary.z) - profile.drop;
      const smoothedY = rimHeight - profile.drop - 5 * ringT;
      const localWeight = Math.max(0.18, 1 - ringT * 0.82);
      const ripple = Math.sin(angle * 3.4 + ringIndex * 0.77) * profile.wobble;
      const frontKeel = Math.max(0, Math.cos(angle - Math.PI * 1.5));
      const shoulder = 1 + Math.sin(angle * 5.2 - ringIndex * 0.31) * 0.012 * (1 - ringT);
      const x = center.x + (boundary.x - center.x) * profile.scale * shoulder;
      const z = center.z + (boundary.z - center.z) * profile.scale * shoulder;
      const y = baseY * localWeight + smoothedY * (1 - localWeight) + ripple - frontKeel * ringT * ringT * 10;
      const color = topColor.clone().lerp(bellyColor, profile.tone);
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  });

  for (let ringIndex = 0; ringIndex < ringProfiles.length - 1; ringIndex += 1) {
    const ringStart = ringIndex * ISLAND_UNDERSIDE_SEGMENTS;
    const nextRingStart = (ringIndex + 1) * ISLAND_UNDERSIDE_SEGMENTS;
    for (let segment = 0; segment < ISLAND_UNDERSIDE_SEGMENTS; segment += 1) {
      const nextSegment = (segment + 1) % ISLAND_UNDERSIDE_SEGMENTS;
      indices.push(
        ringStart + segment,
        ringStart + nextSegment,
        nextRingStart + segment,
        ringStart + nextSegment,
        nextRingStart + nextSegment,
        nextRingStart + segment,
      );
    }
  }

  const capIndex = positions.length / 3;
  positions.push(center.x, rimHeight - 304, center.z - 12);
  colors.push(bellyColor.r, bellyColor.g, bellyColor.b);
  const lastRingStart = (ringProfiles.length - 1) * ISLAND_UNDERSIDE_SEGMENTS;
  for (let segment = 0; segment < ISLAND_UNDERSIDE_SEGMENTS; segment += 1) {
    const nextSegment = (segment + 1) % ISLAND_UNDERSIDE_SEGMENTS;
    indices.push(lastRingStart + nextSegment, capIndex, lastRingStart + segment);
  }

  const geometry = new BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
