import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { GameRenderer, RenderPath } from "./rendererBackend";
import { isWebGlRenderer } from "./rendererBackend";

export type PostProcessingRuntime = {
  initStarted: boolean;
  suppressedUntil: number;
  activeRenderPath: RenderPath;
  lastLoggedRenderPath: RenderPath;
};

export function createPostProcessingRuntime(): PostProcessingRuntime {
  return {
    initStarted: false,
    suppressedUntil: 0,
    activeRenderPath: "direct",
    lastLoggedRenderPath: "direct",
  };
}

export function markPostProcessingScheduled(
  runtime: PostProcessingRuntime,
  qualityLow: boolean,
  renderer: GameRenderer,
) {
  if (runtime.initStarted || qualityLow || !isWebGlRenderer(renderer)) {
    return false;
  }

  runtime.initStarted = true;
  return true;
}

export function suppressPostProcessing(
  runtime: PostProcessingRuntime,
  elapsed: number,
  seconds: number,
) {
  runtime.suppressedUntil = Math.max(runtime.suppressedUntil, elapsed + seconds);
}

export function getPostProcessingSuppressedMs(runtime: PostProcessingRuntime, elapsed: number) {
  return Math.max(0, Math.round((runtime.suppressedUntil - elapsed) * 1000));
}

export function shouldUsePostProcessing({
  composer,
  overlayBlocksPostProcessing,
  elapsed,
  runtime,
  activePixelRatio,
  minPixelRatio,
}: {
  composer: EffectComposer | null;
  overlayBlocksPostProcessing: boolean;
  elapsed: number;
  runtime: PostProcessingRuntime;
  activePixelRatio: number;
  minPixelRatio: number;
}) {
  return (
    composer !== null &&
    !overlayBlocksPostProcessing &&
    elapsed >= runtime.suppressedUntil &&
    activePixelRatio >= minPixelRatio
  );
}

export function shouldUseRetroTexture(retroRenderEnabled: boolean, postProcessingEnabled: boolean) {
  return retroRenderEnabled && postProcessingEnabled;
}

export function getRenderPath(postProcessingEnabled: boolean, composer: EffectComposer | null): RenderPath {
  return postProcessingEnabled && composer ? "composer" : "direct";
}

export function updateRenderPath(runtime: PostProcessingRuntime, renderPath: RenderPath) {
  runtime.activeRenderPath = renderPath;
  if (renderPath === runtime.lastLoggedRenderPath) {
    return false;
  }

  runtime.lastLoggedRenderPath = renderPath;
  return true;
}

export function updateRetroTexturePass(
  retroTexturePass: ShaderPass | null,
  elapsed: number,
  activePixelRatio: number,
) {
  if (!retroTexturePass) {
    return;
  }

  retroTexturePass.uniforms.uTime.value = elapsed;
  retroTexturePass.uniforms.uResolution.value.set(
    window.innerWidth * activePixelRatio,
    window.innerHeight * activePixelRatio,
  );
}
