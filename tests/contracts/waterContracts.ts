import { Vector2 } from "three";
import {
  sampleRiverChannelAt,
  sampleRiverEdgeState,
  sampleRiverSurfaceHalfWidth,
  sampleRiverSurfaceMask,
  sampleStartingWaterSurfaceMask,
  sampleWaterBankShape,
  sampleWaterState,
  STARTING_WATER_POOLS,
} from "../../src/simulation/world";
import { assert, assertApprox } from "./testHarness";

const MAIN_RIVER_CHECKPOINT_Z = [-128, -48, 24, 88, 152, 204] as const;

function assertFlowVector(flow: Vector2, label: string) {
  assert(Number.isFinite(flow.x) && Number.isFinite(flow.y), `${label} flow direction is finite`);
  assertApprox(flow.length(), 1, 0.001, `${label} flow direction is normalized`);
}

export function runWaterContracts() {
  MAIN_RIVER_CHECKPOINT_Z.forEach((z) => {
    const channel = sampleRiverChannelAt("main", z);
    const water = sampleWaterState(channel.centerX, z);
    const edge = sampleRiverEdgeState(channel.centerX, z);
    const surfaceMask = sampleRiverSurfaceMask(channel.centerX, z);

    assert(surfaceMask > 0.95, `main river center has rendered surface at z=${z}`);
    assert(water !== null, `main river center has gameplay water at z=${z}`);
    assert(water.depth > 0.2, `main river center has positive depth at z=${z}`);
    assert(edge.zone === "shallow_water" || edge.zone === "swim_water", `main river center edge zone is water at z=${z}`);
    assertFlowVector(water.flowDirection, `main river z=${z}`);

    const dryBankX = channel.centerX + sampleRiverSurfaceHalfWidth(channel) * 1.16;
    const bankWater = sampleWaterState(dryBankX, z);
    const bankEdge = sampleRiverEdgeState(dryBankX, z);
    const bankShape = sampleWaterBankShape(dryBankX, z);
    assert(bankWater === null, `outside rendered main river edge is not gameplay water at z=${z}`);
    assert(bankEdge.zone === "damp_bank" || bankEdge.zone === "dry", `outside rendered main river edge is bank/dry at z=${z}`);
    assert(
      Math.max(bankShape.dampBand, bankShape.dryLip, bankShape.pebbleBand, bankShape.coveCut, bankShape.shelfCut) > 0.08,
      `outside rendered main river edge has shaped bank mask at z=${z}`,
    );
  });

  STARTING_WATER_POOLS.forEach((pool) => {
    const surfaceMask = sampleStartingWaterSurfaceMask(pool.x, pool.z);
    const water = sampleWaterState(pool.x, pool.z);
    const bankShape = sampleWaterBankShape(pool.x + pool.renderRadiusX * 0.96, pool.z);

    assert(surfaceMask > 0.95, `${pool.id} center has rendered surface`);
    assert(water !== null, `${pool.id} center has gameplay water`);
    assert(water.kind === "pool", `${pool.id} resolves as pool water`);
    assert(water.depth > 0.2, `${pool.id} has positive depth`);
    assert(water.swimAllowed === pool.swimAllowed, `${pool.id} swim flag matches pool contract`);
    assert(
      Math.max(bankShape.dampBand, bankShape.coveCut, bankShape.shelfCut, bankShape.sandbarLift) > 0.08,
      `${pool.id} rim has shaped bank mask`,
    );
    assertFlowVector(water.flowDirection, `${pool.id}`);
  });
}
