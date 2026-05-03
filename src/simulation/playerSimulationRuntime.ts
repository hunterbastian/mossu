import { COYOTE_TIME } from "./playerSimulationConstants";

export interface PlayerSimulationRuntime {
  coyoteTimeRemaining: number;
  breezeFloatBufferRemaining: number;
  jumpBufferRemaining: number;
  staminaRegenDelayRemaining: number;
  rollingChargeSeconds: number;
  rollModeHoldSeconds: number;
  airMomentumGraceRemaining: number;
  airMomentumSpeedLimitBonus: number;
  landingMomentumGraceRemaining: number;
  smoothedMoveX: number;
  smoothedMoveY: number;
  /** Was jump held on the previous physics tick — used to detect release-cut. */
  jumpHeldPrevFrame: boolean;
  /** True once the active jump's release-cut has fired, so we only damp once per jump. */
  jumpReleaseCutConsumed: boolean;
}

export function createPlayerSimulationRuntime(): PlayerSimulationRuntime {
  return {
    coyoteTimeRemaining: COYOTE_TIME,
    breezeFloatBufferRemaining: 0,
    jumpBufferRemaining: 0,
    staminaRegenDelayRemaining: 0,
    rollingChargeSeconds: 0,
    rollModeHoldSeconds: 0,
    airMomentumGraceRemaining: 0,
    airMomentumSpeedLimitBonus: 0,
    landingMomentumGraceRemaining: 0,
    smoothedMoveX: 0,
    smoothedMoveY: 0,
    jumpHeldPrevFrame: false,
    jumpReleaseCutConsumed: true,
  };
}
