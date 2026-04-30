import type { PlayerState } from "./gameState";
import type { PlayerSimulationRuntime } from "./playerSimulationRuntime";
import {
  COYOTE_TIME,
  STAMINA_MAX,
  VOID_FALL_DURATION,
  VOID_HORIZONTAL_DRAG,
  GRAVITY,
} from "./playerSimulationConstants";
import { isInsideIslandPlayableBounds, sampleIslandVoidThreshold, startingPosition } from "./world";

export function shouldStartVoidFall(player: PlayerState) {
  return !isInsideIslandPlayableBounds(player.position.x, player.position.z)
    && player.position.y <= sampleIslandVoidThreshold(player.position.x, player.position.z);
}

export function beginVoidFall(player: PlayerState, runtime: PlayerSimulationRuntime) {
  player.fallingToVoid = true;
  player.voidFallTime = 0;
  player.grounded = false;
  player.rolling = false;
  player.rollingBoostActive = false;
  player.rollHoldSeconds = 0;
  player.rollModeReady = false;
  player.floating = false;
  runtime.rollingChargeSeconds = 0;
  runtime.rollModeHoldSeconds = 0;
}

export function updateVoidFall(player: PlayerState, dt: number) {
  player.rolling = false;
  player.rollingBoostActive = false;
  player.rollHoldSeconds = 0;
  player.rollModeReady = false;
  player.floating = false;
  player.grounded = false;
  player.voidFallTime += dt;
  player.velocity.x *= Math.pow(VOID_HORIZONTAL_DRAG, dt * 60);
  player.velocity.z *= Math.pow(VOID_HORIZONTAL_DRAG, dt * 60);
  player.velocity.y -= GRAVITY * 0.9 * dt;
  player.position.addScaledVector(player.velocity, dt);
  return player.voidFallTime >= VOID_FALL_DURATION;
}

export function respawnPlayerAtStart(player: PlayerState, runtime: PlayerSimulationRuntime) {
  player.position.copy(startingPosition);
  player.velocity.set(0, 0, 0);
  player.heading = 0;
  player.stamina = STAMINA_MAX;
  player.staminaMax = STAMINA_MAX;
  player.staminaVisible = false;
  player.rolling = false;
  player.rollingBoostActive = false;
  player.rollHoldSeconds = 0;
  player.rollModeReady = false;
  player.floating = false;
  player.grounded = true;
  player.swimming = false;
  player.waterMode = "onLand";
  player.waterDepth = 0;
  player.waterSurfaceY = 0;
  player.fallingToVoid = false;
  player.voidFallTime = 0;
  player.justRespawned = true;
  player.justLanded = false;
  player.landingImpact = 0;
  runtime.coyoteTimeRemaining = COYOTE_TIME;
  runtime.jumpBufferRemaining = 0;
  runtime.staminaRegenDelayRemaining = 0;
  runtime.rollingChargeSeconds = 0;
  runtime.rollModeHoldSeconds = 0;
  runtime.smoothedMoveX = 0;
  runtime.smoothedMoveY = 0;
}
