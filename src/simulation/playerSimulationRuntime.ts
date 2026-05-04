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
  /** Was jump held on the previous physics tick — used to detect release inside the charge window. */
  jumpHeldPrevFrame: boolean;
  /**
   * Seconds of hold-to-charge thrust remaining for the active jump. Initialized on jump fire
   * to JUMP_HOLD_MAX_DURATION, decremented each frame while thrust applies, zeroed on land
   * or on release-cut. Doubles as the eligibility window for variable-jump-cut: releasing
   * while > 0 cuts upward velocity (tap = short hop); releasing after the window has expired
   * leaves the charged arc alone (hold = high jump).
   */
  jumpHoldThrustRemaining: number;
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
    jumpHoldThrustRemaining: 0,
  };
}
