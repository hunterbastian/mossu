import {
  isInsideIslandPlayableBounds,
  sampleTerrainHeight,
  sampleWorldRegion,
  worldLandmarks,
} from "../../src/simulation/world";
import { assert, assertEqual } from "./testHarness";

function regionAt(x: number, z: number) {
  return sampleWorldRegion(x, z, sampleTerrainHeight(x, z));
}

export function runIslandRegionContracts() {
  const samples = [
    { label: "opening meadow", x: -68, z: -140, region: "meadow", material: "meadow_grass" },
    { label: "central lake", x: -34, z: -112, region: "lake", material: "water" },
    { label: "beach rim", x: 430, z: -520, region: "shore", material: "sand" },
    { label: "forest grove", x: -126, z: -84, region: "forest", material: "forest_floor" },
    { label: "highland basin", x: 42, z: 134, region: "highland", material: "highland_grass" },
    { label: "ridge shelf", x: 16, z: 186, region: "ridge", material: "rock" },
    { label: "shrine crown", x: 18, z: 214, region: "shrine", material: "shrine_moss" },
  ] as const;

  samples.forEach((sample) => {
    assert(isInsideIslandPlayableBounds(sample.x, sample.z), `${sample.label} remains inside playable island bounds`);
    const region = regionAt(sample.x, sample.z);
    assertEqual(region.region, sample.region, `${sample.label} resolves to ${sample.region}`);
    assertEqual(region.material, sample.material, `${sample.label} resolves to ${sample.material}`);
    assert(region.regionStrength > 0.45, `${sample.label} has a readable region mask`);
  });

  const byId = new Map(worldLandmarks.map((landmark) => [landmark.id, landmark]));
  const routeLandmarkRegions = [
    ["start-burrow", "meadow"],
    ["river-bend", "lake"],
    ["fir-gate", "forest"],
    ["highland-basin", "highland"],
    ["ridge-saddle-landmark", "ridge"],
    ["peak-shrine", "shrine"],
  ] as const;

  routeLandmarkRegions.forEach(([id, expectedRegion]) => {
    const landmark = byId.get(id);
    assert(landmark !== undefined, `route landmark exists for island region: ${id}`);
    const region = regionAt(landmark.position.x, landmark.position.z);
    assertEqual(region.region, expectedRegion, `${id} sits in ${expectedRegion} region`);
  });
}
