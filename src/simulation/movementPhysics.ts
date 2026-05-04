import { MathUtils, Vector3 } from "three";
import type { InputSnapshot } from "./input";
import type { PlayerState, SaveState } from "./gameState";
import type { PlayerSimulationRuntime } from "./playerSimulationRuntime";
import { sampleTerrainNormalInto, sampleWorldRegion } from "./world";
import {
  AIR_ACCELERATION,
  AIR_DECELERATION,
  AIR_MOMENTUM_DECELERATION_MULTIPLIER,
  AIR_MOMENTUM_GRACE_TIME,
  AIR_MOMENTUM_SPEED_LIMIT_BONUS,
  AIR_SPEED,
  BREEZE_FLOAT_BUFFER_TIME,
  BREEZE_FLOAT_MAX_UPWARD_VELOCITY,
  COYOTE_TIME,
  FLOAT_FORWARD_BONUS,
  FLOAT_GRAVITY_SCALE,
  GRAVITY,
  GROUND_ACCELERATION,
  GROUND_DECELERATION,
  GROUND_TURN_ACCELERATION,
  AIR_BOOST_IMPULSE,
  JUMP_BUFFER_TIME,
  JUMP_HOLD_MAX_DURATION,
  JUMP_HOLD_THRUST,
  JUMP_MIN_RELEASE_VELOCITY,
  JUMP_RELEASE_CUT_MULTIPLIER,
  JUMP_VELOCITY,
  LANDING_MOMENTUM_DECELERATION_MULTIPLIER,
  NEUTRAL_SURFACE_TRACTION,
  ROLL_BOOST_DELAY,
  ROLL_BOOST_MULTIPLIER,
  ROLL_ACCELERATION_MULTIPLIER,
  ROLL_AIR_SPEED_BONUS,
  ROLL_AIR_MOMENTUM_GRACE_TIME,
  ROLL_COAST_DECELERATION,
  ROLL_DOWNHILL_ACCELERATION_MULTIPLIER,
  ROLL_DOWNHILL_INPUT_SPEED_BONUS,
  ROLL_DRIFT_MAX_SPEED_LOSS,
  ROLL_DRIFT_SPEED_RETENTION,
  ROLL_DRIFT_STEERING,
  ROLL_GRAVITY_FULL_SLOPE,
  ROLL_GRAVITY_MIN_SLOPE,
  ROLL_LANDING_SPEED_CARRY_BONUS,
  ROLL_JUMP_FORWARD_BONUS,
  ROLL_MODE_INDICATOR_DELAY,
  ROLL_REVERSE_DRIFT_STEERING,
  ROLL_REVERSE_DRIFT_MAX_SPEED_LOSS,
  ROLL_SLOPE_ACCELERATION,
  ROLL_SLOPE_SPEED_BONUS,
  ROLL_SPEED,
  ROLL_START_IMPULSE,
  ROLL_TURN_ACCELERATION,
  ROLL_UPHILL_ACCELERATION_MULTIPLIER,
  ROLL_UPHILL_INPUT_SPEED_PENALTY,
  LANDING_SPEED_CARRY_BONUS,
  STAMINA_ACTION_THRESHOLD,
  SURFACE_TRACTION,
  SWIM_ACCELERATION,
  SWIM_DECELERATION,
  SWIM_MIN_DEPTH,
  SWIM_SPEED,
  SWIM_UNDERWATER_SPEED,
  WALK_SPEED,
  type SurfaceTraction,
} from "./playerSimulationConstants";

export function lookupSurfaceTraction(x: number, z: number): SurfaceTraction {
  const region = sampleWorldRegion(x, z);
  return SURFACE_TRACTION[region.material] ?? NEUTRAL_SURFACE_TRACTION;
}

export interface MovementScratch {
  moveVector: Vector3;
  worldMove: Vector3;
  desiredPlanarVelocity: Vector3;
  planarVelocity: Vector3;
  planarDirection: Vector3;
  cameraForward: Vector3;
  cameraRight: Vector3;
  groundNormal: Vector3;
  slopeVector: Vector3;
}

export interface MovementPhysicsResult {
  sustainedRolling: boolean;
  isFloating: boolean;
  horizontalSpeed: number;
}

export function createMovementScratch(): MovementScratch {
  return {
    moveVector: new Vector3(),
    worldMove: new Vector3(),
    desiredPlanarVelocity: new Vector3(),
    planarVelocity: new Vector3(),
    planarDirection: new Vector3(),
    cameraForward: new Vector3(),
    cameraRight: new Vector3(),
    groundNormal: new Vector3(),
    slopeVector: new Vector3(),
  };
}

const INPUT_RISE_DAMPING = 9.6;
const INPUT_RELEASE_DAMPING = 13.2;
const INPUT_DEADZONE = 0.015;
const WADE_SPEED_MIN_MULTIPLIER = 0.72;
const WADE_ACCELERATION_MULTIPLIER = 0.82;

export function tickMovementTimers(
  player: PlayerState,
  input: InputSnapshot,
  dt: number,
  runtime: PlayerSimulationRuntime,
) {
  runtime.jumpBufferRemaining = input.jumpPressed ? JUMP_BUFFER_TIME : Math.max(0, runtime.jumpBufferRemaining - dt);
  runtime.breezeFloatBufferRemaining =
    input.abilityPressed || input.abilityHeld
      ? BREEZE_FLOAT_BUFFER_TIME
      : Math.max(0, runtime.breezeFloatBufferRemaining - dt);
  runtime.coyoteTimeRemaining =
    player.grounded && !player.swimming ? COYOTE_TIME : Math.max(0, runtime.coyoteTimeRemaining - dt);
  runtime.airMomentumGraceRemaining = Math.max(0, runtime.airMomentumGraceRemaining - dt);
  if (runtime.airMomentumGraceRemaining <= 0) {
    runtime.airMomentumSpeedLimitBonus = 0;
  }
  runtime.landingMomentumGraceRemaining = Math.max(0, runtime.landingMomentumGraceRemaining - dt);
}

export function applyMovementPhysics(
  player: PlayerState,
  save: SaveState,
  input: InputSnapshot,
  cameraYaw: number,
  dt: number,
  runtime: PlayerSimulationRuntime,
  scratch: MovementScratch,
): MovementPhysicsResult {
  scratch.moveVector.set(input.moveX, 0, input.moveY);
  if (scratch.moveVector.lengthSq() > 1) {
    scratch.moveVector.normalize();
  }

  const hasRawInput = scratch.moveVector.lengthSq() > 0.0001;
  const inputDamping = hasRawInput ? INPUT_RISE_DAMPING : INPUT_RELEASE_DAMPING;
  runtime.smoothedMoveX = MathUtils.damp(runtime.smoothedMoveX, scratch.moveVector.x, inputDamping, dt);
  runtime.smoothedMoveY = MathUtils.damp(runtime.smoothedMoveY, scratch.moveVector.z, inputDamping, dt);
  if (!hasRawInput && Math.hypot(runtime.smoothedMoveX, runtime.smoothedMoveY) < INPUT_DEADZONE) {
    runtime.smoothedMoveX = 0;
    runtime.smoothedMoveY = 0;
  }

  scratch.moveVector.set(runtime.smoothedMoveX, 0, runtime.smoothedMoveY);
  if (scratch.moveVector.lengthSq() > 1) {
    scratch.moveVector.normalize();
  }
  sampleTerrainNormalInto(scratch.groundNormal, player.position.x, player.position.z);
  // Surface traction is only meaningful while grounded — air/swim paths bypass these multipliers.
  const surface =
    player.grounded && !player.swimming
      ? lookupSurfaceTraction(player.position.x, player.position.z)
      : NEUTRAL_SURFACE_TRACTION;

  if (scratch.moveVector.lengthSq() > 0.0001) {
    const inputMagnitude = MathUtils.clamp(scratch.moveVector.length(), 0, 1);
    scratch.moveVector.normalize();
    scratch.cameraForward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw)).normalize();
    scratch.cameraRight.set(-scratch.cameraForward.z, 0, scratch.cameraForward.x).normalize();
    scratch.worldMove
      .copy(scratch.cameraRight)
      .multiplyScalar(scratch.moveVector.x)
      .addScaledVector(scratch.cameraForward, scratch.moveVector.z)
      .normalize();

    if (player.grounded && !player.swimming) {
      scratch.worldMove.projectOnPlane(scratch.groundNormal);
      if (scratch.worldMove.lengthSq() > 0.0001) {
        scratch.worldMove.normalize();
      }
    }
    scratch.worldMove.multiplyScalar(inputMagnitude);
  } else {
    scratch.worldMove.setScalar(0);
  }

  player.rolling = input.rollHeld && !player.swimming;
  runtime.rollModeHoldSeconds = player.rolling ? runtime.rollModeHoldSeconds + dt : 0;
  player.rollHoldSeconds = runtime.rollModeHoldSeconds;
  player.rollModeReady = player.rollHoldSeconds >= ROLL_MODE_INDICATOR_DELAY;
  const justStartedRolling = player.rolling && player.grounded && runtime.rollModeHoldSeconds <= dt + 0.0001;
  const terrainSlope = computeRollSlopeAmount(scratch.groundNormal);
  const hasDownhillVector = computeDownhillRollVector(scratch.groundNormal, scratch.slopeVector);
  const rollSlopeInputAlignment =
    player.rolling && scratch.worldMove.lengthSq() > 0.001 && hasDownhillVector
      ? MathUtils.clamp(scratch.planarDirection.copy(scratch.worldMove).normalize().dot(scratch.slopeVector), -1, 1)
      : 0;
  const rollingPlanarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const rollGravityActive = player.rolling && player.grounded && terrainSlope > ROLL_GRAVITY_MIN_SLOPE;
  const sustainedRolling =
    !player.swimming &&
    player.rolling &&
    player.grounded &&
    (scratch.worldMove.lengthSq() > 0.001 || rollGravityActive || rollingPlanarSpeed > 2);
  if (sustainedRolling) {
    runtime.rollingChargeSeconds += dt;
  } else {
    runtime.rollingChargeSeconds = 0;
  }
  player.rollingBoostActive = runtime.rollingChargeSeconds >= ROLL_BOOST_DELAY;

  const wadeAmount =
    player.waterMode === "wading" ? MathUtils.clamp(player.waterDepth / Math.max(0.001, SWIM_MIN_DEPTH), 0, 1) : 0;
  const wadeSpeedMultiplier = MathUtils.lerp(1, WADE_SPEED_MIN_MULTIPLIER, wadeAmount);
  const rollSlopeInputSpeed = computeRollSlopeInputSpeedAdjustment(
    scratch.groundNormal,
    scratch.worldMove,
    scratch.planarDirection,
  );
  const landingCarryActive = player.grounded && runtime.landingMomentumGraceRemaining > 0;
  const airMomentumCarryActive = !player.grounded && !player.swimming && runtime.airMomentumGraceRemaining > 0;
  const landingSpeedCarryBonus = landingCarryActive
    ? player.rolling
      ? ROLL_LANDING_SPEED_CARRY_BONUS
      : LANDING_SPEED_CARRY_BONUS
    : 0;
  const groundSpeed =
    (player.rolling
      ? Math.max(
          ROLL_SPEED * 0.72,
          ROLL_SPEED * (player.rollingBoostActive ? ROLL_BOOST_MULTIPLIER : 1) + rollSlopeInputSpeed,
        )
      : WALK_SPEED) * wadeSpeedMultiplier;
  const passiveSlopeLimitBonus = terrainSlope * ROLL_SLOPE_SPEED_BONUS * (rollSlopeInputAlignment < -0.1 ? 0.55 : 1);
  const rollSpeedLimit = player.rolling
    ? groundSpeed + passiveSlopeLimitBonus + landingSpeedCarryBonus
    : groundSpeed + landingSpeedCarryBonus;
  const airSpeedLimit = player.rolling ? AIR_SPEED + ROLL_AIR_SPEED_BONUS : AIR_SPEED;
  const airborneMomentumSpeedBonus = airMomentumCarryActive ? runtime.airMomentumSpeedLimitBonus : 0;
  const swimSpeed = player.waterMode === "underwater" ? SWIM_UNDERWATER_SPEED : SWIM_SPEED;

  scratch.planarVelocity.set(player.velocity.x, 0, player.velocity.z);
  scratch.desiredPlanarVelocity
    .copy(scratch.worldMove)
    .multiplyScalar(player.swimming ? swimSpeed : player.grounded ? groundSpeed : AIR_SPEED);
  if (
    airMomentumCarryActive &&
    !hasRawInput &&
    scratch.desiredPlanarVelocity.lengthSq() > 0.0001 &&
    scratch.planarVelocity.lengthSq() > scratch.desiredPlanarVelocity.lengthSq()
  ) {
    scratch.desiredPlanarVelocity.setLength(scratch.planarVelocity.length());
  }

  const hasMoveInput = scratch.worldMove.lengthSq() > 0.001;
  let alignment = 1;
  if (hasMoveInput && scratch.planarVelocity.lengthSq() > 0.001) {
    const desiredDirection = scratch.cameraForward.copy(scratch.worldMove).normalize();
    alignment = scratch.planarDirection.copy(scratch.planarVelocity).normalize().dot(desiredDirection);
  }
  const rollDriftMinimumSpeed =
    player.rolling && player.grounded && hasMoveInput && rollingPlanarSpeed > 2
      ? Math.min(
          rollSpeedLimit,
          rollingPlanarSpeed - (alignment < -0.15 ? ROLL_REVERSE_DRIFT_MAX_SPEED_LOSS : ROLL_DRIFT_MAX_SPEED_LOSS) * dt,
        )
      : 0;

  if (player.rolling && player.grounded && hasMoveInput && scratch.planarVelocity.lengthSq() > 0.25) {
    const currentSpeed = scratch.planarVelocity.length();
    const targetSpeed = Math.max(scratch.desiredPlanarVelocity.length(), currentSpeed * ROLL_DRIFT_SPEED_RETENTION);
    const driftSteering = alignment < -0.15 ? ROLL_REVERSE_DRIFT_STEERING : ROLL_DRIFT_STEERING;
    scratch.planarDirection.copy(scratch.planarVelocity).normalize();
    scratch.cameraForward.copy(scratch.worldMove).normalize();
    scratch.planarDirection.lerp(scratch.cameraForward, driftSteering).normalize();
    scratch.desiredPlanarVelocity.copy(scratch.planarDirection).multiplyScalar(targetSpeed);
  }

  const acceleration = player.swimming
    ? SWIM_ACCELERATION
    : player.grounded
      ? player.rolling
        ? (alignment < 0.35
            ? ROLL_TURN_ACCELERATION * surface.turnMultiplier
            : GROUND_ACCELERATION * ROLL_ACCELERATION_MULTIPLIER * surface.accelMultiplier) *
          computeRollSlopeInputAccelerationMultiplier(terrainSlope, rollSlopeInputAlignment) *
          MathUtils.lerp(1, WADE_ACCELERATION_MULTIPLIER, wadeAmount)
        : (alignment < 0
            ? GROUND_TURN_ACCELERATION * surface.turnMultiplier
            : GROUND_ACCELERATION * surface.accelMultiplier) *
          MathUtils.lerp(1, WADE_ACCELERATION_MULTIPLIER, wadeAmount)
      : AIR_ACCELERATION;
  const deceleration = player.swimming
    ? SWIM_DECELERATION
    : player.grounded
      ? player.rolling
        ? ROLL_COAST_DECELERATION * surface.rollCoastMultiplier
        : GROUND_DECELERATION * surface.decelMultiplier
      : applyAirMomentumDeceleration(AIR_DECELERATION, airMomentumCarryActive);

  scratch.planarVelocity.x = moveTowards(
    scratch.planarVelocity.x,
    hasMoveInput ? scratch.desiredPlanarVelocity.x : 0,
    (hasMoveInput ? acceleration : applyLandingMomentumDeceleration(deceleration, landingCarryActive)) * dt,
  );
  scratch.planarVelocity.z = moveTowards(
    scratch.planarVelocity.z,
    hasMoveInput ? scratch.desiredPlanarVelocity.z : 0,
    (hasMoveInput ? acceleration : applyLandingMomentumDeceleration(deceleration, landingCarryActive)) * dt,
  );

  if (justStartedRolling && hasMoveInput) {
    scratch.planarDirection.copy(scratch.worldMove).normalize();
    const impulseScale = 1 - MathUtils.clamp(scratch.planarVelocity.length() / Math.max(0.001, ROLL_SPEED), 0, 1);
    scratch.planarVelocity.addScaledVector(scratch.planarDirection, ROLL_START_IMPULSE * impulseScale);
  }

  if (rollGravityActive && hasDownhillVector) {
    scratch.planarVelocity.addScaledVector(scratch.slopeVector, computeRollGravityStrength(scratch.groundNormal) * dt);
  }

  if (
    rollDriftMinimumSpeed > 0 &&
    scratch.planarVelocity.lengthSq() > 0.0001 &&
    scratch.planarVelocity.length() < rollDriftMinimumSpeed
  ) {
    scratch.planarVelocity.setLength(rollDriftMinimumSpeed);
  }

  if (player.grounded && !player.swimming && scratch.planarVelocity.lengthSq() > 0.0001) {
    const speedBeforeGroundProjection = scratch.planarVelocity.length();
    scratch.planarVelocity.projectOnPlane(scratch.groundNormal).setY(0);
    if (scratch.planarVelocity.lengthSq() > 0.0001) {
      const projectionRetention = landingCarryActive ? 1 : player.rolling ? 0.86 : 0;
      const retainedProjectionSpeed = speedBeforeGroundProjection * projectionRetention;
      const projectedSpeed = Math.max(scratch.planarVelocity.length(), retainedProjectionSpeed);
      scratch.planarVelocity.setLength(Math.min(projectedSpeed, rollSpeedLimit));
    }
  } else if (player.swimming && scratch.planarVelocity.lengthSq() > 0.0001) {
    scratch.planarVelocity.setLength(Math.min(scratch.planarVelocity.length(), swimSpeed + 2));
  } else if (scratch.planarVelocity.lengthSq() > 0.0001) {
    scratch.planarVelocity.setLength(
      Math.min(scratch.planarVelocity.length(), airSpeedLimit + airborneMomentumSpeedBonus + 2.5),
    );
  }

  player.velocity.x = scratch.planarVelocity.x;
  player.velocity.z = scratch.planarVelocity.z;

  const canJump = !player.swimming && (player.grounded || runtime.coyoteTimeRemaining > 0);
  if (canJump && runtime.jumpBufferRemaining > 0) {
    if (player.rolling && scratch.planarVelocity.lengthSq() > 0.001) {
      scratch.planarDirection.copy(scratch.planarVelocity).normalize();
      player.velocity.x += scratch.planarDirection.x * ROLL_JUMP_FORWARD_BONUS;
      player.velocity.z += scratch.planarDirection.z * ROLL_JUMP_FORWARD_BONUS;
    }
    player.velocity.y = JUMP_VELOCITY;
    player.grounded = false;
    runtime.airMomentumGraceRemaining = player.rolling ? ROLL_AIR_MOMENTUM_GRACE_TIME : AIR_MOMENTUM_GRACE_TIME;
    runtime.airMomentumSpeedLimitBonus = player.rolling ? ROLL_AIR_SPEED_BONUS : AIR_MOMENTUM_SPEED_LIMIT_BONUS;
    runtime.coyoteTimeRemaining = 0;
    runtime.jumpBufferRemaining = 0;
    runtime.jumpHoldThrustRemaining = JUMP_HOLD_MAX_DURATION;
  }

  const canFloat = save.unlockedAbilities.has("breeze_float");
  const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const wantsFloatInput = input.jumpHeld || input.abilityHeld || runtime.breezeFloatBufferRemaining > 0;
  const wantsFloat =
    canFloat &&
    !player.grounded &&
    !player.swimming &&
    wantsFloatInput &&
    player.velocity.y < BREEZE_FLOAT_MAX_UPWARD_VELOCITY;
  const isFloating = wantsFloat && player.stamina > STAMINA_ACTION_THRESHOLD;
  player.floating = isFloating;

  // Variable jump height has two coupled mechanics gated by the same charge window:
  //   1. Hold-to-charge thrust: while jump is still held and we're still inside the charge
  //      window AND vy is still positive AND not floating, apply upward thrust each frame.
  //      Net effect (with default tuning): vy slowly grows during the window for a taller arc.
  //   2. Release-cut: releasing jump WHILE still inside the charge window cuts upward velocity.
  //      Releasing AFTER the window has expired leaves the charged arc alone — long holds
  //      are not punished, only mid-window bails.
  // Floating supersedes thrust because the float ability does its own gravity scaling.
  const jumpJustReleased = runtime.jumpHeldPrevFrame && !input.jumpHeld;
  const inChargeWindow = runtime.jumpHoldThrustRemaining > 0;
  if (
    inChargeWindow &&
    input.jumpHeld &&
    !player.grounded &&
    !player.swimming &&
    !isFloating &&
    player.velocity.y > 0
  ) {
    player.velocity.y += JUMP_HOLD_THRUST * dt;
    runtime.jumpHoldThrustRemaining = Math.max(0, runtime.jumpHoldThrustRemaining - dt);
  } else if (
    jumpJustReleased &&
    inChargeWindow &&
    !player.grounded &&
    !player.swimming &&
    !isFloating &&
    player.velocity.y > JUMP_MIN_RELEASE_VELOCITY
  ) {
    player.velocity.y *= JUMP_RELEASE_CUT_MULTIPLIER;
    runtime.jumpHoldThrustRemaining = 0;
  } else if (player.grounded) {
    runtime.jumpHoldThrustRemaining = 0;
  }
  runtime.jumpHeldPrevFrame = input.jumpHeld;

  if (!player.swimming) {
    player.velocity.y -= GRAVITY * (isFloating ? FLOAT_GRAVITY_SCALE : 1) * dt;

    if (isFloating && horizontalSpeed > 0.15) {
      const boost = FLOAT_FORWARD_BONUS * dt;
      player.velocity.x += (player.velocity.x / horizontalSpeed) * boost;
      player.velocity.z += (player.velocity.z / horizontalSpeed) * boost;
    }
  }

  // Air-boost: one-shot planar impulse on the first Shift press while airborne.
  // Direction: current planar motion if any, else player heading. Resets on grounded
  // or swimming so each new jump/fall gets its own boost. Disabled while jump-buffered
  // (so a press that triggers the jump on the same frame doesn't double-fire).
  const rollJustPressed = !runtime.rollHeldPrevFrame && input.rollHeld;
  if (
    rollJustPressed &&
    !player.grounded &&
    !player.swimming &&
    runtime.airBoostAvailable &&
    runtime.coyoteTimeRemaining <= 0
  ) {
    const planarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    let dirX: number;
    let dirZ: number;
    if (planarSpeed > 0.5) {
      dirX = player.velocity.x / planarSpeed;
      dirZ = player.velocity.z / planarSpeed;
    } else {
      dirX = Math.sin(player.heading);
      dirZ = Math.cos(player.heading);
    }
    player.velocity.x += dirX * AIR_BOOST_IMPULSE;
    player.velocity.z += dirZ * AIR_BOOST_IMPULSE;
    runtime.airBoostAvailable = false;
  }
  if (player.grounded || player.swimming) {
    runtime.airBoostAvailable = true;
  }
  runtime.rollHeldPrevFrame = input.rollHeld;

  return {
    sustainedRolling,
    isFloating,
    horizontalSpeed,
  };
}

function moveTowards(current: number, target: number, maxDelta: number) {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

function applyLandingMomentumDeceleration(deceleration: number, landingCarryActive: boolean) {
  return landingCarryActive ? deceleration * LANDING_MOMENTUM_DECELERATION_MULTIPLIER : deceleration;
}

function applyAirMomentumDeceleration(deceleration: number, airMomentumCarryActive: boolean) {
  return airMomentumCarryActive ? deceleration * AIR_MOMENTUM_DECELERATION_MULTIPLIER : deceleration;
}

export function computeRollGravityStrength(groundNormal: Vector3) {
  const slope = computeRollSlopeAmount(groundNormal);
  return ROLL_SLOPE_ACCELERATION * MathUtils.smoothstep(slope, ROLL_GRAVITY_MIN_SLOPE, ROLL_GRAVITY_FULL_SLOPE);
}

export function computeRollSlopeAmount(groundNormal: Vector3) {
  return MathUtils.clamp(Math.hypot(groundNormal.x, groundNormal.z), 0, 1);
}

export function computeRollSlopeInputSpeedAdjustment(
  groundNormal: Vector3,
  moveDirection: Vector3,
  target = new Vector3(),
) {
  if (moveDirection.lengthSq() <= 0.0001 || !computeDownhillRollVector(groundNormal, target)) {
    return 0;
  }

  const slope = computeRollSlopeAmount(groundNormal);
  const alignment = MathUtils.clamp(target.dot(moveDirection) / moveDirection.length(), -1, 1);
  return (
    slope * (alignment >= 0 ? ROLL_DOWNHILL_INPUT_SPEED_BONUS * alignment : ROLL_UPHILL_INPUT_SPEED_PENALTY * alignment)
  );
}

export function computeRollSlopeInputAccelerationMultiplier(slope: number, downhillAlignment: number) {
  if (downhillAlignment >= 0) {
    return MathUtils.lerp(1, ROLL_DOWNHILL_ACCELERATION_MULTIPLIER, MathUtils.clamp(slope * downhillAlignment, 0, 1));
  }

  return MathUtils.lerp(1, ROLL_UPHILL_ACCELERATION_MULTIPLIER, MathUtils.clamp(slope * -downhillAlignment, 0, 1));
}

export function computeDownhillRollVector(groundNormal: Vector3, target = new Vector3()) {
  target.set(0, -1, 0).projectOnPlane(groundNormal).setY(0);
  if (target.lengthSq() <= 0.0001) {
    target.setScalar(0);
    return false;
  }

  target.normalize();
  return true;
}
