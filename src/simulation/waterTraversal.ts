import { MathUtils, Vector3 } from "three";
import type { PlayerState } from "./gameState";
import type { PlayerSimulationRuntime } from "./playerSimulationRuntime";
import type { WaterState } from "./world";
import {
  COYOTE_TIME,
  PLAYER_RADIUS,
  SWIM_BUOYANCY,
  SWIM_CURRENT_SCALE,
  SWIM_ENTRY_MARGIN,
  SWIM_EXIT_MARGIN,
  SWIM_FLOAT_HEIGHT,
  SWIM_GRAVITY,
  SWIM_MIN_DEPTH,
  SWIM_SPEED,
  SWIM_STROKE_ACCELERATION,
} from "./playerSimulationConstants";

const swimPlanarVelocity = new Vector3();

export function applyWaterState(player: PlayerState, waterState: WaterState | null) {
  player.waterDepth = waterState?.depth ?? 0;
  player.waterSurfaceY = waterState?.surfaceY ?? player.position.y;
}

export function shouldSwim(player: PlayerState, waterState: WaterState | null) {
  if (!waterState || !waterState.swimAllowed || waterState.depth < SWIM_MIN_DEPTH) {
    return false;
  }
  const entryMargin = player.swimming ? SWIM_EXIT_MARGIN : SWIM_ENTRY_MARGIN;
  return player.position.y <= waterState.surfaceY + entryMargin;
}

export function applySwimForces(player: PlayerState, waterState: WaterState, dt: number) {
  const targetSwimY = waterState.surfaceY + SWIM_FLOAT_HEIGHT;
  player.velocity.y += (targetSwimY - player.position.y) * SWIM_BUOYANCY * dt;
  player.velocity.y -= SWIM_GRAVITY * dt;
  player.velocity.x += waterState.flowDirection.x * waterState.flowStrength * SWIM_CURRENT_SCALE * dt;
  player.velocity.z += waterState.flowDirection.y * waterState.flowStrength * SWIM_CURRENT_SCALE * dt;
}

export function clampSwimVelocity(player: PlayerState, jumpHeld: boolean, dt: number) {
  if (jumpHeld) {
    player.velocity.y += SWIM_STROKE_ACCELERATION * dt;
  }
  player.velocity.y = MathUtils.clamp(player.velocity.y, -9, 8.5);
  swimPlanarVelocity.set(player.velocity.x, 0, player.velocity.z);
  if (swimPlanarVelocity.lengthSq() > 0.0001) {
    swimPlanarVelocity.setLength(Math.min(swimPlanarVelocity.length(), SWIM_SPEED + 2.8));
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
    const minimumSwimY = terrainHeight + PLAYER_RADIUS * 0.72;
    if (player.position.y < minimumSwimY) {
      player.position.y = minimumSwimY;
      player.velocity.y = Math.max(0, player.velocity.y);
    }
    const surfaceClamp = player.waterSurfaceY + PLAYER_RADIUS * 0.9;
    if (player.position.y > surfaceClamp) {
      player.position.y = surfaceClamp;
      player.velocity.y = Math.min(player.velocity.y, 1.5);
    }
    return;
  }

  player.swimming = false;
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
