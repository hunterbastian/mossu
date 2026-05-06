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

async function startGame() {
  setLoadingStatus("Polishing habitat glass", 36);
  const { GameApp } = await import("./render/app/GameApp");
  setLoadingStatus("Mapping trail signals", 72);
  const game = await GameApp.create(appContainer);
  attachRuntime(game, "game");
  finishLoading();
}

async function startModelViewer() {
  setLoadingStatus("Lighting the creature console", 68);
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
