import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { GrassShader } from "./grassSystem";
import {
  ALPINE_RUNOFF_SURFACE_OFFSET,
  FOOTHILL_CREEK_SURFACE_OFFSET,
  MAIN_RIVER_SURFACE_OFFSET,
  OPENING_LAKE_CENTER_X,
  OPENING_LAKE_CENTER_Z,
  OPENING_LAKE_RADIUS,
  OPENING_LAKE_SURFACE_OFFSET,
  RIVER_BRANCH_SEGMENTS,
  sampleRiverChannelAt,
  sampleRiverChannelCenter,
  sampleTerrainHeight,
  sampleTerrainNormal,
  WATERFALL_OUTFLOW_SURFACE_OFFSET,
  type RiverChannelId,
} from "../../simulation/world";

type WaterProfileKey = "mainRiver" | "foothillCreek" | "alpineRunoff" | "waterfallOutflow";
type WaterSurfaceBackend = "webgl";

interface WaterProfile {
  key: WaterProfileKey;
  widthScale: number;
  levelOffset: number;
  opacity: number;
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
}

export interface WaterSurfaceController {
  mesh: Mesh;
  update: (elapsed: number) => void;
  dispose?: () => void;
}

export interface WaterSurfaceGroup {
  group: Group;
  controllers: WaterSurfaceController[];
}

const WATER_PROFILES: Record<WaterProfileKey, WaterProfile> = {
  mainRiver: {
    key: "mainRiver",
    widthScale: 1.02,
    levelOffset: MAIN_RIVER_SURFACE_OFFSET,
    opacity: 0.9,
    flowSpeed: 0.82,
    roughness: 0.16,
    metalness: 0.03,
    baseWaveAmplitude: 0.032,
    detailWaveAmplitude: 0.014,
    baseFrequency: 34,
    detailFrequency: 66,
    shallowColor: "#9fc7bc",
    deepColor: "#4f8588",
    foamColor: "#eef4df",
    shorelineMilkColor: "#dfe8cc",
    highlightColor: "#edd89f",
    sparkleColor: "#f8f1cf",
    reflectionColor: "#a9c9c9",
    sedimentColor: "#aeb08a",
    bedColor: "#65765f",
    causticColor: "#e9ecc3",
    shorelineFoamStrength: 0.28,
    shorelineMilkStrength: 0.44,
    slopeFoamStrength: 0.18,
    highlightStrength: 0.26,
    clarity: 0.76,
    rippleContrast: 0.68,
    depthShadowStrength: 0.44,
    causticStrength: 0.2,
    sparkleStrength: 0.2,
  },
  foothillCreek: {
    key: "foothillCreek",
    widthScale: 0.92,
    levelOffset: FOOTHILL_CREEK_SURFACE_OFFSET,
    opacity: 0.84,
    flowSpeed: 1.18,
    roughness: 0.12,
    metalness: 0.03,
    baseWaveAmplitude: 0.046,
    detailWaveAmplitude: 0.023,
    baseFrequency: 50,
    detailFrequency: 92,
    shallowColor: "#b6dfe0",
    deepColor: "#6baab0",
    foamColor: "#fbf6ec",
    shorelineMilkColor: "#edf0e2",
    highlightColor: "#f6d3a0",
    sparkleColor: "#fff5d4",
    reflectionColor: "#cae2ed",
    sedimentColor: "#d8e1cb",
    bedColor: "#8a9980",
    causticColor: "#f4f1cc",
    shorelineFoamStrength: 0.42,
    shorelineMilkStrength: 0.44,
    slopeFoamStrength: 0.34,
    highlightStrength: 0.4,
    clarity: 0.82,
    rippleContrast: 0.88,
    depthShadowStrength: 0.4,
    causticStrength: 0.36,
    sparkleStrength: 0.28,
  },
  alpineRunoff: {
    key: "alpineRunoff",
    widthScale: 0.88,
    levelOffset: ALPINE_RUNOFF_SURFACE_OFFSET,
    opacity: 0.8,
    flowSpeed: 1.46,
    roughness: 0.14,
    metalness: 0.03,
    baseWaveAmplitude: 0.056,
    detailWaveAmplitude: 0.028,
    baseFrequency: 58,
    detailFrequency: 108,
    shallowColor: "#bfdde8",
    deepColor: "#6e9ec5",
    foamColor: "#f8faf8",
    shorelineMilkColor: "#edf2e8",
    highlightColor: "#f9ddaf",
    sparkleColor: "#fdf9e8",
    reflectionColor: "#d7e7f4",
    sedimentColor: "#ccd9cf",
    bedColor: "#7f8e87",
    causticColor: "#eef4db",
    shorelineFoamStrength: 0.4,
    shorelineMilkStrength: 0.28,
    slopeFoamStrength: 0.54,
    highlightStrength: 0.48,
    clarity: 0.74,
    rippleContrast: 1.02,
    depthShadowStrength: 0.5,
    causticStrength: 0.24,
    sparkleStrength: 0.2,
  },
  waterfallOutflow: {
    key: "waterfallOutflow",
    widthScale: 0.9,
    levelOffset: WATERFALL_OUTFLOW_SURFACE_OFFSET,
    opacity: 0.86,
    flowSpeed: 1.68,
    roughness: 0.12,
    metalness: 0.04,
    baseWaveAmplitude: 0.064,
    detailWaveAmplitude: 0.034,
    baseFrequency: 64,
    detailFrequency: 124,
    shallowColor: "#d1ebf0",
    deepColor: "#74afd1",
    foamColor: "#fffdf6",
    shorelineMilkColor: "#f4f4ec",
    highlightColor: "#fde2b7",
    sparkleColor: "#fff9ef",
    reflectionColor: "#dfeefa",
    sedimentColor: "#d7ded3",
    bedColor: "#879089",
    causticColor: "#f7f5e5",
    shorelineFoamStrength: 0.5,
    shorelineMilkStrength: 0.22,
    slopeFoamStrength: 0.66,
    highlightStrength: 0.56,
    clarity: 0.68,
    rippleContrast: 1.14,
    depthShadowStrength: 0.58,
    causticStrength: 0.18,
    sparkleStrength: 0.16,
  },
};

const WATER_RIBBON_COLUMNS = [-1, -0.8, -0.54, -0.22, 0.22, 0.54, 0.8, 1];

function getWaterWidth(options: WaterSurfaceOptions, point: Vector3, t: number) {
  const baseWidth = typeof options.width === "function" ? options.width(point, t) : options.width;
  return baseWidth * options.profile.widthScale;
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
  const lateral = new Vector3();
  const tangent = new Vector3();
  const prevDelta = new Vector3();
  const nextDelta = new Vector3();
  const levelOffset = options.levelOffset ?? options.profile.levelOffset;
  const flowDirection = resolveWaterFlowDirection(points, options.flowDirection);

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
      const edgeDip = Math.pow(Math.abs(offset), 2.4) * 0.12;
      const channel = MathUtils.clamp(1 - Math.abs(offset), 0, 1);
      const bank = 1 - channel;
      positions.push(
        sample.x + lateral.x * halfWidth * offset,
        rowY - edgeDip,
        sample.z + lateral.z * halfWidth * offset,
      );
      uvs.push(columnIndex / (WATER_RIBBON_COLUMNS.length - 1), t);
      channelValues.push(channel);
      bankValues.push(bank);
      slopeValues.push(localSlope);
      flowTValues.push(t);
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
  const totalRings = Math.max(2, rings);
  const totalSegments = Math.max(16, radialSegments);
  const surfaceY = center.y;

  positions.push(center.x, surfaceY, center.z);
  uvs.push(0.5, 0.5);
  channelValues.push(1);
  bankValues.push(0);
  slopeValues.push(0.08);
  flowTValues.push(0);

  for (let ring = 1; ring <= totalRings; ring += 1) {
    const ringT = ring / totalRings;
    for (let segment = 0; segment <= totalSegments; segment += 1) {
      const angleT = segment / totalSegments;
      const angle = angleT * Math.PI * 2;
      const x = center.x + Math.cos(angle) * radiusX * ringT;
      const z = center.z + Math.sin(angle) * radiusZ * ringT;
      const terrainY = sampleTerrainHeight(x, z);
      const edgeBlend = MathUtils.smoothstep(1 - edgeSoftness, 1, ringT);
      const y = MathUtils.lerp(surfaceY, Math.min(surfaceY, terrainY + 0.14), edgeBlend);
      positions.push(x, y, z);
      uvs.push(0.5 + Math.cos(angle) * ringT * 0.5, 0.5 + Math.sin(angle) * ringT * 0.5);
      channelValues.push(MathUtils.clamp(1 - ringT ** 1.3, 0, 1));
      bankValues.push(MathUtils.clamp(ringT ** 1.1, 0, 1));
      slopeValues.push(MathUtils.clamp((1 - sampleTerrainNormal(x, z).y) * 2.8 + edgeBlend * 0.14, 0.04, 0.32));
      flowTValues.push(angleT);
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
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
  const material = new MeshStandardMaterial({
    color: shallowColor,
    roughness: profile.roughness,
    metalness: profile.metalness,
    transparent: true,
    opacity: options.opacity ?? profile.opacity,
    depthWrite: false,
    side: DoubleSide,
    dithering: true,
  });
  let shaderRef: GrassShader | undefined;

  material.onBeforeCompile = (shader: GrassShader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uFlowSpeed = { value: options.flowSpeed ?? profile.flowSpeed };
    shader.uniforms.uFlowDirection = { value: flowDirection };
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
    shader.uniforms.uBaseWaveAmplitude = { value: profile.baseWaveAmplitude };
    shader.uniforms.uDetailWaveAmplitude = { value: profile.detailWaveAmplitude };
    shader.uniforms.uBaseFrequency = { value: profile.baseFrequency };
    shader.uniforms.uDetailFrequency = { value: profile.detailFrequency };
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
        varying vec2 vWaterUv;
        varying vec3 vWaterWorldPosition;
        varying vec3 vWaterViewDirection;
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterSlope;
        varying float vWaterFlowT;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vWaterUv = uv;
        vWaterChannel = aChannel;
        vWaterBank = aBank;
        vWaterSlope = aSlope;
        vWaterFlowT = aFlowT;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float slopeBoost = 0.55 + aSlope * 0.95;
        float channelMask = 0.35 + aChannel * 0.65;
        float flowWarp = sin(aFlowT * 15.0 + uv.x * 9.0 + position.x * 0.025 + uTime * 0.45)
          + cos(aFlowT * 11.0 - uv.x * 12.0 + position.z * 0.018 - uTime * 0.38);
        float broadFlow = sin(aFlowT * uBaseFrequency - uTime * uFlowSpeed * 1.35 * uFlowDirection + position.x * 0.03 + position.z * 0.015 + flowWarp * 0.45);
        float detailFlow = cos((aFlowT + uv.x * 0.18) * uDetailFrequency - uTime * uFlowSpeed * 2.25 * uFlowDirection + position.z * 0.04 + flowWarp * 0.7);
        float crossRipple = sin(uv.x * 18.0 + uTime * 1.4 + aFlowT * 22.0 + flowWarp * 0.6);
        transformed.y += broadFlow * uBaseWaveAmplitude * (0.4 + channelMask * 0.6) * slopeBoost;
        transformed.y += detailFlow * uDetailWaveAmplitude * (0.35 + aSlope * 0.85);
        transformed.y += crossRipple * uDetailWaveAmplitude * 0.45 * (0.3 + aBank * 0.7);`,
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
        uniform float uShorelineFoamStrength;
        uniform float uShorelineMilkStrength;
        uniform float uSlopeFoamStrength;
        uniform float uHighlightStrength;
        uniform float uClarity;
        uniform float uRippleContrast;
        uniform float uDepthShadowStrength;
        uniform float uCausticStrength;
        uniform float uSparkleStrength;
        varying vec2 vWaterUv;
        varying vec3 vWaterWorldPosition;
        varying vec3 vWaterViewDirection;
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterSlope;
        varying float vWaterFlowT;

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
          float amplitude = 0.5;
          for (int i = 0; i < 4; i++) {
            value += waterNoise(p) * amplitude;
            p = p * 2.02 + vec2(17.3, 9.1);
            amplitude *= 0.5;
          }
          return value;
        }`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float slopeBoost = smoothstep(0.08, 0.9, vWaterSlope);
        float channelDepth = pow(clamp(vWaterChannel, 0.0, 1.0), 1.22);
        float bankMask = clamp(vWaterBank, 0.0, 1.0);
        float shallowMask = 1.0 - channelDepth;
        vec2 flowUv = vec2(vWaterFlowT * (uBaseFrequency * 0.1), (vWaterUv.x - 0.5) * 5.4);
        float flowWarp = waterFbm(flowUv * 1.2 + vec2(uTime * 0.16 * uFlowDirection, -uTime * 0.08));
        float eddyNoise = waterFbm(flowUv * 2.6 + vec2(-uTime * 0.34 * uFlowDirection, uTime * 0.12));
        float sparkleNoise = waterFbm(flowUv * 4.8 + vec2(uTime * 0.48 * uFlowDirection, uTime * 0.16));
        vec2 bedUv = vWaterWorldPosition.xz * vec2(0.048, 0.044) + vec2(flowWarp * 0.38, eddyNoise * 0.26);
        float bedNoise = waterFbm(bedUv + vec2(13.4, -7.8));
        float pebbleNoise = waterFbm(bedUv * 2.2 + vec2(-4.6, 9.3));
        float broadFlow = sin(vWaterFlowT * uBaseFrequency - uTime * uFlowSpeed * 1.5 * uFlowDirection + vWaterWorldPosition.x * 0.022 + vWaterWorldPosition.z * 0.015 + flowWarp * 3.0) * 0.5 + 0.5;
        float detailFlow = cos(vWaterFlowT * uDetailFrequency - uTime * uFlowSpeed * 2.6 * uFlowDirection + vWaterUv.x * 16.0 + vWaterWorldPosition.z * 0.03 + eddyNoise * 2.2) * 0.5 + 0.5;
        float currentBands = sin(flowUv.x * 6.5 - uTime * uFlowSpeed * 1.55 * uFlowDirection + flowWarp * 4.2 + flowUv.y * 2.4) * 0.5 + 0.5;
        float sideShimmer = sin((vWaterUv.x - 0.5) * 22.0 + vWaterFlowT * 18.0 - uTime * (1.2 + slopeBoost) * uFlowDirection + flowWarp * 2.0) * 0.5 + 0.5;
        float bankFeather = smoothstep(0.08, 0.92, bankMask);
        vec3 waterTint = mix(uWaterShallow, uWaterDeep, channelDepth * 0.92);
        waterTint = mix(waterTint, uSedimentColor, bankMask * (0.32 + eddyNoise * 0.18));
        waterTint = mix(waterTint, uWaterShallow * vec3(1.08, 1.1, 1.04), shallowMask * (0.1 + uClarity * 0.18));
        waterTint = mix(waterTint, mix(uWaterShallow, uWaterFoam, 0.28), slopeBoost * 0.18);
        float shorelineMilkMask = bankFeather * shallowMask * (1.0 - slopeBoost * 0.48) * (0.46 + eddyNoise * 0.22) * uShorelineMilkStrength;
        waterTint = mix(waterTint, uShorelineMilkColor, shorelineMilkMask);
        vec3 bedTint = mix(uBedColor, uSedimentColor, bedNoise * 0.46 + pebbleNoise * 0.24);
        bedTint = mix(bedTint, uBedColor * vec3(0.82, 0.86, 0.9), channelDepth * 0.42 + slopeBoost * 0.18);
        float bedVisibility = shallowMask * (0.38 + uClarity * 0.5) * (1.0 - slopeBoost * 0.32);
        float causticPattern = sin(bedUv.x * 16.0 + currentBands * 2.8 - uTime * 1.6 * uFlowDirection)
          * cos(bedUv.y * 18.0 - detailFlow * 3.1 + uTime * 1.2);
        causticPattern = causticPattern * 0.5 + 0.5;
        float causticMask = pow(smoothstep(0.58, 1.0, causticPattern + sparkleNoise * 0.24), 1.5) * shallowMask * uCausticStrength;
        float depthShadow = channelDepth * uDepthShadowStrength + slopeBoost * 0.08;
        float shorelineFoam = bankMask * smoothstep(0.46, 0.96, currentBands * (0.55 + uRippleContrast * 0.18) + detailFlow * 0.35 + eddyNoise * 0.28);
        float slopeFoam = slopeBoost * smoothstep(0.5, 1.0, detailFlow * 0.54 + broadFlow * 0.24 + sparkleNoise * 0.22);
        float currentFoam = slopeBoost * smoothstep(0.74, 0.98, currentBands * (0.58 + uRippleContrast * 0.14) + sparkleNoise * 0.32) * 0.42;
        float outletFoam = smoothstep(0.72, 1.0, slopeBoost + bankMask * 0.35) * smoothstep(0.42, 0.92, sideShimmer);
        float foamMask = clamp(
          shorelineFoam * uShorelineFoamStrength
          + slopeFoam * uSlopeFoamStrength
          + currentFoam
          + outletFoam * 0.24,
          0.0,
          1.0
        );
        vec3 viewDir = normalize(vWaterViewDirection);
        float fresnel = pow(1.0 - abs(viewDir.y), 2.3);
        vec3 reflectionTint = mix(uReflectionColor, uHighlightColor, smoothstep(0.48, 1.0, broadFlow * 0.4 + sideShimmer * 0.38 + sparkleNoise * 0.22));
        float highlightRibbon = smoothstep(0.54, 1.0, currentBands * 0.34 + detailFlow * 0.28 + sideShimmer * 0.2 + sparkleNoise * 0.18);
        float highlightMask = fresnel * highlightRibbon * (0.35 + slopeBoost * 0.65) * uHighlightStrength;
        float glintMask = pow(smoothstep(0.76, 1.0, sparkleNoise * 0.55 + detailFlow * 0.45), 2.0) * (0.2 + slopeBoost * 0.4) * fresnel;
        float sparkleScatter = waterNoise(vWaterWorldPosition.xz * 0.22 + vec2(uTime * 0.18, -uTime * 0.12));
        float sparkleTwinkle = sin(uTime * 4.8 + sparkleScatter * 12.0 + vWaterFlowT * 34.0) * 0.5 + 0.5;
        float sparkleMask = pow(
          smoothstep(0.82, 1.0, sparkleScatter * 0.62 + sparkleTwinkle * 0.28 + sideShimmer * 0.1),
          5.0
        ) * shallowMask * (0.18 + fresnel * 0.82) * uSparkleStrength;
        vec3 finalWater = mix(waterTint, bedTint, bedVisibility);
        finalWater += uCausticColor * causticMask;
        finalWater *= 1.0 - depthShadow * 0.16;
        finalWater = mix(finalWater, uWaterFoam, foamMask * (0.3 + bankMask * 0.45 + slopeBoost * 0.3));
        finalWater = mix(finalWater, uShorelineMilkColor, shorelineMilkMask * 0.42);
        finalWater = mix(finalWater, reflectionTint, highlightMask * (0.22 + shallowMask * 0.12 + channelDepth * 0.12));
        finalWater += uHighlightColor * glintMask * 0.55;
        finalWater += uSparkleColor * sparkleMask;
        finalWater += reflectionTint * fresnel * (0.04 + channelDepth * 0.08) * (0.35 + uClarity * 0.65);
        float alphaMask = clamp(0.7 + channelDepth * 0.18 + foamMask * 0.12 + fresnel * 0.05 - bankMask * 0.12 + shorelineMilkMask * 0.08, 0.0, 1.0);
        vec4 diffuseColor = vec4(finalWater, opacity * alphaMask);`,
      );

    shaderRef = shader;
  };

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 2;
  return {
    mesh,
    update(elapsed: number) {
      if (shaderRef) {
        shaderRef.uniforms.uTime.value = elapsed + phaseOffset;
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
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
    width: radius * 2.35,
    segments: 52,
    opacity,
  });
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
    const y = sampleTerrainHeight(x, z) + 0.34;
    points.push(new Vector3(x, y, z));
  }

  return createWaterSurface(points, {
    profile: WATER_PROFILES.mainRiver,
    width: (point: Vector3) => sampleRiverChannelAt(channelId, point.z).width * widthScale,
    segments: Math.max(72, sampleCount * 2),
    opacity,
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

  group.name = "braided-river-system";
  addRiver("main", -214, -146, 46, 1.04);
  addRiver("main", -80, 236, 168, 1.04);
  RIVER_BRANCH_SEGMENTS.forEach((segment) => {
    const sampleCount = Math.max(42, Math.round((segment.endZ - segment.startZ) * 0.68));
    addRiver(segment.id, segment.startZ, segment.endZ, sampleCount, 0.98, 0.78);
  });

  return { group, controllers };
}

export function makeOpeningLakeSurface() {
  const center = new Vector3(
    OPENING_LAKE_CENTER_X,
    sampleTerrainHeight(OPENING_LAKE_CENTER_X, OPENING_LAKE_CENTER_Z) + OPENING_LAKE_SURFACE_OFFSET,
    OPENING_LAKE_CENTER_Z,
  );

  return createLakeSurface(center, {
    profile: WATER_PROFILES.mainRiver,
    width: OPENING_LAKE_RADIUS * 2,
    flowSpeed: 0.12,
  }, {
    radiusX: OPENING_LAKE_RADIUS * 1.32,
    radiusZ: OPENING_LAKE_RADIUS * 1.08,
    radialSegments: 68,
    rings: 9,
    edgeSoftness: 0.4,
  });
}

export function buildHighlandWaterways(): WaterSurfaceGroup {
  const group = new Group();
  group.name = "highland-waterways-muted";
  return { group, controllers: [] };
}
