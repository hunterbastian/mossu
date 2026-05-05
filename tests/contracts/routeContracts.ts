import {
  biomeThresholdLandmarks,
  getRouteDirtContractSamples,
  isInsideIslandPlayableBounds,
  sampleBiomeZone,
  sampleRiverSurfaceMask,
  sampleRouteDirtPathMask,
  sampleBiomeThresholdClearing,
  sampleOpeningNestExitPathMask,
  sampleRouteReadabilityClearing,
  sampleStartingWaterSurfaceMask,
  sampleTerrainHeight,
  startingPosition,
  worldLandmarks,
} from "../../src/simulation/world";
import { assert, assertEqual } from "./testHarness";

const ROUTE_IDS = [
  "start-burrow",
  "river-bend",
  "fir-gate",
  "foothill-pass",
  "highland-basin",
  "windstep-shelf",
  "ridge-overlook",
  "skyward-ledge",
  "peak-shrine",
] as const;

/** Named tiers present at route landmark positions (terrain jumps the mid “foothills” band between stops). */
const EXPECTED_ROUTE_ZONES = ["plains", "hills", "alpine", "ridge", "peak_shrine"] as const;

export function runRouteContracts() {
  const landmarksById = new Map(worldLandmarks.map((landmark) => [landmark.id, landmark]));
  const route = ROUTE_IDS.map((id) => {
    const landmark = landmarksById.get(id);
    assert(landmark !== undefined, `route landmark exists: ${id}`);
    return landmark;
  });

  route.forEach((landmark) => {
    const { x, z } = landmark.position;
    const sampledY = sampleTerrainHeight(x, z);
    assert(Number.isFinite(sampledY), `${landmark.id} terrain height is finite`);
    assert(isInsideIslandPlayableBounds(x, z), `${landmark.id} is inside playable island bounds`);
    assert((landmark.interactionRadius ?? 0) > 0, `${landmark.id} has an interaction radius`);
    assert(landmark.inventoryEntry !== undefined, `${landmark.id} has a keepsake entry`);
    assert(Math.abs(landmark.position.y - sampledY) < 0.001, `${landmark.id} y position matches terrain sampler`);
  });

  for (let i = 1; i < route.length; i += 1) {
    assert(route[i].position.z >= route[i - 1].position.z, `${route[i - 1].id} to ${route[i].id} moves north/up-route`);
  }

  const routeZones = new Set(
    route.map((landmark) => sampleBiomeZone(landmark.position.x, landmark.position.z, landmark.position.y)),
  );
  EXPECTED_ROUTE_ZONES.forEach((zone) => {
    assert(routeZones.has(zone), `route includes ${zone} zone`);
  });

  assertEqual(route[0].title, "Burrow Hollow", "route starts at Burrow Hollow");
  assertEqual(route[route.length - 1].title, "Moss Crown Shrine", "route ends at Moss Crown Shrine");

  getRouteDirtContractSamples().forEach((point, index) => {
    const dirt = sampleRouteDirtPathMask(point.x, point.z);
    const inRiver = sampleRiverSurfaceMask(point.x, point.z) > 0.12;
    const inStartPool = sampleStartingWaterSurfaceMask(point.x, point.z) > 0.12;
    assert(
      dirt > 0.06 || inRiver || inStartPool,
      `route segment ${index} (${point.x.toFixed(1)}, ${point.z.toFixed(1)}) should read as dirt (dirt=${dirt.toFixed(3)}) or be water-covered (river=${inRiver} pool=${inStartPool})`,
    );
  });

  const openingNestExitSamples = [
    { label: "hillside nest", x: startingPosition.x, z: startingPosition.z },
    { label: "nest exit midpoint", ...getRouteDirtContractSamples()[0] },
  ];
  openingNestExitSamples.forEach((point) => {
    const exitMask = sampleOpeningNestExitPathMask(point.x, point.z);
    const dirt = sampleRouteDirtPathMask(point.x, point.z);
    const clearing = sampleRouteReadabilityClearing(point.x, point.z);
    assert(
      exitMask > 0.24 && dirt > 0.38 && clearing > 0.55,
      `${point.label} should read as a pressed-grass exit path (exit=${exitMask.toFixed(3)} dirt=${dirt.toFixed(3)} clearing=${clearing.toFixed(3)})`,
    );
  });

  // Biome threshold landmarks: each marker should sit in either its from- or to-zone
  // (i.e. close enough to the boundary that the player reads it as a threshold), should be
  // inside playable bounds, the integrated route-readability clearing at the prop site
  // should be wide enough that the prop reads cleanly, and the threshold-clearing function
  // itself should peak at the landmark and decay at distance.
  assert(biomeThresholdLandmarks.length >= 5, "at least one threshold landmark per major boundary");
  biomeThresholdLandmarks.forEach((landmark) => {
    const { x, z } = landmark.position;
    assert(isInsideIslandPlayableBounds(x, z), `threshold landmark ${landmark.id} is inside playable island bounds`);
    const sampledZone = sampleBiomeZone(x, z, sampleTerrainHeight(x, z));
    assert(
      sampledZone === landmark.fromZone || sampledZone === landmark.toZone,
      `threshold landmark ${landmark.id} sits in fromZone (${landmark.fromZone}) or toZone (${landmark.toZone}); sampled=${sampledZone}`,
    );
    const clearingAtLandmark = sampleRouteReadabilityClearing(x, z);
    assert(
      clearingAtLandmark > 0.55,
      `threshold landmark ${landmark.id} sits in a wide-enough clearing for the prop to read (clearing=${clearingAtLandmark.toFixed(3)})`,
    );
    const thresholdAt = sampleBiomeThresholdClearing(x, z);
    const thresholdFar = sampleBiomeThresholdClearing(x + landmark.clearingRadius * 3, z + landmark.clearingRadius * 3);
    assert(
      thresholdAt >= landmark.clearingStrength * 0.85,
      `threshold landmark ${landmark.id} widening peaks at landmark (at=${thresholdAt.toFixed(3)}, expected >= ${(landmark.clearingStrength * 0.85).toFixed(3)})`,
    );
    assert(
      thresholdAt > thresholdFar + 0.4,
      `threshold landmark ${landmark.id} widening decays with distance (at=${thresholdAt.toFixed(3)} far=${thresholdFar.toFixed(3)})`,
    );
  });
}
