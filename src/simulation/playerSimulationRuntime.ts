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
  /** Was Shift (roll) held on the previous physics tick — used to detect press transitions for the air-boost. */
  rollHeldPrevFrame: boolean;
  /**
   * One-shot air-boost availability. True after grounding/swimming, false after the
   * boost has fired this air time. The boost itself fires once per Shift press while
   * airborne — re-pressing without re-grounding has no effect.
   */
  airBoostAvailable: boolean;
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
    rollHeldPrevFrame: false,
    airBoostAvailable: true,
  };
}
