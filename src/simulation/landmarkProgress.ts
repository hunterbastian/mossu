import { Vector2, Vector3 } from "three";
import { sampleBiomeZone, WorldLandmark, worldLandmarks } from "./world";
import type { InteractionTargetState, InventoryEntryState } from "./gameState";

const DEFAULT_INTERACTION_RADIUS = 15;
const landmarkScratch = new Vector2();

export interface LandmarkProgressSnapshot {
  currentLandmark: string;
  interactionTarget: InteractionTargetState | null;
  lastCatalogedLandmarkId: string | null;
}

export function getCollectionEntries(catalogedLandmarkIds: ReadonlySet<string>): InventoryEntryState[] {
  return worldLandmarks
    .filter((landmark) => landmark.inventoryEntry)
    .map((landmark) => ({
      landmarkId: landmark.id,
      landmarkTitle: landmark.title,
      keepsakeTitle: landmark.inventoryEntry?.title ?? landmark.title,
      keepsakeSummary: landmark.inventoryEntry?.summary ?? "",
      zone: sampleBiomeZone(landmark.position.x, landmark.position.z, landmark.position.y),
      discovered: catalogedLandmarkIds.has(landmark.id),
    }));
}

export function updateLandmarkProgress(
  playerPosition: Vector3,
  catalogedLandmarkIds: Set<string>,
): LandmarkProgressSnapshot {
  const nearbyLandmark = findNearbyLandmark(playerPosition.x, playerPosition.z);
  const lastCatalogedLandmarkId = nearbyLandmark ? catalogLandmark(catalogedLandmarkIds, nearbyLandmark.id) : null;

  return {
    currentLandmark: findClosestLandmarkTitle(playerPosition),
    interactionTarget: buildInteractionTarget(playerPosition, catalogedLandmarkIds, nearbyLandmark),
    lastCatalogedLandmarkId,
  };
}

function catalogLandmark(catalogedLandmarkIds: Set<string>, landmarkId: string) {
  if (catalogedLandmarkIds.has(landmarkId)) {
    return null;
  }
  catalogedLandmarkIds.add(landmarkId);
  return landmarkId;
}

function findNearbyLandmark(x: number, z: number): WorldLandmark | null {
  let closestLandmark: WorldLandmark | null = null;
  let closestDistanceSq = Number.POSITIVE_INFINITY;

  for (const landmark of worldLandmarks) {
    if (!landmark.inventoryEntry) {
      continue;
    }

    landmarkScratch.set(x - landmark.position.x, z - landmark.position.z);
    const distanceSq = landmarkScratch.lengthSq();
    const interactionRadius = landmark.interactionRadius ?? DEFAULT_INTERACTION_RADIUS;
    if (distanceSq > interactionRadius * interactionRadius || distanceSq >= closestDistanceSq) {
      continue;
    }

    closestDistanceSq = distanceSq;
    closestLandmark = landmark;
  }

  return closestLandmark;
}

function buildInteractionTarget(
  playerPosition: Vector3,
  catalogedLandmarkIds: ReadonlySet<string>,
  landmark: WorldLandmark | null,
): InteractionTargetState | null {
  if (!landmark?.inventoryEntry) {
    return null;
  }

  landmarkScratch.set(
    playerPosition.x - landmark.position.x,
    playerPosition.z - landmark.position.z,
  );

  return {
    landmarkId: landmark.id,
    landmarkTitle: landmark.title,
    keepsakeTitle: landmark.inventoryEntry.title,
    keepsakeSummary: landmark.inventoryEntry.summary,
    distance: landmarkScratch.length(),
    alreadyCataloged: catalogedLandmarkIds.has(landmark.id),
  };
}

function findClosestLandmarkTitle(playerPosition: Vector3) {
  let closestTitle = worldLandmarks[0]?.title ?? "Mossu";
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const landmark of worldLandmarks) {
    landmarkScratch.set(playerPosition.x - landmark.position.x, playerPosition.z - landmark.position.z);
    const distance = landmarkScratch.lengthSq();
    if (distance < closestDistance) {
      closestDistance = distance;
      closestTitle = landmark.title;
    }
  }

  return closestTitle;
}
