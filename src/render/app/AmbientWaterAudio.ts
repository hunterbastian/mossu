import { MathUtils } from "three";
import type { WaterAmbienceSample } from "../../simulation/world";

const WATER_LOOP_URL = "/audio/water-river-loop.mp3";
const WATER_BASE_VOLUME = 0.03;
const WATER_MAX_VOLUME = 0.18;
const WATER_FADE_IN_RESPONSIVENESS = 3.4;
const WATER_FADE_OUT_RESPONSIVENESS = 5.6;
const WATER_STOP_VOLUME_EPSILON = 0.006;

export interface AmbientWaterAudioState {
  active: boolean;
  volume: number;
  targetVolume: number;
  proximity: number;
  sourceKind: WaterAmbienceSample["kind"];
  distanceToWater: number | null;
  unlocked: boolean;
}

export interface AmbientWaterAudioUpdate {
  dt: number;
  ambience: WaterAmbienceSample;
  muted: boolean;
}

export class AmbientWaterAudio {
  private readonly waterLoop: HTMLAudioElement | null;
  private unlocked = false;
  private active = false;
  private currentVolume = 0;
  private targetVolume = 0;
  private currentProximity = 0;
  private sourceKind: WaterAmbienceSample["kind"] = null;
  private distanceToWater: number | null = null;

  constructor() {
    this.waterLoop = typeof Audio === "undefined" ? null : new Audio(WATER_LOOP_URL);
    if (!this.waterLoop) {
      return;
    }

    this.waterLoop.loop = true;
    this.waterLoop.preload = "auto";
    this.waterLoop.volume = 0;
  }

  unlock() {
    this.unlocked = true;
    if (!this.waterLoop) {
      return;
    }

    this.waterLoop.volume = 0;
    void this.waterLoop
      .play()
      .then(() => {
        this.waterLoop?.pause();
        if (this.waterLoop) {
          this.waterLoop.currentTime = 0;
        }
      })
      .catch(() => {
        // Browser gesture policies can reject warm-up playback; update() will
        // retry once the player is near water after a valid page interaction.
      });
  }

  update({ dt, ambience, muted }: AmbientWaterAudioUpdate) {
    if (!this.waterLoop) {
      return;
    }

    this.currentProximity = MathUtils.clamp(ambience.proximity, 0, 1);
    this.sourceKind = ambience.kind;
    this.distanceToWater = Number.isFinite(ambience.distanceToWater) ? ambience.distanceToWater : null;

    const proximityCurve = this.currentProximity * this.currentProximity;
    const flowLift = MathUtils.clamp(ambience.flowStrength * 0.34, 0, 0.2);
    const contactLift = ambience.insideWater ? 0.035 : 0;
    this.targetVolume = muted || this.currentProximity <= 0.01
      ? 0
      : MathUtils.clamp(WATER_BASE_VOLUME + proximityCurve * (WATER_MAX_VOLUME + flowLift) + contactLift, 0, 0.24);

    this.currentVolume = MathUtils.damp(
      this.currentVolume,
      this.targetVolume,
      this.targetVolume > this.currentVolume ? WATER_FADE_IN_RESPONSIVENESS : WATER_FADE_OUT_RESPONSIVENESS,
      dt,
    );

    this.waterLoop.volume = MathUtils.clamp(this.currentVolume, 0, 1);

    if (this.targetVolume > WATER_STOP_VOLUME_EPSILON && this.unlocked && this.waterLoop.paused) {
      void this.waterLoop
        .play()
        .then(() => {
          this.active = true;
        })
        .catch(() => {
          this.active = false;
        });
      return;
    }

    if (this.targetVolume <= WATER_STOP_VOLUME_EPSILON && this.currentVolume <= WATER_STOP_VOLUME_EPSILON) {
      this.stop(false);
      return;
    }

    this.active = !this.waterLoop.paused && this.currentVolume > WATER_STOP_VOLUME_EPSILON;
  }

  stop(clearTarget = true) {
    this.currentVolume = 0;
    if (clearTarget) {
      this.targetVolume = 0;
      this.currentProximity = 0;
      this.sourceKind = null;
      this.distanceToWater = null;
    }
    this.active = false;
    if (!this.waterLoop) {
      return;
    }
    this.waterLoop.volume = 0;
    this.waterLoop.pause();
  }

  dispose() {
    this.stop();
    if (!this.waterLoop) {
      return;
    }
    this.waterLoop.removeAttribute("src");
    this.waterLoop.load();
  }

  getState(): AmbientWaterAudioState {
    return {
      active: this.active,
      volume: Number(this.currentVolume.toFixed(3)),
      targetVolume: Number(this.targetVolume.toFixed(3)),
      proximity: Number(this.currentProximity.toFixed(3)),
      sourceKind: this.sourceKind,
      distanceToWater: this.distanceToWater === null ? null : Number(this.distanceToWater.toFixed(1)),
      unlocked: this.unlocked,
    };
  }
}
