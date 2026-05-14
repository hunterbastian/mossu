import { Color, type Material } from "three";
import type { GrassShader } from "./grassSystem";

export function assignWaterSceneUniforms(shader: GrassShader, material: Material) {
  shader.uniforms.uSceneSunColor = { value: new Color(0xffffff) };
  shader.uniforms.uSceneAmbient = { value: new Color(0.55, 0.62, 0.8) };
  shader.uniforms.uSceneHorizon = { value: new Color(0.95, 0.88, 0.82) };
  shader.uniforms.uSceneElevationMood = { value: 0 };
  shader.uniforms.uSceneWaterSparkle = { value: 0 };
  shader.uniforms.uSceneSunHaze = { value: 0 };
  material.userData.waterShader = shader;
}
