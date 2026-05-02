import { AmbientLight, Color, DirectionalLight, HemisphereLight, MathUtils, PointLight, Vector3 } from "three";
import type { GrassShader } from "./grassSystem";

const SUN_ORBIT_TARGET = new Vector3(54, 12, 102);
const SUN_ORBIT_RADIUS_X = 370;
const SUN_ORBIT_RADIUS_Z = 438;
const SUN_ORBIT_BASE_LIFT = 52;
const SUN_ORBIT_ARC_LIFT = 70;
const SUN_ORBIT_SECONDS = 540;
const SUN_ORBIT_INITIAL_PHASE = 0.846;
const LOW_SUN_WARM = new Color("#ffc76a");
const LOW_SUN_FOG = new Color("#fff0c6");
const LOW_SUN_BACKGROUND = new Color("#ffe8b0");
const HORIZON_TINT_LOW = new Color("#fff2ce");
const HORIZON_TINT_HIGH = new Color("#def3ff");
const HORIZON_HAZE_LOW = new Color("#fff8df");
const HORIZON_HAZE_HIGH = new Color("#e1f3ff");
const CLOUD_BRIGHT_LOW = new Color("#fffdf2");
const CLOUD_BRIGHT_HIGH = new Color("#f2fbff");
const CLOUD_SHADOW_LOW = new Color("#d9eadf");
const CLOUD_SHADOW_HIGH = new Color("#c9dfef");

/**
 * Single source of truth for sun orbit and target. The visible sky sun,
 * DirectionalLight, sky shader, cloud lighting, grass, and water all read from
 * this moving rig, so it behaves like a classic open-world RPG sky body instead
 * of a painted backdrop.
 */
export const SUN_WORLD_RIG = {
  position: new Vector3(300, 120, 430),
  target: SUN_ORBIT_TARGET,
} as const;

export function applySunRig(sun: DirectionalLight) {
  updateSunOrbitRig(sun, 0, 0);
}

export function updateSunOrbitRig(sun: DirectionalLight, timeSeconds: number, elevationMood: number) {
  const mood = MathUtils.clamp(elevationMood, 0, 1);
  const phase = SUN_ORBIT_INITIAL_PHASE + (timeSeconds / SUN_ORBIT_SECONDS) * Math.PI * 2;
  const orbitHeight = Math.sin(phase - 0.18) * 0.5 + 0.5;
  const lowAngleWarmth = 1 - MathUtils.smoothstep(orbitHeight, 0.16, 0.86);

  sun.target.position.copy(SUN_ORBIT_TARGET);
  sun.position.set(
    SUN_ORBIT_TARGET.x + Math.cos(phase) * SUN_ORBIT_RADIUS_X,
    SUN_ORBIT_TARGET.y + SUN_ORBIT_BASE_LIFT + orbitHeight * SUN_ORBIT_ARC_LIFT - mood * 10,
    SUN_ORBIT_TARGET.z + Math.sin(phase) * SUN_ORBIT_RADIUS_Z,
  );
  sun.userData.orbitHeight = orbitHeight;
  sun.userData.lowAngleWarmth = lowAngleWarmth;
}

/**
 * Per-frame lighting envelope. Mood lerps lowland → highland; cinematicLift
 * pulses on movement/landing; breath is a slow sine baked into the sun only.
 *
 * Kept intentionally biased toward directional sunlight so the visible sun has
 * a real lighting consequence without crushing the soft ambient game read.
 */
export interface SceneLightSet {
  sun: DirectionalLight;
  ambient: AmbientLight;
  hemi: HemisphereLight; // skyFill
  bounce: DirectionalLight; // skyBounce
  meadowGlow: PointLight;
  alpineGlow: PointLight;
  fog: { density: number };
}

export function applySceneLightingMood(lights: SceneLightSet, mood: number, cinematicLift: number, breath: number) {
  const m = MathUtils.clamp(mood, 0, 1);
  const orbitHeight =
    typeof lights.sun.userData.orbitHeight === "number" ? MathUtils.clamp(lights.sun.userData.orbitHeight, 0, 1) : 0.8;
  const lowAngleWarmth =
    typeof lights.sun.userData.lowAngleWarmth === "number"
      ? MathUtils.clamp(lights.sun.userData.lowAngleWarmth, 0, 1)
      : 0;
  const orbitKeyStrength = MathUtils.lerp(0.86, 1.14, orbitHeight) + lowAngleWarmth * 0.035;
  lights.sun.intensity = (MathUtils.lerp(3.52, 3.22, m) + cinematicLift * 0.2 + breath * 0.024) * orbitKeyStrength;
  lights.ambient.intensity =
    MathUtils.lerp(1.0, 0.9, m) - orbitHeight * 0.052 - lowAngleWarmth * 0.035 + cinematicLift * 0.038;
  lights.hemi.intensity = MathUtils.lerp(1.18, 1.06, m) - lowAngleWarmth * 0.018 + cinematicLift * 0.055;
  lights.bounce.intensity = MathUtils.lerp(0.66, 0.56, m) + lowAngleWarmth * 0.05 + cinematicLift * 0.055;
  lights.meadowGlow.intensity = MathUtils.lerp(0.52, 0.24, m) + lowAngleWarmth * 0.055 + cinematicLift * 0.12;
  lights.alpineGlow.intensity = MathUtils.lerp(0.46, 0.72, m) + cinematicLift * 0.1;
  lights.fog.density = MathUtils.lerp(0.0004, 0.00054, m) - cinematicLift * 0.000025;
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
  hemi: HemisphereLight; // skyFill
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

export function applySceneLightingColors(targets: SceneColorTargets, pairs: SceneColorPairs, mood: number) {
  const m = MathUtils.clamp(mood, 0, 1);
  const lowAngleWarmth =
    typeof targets.sun.userData.lowAngleWarmth === "number"
      ? MathUtils.clamp(targets.sun.userData.lowAngleWarmth, 0, 1)
      : 0;
  targets.sun.color.copy(pairs.sun.lowland).lerp(pairs.sun.highland, m);
  targets.sun.color.lerp(LOW_SUN_WARM, lowAngleWarmth * 0.32);
  targets.hemi.color.copy(pairs.skyFill.lowland).lerp(pairs.skyFill.highland, m);
  targets.hemi.groundColor.copy(pairs.skyGround.lowland).lerp(pairs.skyGround.highland, m);
  targets.fog.color.copy(pairs.fog.lowland).lerp(pairs.fog.highland, m);
  targets.fog.color.lerp(LOW_SUN_FOG, lowAngleWarmth * 0.12 * (1 - m * 0.42));
  if (targets.background) {
    targets.background.copy(pairs.background.lowland).lerp(pairs.background.highland, m);
    targets.background.lerp(LOW_SUN_BACKGROUND, lowAngleWarmth * 0.05 * (1 - m * 0.35));
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
  outHorizonTint.copy(HORIZON_TINT_LOW).lerp(HORIZON_TINT_HIGH, m * 0.62);
  outHorizonHaze.copy(HORIZON_HAZE_LOW).lerp(HORIZON_HAZE_HIGH, m * 0.5);
  outCloudBright.copy(CLOUD_BRIGHT_LOW).lerp(CLOUD_BRIGHT_HIGH, m * 0.35);
  outCloudShadow.copy(CLOUD_SHADOW_LOW).lerp(CLOUD_SHADOW_HIGH, m * 0.28);
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
