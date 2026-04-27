import "./styles.css";
import type { MossuErrorDetail } from "./errorUi";
import { reportMossuError, showMossuErrorOverlay } from "./errorUi";

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    mossuDebug?: {
      completeOpeningSequence?: () => void;
      teleportPlayerTo?: (x: number, z: number) => void;
    };
    render_game_to_text?: () => string;
    mossuReportError?: (details: MossuErrorDetail) => void;
  }
}

interface MossuAppRuntime {
  advanceTime: (ms: number) => void;
  debugCompleteOpeningSequence?: () => void;
  debugTeleportPlayerTo?: (x: number, z: number) => void;
  renderGameToText: () => string;
  start: () => void;
}

const container = document.querySelector<HTMLDivElement>("#app");

if (!container) {
  throw new Error("Missing #app container");
}
const appContainer = container;

/** Prevents stacking fatal overlays / handler feedback loops after the first runtime fatal. */
let runtimeFatalUiLocked = false;

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
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "Unhandled promise rejection";
  surfaceRuntimeError({
    message,
    reason,
    error: reason instanceof Error ? reason : undefined,
  });
});

function attachRuntime(app: MossuAppRuntime) {
  window.advanceTime = (ms) => app.advanceTime(ms);
  window.render_game_to_text = () => app.renderGameToText();
  if (new URLSearchParams(window.location.search).has("qaDebug") && app.debugCompleteOpeningSequence) {
    window.mossuDebug = {
      completeOpeningSequence: () => app.debugCompleteOpeningSequence?.(),
      teleportPlayerTo: (x, z) => app.debugTeleportPlayerTo?.(x, z),
    };
  }
  app.start();
}

async function startGame() {
  const { GameApp } = await import("./render/app/GameApp");
  appContainer.textContent = "";
  const game = await GameApp.create(appContainer);
  attachRuntime(game);
}

async function startModelViewer() {
  const { ModelViewerApp } = await import("./render/app/ModelViewerApp");
  appContainer.textContent = "";
  const viewer = new ModelViewerApp(appContainer);
  attachRuntime(viewer);
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
