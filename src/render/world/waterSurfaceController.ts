import type { BufferGeometry, Mesh, MeshBasicMaterial } from "three";
import type { SharedWaterWaveUniforms } from "./waterShaderUniforms";
import { WATER_RIPPLE_LIMIT } from "./waterRipples";
import type { WaterRippleSource, WaterSurfaceController } from "./waterTypes";

interface WaterSurfaceResources {
  mesh: Mesh;
  surfaceGeometry: BufferGeometry;
  volumeGeometry: BufferGeometry;
  material: MeshBasicMaterial;
  volumeMaterial: MeshBasicMaterial;
  fillMaterial: MeshBasicMaterial;
  uniforms: SharedWaterWaveUniforms;
  baseOpacity: number;
  phaseOffset: number;
}

export class WaterSurface implements WaterSurfaceController {
  readonly mesh: Mesh;

  constructor(private readonly resources: WaterSurfaceResources) {
    this.mesh = resources.mesh;
  }

  update(elapsed: number, ripples: readonly WaterRippleSource[] = [], mapLookdown = false, depthDebug = false) {
    const { material, uniforms, baseOpacity } = this.resources;
    material.opacity = mapLookdown ? 0.98 : baseOpacity;
    uniforms.uTime.value = elapsed + this.resources.phaseOffset;
    uniforms.uRippleTime.value = elapsed;
    uniforms.uRippleCount.value = Math.min(WATER_RIPPLE_LIMIT, ripples.length);
    uniforms.uMapLookdown.value = mapLookdown ? 1 : 0;
    uniforms.uDepthDebug.value = depthDebug ? 1 : 0;
    const sources = uniforms.uRippleSources.value;
    for (let i = 0; i < WATER_RIPPLE_LIMIT; i += 1) {
      const ripple = ripples[i];
      sources[i].set(ripple?.x ?? 0, ripple?.z ?? 0, ripple?.startTime ?? -999, ripple?.strength ?? 0);
    }
  }

  dispose() {
    const { surfaceGeometry, volumeGeometry, material, volumeMaterial, fillMaterial } = this.resources;
    surfaceGeometry.dispose();
    volumeGeometry.dispose();
    material.dispose();
    volumeMaterial.dispose();
    fillMaterial.dispose();
  }
}
