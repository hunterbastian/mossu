import { DoubleSide, FrontSide, MeshBasicMaterial } from "three";
import type { WaterProfile } from "./waterProfiles";
import type { WaterSurfaceColors } from "./waterSurfaceColors";
import type { WaterSurfaceOptions } from "./waterSurfaceGeometry";

export interface WaterSurfaceMaterials {
  material: MeshBasicMaterial;
  fillMaterial: MeshBasicMaterial;
  volumeMaterial: MeshBasicMaterial;
  baseOpacity: number;
}

function resolveVolumeOpacity(profile: WaterProfile) {
  if (profile.key === "waterfallOutflow") {
    return 0.0012;
  }
  if (profile.key === "alpineRunoff" || profile.key === "foothillCreek") {
    return 0.0014;
  }
  return 0.0016;
}

export function createWaterSurfaceMaterials(
  profile: WaterProfile,
  options: WaterSurfaceOptions,
  colors: WaterSurfaceColors,
): WaterSurfaceMaterials {
  const { shallowColor, deepColor } = colors;
  const material = new MeshBasicMaterial({
    color: shallowColor,
    transparent: true,
    opacity: options.opacity ?? profile.opacity,
    depthWrite: false,
    side: DoubleSide,
    dithering: true,
  });
  const fillMaterial = new MeshBasicMaterial({
    color: deepColor.clone().lerp(shallowColor, profile.key === "stillPool" ? 0.36 : 0.28),
    transparent: true,
    opacity: profile.key === "stillPool" ? 0.004 : 0.003,
    depthWrite: false,
    side: FrontSide,
  });
  const volumeMaterial = new MeshBasicMaterial({
    color: deepColor.clone().lerp(shallowColor, profile.key === "stillPool" ? 0.42 : 0.34),
    transparent: true,
    opacity: resolveVolumeOpacity(profile),
    depthWrite: false,
    side: FrontSide,
    dithering: true,
  });

  return {
    material,
    fillMaterial,
    volumeMaterial,
    baseOpacity: material.opacity,
  };
}
