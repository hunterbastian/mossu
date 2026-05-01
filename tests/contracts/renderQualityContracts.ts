import {
  createRenderResolutionPolicy,
  getRenderResolutionSnapshot,
} from "../../src/render/app/appRenderQuality";
import { assert } from "./testHarness";

function assertNear(value: number, expected: number, tolerance: number, label: string) {
  assert(Math.abs(value - expected) <= tolerance, `${label}: expected ${expected}, got ${value}`);
}

export function runRenderQualityContracts() {
  const desktop = createRenderResolutionPolicy({
    qualityLow: false,
    viewportWidth: 1440,
    viewportHeight: 900,
    devicePixelRatio: 2,
  });
  assert(desktop.preferredWidth === 1600 && desktop.preferredHeight === 900, "normal play prefers a 1600x900 internal target");
  assertNear(desktop.initialPixelRatio, 1, 0.001, "normal desktop starts at 1x CSS pixels");
  assert(desktop.maxPixelRatio > 1 && desktop.maxPixelRatio <= 1.1, "normal desktop can upscale slightly when frame time allows");

  const highRes = createRenderResolutionPolicy({
    qualityLow: false,
    viewportWidth: 3840,
    viewportHeight: 2160,
    devicePixelRatio: 2,
  });
  const highResSnapshot = getRenderResolutionSnapshot(
    highRes,
    3840,
    2160,
    highRes.initialPixelRatio,
  );
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
  const lowQualitySnapshot = getRenderResolutionSnapshot(
    lowQuality,
    1920,
    1080,
    lowQuality.initialPixelRatio,
  );
  assert(lowQuality.preferredWidth === 1280 && lowQuality.preferredHeight === 720, "low quality prefers a 1280x720 internal target");
  assert(
    lowQualitySnapshot.internalPixels <= lowQuality.preferredPixelCount * 1.05,
    "low quality internal render pixels stay close to the 1280x720 budget",
  );
}
