import { MathUtils, Vector3 } from "three";
import { sampleWaterState } from "../../simulation/world";
import type { WaterRippleActorOptions, WaterRippleSource } from "./waterTypes";

export const WATER_RIPPLE_LIMIT = 10;
export const WATER_RIPPLE_LIFETIME = 2.1;
export const WATER_RIPPLE_MIN_DEPTH = 0.16;

interface WaterRippleActorState {
  inWater: boolean;
  lastEmitAt: number;
  lastWaterX: number;
  lastWaterZ: number;
  lastDepth: number;
}

export class WaterRippleController {
  private readonly ripples: WaterRippleSource[] = [];
  private readonly actorStates = new Map<string, WaterRippleActorState>();

  getRipples(): readonly WaterRippleSource[] {
    return this.ripples;
  }

  beginFrame(elapsed: number) {
    for (let index = this.ripples.length - 1; index >= 0; index -= 1) {
      if (elapsed - this.ripples[index].startTime > WATER_RIPPLE_LIFETIME) {
        this.ripples.splice(index, 1);
      }
    }
  }

  emitForActor(
    key: string,
    position: Vector3,
    planarSpeed: number,
    elapsed: number,
    baseStrength: number,
    options: boolean | WaterRippleActorOptions = {},
  ) {
    const normalizedOptions: WaterRippleActorOptions = typeof options === "boolean" ? { force: options } : options;
    const water = sampleWaterState(position.x, position.z);
    const inWater = !!water && water.depth > WATER_RIPPLE_MIN_DEPTH;
    const state = this.actorStates.get(key) ?? {
      inWater: false,
      lastEmitAt: -999,
      lastWaterX: position.x,
      lastWaterZ: position.z,
      lastDepth: 0,
    };
    const enteredWater = inWater && !state.inWater;
    const exitedWater = !inWater && state.inWater;

    if (inWater && water) {
      const speedFactor = MathUtils.clamp(planarSpeed / 9, 0, 1);
      const depthFactor = water.swimAllowed ? 1 : MathUtils.clamp(water.depth / 1.8, 0.35, 1);
      const shallowBankFactor = water.depth < 0.72 || !water.swimAllowed ? 1.18 : 1;
      const movementFactor =
        normalizedOptions.movementState === "swimmingSurface" || normalizedOptions.movementState === "underwater"
          ? 1.18
          : normalizedOptions.movementState === "wading" || normalizedOptions.movementState === "splash"
            ? 1.14
            : normalizedOptions.movementState === "bank_wait"
              ? 0.82
              : normalizedOptions.movementState === "float"
                ? 0.92
                : 1;
      const rollFactor = normalizedOptions.rolling ? 1.12 : 1;
      const entryBoost = enteredWater ? (water.swimAllowed ? 0.32 : 0.2) : 0;
      const interval =
        MathUtils.lerp(0.34, 0.1, speedFactor) *
        (baseStrength < 0.7 ? 1.12 : 1) *
        (normalizedOptions.movementState === "wading" || normalizedOptions.movementState === "bank_wait" ? 0.9 : 1);
      const force = normalizedOptions.force ?? false;
      if ((force || enteredWater || speedFactor > 0.1) && elapsed - state.lastEmitAt >= (force ? 0.04 : interval)) {
        this.ripples.push({
          x: position.x,
          z: position.z,
          startTime: elapsed,
          strength: MathUtils.clamp(
            (baseStrength + entryBoost) *
              (0.5 + speedFactor * 0.64) *
              depthFactor *
              shallowBankFactor *
              movementFactor *
              rollFactor,
            0.22,
            1.65,
          ),
        });
        state.lastEmitAt = elapsed;
        this.trim();
      }
      state.lastWaterX = position.x;
      state.lastWaterZ = position.z;
      state.lastDepth = water.depth;
    } else if (exitedWater && elapsed - state.lastEmitAt >= 0.08) {
      this.ripples.push({
        x: state.lastWaterX,
        z: state.lastWaterZ,
        startTime: elapsed,
        strength: MathUtils.clamp(
          baseStrength * (0.42 + MathUtils.clamp(planarSpeed / 11, 0, 0.55)) + state.lastDepth * 0.08,
          0.18,
          0.95,
        ),
      });
      state.lastEmitAt = elapsed;
      this.trim();
    }

    state.inWater = inWater;
    this.actorStates.set(key, state);
  }

  markActorDry(key: string, position?: Vector3, elapsed?: number, baseStrength = 0.36) {
    const state = this.actorStates.get(key);
    if (state) {
      if (state.inWater && position && typeof elapsed === "number" && elapsed - state.lastEmitAt >= 0.1) {
        this.ripples.push({
          x: state.lastWaterX,
          z: state.lastWaterZ,
          startTime: elapsed,
          strength: MathUtils.clamp(baseStrength + state.lastDepth * 0.06, 0.16, 0.72),
        });
        state.lastEmitAt = elapsed;
        this.trim();
      }
      state.inWater = false;
    }
  }

  private trim() {
    if (this.ripples.length > WATER_RIPPLE_LIMIT) {
      this.ripples.splice(0, this.ripples.length - WATER_RIPPLE_LIMIT);
    }
  }
}
