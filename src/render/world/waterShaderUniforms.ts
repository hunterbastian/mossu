import { Vector4 } from "three";
import type { GrassShader } from "./grassSystem";
import type { WaterProfile } from "./waterProfiles";
import { WATER_RIPPLE_LIMIT } from "./waterRipples";
import type { WaterSurfaceOptions } from "./waterSurfaceGeometry";

export type SharedWaterWaveUniforms = {
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

export function createSharedWaterWaveUniforms(
  profile: WaterProfile,
  options: WaterSurfaceOptions,
  flowDirection: number,
): SharedWaterWaveUniforms {
  return {
    uTime: { value: 0 },
    uRippleTime: { value: 0 },
    uRippleCount: { value: 0 },
    uRippleSources: {
      value: Array.from({ length: WATER_RIPPLE_LIMIT }, () => new Vector4(0, 0, -999, 0)),
    },
    uMapLookdown: { value: 0 },
    uFlowSpeed: { value: options.flowSpeed ?? profile.flowSpeed },
    uFlowDirection: { value: flowDirection },
    uBaseWaveAmplitude: { value: profile.baseWaveAmplitude },
    uDetailWaveAmplitude: { value: profile.detailWaveAmplitude },
    uBaseFrequency: { value: profile.baseFrequency },
    uDetailFrequency: { value: profile.detailFrequency },
    uDepthDebug: { value: 0 },
  };
}

export function assignSharedWaterWaveUniforms(shader: GrassShader, uniforms: SharedWaterWaveUniforms) {
  shader.uniforms.uTime = uniforms.uTime;
  shader.uniforms.uRippleTime = uniforms.uRippleTime;
  shader.uniforms.uRippleCount = uniforms.uRippleCount;
  shader.uniforms.uRippleSources = uniforms.uRippleSources;
  shader.uniforms.uMapLookdown = uniforms.uMapLookdown;
  shader.uniforms.uFlowSpeed = uniforms.uFlowSpeed;
  shader.uniforms.uFlowDirection = uniforms.uFlowDirection;
  shader.uniforms.uBaseWaveAmplitude = uniforms.uBaseWaveAmplitude;
  shader.uniforms.uDetailWaveAmplitude = uniforms.uDetailWaveAmplitude;
  shader.uniforms.uBaseFrequency = uniforms.uBaseFrequency;
  shader.uniforms.uDetailFrequency = uniforms.uDetailFrequency;
  shader.uniforms.uDepthDebug = uniforms.uDepthDebug;
}
