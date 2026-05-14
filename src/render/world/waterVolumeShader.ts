import type { MeshBasicMaterial } from "three";
import type { GrassShader } from "./grassSystem";
import { assignSharedWaterWaveUniforms, type SharedWaterWaveUniforms } from "./waterShaderUniforms";
import { assignVolumeWaterColorUniforms, type WaterSurfaceColors } from "./waterSurfaceColors";
import { assignWaterDepthProfileUniforms } from "./waterProfileUniforms";
import type { WaterProfile } from "./waterProfiles";
import { createWaterRippleRingFunction, createWaterWaveUniformDeclarations } from "./waterShaderChunks";

export function configureWaterVolumeShader(
  volumeMaterial: MeshBasicMaterial,
  sharedWaterWaveUniforms: SharedWaterWaveUniforms,
  colors: WaterSurfaceColors,
  profile: WaterProfile,
) {
  volumeMaterial.onBeforeCompile = (shader: GrassShader) => {
    assignSharedWaterWaveUniforms(shader, sharedWaterWaveUniforms);
    assignVolumeWaterColorUniforms(shader, colors);
    assignWaterDepthProfileUniforms(shader, profile);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        ${createWaterWaveUniformDeclarations()}
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
        ${createWaterRippleRingFunction("waterRippleRingVolume", false)}`,
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
}
