import { WATER_RIPPLE_LIFETIME, WATER_RIPPLE_LIMIT } from "./waterRipples";

export function createWaterWaveUniformDeclarations() {
  return `uniform float uTime;
        uniform float uRippleTime;
        uniform int uRippleCount;
        uniform vec4 uRippleSources[${WATER_RIPPLE_LIMIT}];
        uniform float uMapLookdown;
        uniform float uFlowSpeed;
        uniform float uFlowDirection;
        uniform float uBaseWaveAmplitude;
        uniform float uDetailWaveAmplitude;
        uniform float uBaseFrequency;
        uniform float uDetailFrequency;`;
}

export function createWaterRippleRingFunction(name: string, includeWakeCore: boolean) {
  const rippleMix = includeWakeCore ? "(ring + wakeCore)" : "ring";
  const wakeCore = includeWakeCore ? "\n              float wakeCore = exp(-distanceToSource * 0.38) * 0.22;" : "";

  return `float ${name}(vec2 worldXZ, float scale) {
          float ripple = 0.0;
          for (int i = 0; i < ${WATER_RIPPLE_LIMIT}; i++) {
            if (i < uRippleCount) {
              vec4 source = uRippleSources[i];
              float age = max(0.0, uRippleTime - source.z);
              float life = ${WATER_RIPPLE_LIFETIME.toFixed(2)};
              float alive = step(age, life) * smoothstep(0.02, 0.14, age);
              float distanceToSource = distance(worldXZ, source.xy);
              float front = age * (6.4 + source.w * 2.1);
              float ring = exp(-abs(distanceToSource - front) * (1.42 + source.w * 0.28));${wakeCore}
              ripple += ${rippleMix} * max(0.0, 1.0 - age / life) * source.w * alive * scale;
            }
          }
          return ripple;
        }`;
}
