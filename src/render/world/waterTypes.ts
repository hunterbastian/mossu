import type { Group, Mesh } from "three";

export interface WaterRippleSource {
  x: number;
  z: number;
  startTime: number;
  strength: number;
}

export type WaterRippleMovementState =
  | "onLand"
  | "wading"
  | "swimmingSurface"
  | "underwater"
  | "splash"
  | "float"
  | "bank_wait";

export interface WaterRippleActorOptions {
  force?: boolean;
  movementState?: WaterRippleMovementState;
  rolling?: boolean;
}

export interface WaterSurfaceController {
  mesh: Mesh;
  update: (
    elapsed: number,
    ripples?: readonly WaterRippleSource[],
    mapLookdown?: boolean,
    depthDebug?: boolean,
  ) => void;
  dispose?: () => void;
}

export interface WaterSurfaceGroup {
  group: Group;
  controllers: WaterSurfaceController[];
}
