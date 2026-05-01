import { WebGLRenderer } from "three";
import type { WebGPURenderer as ThreeWebGpuRenderer } from "three/webgpu";

const SAFE_RENDER_CLEAR_COLOR = "#dff7ff";

export type RequestedRendererBackend = "webgl" | "webgpu" | "auto";
export type ActiveRendererBackend = "webgl" | "webgpu" | "webgpu-webgl2";
export type GameRenderer = WebGLRenderer | ThreeWebGpuRenderer;
export type RenderPath = "direct" | "composer";

export type RendererBundle = {
  renderer: GameRenderer;
  requestedBackend: RequestedRendererBackend;
  activeBackend: ActiveRendererBackend;
  webGpuAvailable: boolean;
  fallbackReason: string | null;
};

function getRequestedRendererBackend(params: URLSearchParams): RequestedRendererBackend {
  const rendererParam = params.get("renderer")?.toLowerCase();
  if (rendererParam === "webgpu" || params.has("webgpu")) {
    return "webgpu";
  }
  if (rendererParam === "auto") {
    return "auto";
  }
  return "webgl";
}

function hasNavigatorWebGpu() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function createWebGlRendererBundle(
  requestedBackend: RequestedRendererBackend,
  webGpuAvailable: boolean,
  fallbackReason: string | null = null,
  preserveDrawingBuffer = false,
): RendererBundle {
  return {
    renderer: new WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer }),
    requestedBackend,
    activeBackend: "webgl",
    webGpuAvailable,
    fallbackReason,
  };
}

function getWebGpuBackendName(renderer: ThreeWebGpuRenderer): ActiveRendererBackend {
  const backend = renderer.backend as unknown as { isWebGPUBackend?: boolean };
  return backend.isWebGPUBackend ? "webgpu" : "webgpu-webgl2";
}

export async function createRendererBundle(params: URLSearchParams): Promise<RendererBundle> {
  const requestedBackend = getRequestedRendererBackend(params);
  const webGpuAvailable = hasNavigatorWebGpu();
  const preserveDrawingBuffer = params.has("visualProbe");
  const shouldTryWebGpu =
    requestedBackend === "webgpu" || (requestedBackend === "auto" && webGpuAvailable);

  if (!shouldTryWebGpu) {
    return createWebGlRendererBundle(requestedBackend, webGpuAvailable, null, preserveDrawingBuffer);
  }

  try {
    const { WebGPURenderer } = await import("three/webgpu");
    const renderer = new WebGPURenderer({ alpha: false, antialias: true });
    await renderer.init();
    const activeBackend = getWebGpuBackendName(renderer);
    if (activeBackend !== "webgpu") {
      (renderer as { dispose?: () => void }).dispose?.();
      return createWebGlRendererBundle(
        requestedBackend,
        webGpuAvailable,
        "WebGPU renderer initialized with a WebGL2 fallback backend; using Mossu's WebGLRenderer path instead.",
        preserveDrawingBuffer,
      );
    }
    return {
      renderer,
      requestedBackend,
      activeBackend,
      webGpuAvailable,
      fallbackReason: null,
    };
  } catch (error) {
    const fallbackReason =
      error instanceof Error ? error.message : "WebGPU renderer could not be initialized.";
    return createWebGlRendererBundle(requestedBackend, webGpuAvailable, fallbackReason, preserveDrawingBuffer);
  }
}

export function isWebGlRenderer(renderer: GameRenderer): renderer is WebGLRenderer {
  return renderer instanceof WebGLRenderer;
}

export function setSafeRendererClearColor(renderer: GameRenderer) {
  const maybeClearable = renderer as GameRenderer & {
    setClearColor?: (color: string, alpha?: number) => void;
  };
  maybeClearable.setClearColor?.(SAFE_RENDER_CLEAR_COLOR, 1);
}
