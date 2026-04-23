import { Mesh, Vector3 } from "three";

export function markCameraCollider(mesh: Mesh) {
  mesh.userData.cameraCollider = true;
  return mesh;
}

export function scatterAroundPocket(
  pocket: { position: Vector3; radius: number },
  index: number,
  radiusScale = 1,
) {
  const angleSeed = Math.sin((index + 1) * 12.9898 + pocket.position.x * 0.013 + pocket.position.z * 0.019) * 43758.5453;
  const radiusSeed = Math.sin((index + 1) * 78.233 + pocket.position.x * 0.031 - pocket.position.z * 0.017) * 12415.713;
  const angle = (angleSeed - Math.floor(angleSeed)) * Math.PI * 2;
  const radius = (0.16 + (radiusSeed - Math.floor(radiusSeed)) * 0.82) * pocket.radius * radiusScale;
  return {
    x: pocket.position.x + Math.cos(angle) * radius,
    z: pocket.position.z + Math.sin(angle) * radius,
  };
}
