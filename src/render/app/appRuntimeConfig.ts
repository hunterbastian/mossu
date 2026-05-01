import type { InputSnapshot } from "../../simulation/input";

export const QUALITY_SAMPLE_SECONDS = 0.55;
export const QUALITY_MIN_SAMPLE_FRAMES = 12;
export const PREFERRED_RENDER_WIDTH = 1600;
export const PREFERRED_RENDER_HEIGHT = 900;
export const LOW_QUALITY_RENDER_WIDTH = 1280;
export const LOW_QUALITY_RENDER_HEIGHT = 720;
export const MAX_PIXEL_RATIO = 1.1;
export const LOW_QUALITY_MAX_PIXEL_RATIO = 0.85;
export const MIN_PIXEL_RATIO = 0.31;
export const LOW_QUALITY_MIN_PIXEL_RATIO = 0.25;
export const PIXEL_RATIO_DOWNSHIFT_FRAME_SECONDS = 1 / 60;
export const PIXEL_RATIO_UPSHIFT_FRAME_SECONDS = 1 / 76;
export const PIXEL_RATIO_STEP_DOWN = 0.26;
export const PIXEL_RATIO_STEP_UP = 0.02;
export const NORMAL_HUD_UPDATE_INTERVAL = 1 / 12;
export const BLOOM_STRENGTH = 0.14;
export const BLOOM_RADIUS = 0.48;
export const BLOOM_THRESHOLD = 0.82;
export const BLOOM_MIN_PIXEL_RATIO = 0.74;
export const OPENING_SEQUENCE_SECONDS = 5.4;
export const OPENING_SEQUENCE_SKIP_AFTER_SECONDS = 1.05;
export const IDLE_CAMERA_ORBIT_DELAY_SECONDS = 6;
export const POST_PROCESSING_RESUME_DELAY_SECONDS = 0.34;

export type DebugSaveStatePayload = {
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
  };
};

export const PAUSED_INPUT: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  jumpHeld: false,
  jumpPressed: false,
  abilityHeld: false,
  abilityPressed: false,
  interactHeld: false,
  interactHoldSeconds: 0,
  rollHeld: false,
  interactPressed: false,
  inventoryTogglePressed: false,
  mapTogglePressed: false,
  mapViewResetPressed: false,
  mapFocusNextPressed: false,
  escapePressed: false,
};

export function hasControlActivity(input: InputSnapshot) {
  return (
    Math.abs(input.moveX) > 0.01 ||
    Math.abs(input.moveY) > 0.01 ||
    input.jumpHeld ||
    input.jumpPressed ||
    input.abilityHeld ||
    input.abilityPressed ||
    input.interactHeld ||
    input.interactPressed ||
    input.rollHeld ||
    input.inventoryTogglePressed ||
    input.mapTogglePressed ||
    input.mapViewResetPressed ||
    input.mapFocusNextPressed ||
    input.escapePressed
  );
}

export function isLowQuality(params: URLSearchParams): boolean {
  const q = params.get("quality")?.toLowerCase();
  return q === "low" || params.has("lowQuality");
}
