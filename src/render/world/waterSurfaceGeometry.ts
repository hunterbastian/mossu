import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  MathUtils,
  Vector3,
} from "three";
import {
  sampleFilledWaterSurfaceY,
  sampleTerrainHeight,
  sampleTerrainNormal,
} from "../../simulation/world";
import type { WaterProfile } from "./waterProfiles";
import { waterDepth } from "./WaterDepth";

export interface WaterSurfaceOptions {
  profile: WaterProfile;
  width: number | ((point: Vector3, t: number) => number);
  segments?: number;
  levelOffset?: number;
  opacity?: number;
  flowSpeed?: number;
  flowDirection?: number;
  flowBraidStrength?: number;
}

const WATER_RIBBON_COLUMNS = [-1.1, -0.96, -0.78, -0.56, -0.3, 0, 0.3, 0.56, 0.78, 0.96, 1.1];
const WATER_VOLUME_MIN_DROP = 0.78;
const WATER_VOLUME_BED_CLEARANCE = 0.05;

function getWaterWidth(options: WaterSurfaceOptions, point: Vector3, t: number) {
  const baseWidth = typeof options.width === "function" ? options.width(point, t) : options.width;
  return baseWidth * options.profile.widthScale;
}

export function sampleRenderedWaterSurfaceY(flatSurfaceY: number, x: number, z: number, bank = 0, edgeBlend = 0) {
  return sampleFilledWaterSurfaceY(flatSurfaceY, x, z, bank, edgeBlend);
}

export function buildWaterRibbonGeometry(points: Vector3[], options: WaterSurfaceOptions) {
  const curve = new CatmullRomCurve3(points, false, "centripetal");
  const divisions = options.segments ?? Math.max(32, points.length * 14);
  const samples = curve.getSpacedPoints(divisions);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const channelValues: number[] = [];
  const bankValues: number[] = [];
  const slopeValues: number[] = [];
  const flowTValues: number[] = [];
  const flowCurlValues: number[] = [];
  const waterDepthValues: number[] = [];
  const fillLiftValues: number[] = [];
  const lateral = new Vector3();
  const tangent = new Vector3();
  const prevTangent = new Vector3();
  const nextTangent = new Vector3();
  const prevDelta = new Vector3();
  const nextDelta = new Vector3();
  const levelOffset = options.levelOffset ?? options.profile.levelOffset;
  const flowDirection = resolveWaterFlowDirection(points, options.flowDirection);
  const flowBraidStrength = options.flowBraidStrength ?? 0.35;

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    tangent.subVectors(next, prev);
    tangent.y = 0;
    if (tangent.lengthSq() < 1e-5) {
      tangent.set(0, 0, 1);
    } else {
      tangent.normalize();
    }
    prevTangent.subVectors(sample, prev).setY(0);
    nextTangent.subVectors(next, sample).setY(0);
    if (prevTangent.lengthSq() < 1e-5) {
      prevTangent.copy(tangent);
    } else {
      prevTangent.normalize();
    }
    if (nextTangent.lengthSq() < 1e-5) {
      nextTangent.copy(tangent);
    } else {
      nextTangent.normalize();
    }
    const bendCurl = MathUtils.clamp((prevTangent.x * nextTangent.z - prevTangent.z * nextTangent.x) * 18, -1, 1);

    lateral.set(-tangent.z, 0, tangent.x).normalize();
    const t = samples.length > 1 ? i / (samples.length - 1) : 0;
    const halfWidth = Math.max(0.48, getWaterWidth(options, sample, t) * 0.5);
    const rowY = Math.max(sample.y, sampleTerrainHeight(sample.x, sample.z) + levelOffset);
    prevDelta.subVectors(sample, prev);
    nextDelta.subVectors(next, sample);
    const run = Math.max(1.2, prevDelta.length() + nextDelta.length());
    const rise = Math.abs(prevDelta.y) + Math.abs(nextDelta.y);
    const localSlope = MathUtils.clamp((rise / run) * 6.5, 0, 1);

    WATER_RIBBON_COLUMNS.forEach((offset, columnIndex) => {
      const edgeDip = Math.pow(MathUtils.clamp(Math.abs(offset), 0, 1), 2.4) * 0.012;
      const channel = MathUtils.clamp(1 - Math.abs(offset), 0, 1);
      const bank = 1 - channel;
      const x = sample.x + lateral.x * halfWidth * offset;
      const z = sample.z + lateral.z * halfWidth * offset;
      const filledY = sampleRenderedWaterSurfaceY(rowY, x, z, bank);
      const depthSample = waterDepth.sample(filledY, x, z);
      const y = filledY - edgeDip;
      positions.push(x, y, z);
      uvs.push(columnIndex / (WATER_RIBBON_COLUMNS.length - 1), t);
      channelValues.push(channel);
      bankValues.push(bank);
      slopeValues.push(localSlope);
      flowTValues.push(t);
      flowCurlValues.push(MathUtils.clamp(bendCurl + offset * flowBraidStrength * 0.42, -1, 1));
      waterDepthValues.push(depthSample.depth);
      fillLiftValues.push(Math.max(0, filledY - rowY));
    });
  }

  for (let row = 0; row < samples.length - 1; row += 1) {
    const rowOffset = row * WATER_RIBBON_COLUMNS.length;
    const nextOffset = (row + 1) * WATER_RIBBON_COLUMNS.length;
    for (let column = 0; column < WATER_RIBBON_COLUMNS.length - 1; column += 1) {
      const a = rowOffset + column;
      const b = nextOffset + column;
      const c = nextOffset + column + 1;
      const d = rowOffset + column + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aChannel", new Float32BufferAttribute(channelValues, 1));
  geometry.setAttribute("aBank", new Float32BufferAttribute(bankValues, 1));
  geometry.setAttribute("aSlope", new Float32BufferAttribute(slopeValues, 1));
  geometry.setAttribute("aFlowT", new Float32BufferAttribute(flowTValues, 1));
  geometry.setAttribute("aFlowCurl", new Float32BufferAttribute(flowCurlValues, 1));
  geometry.setAttribute("aWaterDepth", new Float32BufferAttribute(waterDepthValues, 1));
  geometry.setAttribute("aFillLift", new Float32BufferAttribute(fillLiftValues, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return { geometry, flowDirection };
}

export function resolveWaterFlowDirection(points: Vector3[], override?: number) {
  if (typeof override === "number" && override !== 0) {
    return Math.sign(override);
  }

  let downhillBias = 0;
  for (let i = 1; i < points.length; i += 1) {
    downhillBias += points[i - 1].y - points[i].y;
  }
  return downhillBias >= 0 ? 1 : -1;
}

export function createLakeGeometry(
  center: Vector3,
  radiusX: number,
  radiusZ: number,
  radialSegments = 48,
  rings = 6,
  edgeSoftness = 0.3,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const channelValues: number[] = [];
  const bankValues: number[] = [];
  const slopeValues: number[] = [];
  const flowTValues: number[] = [];
  const flowCurlValues: number[] = [];
  const waterDepthValues: number[] = [];
  const fillLiftValues: number[] = [];
  const totalRings = Math.max(2, rings);
  const totalSegments = Math.max(16, radialSegments);
  const surfaceY = center.y;

  positions.push(center.x, surfaceY, center.z);
  uvs.push(0.5, 0.5);
  channelValues.push(1);
  bankValues.push(0);
  slopeValues.push(0.08);
  flowTValues.push(0);
  flowCurlValues.push(0.18);
  waterDepthValues.push(waterDepth.sample(surfaceY, center.x, center.z).depth);
  fillLiftValues.push(0);

  for (let ring = 1; ring <= totalRings; ring += 1) {
    const ringT = ring / totalRings;
    for (let segment = 0; segment <= totalSegments; segment += 1) {
      const angleT = segment / totalSegments;
      const angle = angleT * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radiusX * ringT;
      const z = center.z + Math.sin(angle) * radiusZ * ringT;
      const edgeBlend = MathUtils.smoothstep(1 - edgeSoftness, 1, ringT);
      const filledY = sampleRenderedWaterSurfaceY(surfaceY, x, z, MathUtils.clamp(ringT, 0, 1), edgeBlend);
      const depthSample = waterDepth.sample(filledY, x, z);
      const y = filledY;
      positions.push(x, y, z);
      uvs.push(0.5 + Math.cos(angle) * ringT * 0.5, 0.5 + Math.sin(angle) * ringT * 0.5);
      channelValues.push(MathUtils.clamp(1 - ringT ** 1.3, 0, 1));
      bankValues.push(MathUtils.clamp(ringT ** 1.1, 0, 1));
      slopeValues.push(MathUtils.clamp((1 - sampleTerrainNormal(x, z).y) * 2.8 + edgeBlend * 0.14, 0.04, 0.32));
      flowTValues.push(angleT);
      flowCurlValues.push(Math.sin(angle * 2.0) * 0.2 + ringT * 0.18);
      waterDepthValues.push(depthSample.depth);
      fillLiftValues.push(Math.max(0, filledY - surfaceY));
    }
  }

  const ringVertexCount = totalSegments + 1;
  for (let segment = 0; segment < totalSegments; segment += 1) {
    const a = 0;
    const b = 1 + segment;
    const c = 1 + segment + 1;
    indices.push(a, b, c);
  }

  for (let ring = 1; ring < totalRings; ring += 1) {
    const ringStart = 1 + (ring - 1) * ringVertexCount;
    const nextRingStart = ringStart + ringVertexCount;
    for (let segment = 0; segment < totalSegments; segment += 1) {
      const a = ringStart + segment;
      const b = nextRingStart + segment;
      const c = nextRingStart + segment + 1;
      const d = ringStart + segment + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aChannel", new Float32BufferAttribute(channelValues, 1));
  geometry.setAttribute("aBank", new Float32BufferAttribute(bankValues, 1));
  geometry.setAttribute("aSlope", new Float32BufferAttribute(slopeValues, 1));
  geometry.setAttribute("aFlowT", new Float32BufferAttribute(flowTValues, 1));
  geometry.setAttribute("aFlowCurl", new Float32BufferAttribute(flowCurlValues, 1));
  geometry.setAttribute("aWaterDepth", new Float32BufferAttribute(waterDepthValues, 1));
  geometry.setAttribute("aFillLift", new Float32BufferAttribute(fillLiftValues, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createWaterVolumeGeometry(surfaceGeometry: BufferGeometry) {
  const position = surfaceGeometry.getAttribute("position");
  const uv = surfaceGeometry.getAttribute("uv");
  const channel = surfaceGeometry.getAttribute("aChannel");
  const bank = surfaceGeometry.getAttribute("aBank");
  const slope = surfaceGeometry.getAttribute("aSlope");
  const flowT = surfaceGeometry.getAttribute("aFlowT");
  const flowCurl = surfaceGeometry.getAttribute("aFlowCurl");
  const waterDepth = surfaceGeometry.getAttribute("aWaterDepth");
  const fillLift = surfaceGeometry.getAttribute("aFillLift");
  const index = surfaceGeometry.index;

  const volumeGeometry = new BufferGeometry();
  if (!position || !index) {
    return volumeGeometry;
  }

  const boundaryEdges = new Map<string, { a: number; b: number; count: number }>();
  const addEdge = (a: number, b: number) => {
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    const key = `${min}:${max}`;
    const existing = boundaryEdges.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    boundaryEdges.set(key, { a, b, count: 1 });
  };

  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const channelValues: number[] = [];
  const bankValues: number[] = [];
  const slopeValues: number[] = [];
  const flowTValues: number[] = [];
  const flowCurlValues: number[] = [];
  const waterDepthValues: number[] = [];
  const fillLiftValues: number[] = [];
  const volumeSurfaceValues: number[] = [];
  const volumeDropValues: number[] = [];

  const pushVertex = (sourceIndex: number, surface: number) => {
    const x = position.getX(sourceIndex);
    const y = position.getY(sourceIndex);
    const z = position.getZ(sourceIndex);
    const bottomY = Math.min(y - WATER_VOLUME_MIN_DROP, sampleTerrainHeight(x, z) + WATER_VOLUME_BED_CLEARANCE);
    const drop = Math.max(WATER_VOLUME_MIN_DROP, y - bottomY);
    positions.push(x, surface > 0 ? y : bottomY, z);
    uvs.push(uv?.getX(sourceIndex) ?? 0, uv?.getY(sourceIndex) ?? 0);
    channelValues.push(channel?.getX(sourceIndex) ?? 0.5);
    bankValues.push(bank?.getX(sourceIndex) ?? 0.5);
    slopeValues.push(slope?.getX(sourceIndex) ?? 0.08);
    flowTValues.push(flowT?.getX(sourceIndex) ?? 0);
    flowCurlValues.push(flowCurl?.getX(sourceIndex) ?? 0);
    waterDepthValues.push(waterDepth?.getX(sourceIndex) ?? drop);
    fillLiftValues.push(fillLift?.getX(sourceIndex) ?? 0);
    volumeSurfaceValues.push(surface);
    volumeDropValues.push(drop);
  };

  boundaryEdges.forEach((edge) => {
    if (edge.count !== 1) {
      return;
    }
    const base = positions.length / 3;
    pushVertex(edge.a, 1);
    pushVertex(edge.b, 1);
    pushVertex(edge.b, 0);
    pushVertex(edge.a, 0);
    indices.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
  });

  volumeGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  volumeGeometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  volumeGeometry.setAttribute("aChannel", new Float32BufferAttribute(channelValues, 1));
  volumeGeometry.setAttribute("aBank", new Float32BufferAttribute(bankValues, 1));
  volumeGeometry.setAttribute("aSlope", new Float32BufferAttribute(slopeValues, 1));
  volumeGeometry.setAttribute("aFlowT", new Float32BufferAttribute(flowTValues, 1));
  volumeGeometry.setAttribute("aFlowCurl", new Float32BufferAttribute(flowCurlValues, 1));
  volumeGeometry.setAttribute("aWaterDepth", new Float32BufferAttribute(waterDepthValues, 1));
  volumeGeometry.setAttribute("aFillLift", new Float32BufferAttribute(fillLiftValues, 1));
  volumeGeometry.setAttribute("aVolumeSurface", new Float32BufferAttribute(volumeSurfaceValues, 1));
  volumeGeometry.setAttribute("aVolumeDrop", new Float32BufferAttribute(volumeDropValues, 1));
  volumeGeometry.setIndex(indices);
  volumeGeometry.computeVertexNormals();
  return volumeGeometry;
}
