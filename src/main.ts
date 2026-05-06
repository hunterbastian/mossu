import "./styles.css";
import type { MossuErrorDetail } from "./errorUi";
import { reportMossuError, showMossuErrorOverlay } from "./errorUi";
import { attachRuntime } from "./runtimeBridge";

const container = document.querySelector<HTMLDivElement>("#app");

if (!container) {
  throw new Error("Missing #app container");
}
const appContainer = container;

/** Prevents stacking fatal overlays / handler feedback loops after the first runtime fatal. */
let runtimeFatalUiLocked = false;

type LoadingMode = "simulated" | "real";
type LoadingAsset = string | URL | Request | PromiseLike<unknown> | (() => Promise<unknown>);
type LoadingCompleteDetail = {
  mode: LoadingMode;
  progress: number;
};
type LoadingCompleteHandler = (detail: LoadingCompleteDetail) => void;
type StartFakeLoadingOptions = {
  autoComplete?: boolean;
  durationMs?: number;
  holdAt?: number;
  onComplete?: LoadingCompleteHandler;
};
type RealLoadingOptions = {
  loader?: (asset: LoadingAsset) => Promise<unknown>;
  onComplete?: LoadingCompleteHandler;
};

type LoadingHandle = {
  stop: () => void;
  complete: () => Promise<void>;
};

declare global {
  interface Window {
    mossuLoading?: {
      setProgress: (value: number) => void;
      startFakeLoading: (options?: StartFakeLoadingOptions) => LoadingHandle;
      loadAssets: (assets: LoadingAsset[], options?: RealLoadingOptions) => Promise<unknown[]>;
      onComplete: (handler: LoadingCompleteHandler) => () => void;
      finish: () => Promise<void>;
    };
  }
}

const LOADING_COMPLETE_DELAY_MS = 660;
const LOADING_REMOVE_DELAY_MS = 420;
let loadingMode: LoadingMode = "simulated";
let displayedProgress = 0;
let targetProgress = 0;
let progressRaf = 0;
let fakeLoadingRaf = 0;
let completionTimer = 0;
let completionDispatched = false;
const loadingCompleteHandlers = new Set<LoadingCompleteHandler>();

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function getLoaderElements() {
  const loader = appContainer.querySelector<HTMLElement>(".instant-title");
  const progressBar = appContainer.querySelector<HTMLElement>("[data-loading-bar]");
  const percent = appContainer.querySelector<HTMLElement>("[data-loading-percent]");
  const status = appContainer.querySelector<HTMLElement>("[data-loading-status]");
  return { loader, progressBar, percent, status };
}

function renderLoadingProgress(progress: number) {
  const rounded = Math.round(progress);
  const { loader, progressBar, percent } = getLoaderElements();
  if (loader) {
    loader.style.setProperty("--loading-progress", `${progress.toFixed(2)}%`);
    loader.classList.toggle("instant-title--progress-empty", rounded <= 0);
    loader.classList.toggle("instant-title--progress-complete", rounded >= 100);
  }
  if (progressBar) {
    progressBar.setAttribute("aria-valuenow", String(rounded));
  }
  if (percent) {
    percent.textContent = `${rounded}%`;
  }
}

function animateLoadingProgress() {
  progressRaf = 0;
  const delta = targetProgress - displayedProgress;
  if (Math.abs(delta) <= 0.08) {
    displayedProgress = targetProgress;
    renderLoadingProgress(displayedProgress);
    return;
  }

  displayedProgress += delta * 0.22;
  renderLoadingProgress(displayedProgress);
  progressRaf = requestAnimationFrame(animateLoadingProgress);
}

function setProgress(value: number, options: { immediate?: boolean } = {}) {
  targetProgress = clampProgress(value);
  if (targetProgress < 100) {
    completionDispatched = false;
  }
  if (options.immediate) {
    displayedProgress = targetProgress;
    if (progressRaf) {
      cancelAnimationFrame(progressRaf);
      progressRaf = 0;
    }
    renderLoadingProgress(displayedProgress);
    return;
  }
  if (!progressRaf) {
    progressRaf = requestAnimationFrame(animateLoadingProgress);
  }
}

function setLoadingStatus(message: string, progress?: number) {
  const { status } = getLoaderElements();
  if (typeof progress === "number") {
    setProgress(progress);
  }
  if (status) {
    status.textContent = message;
  }
}

function stopFakeLoading() {
  if (fakeLoadingRaf) {
    cancelAnimationFrame(fakeLoadingRaf);
    fakeLoadingRaf = 0;
  }
}

function dispatchLoadingComplete(detail: LoadingCompleteDetail) {
  if (completionDispatched) {
    return;
  }
  completionDispatched = true;
  loadingCompleteHandlers.forEach((handler) => handler(detail));
  window.dispatchEvent(new CustomEvent<LoadingCompleteDetail>("mossu-loading-complete", { detail }));
}

function completeLoading(mode: LoadingMode = loadingMode, onComplete?: LoadingCompleteHandler) {
  stopFakeLoading();
  loadingMode = mode;
  setProgress(100);
  if (completionTimer) {
    clearTimeout(completionTimer);
  }

  return new Promise<void>((resolve) => {
    completionTimer = window.setTimeout(() => {
      completionTimer = 0;
      const detail = { mode, progress: 100 };
      onComplete?.(detail);
      dispatchLoadingComplete(detail);
      resolve();
    }, LOADING_COMPLETE_DELAY_MS);
  });
}

function startFakeLoading(options: StartFakeLoadingOptions = {}): LoadingHandle {
  stopFakeLoading();
  loadingMode = "simulated";
  const durationMs = Math.max(800, options.durationMs ?? 5200);
  const holdAt = clampProgress(options.holdAt ?? 94);
  const autoComplete = options.autoComplete ?? true;
  const startedAt = performance.now();
  setProgress(0, { immediate: true });

  const tick = (now: number) => {
    const elapsed = clampProgress(((now - startedAt) / durationMs) * 100) / 100;
    const eased = 1 - Math.pow(1 - elapsed, 2.8);
    const nextProgress = autoComplete ? eased * 100 : Math.min(holdAt, eased * holdAt);
    setProgress(nextProgress);

    if (elapsed < 1) {
      fakeLoadingRaf = requestAnimationFrame(tick);
      return;
    }

    fakeLoadingRaf = 0;
    if (autoComplete) {
      void completeLoading("simulated", options.onComplete);
    }
  };

  fakeLoadingRaf = requestAnimationFrame(tick);
  return {
    stop: stopFakeLoading,
    complete: () => completeLoading("simulated", options.onComplete),
  };
}

function isPromiseLike(asset: LoadingAsset): asset is PromiseLike<unknown> {
  if (asset === null || typeof asset !== "object") {
    return false;
  }
  return typeof (asset as PromiseLike<unknown>).then === "function";
}

async function defaultLoadAsset(asset: LoadingAsset) {
  if (typeof asset === "function") {
    return asset();
  }
  if (isPromiseLike(asset)) {
    return asset;
  }

  const response = await fetch(asset);
  if (!response.ok) {
    throw new Error(`Failed to load asset: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

async function loadAssets(assets: LoadingAsset[], options: RealLoadingOptions = {}) {
  stopFakeLoading();
  loadingMode = "real";
  setProgress(0, { immediate: true });

  const totalAssets = assets.length;
  if (totalAssets === 0) {
    await completeLoading("real", options.onComplete);
    return [];
  }

  let loadedAssets = 0;
  const loader = options.loader ?? defaultLoadAsset;
  const results = await Promise.all(
    assets.map(async (asset) => {
      try {
        return await loader(asset);
      } finally {
        loadedAssets += 1;
        setProgress((loadedAssets / totalAssets) * 100);
      }
    }),
  );

  await completeLoading("real", options.onComplete);
  return results;
}

function onLoadingComplete(handler: LoadingCompleteHandler) {
  loadingCompleteHandlers.add(handler);
  return () => {
    loadingCompleteHandlers.delete(handler);
  };
}

async function finishLoading() {
  const { loader } = getLoaderElements();
  if (!loader) {
    return;
  }

  await completeLoading(loadingMode);
  loader.classList.add("instant-title--leaving");
  window.setTimeout(() => {
    loader.remove();
  }, LOADING_REMOVE_DELAY_MS);
}

window.mossuLoading = {
  setProgress,
  startFakeLoading,
  loadAssets,
  onComplete: onLoadingComplete,
  finish: () => completeLoading(loadingMode),
};

void startFakeLoading({ autoComplete: false, durationMs: 5200, holdAt: 92 });

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

async function startGame() {
  setLoadingStatus("Warming the sky", 26);
  const { GameApp } = await import("./render/app/GameApp");
  setLoadingStatus("Preparing the route", 74);
  const game = await GameApp.create(appContainer);
  attachRuntime(game, "game");
  await finishLoading();
}

async function startModelViewer() {
  setLoadingStatus("Lighting the viewer", 68);
  const { ModelViewerApp } = await import("./render/app/ModelViewerApp");
  const viewer = new ModelViewerApp(appContainer);
  attachRuntime(viewer, "model_viewer");
  await finishLoading();
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
  stopFakeLoading();
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
