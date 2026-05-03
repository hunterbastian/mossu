import {
  createWorldLightingMoodState,
  writeWorldLightingMood,
  type WorldLightingMoodInput,
} from "../../src/render/world/sceneLighting";
import { WORLD_CLOUD_SHADOW_PATCH_COUNT } from "../../src/render/world/WorldRenderer";
import { assert } from "./testHarness";

const baseMoodInput: WorldLightingMoodInput = {
  playerX: -68,
  playerZ: -140,
  playerHeight: 14,
  elevationMood: 0,
  routeMood: 0,
  decisionClarity: 0,
  orbitHeight: 0.78,
  lowAngleWarmth: 0.18,
};

export function runLightingContracts() {
  assert(WORLD_CLOUD_SHADOW_PATCH_COUNT <= 8, "cloud-shadow movement keeps a tiny fixed mesh budget");

  const meadow = createWorldLightingMoodState();
  writeWorldLightingMood(meadow, baseMoodInput);
  assert(meadow.phase === "meadow-day", "starting meadow keeps a warm daytime lighting phase");
  assert(meadow.waterSparkle > meadow.cloudShadow, "lowland daylight favors sparkle over cloud-shadow weight");

  const highland = createWorldLightingMoodState();
  writeWorldLightingMood(highland, {
    ...baseMoodInput,
    playerX: 42,
    playerZ: 134,
    playerHeight: 136,
    elevationMood: 0.62,
    routeMood: 0.55,
    orbitHeight: 0.66,
  });
  assert(highland.phase === "highland-haze", "Highland Basin enters the authored haze lighting phase");
  assert(highland.watercolorFog > meadow.watercolorFog, "highland phase raises watercolor atmospheric fog");

  const ridge = createWorldLightingMoodState();
  writeWorldLightingMood(ridge, {
    ...baseMoodInput,
    playerX: 8,
    playerZ: 176,
    playerHeight: 172,
    elevationMood: 0.82,
    routeMood: 0.78,
    orbitHeight: 0.54,
  });
  assert(ridge.phase === "ridge-silhouette", "ridge traversal gets a stronger silhouette lighting phase");
  assert(ridge.cloudShadow > meadow.cloudShadow, "ridge phase deepens moving cloud-shadow patches");

  const shrine = createWorldLightingMoodState();
  writeWorldLightingMood(shrine, {
    ...baseMoodInput,
    playerX: 18,
    playerZ: 214,
    playerHeight: 188,
    elevationMood: 0.9,
    routeMood: 1,
    lowAngleWarmth: 0.34,
  });
  assert(shrine.phase === "shrine-glow", "Moss Crown enters the landmark-glow lighting phase");
  assert(shrine.landmarkGlow > ridge.landmarkGlow, "shrine lighting adds landmark glow above ridge traversal");
  assert(shrine.waterSparkle <= 0.72, "water sparkle remains capped for performance-safe shader math");
}
