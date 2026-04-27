import { COYOTE_TIME } from "./playerSimulationConstants";

export interface PlayerSimulationRuntime {
  coyoteTimeRemaining: number;
  breezeFloatBufferRemaining: number;
  jumpBufferRemaining: number;
  staminaRegenDelayRemaining: number;
  rollingChargeSeconds: number;
  rollModeHoldSeconds: number;
  smoothedMoveX: number;
  smoothedMoveY: number;
}

export function createPlayerSimulationRuntime(): PlayerSimulationRuntime {
  return {
    coyoteTimeRemaining: COYOTE_TIME,
    breezeFloatBufferRemaining: 0,
    jumpBufferRemaining: 0,
    staminaRegenDelayRemaining: 0,
    rollingChargeSeconds: 0,
    rollModeHoldSeconds: 0,
    smoothedMoveX: 0,
    smoothedMoveY: 0,
  };
}
