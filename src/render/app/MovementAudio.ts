import { MathUtils } from "three";

const FOOTSTEPS_URL = "/audio/footsteps-grass-loop.mp3";
const FADE_IN_RESPONSIVENESS = 10;
const FADE_OUT_RESPONSIVENESS = 18;
const STOP_VOLUME_EPSILON = 0.012;

export interface MovementAudioState {
  footstepsActive: boolean;
  footstepsVolume: number;
  footstepRate: number;
  unlocked: boolean;
}

export interface MovementAudioUpdate {
  dt: number;
  shouldPlay: boolean;
  speed: number;
  rolling: boolean;
}

export class MovementAudio {
  private readonly footsteps: HTMLAudioElement | null;
  private unlocked = false;
  private active = false;
  private currentVolume = 0;
  private currentRate = 0.92;

  constructor() {
    this.footsteps = typeof Audio === "undefined" ? null : new Audio(FOOTSTEPS_URL);
    if (!this.footsteps) {
      return;
    }

    this.footsteps.loop = true;
    this.footsteps.preload = "auto";
    this.footsteps.volume = 0;
    this.footsteps.playbackRate = this.currentRate;
  }

  unlock() {
    this.unlocked = true;
    if (!this.footsteps) {
      return;
    }

    this.footsteps.volume = 0;
    void this.footsteps
      .play()
      .then(() => {
        this.footsteps?.pause();
        if (this.footsteps) {
          this.footsteps.currentTime = 0;
        }
      })
      .catch(() => {
        // Browsers can still reject the warm-up play in edge cases; movement
        // updates will retry after the player has interacted with the page.
      });
  }

  update({ dt, shouldPlay, speed, rolling }: MovementAudioUpdate) {
    if (!this.footsteps) {
      return;
    }

    const speedAmount = MathUtils.clamp((speed - 1.05) / 6.5, 0, 1);
    const targetVolume = shouldPlay ? speedAmount * (rolling ? 0.24 : 0.17) : 0;
    const targetRate = rolling
      ? MathUtils.clamp(1.03 + speed * 0.02, 1.06, 1.2)
      : MathUtils.clamp(0.8 + speed * 0.035, 0.84, 1.06);

    this.currentVolume = MathUtils.damp(
      this.currentVolume,
      targetVolume,
      shouldPlay ? FADE_IN_RESPONSIVENESS : FADE_OUT_RESPONSIVENESS,
      dt,
    );
    this.currentRate = MathUtils.damp(this.currentRate, targetRate, 8, dt);

    this.footsteps.volume = MathUtils.clamp(this.currentVolume, 0, 1);
    this.footsteps.playbackRate = this.currentRate;

    if (shouldPlay && this.unlocked && this.footsteps.paused) {
      void this.footsteps
        .play()
        .then(() => {
          this.active = true;
        })
        .catch(() => {
          this.active = false;
        });
      return;
    }

    if (!shouldPlay && this.currentVolume <= STOP_VOLUME_EPSILON) {
      this.stop();
      return;
    }

    this.active = !this.footsteps.paused && this.currentVolume > STOP_VOLUME_EPSILON;
  }

  stop() {
    this.currentVolume = 0;
    this.active = false;
    if (!this.footsteps) {
      return;
    }
    this.footsteps.volume = 0;
    this.footsteps.pause();
  }

  dispose() {
    this.stop();
    if (!this.footsteps) {
      return;
    }
    this.footsteps.removeAttribute("src");
    this.footsteps.load();
  }

  getState(): MovementAudioState {
    return {
      footstepsActive: this.active,
      footstepsVolume: Number(this.currentVolume.toFixed(3)),
      footstepRate: Number(this.currentRate.toFixed(2)),
      unlocked: this.unlocked,
    };
  }
}
