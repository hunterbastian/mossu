/**
 * Lightweight geometry counting helpers used by `?perfDebug=1` HUD stats.
 * Indexed geometries report triangles via the index buffer; non-indexed
 * geometries fall back to position count / 3.
 */

import { BufferGeometry, InstancedMesh } from "three";

export function countGeometryVertices(geometry: BufferGeometry) {
  return geometry.getAttribute("position")?.count ?? 0;
}

export function countGeometryTriangles(geometry: BufferGeometry) {
  const index = geometry.getIndex();
  if (index) {
    return Math.floor(index.count / 3);
  }
  return Math.floor(countGeometryVertices(geometry) / 3);
}

export function countInstancedTriangles(meshes: readonly InstancedMesh[]) {
  return meshes.reduce(
    (total, mesh) => total + countGeometryTriangles(mesh.geometry) * mesh.count,
    0,
  );
}
