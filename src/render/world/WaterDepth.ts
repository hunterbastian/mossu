import { MathUtils } from "three";
import { sampleTerrainHeight } from "../../simulation/world";

export interface WaterDepthSample {
  terrainY: number;
  depth: number;
  normalizedDepth: number;
}

export interface WaterDepthOptions {
  depthMax?: number;
}

export const DEFAULT_WATER_DEPTH_MAX = 5.2;

/**
 * Shared depth sampler for stylized water.
 *
 * Depth is calculated from the rendered water surface minus sampled terrain
 * height. This keeps shallow/deep color bands aligned with the same filled
 * surface that hides terrain seams around banks.
 */
export class WaterDepth {
  readonly depthMax: number;

  constructor(options: WaterDepthOptions = {}) {
    this.depthMax = options.depthMax ?? DEFAULT_WATER_DEPTH_MAX;
  }

  sample(surfaceY: number, x: number, z: number): WaterDepthSample {
    const terrainY = sampleTerrainHeight(x, z);
    const depth = Math.max(0, surfaceY - terrainY);
    return {
      terrainY,
      depth,
      normalizedDepth: MathUtils.clamp(depth / this.depthMax, 0, 1),
    };
  }
}

export const waterDepth = new WaterDepth();
