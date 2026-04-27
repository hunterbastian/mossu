import "./styles.css";

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    mossuDebug?: {
      completeOpeningSequence?: () => void;
      teleportPlayerTo?: (x: number, z: number) => void;
    };
    render_game_to_text?: () => string;
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

void bootstrap().catch((error: unknown) => {
  console.error("Mossu failed to start.", error);
  appContainer.textContent = "Mossu could not start. Check the browser console for details.";
});
