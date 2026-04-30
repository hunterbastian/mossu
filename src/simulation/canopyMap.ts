/**
 * Canopy collision map — registers tree-top positions as standable surfaces.
 *
 * The render-side instanced-tree builder publishes its round-tree placements
 * here at boot. Per-frame the player physics queries `sampleCanopyAtPosition`
 * to find any canopy whose XZ footprint contains the player. Pines are deliberately
 * NOT registered: their conical silhouette is too pointy to stand on, and excluding
 * them gives the canopy a meaningful clustering of round-tree groves rather than a
 * uniform ceiling.
 *
 * Spatial lookup is bucketed at `BUCKET_SIZE` to keep per-frame cost flat: a
 * dense forest with 200+ canopies still does ~5-15 distance checks per query.
 */

export interface CanopyPeak {
  /** World XZ of the tree trunk. */
  x: number;
  z: number;
  /** Y in world units of the canopy top (where Mossu's feet rest). */
  peakY: number;
  /** Standable XZ radius around (x, z). Inside this radius, canopy is the floor. */
  radius: number;
}

export interface CanopySample {
  peakY: number;
  /** Distance from query point to canopy center; useful for edge-lift visuals later. */
  distance: number;
  radius: number;
}

const BUCKET_SIZE = 32;

// Flat array of all peaks (kept for any future iteration over all canopies).
let allPeaks: CanopyPeak[] = [];
// Spatial bucket: key = `${gridX}|${gridZ}`, value = peaks whose center falls in that cell.
let buckets: Map<string, CanopyPeak[]> = new Map();

function bucketKey(gridX: number, gridZ: number): string {
  return `${gridX}|${gridZ}`;
}

function gridCoord(value: number): number {
  return Math.floor(value / BUCKET_SIZE);
}

/**
 * Replace the canopy registry. Call once after world placement; subsequent
 * calls overwrite (no incremental add — placements are deterministic).
 */
export function setCanopyPeaks(peaks: readonly CanopyPeak[]): void {
  allPeaks = peaks.slice();
  buckets = new Map();
  for (const peak of allPeaks) {
    // A peak's standable area can spill into neighbor cells; register it in
    // every cell its radius reaches so the 9-cell query is sufficient.
    const minGx = gridCoord(peak.x - peak.radius);
    const maxGx = gridCoord(peak.x + peak.radius);
    const minGz = gridCoord(peak.z - peak.radius);
    const maxGz = gridCoord(peak.z + peak.radius);
    for (let gx = minGx; gx <= maxGx; gx += 1) {
      for (let gz = minGz; gz <= maxGz; gz += 1) {
        const key = bucketKey(gx, gz);
        const list = buckets.get(key);
        if (list) {
          list.push(peak);
        } else {
          buckets.set(key, [peak]);
        }
      }
    }
  }
}

export function clearCanopyPeaks(): void {
  allPeaks = [];
  buckets = new Map();
}

/**
 * Find the highest canopy whose XZ footprint contains (x, z). Returns null if
 * the query point is in open ground.
 *
 * If multiple canopies overlap, the highest one wins — Mossu naturally lands
 * on the tallest tree in a cluster, which matches the spec's "emergent giants
 * over a connected ceiling" silhouette.
 */
export function sampleCanopyAtPosition(x: number, z: number): CanopySample | null {
  if (allPeaks.length === 0) {
    return null;
  }

  const gx = gridCoord(x);
  const gz = gridCoord(z);

  let best: CanopySample | null = null;
  for (let oz = -1; oz <= 1; oz += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const peaks = buckets.get(bucketKey(gx + ox, gz + oz));
      if (!peaks) continue;

      for (const peak of peaks) {
        const dx = x - peak.x;
        const dz = z - peak.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > peak.radius * peak.radius) continue;
        if (best !== null && peak.peakY <= best.peakY) continue;

        best = {
          peakY: peak.peakY,
          distance: Math.sqrt(distSq),
          radius: peak.radius,
        };
      }
    }
  }
  return best;
}

/** Convenience: just the height, no metadata. */
export function sampleCanopyHeight(x: number, z: number): number | null {
  return sampleCanopyAtPosition(x, z)?.peakY ?? null;
}

/** Diagnostics — count of registered canopies. */
export function getCanopyCount(): number {
  return allPeaks.length;
}
