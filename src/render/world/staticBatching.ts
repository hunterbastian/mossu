/**
 * Static decoration batching and matrix-freezing helpers.
 *
 * `freezeStaticHierarchy`: freeze object matrices for hierarchies that never
 * move — saves a Matrix4 multiply per frame per child.
 *
 * `batchStaticDecorations`: merge meshes that share material into one mesh per
 * material bucket — collapses many draw calls into a few. Skips meshes flagged
 * with shaders, instancing, or camera-collider userData.
 *
 * `moveChildren`: hoist children from a temporary builder Group into a
 * pre-existing scene Group without re-parenting allocations.
 */

import { BufferGeometry, Color, Group, Material, Mesh, Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export function freezeStaticHierarchy(object: Object3D) {
  object.traverse((child) => {
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
}

function materialBatchKey(material: Material) {
  const materialWithColor = material as Material & {
    color?: Color;
    roughness?: number;
    metalness?: number;
  };
  return [
    material.type,
    materialWithColor.color?.getHexString() ?? "no-color",
    material.transparent ? "transparent" : "opaque",
    material.opacity.toFixed(3),
    material.side,
    material.depthWrite ? "depth-write" : "no-depth-write",
    material.depthTest ? "depth-test" : "no-depth-test",
    materialWithColor.roughness?.toFixed(2) ?? "no-roughness",
    materialWithColor.metalness?.toFixed(2) ?? "no-metalness",
    material.userData.treeLeafWindEnabled ? "tree-leaf-wind" : "static",
  ].join("|");
}

function canBatchStaticMesh(mesh: Mesh) {
  if (mesh.userData.cameraCollider || mesh.userData.canopyWind || mesh.userData.shader || mesh.userData.windShader) {
    return false;
  }
  if ((mesh as Mesh & { isInstancedMesh?: boolean }).isInstancedMesh || Array.isArray(mesh.material)) {
    return false;
  }
  return Boolean(mesh.geometry?.getAttribute("position"));
}

export function batchStaticDecorations<T extends Object3D>(root: T, name: string): T {
  const buckets = new Map<string, { material: Material; meshes: Mesh[] }>();
  const batchedMeshes: Mesh[] = [];

  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !canBatchStaticMesh(mesh)) {
      return;
    }
    const material = mesh.material as Material;
    const key = materialBatchKey(material);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.meshes.push(mesh);
    } else {
      buckets.set(key, { material, meshes: [mesh] });
    }
  });

  buckets.forEach(({ material, meshes }, key) => {
    if (meshes.length < 2) {
      return;
    }

    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      return geometry;
    });
    const mergedGeometry = mergeGeometries(geometries, false);
    geometries.forEach((geometry: BufferGeometry) => geometry.dispose());
    if (!mergedGeometry) {
      return;
    }

    meshes.forEach((mesh) => {
      mesh.parent?.remove(mesh);
    });

    mergedGeometry.computeBoundingSphere();
    const batchedMaterial = material.userData.treeLeafWindEnabled ? material : material.clone();
    const batchedMesh = new Mesh(mergedGeometry, batchedMaterial);
    batchedMesh.name = `${name}-${key}`;
    if (material.userData.treeLeafWindEnabled) {
      batchedMesh.userData.treeLeafWind = true;
    }
    batchedMesh.matrixAutoUpdate = false;
    batchedMesh.updateMatrix();
    batchedMeshes.push(batchedMesh);
  });

  batchedMeshes.forEach((mesh) => root.add(mesh));
  return root;
}

export function moveChildren(target: Group, source: Group) {
  while (source.children.length > 0) {
    target.add(source.children[0]);
  }
}
