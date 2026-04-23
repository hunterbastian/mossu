import { Vector2, Vector3 } from "three";
import { sampleBiomeZone, WorldForageable, worldForageables } from "./world";
import type { ForageableEntryState } from "./gameState";

const DEFAULT_FORAGEABLE_RADIUS = 7;
const forageableScratch = new Vector2();

export interface ForageableProgressSnapshot {
  lastGatheredForageableId: string | null;
}

export function getForageableEntries(gatheredForageableIds: ReadonlySet<string>): ForageableEntryState[] {
  return worldForageables.map((forageable) => ({
    forageableId: forageable.id,
    title: forageable.title,
    summary: forageable.summary,
    kind: forageable.kind,
    zone: sampleBiomeZone(forageable.position.x, forageable.position.z, forageable.position.y),
    gathered: gatheredForageableIds.has(forageable.id),
  }));
}

export function updateForageableProgress(
  playerPosition: Vector3,
  gatheredForageableIds: Set<string>,
): ForageableProgressSnapshot {
  const nearbyForageable = findNearbyForageable(playerPosition.x, playerPosition.z);
  return {
    lastGatheredForageableId: nearbyForageable ? gatherForageable(gatheredForageableIds, nearbyForageable.id) : null,
  };
}

function gatherForageable(gatheredForageableIds: Set<string>, forageableId: string) {
  if (gatheredForageableIds.has(forageableId)) {
    return null;
  }
  gatheredForageableIds.add(forageableId);
  return forageableId;
}

function findNearbyForageable(x: number, z: number): WorldForageable | null {
  let closestForageable: WorldForageable | null = null;
  let closestDistanceSq = Number.POSITIVE_INFINITY;

  for (const forageable of worldForageables) {
    forageableScratch.set(x - forageable.position.x, z - forageable.position.z);
    const distanceSq = forageableScratch.lengthSq();
    const interactionRadius = forageable.interactionRadius ?? DEFAULT_FORAGEABLE_RADIUS;
    if (distanceSq > interactionRadius * interactionRadius || distanceSq >= closestDistanceSq) {
      continue;
    }

    closestDistanceSq = distanceSq;
    closestForageable = forageable;
  }

  return closestForageable;
}
