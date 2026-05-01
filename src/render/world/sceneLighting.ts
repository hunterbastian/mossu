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

const SUN_ORBIT_TARGET = new Vector3(54, 12, 102);
const SUN_ORBIT_RADIUS_X = 370;
const SUN_ORBIT_RADIUS_Z = 438;
const SUN_ORBIT_BASE_LIFT = 52;
const SUN_ORBIT_ARC_LIFT = 70;
const SUN_ORBIT_SECONDS = 540;
const SUN_ORBIT_INITIAL_PHASE = 0.846;
const LOW_SUN_WARM = new Color("#ffc76a");

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
  const orbitHeight = typeof lights.sun.userData.orbitHeight === "number"
    ? MathUtils.clamp(lights.sun.userData.orbitHeight, 0, 1)
    : 0.8;
  const orbitKeyStrength = MathUtils.lerp(0.9, 1.07, orbitHeight);
  lights.sun.intensity =
    (MathUtils.lerp(3.46, 3.18, m) + cinematicLift * 0.2 + breath * 0.024) * orbitKeyStrength;
  lights.ambient.intensity =
    MathUtils.lerp(1.04, 0.94, m) - orbitHeight * 0.035 + cinematicLift * 0.038;
  lights.hemi.intensity =
    MathUtils.lerp(1.2, 1.08, m) + cinematicLift * 0.055;
  lights.bounce.intensity =
    MathUtils.lerp(0.62, 0.54, m) + cinematicLift * 0.055;
  lights.meadowGlow.intensity =
    MathUtils.lerp(0.68, 0.3, m) + cinematicLift * 0.18;
  lights.alpineGlow.intensity =
    MathUtils.lerp(0.54, 0.82, m) + cinematicLift * 0.14;
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
  const lowAngleWarmth = typeof targets.sun.userData.lowAngleWarmth === "number"
    ? MathUtils.clamp(targets.sun.userData.lowAngleWarmth, 0, 1)
    : 0;
  targets.sun.color.copy(pairs.sun.lowland).lerp(pairs.sun.highland, m);
  targets.sun.color.lerp(LOW_SUN_WARM, lowAngleWarmth * 0.22);
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
