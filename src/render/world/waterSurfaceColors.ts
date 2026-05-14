import { Color } from "three";
import type { GrassShader } from "./grassSystem";
import type { WaterProfile } from "./waterProfiles";

export interface WaterSurfaceColors {
  shallowColor: Color;
  deepColor: Color;
  foamColor: Color;
  shorelineMilkColor: Color;
  highlightColor: Color;
  sparkleColor: Color;
  reflectionColor: Color;
  sedimentColor: Color;
  bedColor: Color;
  causticColor: Color;
}

export function createWaterSurfaceColors(profile: WaterProfile): WaterSurfaceColors {
  return {
    shallowColor: new Color(profile.shallowColor),
    deepColor: new Color(profile.deepColor),
    foamColor: new Color(profile.foamColor),
    shorelineMilkColor: new Color(profile.shorelineMilkColor),
    highlightColor: new Color(profile.highlightColor),
    sparkleColor: new Color(profile.sparkleColor),
    reflectionColor: new Color(profile.reflectionColor),
    sedimentColor: new Color(profile.sedimentColor),
    bedColor: new Color(profile.bedColor),
    causticColor: new Color(profile.causticColor),
  };
}

export function assignVolumeWaterColorUniforms(shader: GrassShader, colors: WaterSurfaceColors) {
  shader.uniforms.uWaterShallow = { value: colors.shallowColor };
  shader.uniforms.uWaterDeep = { value: colors.deepColor };
  shader.uniforms.uWaterSediment = { value: colors.sedimentColor };
  shader.uniforms.uWaterBed = { value: colors.bedColor };
  shader.uniforms.uReflectionColor = { value: colors.reflectionColor };
}

export function assignFillWaterColorUniforms(shader: GrassShader, colors: WaterSurfaceColors) {
  shader.uniforms.uWaterShallow = { value: colors.shallowColor };
  shader.uniforms.uWaterDeep = { value: colors.deepColor };
  shader.uniforms.uWaterSediment = { value: colors.sedimentColor };
  shader.uniforms.uWaterBed = { value: colors.bedColor };
}

export function assignSurfaceWaterColorUniforms(shader: GrassShader, colors: WaterSurfaceColors) {
  shader.uniforms.uWaterShallow = { value: colors.shallowColor };
  shader.uniforms.uWaterDeep = { value: colors.deepColor };
  shader.uniforms.uWaterFoam = { value: colors.foamColor };
  shader.uniforms.uShorelineMilkColor = { value: colors.shorelineMilkColor };
  shader.uniforms.uHighlightColor = { value: colors.highlightColor };
  shader.uniforms.uSparkleColor = { value: colors.sparkleColor };
  shader.uniforms.uReflectionColor = { value: colors.reflectionColor };
  shader.uniforms.uSedimentColor = { value: colors.sedimentColor };
  shader.uniforms.uBedColor = { value: colors.bedColor };
  shader.uniforms.uCausticColor = { value: colors.causticColor };
}
