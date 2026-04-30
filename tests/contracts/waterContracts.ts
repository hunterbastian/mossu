import { MathUtils, Vector2 } from "three";
import { sampleRenderedWaterSurfaceY } from "../../src/render/world/waterSystem";
import {
  sampleFilledWaterSurfaceY,
  MAIN_RIVER_SURFACE_OFFSET,
  sampleRiverChannelAt,
  sampleRiverEdgeState,
  sampleRiverSurfaceHalfWidth,
  sampleRiverSurfaceMask,
  sampleTerrainHeight,
  sampleStartingWaterSurfaceMask,
  sampleWaterAmbience,
  sampleWaterBankShape,
  sampleWaterState,
  STARTING_WATER_VISUAL_FILL_SCALE,
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

function assertRenderedWaterClearsTerrain(
  flatSurfaceY: number,
  x: number,
  z: number,
  bank: number,
  edgeBlend: number,
  label: string,
) {
  const terrainY = sampleTerrainHeight(x, z);
  const gameplaySurfaceY = sampleFilledWaterSurfaceY(flatSurfaceY, x, z, bank, edgeBlend);
  const renderedSurfaceY = sampleRenderedWaterSurfaceY(flatSurfaceY, x, z, bank, edgeBlend);
  assertApprox(renderedSurfaceY, gameplaySurfaceY, 0.001, `${label} rendered water uses filled gameplay surface`);
  assert(
    renderedSurfaceY >= terrainY + 0.02,
    `${label} rendered water clears terrain`,
  );
  assert(
    renderedSurfaceY <= gameplaySurfaceY + 0.001,
    `${label} rendered water does not overfill above gameplay height`,
  );
}

function findDryBankProbe(centerX: number, halfWidth: number, z: number, label: string) {
  for (const factor of [1.16, 1.32, 1.48, 1.68]) {
    for (const side of [1, -1]) {
      const x = centerX + halfWidth * factor * side;
      if (sampleWaterState(x, z) === null) {
        return x;
      }
    }
  }
  assert(false, `${label} has a dry-bank probe outside nearby rendered water`);
  return centerX + halfWidth * 1.68;
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

    const dryBankX = findDryBankProbe(channel.centerX, sampleRiverSurfaceHalfWidth(channel), z, `main river z=${z}`);
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
    const flatSurfaceY = sampleTerrainHeight(channel.centerX, z) + MAIN_RIVER_SURFACE_OFFSET;
    const innerWater = sampleWaterState(innerX, z);
    const nearEdgeWater = sampleWaterState(nearEdgeX, z);
    const innerMask = sampleRiverSurfaceMask(innerX, z);
    const nearMask = sampleRiverSurfaceMask(nearEdgeX, z);
    const innerEdge = sampleRiverEdgeState(innerX, z);
    const nearEdge = sampleRiverEdgeState(nearEdgeX, z);

    assert(innerWater !== null, `main river mid-bank has gameplay water at z=${z}`);
    assert(innerMask > 0.12, `main river mid-bank has rendered surface mask at z=${z}`);
    assertRenderedWaterClearsTerrain(flatSurfaceY, innerX, z, 0.28, 0, `main river mid-bank at z=${z}`);
    assert(
      innerEdge.zone === "shallow_water" || innerEdge.zone === "swim_water",
      `main river mid-bank edge zone is water at z=${z}`,
    );

    if (nearEdgeWater !== null) {
      assert(nearMask > 0.05, `where gameplay water exists near channel edge, surface mask is non-zero at z=${z}`);
      assertRenderedWaterClearsTerrain(
        flatSurfaceY,
        nearEdgeX,
        z,
        0.92,
        MathUtils.smoothstep(0.82, 1, 0.92),
        `main river near-edge at z=${z}`,
      );
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
    const dryBankX = findDryBankProbe(channel.centerX, half, z, `${id} z=${z}`);
    assert(sampleWaterState(dryBankX, z) === null, `${id} dry bank is not gameplay water at z=${z}`);
    const innerX = channel.centerX + half * 0.28;
    const nearEdgeX = channel.centerX + half * 0.92;
    const flatSurfaceY = sampleTerrainHeight(channel.centerX, z) + MAIN_RIVER_SURFACE_OFFSET;
    const innerWater = sampleWaterState(innerX, z);
    const nearEdgeWater = sampleWaterState(nearEdgeX, z);
    const innerMask = sampleRiverSurfaceMask(innerX, z);
    const nearMask = sampleRiverSurfaceMask(nearEdgeX, z);
    const innerEdge = sampleRiverEdgeState(innerX, z);
    const nearEdge = sampleRiverEdgeState(nearEdgeX, z);
    assert(innerWater !== null, `${id} mid-bank has gameplay water at z=${z}`);
    assert(innerMask > 0.1, `${id} mid-bank has rendered surface mask at z=${z}`);
    assertRenderedWaterClearsTerrain(flatSurfaceY, innerX, z, 0.28, 0, `${id} mid-bank at z=${z}`);
    assert(
      innerEdge.zone === "shallow_water" || innerEdge.zone === "swim_water",
      `${id} mid-bank edge zone is water at z=${z}`,
    );
    if (nearEdgeWater !== null) {
      assert(nearMask > 0.05, `${id} near-edge water has surface mask at z=${z}`);
      assertRenderedWaterClearsTerrain(
        flatSurfaceY,
        nearEdgeX,
        z,
        0.92,
        MathUtils.smoothstep(0.82, 1, 0.92),
        `${id} near-edge at z=${z}`,
      );
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

    for (const [nx, nz] of [[0.42, 0.1], [-0.34, 0.38], [0.72, -0.18]] as const) {
      const x = pool.x + pool.renderRadiusX * STARTING_WATER_VISUAL_FILL_SCALE * nx;
      const z = pool.z + pool.renderRadiusZ * STARTING_WATER_VISUAL_FILL_SCALE * nz;
      const visualDistance = Math.sqrt(nx * nx + nz * nz);
      const edgeBlend = MathUtils.smoothstep(1 - pool.edgeSoftness, 1, visualDistance);
      const flatSurfaceY = sampleTerrainHeight(pool.x, pool.z) + pool.surfaceOffset;
      assertRenderedWaterClearsTerrain(
        flatSurfaceY,
        x,
        z,
        MathUtils.clamp(visualDistance, 0, 1),
        edgeBlend,
        `${pool.id} visible fill sample ${nx},${nz}`,
      );
    }
  });

  const cloudbackCreek = sampleWaterAmbience(-22, 170);
  assert(cloudbackCreek.kind === "creek", "highland creek resolves as creek ambience");
  assert(cloudbackCreek.proximity > 0.95, "highland creek has strong ambience");

  const farDryAmbience = sampleWaterAmbience(170, -190);
  assert(farDryAmbience.proximity < 0.05, "far dry meadow has no water ambience");
  assert(farDryAmbience.kind === null, "far dry meadow has no water ambience source");
}
