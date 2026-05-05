import { Vector2, Vector3 } from "three";
import type { InputSnapshot } from "../../src/simulation/input";
import type { PlayerState, SaveState } from "../../src/simulation/gameState";
import {
  applyMovementPhysics,
  computeDownhillRollVector,
  computeRollGravityStrength,
  computeRollSlopeAmount,
  computeRollSlopeInputAccelerationMultiplier,
  computeRollSlopeInputSpeedAdjustment,
  createMovementScratch,
  lookupSurfaceTraction,
  tickMovementTimers,
} from "../../src/simulation/movementPhysics";
import { createPlayerSimulationRuntime } from "../../src/simulation/playerSimulationRuntime";
import {
  COYOTE_TIME,
  AIR_SPEED,
  AIR_MOMENTUM_GRACE_TIME,
  JUMP_BUFFER_TIME,
  JUMP_RELEASE_CUT_MULTIPLIER,
  JUMP_VELOCITY,
  LANDING_MOMENTUM_GRACE_TIME,
  FLOAT_EXIT_GRAVITY_GRACE_TIME,
  FLOAT_EXIT_GRAVITY_SCALE,
  ROLL_AIR_SPEED_BONUS,
  ROLL_AIR_MOMENTUM_GRACE_TIME,
  ROLL_BOOST_DELAY,
  ROLL_BOOST_MULTIPLIER,
  ROLL_DRIFT_SPEED_RETENTION,
  ROLL_EXIT_CARRY_TIME,
  ROLL_GRAVITY_FULL_SLOPE,
  ROLL_GRAVITY_MIN_SLOPE,
  ROLL_MODE_INDICATOR_DELAY,
  ROLL_SPEED,
  SURFACE_TRACTION,
  SWIM_ENTRY_MOMENTUM_GRACE_TIME,
  SWIM_ENTRY_SPEED_CARRY_BONUS,
  SWIM_MIN_DEPTH,
  SWIM_UNDERWATER_SPEED,
  WALK_SPEED,
} from "../../src/simulation/playerSimulationConstants";
import { updateStaminaAndAbilityState } from "../../src/simulation/staminaAbilities";
import {
  applySwimForces,
  clampSwimVelocity,
  resolveWaterContact,
  wantsUnderwaterDive,
} from "../../src/simulation/waterTraversal";
import type { WaterState } from "../../src/simulation/world";
import { sampleTerrainHeight } from "../../src/simulation/world";
import { assert } from "./testHarness";

const baseInput: InputSnapshot = {
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

const movementContractPosition = new Vector3(-68, sampleTerrainHeight(-68, -140) + 2.2, -140);

function makePlayer(): PlayerState {
  return {
    position: movementContractPosition.clone(),
    velocity: new Vector3(),
    heading: 0,
    stamina: 100,
    staminaMax: 100,
    staminaVisible: false,
    rolling: false,
    rollingBoostActive: false,
    rollHoldSeconds: 0,
    rollModeReady: false,
    floating: false,
    grounded: true,
    swimming: false,
    waterMode: "onLand",
    waterDepth: 0,
    waterSurfaceY: 0,
    fallingToVoid: false,
    voidFallTime: 0,
    justLanded: false,
    justRespawned: false,
    landingImpact: 0,
    jumpChargeReleasedThisFrame: false,
    jumpChargeReleasedRatio: 0,
    airBoostFiredThisFrame: false,
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
    recruitedKaruIds: new Set(),
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
    recruitedKaruIds: new Set(),
  };

  const leftStrafe = simulatePlanarVelocity({ ...baseInput, moveX: -1 }, Math.PI);
  const rightStrafe = simulatePlanarVelocity({ ...baseInput, moveX: 1 }, Math.PI);
  assert(leftStrafe.x < -1, "A moves left relative to the gameplay camera");
  assert(rightStrafe.x > 1, "D moves right relative to the gameplay camera");
  assert(leftStrafe.x * rightStrafe.x < -1, "A and D produce opposite strafe directions on the lateral axis");

  const quickWalkPlayer = makePlayer();
  const quickRollPlayer = makePlayer();
  const quickWalkRuntime = createPlayerSimulationRuntime();
  const quickRollRuntime = createPlayerSimulationRuntime();
  const quickWalkScratch = createMovementScratch();
  const quickRollScratch = createMovementScratch();
  for (let i = 0; i < 12; i += 1) {
    const dt = 1 / 60;
    const walkInput = { ...baseInput, moveY: 1 };
    const rollInput = { ...baseInput, moveY: 1, rollHeld: true };
    tickMovementTimers(quickWalkPlayer, walkInput, dt, quickWalkRuntime);
    tickMovementTimers(quickRollPlayer, rollInput, dt, quickRollRuntime);
    applyMovementPhysics(quickWalkPlayer, save, walkInput, 0, dt, quickWalkRuntime, quickWalkScratch);
    applyMovementPhysics(quickRollPlayer, save, rollInput, 0, dt, quickRollRuntime, quickRollScratch);
  }
  assert(
    planarSpeed(quickRollPlayer) > planarSpeed(quickWalkPlayer) + 1.2,
    `roll start has an immediate readable speed lift over walking: walk=${planarSpeed(quickWalkPlayer).toFixed(2)} roll=${planarSpeed(quickRollPlayer).toFixed(2)}`,
  );

  const driftPlayer = makePlayer();
  const driftRuntime = createPlayerSimulationRuntime();
  const driftScratch = createMovementScratch();
  for (let i = 0; i < 36; i += 1) {
    const dt = 1 / 60;
    const rollInput = { ...baseInput, moveY: 1, rollHeld: true };
    tickMovementTimers(driftPlayer, rollInput, dt, driftRuntime);
    applyMovementPhysics(driftPlayer, save, rollInput, 0, dt, driftRuntime, driftScratch);
  }
  const driftSpeedBeforeTurn = planarSpeed(driftPlayer);
  for (let i = 0; i < 16; i += 1) {
    const dt = 1 / 60;
    const turnInput = { ...baseInput, moveX: 1, rollHeld: true };
    tickMovementTimers(driftPlayer, turnInput, dt, driftRuntime);
    applyMovementPhysics(driftPlayer, save, turnInput, 0, dt, driftRuntime, driftScratch);
  }
  assert(
    planarSpeed(driftPlayer) > driftSpeedBeforeTurn * ROLL_DRIFT_SPEED_RETENTION,
    `roll drift keeps most of Mossu's momentum while turning sideways: before=${driftSpeedBeforeTurn.toFixed(2)} after=${planarSpeed(driftPlayer).toFixed(2)} retention=${ROLL_DRIFT_SPEED_RETENTION.toFixed(2)}`,
  );
  assert(Math.abs(driftPlayer.velocity.x) > 5, "sideways roll input visibly bends the velocity arc");

  const reversePlayer = makePlayer();
  const reverseRuntime = createPlayerSimulationRuntime();
  const reverseScratch = createMovementScratch();
  for (let i = 0; i < 42; i += 1) {
    const dt = 1 / 60;
    const rollInput = { ...baseInput, moveY: 1, rollHeld: true };
    tickMovementTimers(reversePlayer, rollInput, dt, reverseRuntime);
    applyMovementPhysics(reversePlayer, save, rollInput, 0, dt, reverseRuntime, reverseScratch);
  }
  const reverseSpeedBefore = planarSpeed(reversePlayer);
  for (let i = 0; i < 12; i += 1) {
    const dt = 1 / 60;
    const reverseInput = { ...baseInput, moveY: -1, rollHeld: true };
    tickMovementTimers(reversePlayer, reverseInput, dt, reverseRuntime);
    applyMovementPhysics(reversePlayer, save, reverseInput, 0, dt, reverseRuntime, reverseScratch);
  }
  assert(
    planarSpeed(reversePlayer) > reverseSpeedBefore * 0.55,
    "reversing roll direction curves and sheds speed instead of stopping dead",
  );

  const rollReleasePlayer = makePlayer();
  const rollReleaseRuntime = createPlayerSimulationRuntime();
  const rollReleaseScratch = createMovementScratch();
  for (let i = 0; i < 48; i += 1) {
    const dt = 1 / 60;
    const rollInput = { ...baseInput, moveY: 1, rollHeld: true };
    tickMovementTimers(rollReleasePlayer, rollInput, dt, rollReleaseRuntime);
    applyMovementPhysics(rollReleasePlayer, save, rollInput, 0, dt, rollReleaseRuntime, rollReleaseScratch);
  }
  const rollReleaseSpeedBefore = planarSpeed(rollReleasePlayer);
  for (let i = 0; i < 10; i += 1) {
    const dt = 1 / 60;
    const walkInput = { ...baseInput, moveY: 1 };
    tickMovementTimers(rollReleasePlayer, walkInput, dt, rollReleaseRuntime);
    applyMovementPhysics(rollReleasePlayer, save, walkInput, 0, dt, rollReleaseRuntime, rollReleaseScratch);
  }
  assert(
    rollReleaseRuntime.rollExitCarryRemaining > ROLL_EXIT_CARRY_TIME * 0.35,
    "releasing roll keeps a short carry timer for the walk handoff",
  );
  assert(
    planarSpeed(rollReleasePlayer) > WALK_SPEED + 3,
    `roll release eases down into walk instead of snapping to walk cap: before=${rollReleaseSpeedBefore.toFixed(2)} after=${planarSpeed(rollReleasePlayer).toFixed(2)}`,
  );

  const airborneRollReleasePlayer = makePlayer();
  const airborneRollReleaseRuntime = createPlayerSimulationRuntime();
  const airborneRollReleaseScratch = createMovementScratch();
  airborneRollReleasePlayer.grounded = false;
  airborneRollReleasePlayer.velocity.set(42, 0, 0);
  tickMovementTimers(
    airborneRollReleasePlayer,
    { ...baseInput, moveY: 1, rollHeld: true },
    1 / 60,
    airborneRollReleaseRuntime,
  );
  applyMovementPhysics(
    airborneRollReleasePlayer,
    save,
    { ...baseInput, moveY: 1, rollHeld: true },
    0,
    1 / 60,
    airborneRollReleaseRuntime,
    airborneRollReleaseScratch,
  );
  for (let i = 0; i < 10; i += 1) {
    const dt = 1 / 60;
    const airborneReleaseInput = { ...baseInput, moveY: 1 };
    tickMovementTimers(airborneRollReleasePlayer, airborneReleaseInput, dt, airborneRollReleaseRuntime);
    applyMovementPhysics(
      airborneRollReleasePlayer,
      save,
      airborneReleaseInput,
      0,
      dt,
      airborneRollReleaseRuntime,
      airborneRollReleaseScratch,
    );
  }
  assert(
    planarSpeed(airborneRollReleasePlayer) > AIR_SPEED + 4,
    "airborne roll release keeps a brief carry instead of clamping straight to normal air speed",
  );

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
  assert(
    planarSpeed(rollPlayer) <= ROLL_SPEED * ROLL_BOOST_MULTIPLIER + 12,
    "rolling stays bounded after boost and slope carry",
  );

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
  assert(
    jumpRuntime.airMomentumGraceRemaining === ROLL_AIR_MOMENTUM_GRACE_TIME,
    "roll jump starts a generous air momentum grace",
  );
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
  assert(floatPlayer.floating, "Breeze Float exposes an explicit player floating state while held in air");
  assert(
    floatPlayer.stamina < floatPlayer.staminaMax,
    "Breeze Float, not rolling, consumes stamina while Space is held in air",
  );

  const dedicatedFloatPlayer = makePlayer();
  const dedicatedFloatRuntime = createPlayerSimulationRuntime();
  const dedicatedFloatScratch = createMovementScratch();
  dedicatedFloatPlayer.grounded = false;
  dedicatedFloatPlayer.velocity.y = 0;
  for (let i = 0; i < 8; i += 1) {
    const dt = 1 / 60;
    const abilityInput = {
      ...baseInput,
      abilityHeld: i < 4,
      abilityPressed: i === 0,
    };
    tickMovementTimers(dedicatedFloatPlayer, abilityInput, dt, dedicatedFloatRuntime);
    const result = applyMovementPhysics(
      dedicatedFloatPlayer,
      save,
      abilityInput,
      0,
      dt,
      dedicatedFloatRuntime,
      dedicatedFloatScratch,
    );
    updateStaminaAndAbilityState(dedicatedFloatPlayer, dt, dedicatedFloatRuntime, result.isFloating);
  }
  assert(dedicatedFloatPlayer.floating, "Q works as a dedicated Breeze Float hold without requiring Space");
  assert(
    dedicatedFloatPlayer.stamina < dedicatedFloatPlayer.staminaMax,
    "dedicated Breeze Float input consumes stamina while active",
  );

  const bufferedFloatPlayer = makePlayer();
  const bufferedFloatRuntime = createPlayerSimulationRuntime();
  const bufferedFloatScratch = createMovementScratch();
  bufferedFloatPlayer.grounded = false;
  bufferedFloatPlayer.velocity.y = -1.2;
  tickMovementTimers(bufferedFloatPlayer, { ...baseInput, abilityPressed: true }, 1 / 60, bufferedFloatRuntime);
  applyMovementPhysics(
    bufferedFloatPlayer,
    save,
    { ...baseInput, abilityPressed: true },
    0,
    1 / 60,
    bufferedFloatRuntime,
    bufferedFloatScratch,
  );
  tickMovementTimers(bufferedFloatPlayer, baseInput, 1 / 60, bufferedFloatRuntime);
  const bufferedResult = applyMovementPhysics(
    bufferedFloatPlayer,
    save,
    baseInput,
    0,
    1 / 60,
    bufferedFloatRuntime,
    bufferedFloatScratch,
  );
  assert(bufferedResult.isFloating, "a tapped Q buffers Breeze Float briefly after release");

  const coyotePlayer = makePlayer();
  const coyoteRuntime = createPlayerSimulationRuntime();
  const coyoteScratch = createMovementScratch();
  coyotePlayer.grounded = false;
  coyoteRuntime.coyoteTimeRemaining = COYOTE_TIME;
  const coyoteJumpInput = { ...baseInput, jumpPressed: true, jumpHeld: true };
  tickMovementTimers(coyotePlayer, coyoteJumpInput, 1 / 60, coyoteRuntime);
  applyMovementPhysics(coyotePlayer, save, coyoteJumpInput, 0, 1 / 60, coyoteRuntime, coyoteScratch);
  assert(coyotePlayer.velocity.y > 10, "coyote time lets Mossu jump just after leaving a ledge");
  assert(coyoteRuntime.airMomentumGraceRemaining === AIR_MOMENTUM_GRACE_TIME, "normal jump starts air momentum grace");

  const bufferedJumpPlayer = makePlayer();
  const bufferedJumpRuntime = createPlayerSimulationRuntime();
  const bufferedJumpScratch = createMovementScratch();
  bufferedJumpPlayer.grounded = false;
  bufferedJumpRuntime.coyoteTimeRemaining = 0;
  const earlyJumpInput = { ...baseInput, jumpPressed: true, jumpHeld: true };
  tickMovementTimers(bufferedJumpPlayer, earlyJumpInput, 1 / 60, bufferedJumpRuntime);
  applyMovementPhysics(bufferedJumpPlayer, save, earlyJumpInput, 0, 1 / 60, bufferedJumpRuntime, bufferedJumpScratch);
  assert(bufferedJumpRuntime.jumpBufferRemaining > JUMP_BUFFER_TIME * 0.5, "early jump input stays buffered in air");
  bufferedJumpPlayer.grounded = true;
  tickMovementTimers(bufferedJumpPlayer, baseInput, 1 / 60, bufferedJumpRuntime);
  applyMovementPhysics(bufferedJumpPlayer, save, baseInput, 0, 1 / 60, bufferedJumpRuntime, bufferedJumpScratch);
  assert(bufferedJumpPlayer.velocity.y > 10, "buffered jump fires on the first grounded frame");

  const landingPlayer = makePlayer();
  const landingRuntime = createPlayerSimulationRuntime();
  const landingScratch = createMovementScratch();
  landingPlayer.position.set(0, 0, 0);
  landingPlayer.grounded = false;
  landingPlayer.velocity.set(24, -16, 0);
  resolveWaterContact(landingPlayer, 0, null, false, 16, landingRuntime);
  assert(landingPlayer.justLanded, "ground resolve marks a fresh landing");
  assert(
    landingRuntime.landingMomentumGraceRemaining === LANDING_MOMENTUM_GRACE_TIME,
    "landing starts a short momentum grace",
  );
  const landingSpeedBeforeCarry = planarSpeed(landingPlayer);
  tickMovementTimers(landingPlayer, baseInput, 1 / 60, landingRuntime);
  applyMovementPhysics(landingPlayer, save, baseInput, 0, 1 / 60, landingRuntime, landingScratch);
  assert(
    planarSpeed(landingPlayer) > landingSpeedBeforeCarry - 0.8,
    `landing carry preserves forward momentum for the first grounded beat: before=${landingSpeedBeforeCarry.toFixed(2)} after=${planarSpeed(landingPlayer).toFixed(2)}`,
  );

  const wadePlayer = makePlayer();
  const wadeRuntime = createPlayerSimulationRuntime();
  const wadeScratch = createMovementScratch();
  wadePlayer.waterMode = "wading";
  wadePlayer.waterDepth = SWIM_MIN_DEPTH;
  tickMovementTimers(wadePlayer, { ...baseInput, moveY: 1 }, 1 / 60, wadeRuntime);
  applyMovementPhysics(wadePlayer, save, { ...baseInput, moveY: 1 }, 0, 1 / 60, wadeRuntime, wadeScratch);
  assert(wadeRuntime.wadeBlend > 0, "wade contact starts blending toward the shallow-water slowdown");
  assert(
    wadeRuntime.wadeBlend < 0.2,
    "first wade frame only partially applies the water slowdown so walk-to-wade feels gradual",
  );

  const wadeRollReleasePlayer = makePlayer();
  const wadeRollReleaseRuntime = createPlayerSimulationRuntime();
  const wadeRollReleaseScratch = createMovementScratch();
  for (let i = 0; i < 48; i += 1) {
    const dt = 1 / 60;
    const rollInput = { ...baseInput, moveY: 1, rollHeld: true };
    tickMovementTimers(wadeRollReleasePlayer, rollInput, dt, wadeRollReleaseRuntime);
    applyMovementPhysics(wadeRollReleasePlayer, save, rollInput, 0, dt, wadeRollReleaseRuntime, wadeRollReleaseScratch);
  }
  wadeRollReleasePlayer.waterMode = "wading";
  wadeRollReleasePlayer.waterDepth = SWIM_MIN_DEPTH * 0.58;
  const wadeRollSpeedBeforeRelease = planarSpeed(wadeRollReleasePlayer);
  for (let i = 0; i < 10; i += 1) {
    const dt = 1 / 60;
    const walkInput = { ...baseInput, moveY: 1 };
    tickMovementTimers(wadeRollReleasePlayer, walkInput, dt, wadeRollReleaseRuntime);
    applyMovementPhysics(wadeRollReleasePlayer, save, walkInput, 0, dt, wadeRollReleaseRuntime, wadeRollReleaseScratch);
  }
  assert(
    planarSpeed(wadeRollReleasePlayer) > WALK_SPEED + 4,
    `roll release keeps a readable carry even when it blends into shallow wading: before=${wadeRollSpeedBeforeRelease.toFixed(2)} after=${planarSpeed(wadeRollReleasePlayer).toFixed(2)}`,
  );

  const floatExitPlayer = makePlayer();
  const floatExitRuntime = createPlayerSimulationRuntime();
  const floatExitScratch = createMovementScratch();
  floatExitPlayer.grounded = false;
  floatExitPlayer.velocity.y = 0;
  floatExitRuntime.floatExitGravityGraceRemaining = FLOAT_EXIT_GRAVITY_GRACE_TIME;
  tickMovementTimers(floatExitPlayer, baseInput, 1 / 60, floatExitRuntime);
  applyMovementPhysics(floatExitPlayer, save, baseInput, 0, 1 / 60, floatExitRuntime, floatExitScratch);
  assert(
    floatExitPlayer.velocity.y > -38 * (1 / 60) * 0.82,
    `float release applies softened gravity before full fall resumes; scale target ${FLOAT_EXIT_GRAVITY_SCALE}`,
  );

  const releasedRollJumpPlayer = makePlayer();
  const releasedRollJumpRuntime = createPlayerSimulationRuntime();
  const releasedRollJumpScratch = createMovementScratch();
  for (let i = 0; i < 36; i += 1) {
    const dt = 1 / 60;
    const rollInput = { ...baseInput, moveY: 1, rollHeld: true };
    tickMovementTimers(releasedRollJumpPlayer, rollInput, dt, releasedRollJumpRuntime);
    applyMovementPhysics(
      releasedRollJumpPlayer,
      save,
      rollInput,
      0,
      dt,
      releasedRollJumpRuntime,
      releasedRollJumpScratch,
    );
  }
  const releasedPreJumpSpeed = planarSpeed(releasedRollJumpPlayer);
  tickMovementTimers(releasedRollJumpPlayer, jumpInput, 1 / 60, releasedRollJumpRuntime);
  applyMovementPhysics(
    releasedRollJumpPlayer,
    save,
    jumpInput,
    0,
    1 / 60,
    releasedRollJumpRuntime,
    releasedRollJumpScratch,
  );
  for (let i = 0; i < 42; i += 1) {
    const dt = 1 / 60;
    tickMovementTimers(releasedRollJumpPlayer, baseInput, dt, releasedRollJumpRuntime);
    applyMovementPhysics(
      releasedRollJumpPlayer,
      save,
      baseInput,
      0,
      dt,
      releasedRollJumpRuntime,
      releasedRollJumpScratch,
    );
  }
  assert(
    planarSpeed(releasedRollJumpPlayer) > releasedPreJumpSpeed * 0.68,
    `released roll jumps keep enough forward speed to land with movement: before=${releasedPreJumpSpeed.toFixed(2)} after=${planarSpeed(releasedRollJumpPlayer).toFixed(2)}`,
  );

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
  const downhillMove = downhill.clone();
  const uphillMove = downhill.clone().multiplyScalar(-1);
  assert(
    computeRollSlopeInputSpeedAdjustment(slopeNormal, downhillMove) > 0,
    "rolling with the downhill line gets a small speed bias",
  );
  assert(
    computeRollSlopeInputSpeedAdjustment(slopeNormal, uphillMove) < 0,
    "rolling against the hill gets a small speed penalty",
  );
  assert(
    computeRollSlopeInputAccelerationMultiplier(computeRollSlopeAmount(slopeNormal), 1) > 1,
    "downhill input slightly improves roll acceleration",
  );
  assert(
    computeRollSlopeInputAccelerationMultiplier(computeRollSlopeAmount(slopeNormal), -1) < 1,
    "uphill input slightly dampens roll acceleration",
  );

  const underwaterPlayer = makePlayer();
  const underwaterRuntime = createPlayerSimulationRuntime();
  const deepWater: WaterState = {
    kind: "pool",
    surfaceY: 10,
    depth: 5,
    flowDirection: new Vector2(1, 0),
    flowStrength: 0,
    swimAllowed: true,
  };
  underwaterPlayer.position.set(0, deepWater.surfaceY - 0.9, 0);
  underwaterPlayer.velocity.set(SWIM_UNDERWATER_SPEED + 7, 0, 0);
  underwaterPlayer.swimming = true;
  underwaterPlayer.waterMode = "underwater";
  underwaterPlayer.waterDepth = deepWater.depth;
  underwaterPlayer.waterSurfaceY = deepWater.surfaceY;
  assert(wantsUnderwaterDive(underwaterPlayer, deepWater, true), "Q requests an underwater dive in deep swim water");
  applySwimForces(underwaterPlayer, deepWater, true, 1 / 60);
  clampSwimVelocity(underwaterPlayer, false, true, 1 / 60);
  assert(underwaterPlayer.velocity.y < 0, "holding Q while swimming applies downward dive force");
  assert(planarSpeed(underwaterPlayer) <= SWIM_UNDERWATER_SPEED + 1.81, "underwater swimming uses a slower speed cap");
  updateStaminaAndAbilityState(underwaterPlayer, 1, underwaterRuntime, false);
  assert(underwaterPlayer.stamina < underwaterPlayer.staminaMax, "underwater swimming drains stamina while submerged");

  const enteringSwimPlayer = makePlayer();
  const entryRuntime = createPlayerSimulationRuntime();
  enteringSwimPlayer.position.set(0, deepWater.surfaceY - deepWater.depth + 2.2, 0);
  enteringSwimPlayer.velocity.set(SWIM_ENTRY_SPEED_CARRY_BONUS + SWIM_UNDERWATER_SPEED, -7.5, 0);
  resolveWaterContact(enteringSwimPlayer, deepWater.surfaceY - deepWater.depth, deepWater, true, 7.5, entryRuntime);
  assert(enteringSwimPlayer.swimming, "deep water contact starts swimming");
  assert(
    entryRuntime.swimEntryMomentumGraceRemaining === SWIM_ENTRY_MOMENTUM_GRACE_TIME,
    "deep water entry starts a short swim momentum grace",
  );
  clampSwimVelocity(enteringSwimPlayer, false, false, 1 / 60, entryRuntime);
  assert(
    planarSpeed(enteringSwimPlayer) > SWIM_UNDERWATER_SPEED + 1.8,
    "swim entry carries a little planar speed instead of instantly clamping to swim pace",
  );
  assert(
    enteringSwimPlayer.position.y > deepWater.surfaceY - 1,
    "entering deep water lifts Mossu toward the swim surface",
  );
  assert(enteringSwimPlayer.velocity.y > -6, "entering deep water softens downward velocity");

  // Surface-aware traction: design intent encoded in the SURFACE_TRACTION table.
  assert(
    SURFACE_TRACTION.rock.accelMultiplier > SURFACE_TRACTION.highland_grass.accelMultiplier,
    "rock surfaces grip harder than highland grass on the accel push",
  );
  assert(
    SURFACE_TRACTION.shrine_moss.rollCoastMultiplier < SURFACE_TRACTION.meadow_grass.rollCoastMultiplier,
    "shrine moss lets a coasting roll glide further than meadow grass",
  );
  assert(
    SURFACE_TRACTION.sand.decelMultiplier < SURFACE_TRACTION.meadow_grass.decelMultiplier,
    "sand brakes softer than meadow grass — releasing input slides further",
  );
  assert(
    SURFACE_TRACTION.forest_floor.turnMultiplier > SURFACE_TRACTION.highland_grass.turnMultiplier,
    "forest floor turns tighter than loose highland grass",
  );
  // lookupSurfaceTraction reads the world at any position and returns one of the table entries.
  // We verify it returns SOMETHING from the table (not the literal NEUTRAL fallback by accident),
  // by checking traction at a few spread-out positions.
  const tractionSamples = [
    lookupSurfaceTraction(0, 0),
    lookupSurfaceTraction(120, 60),
    lookupSurfaceTraction(-80, 180),
    lookupSurfaceTraction(20, 220),
  ];
  const tableEntries = Object.values(SURFACE_TRACTION);
  for (const t of tractionSamples) {
    assert(
      tableEntries.includes(t as (typeof tableEntries)[number]),
      "lookupSurfaceTraction returns a table entry for any sampled world position",
    );
  }

  // Variable jump height. Two coupled mechanics share one charge window:
  //   - Hold-to-charge thrust grows vy during ascent (taller arc the longer you hold).
  //   - Release inside the charge window cuts vy (taps become short hops).
  // We integrate height (Σ dt·vy) since position.y is clamped by ground resolution outside
  // applyMovementPhysics.
  function simulateJumpArc(holdFrames: number) {
    const player = makePlayer();
    const runtime = createPlayerSimulationRuntime();
    const scratch = createMovementScratch();
    let height = 0;
    let peakHeight = 0;
    let peakVy = -Infinity;
    let postReleaseVy = NaN;
    for (let i = 0; i < 60; i += 1) {
      const dt = 1 / 60;
      const held = i < holdFrames;
      const inp = { ...baseInput, jumpHeld: held, jumpPressed: i === 0 };
      tickMovementTimers(player, inp, dt, runtime);
      applyMovementPhysics(player, save, inp, 0, dt, runtime, scratch);
      if (!player.grounded) {
        height += dt * player.velocity.y;
        peakVy = Math.max(peakVy, player.velocity.y);
      }
      peakHeight = Math.max(peakHeight, height);
      if (i === holdFrames) postReleaseVy = player.velocity.y;
    }
    return { peakHeight, peakVy, postReleaseVy };
  }

  const heldArc = simulateJumpArc(60); // hold past the charge window — thrust runs to natural end
  const tapArc = simulateJumpArc(2); // release on frame 2 — inside charge window, cut fires

  // Charge thrust (JUMP_HOLD_THRUST > GRAVITY) means peak vy during a held jump exceeds the
  // initial JUMP_VELOCITY. Without thrust, peak vy would equal JUMP_VELOCITY (no way to grow).
  assert(
    heldArc.peakVy > JUMP_VELOCITY,
    `held jump grows vy past initial JUMP_VELOCITY (proves charge thrust active): peakVy=${heldArc.peakVy.toFixed(2)} vs JUMP_VELOCITY=${JUMP_VELOCITY}`,
  );
  // The charged arc must clear what a no-thrust ballistic jump could reach
  // (JUMP_VELOCITY²/(2·GRAVITY) ≈ 7.9m at the current tuning).
  assert(
    heldArc.peakHeight > 12,
    `charged hold reaches significantly higher than a ballistic jump's ~7.9m peak: held=${heldArc.peakHeight.toFixed(2)}`,
  );
  // Tap inside the charge window cuts vy, then gravity drops it further on the same tick.
  // We just check the cut clamped vy below the no-cut natural trajectory.
  assert(
    tapArc.postReleaseVy < JUMP_VELOCITY * (JUMP_RELEASE_CUT_MULTIPLIER + 0.2),
    `releasing during the charge window cuts vy: post=${tapArc.postReleaseVy.toFixed(2)}`,
  );
  assert(
    heldArc.peakHeight > tapArc.peakHeight * 4,
    `holding to charge reaches a much higher arc than a tap: held=${heldArc.peakHeight.toFixed(2)} tap=${tapArc.peakHeight.toFixed(2)}`,
  );

  // Cut only fires inside the charge window — re-pressing after the window expired should
  // not re-trigger cut on a subsequent release.
  const repeatCutPlayer = makePlayer();
  const repeatCutRuntime = createPlayerSimulationRuntime();
  const repeatCutScratch = createMovementScratch();
  // Frames 0-1: jump and hold briefly. Frame 2: release → cut fires inside window.
  for (let i = 0; i < 4; i += 1) {
    const dt = 1 / 60;
    const inp = { ...baseInput, jumpHeld: i < 2, jumpPressed: i === 0 };
    tickMovementTimers(repeatCutPlayer, inp, dt, repeatCutRuntime);
    applyMovementPhysics(repeatCutPlayer, save, inp, 0, dt, repeatCutRuntime, repeatCutScratch);
  }
  const vyAfterFirstCut = repeatCutPlayer.velocity.y;
  // Now re-press and re-release mid-air. Window has been zeroed by the cut, so this should
  // be ineligible for a second cut and only natural gravity applies.
  for (let i = 0; i < 2; i += 1) {
    const dt = 1 / 60;
    const inp = { ...baseInput, jumpHeld: i < 1, jumpPressed: false };
    tickMovementTimers(repeatCutPlayer, inp, dt, repeatCutRuntime);
    applyMovementPhysics(repeatCutPlayer, save, inp, 0, dt, repeatCutRuntime, repeatCutScratch);
  }
  // Two frames of GRAVITY=38 at dt=1/60 ≈ 1.27 m/s drop. Anything more would mean a second cut.
  assert(
    repeatCutPlayer.velocity.y >= vyAfterFirstCut - 2,
    `mid-air re-press-and-release does not re-cut velocity: before=${vyAfterFirstCut.toFixed(2)} after=${repeatCutPlayer.velocity.y.toFixed(2)}`,
  );
}
