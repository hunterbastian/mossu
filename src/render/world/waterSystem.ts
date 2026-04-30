import {
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  Vector4,
} from "three";
import { OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";
import { GrassShader } from "./grassSystem";
import {
  ALPINE_RUNOFF_SURFACE_OFFSET,
  FOOTHILL_CREEK_SURFACE_OFFSET,
  HIGHLAND_CREEK_PATHS,
  MAIN_RIVER_SURFACE_OFFSET,
  RIVER_BRANCH_SEGMENTS,
  RIVER_WATER_VISUAL_FILL_SCALE,
  STARTING_WATER_POOLS,
  STARTING_WATER_VISUAL_FILL_SCALE,
  sampleFilledWaterSurfaceY,
  sampleRiverChannelAt,
  sampleRiverChannelCenter,
  sampleRiverRenderWidthScale,
  sampleTerrainHeight,
  sampleTerrainNormal,
  sampleWaterState,
  WATERFALL_OUTFLOW_SURFACE_OFFSET,
  type HighlandCreekPath,
  type RiverChannelId,
  type StartingWaterPool,
} from "../../simulation/world";
import { waterDepth } from "./WaterDepth";

type WaterProfileKey = "mainRiver" | "stillPool" | "foothillCreek" | "alpineRunoff" | "waterfallOutflow";
type WaterSurfaceBackend = "webgl";
const futureLakeArt = OOT_PS2_GRASSLANDS_PALETTE.futureLakes;

interface WaterProfile {
  key: WaterProfileKey;
  widthScale: number;
  levelOffset: number;
  opacity: number;
  depthColorScale: number;
  flowSpeed: number;
  roughness: number;
  metalness: number;
  baseWaveAmplitude: number;
  detailWaveAmplitude: number;
  baseFrequency: number;
  detailFrequency: number;
  shallowColor: string;
  deepColor: string;
  foamColor: string;
  shorelineMilkColor: string;
  highlightColor: string;
  sparkleColor: string;
  reflectionColor: string;
  sedimentColor: string;
  bedColor: string;
  causticColor: string;
  shorelineFoamStrength: number;
  shorelineMilkStrength: number;
  slopeFoamStrength: number;
  highlightStrength: number;
  clarity: number;
  rippleContrast: number;
  depthShadowStrength: number;
  causticStrength: number;
  sparkleStrength: number;
}

interface WaterSurfaceOptions {
  profile: WaterProfile;
  width: number | ((point: Vector3, t: number) => number);
  segments?: number;
  levelOffset?: number;
  opacity?: number;
  flowSpeed?: number;
  flowDirection?: number;
  flowBraidStrength?: number;
}

export interface WaterRippleSource {
  x: number;
  z: number;
  startTime: number;
  strength: number;
}

export interface WaterSurfaceController {
  mesh: Mesh;
  update: (
    elapsed: number,
    ripples?: readonly WaterRippleSource[],
    mapLookdown?: boolean,
    depthDebug?: boolean,
  ) => void;
  dispose?: () => void;
}

export interface WaterSurfaceGroup {
  group: Group;
  controllers: WaterSurfaceController[];
}

interface WaterRippleActorState {
  inWater: boolean;
  lastEmitAt: number;
}

type SharedWaterWaveUniforms = {
  uTime: { value: number };
  uRippleTime: { value: number };
  uRippleCount: { value: number };
  uRippleSources: { value: Vector4[] };
  uMapLookdown: { value: number };
  uFlowSpeed: { value: number };
  uFlowDirection: { value: number };
  uBaseWaveAmplitude: { value: number };
  uDetailWaveAmplitude: { value: number };
  uBaseFrequency: { value: number };
  uDetailFrequency: { value: number };
  uDepthDebug: { value: number };
};

interface WaterSurfaceResources {
  mesh: Mesh;
  surfaceGeometry: BufferGeometry;
  volumeGeometry: BufferGeometry;
  material: MeshBasicMaterial;
  volumeMaterial: MeshBasicMaterial;
  fillMaterial: MeshBasicMaterial;
  uniforms: SharedWaterWaveUniforms;
  baseOpacity: number;
  phaseOffset: number;
}

export interface WaterSystemOptions {
  depthDebug?: boolean;
  includeBaseWater?: boolean;
}

export interface WaterSystemTuning {
  waterLevel: number;
  shallowColor: string;
  deepColor: string;
  depthMax: number;
  waveSpeed: number;
  waveScale: number;
  distortionStrength: number;
  foamDistance: number;
  shoreFadeDistance: number;
  swimDepthThreshold: number;
  wadeDepthThreshold: number;
}

export const WATER_SYSTEM_TUNING: WaterSystemTuning = {
  waterLevel: MAIN_RIVER_SURFACE_OFFSET,
  shallowColor: "#6fcbd0",
  deepColor: "#1d7195",
  depthMax: 5.2,
  waveSpeed: 0.82,
  waveScale: 1,
  distortionStrength: 0.16,
  foamDistance: 0.26,
  shoreFadeDistance: 0.18,
  swimDepthThreshold: 1.35,
  wadeDepthThreshold: 0.32,
};

export class WaterSurface implements WaterSurfaceController {
  readonly mesh: Mesh;

  constructor(private readonly resources: WaterSurfaceResources) {
    this.mesh = resources.mesh;
  }

  update(
    elapsed: number,
    ripples: readonly WaterRippleSource[] = [],
    mapLookdown = false,
    depthDebug = false,
  ) {
    const { material, uniforms, baseOpacity } = this.resources;
    material.opacity = mapLookdown ? 0.98 : baseOpacity;
    uniforms.uTime.value = elapsed + this.resources.phaseOffset;
    uniforms.uRippleTime.value = elapsed;
    uniforms.uRippleCount.value = Math.min(WATER_RIPPLE_LIMIT, ripples.length);
    uniforms.uMapLookdown.value = mapLookdown ? 1 : 0;
    uniforms.uDepthDebug.value = depthDebug ? 1 : 0;
    const sources = uniforms.uRippleSources.value;
    for (let i = 0; i < WATER_RIPPLE_LIMIT; i += 1) {
      const ripple = ripples[i];
      sources[i].set(ripple?.x ?? 0, ripple?.z ?? 0, ripple?.startTime ?? -999, ripple?.strength ?? 0);
    }
  }

  dispose() {
    const { surfaceGeometry, volumeGeometry, material, volumeMaterial, fillMaterial } = this.resources;
    surfaceGeometry.dispose();
    volumeGeometry.dispose();
    material.dispose();
    volumeMaterial.dispose();
    fillMaterial.dispose();
  }
}

export class WaterSystem {
  readonly group = new Group();
  private readonly controllers: WaterSurfaceController[] = [];
  private readonly ripples: WaterRippleSource[] = [];
  private readonly actorStates = new Map<string, WaterRippleActorState>();
  private depthDebugEnabled: boolean;

  constructor(options: WaterSystemOptions = {}) {
    this.depthDebugEnabled = options.depthDebug ?? false;
    if (options.includeBaseWater ?? true) {
      this.addWaterGroup(buildRiverSystem());
      this.addWaterGroup(buildStartingWaterSystem());
    }
  }

  addWaterGroup(surfaceGroup: WaterSurfaceGroup) {
    this.group.add(surfaceGroup.group);
    this.controllers.push(...surfaceGroup.controllers);
  }

  getControllers() {
    return this.controllers;
  }

  setDepthDebugEnabled(enabled: boolean) {
    this.depthDebugEnabled = enabled;
  }

  getDepthDebugEnabled() {
    return this.depthDebugEnabled;
  }

  beginFrame(elapsed: number) {
    for (let index = this.ripples.length - 1; index >= 0; index -= 1) {
      if (elapsed - this.ripples[index].startTime > WATER_RIPPLE_LIFETIME) {
        this.ripples.splice(index, 1);
      }
    }
  }

  emitRippleForActor(
    key: string,
    position: Vector3,
    planarSpeed: number,
    elapsed: number,
    baseStrength: number,
    force = false,
  ) {
    const water = sampleWaterState(position.x, position.z);
    const inWater = !!water && water.depth > WATER_RIPPLE_MIN_DEPTH;
    const state = this.actorStates.get(key) ?? { inWater: false, lastEmitAt: -999 };
    const enteredWater = inWater && !state.inWater;

    if (inWater && water) {
      const speedFactor = MathUtils.clamp(planarSpeed / 9, 0, 1);
      const depthFactor = water.swimAllowed ? 1 : MathUtils.clamp(water.depth / 1.8, 0.35, 1);
      const interval = MathUtils.lerp(0.36, 0.12, speedFactor) * (baseStrength < 0.7 ? 1.18 : 1);
      if ((force || enteredWater || speedFactor > 0.12) && elapsed - state.lastEmitAt >= (force ? 0.04 : interval)) {
        this.ripples.push({
          x: position.x,
          z: position.z,
          startTime: elapsed,
          strength: MathUtils.clamp(baseStrength * (0.52 + speedFactor * 0.58) * depthFactor, 0.24, 1.45),
        });
        state.lastEmitAt = elapsed;
        if (this.ripples.length > WATER_RIPPLE_LIMIT) {
          this.ripples.splice(0, this.ripples.length - WATER_RIPPLE_LIMIT);
        }
      }
    }

    state.inWater = inWater;
    this.actorStates.set(key, state);
  }

  markActorDry(key: string) {
    const state = this.actorStates.get(key);
    if (state) {
      state.inWater = false;
    }
  }

  update(elapsed: number, mapLookdown: boolean) {
    this.controllers.forEach((controller) => {
      controller.update(elapsed, this.ripples, mapLookdown, this.depthDebugEnabled);
    });
  }
}

const WATER_PROFILES: Record<WaterProfileKey, WaterProfile> = {
  // Early-2000s adventure water: opaque blue-green bands, small vertex motion, chunky foam, minimal glass.
  mainRiver: {
    key: "mainRiver",
    widthScale: 1.02,
    levelOffset: MAIN_RIVER_SURFACE_OFFSET,
    opacity: 0.8,
    depthColorScale: 4.2,
    flowSpeed: 0.82,
    roughness: 0.9,
    metalness: 0,
    baseWaveAmplitude: 0.018,
    detailWaveAmplitude: 0.006,
    baseFrequency: 18,
    detailFrequency: 34,
    shallowColor: "#68c5d6",
    deepColor: "#176fa4",
    foamColor: "#fffaf0",
    shorelineMilkColor: "#f3ecd0",
    highlightColor: "#fff0bd",
    sparkleColor: "#fff9da",
    reflectionColor: "#9bd2e4",
    sedimentColor: "#bdc887",
    bedColor: "#5d896a",
    causticColor: "#fff6d8",
    shorelineFoamStrength: 0.42,
    shorelineMilkStrength: 0.3,
    slopeFoamStrength: 0.1,
    highlightStrength: 0.08,
    clarity: 0.55,
    rippleContrast: 0.64,
    depthShadowStrength: 0.24,
    causticStrength: 0.04,
    sparkleStrength: 0.03,
  },
  stillPool: {
    key: "stillPool",
    widthScale: 1,
    levelOffset: MAIN_RIVER_SURFACE_OFFSET,
    opacity: 0.76,
    depthColorScale: 5.6,
    flowSpeed: 0.38,
    roughness: 0.92,
    metalness: 0,
    baseWaveAmplitude: 0.012,
    detailWaveAmplitude: 0.004,
    baseFrequency: 14,
    detailFrequency: 28,
    shallowColor: "#65c7d5",
    deepColor: "#186fa2",
    foamColor: "#fff9eb",
    shorelineMilkColor: "#ede4c5",
    highlightColor: "#fff0bd",
    sparkleColor: "#fffce6",
    reflectionColor: "#b5e5ef",
    sedimentColor: "#aeb78a",
    bedColor: "#637d68",
    causticColor: "#fff8dc",
    shorelineFoamStrength: 0.4,
    shorelineMilkStrength: 0.3,
    slopeFoamStrength: 0.11,
    highlightStrength: 0.08,
    clarity: 0.58,
    rippleContrast: 0.56,
    depthShadowStrength: 0.23,
    causticStrength: 0.04,
    sparkleStrength: 0.025,
  },
  foothillCreek: {
    key: "foothillCreek",
    widthScale: 0.92,
    levelOffset: FOOTHILL_CREEK_SURFACE_OFFSET,
    opacity: 1,
    depthColorScale: 1.8,
    flowSpeed: 1.18,
    roughness: 0.88,
    metalness: 0,
    baseWaveAmplitude: 0.024,
    detailWaveAmplitude: 0.008,
    baseFrequency: 24,
    detailFrequency: 44,
    shallowColor: "#9bdce2",
    deepColor: "#4a97aa",
    foamColor: "#fff9ed",
    shorelineMilkColor: "#edf0e2",
    highlightColor: "#f6d3a0",
    sparkleColor: "#fff5d4",
    reflectionColor: "#cae2ed",
    sedimentColor: "#e0dfbd",
    bedColor: "#96a484",
    causticColor: "#f4f1cc",
    shorelineFoamStrength: 0.42,
    shorelineMilkStrength: 0.22,
    slopeFoamStrength: 0.34,
    highlightStrength: 0.1,
    clarity: 0.52,
    rippleContrast: 0.68,
    depthShadowStrength: 0.18,
    causticStrength: 0.05,
    sparkleStrength: 0.04,
  },
  alpineRunoff: {
    key: "alpineRunoff",
    widthScale: 0.88,
    levelOffset: ALPINE_RUNOFF_SURFACE_OFFSET,
    opacity: 1,
    depthColorScale: 1.3,
    flowSpeed: 1.46,
    roughness: 0.88,
    metalness: 0,
    baseWaveAmplitude: 0.028,
    detailWaveAmplitude: 0.01,
    baseFrequency: 28,
    detailFrequency: 52,
    shallowColor: "#a9d6e5",
    deepColor: "#5289b6",
    foamColor: "#f8faf8",
    shorelineMilkColor: "#edf2e8",
    highlightColor: "#f9ddaf",
    sparkleColor: "#fdf9e8",
    reflectionColor: "#d7e7f4",
    sedimentColor: "#ccd9cf",
    bedColor: "#7f8e87",
    causticColor: "#eef4db",
    shorelineFoamStrength: 0.4,
    shorelineMilkStrength: 0.18,
    slopeFoamStrength: 0.52,
    highlightStrength: 0.12,
    clarity: 0.5,
    rippleContrast: 0.72,
    depthShadowStrength: 0.18,
    causticStrength: 0.05,
    sparkleStrength: 0.045,
  },
  waterfallOutflow: {
    key: "waterfallOutflow",
    widthScale: 0.9,
    levelOffset: WATERFALL_OUTFLOW_SURFACE_OFFSET,
    opacity: 1,
    depthColorScale: 1.05,
    flowSpeed: 1.68,
    roughness: 0.86,
    metalness: 0,
    baseWaveAmplitude: 0.032,
    detailWaveAmplitude: 0.012,
    baseFrequency: 32,
    detailFrequency: 58,
    shallowColor: "#bfe3ec",
    deepColor: "#5aa8cc",
    foamColor: "#fffdf6",
    shorelineMilkColor: "#f4f4ec",
    highlightColor: "#fde2b7",
    sparkleColor: "#fff9ef",
    reflectionColor: "#dfeefa",
    sedimentColor: "#d7ded3",
    bedColor: "#879089",
    causticColor: "#f7f5e5",
    shorelineFoamStrength: 0.55,
    shorelineMilkStrength: 0.24,
    slopeFoamStrength: 0.72,
    highlightStrength: 0.16,
    clarity: 0.5,
    rippleContrast: 0.76,
    depthShadowStrength: 0.18,
    causticStrength: 0.04,
    sparkleStrength: 0.04,
  },
};

const WATER_RIBBON_COLUMNS = [-1.1, -0.96, -0.78, -0.56, -0.3, 0, 0.3, 0.56, 0.78, 0.96, 1.1];
const WATER_RIPPLE_LIMIT = 4;
const WATER_RIPPLE_LIFETIME = 1.45;
const WATER_RIPPLE_MIN_DEPTH = 0.16;
/** Under-surface copy of the mesh; a bit lower hides cracks between the two layers. */
const WATER_UNDERFILL_OFFSET = -0.1;
const WATER_VOLUME_MIN_DROP = 0.78;
const WATER_VOLUME_BED_CLEARANCE = 0.05;
interface WaterfallAccent {
  group: Group;
  controller: WaterSurfaceController;
}

function getWaterWidth(options: WaterSurfaceOptions, point: Vector3, t: number) {
  const baseWidth = typeof options.width === "function" ? options.width(point, t) : options.width;
  return baseWidth * options.profile.widthScale;
}

export function sampleRenderedWaterSurfaceY(flatSurfaceY: number, x: number, z: number, bank = 0, edgeBlend = 0) {
  return sampleFilledWaterSurfaceY(flatSurfaceY, x, z, bank, edgeBlend);
}

function buildWaterRibbonGeometry(points: Vector3[], options: WaterSurfaceOptions) {
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
    const bendCurl = MathUtils.clamp(
      (prevTangent.x * nextTangent.z - prevTangent.z * nextTangent.x) * 18,
      -1,
      1,
    );

    lateral.set(-tangent.z, 0, tangent.x).normalize();
    const t = samples.length > 1 ? i / (samples.length - 1) : 0;
    const halfWidth = Math.max(0.48, getWaterWidth(options, sample, t) * 0.5);
    const rowY = Math.max(sample.y, sampleTerrainHeight(sample.x, sample.z) + levelOffset);
    prevDelta.subVectors(sample, prev);
    nextDelta.subVectors(next, sample);
    const run = Math.max(1.2, prevDelta.length() + nextDelta.length());
    const rise = Math.abs(prevDelta.y) + Math.abs(nextDelta.y);
    const localSlope = MathUtils.clamp(rise / run * 6.5, 0, 1);

    WATER_RIBBON_COLUMNS.forEach((offset, columnIndex) => {
      const edgeDip = Math.pow(MathUtils.clamp(Math.abs(offset), 0, 1), 2.4) * 0.012;
      const channel = MathUtils.clamp(1 - Math.abs(offset), 0, 1);
      const bank = 1 - channel;
      const x = sample.x + lateral.x * halfWidth * offset;
      const z = sample.z + lateral.z * halfWidth * offset;
      const filledY = sampleRenderedWaterSurfaceY(rowY, x, z, bank);
      const depthSample = waterDepth.sample(filledY, x, z);
      const y = filledY - edgeDip;
      positions.push(
        x,
        y,
        z,
      );
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

function resolveWaterFlowDirection(points: Vector3[], override?: number) {
  if (typeof override === "number" && override !== 0) {
    return Math.sign(override);
  }

  let downhillBias = 0;
  for (let i = 1; i < points.length; i += 1) {
    downhillBias += points[i - 1].y - points[i].y;
  }
  return downhillBias >= 0 ? 1 : -1;
}

function createLakeGeometry(
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

function createWaterVolumeGeometry(surfaceGeometry: BufferGeometry) {
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

function createWebGLWaterController(
  geometry: BufferGeometry,
  profile: WaterProfile,
  options: WaterSurfaceOptions,
  flowDirection: number,
  phaseOffset: number,
): WaterSurfaceController {
  const shallowColor = new Color(profile.shallowColor);
  const deepColor = new Color(profile.deepColor);
  const foamColor = new Color(profile.foamColor);
  const shorelineMilkColor = new Color(profile.shorelineMilkColor);
  const highlightColor = new Color(profile.highlightColor);
  const sparkleColor = new Color(profile.sparkleColor);
  const reflectionColor = new Color(profile.reflectionColor);
  const sedimentColor = new Color(profile.sedimentColor);
  const bedColor = new Color(profile.bedColor);
  const causticColor = new Color(profile.causticColor);
  const rippleUniforms = Array.from({ length: WATER_RIPPLE_LIMIT }, () => new Vector4(0, 0, -999, 0));
  /** Time/ripple/flow uniforms shared with underfill so both surfaces get identical vertex displacement. */
  const sharedWaterWaveUniforms = {
    uTime: { value: 0 },
    uRippleTime: { value: 0 },
    uRippleCount: { value: 0 },
    uRippleSources: { value: rippleUniforms },
    uMapLookdown: { value: 0 },
    uFlowSpeed: { value: options.flowSpeed ?? profile.flowSpeed },
    uFlowDirection: { value: flowDirection },
    uBaseWaveAmplitude: { value: profile.baseWaveAmplitude },
    uDetailWaveAmplitude: { value: profile.detailWaveAmplitude },
    uBaseFrequency: { value: profile.baseFrequency },
    uDetailFrequency: { value: profile.detailFrequency },
    uDepthDebug: { value: 0 },
  };
  const material = new MeshBasicMaterial({
    color: shallowColor,
    transparent: true,
    opacity: options.opacity ?? profile.opacity,
    depthWrite: false,
    side: DoubleSide,
    dithering: true,
  });
  const baseOpacity = material.opacity;
  const fillMaterial = new MeshBasicMaterial({
    color: deepColor.clone().lerp(shallowColor, profile.key === "stillPool" ? 0.36 : 0.28),
    transparent: true,
    opacity: profile.key === "stillPool" ? 0.045 : 0.03,
    depthWrite: false,
    side: FrontSide,
  });
  const volumeGeometry = createWaterVolumeGeometry(geometry);
  const volumeOpacity =
    profile.key === "stillPool" ? 0.024 :
    profile.key === "waterfallOutflow" ? 0.018 :
    profile.key === "alpineRunoff" || profile.key === "foothillCreek" ? 0.022 :
    0.024;
  const volumeMaterial = new MeshBasicMaterial({
    color: deepColor.clone().lerp(shallowColor, profile.key === "stillPool" ? 0.42 : 0.34),
    transparent: true,
    opacity: volumeOpacity,
    depthWrite: false,
    side: FrontSide,
    dithering: true,
  });
  const volumeLayer = new Mesh(volumeGeometry, volumeMaterial);
  volumeLayer.renderOrder = 0;
  volumeLayer.name = `${profile.key}-water-volume`;
  const fillLayer = new Mesh(geometry, fillMaterial);
  fillLayer.renderOrder = 1;
  fillLayer.name = `${profile.key}-water-underfill`;

  volumeMaterial.onBeforeCompile = (shader: GrassShader) => {
    shader.uniforms.uTime = sharedWaterWaveUniforms.uTime;
    shader.uniforms.uRippleTime = sharedWaterWaveUniforms.uRippleTime;
    shader.uniforms.uRippleCount = sharedWaterWaveUniforms.uRippleCount;
    shader.uniforms.uRippleSources = sharedWaterWaveUniforms.uRippleSources;
    shader.uniforms.uMapLookdown = sharedWaterWaveUniforms.uMapLookdown;
    shader.uniforms.uFlowSpeed = sharedWaterWaveUniforms.uFlowSpeed;
    shader.uniforms.uFlowDirection = sharedWaterWaveUniforms.uFlowDirection;
    shader.uniforms.uBaseWaveAmplitude = sharedWaterWaveUniforms.uBaseWaveAmplitude;
    shader.uniforms.uDetailWaveAmplitude = sharedWaterWaveUniforms.uDetailWaveAmplitude;
    shader.uniforms.uBaseFrequency = sharedWaterWaveUniforms.uBaseFrequency;
    shader.uniforms.uDetailFrequency = sharedWaterWaveUniforms.uDetailFrequency;
    shader.uniforms.uDepthDebug = sharedWaterWaveUniforms.uDepthDebug;
    shader.uniforms.uWaterShallow = { value: shallowColor };
    shader.uniforms.uWaterDeep = { value: deepColor };
    shader.uniforms.uWaterSediment = { value: sedimentColor };
    shader.uniforms.uWaterBed = { value: bedColor };
    shader.uniforms.uReflectionColor = { value: reflectionColor };
    shader.uniforms.uDepthColorScale = { value: profile.depthColorScale };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uRippleTime;
        uniform int uRippleCount;
        uniform vec4 uRippleSources[${WATER_RIPPLE_LIMIT}];
        uniform float uMapLookdown;
        uniform float uFlowSpeed;
        uniform float uFlowDirection;
        uniform float uBaseWaveAmplitude;
        uniform float uDetailWaveAmplitude;
        uniform float uBaseFrequency;
        uniform float uDetailFrequency;
        attribute float aChannel;
        attribute float aBank;
        attribute float aSlope;
        attribute float aFlowT;
        attribute float aFlowCurl;
        attribute float aWaterDepth;
        attribute float aFillLift;
        attribute float aVolumeSurface;
        attribute float aVolumeDrop;
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterDepth;
        varying float vWaterFillLift;
        varying float vVolumeSurface;
        varying float vVolumeDrop;
        float waterRippleRingVolume(vec2 worldXZ, float scale) {
          float ripple = 0.0;
          for (int i = 0; i < ${WATER_RIPPLE_LIMIT}; i++) {
            if (i < uRippleCount) {
              vec4 source = uRippleSources[i];
              float age = max(0.0, uRippleTime - source.z);
              float life = 1.45;
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.8 + source.w * 1.8);
              float ring = exp(-abs(distanceToSource - front) * (1.65 + source.w * 0.35));
              ripple += ring * max(0.0, 1.0 - age / life) * source.w * alive * scale;
            }
          }
          return ripple;
        }`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vWaterChannel = aChannel;
        vWaterBank = aBank;
        vWaterDepth = aWaterDepth;
        vWaterFillLift = aFillLift;
        vVolumeSurface = aVolumeSurface;
        vVolumeDrop = aVolumeDrop;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float slopeBoostV = 0.55 + aSlope * 0.95;
        float channelMaskV = 0.35 + aChannel * 0.65;
        float flowCurlV = aFlowCurl;
        float flowWarpV = sin(aFlowT * 15.0 + uv.x * 9.0 + position.x * 0.025 + uTime * 0.45 + flowCurlV * 1.7)
          + cos(aFlowT * 11.0 - uv.x * 12.0 + position.z * 0.018 - uTime * 0.38 + flowCurlV * 2.3);
        float broadFlowV = sin(aFlowT * uBaseFrequency - uTime * uFlowSpeed * 1.35 * uFlowDirection + position.x * 0.03 + position.z * 0.015 + flowWarpV * 0.45 + flowCurlV * 2.2);
        float detailFlowV = cos((aFlowT + uv.x * 0.18 + flowCurlV * 0.035) * uDetailFrequency - uTime * uFlowSpeed * 2.25 * uFlowDirection + position.z * 0.04 + flowWarpV * 0.7);
        float localRippleV = waterRippleRingVolume(position.xz, (0.24 + aChannel * 0.58) * (1.0 - aBank * 0.2));
        float waveVisV = mix(1.0, 0.08, uMapLookdown) * aVolumeSurface;
        transformed.y += broadFlowV * uBaseWaveAmplitude * (0.4 + channelMaskV * 0.6) * slopeBoostV * waveVisV;
        transformed.y += detailFlowV * uDetailWaveAmplitude * (0.35 + aSlope * 0.85) * waveVisV;
        transformed.y += localRippleV * 0.14 * waveVisV;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uWaterShallow;
        uniform vec3 uWaterDeep;
        uniform vec3 uWaterSediment;
        uniform vec3 uWaterBed;
        uniform vec3 uReflectionColor;
        uniform float uDepthColorScale;
        uniform float uDepthDebug;
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterDepth;
        varying float vWaterFillLift;
        varying float vVolumeSurface;
        varying float vVolumeDrop;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float channelMask = pow(clamp(vWaterChannel, 0.0, 1.0), 1.15);
        float bankMask = clamp(vWaterBank, 0.0, 1.0);
        float terrainDepth = smoothstep(0.08, uDepthColorScale, clamp(vWaterDepth + vVolumeDrop * 0.35, 0.0, uDepthColorScale));
        float fillLiftMask = smoothstep(0.02, 0.42, vWaterFillLift);
        float sideDepth = smoothstep(0.2, 4.2, vVolumeDrop);
        vec3 volumeColor = mix(uWaterShallow, uWaterDeep, clamp(0.28 + terrainDepth * 0.5 + sideDepth * 0.28, 0.0, 1.0));
        volumeColor = mix(volumeColor, uWaterBed, (1.0 - vVolumeSurface) * 0.16 + bankMask * 0.08);
        volumeColor = mix(volumeColor, uWaterSediment, bankMask * 0.16 + fillLiftMask * 0.12);
        volumeColor = mix(volumeColor, uReflectionColor, vVolumeSurface * 0.08);
        float volumeAlpha = clamp(
          0.05
          + sideDepth * 0.1
          + terrainDepth * 0.06
          + fillLiftMask * 0.04
          + channelMask * 0.025
          - bankMask * 0.04,
          0.02,
          0.2
        );
        if (uDepthDebug > 0.5) {
          volumeColor = mix(vec3(0.48, 0.95, 0.64), vec3(0.08, 0.22, 0.82), terrainDepth);
          volumeColor = mix(vec3(1.0, 0.92, 0.34), volumeColor, step(0.04, terrainDepth));
          volumeAlpha = 0.26;
        }
        vec4 diffuseColor = vec4(volumeColor, opacity * volumeAlpha);`,
      );
  };

  fillMaterial.onBeforeCompile = (shader: GrassShader) => {
    shader.uniforms.uTime = sharedWaterWaveUniforms.uTime;
    shader.uniforms.uRippleTime = sharedWaterWaveUniforms.uRippleTime;
    shader.uniforms.uRippleCount = sharedWaterWaveUniforms.uRippleCount;
    shader.uniforms.uRippleSources = sharedWaterWaveUniforms.uRippleSources;
    shader.uniforms.uMapLookdown = sharedWaterWaveUniforms.uMapLookdown;
    shader.uniforms.uFlowSpeed = sharedWaterWaveUniforms.uFlowSpeed;
    shader.uniforms.uFlowDirection = sharedWaterWaveUniforms.uFlowDirection;
    shader.uniforms.uBaseWaveAmplitude = sharedWaterWaveUniforms.uBaseWaveAmplitude;
    shader.uniforms.uDetailWaveAmplitude = sharedWaterWaveUniforms.uDetailWaveAmplitude;
    shader.uniforms.uBaseFrequency = sharedWaterWaveUniforms.uBaseFrequency;
    shader.uniforms.uDetailFrequency = sharedWaterWaveUniforms.uDetailFrequency;
    shader.uniforms.uDepthDebug = sharedWaterWaveUniforms.uDepthDebug;
    shader.uniforms.uWaterShallow = { value: shallowColor };
    shader.uniforms.uWaterDeep = { value: deepColor };
    shader.uniforms.uWaterSediment = { value: sedimentColor };
    shader.uniforms.uWaterBed = { value: bedColor };
    shader.uniforms.uDepthColorScale = { value: profile.depthColorScale };
    const underfillY = WATER_UNDERFILL_OFFSET;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uRippleTime;
        uniform int uRippleCount;
        uniform vec4 uRippleSources[${WATER_RIPPLE_LIMIT}];
        uniform float uMapLookdown;
        uniform float uFlowSpeed;
        uniform float uFlowDirection;
        uniform float uBaseWaveAmplitude;
        uniform float uDetailWaveAmplitude;
        uniform float uBaseFrequency;
        uniform float uDetailFrequency;
        attribute float aChannel;
        attribute float aBank;
        attribute float aSlope;
        attribute float aFlowT;
        attribute float aFlowCurl;
        attribute float aWaterDepth;
        attribute float aFillLift;
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterDepth;
        varying float vWaterFillLift;
        float waterRippleRingFill(vec2 worldXZ, float scale) {
          float ripple = 0.0;
          for (int i = 0; i < ${WATER_RIPPLE_LIMIT}; i++) {
            if (i < uRippleCount) {
              vec4 source = uRippleSources[i];
              float age = max(0.0, uRippleTime - source.z);
              float life = 1.45;
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.8 + source.w * 1.8);
              float ring = exp(-abs(distanceToSource - front) * (1.65 + source.w * 0.35));
              float wakeCore = exp(-distanceToSource * 0.42) * 0.18;
              ripple += (ring + wakeCore) * max(0.0, 1.0 - age / life) * source.w * alive * scale;
            }
          }
          return ripple;
        }`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vWaterChannel = aChannel;
        vWaterBank = aBank;
        vWaterDepth = aWaterDepth;
        vWaterFillLift = aFillLift;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float slopeBoostF = 0.55 + aSlope * 0.95;
        float channelMaskF = 0.35 + aChannel * 0.65;
        float flowCurlF = aFlowCurl;
        float flowWarpF = sin(aFlowT * 15.0 + uv.x * 9.0 + position.x * 0.025 + uTime * 0.45 + flowCurlF * 1.7)
          + cos(aFlowT * 11.0 - uv.x * 12.0 + position.z * 0.018 - uTime * 0.38 + flowCurlF * 2.3);
        float broadFlowF = sin(aFlowT * uBaseFrequency - uTime * uFlowSpeed * 1.35 * uFlowDirection + position.x * 0.03 + position.z * 0.015 + flowWarpF * 0.45 + flowCurlF * 2.2);
        float detailFlowF = cos((aFlowT + uv.x * 0.18 + flowCurlF * 0.035) * uDetailFrequency - uTime * uFlowSpeed * 2.25 * uFlowDirection + position.z * 0.04 + flowWarpF * 0.7);
        float crossRippleF = sin(uv.x * 18.0 + uTime * 1.4 + aFlowT * 22.0 + flowWarpF * 0.6 + flowCurlF * 3.0);
        float localRippleF = waterRippleRingFill(position.xz, (0.28 + aChannel * 0.72) * (1.0 - aBank * 0.2));
        float waveVisF = mix(1.0, 0.08, uMapLookdown);
        transformed.y += broadFlowF * uBaseWaveAmplitude * (0.4 + channelMaskF * 0.6) * slopeBoostF * waveVisF;
        transformed.y += detailFlowF * uDetailWaveAmplitude * (0.35 + aSlope * 0.85) * waveVisF;
        transformed.y += crossRippleF * uDetailWaveAmplitude * 0.45 * (0.3 + aBank * 0.7) * waveVisF;
        transformed.y += localRippleF * 0.22 * waveVisF;
        transformed.y += ${underfillY};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform vec3 uWaterShallow;
        uniform vec3 uWaterDeep;
        uniform vec3 uWaterSediment;
        uniform vec3 uWaterBed;
        uniform float uDepthColorScale;
        uniform float uDepthDebug;
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterDepth;
        varying float vWaterFillLift;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float depthByTerrain = smoothstep(0.08, uDepthColorScale, clamp(vWaterDepth, 0.0, uDepthColorScale));
        float fillLiftMask = smoothstep(0.02, 0.42, vWaterFillLift);
        float channelMask = pow(clamp(vWaterChannel, 0.0, 1.0), 1.1);
        float bankMask = clamp(vWaterBank, 0.0, 1.0);
        vec3 fillColor = mix(uWaterBed, uWaterDeep, 0.48 + depthByTerrain * 0.32);
        fillColor = mix(fillColor, uWaterSediment, bankMask * 0.18 + fillLiftMask * 0.12);
        fillColor = mix(fillColor, uWaterShallow, (1.0 - depthByTerrain) * 0.08);
        float fillAlpha = clamp(
          0.04
          + fillLiftMask * 0.2
          + depthByTerrain * 0.08
          + channelMask * 0.025
          - bankMask * 0.035,
          0.025,
          0.22
        );
        if (uDepthDebug > 0.5) {
          fillColor = mix(vec3(0.48, 0.95, 0.64), vec3(0.08, 0.22, 0.82), depthByTerrain);
          fillColor = mix(vec3(1.0, 0.92, 0.34), fillColor, step(0.04, depthByTerrain));
          fillAlpha = 0.32;
        }
        vec4 diffuseColor = vec4(fillColor, opacity * fillAlpha);`,
      );
  };

  material.onBeforeCompile = (shader: GrassShader) => {
    shader.uniforms.uTime = sharedWaterWaveUniforms.uTime;
    shader.uniforms.uRippleTime = sharedWaterWaveUniforms.uRippleTime;
    shader.uniforms.uRippleCount = sharedWaterWaveUniforms.uRippleCount;
    shader.uniforms.uRippleSources = sharedWaterWaveUniforms.uRippleSources;
    shader.uniforms.uMapLookdown = sharedWaterWaveUniforms.uMapLookdown;
    shader.uniforms.uFlowSpeed = sharedWaterWaveUniforms.uFlowSpeed;
    shader.uniforms.uFlowDirection = sharedWaterWaveUniforms.uFlowDirection;
    shader.uniforms.uWaterShallow = { value: shallowColor };
    shader.uniforms.uWaterDeep = { value: deepColor };
    shader.uniforms.uWaterFoam = { value: foamColor };
    shader.uniforms.uShorelineMilkColor = { value: shorelineMilkColor };
    shader.uniforms.uHighlightColor = { value: highlightColor };
    shader.uniforms.uSparkleColor = { value: sparkleColor };
    shader.uniforms.uReflectionColor = { value: reflectionColor };
    shader.uniforms.uSedimentColor = { value: sedimentColor };
    shader.uniforms.uBedColor = { value: bedColor };
    shader.uniforms.uCausticColor = { value: causticColor };
    shader.uniforms.uBaseWaveAmplitude = sharedWaterWaveUniforms.uBaseWaveAmplitude;
    shader.uniforms.uDetailWaveAmplitude = sharedWaterWaveUniforms.uDetailWaveAmplitude;
    shader.uniforms.uBaseFrequency = sharedWaterWaveUniforms.uBaseFrequency;
    shader.uniforms.uDetailFrequency = sharedWaterWaveUniforms.uDetailFrequency;
    shader.uniforms.uDepthDebug = sharedWaterWaveUniforms.uDepthDebug;
    shader.uniforms.uDepthColorScale = { value: profile.depthColorScale };
    shader.uniforms.uShorelineFoamStrength = { value: profile.shorelineFoamStrength };
    shader.uniforms.uShorelineMilkStrength = { value: profile.shorelineMilkStrength };
    shader.uniforms.uSlopeFoamStrength = { value: profile.slopeFoamStrength };
    shader.uniforms.uHighlightStrength = { value: profile.highlightStrength };
    shader.uniforms.uClarity = { value: profile.clarity };
    shader.uniforms.uRippleContrast = { value: profile.rippleContrast };
    shader.uniforms.uDepthShadowStrength = { value: profile.depthShadowStrength };
    shader.uniforms.uCausticStrength = { value: profile.causticStrength };
    shader.uniforms.uSparkleStrength = { value: profile.sparkleStrength };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uRippleTime;
        uniform int uRippleCount;
        uniform vec4 uRippleSources[${WATER_RIPPLE_LIMIT}];
        uniform float uMapLookdown;
        uniform float uFlowSpeed;
        uniform float uFlowDirection;
        uniform float uBaseWaveAmplitude;
        uniform float uDetailWaveAmplitude;
        uniform float uBaseFrequency;
        uniform float uDetailFrequency;
        attribute float aChannel;
        attribute float aBank;
        attribute float aSlope;
        attribute float aFlowT;
        attribute float aFlowCurl;
        attribute float aWaterDepth;
        attribute float aFillLift;
        varying vec2 vWaterUv;
        varying vec3 vWaterWorldPosition;
        varying vec3 vWaterViewDirection;
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterSlope;
        varying float vWaterFlowT;
        varying float vWaterFlowCurl;
        varying float vWaterDepth;
        varying float vWaterFillLift;

        float waterRippleRing(vec2 worldXZ, float scale) {
          float ripple = 0.0;
          for (int i = 0; i < ${WATER_RIPPLE_LIMIT}; i++) {
            if (i < uRippleCount) {
              vec4 source = uRippleSources[i];
              float age = max(0.0, uRippleTime - source.z);
              float life = 1.45;
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.8 + source.w * 1.8);
              float ring = exp(-abs(distanceToSource - front) * (1.65 + source.w * 0.35));
              float wakeCore = exp(-distanceToSource * 0.42) * 0.18;
              ripple += (ring + wakeCore) * max(0.0, 1.0 - age / life) * source.w * alive * scale;
            }
          }
          return ripple;
        }`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vWaterUv = uv;
        vWaterChannel = aChannel;
        vWaterBank = aBank;
        vWaterSlope = aSlope;
        vWaterFlowT = aFlowT;
        vWaterFlowCurl = aFlowCurl;
        vWaterDepth = aWaterDepth;
        vWaterFillLift = aFillLift;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float slopeBoost = 0.55 + aSlope * 0.95;
        float channelMask = 0.35 + aChannel * 0.65;
        float flowCurl = aFlowCurl;
        float flowWarp = sin(aFlowT * 15.0 + uv.x * 9.0 + position.x * 0.025 + uTime * 0.45 + flowCurl * 1.7)
          + cos(aFlowT * 11.0 - uv.x * 12.0 + position.z * 0.018 - uTime * 0.38 + flowCurl * 2.3);
        float broadFlow = sin(aFlowT * uBaseFrequency - uTime * uFlowSpeed * 1.35 * uFlowDirection + position.x * 0.03 + position.z * 0.015 + flowWarp * 0.45 + flowCurl * 2.2);
        float detailFlow = cos((aFlowT + uv.x * 0.18 + flowCurl * 0.035) * uDetailFrequency - uTime * uFlowSpeed * 2.25 * uFlowDirection + position.z * 0.04 + flowWarp * 0.7);
        float crossRipple = sin(uv.x * 18.0 + uTime * 1.4 + aFlowT * 22.0 + flowWarp * 0.6 + flowCurl * 3.0);
        float localRipple = waterRippleRing(position.xz, (0.28 + aChannel * 0.72) * (1.0 - aBank * 0.2));
        float waveVisibility = mix(1.0, 0.08, uMapLookdown);
        transformed.y += broadFlow * uBaseWaveAmplitude * (0.4 + channelMask * 0.6) * slopeBoost * waveVisibility;
        transformed.y += detailFlow * uDetailWaveAmplitude * (0.35 + aSlope * 0.85) * waveVisibility;
        transformed.y += crossRipple * uDetailWaveAmplitude * 0.45 * (0.3 + aBank * 0.7) * waveVisibility;
        transformed.y += localRipple * 0.22 * waveVisibility;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 waterWorldPosition = modelMatrix * vec4(transformed, 1.0);
        vWaterWorldPosition = waterWorldPosition.xyz;
        vWaterViewDirection = normalize(cameraPosition - vWaterWorldPosition);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uTime;
        uniform float uRippleTime;
        uniform int uRippleCount;
        uniform vec4 uRippleSources[${WATER_RIPPLE_LIMIT}];
        uniform float uMapLookdown;
        uniform float uFlowSpeed;
        uniform float uFlowDirection;
        uniform vec3 uWaterShallow;
        uniform vec3 uWaterDeep;
        uniform vec3 uWaterFoam;
        uniform vec3 uShorelineMilkColor;
        uniform vec3 uHighlightColor;
        uniform vec3 uSparkleColor;
        uniform vec3 uReflectionColor;
        uniform vec3 uSedimentColor;
        uniform vec3 uBedColor;
        uniform vec3 uCausticColor;
        uniform float uBaseFrequency;
        uniform float uDetailFrequency;
        uniform float uDepthColorScale;
        uniform float uShorelineFoamStrength;
        uniform float uShorelineMilkStrength;
        uniform float uSlopeFoamStrength;
        uniform float uHighlightStrength;
        uniform float uClarity;
        uniform float uRippleContrast;
        uniform float uDepthShadowStrength;
        uniform float uCausticStrength;
        uniform float uSparkleStrength;
        uniform float uDepthDebug;
        varying vec2 vWaterUv;
        varying vec3 vWaterWorldPosition;
        varying vec3 vWaterViewDirection;
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterSlope;
        varying float vWaterFlowT;
        varying float vWaterFlowCurl;
        varying float vWaterDepth;
        varying float vWaterFillLift;
        uniform vec3 uSceneSunColor;
        uniform vec3 uSceneAmbient;
        uniform vec3 uSceneHorizon;
        uniform float uSceneElevationMood;

        float waterHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float waterNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(waterHash(i + vec2(0.0, 0.0)), waterHash(i + vec2(1.0, 0.0)), u.x),
            mix(waterHash(i + vec2(0.0, 1.0)), waterHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float waterFbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.55;
          for (int i = 0; i < 3; i++) {
            value += waterNoise(p) * amplitude;
            p = p * 2.04 + vec2(17.3, 9.1);
            amplitude *= 0.5;
          }
          return value;
        }

        float waterRippleRing(vec2 worldXZ, float scale) {
          float ripple = 0.0;
          for (int i = 0; i < ${WATER_RIPPLE_LIMIT}; i++) {
            if (i < uRippleCount) {
              vec4 source = uRippleSources[i];
              float age = max(0.0, uRippleTime - source.z);
              float life = 1.45;
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.8 + source.w * 1.8);
              float ring = exp(-abs(distanceToSource - front) * (1.6 + source.w * 0.32));
              float wakeCore = exp(-distanceToSource * 0.4) * 0.16;
              ripple += (ring + wakeCore) * max(0.0, 1.0 - age / life) * source.w * alive * scale;
            }
          }
          return ripple;
        }`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float slopeBoost = smoothstep(0.08, 0.9, vWaterSlope);
        float crossSectionDepth = pow(clamp(vWaterChannel, 0.0, 1.0), 1.22);
        float terrainDepth = smoothstep(0.08, uDepthColorScale, clamp(vWaterDepth, 0.0, uDepthColorScale));
        float fillLiftMask = smoothstep(0.02, 0.42, vWaterFillLift);
        float channelDepth = clamp(mix(crossSectionDepth * 0.82, terrainDepth, 0.68) - fillLiftMask * 0.08, 0.0, 1.0);
        float toonDepthBand =
          channelDepth > 0.68 ? 0.86 :
          channelDepth > 0.34 ? 0.42 :
          0.08;
        float bankMask = clamp(vWaterBank, 0.0, 1.0);
        float shallowMask = 1.0 - channelDepth;
        float flowCurl = vWaterFlowCurl;
        float bendStrength = abs(flowCurl);
        vec2 proceduralFlow = normalize(vec2(1.0, flowCurl * 0.72 + (vWaterUv.x - 0.5) * bankMask * 0.55));
        vec2 flowUv = vec2(
          vWaterFlowT * (uBaseFrequency * 0.1) + proceduralFlow.y * 0.38,
          (vWaterUv.x - 0.5) * 5.4 + flowCurl * 0.9
        );
        float flowWarp = waterFbm(flowUv * 1.2 + vec2(uTime * 0.16 * uFlowDirection, -uTime * 0.08) * proceduralFlow);
        float eddyNoise = waterFbm(flowUv * 2.6 + vec2(-uTime * 0.34 * uFlowDirection, uTime * 0.12 + flowCurl * 0.18));
        float sparkleNoise = waterFbm(flowUv * 4.8 + vec2(uTime * 0.48 * uFlowDirection, uTime * 0.16));
        vec2 bedUv = vWaterWorldPosition.xz * vec2(0.048, 0.044) + vec2(flowWarp * 0.38, eddyNoise * 0.26);
        float bedNoise = waterFbm(bedUv + vec2(13.4, -7.8));
        float pebbleNoise = fract(bedNoise * 5.7);
        float broadFlow = sin(vWaterFlowT * uBaseFrequency - uTime * uFlowSpeed * 1.5 * uFlowDirection + vWaterWorldPosition.x * 0.022 + vWaterWorldPosition.z * 0.015 + flowWarp * 3.0 + flowCurl * 2.6) * 0.5 + 0.5;
        float detailFlow = cos(vWaterFlowT * uDetailFrequency - uTime * uFlowSpeed * 2.6 * uFlowDirection + vWaterUv.x * 16.0 + vWaterWorldPosition.z * 0.03 + eddyNoise * 2.2 + flowCurl * 1.5) * 0.5 + 0.5;
        float currentBands = sin(flowUv.x * 6.5 - uTime * uFlowSpeed * 1.55 * uFlowDirection + flowWarp * 4.2 + flowUv.y * 2.4 + flowCurl * 2.1) * 0.5 + 0.5;
        float sideShimmer = sin((vWaterUv.x - 0.5) * 22.0 + vWaterFlowT * 18.0 - uTime * (1.2 + slopeBoost) * uFlowDirection + flowWarp * 2.0 + flowCurl * 4.0) * 0.5 + 0.5;
        float longFlowThread = smoothstep(
          0.56,
          1.0,
          sin(flowUv.x * 14.0 - uTime * uFlowSpeed * 2.35 * uFlowDirection + flowUv.y * 3.6 + flowWarp * 5.4 + flowCurl * 3.2) * 0.5 + 0.5
        ) * (0.2 + slopeBoost * 0.42) * (1.0 - bankMask * 0.38);
        float brokenWhitecap = slopeBoost * smoothstep(
          0.76,
          1.0,
          eddyNoise * 0.42 + currentBands * 0.34 + detailFlow * 0.24 + sideShimmer * 0.18
        );
        float glassRibbon = smoothstep(
          0.62,
          1.0,
          broadFlow * 0.32 + detailFlow * 0.24 + sideShimmer * 0.26 + sparkleNoise * 0.18
        ) * (0.2 + shallowMask * 0.26 + slopeBoost * 0.3) * (1.0 - bankMask * 0.35);
        float bendEddy = bendStrength * smoothstep(0.18, 0.86, bankMask) * smoothstep(0.32, 0.96, sin((vWaterUv.x - 0.5) * 18.0 + vWaterFlowT * 24.0 + uTime * (1.0 + bendStrength) * uFlowDirection + eddyNoise * 3.2) * 0.5 + 0.5);
        float actorRipple = waterRippleRing(vWaterWorldPosition.xz, (0.34 + shallowMask * 0.66) * (1.0 - bankMask * 0.22));
        float bankFeather = smoothstep(0.08, 0.92, bankMask);
        float shorelineLine = smoothstep(0.56, 0.76, bankMask) * (1.0 - smoothstep(0.9, 1.0, bankMask));
        float shorelineEdge = smoothstep(0.78, 1.0, bankMask);
        float graphicShoreLine = smoothstep(0.64, 0.76, bankMask) * (1.0 - smoothstep(0.82, 0.93, bankMask));
        float shallowShelfLine = smoothstep(0.2, 0.34, channelDepth) * (1.0 - smoothstep(0.42, 0.58, channelDepth));
        float deepCoreLine = smoothstep(0.64, 0.78, channelDepth) * (1.0 - smoothstep(0.86, 0.96, channelDepth));
        float directionalRipple = smoothstep(
          0.5,
          1.0,
          sin(flowUv.x * 11.0 - uTime * uFlowSpeed * 2.1 * uFlowDirection + flowUv.y * 1.35 + flowWarp * 4.8 + flowCurl * 2.4) * 0.5 + 0.5
        );
        vec3 waterTint = mix(uWaterShallow, uWaterDeep, toonDepthBand * 0.92);
        waterTint = mix(waterTint, uSedimentColor, bankMask * (0.04 + eddyNoise * 0.02));
        waterTint = mix(waterTint, uSedimentColor * vec3(0.88, 0.96, 0.82), shorelineEdge * (0.035 + eddyNoise * 0.015));
        waterTint = mix(waterTint, uWaterShallow * vec3(1.02, 1.04, 1.0), shallowMask * (0.06 + uClarity * 0.1));
        waterTint = mix(waterTint, mix(uWaterShallow, uWaterFoam, 0.16), slopeBoost * 0.1);
        waterTint = mix(waterTint, uWaterShallow * vec3(1.04, 1.02, 0.96), shallowShelfLine * 0.14);
        waterTint = mix(waterTint, uWaterDeep * vec3(0.82, 0.94, 1.02), deepCoreLine * 0.22);
        float shorelineMilkMask = (
          bankFeather * shallowMask * (1.0 - slopeBoost * 0.48) * (0.42 + eddyNoise * 0.2) +
          shorelineLine * (0.28 + directionalRipple * 0.2)
        ) * uShorelineMilkStrength;
        shorelineMilkMask = min(shorelineMilkMask, 0.2);
        waterTint = mix(waterTint, uShorelineMilkColor, shorelineMilkMask);
        vec3 bedTint = mix(uWaterShallow, uWaterDeep, channelDepth * 0.5 + bedNoise * 0.08 + pebbleNoise * 0.04);
        bedTint = mix(bedTint, uBedColor, (1.0 - channelDepth) * 0.55);
        bedTint = mix(bedTint, uSedimentColor, bankMask * 0.3);
        float bedVisibility = (1.0 - channelDepth) * 0.34 * (1.0 - bankMask * 0.45);
        float causticPattern = sin(bedUv.x * 16.0 + currentBands * 2.8 - uTime * 1.6 * uFlowDirection)
          * cos(bedUv.y * 18.0 - detailFlow * 3.1 + uTime * 1.2);
        causticPattern = causticPattern * 0.5 + 0.5;
        float causticMask = pow(smoothstep(0.58, 1.0, causticPattern + sparkleNoise * 0.24), 1.5) * shallowMask * uCausticStrength;
        float depthShadow = channelDepth * uDepthShadowStrength + slopeBoost * 0.08;
        float shorelineFoam = shorelineLine * smoothstep(0.3, 0.86, directionalRipple * 0.36 + currentBands * (0.34 + uRippleContrast * 0.16) + detailFlow * 0.24 + eddyNoise * 0.16 + bendEddy * 0.2);
        float slopeFoam = slopeBoost * smoothstep(0.5, 1.0, detailFlow * 0.54 + broadFlow * 0.24 + sparkleNoise * 0.22);
        float currentFoam = slopeBoost * smoothstep(0.68, 0.98, currentBands * (0.48 + uRippleContrast * 0.14) + directionalRipple * 0.28 + sparkleNoise * 0.28 + bendEddy * 0.2) * 0.46;
        float outletFoam = smoothstep(0.72, 1.0, slopeBoost + bankMask * 0.35) * smoothstep(0.42, 0.92, sideShimmer);
        float foamMask = clamp(
          shorelineFoam * uShorelineFoamStrength
          + graphicShoreLine * (0.18 + uShorelineMilkStrength * 0.24)
          + slopeFoam * uSlopeFoamStrength
          + currentFoam
          + longFlowThread * uSlopeFoamStrength * 0.22
          + brokenWhitecap * uSlopeFoamStrength * 0.28
          + bendEddy * 0.18
          + actorRipple * 0.32
          + outletFoam * 0.24,
          0.0,
          0.62
        );
        vec3 viewDir = normalize(vWaterViewDirection);
        float ndotV = clamp(abs(viewDir.y), 0.035, 1.0);
        float fresnelBase = pow(1.0 - ndotV, 2.52);
        float fresnel = min(1.0, fresnelBase * (1.0 + shallowMask * 0.12 + (1.0 - channelDepth) * 0.06));
        vec3 reflectionTint = mix(uReflectionColor, uHighlightColor, smoothstep(0.48, 1.0, broadFlow * 0.4 + sideShimmer * 0.38 + sparkleNoise * 0.22));
        float highlightRibbon = smoothstep(0.5, 1.0, currentBands * 0.28 + directionalRipple * 0.22 + detailFlow * 0.24 + sideShimmer * 0.18 + sparkleNoise * 0.16 + actorRipple * 0.24);
        float highlightMask = fresnel * highlightRibbon * (0.18 + slopeBoost * 0.32) * uHighlightStrength;
        float glintMask = pow(smoothstep(0.82, 1.0, sparkleNoise * 0.45 + detailFlow * 0.35), 2.0) * (0.08 + slopeBoost * 0.18) * fresnel;
        float sparkleScatter = waterNoise(vWaterWorldPosition.xz * 0.22 + vec2(uTime * 0.18, -uTime * 0.12));
        float sparkleTwinkle = sin(uTime * 4.8 + sparkleScatter * 12.0 + vWaterFlowT * 34.0) * 0.5 + 0.5;
        float sparkleScore = sparkleScatter * 0.62 + sparkleTwinkle * 0.28 + sideShimmer * 0.1;
        float sparkleMask = pow(
          smoothstep(0.84, 1.0, sparkleScore),
          6.0
        ) * step(0.9, sparkleScore) * shallowMask * (0.06 + fresnel * 0.32) * uSparkleStrength;
        vec3 bodyFill = mix(uWaterShallow, uWaterDeep, clamp(channelDepth * 0.74 + 0.16, 0.0, 1.0));
        bodyFill = mix(bodyFill, uReflectionColor, fresnel * 0.08 + shallowMask * 0.03);
        vec3 finalWater = mix(bodyFill, waterTint, 0.66);
        finalWater = mix(finalWater, bedTint, bedVisibility);
        finalWater += uCausticColor * causticMask;
        finalWater *= 1.0 - depthShadow * 0.07;
        float paintedCurrentLine = smoothstep(0.7, 0.9, currentBands) * (1.0 - smoothstep(0.88, 1.0, currentBands)) * (0.16 + slopeBoost * 0.24) * (1.0 - bankMask * 0.48);
        finalWater = mix(finalWater, uHighlightColor, paintedCurrentLine * 0.08);
        finalWater = mix(finalWater, uWaterFoam, longFlowThread * (0.05 + slopeBoost * 0.1));
        finalWater = mix(finalWater, uWaterFoam, foamMask * (0.18 + shorelineLine * 0.28 + slopeBoost * 0.2));
        finalWater = mix(finalWater, uShorelineMilkColor, shorelineMilkMask * 0.16 + graphicShoreLine * 0.1);
        finalWater = mix(finalWater, uHighlightColor, shallowShelfLine * 0.08);
        vec3 contourInk = mix(uSedimentColor * vec3(0.64, 0.78, 0.66), uWaterDeep * vec3(0.72, 0.9, 1.0), channelDepth);
        finalWater = mix(finalWater, contourInk, (graphicShoreLine * 0.045 + shallowShelfLine * 0.025 + deepCoreLine * 0.04) * (1.0 - uMapLookdown * 0.5));
        finalWater = mix(finalWater, reflectionTint, highlightMask * (0.08 + shallowMask * 0.04 + channelDepth * 0.04));
        finalWater = mix(finalWater, uHighlightColor, glassRibbon * uHighlightStrength * 0.06);
        finalWater = mix(finalWater, uWaterFoam, actorRipple * 0.22);
        finalWater += uHighlightColor * glintMask * uHighlightStrength * 0.28;
        finalWater += uSparkleColor * sparkleMask;
        finalWater += uSparkleColor * glassRibbon * uSparkleStrength * 0.035;
        finalWater += reflectionTint * fresnel * (0.006 + channelDepth * 0.012) * (0.12 + uClarity * 0.18);
        float shallowGlow = (shorelineLine * 0.22 + shallowShelfLine * 0.14 + highlightMask * 0.08) * shallowMask * (1.0 - uMapLookdown);
        finalWater += mix(uHighlightColor, uSparkleColor, 0.35) * shallowGlow * (0.22 + uSparkleStrength);
        vec3 waterCeiling = mix(vec3(0.72, 0.88, 0.92), vec3(0.9, 0.95, 0.92), clamp(foamMask * 0.62 + sparkleMask * 0.7, 0.0, 1.0));
        finalWater = min(finalWater, waterCeiling);
        float finalLuma = dot(finalWater, vec3(0.2126, 0.7152, 0.0722));
        float lumaLimit = mix(0.74, 0.9, clamp(foamMask * 0.34 + sparkleMask * 0.46 + shallowMask * 0.16, 0.0, 1.0));
        finalWater *= mix(1.0, lumaLimit / max(finalLuma, 0.001), smoothstep(lumaLimit, lumaLimit + 0.16, finalLuma));
        float alphaMask = gl_FrontFacing ? 1.0 : 0.16;
        float mapDepthBand =
          channelDepth > 0.68 ? 0.86 :
          channelDepth > 0.34 ? 0.48 :
          0.14;
        vec3 mapShallow = vec3(0.50, 0.76, 0.74);
        vec3 mapDeep = vec3(0.17, 0.47, 0.62);
        vec3 mapBank = vec3(0.64, 0.75, 0.61);
        vec3 mapLine = vec3(0.86, 0.91, 0.78);
        vec3 mapWater = mix(mapShallow, mapDeep, mapDepthBand);
        mapWater = mix(mapWater, mapBank, bankMask * 0.16);
        mapWater = mix(mapWater, mapLine, graphicShoreLine * 0.2 + shallowShelfLine * 0.08);
        mapWater = mix(mapWater, vec3(0.08, 0.34, 0.5), deepCoreLine * 0.18);
        finalWater = mix(finalWater, mapWater, uMapLookdown);
        alphaMask = mix(alphaMask, clamp(0.78 + channelDepth * 0.12 - bankMask * 0.06, 0.7, 0.94), uMapLookdown);
        float wLow = 1.0 - uSceneElevationMood;
        finalWater = mix(finalWater, finalWater * uSceneSunColor, 0.06 + 0.05 * wLow);
        finalWater = mix(finalWater, finalWater * uSceneHorizon, 0.05 * (0.4 + 0.6 * wLow));
        finalWater = mix(finalWater, finalWater * uSceneAmbient, 0.05);
        vec3 waterFloor = mix(vec3(0.22, 0.48, 0.52), vec3(0.58, 0.78, 0.74), clamp(shallowMask * 0.38 + foamMask * 0.2 + uMapLookdown * 0.18, 0.0, 1.0));
        finalWater = max(finalWater, waterFloor);
        finalWater = floor(finalWater * 7.0 + 0.5) / 7.0;
        if (uDepthDebug > 0.5) {
          vec3 debugShallow = vec3(0.48, 0.95, 0.64);
          vec3 debugMid = vec3(0.16, 0.7, 0.95);
          vec3 debugDeep = vec3(0.08, 0.22, 0.82);
          finalWater = mix(debugShallow, debugMid, smoothstep(0.02, 0.45, channelDepth));
          finalWater = mix(finalWater, debugDeep, smoothstep(0.46, 1.0, channelDepth));
          finalWater = mix(vec3(1.0, 0.92, 0.34), finalWater, step(0.04, channelDepth));
          alphaMask = 0.96;
        }
        vec4 diffuseColor = vec4(finalWater, opacity * alphaMask);`,
      );

    shader.uniforms.uSceneSunColor = { value: new Color(0xffffff) };
    shader.uniforms.uSceneAmbient = { value: new Color(0.55, 0.62, 0.8) };
    shader.uniforms.uSceneHorizon = { value: new Color(0.95, 0.88, 0.82) };
    shader.uniforms.uSceneElevationMood = { value: 0 };
    material.userData.waterShader = shader;
  };

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.add(volumeLayer, fillLayer);
  return new WaterSurface({
    mesh,
    surfaceGeometry: geometry,
    volumeGeometry,
    material,
    volumeMaterial,
    fillMaterial,
    uniforms: sharedWaterWaveUniforms,
    baseOpacity,
    phaseOffset,
  });
}

function createWebGLWaterSurface(points: Vector3[], options: WaterSurfaceOptions): WaterSurfaceController {
  const { geometry, flowDirection } = buildWaterRibbonGeometry(points, options);
  const phaseOffset = (points[0]?.x ?? 0) * 0.021 + (points[0]?.z ?? 0) * 0.013;
  return createWebGLWaterController(geometry, options.profile, options, flowDirection, phaseOffset);
}

function createLakeSurface(
  center: Vector3,
  options: WaterSurfaceOptions,
  shape: {
    radiusX: number;
    radiusZ: number;
    radialSegments?: number;
    rings?: number;
    edgeSoftness?: number;
  },
): WaterSurfaceController {
  const geometry = createLakeGeometry(
    center,
    shape.radiusX,
    shape.radiusZ,
    shape.radialSegments,
    shape.rings,
    shape.edgeSoftness,
  );
  const phaseOffset = center.x * 0.021 + center.z * 0.013;
  return createWebGLWaterController(geometry, options.profile, options, 1, phaseOffset);
}

function createWaterSurface(
  points: Vector3[],
  options: WaterSurfaceOptions,
  backend: WaterSurfaceBackend = "webgl",
): WaterSurfaceController {
  switch (backend) {
    case "webgl":
    default:
      return createWebGLWaterSurface(points, options);
  }
}

function makeCreekSurface(
  points: Vector3[],
  radius: number,
  profile: WaterProfile,
  opacity = profile.opacity,
) {
  return createWaterSurface(points, {
    profile,
    width: radius * 1.58,
    segments: 42,
    opacity,
  });
}

function makeHighlandCreekSurface(path: HighlandCreekPath) {
  const profile = WATER_PROFILES[path.profile];
  const points = path.points.map(([x, z]) => new Vector3(
    x,
    sampleTerrainHeight(x, z) + path.surfaceOffset,
    z,
  ));
  return makeCreekSurface(points, path.width, profile, path.opacity);
}

function makeWaterfallLayer(width: number, height: number, color: string, opacity: number, depth = 0) {
  const layer = new Mesh(
    new PlaneGeometry(width, height, 1, 8),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  layer.position.y = height * 0.5;
  layer.position.z = depth;
  layer.userData.baseOpacity = opacity;
  layer.userData.baseX = layer.position.x;
  layer.userData.baseY = layer.position.y;
  layer.userData.baseZ = depth;
  return layer;
}

function makeWaterfallFoamDisc(radius: number, color: string, opacity: number, x: number, z: number) {
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
  foam.position.set(x, 0.06, z);
  foam.scale.z = 0.42;
  foam.userData.baseOpacity = opacity;
  foam.userData.baseScaleX = foam.scale.x;
  foam.userData.baseScaleZ = foam.scale.z;
  return foam;
}

function makeWaterfallPanel(width: number, height: number, opacity: number, seed: number): WaterfallAccent {
  const group = new Group();
  group.userData.seed = seed;

  const veil = makeWaterfallLayer(width * 1.16, height, futureLakeArt.waterfallVeil, opacity * 0.78, -0.04);
  const blueCore = makeWaterfallLayer(width * 0.72, height * 0.96, futureLakeArt.waterfallCore, opacity * 0.64, 0.02);
  const whiteCore = makeWaterfallLayer(width * 0.42, height * 0.92, "#f8fff8", opacity * 0.74, 0.08);
  blueCore.position.x = Math.sin(seed * 1.7) * width * 0.08;
  whiteCore.position.x = Math.cos(seed * 1.2) * width * 0.08;
  group.add(veil, blueCore, whiteCore);

  const ribbons: Mesh[] = [];
  const ribbonCount = Math.max(5, Math.round(width * 1.28));
  for (let i = 0; i < ribbonCount; i += 1) {
    const t = ribbonCount === 1 ? 0.5 : i / (ribbonCount - 1);
    const lateral = MathUtils.lerp(-0.42, 0.42, t) * width + Math.sin(seed + i * 1.9) * width * 0.08;
    const ribbonWidth = width * MathUtils.lerp(0.08, 0.16, (Math.sin(seed * 2.1 + i) + 1) * 0.5);
    const ribbonHeight = height * MathUtils.lerp(0.34, 0.62, (Math.cos(seed + i * 2.4) + 1) * 0.5);
    const ribbon = makeWaterfallLayer(ribbonWidth, ribbonHeight, i % 2 === 0 ? "#ffffff" : "#dff8ff", opacity * 0.76, 0.16 + i * 0.012);
    ribbon.position.x = lateral;
    ribbon.userData.baseX = lateral;
    ribbon.userData.fallSpeed = 0.34 + i * 0.055;
    ribbon.userData.phase = (seed * 0.31 + i * 0.23) % 1;
    ribbons.push(ribbon);
    group.add(ribbon);
  }

  const foamA = makeWaterfallFoamDisc(width * 0.62, futureLakeArt.foam, opacity * 1.24, -width * 0.16, 0.36);
  const foamB = makeWaterfallFoamDisc(width * 0.46, futureLakeArt.foamCool, opacity * 0.88, width * 0.24, 0.52);
  const foamC = makeWaterfallFoamDisc(width * 0.34, futureLakeArt.waterfallSunFoam, opacity * 0.48, width * 0.02, 0.68);
  group.add(foamA, foamB, foamC);

  const spray: Mesh[] = [];
  for (let i = 0; i < 10; i += 1) {
    const sprayPuff = new Mesh(
      new CircleGeometry(width * MathUtils.lerp(0.055, 0.12, (Math.sin(seed + i) + 1) * 0.5), 12),
      new MeshBasicMaterial({
        color: i % 3 === 0 ? "#fff4d3" : "#ecfbff",
        transparent: true,
        opacity: opacity * MathUtils.lerp(0.34, 0.68, (Math.cos(seed + i * 1.6) + 1) * 0.5),
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    sprayPuff.position.set(
      Math.sin(seed * 0.7 + i * 1.3) * width * 0.58,
      height * MathUtils.lerp(0.05, 0.34, (i % 4) / 3),
      0.24 + i * 0.035,
    );
    sprayPuff.userData.baseX = sprayPuff.position.x;
    sprayPuff.userData.baseY = sprayPuff.position.y;
    sprayPuff.userData.baseOpacity = (sprayPuff.material as MeshBasicMaterial).opacity;
    sprayPuff.userData.phase = seed * 0.4 + i;
    spray.push(sprayPuff);
    group.add(sprayPuff);
  }

  const controller: WaterSurfaceController = {
    mesh: veil,
    update(elapsed: number, _ripples: readonly WaterRippleSource[] = [], mapLookdown = false) {
      const mapFade = mapLookdown ? 0.6 : 1;
      [veil, blueCore, whiteCore].forEach((layer, index) => {
        const material = layer.material as MeshBasicMaterial;
        const baseOpacity = (layer.userData.baseOpacity as number | undefined) ?? opacity;
        const baseZ = (layer.userData.baseZ as number | undefined) ?? layer.position.z;
        material.opacity = baseOpacity * mapFade * (0.86 + Math.sin(elapsed * (1.1 + index * 0.34) + seed) * 0.14);
        layer.position.z = baseZ + Math.sin(elapsed * 0.7 + index + seed) * 0.025;
      });

      ribbons.forEach((ribbon, index) => {
        const material = ribbon.material as MeshBasicMaterial;
        const baseOpacity = (ribbon.userData.baseOpacity as number | undefined) ?? opacity;
        const speed = (ribbon.userData.fallSpeed as number | undefined) ?? 0.42;
        const phase = (ribbon.userData.phase as number | undefined) ?? 0;
        const cycle = (elapsed * speed + phase) % 1;
        ribbon.position.y = height * (0.9 - cycle * 0.58);
        ribbon.position.x = ((ribbon.userData.baseX as number | undefined) ?? ribbon.position.x) +
          Math.sin(elapsed * 1.7 + index + seed) * width * 0.025;
        material.opacity = baseOpacity * mapFade * (0.58 + Math.sin(cycle * Math.PI) * 0.42);
      });

      [foamA, foamB, foamC].forEach((foam, index) => {
        const material = foam.material as MeshBasicMaterial;
        const baseOpacity = (foam.userData.baseOpacity as number | undefined) ?? opacity;
        const pulse = 0.88 + Math.sin(elapsed * (1.4 + index * 0.32) + seed) * 0.12;
        foam.scale.x = ((foam.userData.baseScaleX as number | undefined) ?? 1) * pulse;
        foam.scale.z = ((foam.userData.baseScaleZ as number | undefined) ?? 0.42) * (1.08 - (pulse - 0.88));
        material.opacity = baseOpacity * mapFade * pulse;
      });

      spray.forEach((puff, index) => {
        const material = puff.material as MeshBasicMaterial;
        const phase = (puff.userData.phase as number | undefined) ?? index;
        puff.position.x = ((puff.userData.baseX as number | undefined) ?? 0) + Math.sin(elapsed * 0.9 + phase) * width * 0.08;
        puff.position.y = ((puff.userData.baseY as number | undefined) ?? 0) + Math.sin(elapsed * 1.2 + phase) * 0.12;
        material.opacity = ((puff.userData.baseOpacity as number | undefined) ?? opacity * 0.4) * mapFade *
          (0.72 + Math.sin(elapsed * 1.6 + phase) * 0.28);
      });
    },
  };

  return { group, controller };
}

function addSmallWaterfall(
  group: Group,
  controllers: WaterSurfaceController[],
  x: number,
  z: number,
  width: number,
  height: number,
  yaw: number,
  opacity = 0.34,
) {
  const waterfall = makeWaterfallPanel(width, height, opacity, x * 0.17 + z * 0.09);
  waterfall.group.position.set(x, sampleTerrainHeight(x, z) - height * 0.18, z);
  waterfall.group.rotation.y = yaw;
  waterfall.group.rotation.z = Math.sin(x * 0.13 + z * 0.07) * 0.05;
  waterfall.group.name = `pretty-waterfall-${Math.round(x)}-${Math.round(z)}`;
  group.add(waterfall.group);
  controllers.push(waterfall.controller);
}

function makeRiverSurface(
  channelId: RiverChannelId,
  zStart: number,
  zEnd: number,
  sampleCount: number,
  widthScale = 1,
  opacity = WATER_PROFILES.mainRiver.opacity,
) {
  const points: Vector3[] = [];
  for (let i = 0; i <= sampleCount; i += 1) {
    const t = i / sampleCount;
    const z = zStart + t * (zEnd - zStart);
    const x = sampleRiverChannelCenter(channelId, z);
    const y = sampleTerrainHeight(x, z) + MAIN_RIVER_SURFACE_OFFSET;
    points.push(new Vector3(x, y, z));
  }

  return createWaterSurface(points, {
    profile: WATER_PROFILES.mainRiver,
    width: (point: Vector3) => {
      const channel = sampleRiverChannelAt(channelId, point.z);
      const foothillTaper = MathUtils.smoothstep(36, 104, point.z);
      const alpineTaper = MathUtils.smoothstep(114, 184, point.z);
      const mainTaper = 1 - foothillTaper * 0.34 - alpineTaper * 0.12;
      const branchTaper = 1 - foothillTaper * 0.2 - alpineTaper * 0.08;
      return channel.width * widthScale * RIVER_WATER_VISUAL_FILL_SCALE * (channelId === "main" ? mainTaper : branchTaper);
    },
    segments: Math.max(56, Math.round(sampleCount * 1.45)),
    opacity,
    flowBraidStrength: channelId === "main" ? 0.34 : 0.86,
  });
}

export function buildRiverSystem(): WaterSurfaceGroup {
  const group = new Group();
  const controllers: WaterSurfaceController[] = [];
  const addRiver = (
    channelId: RiverChannelId,
    zStart: number,
    zEnd: number,
    sampleCount: number,
    widthScale = 1,
    opacity = WATER_PROFILES.mainRiver.opacity,
  ) => {
    const surface = makeRiverSurface(channelId, zStart, zEnd, sampleCount, widthScale, opacity);
    surface.mesh.name = `river-${channelId}-${zStart}-${zEnd}`;
    group.add(surface.mesh);
    controllers.push(surface);
  };
  const renderPathWidthScale = (channelId: RiverChannelId) =>
    sampleRiverRenderWidthScale(channelId) / WATER_PROFILES.mainRiver.widthScale;

  group.name = "braided-river-system";
  addRiver("main", -80, 236, 168, renderPathWidthScale("main"));
  RIVER_BRANCH_SEGMENTS.forEach((segment) => {
    const sampleCount = Math.max(42, Math.round((segment.endZ - segment.startZ) * 0.68));
    addRiver(segment.id, segment.startZ, segment.endZ, sampleCount, renderPathWidthScale(segment.id), segment.id === "silver-braid" ? 0.68 : 0.78);
  });

  return { group, controllers };
}

function makeStartingWaterSurface(pool: StartingWaterPool) {
  const center = new Vector3(
    pool.x,
    sampleTerrainHeight(pool.x, pool.z) + pool.surfaceOffset,
    pool.z,
  );
  const isOpeningLake = pool.id === "opening-lake";

  return createLakeSurface(center, {
    profile: WATER_PROFILES.stillPool,
    width: Math.max(pool.renderRadiusX, pool.renderRadiusZ) * 2,
    flowSpeed: pool.flowSpeed,
    opacity: pool.opacity,
  }, {
    radiusX: pool.renderRadiusX * STARTING_WATER_VISUAL_FILL_SCALE,
    radiusZ: pool.renderRadiusZ * STARTING_WATER_VISUAL_FILL_SCALE,
    radialSegments: isOpeningLake ? 76 : 48,
    rings: isOpeningLake ? 10 : 7,
    edgeSoftness: pool.edgeSoftness,
  });
}

export function buildStartingWaterSystem(): WaterSurfaceGroup {
  const group = new Group();
  const controllers: WaterSurfaceController[] = [];
  group.name = "starting-water-pools";

  STARTING_WATER_POOLS.forEach((pool) => {
    const surface = makeStartingWaterSurface(pool);
    surface.mesh.name = `starting-water-${pool.id}`;
    group.add(surface.mesh);
    controllers.push(surface);
  });

  return { group, controllers };
}

export function buildHighlandWaterways(): WaterSurfaceGroup {
  const group = new Group();
  const controllers: WaterSurfaceController[] = [];
  group.name = "highland-waterways-muted";

  HIGHLAND_CREEK_PATHS.forEach((path) => {
    const surface = makeHighlandCreekSurface(path);
    surface.mesh.name = `highland-creek-${path.id}`;
    surface.mesh.renderOrder = 1;
    group.add(surface.mesh);
    controllers.push(surface);
  });

  addSmallWaterfall(group, controllers, 25, 89, 4.2, 7.2, -0.22);
  addSmallWaterfall(group, controllers, 38, 128, 8.2, 17.6, -0.36, 0.46);
  addSmallWaterfall(group, controllers, 31, 139, 3.8, 8.8, -0.14, 0.3);
  addSmallWaterfall(group, controllers, -16, 158, 3.8, 6.8, 0.48);
  addSmallWaterfall(group, controllers, 10, 154, 5.2, 10.4, 0.3);

  return { group, controllers };
}
