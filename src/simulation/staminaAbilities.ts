import type { PlayerState, SaveState } from "./gameState";
import type { PlayerSimulationRuntime } from "./playerSimulationRuntime";
import {
  FLOAT_STAMINA_DRAIN,
  STAMINA_REGEN_AIR,
  STAMINA_REGEN_DELAY,
  STAMINA_REGEN_GROUND,
  STAMINA_REGEN_SWIM,
  STAMINA_VISIBLE_EPSILON,
  SWIM_UNDERWATER_STAMINA_DRAIN,
} from "./playerSimulationConstants";

export function canUseBreezeFloat(save: SaveState) {
  return save.unlockedAbilities.has("breeze_float");
}

export function tickStaminaCooldown(runtime: PlayerSimulationRuntime, dt: number) {
  runtime.staminaRegenDelayRemaining = Math.max(0, runtime.staminaRegenDelayRemaining - dt);
}

export function updateStaminaAndAbilityState(
  player: PlayerState,
  dt: number,
  runtime: PlayerSimulationRuntime,
  isFloating: boolean,
) {
  const staminaDrainRate = isFloating
    ? FLOAT_STAMINA_DRAIN
    : player.waterMode === "underwater"
      ? SWIM_UNDERWATER_STAMINA_DRAIN
      : 0;
  if (staminaDrainRate > 0) {
    player.stamina = Math.max(0, player.stamina - staminaDrainRate * dt);
    runtime.staminaRegenDelayRemaining = STAMINA_REGEN_DELAY;
  } else if (runtime.staminaRegenDelayRemaining <= 0 && player.stamina < player.staminaMax) {
    const regenRate = player.swimming
      ? STAMINA_REGEN_SWIM
      : player.grounded
        ? STAMINA_REGEN_GROUND
        : STAMINA_REGEN_AIR;
    player.stamina = Math.min(player.staminaMax, player.stamina + regenRate * dt);
  }

  player.staminaVisible = staminaDrainRate > 0
    || runtime.staminaRegenDelayRemaining > 0
    || player.stamina < player.staminaMax - STAMINA_VISIBLE_EPSILON;
}
