import { AmbientLight, Color, DirectionalLight, HemisphereLight, MathUtils, PointLight, Vector3 } from "three";
import type { GrassShader } from "./grassSystem";

const SUN_ORBIT_TARGET = new Vector3(54, 12, 102);
const SUN_ORBIT_RADIUS_X = 370;
const SUN_ORBIT_RADIUS_Z = 438;
const SUN_ORBIT_BASE_LIFT = 190;
const SUN_ORBIT_ARC_LIFT = 120;
const SUN_ORBIT_SECONDS = 540;
const SUN_ORBIT_INITIAL_PHASE = 0.846;
const LOW_SUN_WARM = new Color("#ffd18b");
const LOW_SUN_FOG = new Color("#fff2d2");
const LOW_SUN_BACKGROUND = new Color("#ffe9bb");
const HORIZON_TINT_LOW = new Color("#fff1cf");
const HORIZON_TINT_HIGH = new Color("#def3ff");
const HORIZON_HAZE_LOW = new Color("#fff7e4");
const HORIZON_HAZE_HIGH = new Color("#e1f3ff");
const CLOUD_BRIGHT_LOW = new Color("#fffdf2");
const CLOUD_BRIGHT_HIGH = new Color("#f2fbff");
const CLOUD_SHADOW_LOW = new Color("#d9eadf");
const CLOUD_SHADOW_HIGH = new Color("#c9dfef");
const PHASE_MEADOW_SUN = new Color("#fff0bf");
const PHASE_MEADOW_FOG = new Color("#fff6dc");
const PHASE_MEADOW_SKY = new Color("#e7fbf1");
const PHASE_MEADOW_GROUND = new Color("#d7e7bf");
const PHASE_HIGHLAND_SUN = new Color("#ffe0a4");
const PHASE_HIGHLAND_FOG = new Color("#edf8ff");
const PHASE_HIGHLAND_SKY = new Color("#d8f0ff");
const PHASE_HIGHLAND_GROUND = new Color("#cfe0cf");
const PHASE_RIDGE_SUN = new Color("#ffd19a");
const PHASE_RIDGE_FOG = new Color("#e8f0ff");
const PHASE_RIDGE_SKY = new Color("#d9eaff");
const PHASE_RIDGE_GROUND = new Color("#c8d2c2");
const PHASE_SHRINE_SUN = new Color("#fff3bf");
const PHASE_SHRINE_FOG = new Color("#fff2df");
const PHASE_SHRINE_SKY = new Color("#f3f7ff");
const PHASE_SHRINE_GROUND = new Color("#d8e0c9");

export type WorldLightingPhase = "meadow-day" | "highland-haze" | "ridge-silhouette" | "shrine-glow";

export interface WorldLightingMoodState {
  phase: WorldLightingPhase;
  elevationMood: number;
  routeMood: number;
  shrineInfluence: number;
  ridgeInfluence: number;
  basinInfluence: number;
  decisionClarity: number;
  warmHaze: number;
  watercolorFog: number;
  cloudShadow: number;
  waterSparkle: number;
  landmarkGlow: number;
  sunHaze: number;
  silhouetteContrast: number;
}

export interface WorldLightingMoodInput {
  playerX: number;
  playerZ: number;
  playerHeight: number;
  elevationMood: number;
  routeMood: number;
  decisionClarity: number;
  orbitHeight: number;
  lowAngleWarmth: number;
}

export function createWorldLightingMoodState(): WorldLightingMoodState {
  return {
    phase: "meadow-day",
    elevationMood: 0,
    routeMood: 0,
    shrineInfluence: 0,
    ridgeInfluence: 0,
    basinInfluence: 0,
    decisionClarity: 0,
    warmHaze: 0,
    watercolorFog: 0,
    cloudShadow: 0,
    waterSparkle: 0,
    landmarkGlow: 0,
    sunHaze: 0,
    silhouetteContrast: 0,
  };
}

function gaussian2d(x: number, z: number, centerX: number, centerZ: number, radiusX: number, radiusZ: number) {
  return Math.exp(-(((x - centerX) / radiusX) ** 2) - ((z - centerZ) / radiusZ) ** 2);
}

function phaseTints(phase: WorldLightingPhase) {
  switch (phase) {
    case "shrine-glow":
      return { sun: PHASE_SHRINE_SUN, fog: PHASE_SHRINE_FOG, sky: PHASE_SHRINE_SKY, ground: PHASE_SHRINE_GROUND };
    case "ridge-silhouette":
      return { sun: PHASE_RIDGE_SUN, fog: PHASE_RIDGE_FOG, sky: PHASE_RIDGE_SKY, ground: PHASE_RIDGE_GROUND };
    case "highland-haze":
      return { sun: PHASE_HIGHLAND_SUN, fog: PHASE_HIGHLAND_FOG, sky: PHASE_HIGHLAND_SKY, ground: PHASE_HIGHLAND_GROUND };
    case "meadow-day":
    default:
      return { sun: PHASE_MEADOW_SUN, fog: PHASE_MEADOW_FOG, sky: PHASE_MEADOW_SKY, ground: PHASE_MEADOW_GROUND };
  }
}

export function writeWorldLightingMood(target: WorldLightingMoodState, input: WorldLightingMoodInput) {
  const elevationMood = MathUtils.clamp(input.elevationMood, 0, 1);
  const routeMood = MathUtils.clamp(input.routeMood, 0, 1);
  const decisionClarity = MathUtils.clamp(input.decisionClarity, 0, 1);
  const lowAngleWarmth = MathUtils.clamp(input.lowAngleWarmth, 0, 1);
  const orbitHeight = MathUtils.clamp(input.orbitHeight, 0, 1);
  const basinInfluence = MathUtils.clamp(gaussian2d(input.playerX, input.playerZ, 42, 134, 70, 48), 0, 1);
  const ridgeInfluence = MathUtils.clamp(
    MathUtils.smoothstep(input.playerZ, 152, 206) * 0.72 +
      MathUtils.smoothstep(input.playerHeight, 118, 176) * 0.38,
    0,
    1,
  );
  const shrineInfluence = MathUtils.clamp(
    gaussian2d(input.playerX, input.playerZ, 18, 214, 76, 38) * 0.78 +
      MathUtils.smoothstep(input.playerZ, 202, 226) * 0.34,
    0,
    1,
  );
  const highlandInfluence = MathUtils.clamp(elevationMood * 0.78 + basinInfluence * 0.32 + routeMood * 0.16, 0, 1);

  target.phase =
    shrineInfluence > 0.48
      ? "shrine-glow"
      : ridgeInfluence > 0.56
        ? "ridge-silhouette"
        : highlandInfluence > 0.42
          ? "highland-haze"
          : "meadow-day";
  target.elevationMood = elevationMood;
  target.routeMood = routeMood;
  target.shrineInfluence = shrineInfluence;
  target.ridgeInfluence = ridgeInfluence;
  target.basinInfluence = basinInfluence;
  target.decisionClarity = decisionClarity;
  target.landmarkGlow = MathUtils.clamp(shrineInfluence * 0.88 + basinInfluence * 0.16, 0, 1);
  target.sunHaze = MathUtils.clamp(lowAngleWarmth * 0.58 + shrineInfluence * 0.28 + basinInfluence * 0.12, 0, 1);
  target.warmHaze = MathUtils.clamp(lowAngleWarmth * 0.55 + (1 - elevationMood) * 0.18 + shrineInfluence * 0.18, 0, 1);
  target.watercolorFog = MathUtils.clamp(
    0.18 + elevationMood * 0.18 + basinInfluence * 0.2 + lowAngleWarmth * 0.16 + shrineInfluence * 0.1 - decisionClarity * 0.16,
    0,
    1,
  );
  target.cloudShadow = MathUtils.clamp(
    0.16 + ridgeInfluence * 0.17 + basinInfluence * 0.12 + (1 - orbitHeight) * 0.08 - shrineInfluence * 0.05,
    0,
    0.48,
  );
  target.waterSparkle = MathUtils.clamp(
    0.18 + lowAngleWarmth * 0.26 + basinInfluence * 0.18 + shrineInfluence * 0.16 + (1 - elevationMood) * 0.08,
    0,
    0.72,
  );
  target.silhouetteContrast = MathUtils.clamp(ridgeInfluence * 0.24 + shrineInfluence * 0.12 - decisionClarity * 0.08, 0, 0.34);
}

/**
 * Single source of truth for sun orbit and target. The visible sky sun,
 * DirectionalLight, sky shader, cloud lighting, grass, and water all read from
 * this moving rig, so it behaves like a classic open-world RPG sky body instead
 * of a painted backdrop.
 */
export const SUN_WORLD_RIG = {
  position: new Vector3(300, 305, 430),
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

export function applySceneLightingMood(
  lights: SceneLightSet,
  mood: number,
  cinematicLift: number,
  breath: number,
  worldMood?: WorldLightingMoodState,
) {
  const m = MathUtils.clamp(mood, 0, 1);
  const orbitHeight =
    typeof lights.sun.userData.orbitHeight === "number" ? MathUtils.clamp(lights.sun.userData.orbitHeight, 0, 1) : 0.8;
  const lowAngleWarmth =
    typeof lights.sun.userData.lowAngleWarmth === "number"
      ? MathUtils.clamp(lights.sun.userData.lowAngleWarmth, 0, 1)
      : 0;
  const warmHaze = worldMood?.warmHaze ?? lowAngleWarmth;
  const landmarkGlow = worldMood?.landmarkGlow ?? 0;
  const watercolorFog = worldMood?.watercolorFog ?? 0;
  const silhouetteContrast = worldMood?.silhouetteContrast ?? 0;
  const orbitKeyStrength = MathUtils.lerp(0.84, 1.12, orbitHeight) + lowAngleWarmth * 0.05;
  lights.sun.intensity =
    (MathUtils.lerp(3.42, 3.14, m) + cinematicLift * 0.18 + breath * 0.018 + warmHaze * 0.06 + landmarkGlow * 0.08) *
    orbitKeyStrength;
  lights.ambient.intensity =
    MathUtils.lerp(0.98, 0.88, m) -
    orbitHeight * 0.048 -
    lowAngleWarmth * 0.04 -
    silhouetteContrast * 0.025 +
    cinematicLift * 0.034 +
    landmarkGlow * 0.025;
  lights.hemi.intensity = MathUtils.lerp(1.16, 1.04, m) - lowAngleWarmth * 0.02 + cinematicLift * 0.05 + warmHaze * 0.035;
  lights.bounce.intensity = MathUtils.lerp(0.68, 0.58, m) + lowAngleWarmth * 0.07 + cinematicLift * 0.052 + landmarkGlow * 0.04;
  lights.meadowGlow.intensity = MathUtils.lerp(0.54, 0.25, m) + lowAngleWarmth * 0.075 + cinematicLift * 0.11;
  lights.alpineGlow.intensity = MathUtils.lerp(0.46, 0.72, m) + cinematicLift * 0.1 + landmarkGlow * 0.34;
  lights.fog.density =
    (MathUtils.lerp(0.0004, 0.00054, m) - cinematicLift * 0.000025) *
    MathUtils.lerp(1, 1.08, watercolorFog) *
    MathUtils.lerp(1, 0.88, worldMood?.decisionClarity ?? 0);
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

export function applySceneLightingColors(
  targets: SceneColorTargets,
  pairs: SceneColorPairs,
  mood: number,
  worldMood?: WorldLightingMoodState,
) {
  const m = MathUtils.clamp(mood, 0, 1);
  const lowAngleWarmth =
    typeof targets.sun.userData.lowAngleWarmth === "number"
      ? MathUtils.clamp(targets.sun.userData.lowAngleWarmth, 0, 1)
      : 0;
  const tints = phaseTints(worldMood?.phase ?? "meadow-day");
  const phaseStrength = MathUtils.clamp(
    (worldMood?.watercolorFog ?? 0) * 0.18 + (worldMood?.landmarkGlow ?? 0) * 0.34 + (worldMood?.silhouetteContrast ?? 0) * 0.16,
    0,
    0.44,
  );
  targets.sun.color.copy(pairs.sun.lowland).lerp(pairs.sun.highland, m);
  targets.sun.color.lerp(LOW_SUN_WARM, lowAngleWarmth * 0.42);
  targets.sun.color.lerp(tints.sun, phaseStrength);
  targets.hemi.color.copy(pairs.skyFill.lowland).lerp(pairs.skyFill.highland, m);
  targets.hemi.color.lerp(tints.sky, phaseStrength * 0.5);
  targets.hemi.groundColor.copy(pairs.skyGround.lowland).lerp(pairs.skyGround.highland, m);
  targets.hemi.groundColor.lerp(tints.ground, phaseStrength * 0.46);
  targets.fog.color.copy(pairs.fog.lowland).lerp(pairs.fog.highland, m);
  targets.fog.color.lerp(LOW_SUN_FOG, lowAngleWarmth * 0.15 * (1 - m * 0.42));
  targets.fog.color.lerp(tints.fog, phaseStrength * 0.72);
  if (targets.background) {
    targets.background.copy(pairs.background.lowland).lerp(pairs.background.highland, m);
    targets.background.lerp(LOW_SUN_BACKGROUND, lowAngleWarmth * 0.065 * (1 - m * 0.35));
    targets.background.lerp(tints.sky, phaseStrength * 0.32);
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
  worldMood?: WorldLightingMoodState,
) {
  const m = MathUtils.clamp(mood, 0, 1);
  const tints = phaseTints(worldMood?.phase ?? "meadow-day");
  const phaseStrength = MathUtils.clamp((worldMood?.watercolorFog ?? 0) * 0.24 + (worldMood?.landmarkGlow ?? 0) * 0.22, 0, 0.38);
  outHorizonTint.copy(HORIZON_TINT_LOW).lerp(HORIZON_TINT_HIGH, m * 0.62);
  outHorizonTint.lerp(tints.sky, phaseStrength);
  outHorizonHaze.copy(HORIZON_HAZE_LOW).lerp(HORIZON_HAZE_HIGH, m * 0.5);
  outHorizonHaze.lerp(tints.fog, phaseStrength * 0.86);
  outCloudBright.copy(CLOUD_BRIGHT_LOW).lerp(CLOUD_BRIGHT_HIGH, m * 0.35);
  outCloudBright.lerp(tints.sun, phaseStrength * 0.34);
  outCloudShadow.copy(CLOUD_SHADOW_LOW).lerp(CLOUD_SHADOW_HIGH, m * 0.28);
  outCloudShadow.lerp(tints.ground, MathUtils.clamp((worldMood?.cloudShadow ?? 0) * 0.34, 0, 0.18));
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
  uSceneCloudShadow?: { value: number };
  uSceneWaterSparkle?: { value: number };
  uSceneSunHaze?: { value: number };
};

export function writePatchSceneLightingUniforms(
  shader: Pick<GrassShader, "uniforms">,
  sun: DirectionalLight,
  ambient: AmbientLight,
  hemi: HemisphereLight,
  horizonPaperTint: Color,
  sunDirWorld: Vector3,
  elevationMood: number,
  worldMood?: WorldLightingMoodState,
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
  if (u.uSceneCloudShadow) {
    u.uSceneCloudShadow.value = worldMood?.cloudShadow ?? 0;
  }
  if (u.uSceneWaterSparkle) {
    u.uSceneWaterSparkle.value = worldMood?.waterSparkle ?? 0;
  }
  if (u.uSceneSunHaze) {
    u.uSceneSunHaze.value = worldMood?.sunHaze ?? 0;
  }
}

export function getSunDirectionWorld(sun: DirectionalLight, out: Vector3) {
  return out.subVectors(sun.position, sun.target.position).normalize();
}
