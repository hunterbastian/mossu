import { Mesh, type BufferGeometry, type MeshBasicMaterial } from "three";
import { createWaterVolumeGeometry } from "./waterSurfaceGeometry";
import type { WaterProfile } from "./waterProfiles";

export function createWaterSurfaceLayers(
  geometry: BufferGeometry,
  profile: WaterProfile,
  fillMaterial: MeshBasicMaterial,
  volumeMaterial: MeshBasicMaterial,
) {
  const volumeGeometry = createWaterVolumeGeometry(geometry);
  const volumeLayer = new Mesh(volumeGeometry, volumeMaterial);
  volumeLayer.renderOrder = 0;
  volumeLayer.name = `${profile.key}-water-volume`;
  const fillLayer = new Mesh(geometry, fillMaterial);
  fillLayer.renderOrder = 1;
  fillLayer.name = `${profile.key}-water-underfill`;

  return { volumeGeometry, volumeLayer, fillLayer };
}
