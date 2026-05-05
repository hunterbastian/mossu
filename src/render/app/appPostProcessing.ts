import type { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { GameRenderer, RenderPath } from "./rendererBackend";
import { isWebGlRenderer } from "./rendererBackend";

export type PostProcessingRuntime = {
  initStarted: boolean;
  activeRenderPath: RenderPath;
  lastLoggedRenderPath: RenderPath;
};

export function createPostProcessingRuntime(): PostProcessingRuntime {
  return {
    initStarted: false,
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

export function shouldUsePostProcessing({
  composer,
  activePixelRatio,
  minPixelRatio,
}: {
  composer: EffectComposer | null;
  activePixelRatio: number;
  minPixelRatio: number;
}) {
  return composer !== null && activePixelRatio >= minPixelRatio;
}

export function shouldUseRetroTexture(retroRenderEnabled: boolean, postProcessingEnabled: boolean) {
  return retroRenderEnabled && postProcessingEnabled;
}

export function shouldUseBloomPass({
  postProcessingEnabled,
  bloomEnabled,
  activePixelRatio,
  minPixelRatio,
}: {
  postProcessingEnabled: boolean;
  bloomEnabled: boolean;
  activePixelRatio: number;
  minPixelRatio: number;
}) {
  return postProcessingEnabled && bloomEnabled && activePixelRatio >= minPixelRatio;
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

export function updateRetroTexturePass(retroTexturePass: ShaderPass | null, elapsed: number, activePixelRatio: number) {
  if (!retroTexturePass) {
    return;
  }

  retroTexturePass.uniforms.uTime.value = elapsed;
  retroTexturePass.uniforms.uResolution.value.set(
    window.innerWidth * activePixelRatio,
    window.innerHeight * activePixelRatio,
  );
}

export function updateAnimeColorGradePass(
  animeColorGradePass: ShaderPass | null,
  elapsed: number,
  activePixelRatio: number,
) {
  if (!animeColorGradePass) {
    return;
  }

  animeColorGradePass.uniforms.uTime.value = elapsed;
  animeColorGradePass.uniforms.uResolution.value.set(
    window.innerWidth * activePixelRatio,
    window.innerHeight * activePixelRatio,
  );
}
