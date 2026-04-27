import type { WorldLandmark } from "./world";
import { worldLandmarks } from "./world";

const DEFAULT_PING_RADIUS = 40;

export function getFlavorPingText(landmark: WorldLandmark): string {
  if (landmark.flavorPing) {
    return landmark.flavorPing;
  }
  if (landmark.inventoryEntry) {
    return `${landmark.title} — ${landmark.inventoryEntry.title}`;
  }
  return landmark.title;
}

/** Nearest landmark within ping radius that has not been shown this session. */
export function findFlavorPingLandmark(
  x: number,
  z: number,
  shownIds: ReadonlySet<string>,
): WorldLandmark | null {
  let best: WorldLandmark | null = null;
  let bestD2 = Infinity;
  for (const lm of worldLandmarks) {
    if (shownIds.has(lm.id)) {
      continue;
    }
    const dx = x - lm.position.x;
    const dz = z - lm.position.z;
    const d2 = dx * dx + dz * dz;
    const interaction = lm.interactionRadius ?? 15;
    const pingRadius = Math.max(DEFAULT_PING_RADIUS, interaction * 2.35);
    if (d2 > pingRadius * pingRadius || d2 >= bestD2) {
      continue;
    }
    bestD2 = d2;
    best = lm;
  }
  return best;
}
