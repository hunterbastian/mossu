import { BufferGeometry, Mesh, Vector3 } from "three";
import { createSharedWaterWaveUniforms } from "./waterShaderUniforms";
import { createWaterSurfaceColors } from "./waterSurfaceColors";
import { configureWaterFillShader } from "./waterFillShader";
import { buildWaterRibbonGeometry, createLakeGeometry, type WaterSurfaceOptions } from "./waterSurfaceGeometry";
import { createWaterSurfaceMaterials } from "./waterSurfaceMaterials";
import { createWaterSurfaceLayers } from "./waterSurfaceLayers";
import type { WaterProfile } from "./waterProfiles";
import { WaterSurface } from "./waterSurfaceController";
import type { WaterSurfaceController } from "./waterTypes";
import { configureWaterSurfaceShader } from "./waterSurfaceShader";
import { configureWaterVolumeShader } from "./waterVolumeShader";

type WaterSurfaceBackend = "webgl";

function createWebGLWaterController(
  geometry: BufferGeometry,
  profile: WaterProfile,
  options: WaterSurfaceOptions,
  flowDirection: number,
  phaseOffset: number,
): WaterSurfaceController {
  const colors = createWaterSurfaceColors(profile);
  /** Time/ripple/flow uniforms shared with underfill so both surfaces get identical vertex displacement. */
  const sharedWaterWaveUniforms = createSharedWaterWaveUniforms(profile, options, flowDirection);
  const { material, fillMaterial, volumeMaterial, baseOpacity } = createWaterSurfaceMaterials(profile, options, colors);
  const { volumeGeometry, volumeLayer, fillLayer } = createWaterSurfaceLayers(geometry, profile, fillMaterial, volumeMaterial);

  configureWaterVolumeShader(volumeMaterial, sharedWaterWaveUniforms, colors, profile);
  configureWaterFillShader(fillMaterial, sharedWaterWaveUniforms, colors, profile);
  configureWaterSurfaceShader(material, sharedWaterWaveUniforms, colors, profile);

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.add(volumeLayer, fillLayer);
  return new WaterSurface({
    mesh,
    surfaceGeometry: geometry,
    volumeGeometry,
    material,
    volumeMaterial,
    fillMaterial,
    uniforms: sharedWaterWaveUniforms,
    baseOpacity,
    phaseOffset,
  });
}

function createWebGLWaterSurface(points: Vector3[], options: WaterSurfaceOptions): WaterSurfaceController {
  const { geometry, flowDirection } = buildWaterRibbonGeometry(points, options);
  const phaseOffset = (points[0]?.x ?? 0) * 0.021 + (points[0]?.z ?? 0) * 0.013;
  return createWebGLWaterController(geometry, options.profile, options, flowDirection, phaseOffset);
}

export function createLakeSurface(
  center: Vector3,
  options: WaterSurfaceOptions,
  shape: {
    radiusX: number;
    radiusZ: number;
    radialSegments?: number;
    rings?: number;
    edgeSoftness?: number;
  },
): WaterSurfaceController {
  const geometry = createLakeGeometry(
    center,
    shape.radiusX,
    shape.radiusZ,
    shape.radialSegments,
    shape.rings,
    shape.edgeSoftness,
  );
  const phaseOffset = center.x * 0.021 + center.z * 0.013;
  return createWebGLWaterController(geometry, options.profile, options, 1, phaseOffset);
}

export function createWaterSurface(
  points: Vector3[],
  options: WaterSurfaceOptions,
  backend: WaterSurfaceBackend = "webgl",
): WaterSurfaceController {
  switch (backend) {
    case "webgl":
    default:
      return createWebGLWaterSurface(points, options);
  }
}
