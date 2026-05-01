import { MathUtils } from "three";
import type { WaterAmbienceSample } from "../../simulation/world";

const WATER_LOOP_URL = "/audio/water-river-loop.mp3";
const WATER_BASE_VOLUME = 0.014;
const WATER_MAX_VOLUME = 0.105;
const WATER_FLOW_VOLUME_LIFT = 0.14;
const WATER_CONTACT_VOLUME_LIFT = 0.018;
const WATER_FADE_IN_RESPONSIVENESS = 2.4;
const WATER_FADE_OUT_RESPONSIVENESS = 3.8;
const WATER_STOP_VOLUME_EPSILON = 0.004;
const WATER_LOOP_CROSSFADE_SECONDS = 0.58;
const WATER_LOOP_END_GUARD_SECONDS = 0.12;
const WATER_PLAYBACK_RATE_RESPONSIVENESS = 1.8;

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
  private readonly waterLoops: HTMLAudioElement[];
  private unlocked = false;
  private active = false;
  private currentVolume = 0;
  private targetVolume = 0;
  private currentRate = 0.94;
  private activeSlot = 0;
  private crossfadeElapsed = 0;
  private crossfadeActive = false;
  private currentProximity = 0;
  private sourceKind: WaterAmbienceSample["kind"] = null;
  private distanceToWater: number | null = null;

  constructor() {
    this.waterLoops = typeof Audio === "undefined"
      ? []
      : [this.createLoopSlot(), this.createLoopSlot()];
  }

  unlock() {
    this.unlocked = true;
    if (!this.hasWaterLoop()) {
      return;
    }

    void Promise.allSettled(this.waterLoops.map((loop) => {
      loop.volume = 0;
      loop.playbackRate = this.currentRate;
      return loop.play()
        .then(() => {
          loop.pause();
          loop.currentTime = 0;
        });
    })).catch(() => {
      // Browser gesture policies can reject warm-up playback; update() will
      // retry once the player is near water after a valid page interaction.
    });
  }

  update({ dt, ambience, muted }: AmbientWaterAudioUpdate) {
    if (!this.hasWaterLoop()) {
      return;
    }

    this.currentProximity = MathUtils.clamp(ambience.proximity, 0, 1);
    this.sourceKind = ambience.kind;
    this.distanceToWater = Number.isFinite(ambience.distanceToWater) ? ambience.distanceToWater : null;

    const proximityCurve = this.currentProximity * this.currentProximity;
    const flowLift = MathUtils.clamp(ambience.flowStrength * WATER_FLOW_VOLUME_LIFT, 0, 0.09);
    const contactLift = ambience.insideWater ? WATER_CONTACT_VOLUME_LIFT : 0;
    this.targetVolume = muted || this.currentProximity <= 0.01
      ? 0
      : MathUtils.clamp(WATER_BASE_VOLUME + proximityCurve * (WATER_MAX_VOLUME + flowLift) + contactLift, 0, 0.135);
    const targetRate = MathUtils.clamp(0.9 + ambience.flowStrength * 0.08 + this.currentProximity * 0.025, 0.9, 1.01);

    this.currentVolume = MathUtils.damp(
      this.currentVolume,
      this.targetVolume,
      this.targetVolume > this.currentVolume ? WATER_FADE_IN_RESPONSIVENESS : WATER_FADE_OUT_RESPONSIVENESS,
      dt,
    );
    this.currentRate = MathUtils.damp(this.currentRate, targetRate, WATER_PLAYBACK_RATE_RESPONSIVENESS, dt);
    this.waterLoops.forEach((loop) => {
      loop.playbackRate = this.currentRate;
    });

    const shouldPlay = this.targetVolume > WATER_STOP_VOLUME_EPSILON && this.unlocked;

    if (shouldPlay && this.ensureSlotPlaying(this.activeSlot)) {
      this.updateLoopCrossfade(dt);
      this.active = this.waterLoops.some((loop) => !loop.paused && loop.volume > WATER_STOP_VOLUME_EPSILON);
      return;
    }

    if (this.targetVolume <= WATER_STOP_VOLUME_EPSILON && this.currentVolume <= WATER_STOP_VOLUME_EPSILON) {
      this.stop(false);
      return;
    }

    this.applySlotVolumes(0);
    this.active = this.waterLoops.some((loop) => !loop.paused && loop.volume > WATER_STOP_VOLUME_EPSILON);
  }

  stop(clearTarget = true) {
    this.currentVolume = 0;
    this.crossfadeElapsed = 0;
    this.crossfadeActive = false;
    if (clearTarget) {
      this.targetVolume = 0;
      this.currentProximity = 0;
      this.sourceKind = null;
      this.distanceToWater = null;
    }
    this.active = false;
    this.waterLoops.forEach((loop) => {
      loop.volume = 0;
      loop.pause();
    });
  }

  dispose() {
    this.stop();
    this.waterLoops.forEach((loop) => {
      loop.removeAttribute("src");
      loop.load();
    });
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

  private createLoopSlot() {
    const loop = new Audio(WATER_LOOP_URL);
    loop.loop = false;
    loop.preload = "auto";
    loop.volume = 0;
    loop.playbackRate = this.currentRate;
    return loop;
  }

  private hasWaterLoop() {
    return this.waterLoops.length > 0;
  }

  private ensureSlotPlaying(slot: number) {
    const loop = this.waterLoops[slot];
    if (!loop) {
      return false;
    }
    if (!loop.paused) {
      return true;
    }

    loop.volume = 0;
    if (loop.ended || loop.currentTime >= Math.max(0, loop.duration - WATER_LOOP_END_GUARD_SECONDS)) {
      loop.currentTime = 0;
    }
    void loop
      .play()
      .then(() => {
        this.active = true;
      })
      .catch(() => {
        this.active = false;
      });
    return false;
  }

  private updateLoopCrossfade(dt: number) {
    const activeLoop = this.waterLoops[this.activeSlot];
    if (!activeLoop) {
      return;
    }

    const duration = Number.isFinite(activeLoop.duration) ? activeLoop.duration : 0;
    const nextSlot = 1 - this.activeSlot;
    if (
      !this.crossfadeActive &&
      duration > WATER_LOOP_CROSSFADE_SECONDS + WATER_LOOP_END_GUARD_SECONDS &&
      activeLoop.currentTime >= duration - WATER_LOOP_CROSSFADE_SECONDS - WATER_LOOP_END_GUARD_SECONDS
    ) {
      const nextLoop = this.waterLoops[nextSlot];
      nextLoop.currentTime = 0;
      nextLoop.volume = 0;
      nextLoop.playbackRate = this.currentRate;
      void nextLoop.play().catch(() => {
        this.crossfadeActive = false;
      });
      this.crossfadeElapsed = 0;
      this.crossfadeActive = true;
    }

    if (!this.crossfadeActive) {
      this.applySlotVolumes(0);
      return;
    }

    this.crossfadeElapsed += dt;
    const mix = MathUtils.smoothstep(
      MathUtils.clamp(this.crossfadeElapsed / WATER_LOOP_CROSSFADE_SECONDS, 0, 1),
      0,
      1,
    );
    this.applySlotVolumes(mix);

    if (mix >= 1) {
      activeLoop.volume = 0;
      activeLoop.pause();
      activeLoop.currentTime = 0;
      this.activeSlot = nextSlot;
      this.crossfadeElapsed = 0;
      this.crossfadeActive = false;
      this.applySlotVolumes(0);
    }
  }

  private applySlotVolumes(crossfadeMix: number) {
    const activeLoop = this.waterLoops[this.activeSlot];
    const nextLoop = this.waterLoops[1 - this.activeSlot];
    const safeVolume = MathUtils.clamp(this.currentVolume, 0, 1);

    if (activeLoop) {
      activeLoop.volume = safeVolume * (1 - crossfadeMix);
    }
    if (nextLoop) {
      nextLoop.volume = safeVolume * crossfadeMix;
    }
  }
}
