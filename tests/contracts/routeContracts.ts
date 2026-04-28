import {
  getRouteDirtContractSamples,
  isInsideIslandPlayableBounds,
  sampleBiomeZone,
  sampleRiverSurfaceMask,
  sampleRouteDirtPathMask,
  sampleStartingWaterSurfaceMask,
  sampleTerrainHeight,
  worldLandmarks,
} from "../../src/simulation/world";
import { assert, assertEqual } from "./testHarness";

const ROUTE_IDS = [
  "start-burrow",
  "river-bend",
  "fir-gate",
  "foothill-pass",
  "mistfall-basin",
  "windstep-shelf",
  "ridge-overlook",
  "skyward-ledge",
  "peak-shrine",
] as const;

/** Named tiers present at route landmark positions (terrain jumps the mid “foothills” band between stops). */
const EXPECTED_ROUTE_ZONES = [
  "plains",
  "hills",
  "alpine",
  "ridge",
  "peak_shrine",
] as const;

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

  const routeZones = new Set(route.map((landmark) => sampleBiomeZone(
    landmark.position.x,
    landmark.position.z,
    landmark.position.y,
  )));
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
}
