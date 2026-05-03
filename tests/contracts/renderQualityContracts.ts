import {
  createRenderQualityRuntime,
  createRenderResolutionPolicy,
  getRenderResolutionSnapshot,
  sampleAdaptivePixelRatio,
} from "../../src/render/app/appRenderQuality";
import { normalizeQualitySettings, QUALITY_PRESETS } from "../../src/render/app/appQualitySettings";
import { MOSSU_TRACE_STAMP_COUNT } from "../../src/render/world/WorldRenderer";
import { assert } from "./testHarness";

function assertNear(value: number, expected: number, tolerance: number, label: string) {
  assert(Math.abs(value - expected) <= tolerance, `${label}: expected ${expected}, got ${value}`);
}

export function runRenderQualityContracts() {
  assert(MOSSU_TRACE_STAMP_COUNT <= 36, "Mossu pressed-path traces keep a small fixed stamp budget");

  const desktop = createRenderResolutionPolicy({
    qualityLow: false,
    viewportWidth: 1440,
    viewportHeight: 900,
    devicePixelRatio: 2,
  });
  assert(
    desktop.preferredWidth === 1600 && desktop.preferredHeight === 900,
    "normal play prefers a 1600x900 internal target",
  );
  assertNear(desktop.initialPixelRatio, 1, 0.001, "normal desktop starts at 1x CSS pixels");
  assertNear(desktop.minPixelRatio, 0.62, 0.001, "normal desktop does not collapse to a blurry low-DPR floor");
  assert(
    desktop.maxPixelRatio > 1 && desktop.maxPixelRatio <= 1.1,
    "normal desktop can upscale slightly when frame time allows",
  );

  const capped = createRenderResolutionPolicy({
    qualityLow: false,
    viewportWidth: 1440,
    viewportHeight: 900,
    devicePixelRatio: 2,
    pixelRatioCap: 0.78,
  });
  assertNear(capped.maxPixelRatio, 0.78, 0.001, "quality menu pixel-ratio cap limits adaptive upscale");
  assertNear(capped.initialPixelRatio, 0.78, 0.001, "quality menu pixel-ratio cap applies immediately");

  const crisp = normalizeQualitySettings(QUALITY_PRESETS.crisp);
  assert(crisp.visualPreset === "crisp", "crisp preset is available in quality settings");
  assert(!crisp.bloomEnabled, "crisp preset can disable bloom for sharper reads");
  assert(crisp.fogStrength < QUALITY_PRESETS.anime.fogStrength, "crisp preset reduces distance haze versus anime");
  assert(crisp.pixelRatioCap > QUALITY_PRESETS.soft.pixelRatioCap, "crisp preset keeps a higher render scale than soft");

  const runtime = createRenderQualityRuntime();
  let sampledPixelRatio: number | null = null;
  for (let i = 0; i < 40 && sampledPixelRatio === null; i += 1) {
    sampledPixelRatio = sampleAdaptivePixelRatio(runtime, 1 / 60, 1, desktop.minPixelRatio, desktop.maxPixelRatio);
  }
  assert(
    sampledPixelRatio === null || sampledPixelRatio >= 1,
    "steady 60Hz rendering should not downshift below the initial pixel ratio",
  );

  const highRes = createRenderResolutionPolicy({
    qualityLow: false,
    viewportWidth: 3840,
    viewportHeight: 2160,
    devicePixelRatio: 2,
  });
  const highResSnapshot = getRenderResolutionSnapshot(highRes, 3840, 2160, highRes.initialPixelRatio);
  assert(highRes.initialPixelRatio < 0.5, "4k displays start below 0.5 DPR to stay near the preferred pixel budget");
  assert(
    highResSnapshot.internalPixels <= highRes.preferredPixelCount * 1.05,
    "4k internal render pixels stay close to the 1600x900 budget",
  );

  const lowQuality = createRenderResolutionPolicy({
    qualityLow: true,
    viewportWidth: 1920,
    viewportHeight: 1080,
    devicePixelRatio: 2,
  });
  const lowQualitySnapshot = getRenderResolutionSnapshot(lowQuality, 1920, 1080, lowQuality.initialPixelRatio);
  assert(
    lowQuality.preferredWidth === 1280 && lowQuality.preferredHeight === 720,
    "low quality prefers a 1280x720 internal target",
  );
  assert(
    lowQualitySnapshot.internalPixels <= lowQuality.preferredPixelCount * 1.05,
    "low quality internal render pixels stay close to the 1280x720 budget",
  );
}
