import { Vector3 } from "three";
import type { InputSnapshot } from "../../src/simulation/input";
import type { PlayerState, SaveState } from "../../src/simulation/gameState";
import {
  applyMovementPhysics,
  computeDownhillRollVector,
  computeRollGravityStrength,
  computeRollSlopeAmount,
  createMovementScratch,
  tickMovementTimers,
} from "../../src/simulation/movementPhysics";
import { createPlayerSimulationRuntime } from "../../src/simulation/playerSimulationRuntime";
import {
  ROLL_AIR_SPEED_BONUS,
  ROLL_BOOST_DELAY,
  ROLL_BOOST_MULTIPLIER,
  ROLL_GRAVITY_FULL_SLOPE,
  ROLL_GRAVITY_MIN_SLOPE,
  ROLL_MODE_INDICATOR_DELAY,
  ROLL_SPEED,
  WALK_SPEED,
} from "../../src/simulation/playerSimulationConstants";
import { updateStaminaAndAbilityState } from "../../src/simulation/staminaAbilities";
import { startingPosition } from "../../src/simulation/world";
import { assert } from "./testHarness";

const baseInput: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  jumpHeld: false,
  jumpPressed: false,
  interactHeld: false,
  interactHoldSeconds: 0,
  rollHeld: false,
  interactPressed: false,
  inventoryTogglePressed: false,
  mapTogglePressed: false,
  mapViewResetPressed: false,
  escapePressed: false,
};

function makePlayer(): PlayerState {
  return {
    position: startingPosition.clone(),
    velocity: new Vector3(),
    heading: 0,
    stamina: 100,
    staminaMax: 100,
    staminaVisible: false,
    rolling: false,
    rollingBoostActive: false,
    rollHoldSeconds: 0,
    rollModeReady: false,
    grounded: true,
    swimming: false,
    waterDepth: 0,
    waterSurfaceY: 0,
    fallingToVoid: false,
    voidFallTime: 0,
    justLanded: false,
    justRespawned: false,
    landingImpact: 0,
  };
}

function planarSpeed(player: PlayerState) {
  return Math.hypot(player.velocity.x, player.velocity.z);
}

function simulatePlanarVelocity(input: InputSnapshot, cameraYaw: number, frames = 32) {
  const save: SaveState = {
    unlockedAbilities: new Set(["breeze_float"]),
    catalogedLandmarkIds: new Set(),
    gatheredForageableIds: new Set(),
  };
  const player = makePlayer();
  const runtime = createPlayerSimulationRuntime();
  const scratch = createMovementScratch();
  for (let i = 0; i < frames; i += 1) {
    const dt = 1 / 60;
    tickMovementTimers(player, input, dt, runtime);
    applyMovementPhysics(player, save, input, cameraYaw, dt, runtime, scratch);
  }
  return player.velocity.clone();
}

export function runMovementContracts() {
  const save: SaveState = {
    unlockedAbilities: new Set(["breeze_float"]),
    catalogedLandmarkIds: new Set(),
    gatheredForageableIds: new Set(),
  };

  const leftStrafe = simulatePlanarVelocity({ ...baseInput, moveX: -1 }, Math.PI);
  const rightStrafe = simulatePlanarVelocity({ ...baseInput, moveX: 1 }, Math.PI);
  assert(leftStrafe.x < -1, "A moves left relative to the gameplay camera");
  assert(rightStrafe.x > 1, "D moves right relative to the gameplay camera");
  assert(leftStrafe.x * rightStrafe.x < -1, "A and D produce opposite strafe directions on the lateral axis");

  const walkPlayer = makePlayer();
  const rollPlayer = makePlayer();
  const walkRuntime = createPlayerSimulationRuntime();
  const rollRuntime = createPlayerSimulationRuntime();
  const walkScratch = createMovementScratch();
  const rollScratch = createMovementScratch();

  for (let i = 0; i < 75; i += 1) {
    const dt = 1 / 60;
    const walkInput = { ...baseInput, moveY: 1 };
    const rollInput = { ...baseInput, moveY: 1, rollHeld: true };
    tickMovementTimers(walkPlayer, walkInput, dt, walkRuntime);
    tickMovementTimers(rollPlayer, rollInput, dt, rollRuntime);
    applyMovementPhysics(walkPlayer, save, walkInput, 0, dt, walkRuntime, walkScratch);
    applyMovementPhysics(rollPlayer, save, rollInput, 0, dt, rollRuntime, rollScratch);
  }

  assert(planarSpeed(walkPlayer) <= WALK_SPEED + 0.001, "walking remains capped at walk speed");
  assert(planarSpeed(rollPlayer) > WALK_SPEED + 4, "rolling is meaningfully faster than walking");
  assert(rollPlayer.rollingBoostActive, `roll boost activates after ${ROLL_BOOST_DELAY}s`);
  assert(rollPlayer.stamina === rollPlayer.staminaMax, "rolling does not consume stamina");
  assert(planarSpeed(rollPlayer) <= ROLL_SPEED * ROLL_BOOST_MULTIPLIER + 12, "rolling stays bounded after boost and slope carry");

  const readyPlayer = makePlayer();
  const readyRuntime = createPlayerSimulationRuntime();
  const readyScratch = createMovementScratch();
  const readyInput = { ...baseInput, rollHeld: true };
  for (let i = 0; i < Math.ceil(ROLL_MODE_INDICATOR_DELAY * 60) + 1; i += 1) {
    const dt = 1 / 60;
    tickMovementTimers(readyPlayer, readyInput, dt, readyRuntime);
    applyMovementPhysics(readyPlayer, save, readyInput, 0, dt, readyRuntime, readyScratch);
    updateStaminaAndAbilityState(readyPlayer, dt, readyRuntime, false);
  }
  assert(readyPlayer.rollModeReady, `holding Shift for ${ROLL_MODE_INDICATOR_DELAY}s readies roll mode`);
  assert(readyPlayer.stamina === readyPlayer.staminaMax, "charging roll mode is stamina-free");

  const jumpPlayer = makePlayer();
  const jumpRuntime = createPlayerSimulationRuntime();
  const jumpScratch = createMovementScratch();
  for (let i = 0; i < 42; i += 1) {
    const dt = 1 / 60;
    const rollInput = { ...baseInput, moveY: 1, rollHeld: true };
    tickMovementTimers(jumpPlayer, rollInput, dt, jumpRuntime);
    applyMovementPhysics(jumpPlayer, save, rollInput, 0, dt, jumpRuntime, jumpScratch);
  }
  const speedBeforeJump = planarSpeed(jumpPlayer);
  const jumpInput = { ...baseInput, moveY: 1, rollHeld: true, jumpPressed: true, jumpHeld: true };
  tickMovementTimers(jumpPlayer, jumpInput, 1 / 60, jumpRuntime);
  applyMovementPhysics(jumpPlayer, save, jumpInput, 0, 1 / 60, jumpRuntime, jumpScratch);
  assert(!jumpPlayer.grounded, "roll jump leaves the ground");
  assert(planarSpeed(jumpPlayer) > speedBeforeJump + 2, "roll jump carries extra forward momentum");
  assert(planarSpeed(jumpPlayer) <= ROLL_SPEED + ROLL_AIR_SPEED_BONUS + 8, "roll jump momentum stays bounded");

  const floatPlayer = makePlayer();
  const floatRuntime = createPlayerSimulationRuntime();
  const floatScratch = createMovementScratch();
  for (let i = 0; i < 110; i += 1) {
    const dt = 1 / 60;
    const floatInput = {
      ...baseInput,
      rollHeld: true,
      moveY: 1,
      jumpHeld: true,
      jumpPressed: i === 0,
    };
    tickMovementTimers(floatPlayer, floatInput, dt, floatRuntime);
    const result = applyMovementPhysics(floatPlayer, save, floatInput, 0, dt, floatRuntime, floatScratch);
    updateStaminaAndAbilityState(floatPlayer, dt, floatRuntime, result.isFloating);
  }
  assert(!floatPlayer.grounded, "roll jump can transition into air control");
  assert(floatPlayer.stamina < floatPlayer.staminaMax, "Breeze Float, not rolling, consumes stamina while Space is held in air");

  const flatNormal = new Vector3(0, 1, 0);
  const slopeNormal = new Vector3(0.28, 0.96, 0).normalize();
  const steepNormal = new Vector3(0.5, 0.86, 0).normalize();
  const downhill = new Vector3();
  assert(!computeDownhillRollVector(flatNormal, downhill), "flat ground has no downhill roll vector");
  assert(computeDownhillRollVector(slopeNormal, downhill), "sloped ground has a downhill roll vector");
  assert(downhill.x > 0.5, "downhill roll vector follows projected gravity across the slope");
  assert(computeRollSlopeAmount(flatNormal) === 0, "flat ground has zero roll slope");
  assert(computeRollSlopeAmount(slopeNormal) > 0.2, "gentle hill has enough roll slope to matter");
  assert(computeRollGravityStrength(flatNormal) === 0, "flat ground does not add roll gravity");
  assert(computeRollGravityStrength(slopeNormal) > 0, `slope above ${ROLL_GRAVITY_MIN_SLOPE} adds roll gravity`);
  assert(
    computeRollGravityStrength(steepNormal) >= computeRollGravityStrength(slopeNormal),
    `steeper slopes approach full roll gravity by ${ROLL_GRAVITY_FULL_SLOPE}`,
  );
}
