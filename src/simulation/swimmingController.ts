import type { PlayerState } from "./gameState";
import type { WaterState } from "./world";
import {
  SWIM_ENTRY_MARGIN,
  SWIM_EXIT_MARGIN,
  SWIM_MIN_DEPTH,
} from "./playerSimulationConstants";

export type PlayerWaterMovementState = "onLand" | "wading" | "swimmingSurface" | "underwater";

export interface SwimmingControllerTuning {
  wadeDepthThreshold: number;
  swimDepthThreshold: number;
  underwaterDepthThreshold: number;
}

export const DEFAULT_SWIMMING_TUNING: SwimmingControllerTuning = {
  wadeDepthThreshold: 0.32,
  swimDepthThreshold: SWIM_MIN_DEPTH,
  underwaterDepthThreshold: 0.86,
};

export class SwimmingController {
  readonly tuning: SwimmingControllerTuning;

  constructor(tuning: Partial<SwimmingControllerTuning> = {}) {
    this.tuning = { ...DEFAULT_SWIMMING_TUNING, ...tuning };
  }

  shouldSwim(player: PlayerState, waterState: WaterState | null) {
    if (!waterState || !waterState.swimAllowed || waterState.depth < this.tuning.swimDepthThreshold) {
      return false;
    }
    const entryMargin = player.swimming ? SWIM_EXIT_MARGIN : SWIM_ENTRY_MARGIN;
    return player.position.y <= waterState.surfaceY + entryMargin;
  }

  classify(
    player: PlayerState,
    waterState: WaterState | null,
    swimming = player.swimming,
  ): PlayerWaterMovementState {
    if (!waterState || waterState.depth < this.tuning.wadeDepthThreshold) {
      return "onLand";
    }

    if (!swimming) {
      return "wading";
    }

    const submersion = waterState.surfaceY - player.position.y;
    if (waterState.depth >= this.tuning.swimDepthThreshold && submersion > this.tuning.underwaterDepthThreshold) {
      return "underwater";
    }

    return "swimmingSurface";
  }
}

export const swimmingController = new SwimmingController();
