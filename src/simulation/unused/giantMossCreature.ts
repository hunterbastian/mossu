import { MathUtils, Vector3 } from "three";
import type { PlayerState } from "../gameState";
import { MOSSU_PLAYFIELD_EXTENT, sampleTerrainHeight, startingPosition } from "../world";

export type GiantMossCreatureMode = "patrol" | "stalk" | "charge" | "cooldown";

export interface GiantMossCreatureState {
  position: Vector3;
  velocity: Vector3;
  heading: number;
  mode: GiantMossCreatureMode;
  alertness: number;
  distanceToPlayer: number;
  currentWaypointIndex: number;
  attackCooldown: number;
  attackCount: number;
  attackedThisFrame: boolean;
}

const PATROL_SPEED = 9.5;
const STALK_SPEED = 16;
const CHARGE_SPEED = 29;
const DETECTION_RADIUS = 118;
const CHARGE_RADIUS = 42;
const ATTACK_RADIUS = 10.5;
const ATTACK_COOLDOWN_SECONDS = 3.2;
const FIELD_MARGIN = 54;

const TITAN_WAYPOINTS = [
  new Vector3(-126, 0, -118),
  new Vector3(-38, 0, -44),
  new Vector3(84, 0, -28),
  new Vector3(124, 0, 54),
  new Vector3(56, 0, 144),
  new Vector3(-72, 0, 106),
] as const;

export function createGiantMossCreatureState(): GiantMossCreatureState {
  const start = TITAN_WAYPOINTS[2].clone();
  start.y = sampleTerrainHeight(start.x, start.z);
  return {
    position: start,
    velocity: new Vector3(),
    heading: -0.6,
    mode: "patrol",
    alertness: 0,
    distanceToPlayer: Infinity,
    currentWaypointIndex: 3,
    attackCooldown: 0,
    attackCount: 0,
    attackedThisFrame: false,
  };
}

export function updateGiantMossCreature(
  state: GiantMossCreatureState,
  player: PlayerState,
  dt: number,
) {
  state.attackedThisFrame = false;
  state.attackCooldown = Math.max(0, state.attackCooldown - dt);

  const planarToPlayer = new Vector3(
    player.position.x - state.position.x,
    0,
    player.position.z - state.position.z,
  );
  state.distanceToPlayer = planarToPlayer.length();

  const playerHidden = player.fallingToVoid || player.swimming || player.waterMode === "underwater";
  if (state.attackCooldown > 0) {
    state.mode = "cooldown";
  } else if (!playerHidden && state.distanceToPlayer <= ATTACK_RADIUS) {
    attackPlayer(state, player);
  } else if (!playerHidden && state.distanceToPlayer <= CHARGE_RADIUS) {
    state.mode = "charge";
  } else if (!playerHidden && state.distanceToPlayer <= DETECTION_RADIUS) {
    state.mode = "stalk";
  } else {
    state.mode = "patrol";
  }

  state.alertness = MathUtils.damp(
    state.alertness,
    state.mode === "charge" ? 1 : state.mode === "stalk" ? 0.72 : state.mode === "cooldown" ? 0.24 : 0,
    3.4,
    dt,
  );

  const target = getTargetPosition(state, player);
  const toTarget = new Vector3(target.x - state.position.x, 0, target.z - state.position.z);
  const distanceToTarget = toTarget.length();
  if (distanceToTarget > 0.001) {
    toTarget.normalize();
  }

  if (state.mode === "patrol" && distanceToTarget < 14) {
    state.currentWaypointIndex = (state.currentWaypointIndex + 1) % TITAN_WAYPOINTS.length;
  }

  const speed =
    state.mode === "charge" ? CHARGE_SPEED :
      state.mode === "stalk" ? STALK_SPEED :
        state.mode === "cooldown" ? PATROL_SPEED * 0.55 :
          PATROL_SPEED;
  state.velocity.set(toTarget.x * speed, 0, toTarget.z * speed);

  state.position.addScaledVector(state.velocity, dt);
  const halfExtent = MOSSU_PLAYFIELD_EXTENT / 2 - FIELD_MARGIN;
  state.position.x = MathUtils.clamp(state.position.x, -halfExtent, halfExtent);
  state.position.z = MathUtils.clamp(state.position.z, -halfExtent, halfExtent);
  state.position.y = sampleTerrainHeight(state.position.x, state.position.z);

  if (state.velocity.lengthSq() > 0.05) {
    state.heading = Math.atan2(state.velocity.x, state.velocity.z);
  }
}

function getTargetPosition(state: GiantMossCreatureState, player: PlayerState) {
  if (state.mode === "stalk" || state.mode === "charge") {
    return player.position;
  }

  return TITAN_WAYPOINTS[state.currentWaypointIndex % TITAN_WAYPOINTS.length];
}

function attackPlayer(state: GiantMossCreatureState, player: PlayerState) {
  state.mode = "cooldown";
  state.attackCooldown = ATTACK_COOLDOWN_SECONDS;
  state.attackCount += 1;
  state.attackedThisFrame = true;

  player.position.copy(startingPosition);
  player.position.y = sampleTerrainHeight(startingPosition.x, startingPosition.z) + 2.2;
  player.velocity.set(0, 0, 0);
  player.grounded = true;
  player.swimming = false;
  player.waterMode = "onLand";
  player.waterDepth = 0;
  player.fallingToVoid = false;
  player.floating = false;
  player.rolling = false;
  player.rollingBoostActive = false;
  player.justLanded = false;
  player.justRespawned = true;
}
