import { Group, Vector3 } from "three";
import { buildRiverSystem, buildStartingWaterSystem } from "./waterBodies";
import { WaterRippleController } from "./waterRipples";
import type {
  WaterRippleActorOptions,
  WaterSurfaceController,
  WaterSurfaceGroup,
} from "./waterTypes";
export { WATER_SYSTEM_TUNING, type WaterProfile, type WaterProfileKey, type WaterSystemTuning } from "./waterProfiles";
export { sampleRenderedWaterSurfaceY } from "./waterSurfaceGeometry";
export { buildHighlandWaterways } from "./waterBodies";
export type {
  WaterRippleActorOptions,
  WaterRippleSource,
  WaterSurfaceController,
  WaterSurfaceGroup,
} from "./waterTypes";

export interface WaterSystemOptions {
  depthDebug?: boolean;
  includeBaseWater?: boolean;
}

export class WaterSystem {
  readonly group = new Group();
  private readonly controllers: WaterSurfaceController[] = [];
  private readonly rippleController = new WaterRippleController();
  private depthDebugEnabled: boolean;

  constructor(options: WaterSystemOptions = {}) {
    this.depthDebugEnabled = options.depthDebug ?? false;
    if (options.includeBaseWater ?? true) {
      this.addWaterGroup(buildRiverSystem());
      this.addWaterGroup(buildStartingWaterSystem());
    }
  }

  addWaterGroup(surfaceGroup: WaterSurfaceGroup) {
    this.group.add(surfaceGroup.group);
    this.controllers.push(...surfaceGroup.controllers);
  }

  getControllers() {
    return this.controllers;
  }

  setDepthDebugEnabled(enabled: boolean) {
    this.depthDebugEnabled = enabled;
  }

  getDepthDebugEnabled() {
    return this.depthDebugEnabled;
  }

  beginFrame(elapsed: number) {
    this.rippleController.beginFrame(elapsed);
  }

  emitRippleForActor(
    key: string,
    position: Vector3,
    planarSpeed: number,
    elapsed: number,
    baseStrength: number,
    options: boolean | WaterRippleActorOptions = {},
  ) {
    this.rippleController.emitForActor(key, position, planarSpeed, elapsed, baseStrength, options);
  }

  markActorDry(key: string, position?: Vector3, elapsed?: number, baseStrength = 0.36) {
    this.rippleController.markActorDry(key, position, elapsed, baseStrength);
  }

  update(elapsed: number, mapLookdown: boolean) {
    const ripples = this.rippleController.getRipples();
    this.controllers.forEach((controller) => {
      controller.update(elapsed, ripples, mapLookdown, this.depthDebugEnabled);
    });
  }
}
