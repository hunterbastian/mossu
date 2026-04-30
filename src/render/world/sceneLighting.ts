import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Vector3,
} from "three";
import type { GrassShader } from "./grassSystem";

/**
 * One place for horizon / haze tints (also used by cloud puff shader).
 * Matches the previous inline logic in syncAtmosphereLighting.
 */
export function getAtmosphereHorizonTints(
  mood: number,
  outHorizonTint: Color,
  outHorizonHaze: Color,
  outCloudBright: Color,
  outCloudShadow: Color,
) {
  const m = MathUtils.clamp(mood, 0, 1);
  outHorizonTint.set("#e3f8ff").lerp(new Color(0xd9f3ff), m * 0.55);
  outHorizonHaze.set("#eefcff").lerp(new Color(0xdcefff), m * 0.45);
  outCloudBright.set("#ffffff").lerp(new Color(0xf2fbff), m * 0.35);
  outCloudShadow.set("#d7eaf6").lerp(new Color(0xc9dfef), m * 0.25);
}

const _ambScratch = new Color();

/**
 * Shared uniforms for time-of-day / elevation on custom (patched) materials.
 * Call from WorldRenderer every frame after scene lights and elevationMood are updated.
 */
type ScenePatchU = {
  uSceneSunColor?: { value: Color };
  uSceneAmbient?: { value: Color };
  uSceneHorizon?: { value: Color };
  uSceneSunDir?: { value: Vector3 };
  uSceneElevationMood?: { value: number };
};

export function writePatchSceneLightingUniforms(
  shader: Pick<GrassShader, "uniforms">,
  sun: DirectionalLight,
  ambient: AmbientLight,
  hemi: HemisphereLight,
  horizonPaperTint: Color,
  sunDirWorld: Vector3,
  elevationMood: number,
) {
  const u = shader.uniforms as ScenePatchU;
  const mood = MathUtils.clamp(elevationMood, 0, 1);

  u.uSceneSunColor?.value.copy(sun.color);
  if (u.uSceneAmbient) {
    _ambScratch.copy(ambient.color).multiplyScalar(ambient.intensity);
    u.uSceneAmbient.value.copy(_ambScratch);
    u.uSceneAmbient.value.lerp(hemi.groundColor, 0.12 + 0.1 * (1 - mood));
    u.uSceneAmbient.value.lerp(hemi.color, 0.08 * mood);
  }
  u.uSceneHorizon?.value.copy(horizonPaperTint);
  u.uSceneSunDir?.value.copy(sunDirWorld);
  if (u.uSceneElevationMood) {
    u.uSceneElevationMood.value = mood;
  }
}

export function getSunDirectionWorld(sun: DirectionalLight, out: Vector3) {
  return out.subVectors(sun.position, sun.target.position).normalize();
}
