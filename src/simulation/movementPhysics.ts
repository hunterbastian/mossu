import { MathUtils, Vector3 } from "three";
import type { InputSnapshot } from "./input";
import type { PlayerState, SaveState } from "./gameState";
import type { PlayerSimulationRuntime } from "./playerSimulationRuntime";
import { sampleTerrainNormalInto } from "./world";
import {
  AIR_ACCELERATION,
  AIR_DECELERATION,
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
  JUMP_BUFFER_TIME,
  JUMP_VELOCITY,
  ROLL_BOOST_DELAY,
  ROLL_BOOST_MULTIPLIER,
  ROLL_ACCELERATION_MULTIPLIER,
  ROLL_AIR_SPEED_BONUS,
  ROLL_COAST_DECELERATION,
  ROLL_GRAVITY_FULL_SLOPE,
  ROLL_GRAVITY_MIN_SLOPE,
  ROLL_JUMP_FORWARD_BONUS,
  ROLL_MODE_INDICATOR_DELAY,
  ROLL_SLOPE_ACCELERATION,
  ROLL_SLOPE_SPEED_BONUS,
  ROLL_SPEED,
  ROLL_TURN_ACCELERATION,
  STAMINA_ACTION_THRESHOLD,
  SWIM_ACCELERATION,
  SWIM_DECELERATION,
  SWIM_SPEED,
  WALK_SPEED,
} from "./playerSimulationConstants";

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

export function tickMovementTimers(
  player: PlayerState,
  input: InputSnapshot,
  dt: number,
  runtime: PlayerSimulationRuntime,
) {
  runtime.jumpBufferRemaining = input.jumpPressed
    ? JUMP_BUFFER_TIME
    : Math.max(0, runtime.jumpBufferRemaining - dt);
  runtime.breezeFloatBufferRemaining = input.abilityPressed || input.abilityHeld
    ? BREEZE_FLOAT_BUFFER_TIME
    : Math.max(0, runtime.breezeFloatBufferRemaining - dt);
  runtime.coyoteTimeRemaining = player.grounded && !player.swimming
    ? COYOTE_TIME
    : Math.max(0, runtime.coyoteTimeRemaining - dt);
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
  const terrainSlope = computeRollSlopeAmount(scratch.groundNormal);
  const rollingPlanarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  const rollGravityActive = player.rolling && player.grounded && terrainSlope > ROLL_GRAVITY_MIN_SLOPE;
  const sustainedRolling =
    !player.swimming
    && player.rolling
    && player.grounded
    && (scratch.worldMove.lengthSq() > 0.001 || rollGravityActive || rollingPlanarSpeed > 2);
  if (sustainedRolling) {
    runtime.rollingChargeSeconds += dt;
  } else {
    runtime.rollingChargeSeconds = 0;
  }
  player.rollingBoostActive = runtime.rollingChargeSeconds >= ROLL_BOOST_DELAY;

  const groundSpeed = player.rolling
    ? ROLL_SPEED * (player.rollingBoostActive ? ROLL_BOOST_MULTIPLIER : 1)
    : WALK_SPEED;
  const rollSpeedLimit = player.rolling
    ? groundSpeed + terrainSlope * ROLL_SLOPE_SPEED_BONUS
    : groundSpeed;
  const airSpeedLimit = player.rolling ? AIR_SPEED + ROLL_AIR_SPEED_BONUS : AIR_SPEED;

  scratch.planarVelocity.set(player.velocity.x, 0, player.velocity.z);
  scratch.desiredPlanarVelocity
    .copy(scratch.worldMove)
    .multiplyScalar(player.swimming ? SWIM_SPEED : player.grounded ? groundSpeed : AIR_SPEED);

  const hasMoveInput = scratch.worldMove.lengthSq() > 0.001;
  let alignment = 1;
  if (hasMoveInput && scratch.planarVelocity.lengthSq() > 0.001) {
    const desiredDirection = scratch.cameraForward.copy(scratch.worldMove).normalize();
    alignment = scratch.planarDirection
      .copy(scratch.planarVelocity)
      .normalize()
      .dot(desiredDirection);
  }

  const acceleration = player.swimming
    ? SWIM_ACCELERATION
    : player.grounded
      ? player.rolling
        ? alignment < 0 ? ROLL_TURN_ACCELERATION : GROUND_ACCELERATION * ROLL_ACCELERATION_MULTIPLIER
        : alignment < 0 ? GROUND_TURN_ACCELERATION : GROUND_ACCELERATION
      : AIR_ACCELERATION;
  const deceleration = player.swimming
    ? SWIM_DECELERATION
    : player.grounded
      ? player.rolling ? ROLL_COAST_DECELERATION : GROUND_DECELERATION
      : AIR_DECELERATION;

  scratch.planarVelocity.x = moveTowards(
    scratch.planarVelocity.x,
    hasMoveInput ? scratch.desiredPlanarVelocity.x : 0,
    (hasMoveInput ? acceleration : deceleration) * dt,
  );
  scratch.planarVelocity.z = moveTowards(
    scratch.planarVelocity.z,
    hasMoveInput ? scratch.desiredPlanarVelocity.z : 0,
    (hasMoveInput ? acceleration : deceleration) * dt,
  );

  if (rollGravityActive && computeDownhillRollVector(scratch.groundNormal, scratch.slopeVector)) {
    scratch.planarVelocity.addScaledVector(
      scratch.slopeVector,
      computeRollGravityStrength(scratch.groundNormal) * dt,
    );
  }

  if (player.grounded && !player.swimming && scratch.planarVelocity.lengthSq() > 0.0001) {
    scratch.planarVelocity.projectOnPlane(scratch.groundNormal).setLength(
      Math.min(scratch.planarVelocity.length(), rollSpeedLimit),
    );
  } else if (player.swimming && scratch.planarVelocity.lengthSq() > 0.0001) {
    scratch.planarVelocity.setLength(Math.min(scratch.planarVelocity.length(), SWIM_SPEED + 2));
  } else if (scratch.planarVelocity.lengthSq() > 0.0001) {
    scratch.planarVelocity.setLength(Math.min(scratch.planarVelocity.length(), airSpeedLimit + 2.5));
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
    runtime.coyoteTimeRemaining = 0;
    runtime.jumpBufferRemaining = 0;
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

  if (!player.swimming) {
    player.velocity.y -= GRAVITY * (isFloating ? FLOAT_GRAVITY_SCALE : 1) * dt;

    if (isFloating && horizontalSpeed > 0.15) {
      const boost = FLOAT_FORWARD_BONUS * dt;
      player.velocity.x += (player.velocity.x / horizontalSpeed) * boost;
      player.velocity.z += (player.velocity.z / horizontalSpeed) * boost;
    }
  }

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

export function computeRollGravityStrength(groundNormal: Vector3) {
  const slope = computeRollSlopeAmount(groundNormal);
  return ROLL_SLOPE_ACCELERATION * MathUtils.smoothstep(slope, ROLL_GRAVITY_MIN_SLOPE, ROLL_GRAVITY_FULL_SLOPE);
}

export function computeRollSlopeAmount(groundNormal: Vector3) {
  return MathUtils.clamp(Math.hypot(groundNormal.x, groundNormal.z), 0, 1);
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
