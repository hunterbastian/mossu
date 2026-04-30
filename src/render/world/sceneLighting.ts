import {
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  PointLight,
  Vector3,
} from "three";
import type { GrassShader } from "./grassSystem";

/**
 * Single source of truth for sun position and target. Editing these two
 * vectors changes the lighting direction across the entire game.
 *
 * Picked to give Mossu a low side-back morning light: warm fill on the
 * camera-facing side, soft shadows on the far side. Moving the sun overhead
 * flattens shading and breaks the silhouette read.
 */
export const SUN_WORLD_RIG = {
  position: new Vector3(-244, 84, -46),
  target: new Vector3(58, 12, 98),
} as const;

export function applySunRig(sun: DirectionalLight) {
  sun.position.copy(SUN_WORLD_RIG.position);
  sun.target.position.copy(SUN_WORLD_RIG.target);
}

/**
 * Per-frame lighting envelope. Mood lerps lowland → highland; cinematicLift
 * pulses on movement/landing; breath is a slow sine baked into the sun only.
 *
 * Numerically identical to the previous inline formulas — relocating it here
 * makes the lighting feel a 1-file lookup instead of a 5-file hunt.
 */
export interface SceneLightSet {
  sun: DirectionalLight;
  ambient: AmbientLight;
  hemi: HemisphereLight;       // skyFill
  bounce: DirectionalLight;     // skyBounce
  meadowGlow: PointLight;
  alpineGlow: PointLight;
  fog: { density: number };
}

export function applySceneLightingMood(
  lights: SceneLightSet,
  mood: number,
  cinematicLift: number,
  breath: number,
) {
  const m = MathUtils.clamp(mood, 0, 1);
  lights.sun.intensity =
    MathUtils.lerp(3.28, 3.02, m) + cinematicLift * 0.16 + breath * 0.018;
  lights.ambient.intensity =
    MathUtils.lerp(1.08, 0.98, m) + cinematicLift * 0.045;
  lights.hemi.intensity =
    MathUtils.lerp(1.26, 1.12, m) + cinematicLift * 0.06;
  lights.bounce.intensity =
    MathUtils.lerp(0.56, 0.5, m) + cinematicLift * 0.05;
  lights.meadowGlow.intensity =
    MathUtils.lerp(0.72, 0.34, m) + cinematicLift * 0.22;
  lights.alpineGlow.intensity =
    MathUtils.lerp(0.58, 0.9, m) + cinematicLift * 0.16;
  lights.fog.density =
    MathUtils.lerp(0.00048, 0.00068, m) - cinematicLift * 0.000035;
}

/**
 * Lowland/highland color pair lerped on elevation mood. Caching pairs once at
 * construction means the per-frame call doesn't allocate.
 */
export interface ColorPair {
  lowland: Color;
  highland: Color;
}

export interface SceneColorTargets {
  sun: DirectionalLight;
  hemi: HemisphereLight;       // skyFill
  fog: { color: Color };
  background?: Color | null;
}

export interface SceneColorPairs {
  sun: ColorPair;
  skyFill: ColorPair;
  skyGround: ColorPair;
  fog: ColorPair;
  background: ColorPair;
}

export function applySceneLightingColors(
  targets: SceneColorTargets,
  pairs: SceneColorPairs,
  mood: number,
) {
  const m = MathUtils.clamp(mood, 0, 1);
  targets.sun.color.copy(pairs.sun.lowland).lerp(pairs.sun.highland, m);
  targets.hemi.color.copy(pairs.skyFill.lowland).lerp(pairs.skyFill.highland, m);
  targets.hemi.groundColor.copy(pairs.skyGround.lowland).lerp(pairs.skyGround.highland, m);
  targets.fog.color.copy(pairs.fog.lowland).lerp(pairs.fog.highland, m);
  if (targets.background) {
    targets.background.copy(pairs.background.lowland).lerp(pairs.background.highland, m);
  }
}

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
