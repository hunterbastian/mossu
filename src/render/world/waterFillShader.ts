import type { MeshBasicMaterial } from "three";
import type { GrassShader } from "./grassSystem";
import { assignWaterDepthProfileUniforms } from "./waterProfileUniforms";
import type { WaterProfile } from "./waterProfiles";
import { createWaterRippleRingFunction, createWaterWaveUniformDeclarations } from "./waterShaderChunks";
import { assignSharedWaterWaveUniforms, type SharedWaterWaveUniforms } from "./waterShaderUniforms";
import { assignFillWaterColorUniforms, type WaterSurfaceColors } from "./waterSurfaceColors";

/** Under-surface copy of the mesh; a bit lower hides cracks between the two layers. */
const WATER_UNDERFILL_OFFSET = -0.1;

export function configureWaterFillShader(
  fillMaterial: MeshBasicMaterial,
  sharedWaterWaveUniforms: SharedWaterWaveUniforms,
  colors: WaterSurfaceColors,
  profile: WaterProfile,
) {
  fillMaterial.onBeforeCompile = (shader: GrassShader) => {
    assignSharedWaterWaveUniforms(shader, sharedWaterWaveUniforms);
    assignFillWaterColorUniforms(shader, colors);
    assignWaterDepthProfileUniforms(shader, profile);
    const underfillY = WATER_UNDERFILL_OFFSET;
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
        varying float vWaterChannel;
        varying float vWaterBank;
        varying float vWaterDepth;
        varying float vWaterFillLift;
        ${createWaterRippleRingFunction("waterRippleRingFill", true)}`,
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
}
