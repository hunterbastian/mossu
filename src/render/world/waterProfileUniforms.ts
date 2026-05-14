import type { GrassShader } from "./grassSystem";
import type { WaterProfile } from "./waterProfiles";

export function assignWaterDepthProfileUniforms(shader: GrassShader, profile: WaterProfile) {
  shader.uniforms.uDepthColorScale = { value: profile.depthColorScale };
}

export function assignSurfaceWaterProfileUniforms(shader: GrassShader, profile: WaterProfile) {
  assignWaterDepthProfileUniforms(shader, profile);
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
}
