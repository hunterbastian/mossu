import { sampleHabitatLayer, sampleTerrainHeight } from "../../src/simulation/world";
import { assert } from "./testHarness";

function sample(x: number, z: number) {
  return sampleHabitatLayer(x, z, sampleTerrainHeight(x, z));
}

export function runHabitatContracts() {
  const startMeadow = sample(48, -104);
  assert(startMeadow.zone === "meadow", "opening route reads as meadow habitat");
  assert(startMeadow.meadow > startMeadow.forest, "opening meadow beats forest density");
  assert(startMeadow.meadow > startMeadow.shore, "opening meadow beats shore density");

  const lakeRim = sample(-2, -112);
  assert(lakeRim.zone === "shore", "opening lake rim reads as shore habitat");
  assert(lakeRim.shore > 0.45, "opening lake rim has strong shore mask");

  const forestEdge = sample(-126, -84);
  assert(forestEdge.zone === "forest", "lowland grove reads as forest habitat");
  assert(forestEdge.forest > forestEdge.meadow, "lowland grove forest mask beats meadow mask");

  const routeClearing = sample(24, 88);
  assert(routeClearing.meadow > 0.18 || routeClearing.clearing > 0.3, "route clearing remains open around fir gate");
}
