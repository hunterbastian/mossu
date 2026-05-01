import {
  LOW_QUALITY_MAX_PIXEL_RATIO,
  LOW_QUALITY_MIN_PIXEL_RATIO,
  LOW_QUALITY_RENDER_HEIGHT,
  LOW_QUALITY_RENDER_WIDTH,
  MAX_PIXEL_RATIO,
  MIN_PIXEL_RATIO,
  PIXEL_RATIO_DOWNSHIFT_FRAME_SECONDS,
  PIXEL_RATIO_STEP_DOWN,
  PIXEL_RATIO_STEP_UP,
  PIXEL_RATIO_UPSHIFT_FRAME_SECONDS,
  PREFERRED_RENDER_HEIGHT,
  PREFERRED_RENDER_WIDTH,
  QUALITY_MIN_SAMPLE_FRAMES,
  QUALITY_SAMPLE_SECONDS,
} from "./appRuntimeConfig";

export type RenderResolutionPolicy = {
  preferredWidth: number;
  preferredHeight: number;
  preferredPixelCount: number;
  viewportPixelCount: number;
  maxPixelRatio: number;
  minPixelRatio: number;
  initialPixelRatio: number;
};

export type RenderQualityRuntime = {
  frameTimeAccumulator: number;
  frameSampleAccumulator: number;
  qualitySampleFrameMs: number;
};

export function createRenderQualityRuntime(): RenderQualityRuntime {
  return {
    frameTimeAccumulator: 0,
    frameSampleAccumulator: 0,
    qualitySampleFrameMs: 1000 / 60,
  };
}

export function createRenderResolutionPolicy({
  qualityLow,
  viewportWidth,
  viewportHeight,
  devicePixelRatio,
}: {
  qualityLow: boolean;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}): RenderResolutionPolicy {
  const preferredWidth = qualityLow ? LOW_QUALITY_RENDER_WIDTH : PREFERRED_RENDER_WIDTH;
  const preferredHeight = qualityLow ? LOW_QUALITY_RENDER_HEIGHT : PREFERRED_RENDER_HEIGHT;
  const preferredPixelCount = preferredWidth * preferredHeight;
  const viewportPixelCount = Math.max(1, viewportWidth * viewportHeight);
  const budgetPixelRatio = Math.sqrt(preferredPixelCount / viewportPixelCount);
  const hardCap = qualityLow ? LOW_QUALITY_MAX_PIXEL_RATIO : MAX_PIXEL_RATIO;
  const floor = qualityLow ? LOW_QUALITY_MIN_PIXEL_RATIO : MIN_PIXEL_RATIO;
  const maxPixelRatio = Math.min(devicePixelRatio, hardCap, Math.max(floor, budgetPixelRatio));
  const minPixelRatio = Math.min(maxPixelRatio, floor);

  return {
    preferredWidth,
    preferredHeight,
    preferredPixelCount,
    viewportPixelCount,
    maxPixelRatio,
    minPixelRatio,
    initialPixelRatio: Math.min(maxPixelRatio, 1),
  };
}

export function getRenderResolutionSnapshot(
  policy: RenderResolutionPolicy,
  viewportWidth: number,
  viewportHeight: number,
  activePixelRatio: number,
) {
  const internalWidth = Math.max(1, Math.round(viewportWidth * activePixelRatio));
  const internalHeight = Math.max(1, Math.round(viewportHeight * activePixelRatio));

  return {
    preferredWidth: policy.preferredWidth,
    preferredHeight: policy.preferredHeight,
    preferredPixels: policy.preferredPixelCount,
    viewportWidth,
    viewportHeight,
    viewportPixels: policy.viewportPixelCount,
    internalWidth,
    internalHeight,
    internalPixels: internalWidth * internalHeight,
  };
}

export function sampleAdaptivePixelRatio(
  runtime: RenderQualityRuntime,
  rawDt: number,
  activePixelRatio: number,
  minPixelRatio: number,
  maxPixelRatio: number,
) {
  runtime.frameTimeAccumulator += rawDt;
  runtime.frameSampleAccumulator += 1;

  if (
    runtime.frameTimeAccumulator < QUALITY_SAMPLE_SECONDS ||
    runtime.frameSampleAccumulator < QUALITY_MIN_SAMPLE_FRAMES
  ) {
    return null;
  }

  const averageFrameSeconds = runtime.frameTimeAccumulator / runtime.frameSampleAccumulator;
  runtime.qualitySampleFrameMs = averageFrameSeconds * 1000;
  runtime.frameTimeAccumulator = 0;
  runtime.frameSampleAccumulator = 0;

  const nextPixelRatio =
    averageFrameSeconds > PIXEL_RATIO_DOWNSHIFT_FRAME_SECONDS
      ? Math.max(minPixelRatio, activePixelRatio - PIXEL_RATIO_STEP_DOWN)
      : averageFrameSeconds < PIXEL_RATIO_UPSHIFT_FRAME_SECONDS
        ? Math.min(maxPixelRatio, activePixelRatio + PIXEL_RATIO_STEP_UP)
        : activePixelRatio;

  return Math.abs(nextPixelRatio - activePixelRatio) < 0.01 ? null : nextPixelRatio;
}
