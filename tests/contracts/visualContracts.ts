import { InstancedMesh, Material, Object3D, Vector3 } from "three";
import type { PlayerState } from "../../src/simulation/gameState";
import {
  DISTANT_BIRD_COUNT,
  GRASSLAND_LIFE_SIGNAL_COUNT,
  buildGrasslandImmersionSystem,
  updateGrasslandImmersionSystem,
} from "../../src/render/world/grasslandImmersion";
import {
  buildAnchorSceneAccents,
  buildBiomeTransitionAccents,
  buildForestGroveAccents,
  buildGroundLayer,
  buildHighlandAccents,
  buildMidLayer,
  TREE_SCALE_LOCK,
  buildTreeClusters,
  buildWaterBankAccents,
} from "../../src/render/world/terrainDecorations";
import { MossuAvatar } from "../../src/render/objects/MossuAvatar";
import { ART_DIRECTION_IDS, OOT_PS2_GRASSLANDS_PALETTE } from "../../src/render/visualPalette";
import { assert } from "./testHarness";

function collectSmallPropMeshes(root: Object3D) {
  const meshes: InstancedMesh[] = [];
  root.traverse((node) => {
    const mesh = node as InstancedMesh;
    if (mesh.isInstancedMesh && mesh.userData.smallPropBatch) {
      meshes.push(mesh);
    }
  });
  return meshes;
}

function makeAnimationPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    position: new Vector3(0, 8, 0),
    velocity: new Vector3(0, 0, 0),
    heading: 0,
    stamina: 100,
    staminaMax: 100,
    staminaVisible: false,
    rolling: false,
    rollingBoostActive: false,
    rollHoldSeconds: 0,
    rollModeReady: true,
    floating: false,
    grounded: true,
    swimming: false,
    waterMode: "onLand",
    waterDepth: 0,
    waterSurfaceY: 0,
    fallingToVoid: false,
    voidFallTime: 0,
    justLanded: false,
    justRespawned: false,
    landingImpact: 0,
    jumpChargeReleasedThisFrame: false,
    jumpChargeReleasedRatio: 0,
    airBoostFiredThisFrame: false,
    ...overrides,
  };
}

function assertFiniteObjectTransform(root: Object3D, label: string) {
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    object.matrixWorld.elements.forEach((value) => {
      assert(Number.isFinite(value), `${label} keeps finite transforms through animation updates`);
    });
  });
}

export function runVisualContracts() {
  const anchorSceneAccents = buildAnchorSceneAccents();
  assert(
    anchorSceneAccents.userData.artDirection === ART_DIRECTION_IDS.grasslands,
    "grasslands art pass has an explicit direction marker",
  );
  assert(
    Boolean(OOT_PS2_GRASSLANDS_PALETTE.futureLakes.clearSurface),
    "grasslands palette reserves lake and river color tokens for the next biome pass",
  );
  assert(Boolean(OOT_PS2_GRASSLANDS_PALETTE.props.signpost.post), "grasslands palette owns signpost color tokens");
  assert(TREE_SCALE_LOCK === 4, "world trees keep the requested four-times scale lock");
  const highlandAccents = buildHighlandAccents();
  assert(
    highlandAccents.userData.artDirection === ART_DIRECTION_IDS.hillsMountains,
    "highland art pass has an explicit codex hills marker",
  );
  const forestGroveAccents = buildForestGroveAccents();
  assert(
    forestGroveAccents.userData.artDirection === ART_DIRECTION_IDS.forestGroves,
    "forest grove art pass has an explicit codex forest marker",
  );
  assert(
    Boolean(OOT_PS2_GRASSLANDS_PALETTE.props.forestGroves.birchBark),
    "forest grove palette owns tree-family color tokens",
  );
  const mossuAvatar = new MossuAvatar();
  assert(
    mossuAvatar.group.userData.artDirection === ART_DIRECTION_IDS.ootPs2Characters,
    "Mossu avatar uses the OOT / PS2 character art direction marker",
  );
  mossuAvatar.update(
    makeAnimationPlayer({ velocity: new Vector3(18, 0, 2), rolling: true, rollHoldSeconds: 0.3 }),
    1 / 60,
  );
  mossuAvatar.update(makeAnimationPlayer({ velocity: new Vector3(1.2, 0, 0), rolling: false }), 1 / 60);
  mossuAvatar.update(
    makeAnimationPlayer({ velocity: new Vector3(4, -7, 0), justLanded: true, landingImpact: 5 }),
    1 / 60,
  );
  assertFiniteObjectTransform(mossuAvatar.group, "Mossu visual transition pulses");
  const grasslandImmersion = buildGrasslandImmersionSystem();
  updateGrasslandImmersionSystem(grasslandImmersion, 1.2, false);
  assert(
    grasslandImmersion.lifeSignals.geometry.getAttribute("position").count === GRASSLAND_LIFE_SIGNAL_COUNT,
    "living habitat signals keep a small fixed particle budget",
  );
  assert(
    GRASSLAND_LIFE_SIGNAL_COUNT <= 128,
    "living habitat signals stay bounded so world life does not become a perf-heavy critter sim",
  );
  assert(grasslandImmersion.distantBirds.count === DISTANT_BIRD_COUNT, "distant birds keep a small fixed flock budget");
  assert(
    DISTANT_BIRD_COUNT <= 16,
    "distant birds stay far-field and bounded instead of becoming a gameplay fauna system",
  );
  const roots = [
    buildGroundLayer(),
    buildMidLayer(),
    buildTreeClusters(),
    buildBiomeTransitionAccents(),
    buildWaterBankAccents(),
    anchorSceneAccents,
    highlandAccents,
    forestGroveAccents,
  ];
  const smallPropMeshes = roots.flatMap(collectSmallPropMeshes);

  assert(smallPropMeshes.length > 0, "world decoration layers include small-prop batches");
  smallPropMeshes.forEach((mesh) => {
    const material = mesh.material as Material & { vertexColors?: boolean };
    assert(mesh.count > 0, `${mesh.name} has at least one instance`);
    assert(Boolean(mesh.instanceColor), `${mesh.name} has instance color data`);
    assert(
      material.vertexColors !== true,
      `${mesh.name} avoids geometry vertex colors so instance tinting does not render black`,
    );
    if (mesh.instanceColor) {
      const colors = mesh.instanceColor.array;
      for (let index = 0; index < colors.length; index += 3) {
        const red = colors[index];
        const green = colors[index + 1];
        const blue = colors[index + 2];
        const maxChannel = Math.max(red, green, blue);
        assert(
          Number.isFinite(red) && Number.isFinite(green) && Number.isFinite(blue),
          `${mesh.name} has finite instance colors`,
        );
        assert(maxChannel > 0.08, `${mesh.name} instance color ${index / 3} is not near black`);
      }
    }
  });
}
