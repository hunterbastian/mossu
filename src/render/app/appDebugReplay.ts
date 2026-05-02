import type { PlayerState, SaveState } from "../../simulation/gameState";
import { sampleTerrainHeight, type AbilityId } from "../../simulation/world";
import type { DebugSaveStatePayload } from "./appRuntimeConfig";

export function teleportDebugPlayerTo(player: PlayerState, x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return false;
  }

  player.position.set(x, sampleTerrainHeight(x, z) + 2.2, z);
  resetDebugPlayerTeleport(player);
  return true;
}

export function applyDebugPlayerSnapshot(
  player: PlayerState,
  payload: DebugSaveStatePayload["player"],
) {
  const x = payload?.x;
  const z = payload?.z;
  if (typeof x === "number" && Number.isFinite(x) && typeof z === "number" && Number.isFinite(z)) {
    const y =
      typeof payload?.y === "number" && Number.isFinite(payload.y)
        ? payload.y
        : sampleTerrainHeight(x, z) + 2.2;
    player.position.set(x, y, z);
  }

  if (typeof payload?.heading === "number" && Number.isFinite(payload.heading)) {
    player.heading = payload.heading;
    return payload.heading;
  }

  return null;
}

function resetDebugPlayerTeleport(player: PlayerState) {
  player.velocity.set(0, 0, 0);
  player.grounded = true;
  player.swimming = false;
  player.waterMode = "onLand";
  player.fallingToVoid = false;
}

export function resetDebugPlayerMovement(player: PlayerState) {
  resetDebugPlayerTeleport(player);
  player.floating = false;
  player.justLanded = false;
  player.justRespawned = false;
}

export function applyDebugSaveSnapshot(
  save: SaveState,
  payload: DebugSaveStatePayload["save"],
) {
  if (payload?.unlockedAbilities) {
    save.unlockedAbilities = new Set(payload.unlockedAbilities as AbilityId[]);
  }
  if (payload?.catalogedLandmarkIds) {
    save.catalogedLandmarkIds = new Set(payload.catalogedLandmarkIds);
  }
  if (payload?.gatheredForageableIds) {
    save.gatheredForageableIds = new Set(payload.gatheredForageableIds);
  }
  if (payload?.recruitedKaruIds) {
    save.recruitedKaruIds = new Set(payload.recruitedKaruIds);
  }
}
