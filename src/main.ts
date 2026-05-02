import "./styles.css";
import type { MossuErrorDetail } from "./errorUi";
import { reportMossuError, showMossuErrorOverlay } from "./errorUi";

/** Set after runtime hooks attach; `ready` flips on the first animation frame (safe for Playwright to probe). */
export type MossuE2eBridge = {
  version: 1;
  ready: boolean;
  mode: "game" | "model_viewer";
};

declare global {
  interface Window {
    advanceTime?: (ms: number, renderFrame?: boolean) => void;
    /** Automation / Playwright: present once hooks are live; `ready` after one rAF post-`start()`. */
    __MOSSU_E2E__?: MossuE2eBridge;
    mossuDebug?: {
      completeOpeningSequence?: () => void;
      teleportPlayerTo?: (x: number, z: number) => void;
      jumpTo?: (id: string) => boolean;
      applySaveState?: (payload: MossuDebugSaveStatePayload) => void;
      resetProgress?: () => void;
      faceRouteHeading?: (
        heading: number,
        cameraOptions?: { distance?: number; focusHeight?: number; lift?: number },
      ) => void;
      setWaterDepthDebug?: (enabled: boolean) => void;
      setLayerVisibility?: (layer: string, visible: boolean) => void;
      getLastFrameProfile?: () => Record<string, number> | null;
    };
    render_game_to_text?: () => string;
    mossuReportError?: (details: MossuErrorDetail) => void;
  }
}

interface MossuAppRuntime {
  advanceTime: (ms: number, renderFrame?: boolean) => void;
  debugCompleteOpeningSequence?: () => void;
  debugTeleportPlayerTo?: (x: number, z: number) => void;
  debugJumpToRouteSpot?: (id: string) => boolean;
  debugApplySaveState?: (payload: MossuDebugSaveStatePayload) => void;
  debugResetProgress?: () => void;
  debugFaceRouteHeading?: (
    heading: number,
    cameraOptions?: { distance?: number; focusHeight?: number; lift?: number },
  ) => void;
  debugSetWaterDepthDebug?: (enabled: boolean) => void;
  debugSetLayerVisibility?: (layer: string, visible: boolean) => void;
  debugGetLastFrameProfile?: () => Record<string, number> | null;
  renderGameToText: () => string;
  start: () => void;
}

interface MossuDebugSaveStatePayload {
  player?: {
    x?: number;
    y?: number;
    z?: number;
    heading?: number;
  };
  save?: {
    unlockedAbilities?: string[];
    catalogedLandmarkIds?: string[];
    gatheredForageableIds?: string[];
    recruitedKaruIds?: string[];
  };
}

const container = document.querySelector<HTMLDivElement>("#app");

if (!container) {
  throw new Error("Missing #app container");
}
const appContainer = container;

/** Prevents stacking fatal overlays / handler feedback loops after the first runtime fatal. */
let runtimeFatalUiLocked = false;

function setLoadingStatus(message: string, progress = 16) {
  const loader = appContainer.querySelector<HTMLElement>(".instant-title");
  if (loader) {
    loader.style.setProperty("--loading-progress", `${progress}%`);
  }
  const status = appContainer.querySelector<HTMLElement>("[data-loading-status]");
  if (status) {
    status.textContent = message;
  }
}

function finishLoading() {
  const loader = appContainer.querySelector<HTMLElement>(".instant-title");
  if (!loader) {
    return;
  }

  loader.style.setProperty("--loading-progress", "100%");
  loader.classList.add("instant-title--leaving");
  window.setTimeout(() => {
    loader.remove();
  }, 420);
}

function surfaceRuntimeError(details: MossuErrorDetail) {
  if (runtimeFatalUiLocked) {
    console.error("Mossu: suppressed duplicate fatal UI", details);
    return;
  }
  runtimeFatalUiLocked = true;
  console.error("Mossu runtime error", details);
  reportMossuError(details);
  try {
    showMossuErrorOverlay(appContainer, {
      headline: "Mossu hit a snag",
      mode: "runtime",
      technical: details.error?.stack ?? details.message,
    });
  } catch (nested) {
    console.error("Mossu: failed to show error UI", nested);
  }
}

window.addEventListener(
  "error",
  (event) => {
    surfaceRuntimeError({
      message: event.message,
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error instanceof Error ? event.error : undefined,
    });
  },
  true,
);

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message =
    reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "Unhandled promise rejection";
  surfaceRuntimeError({
    message,
    reason,
    error: reason instanceof Error ? reason : undefined,
  });
});

function attachRuntime(app: MossuAppRuntime, mode: MossuE2eBridge["mode"]) {
  window.__MOSSU_E2E__ = { version: 1, ready: false, mode };
  window.advanceTime = (ms, renderFrame) => app.advanceTime(ms, renderFrame);
  window.render_game_to_text = () => app.renderGameToText();
  if (new URLSearchParams(window.location.search).has("qaDebug") && app.debugCompleteOpeningSequence) {
    window.mossuDebug = {
      completeOpeningSequence: () => app.debugCompleteOpeningSequence?.(),
      teleportPlayerTo: (x, z) => app.debugTeleportPlayerTo?.(x, z),
      jumpTo: (id) => app.debugJumpToRouteSpot?.(id) ?? false,
      applySaveState: (payload) => app.debugApplySaveState?.(payload),
      resetProgress: () => app.debugResetProgress?.(),
      faceRouteHeading: (heading, cameraOptions) => app.debugFaceRouteHeading?.(heading, cameraOptions),
      setWaterDepthDebug: (enabled) => app.debugSetWaterDepthDebug?.(enabled),
      setLayerVisibility: (layer, visible) => app.debugSetLayerVisibility?.(layer, visible),
      getLastFrameProfile: () => app.debugGetLastFrameProfile?.() ?? null,
    };
  }
  app.start();
  // Let one frame run so rAF + first tick complete before e2e probes call advanceTime / render_game_to_text.
  requestAnimationFrame(() => {
    if (window.__MOSSU_E2E__) {
      window.__MOSSU_E2E__.ready = true;
    }
  });
}

async function startGame() {
  setLoadingStatus("Unfolding the island atlas", 36);
  const { GameApp } = await import("./render/app/GameApp");
  setLoadingStatus("Waking the habitat cells", 72);
  const game = await GameApp.create(appContainer);
  attachRuntime(game, "game");
  finishLoading();
}

async function startModelViewer() {
  setLoadingStatus("Lighting the creature workshop", 68);
  const { ModelViewerApp } = await import("./render/app/ModelViewerApp");
  const viewer = new ModelViewerApp(appContainer);
  attachRuntime(viewer, "model_viewer");
  finishLoading();
}

async function bootstrap() {
  const route = new URLSearchParams(window.location.search);
  if (route.has("modelViewer")) {
    await startModelViewer();
    return;
  }

  await startGame();
}

function handleBootstrapFailure(error: unknown) {
  console.error("Mossu failed to start.", error);
  const err = error instanceof Error ? error : undefined;
  const detail: MossuErrorDetail = {
    message: err?.message ?? String(error),
    error: err,
  };
  reportMossuError(detail);
  showMossuErrorOverlay(appContainer, {
    headline: "Could not start Mossu",
    mode: "bootstrap",
    technical: err?.stack ?? String(error),
    onRetry: () => {
      void bootstrap().catch(handleBootstrapFailure);
    },
  });
}

void bootstrap().catch(handleBootstrapFailure);
