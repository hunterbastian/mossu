import { InstancedMesh, Material, Object3D } from "three";
import {
  buildAnchorSceneAccents,
  buildBiomeTransitionAccents,
  buildForestGroveAccents,
  buildGroundLayer,
  buildHighlandAccents,
  buildMidLayer,
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

export function runVisualContracts() {
  const anchorSceneAccents = buildAnchorSceneAccents();
  assert(anchorSceneAccents.userData.artDirection === ART_DIRECTION_IDS.grasslands, "grasslands art pass has an explicit direction marker");
  assert(Boolean(OOT_PS2_GRASSLANDS_PALETTE.futureLakes.clearSurface), "grasslands palette reserves lake and river color tokens for the next biome pass");
  assert(Boolean(OOT_PS2_GRASSLANDS_PALETTE.props.fence.post), "grasslands palette owns fence color tokens");
  const highlandAccents = buildHighlandAccents();
  assert(highlandAccents.userData.artDirection === ART_DIRECTION_IDS.hillsMountains, "highland art pass has an explicit codex hills marker");
  const forestGroveAccents = buildForestGroveAccents();
  assert(forestGroveAccents.userData.artDirection === ART_DIRECTION_IDS.forestGroves, "forest grove art pass has an explicit codex forest marker");
  assert(Boolean(OOT_PS2_GRASSLANDS_PALETTE.props.forestGroves.birchBark), "forest grove palette owns tree-family color tokens");
  const mossuAvatar = new MossuAvatar();
  assert(mossuAvatar.group.userData.artDirection === ART_DIRECTION_IDS.ootPs2Characters, "Mossu avatar uses the OOT / PS2 character art direction marker");
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
    assert(material.vertexColors !== true, `${mesh.name} avoids geometry vertex colors so instance tinting does not render black`);
    if (mesh.instanceColor) {
      const colors = mesh.instanceColor.array;
      for (let index = 0; index < colors.length; index += 3) {
        const red = colors[index];
        const green = colors[index + 1];
        const blue = colors[index + 2];
        const maxChannel = Math.max(red, green, blue);
        assert(Number.isFinite(red) && Number.isFinite(green) && Number.isFinite(blue), `${mesh.name} has finite instance colors`);
        assert(maxChannel > 0.08, `${mesh.name} instance color ${index / 3} is not near black`);
      }
    }
  });
}
