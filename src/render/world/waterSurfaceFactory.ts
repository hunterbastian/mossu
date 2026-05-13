import { BufferGeometry, Color, DoubleSide, FrontSide, Mesh, MeshBasicMaterial, Vector3, Vector4 } from "three";
import { GrassShader } from "./grassSystem";
import { getPainterlyTextureSet } from "./painterlyTextures";
import { buildWaterRibbonGeometry, createLakeGeometry, createWaterVolumeGeometry, type WaterSurfaceOptions } from "./waterSurfaceGeometry";
import type { WaterProfile } from "./waterProfiles";
import { WATER_RIPPLE_LIFETIME, WATER_RIPPLE_LIMIT } from "./waterRipples";
import type { WaterRippleSource, WaterSurfaceController } from "./waterTypes";

type WaterSurfaceBackend = "webgl";

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

export class WaterSurface implements WaterSurfaceController {
  readonly mesh: Mesh;

  constructor(private readonly resources: WaterSurfaceResources) {
    this.mesh = resources.mesh;
  }

  update(elapsed: number, ripples: readonly WaterRippleSource[] = [], mapLookdown = false, depthDebug = false) {
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

/** Under-surface copy of the mesh; a bit lower hides cracks between the two layers. */
const WATER_UNDERFILL_OFFSET = -0.1;
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
  const painterlyTextures = getPainterlyTextureSet();
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
    opacity: profile.key === "stillPool" ? 0.004 : 0.003,
    depthWrite: false,
    side: FrontSide,
  });
  const volumeGeometry = createWaterVolumeGeometry(geometry);
  const volumeOpacity =
    profile.key === "stillPool"
      ? 0.0016
      : profile.key === "waterfallOutflow"
        ? 0.0012
        : profile.key === "alpineRunoff" || profile.key === "foothillCreek"
          ? 0.0014
          : 0.0016;
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
              float life = ${WATER_RIPPLE_LIFETIME.toFixed(2)};
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.4 + source.w * 2.1);
              float ring = exp(-abs(distanceToSource - front) * (1.42 + source.w * 0.28));
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
        float flowTravelV = uTime * uFlowSpeed * uFlowDirection;
        float flowWarpV = sin(aFlowT * 13.0 + uv.x * 8.0 + position.x * 0.025 - flowTravelV * 0.32 + flowCurlV * 1.7)
          + cos(aFlowT * 10.0 - uv.x * 11.0 + position.z * 0.018 + flowTravelV * 0.24 + flowCurlV * 2.3);
        float broadFlowV = sin(aFlowT * uBaseFrequency - flowTravelV * 1.35 + position.x * 0.03 + position.z * 0.015 + flowWarpV * 0.46 + flowCurlV * 2.2);
        float detailFlowV = cos((aFlowT + uv.x * 0.18 + flowCurlV * 0.035) * uDetailFrequency - flowTravelV * 2.2 + position.z * 0.04 + flowWarpV * 0.72);
        float travelingSheetV = sin(aFlowT * uBaseFrequency * 1.38 + uv.x * 7.6 - flowTravelV * 1.92 + flowWarpV * 0.82 + flowCurlV * 2.6);
        float bankLapV = sin((1.0 - aChannel) * 11.0 + aFlowT * 18.0 - flowTravelV * 1.22 + flowCurlV * 3.6);
        float localRippleV = waterRippleRingVolume(position.xz, (0.24 + aChannel * 0.58) * (1.0 - aBank * 0.2));
        float waveVisV = mix(1.0, 0.08, uMapLookdown) * aVolumeSurface;
        transformed.y += broadFlowV * uBaseWaveAmplitude * (0.4 + channelMaskV * 0.6) * slopeBoostV * waveVisV;
        transformed.y += detailFlowV * uDetailWaveAmplitude * (0.35 + aSlope * 0.85) * waveVisV;
        transformed.y += travelingSheetV * uBaseWaveAmplitude * 0.18 * (0.28 + aChannel * 0.72) * waveVisV;
        transformed.y += bankLapV * uDetailWaveAmplitude * 0.32 * aBank * (0.35 + aSlope * 0.65) * waveVisV;
        transformed.y += localRippleV * 0.18 * waveVisV;`,
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
              float life = ${WATER_RIPPLE_LIFETIME.toFixed(2)};
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.4 + source.w * 2.1);
              float ring = exp(-abs(distanceToSource - front) * (1.42 + source.w * 0.28));
              float wakeCore = exp(-distanceToSource * 0.38) * 0.22;
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
        float flowTravelF = uTime * uFlowSpeed * uFlowDirection;
        float flowWarpF = sin(aFlowT * 13.0 + uv.x * 8.0 + position.x * 0.025 - flowTravelF * 0.32 + flowCurlF * 1.7)
          + cos(aFlowT * 10.0 - uv.x * 11.0 + position.z * 0.018 + flowTravelF * 0.24 + flowCurlF * 2.3);
        float broadFlowF = sin(aFlowT * uBaseFrequency - flowTravelF * 1.35 + position.x * 0.03 + position.z * 0.015 + flowWarpF * 0.46 + flowCurlF * 2.2);
        float detailFlowF = cos((aFlowT + uv.x * 0.18 + flowCurlF * 0.035) * uDetailFrequency - flowTravelF * 2.2 + position.z * 0.04 + flowWarpF * 0.72);
        float crossRippleF = sin(uv.x * 18.0 - flowTravelF * 1.05 + aFlowT * 22.0 + flowWarpF * 0.6 + flowCurlF * 3.0);
        float travelingSheetF = sin(aFlowT * uBaseFrequency * 1.38 + uv.x * 7.6 - flowTravelF * 1.92 + flowWarpF * 0.82 + flowCurlF * 2.6);
        float bankLapF = sin((1.0 - aChannel) * 11.0 + aFlowT * 18.0 - flowTravelF * 1.22 + flowCurlF * 3.6);
        float localRippleF = waterRippleRingFill(position.xz, (0.28 + aChannel * 0.72) * (1.0 - aBank * 0.2));
        float waveVisF = mix(1.0, 0.08, uMapLookdown);
        transformed.y += broadFlowF * uBaseWaveAmplitude * (0.4 + channelMaskF * 0.6) * slopeBoostF * waveVisF;
        transformed.y += detailFlowF * uDetailWaveAmplitude * (0.35 + aSlope * 0.85) * waveVisF;
        transformed.y += crossRippleF * uDetailWaveAmplitude * 0.45 * (0.3 + aBank * 0.7) * waveVisF;
        transformed.y += travelingSheetF * uBaseWaveAmplitude * 0.18 * (0.28 + aChannel * 0.72) * waveVisF;
        transformed.y += bankLapF * uDetailWaveAmplitude * 0.32 * aBank * (0.35 + aSlope * 0.65) * waveVisF;
        transformed.y += localRippleF * 0.28 * waveVisF;
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
    shader.uniforms.uShorelineDefinition = { value: profile.shorelineDefinition };
    shader.uniforms.uDepthBandStrength = { value: profile.depthBandStrength };
    shader.uniforms.uCurrentStrokeStrength = { value: profile.currentStrokeStrength };
    shader.uniforms.uHeroSpecularStrength = { value: profile.heroSpecularStrength };
    shader.uniforms.uWaterFoamTexture = { value: painterlyTextures.waterFoam };

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
              float life = ${WATER_RIPPLE_LIFETIME.toFixed(2)};
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.4 + source.w * 2.1);
              float ring = exp(-abs(distanceToSource - front) * (1.42 + source.w * 0.28));
              float wakeCore = exp(-distanceToSource * 0.38) * 0.22;
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
        float flowTravel = uTime * uFlowSpeed * uFlowDirection;
        float flowWarp = sin(aFlowT * 13.0 + uv.x * 8.0 + position.x * 0.025 - flowTravel * 0.32 + flowCurl * 1.7)
          + cos(aFlowT * 10.0 - uv.x * 11.0 + position.z * 0.018 + flowTravel * 0.24 + flowCurl * 2.3);
        float broadFlow = sin(aFlowT * uBaseFrequency - flowTravel * 1.35 + position.x * 0.03 + position.z * 0.015 + flowWarp * 0.46 + flowCurl * 2.2);
        float detailFlow = cos((aFlowT + uv.x * 0.18 + flowCurl * 0.035) * uDetailFrequency - flowTravel * 2.2 + position.z * 0.04 + flowWarp * 0.72);
        float crossRipple = sin(uv.x * 18.0 - flowTravel * 1.05 + aFlowT * 22.0 + flowWarp * 0.6 + flowCurl * 3.0);
        float travelingSheet = sin(aFlowT * uBaseFrequency * 1.38 + uv.x * 7.6 - flowTravel * 1.92 + flowWarp * 0.82 + flowCurl * 2.6);
        float bankLap = sin((1.0 - aChannel) * 11.0 + aFlowT * 18.0 - flowTravel * 1.22 + flowCurl * 3.6);
        float localRipple = waterRippleRing(position.xz, (0.28 + aChannel * 0.72) * (1.0 - aBank * 0.2));
        float waveVisibility = mix(1.0, 0.08, uMapLookdown);
        transformed.y += broadFlow * uBaseWaveAmplitude * (0.4 + channelMask * 0.6) * slopeBoost * waveVisibility;
        transformed.y += detailFlow * uDetailWaveAmplitude * (0.35 + aSlope * 0.85) * waveVisibility;
        transformed.y += crossRipple * uDetailWaveAmplitude * 0.45 * (0.3 + aBank * 0.7) * waveVisibility;
        transformed.y += travelingSheet * uBaseWaveAmplitude * 0.18 * (0.28 + aChannel * 0.72) * waveVisibility;
        transformed.y += bankLap * uDetailWaveAmplitude * 0.32 * aBank * (0.35 + aSlope * 0.65) * waveVisibility;
        transformed.y += localRipple * 0.28 * waveVisibility;`,
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
        uniform float uShorelineDefinition;
        uniform float uDepthBandStrength;
        uniform float uCurrentStrokeStrength;
        uniform float uHeroSpecularStrength;
        uniform float uDepthDebug;
        uniform sampler2D uWaterFoamTexture;
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
        uniform float uSceneWaterSparkle;
        uniform float uSceneSunHaze;

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
              float life = ${WATER_RIPPLE_LIFETIME.toFixed(2)};
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.4 + source.w * 2.1);
              float ring = exp(-abs(distanceToSource - front) * (1.42 + source.w * 0.28));
              float wakeCore = exp(-distanceToSource * 0.38) * 0.22;
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
        float painterDepth = mix(channelDepth, toonDepthBand, 0.58);
        float bankMask = clamp(vWaterBank, 0.0, 1.0);
        float shallowMask = 1.0 - channelDepth;
        float flowCurl = vWaterFlowCurl;
        float flowTravel = uTime * uFlowSpeed * uFlowDirection;
        float bendStrength = abs(flowCurl);
        vec2 proceduralFlow = normalize(vec2(1.0, flowCurl * 0.72 + (vWaterUv.x - 0.5) * bankMask * 0.55));
        vec2 flowUv = vec2(
          vWaterFlowT * (uBaseFrequency * 0.1) + proceduralFlow.y * 0.38 - flowTravel * 0.055,
          (vWaterUv.x - 0.5) * 5.4 + flowCurl * 0.9
        );
        vec2 movingFlowUv = flowUv + vec2(-flowTravel * 0.08, flowTravel * 0.025 + flowCurl * 0.035);
        float generatedFoamGrain = texture2D(
          uWaterFoamTexture,
          movingFlowUv * vec2(0.18, 0.72) + vec2(uTime * 0.025 * uFlowDirection, -uTime * 0.018)
        ).r;
        float flowWarp = waterFbm(movingFlowUv * 1.2 + vec2(uTime * 0.16 * uFlowDirection, -uTime * 0.08) * proceduralFlow);
        float eddyNoise = waterFbm(movingFlowUv * 2.6 + vec2(-uTime * 0.34 * uFlowDirection, uTime * 0.12 + flowCurl * 0.18));
        float sparkleNoise = waterFbm(movingFlowUv * 4.8 + vec2(uTime * 0.48 * uFlowDirection, uTime * 0.16));
        vec2 bedUv = vWaterWorldPosition.xz * vec2(0.048, 0.044) + vec2(flowWarp * 0.38, eddyNoise * 0.26);
        float bedNoise = waterFbm(bedUv + vec2(13.4, -7.8));
        float pebbleNoise = fract(bedNoise * 5.7);
        float broadFlow = sin(vWaterFlowT * uBaseFrequency - flowTravel * 1.5 + vWaterWorldPosition.x * 0.022 + vWaterWorldPosition.z * 0.015 + flowWarp * 3.0 + flowCurl * 2.6) * 0.5 + 0.5;
        float detailFlow = cos(vWaterFlowT * uDetailFrequency - flowTravel * 2.6 + vWaterUv.x * 16.0 + vWaterWorldPosition.z * 0.03 + eddyNoise * 2.2 + flowCurl * 1.5) * 0.5 + 0.5;
        float currentBands = sin(movingFlowUv.x * 6.5 - flowTravel * 1.55 + flowWarp * 4.2 + movingFlowUv.y * 2.4 + flowCurl * 2.1) * 0.5 + 0.5;
        float slowGlassBand = sin(movingFlowUv.x * 3.2 - flowTravel * 0.62 + movingFlowUv.y * 1.1 + flowWarp * 1.8) * 0.5 + 0.5;
        float sideShimmer = sin((vWaterUv.x - 0.5) * 22.0 + vWaterFlowT * 18.0 - flowTravel * (1.2 + slopeBoost) + flowWarp * 2.0 + flowCurl * 4.0) * 0.5 + 0.5;
        float longFlowThread = smoothstep(
          0.56,
          1.0,
          sin(movingFlowUv.x * 14.0 - flowTravel * 2.35 + movingFlowUv.y * 3.6 + flowWarp * 5.4 + flowCurl * 3.2) * 0.5 + 0.5
        ) * (0.2 + slopeBoost * 0.42) * (1.0 - bankMask * 0.38);
        float braidedCurrent = smoothstep(
          0.6,
          1.0,
          sin(movingFlowUv.x * 9.6 - flowTravel * 2.85 + movingFlowUv.y * 2.9 + flowWarp * 4.6 + flowCurl * 2.8) * 0.5 + 0.5
        ) * (0.18 + slopeBoost * 0.24 + shallowMask * 0.18) * (1.0 - bankMask * 0.48);
        float surfaceDrift = smoothstep(
          0.48,
          0.9,
          waterFbm(vec2(movingFlowUv.x * 2.1 - flowTravel * 0.34, movingFlowUv.y * 0.78 + flowCurl * 0.22)) * 0.62 + slowGlassBand * 0.38
        ) * (0.14 + shallowMask * 0.2) * (1.0 - bankMask * 0.52);
        float lensCurrent = smoothstep(
          0.5,
          1.0,
          sin(movingFlowUv.x * 4.4 - flowTravel * 0.95 + movingFlowUv.y * 0.86 + flowWarp * 2.4) * 0.5 + 0.5
        ) * shallowMask * (0.12 + uClarity * 0.16) * (1.0 - bankMask * 0.42);
        float counterEddy = bendStrength * smoothstep(0.22, 0.88, bankMask) * smoothstep(
          0.54,
          1.0,
          sin(movingFlowUv.x * 7.0 + flowTravel * (1.25 + bendStrength) - movingFlowUv.y * 8.2 + eddyNoise * 4.0 + flowCurl * 3.6) * 0.5 + 0.5
        );
        float brokenWhitecap = slopeBoost * smoothstep(
          0.76,
          1.0,
          eddyNoise * 0.42 + currentBands * 0.34 + detailFlow * 0.24 + sideShimmer * 0.18
        );
        float glassRibbon = smoothstep(
          0.62,
          1.0,
          broadFlow * 0.28 + detailFlow * 0.22 + sideShimmer * 0.22 + sparkleNoise * 0.16 + surfaceDrift * 0.28
        ) * (0.2 + shallowMask * 0.26 + slopeBoost * 0.3) * (1.0 - bankMask * 0.35);
        float handFoamStroke = smoothstep(
          0.72,
          1.0,
          sin(movingFlowUv.x * 18.0 - flowTravel * 2.05 + movingFlowUv.y * 4.2 + flowWarp * 4.8) * 0.5 + 0.5
        ) * (0.12 + slopeBoost * 0.34 + bankMask * 0.12) * (1.0 - bankMask * 0.28);
        float bendEddy = bendStrength * smoothstep(0.18, 0.86, bankMask) * smoothstep(0.32, 0.96, sin((vWaterUv.x - 0.5) * 18.0 + vWaterFlowT * 24.0 + flowTravel * (1.0 + bendStrength) + eddyNoise * 3.2) * 0.5 + 0.5);
        bendEddy = max(bendEddy, counterEddy * 0.7);
        float actorRipple = waterRippleRing(vWaterWorldPosition.xz, (0.34 + shallowMask * 0.66) * (1.0 - bankMask * 0.22));
        float bankFeather = smoothstep(0.08, 0.92, bankMask);
        float shorelineLine = smoothstep(0.56, 0.76, bankMask) * (1.0 - smoothstep(0.9, 1.0, bankMask));
        float shorelineEdge = smoothstep(0.78, 1.0, bankMask);
        float graphicShoreLine = smoothstep(0.64, 0.76, bankMask) * (1.0 - smoothstep(0.82, 0.93, bankMask));
        float softMilkEdge = smoothstep(0.42, 0.84, bankMask) * (1.0 - smoothstep(0.88, 1.0, bankMask)) * shallowMask;
        float shallowShelfLine = smoothstep(0.2, 0.34, channelDepth) * (1.0 - smoothstep(0.42, 0.58, channelDepth));
        float deepCoreLine = smoothstep(0.64, 0.78, channelDepth) * (1.0 - smoothstep(0.86, 0.96, channelDepth));
        vec2 shoreTextureUv = vec2(
          vWaterFlowT * 0.12 + flowCurl * 0.08,
          bankMask * 0.72 + movingFlowUv.y * 0.055 - flowTravel * 0.012
        );
        float shorePaintGrain = texture2D(uWaterFoamTexture, shoreTextureUv + vec2(0.0, generatedFoamGrain * 0.05)).r;
        float shoreStrokeWave = sin(
          vWaterFlowT * 18.0
          + bankMask * 20.0
          + flowWarp * 4.0
          - flowTravel * 1.12
        ) * 0.5 + 0.5;
        float handShoreStroke = smoothstep(0.48, 0.88, shorePaintGrain * 0.54 + shoreStrokeWave * 0.36 + eddyNoise * 0.1)
          * (graphicShoreLine * 0.84 + shorelineLine * 0.32)
          * (0.62 + shallowMask * 0.38)
          * (0.82 + uShorelineDefinition * 0.42);
        float bankLap = smoothstep(0.34, 0.92, bankMask) * (1.0 - smoothstep(0.9, 1.0, bankMask)) * smoothstep(
          0.52,
          1.0,
          sin(bankMask * 24.0 + vWaterFlowT * 9.0 - flowTravel * 1.72 + shorePaintGrain * 2.8 + flowCurl * 2.2) * 0.5 + 0.5
        ) * (0.12 + shallowMask * 0.22);
        float shoreMilkBloom = softMilkEdge * smoothstep(0.28, 0.86, shorePaintGrain + shallowMask * 0.32)
          * (0.72 + currentBands * 0.28)
          * (0.86 + uShorelineDefinition * 0.18);
        float shallowPaintBand = shallowShelfLine
          * smoothstep(0.2, 0.82, shorePaintGrain * 0.48 + slowGlassBand * 0.34 + broadFlow * 0.18)
          * (0.72 + uDepthBandStrength * 0.34);
        float midDepthBand = smoothstep(0.38, 0.5, channelDepth) * (1.0 - smoothstep(0.56, 0.7, channelDepth));
        float paintedDepthContour = (
          shallowPaintBand * 0.82
          + midDepthBand * smoothstep(0.56, 0.96, currentBands + shorePaintGrain * 0.18) * 0.32
          + deepCoreLine * smoothstep(0.48, 0.92, flowWarp + eddyNoise * 0.2) * 0.58
        ) * (1.0 - bankMask * 0.28) * uDepthBandStrength;
        float directionalRipple = smoothstep(
          0.5,
          1.0,
          sin(movingFlowUv.x * 11.0 - flowTravel * 2.1 + movingFlowUv.y * 1.35 + flowWarp * 4.8 + flowCurl * 2.4) * 0.5 + 0.5
        );
        vec3 waterTint = mix(uWaterShallow, uWaterDeep, toonDepthBand * 0.92);
        waterTint = mix(waterTint, mix(uWaterShallow, uWaterDeep, toonDepthBand), 0.42);
        waterTint = mix(waterTint, uSedimentColor, bankMask * (0.04 + eddyNoise * 0.02));
        waterTint = mix(waterTint, uSedimentColor * vec3(0.88, 0.96, 0.82), shorelineEdge * (0.035 + eddyNoise * 0.015));
        waterTint = mix(waterTint, uWaterShallow * vec3(1.02, 1.04, 1.0), shallowMask * (0.06 + uClarity * 0.1));
        waterTint = mix(waterTint, mix(uWaterShallow, uWaterFoam, 0.16), slopeBoost * 0.1);
        waterTint = mix(waterTint, uWaterShallow * vec3(1.04, 1.02, 0.96), shallowShelfLine * 0.14);
        waterTint = mix(waterTint, uWaterShallow * vec3(1.08, 1.05, 0.92), shallowPaintBand * 0.1);
        waterTint = mix(waterTint, mix(uWaterShallow, uWaterDeep, 0.5), midDepthBand * 0.06);
        waterTint = mix(waterTint, uWaterDeep * vec3(0.82, 0.94, 1.02), deepCoreLine * 0.22);
        float shorelineMilkMask = (
          bankFeather * shallowMask * (1.0 - slopeBoost * 0.48) * (0.26 + eddyNoise * 0.1) +
          shorelineLine * (0.18 + directionalRipple * 0.11) +
          softMilkEdge * (0.22 + generatedFoamGrain * 0.09) +
          shoreMilkBloom * (0.18 + uShorelineMilkStrength * 0.32) +
          handShoreStroke * (0.1 + shorePaintGrain * 0.08)
        ) * uShorelineMilkStrength;
        shorelineMilkMask = min(shorelineMilkMask, 0.27 + uShorelineDefinition * 0.04);
        waterTint = mix(waterTint, uShorelineMilkColor, shorelineMilkMask);
        vec3 bedTint = mix(uWaterShallow, uWaterDeep, painterDepth * 0.42 + bedNoise * 0.07 + pebbleNoise * 0.03);
        bedTint = mix(bedTint, uBedColor, (1.0 - channelDepth) * 0.55);
        bedTint = mix(bedTint, uSedimentColor, bankMask * 0.3);
        float bedVisibility = (1.0 - channelDepth) * (0.12 + uClarity * 0.08) * (1.0 - bankMask * 0.62);
        float causticPattern = sin(bedUv.x * 16.0 + currentBands * 2.8 - flowTravel * 1.6)
          * cos(bedUv.y * 18.0 - detailFlow * 3.1 + flowTravel * 1.2);
        causticPattern = causticPattern * 0.5 + 0.5;
        float travelingCaustic = smoothstep(
          0.56,
          1.0,
          sin(bedUv.x * 9.4 - flowTravel * 2.25 + bedUv.y * 3.8 + flowWarp * 2.6) * 0.5 + 0.5
        );
        float causticMask = pow(smoothstep(0.58, 1.0, causticPattern + sparkleNoise * 0.24 + travelingCaustic * 0.16), 1.5) * shallowMask * uCausticStrength;
        float depthShadow = channelDepth * uDepthShadowStrength + slopeBoost * 0.08;
        float shorelineFoam = shorelineLine * smoothstep(0.3, 0.86, directionalRipple * 0.36 + currentBands * (0.34 + uRippleContrast * 0.16) + detailFlow * 0.24 + eddyNoise * 0.16 + bendEddy * 0.2);
        float slopeFoam = slopeBoost * smoothstep(0.5, 1.0, detailFlow * 0.54 + broadFlow * 0.24 + sparkleNoise * 0.22);
        float currentFoam = slopeBoost * smoothstep(0.68, 0.98, currentBands * (0.48 + uRippleContrast * 0.14) + directionalRipple * 0.28 + sparkleNoise * 0.28 + bendEddy * 0.2) * 0.46;
        float outletFoam = smoothstep(0.72, 1.0, slopeBoost + bankMask * 0.35) * smoothstep(0.42, 0.92, sideShimmer);
        float milkFoamStroke = handShoreStroke * smoothstep(0.38, 0.88, shorePaintGrain + shoreStrokeWave * 0.22)
          * (0.26 + uShorelineFoamStrength * 0.24);
        float wakeFoam = actorRipple * smoothstep(0.26, 0.96, directionalRipple + sparkleNoise * 0.28) * (0.14 + uRippleContrast * 0.18);
        float foamMask = clamp(
          shorelineFoam * uShorelineFoamStrength * (0.76 + uShorelineDefinition * 0.34)
          + graphicShoreLine * (0.14 + uShorelineDefinition * 0.13 + uShorelineMilkStrength * 0.24)
          + milkFoamStroke
          + slopeFoam * uSlopeFoamStrength
          + currentFoam
          + generatedFoamGrain * graphicShoreLine * 0.08
          + generatedFoamGrain * slopeBoost * 0.05
          + longFlowThread * uSlopeFoamStrength * 0.22
          + braidedCurrent * (0.08 + slopeBoost * 0.12)
          + handFoamStroke * 0.24
          + brokenWhitecap * uSlopeFoamStrength * 0.28
          + bendEddy * 0.18
          + bankLap * (0.22 + uShorelineFoamStrength * 0.18)
          + actorRipple * 0.36
          + wakeFoam
          + outletFoam * 0.24,
          0.0,
          0.72
        );
        vec3 viewDir = normalize(vWaterViewDirection);
        float ndotV = clamp(abs(viewDir.y), 0.035, 1.0);
        float fresnelBase = pow(1.0 - ndotV, 2.52);
        float fresnel = min(1.0, fresnelBase * (1.0 + shallowMask * 0.12 + (1.0 - channelDepth) * 0.06));
        vec3 reflectionTint = mix(uReflectionColor, uHighlightColor, smoothstep(0.48, 1.0, broadFlow * 0.34 + sideShimmer * 0.3 + surfaceDrift * 0.24 + sparkleNoise * 0.18));
        reflectionTint = mix(reflectionTint, uSceneHorizon * vec3(0.94, 1.04, 0.96), uSceneSunHaze * 0.16 + fresnel * 0.06);
        float highlightRibbon = smoothstep(0.5, 1.0, currentBands * 0.22 + directionalRipple * 0.2 + detailFlow * 0.2 + sideShimmer * 0.14 + surfaceDrift * 0.18 + braidedCurrent * 0.18 + sparkleNoise * 0.14 + actorRipple * 0.24);
        float sceneSparkle = 1.0 + uSceneWaterSparkle * 0.42;
        float highlightMask = fresnel * highlightRibbon * (0.18 + slopeBoost * 0.32) * uHighlightStrength * sceneSparkle;
        float glintMask = pow(smoothstep(0.82, 1.0, sparkleNoise * 0.45 + detailFlow * 0.35), 2.0) * (0.08 + slopeBoost * 0.18 + uSceneSunHaze * 0.04) * fresnel;
        float sunPath = smoothstep(
          0.64,
          1.0,
          currentBands * 0.34 + slowGlassBand * 0.28 + sideShimmer * 0.2 + sparkleNoise * 0.18 + uSceneSunHaze * 0.1
        ) * fresnel * (0.08 + uSceneSunHaze * 0.14 + uSceneWaterSparkle * 0.06) * (1.0 - bankMask * 0.34);
        float sparkleScatter = waterNoise(vWaterWorldPosition.xz * 0.22 + vec2(uTime * 0.18, -uTime * 0.12));
        float sparkleTwinkle = sin(uTime * 4.8 + sparkleScatter * 12.0 + vWaterFlowT * 34.0) * 0.5 + 0.5;
        float sparkleScore = sparkleScatter * 0.62 + sparkleTwinkle * 0.28 + sideShimmer * 0.1;
        float sparkleMask = pow(
          smoothstep(0.84, 1.0, sparkleScore),
          6.0
        ) * step(0.9, sparkleScore) * shallowMask * (0.06 + fresnel * 0.32) * uSparkleStrength * sceneSparkle
          * (0.75 + uHeroSpecularStrength * 0.35);
        float sparkleStroke = smoothstep(
          0.78,
          1.0,
          sin(movingFlowUv.x * 22.0 + movingFlowUv.y * 7.4 - flowTravel * 3.4 + sparkleNoise * 3.2) * 0.5 + 0.5
        ) * shallowMask * (0.04 + fresnel * 0.12) * uSparkleStrength * sceneSparkle * (1.0 - bankMask * 0.45)
          * (0.72 + uHeroSpecularStrength * 0.42);
        vec3 bodyFill = mix(uWaterShallow, uWaterDeep, clamp(painterDepth * 0.72 + 0.12, 0.0, 1.0));
        bodyFill = mix(bodyFill, uReflectionColor, fresnel * 0.12 + shallowMask * 0.04);
        vec3 finalWater = mix(bodyFill, waterTint, 0.58);
        finalWater = mix(finalWater, bedTint, bedVisibility);
        finalWater += uCausticColor * causticMask;
        finalWater += uHighlightColor * lensCurrent * uHighlightStrength * 0.035;
        finalWater *= 1.0 - depthShadow * 0.055;
        float paintedCurrentLine = smoothstep(0.7, 0.9, currentBands) * (1.0 - smoothstep(0.88, 1.0, currentBands)) * (0.16 + slopeBoost * 0.24) * (1.0 - bankMask * 0.48);
        float glassCurrentLine = smoothstep(0.7, 0.96, slowGlassBand * 0.52 + detailFlow * 0.24 + sparkleNoise * 0.18) * (0.18 + shallowMask * 0.34) * (1.0 - bankMask * 0.42);
        finalWater = mix(
          finalWater,
          uHighlightColor,
          paintedCurrentLine * (0.05 + uCurrentStrokeStrength * 0.06)
            + glassCurrentLine * uHighlightStrength * (0.035 + uCurrentStrokeStrength * 0.035)
            + braidedCurrent * uHighlightStrength * (0.026 + uCurrentStrokeStrength * 0.032)
        );
        finalWater = mix(finalWater, uReflectionColor, (surfaceDrift + lensCurrent * 0.72) * (0.025 + shallowMask * 0.025));
        finalWater = mix(finalWater, uWaterFoam, longFlowThread * (0.05 + slopeBoost * 0.1) + handFoamStroke * 0.18 + counterEddy * 0.07);
        finalWater = mix(
          finalWater,
          uWaterFoam,
          milkFoamStroke * (0.22 + uShorelineDefinition * 0.08)
            + handShoreStroke * (0.1 + uShorelineDefinition * 0.05)
            + bankLap * (0.16 + uShorelineDefinition * 0.08)
        );
        finalWater = mix(finalWater, uWaterFoam, foamMask * (0.18 + shorelineLine * 0.28 + slopeBoost * 0.2));
        finalWater = mix(finalWater, uShorelineMilkColor, shorelineMilkMask * 0.2 + graphicShoreLine * 0.1 + softMilkEdge * 0.04 + shoreMilkBloom * 0.07);
        finalWater = mix(finalWater, uHighlightColor, shallowShelfLine * 0.08 + shallowPaintBand * 0.045);
        vec3 contourInk = mix(uSedimentColor * vec3(0.64, 0.78, 0.66), uWaterDeep * vec3(0.72, 0.9, 1.0), channelDepth);
        finalWater = mix(
          finalWater,
          contourInk,
          (graphicShoreLine * (0.034 + uShorelineDefinition * 0.018)
            + shallowShelfLine * (0.018 + uDepthBandStrength * 0.014)
            + deepCoreLine * (0.028 + uDepthBandStrength * 0.018)
            + paintedDepthContour * 0.036)
            * (1.0 - uMapLookdown * 0.5)
        );
        vec3 bankInkColor = mix(uWaterDeep * vec3(0.5, 0.78, 0.92), uSedimentColor * vec3(0.54, 0.72, 0.58), bankMask);
        float bankInkMask =
          (graphicShoreLine * (0.2 + uShorelineDefinition * 0.05)
            + shorelineLine * (0.14 + uShorelineDefinition * 0.05)
            + deepCoreLine * (0.045 + uDepthBandStrength * 0.025)
            + paintedDepthContour * 0.045)
          * (1.0 - uMapLookdown * 0.58);
        finalWater = mix(finalWater, bankInkColor, bankInkMask);
        finalWater = mix(finalWater, reflectionTint, highlightMask * (0.08 + shallowMask * 0.04 + channelDepth * 0.04));
        finalWater = mix(finalWater, uHighlightColor, glassRibbon * uHighlightStrength * 0.06);
        finalWater = mix(finalWater, uWaterFoam, actorRipple * 0.25 + wakeFoam * 0.34);
        finalWater += uHighlightColor * glintMask * uHighlightStrength * (0.18 + uHeroSpecularStrength * 0.18);
        finalWater += mix(uHighlightColor, uSparkleColor, 0.38) * sunPath * uHighlightStrength * (0.26 + uHeroSpecularStrength * 0.24);
        finalWater += uSparkleColor * sparkleMask;
        finalWater += uSparkleColor * sparkleStroke * 0.42;
        finalWater += uSparkleColor * glassRibbon * uSparkleStrength * 0.035;
        finalWater += reflectionTint * fresnel * (0.006 + channelDepth * 0.012) * (0.12 + uClarity * 0.18);
        float shallowGlow = (shorelineLine * 0.22 + shallowShelfLine * 0.14 + highlightMask * 0.08) * shallowMask * (1.0 - uMapLookdown);
        finalWater += mix(uHighlightColor, uSparkleColor, 0.35) * shallowGlow * (0.22 + uSparkleStrength);
        vec3 waterCeiling = mix(vec3(0.13, 0.56, 0.82), vec3(0.96, 0.98, 0.88), clamp(foamMask * 0.56 + sparkleMask * 0.7 + sunPath * 0.42, 0.0, 1.0));
        finalWater = min(finalWater, waterCeiling);
        float finalLuma = dot(finalWater, vec3(0.2126, 0.7152, 0.0722));
        float lumaLimit = mix(0.78, 0.92, clamp(foamMask * 0.32 + sparkleMask * 0.46 + shallowMask * 0.18, 0.0, 1.0));
        finalWater *= mix(1.0, lumaLimit / max(finalLuma, 0.001), smoothstep(lumaLimit, lumaLimit + 0.16, finalLuma));
        float alphaMask = gl_FrontFacing ? 1.0 : 0.16;
        float depthAlpha = smoothstep(0.05, 0.9, vWaterDepth);
        float bankAlpha = mix(1.0, 0.34, smoothstep(0.38, 1.0, bankMask));
        float liftedBankAlpha = mix(1.0, 0.42, fillLiftMask);
        alphaMask *= clamp(
          mix(0.22, 1.0, depthAlpha) * bankAlpha * liftedBankAlpha + foamMask * 0.08 + graphicShoreLine * 0.06,
          0.08,
          1.0
        );
        float mapDepthBand =
          channelDepth > 0.68 ? 0.86 :
          channelDepth > 0.34 ? 0.48 :
          0.14;
        vec3 mapShallow = vec3(0.32, 0.82, 0.9);
        vec3 mapDeep = vec3(0.04, 0.42, 0.66);
        vec3 mapBank = vec3(0.46, 0.72, 0.68);
        vec3 mapLine = vec3(0.9, 0.96, 0.88);
        vec3 mapWater = mix(mapShallow, mapDeep, mapDepthBand);
        mapWater = mix(mapWater, mapBank, bankMask * 0.16);
        mapWater = mix(mapWater, mapLine, graphicShoreLine * 0.2 + shallowShelfLine * 0.08);
        mapWater = mix(mapWater, vec3(0.08, 0.34, 0.5), deepCoreLine * 0.18);
        finalWater = mix(finalWater, mapWater, uMapLookdown);
        float mapAlpha = clamp(0.38 + channelDepth * 0.34 - bankMask * 0.08 - fillLiftMask * 0.1, 0.3, 0.82);
        alphaMask = mix(alphaMask, mapAlpha, uMapLookdown);
        float wLow = 1.0 - uSceneElevationMood;
        finalWater = mix(finalWater, finalWater * uSceneSunColor, 0.06 + 0.05 * wLow);
        finalWater = mix(finalWater, finalWater * uSceneHorizon, 0.05 * (0.4 + 0.6 * wLow));
        finalWater = mix(finalWater, finalWater * uSceneAmbient, 0.05);
        finalWater = mix(finalWater, uSceneHorizon * vec3(0.8, 1.02, 0.92), uSceneSunHaze * shallowMask * 0.018);
        vec3 waterFloor = mix(vec3(0.04, 0.28, 0.48), vec3(0.26, 0.62, 0.68), clamp(shallowMask * 0.42 + foamMask * 0.2 + uMapLookdown * 0.18, 0.0, 1.0));
        finalWater = max(finalWater, waterFloor);
        vec3 posterWater = floor(finalWater * 7.0 + 0.5) / 7.0;
        finalWater = mix(finalWater, posterWater, 0.34);
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
    shader.uniforms.uSceneWaterSparkle = { value: 0 };
    shader.uniforms.uSceneSunHaze = { value: 0 };
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

export function createLakeSurface(
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

export function createWaterSurface(
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
