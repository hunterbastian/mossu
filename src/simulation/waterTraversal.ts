import { MathUtils, Vector3 } from "three";
import type { PlayerState } from "./gameState";
import type { PlayerSimulationRuntime } from "./playerSimulationRuntime";
import type { WaterState } from "./world";
import {
  COYOTE_TIME,
  PLAYER_RADIUS,
  SWIM_BUOYANCY,
  SWIM_CURRENT_SCALE,
  SWIM_DIVE_ACCELERATION,
  SWIM_DIVE_BUOYANCY,
  SWIM_FLOAT_HEIGHT,
  SWIM_GRAVITY,
  SWIM_SPEED,
  SWIM_STROKE_ACCELERATION,
  SWIM_UNDERWATER_MIN_DEPTH,
  SWIM_UNDERWATER_SPEED,
  STAMINA_ACTION_THRESHOLD,
} from "./playerSimulationConstants";
import { swimmingController } from "./swimmingController";

const swimPlanarVelocity = new Vector3();

export function applyWaterState(player: PlayerState, waterState: WaterState | null) {
  player.waterDepth = waterState?.depth ?? 0;
  player.waterSurfaceY = waterState?.surfaceY ?? player.position.y;
  syncPlayerWaterMode(player, waterState);
}

export function syncPlayerWaterMode(player: PlayerState, waterState: WaterState | null) {
  player.waterMode = swimmingController.classify(player, waterState);
}

export function shouldSwim(player: PlayerState, waterState: WaterState | null) {
  return swimmingController.shouldSwim(player, waterState);
}

export function wantsUnderwaterDive(player: PlayerState, waterState: WaterState, diveHeld: boolean) {
  return diveHeld && waterState.depth >= SWIM_UNDERWATER_MIN_DEPTH && player.stamina > STAMINA_ACTION_THRESHOLD;
}

export function applySwimForces(player: PlayerState, waterState: WaterState, diveHeld: boolean, dt: number) {
  const terrainY = waterState.surfaceY - waterState.depth;
  const canDive = wantsUnderwaterDive(player, waterState, diveHeld);
  const surfaceTargetY = waterState.surfaceY + SWIM_FLOAT_HEIGHT;
  const diveDepth = Math.min(4.6, Math.max(1.05, waterState.depth - PLAYER_RADIUS * 0.62));
  const diveTargetY = Math.max(terrainY + PLAYER_RADIUS * 0.56, waterState.surfaceY - diveDepth);
  const targetSwimY = canDive ? diveTargetY : surfaceTargetY;
  const buoyancy = canDive ? SWIM_DIVE_BUOYANCY : SWIM_BUOYANCY;

  player.velocity.y += (targetSwimY - player.position.y) * buoyancy * dt;
  player.velocity.y -= (canDive ? SWIM_GRAVITY * 0.18 : SWIM_GRAVITY) * dt;
  player.velocity.x += waterState.flowDirection.x * waterState.flowStrength * SWIM_CURRENT_SCALE * dt;
  player.velocity.z += waterState.flowDirection.y * waterState.flowStrength * SWIM_CURRENT_SCALE * dt;
}

export function clampSwimVelocity(player: PlayerState, jumpHeld: boolean, diveHeld: boolean, dt: number) {
  if (jumpHeld) {
    player.velocity.y += SWIM_STROKE_ACCELERATION * dt;
  }
  if (diveHeld) {
    player.velocity.y -= SWIM_DIVE_ACCELERATION * dt;
  }
  player.velocity.y = MathUtils.clamp(player.velocity.y, -9, 8.5);
  swimPlanarVelocity.set(player.velocity.x, 0, player.velocity.z);
  if (swimPlanarVelocity.lengthSq() > 0.0001) {
    const speedLimit = player.waterMode === "underwater" ? SWIM_UNDERWATER_SPEED + 1.8 : SWIM_SPEED + 2.8;
    swimPlanarVelocity.setLength(Math.min(swimPlanarVelocity.length(), speedLimit));
    player.velocity.x = swimPlanarVelocity.x;
    player.velocity.z = swimPlanarVelocity.z;
  }
}

export function resolveWaterContact(
  player: PlayerState,
  terrainHeight: number,
  waterState: WaterState | null,
  wasGrounded: boolean,
  downwardSpeedBeforeResolve: number,
  runtime: PlayerSimulationRuntime,
) {
  applyWaterState(player, waterState);

  if (shouldSwim(player, waterState)) {
    player.swimming = true;
    player.grounded = false;
    const minimumSwimY = terrainHeight + PLAYER_RADIUS * 0.5;
    if (player.position.y < minimumSwimY) {
      player.position.y = minimumSwimY;
      player.velocity.y = Math.max(0, player.velocity.y);
    }
    const surfaceClamp = player.waterSurfaceY + PLAYER_RADIUS * 0.62;
    if (player.position.y > surfaceClamp) {
      player.position.y = surfaceClamp;
      player.velocity.y = Math.min(player.velocity.y, 1.5);
    }
    syncPlayerWaterMode(player, waterState);
    return;
  }

  player.swimming = false;
  syncPlayerWaterMode(player, waterState);
  const groundY = terrainHeight + PLAYER_RADIUS;
  if (player.position.y <= groundY) {
    player.position.y = groundY;
    player.velocity.y = 0;
    player.grounded = true;
    runtime.coyoteTimeRemaining = COYOTE_TIME;
    if (!wasGrounded) {
      player.justLanded = true;
      player.landingImpact = MathUtils.clamp(downwardSpeedBeforeResolve / 26, 0.2, 1.35);
    }
  } else {
    player.grounded = false;
  }
}
