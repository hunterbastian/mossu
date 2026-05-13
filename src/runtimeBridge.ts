import type { MossuErrorDetail } from "./errorUi";
import type { QualitySettings } from "./render/app/appQualitySettings";
import type { DebugSavePresetSummary } from "./render/app/debugSavePresets";

/** Set after runtime hooks attach; `ready` flips on the first animation frame (safe for Playwright to probe). */
export type MossuE2eBridge = {
  version: 1;
  ready: boolean;
  mode: "game" | "model_viewer" | "island_viewer";
};

export interface MossuDebugSaveStatePayload {
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

export interface MossuAppRuntime {
  advanceTime: (ms: number, renderFrame?: boolean) => void;
  debugCompleteOpeningSequence?: () => void;
  debugTeleportPlayerTo?: (x: number, z: number) => void;
  debugJumpToRouteSpot?: (id: string) => boolean;
  debugApplySaveState?: (payload: MossuDebugSaveStatePayload) => void;
  debugListSavePresets?: () => DebugSavePresetSummary[];
  debugApplySavePreset?: (id: string) => boolean;
  debugResetProgress?: () => void;
  debugFaceRouteHeading?: (
    heading: number,
    cameraOptions?: { distance?: number; focusHeight?: number; lift?: number },
  ) => void;
  debugSetWaterDepthDebug?: (enabled: boolean) => void;
  debugSetLayerVisibility?: (layer: string, visible: boolean) => void;
  debugSetQualitySettings?: (settings: Partial<QualitySettings>) => void;
  debugGetLastFrameProfile?: () => Record<string, number> | null;
  renderGameToText: () => string;
  start: () => void;
}

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
      listSavePresets?: () => DebugSavePresetSummary[];
      applySavePreset?: (id: string) => boolean;
      resetProgress?: () => void;
      faceRouteHeading?: (
        heading: number,
        cameraOptions?: { distance?: number; focusHeight?: number; lift?: number },
      ) => void;
      setWaterDepthDebug?: (enabled: boolean) => void;
      setLayerVisibility?: (layer: string, visible: boolean) => void;
      setQualitySettings?: (settings: Partial<QualitySettings>) => void;
      getLastFrameProfile?: () => Record<string, number> | null;
    };
    render_game_to_text?: () => string;
    mossuReportError?: (details: MossuErrorDetail) => void;
  }
}

const AUTOMATION_BRIDGE_PARAMS = [
  "e2e",
  "qaDebug",
  "perfDebug",
  "perfHud",
  "visualProbe",
  "deterministicPerf",
] as const;

function shouldAttachAutomationBridge(params: URLSearchParams) {
  return AUTOMATION_BRIDGE_PARAMS.some((param) => params.has(param));
}

function attachAutomationBridge(app: MossuAppRuntime, mode: MossuE2eBridge["mode"]) {
  window.__MOSSU_E2E__ = { version: 1, ready: false, mode };
  window.advanceTime = (ms, renderFrame) => app.advanceTime(ms, renderFrame);
  window.render_game_to_text = () => app.renderGameToText();
}

function detachAutomationBridge() {
  delete window.__MOSSU_E2E__;
  delete window.advanceTime;
  delete window.render_game_to_text;
}

function attachDebugBridge(app: MossuAppRuntime) {
  window.mossuDebug = {
    completeOpeningSequence: () => app.debugCompleteOpeningSequence?.(),
    teleportPlayerTo: (x, z) => app.debugTeleportPlayerTo?.(x, z),
    jumpTo: (id) => app.debugJumpToRouteSpot?.(id) ?? false,
    applySaveState: (payload) => app.debugApplySaveState?.(payload),
    listSavePresets: () => app.debugListSavePresets?.() ?? [],
    applySavePreset: (id) => app.debugApplySavePreset?.(id) ?? false,
    resetProgress: () => app.debugResetProgress?.(),
    faceRouteHeading: (heading, cameraOptions) => app.debugFaceRouteHeading?.(heading, cameraOptions),
    setWaterDepthDebug: (enabled) => app.debugSetWaterDepthDebug?.(enabled),
    setLayerVisibility: (layer, visible) => app.debugSetLayerVisibility?.(layer, visible),
    setQualitySettings: (settings) => app.debugSetQualitySettings?.(settings),
    getLastFrameProfile: () => app.debugGetLastFrameProfile?.() ?? null,
  };
}

export function attachRuntime(app: MossuAppRuntime, mode: MossuE2eBridge["mode"]) {
  const params = new URLSearchParams(window.location.search);
  if (shouldAttachAutomationBridge(params)) {
    attachAutomationBridge(app, mode);
  } else {
    detachAutomationBridge();
  }

  if (params.has("qaDebug") && app.debugCompleteOpeningSequence) {
    attachDebugBridge(app);
  } else {
    delete window.mossuDebug;
  }

  app.start();
  // Let one frame run so rAF + first tick complete before automation probes call advanceTime / render_game_to_text.
  requestAnimationFrame(() => {
    if (window.__MOSSU_E2E__) {
      window.__MOSSU_E2E__.ready = true;
    }
  });
}
