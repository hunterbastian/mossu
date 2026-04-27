import { Vector2 } from "three";
import {
  sampleRiverChannelAt,
  sampleRiverEdgeState,
  sampleRiverSurfaceHalfWidth,
  sampleRiverSurfaceMask,
  sampleStartingWaterSurfaceMask,
  sampleWaterAmbience,
  sampleWaterBankShape,
  sampleWaterState,
  STARTING_WATER_POOLS,
} from "../../src/simulation/world";
import { assert, assertApprox } from "./testHarness";

const MAIN_RIVER_CHECKPOINT_Z = [-128, -48, 24, 88, 152, 204] as const;

/** Mid-segment Z per braid; bank-entry ladder must match rendered surface + gameplay water. */
const BRANCH_BANK_CHECKPOINTS = [
  { id: "meadow-braid" as const, z: -28 },
  { id: "fir-gate-braid" as const, z: 92 },
  { id: "alpine-braid" as const, z: 174 },
] as const;

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
    const ambience = sampleWaterAmbience(channel.centerX, z);

    assert(surfaceMask > 0.95, `main river center has rendered surface at z=${z}`);
    assert(water !== null, `main river center has gameplay water at z=${z}`);
    assert(water.depth > 0.2, `main river center has positive depth at z=${z}`);
    assert(edge.zone === "shallow_water" || edge.zone === "swim_water", `main river center edge zone is water at z=${z}`);
    assert(ambience.proximity > 0.95, `main river center has strong water ambience at z=${z}`);
    assert(ambience.kind === "river", `main river center ambience resolves to river at z=${z}`);
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

    // Bank entry: gameplay water and rendered surface must agree inside the channel (roadmap bank-entry QA).
    const half = sampleRiverSurfaceHalfWidth(channel);
    // Lateral offset must stay where terrain is still below the water surface (depth > 0.2);
    // steeper banks can fail shallow-depth earlier than the half-width disc.
    const innerX = channel.centerX + half * 0.28;
    const nearEdgeX = channel.centerX + half * 0.92;
    const innerWater = sampleWaterState(innerX, z);
    const nearEdgeWater = sampleWaterState(nearEdgeX, z);
    const innerMask = sampleRiverSurfaceMask(innerX, z);
    const nearMask = sampleRiverSurfaceMask(nearEdgeX, z);
    const innerEdge = sampleRiverEdgeState(innerX, z);
    const nearEdge = sampleRiverEdgeState(nearEdgeX, z);

    assert(innerWater !== null, `main river mid-bank has gameplay water at z=${z}`);
    assert(innerMask > 0.12, `main river mid-bank has rendered surface mask at z=${z}`);
    assert(
      innerEdge.zone === "shallow_water" || innerEdge.zone === "swim_water",
      `main river mid-bank edge zone is water at z=${z}`,
    );

    if (nearEdgeWater !== null) {
      assert(nearMask > 0.05, `where gameplay water exists near channel edge, surface mask is non-zero at z=${z}`);
      assert(
        nearEdge.zone === "shallow_water" || nearEdge.zone === "swim_water",
        `near-edge water matches edge zone at z=${z}`,
      );
    }
  });

  BRANCH_BANK_CHECKPOINTS.forEach(({ id, z }) => {
    const channel = sampleRiverChannelAt(id, z);
    assert(channel.envelope > 0.05, `${id} has active envelope at z=${z}`);
    const water = sampleWaterState(channel.centerX, z);
    const surfaceMask = sampleRiverSurfaceMask(channel.centerX, z);
    assert(surfaceMask > 0.85, `${id} center has rendered surface at z=${z}`);
    assert(water !== null, `${id} center has gameplay water at z=${z}`);
    assert(water.depth > 0.15, `${id} center has positive depth at z=${z}`);
    assertFlowVector(water.flowDirection, `${id} z=${z}`);

    const half = sampleRiverSurfaceHalfWidth(channel);
    const dryBankX = channel.centerX + half * 1.16;
    assert(sampleWaterState(dryBankX, z) === null, `${id} dry bank is not gameplay water at z=${z}`);
    const innerX = channel.centerX + half * 0.28;
    const nearEdgeX = channel.centerX + half * 0.92;
    const innerWater = sampleWaterState(innerX, z);
    const nearEdgeWater = sampleWaterState(nearEdgeX, z);
    const innerMask = sampleRiverSurfaceMask(innerX, z);
    const nearMask = sampleRiverSurfaceMask(nearEdgeX, z);
    const innerEdge = sampleRiverEdgeState(innerX, z);
    const nearEdge = sampleRiverEdgeState(nearEdgeX, z);
    assert(innerWater !== null, `${id} mid-bank has gameplay water at z=${z}`);
    assert(innerMask > 0.1, `${id} mid-bank has rendered surface mask at z=${z}`);
    assert(
      innerEdge.zone === "shallow_water" || innerEdge.zone === "swim_water",
      `${id} mid-bank edge zone is water at z=${z}`,
    );
    if (nearEdgeWater !== null) {
      assert(nearMask > 0.05, `${id} near-edge water has surface mask at z=${z}`);
      assert(
        nearEdge.zone === "shallow_water" || nearEdge.zone === "swim_water",
        `${id} near-edge water matches edge zone at z=${z}`,
      );
    }
  });

  STARTING_WATER_POOLS.forEach((pool) => {
    const surfaceMask = sampleStartingWaterSurfaceMask(pool.x, pool.z);
    const water = sampleWaterState(pool.x, pool.z);
    const bankShape = sampleWaterBankShape(pool.x + pool.renderRadiusX * 0.96, pool.z);

    assert(surfaceMask > 0.95, `${pool.id} center has rendered surface`);
    assert(water !== null, `${pool.id} center has gameplay water`);
    assert(water.kind === "pool", `${pool.id} resolves as pool water`);
    assert(water.depth > 0.2, `${pool.id} has positive depth`);
    assert(sampleWaterAmbience(pool.x, pool.z).proximity > 0.95, `${pool.id} center has strong water ambience`);
    assert(water.swimAllowed === pool.swimAllowed, `${pool.id} swim flag matches pool contract`);
    assert(
      Math.max(bankShape.dampBand, bankShape.coveCut, bankShape.shelfCut, bankShape.sandbarLift) > 0.08,
      `${pool.id} rim has shaped bank mask`,
    );
    assertFlowVector(water.flowDirection, `${pool.id}`);
  });

  const cloudbackCreek = sampleWaterAmbience(-22, 170);
  assert(cloudbackCreek.kind === "creek", "highland creek resolves as creek ambience");
  assert(cloudbackCreek.proximity > 0.95, "highland creek has strong ambience");

  const farDryAmbience = sampleWaterAmbience(170, -190);
  assert(farDryAmbience.proximity < 0.05, "far dry meadow has no water ambience");
  assert(farDryAmbience.kind === null, "far dry meadow has no water ambience source");
}
