import { MathUtils } from "three";

/**
 * Short procedural one-shots (no extra asset files) for land, zone, swim, interact.
 * Unlocks with the same user gesture as movement audio.
 */
export class GameplayFeedbackAudio {
  private ctx: AudioContext | null = null;
  private unlocked = false;

  unlock() {
    this.unlocked = true;
    void this.ensureContext()
      ?.resume()
      .catch(() => {});
  }

  private ensureContext(): AudioContext | null {
    const AC =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      return null;
    }
    if (!this.ctx) {
      this.ctx = new AC();
    }
    return this.ctx;
  }

  playLand(impact: number) {
    if (!this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const t = ctx.currentTime;
    const amount = MathUtils.clamp(impact, 0.15, 1.4);
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(58 + amount * 32, t);
    osc.frequency.exponentialRampToValueAtTime(38 + amount * 12, t + 0.07);
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(420, t);
    filt.Q.setValueAtTime(0.7, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07 * Math.sqrt(amount), t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  playZoneChange() {
    if (!this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const t = ctx.currentTime;
    const chime = (freq: number, at: number, dur: number, vol: number) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(ctx!.destination);
      o.start(at);
      o.stop(at + dur + 0.02);
    };

    chime(220, t, 0.06, 0.022);
    chime(330, t + 0.05, 0.07, 0.018);
  }

  playSwimSurface(crossingIntoWater: boolean) {
    if (!this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const t = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.14;
    const noise = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = crossingIntoWater ? 680 : 520;
    filt.Q.value = 0.85;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(crossingIntoWater ? 0.045 : 0.038, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(filt);
    filt.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.15);
  }

  playInteract() {
    if (!this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.04);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.08);
  }

  playKaruChirp(kind: "notice" | "join") {
    if (!this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const t = ctx.currentTime;
    const notes = kind === "join" ? [660, 880, 990] : [740, 620];
    notes.forEach((freq, index) => {
      const at = t + index * 0.045;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, at);
      o.frequency.exponentialRampToValueAtTime(freq * (kind === "join" ? 1.12 : 0.9), at + 0.038);
      filt.type = "bandpass";
      filt.frequency.setValueAtTime(freq * 1.2, at);
      filt.Q.setValueAtTime(1.8, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(kind === "join" ? 0.028 : 0.018, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.075);
      o.connect(filt);
      filt.connect(g);
      g.connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.09);
    });
  }

  /**
   * Charge-jump release. chargeRatio in 0..1: 0 = quick tap (sharp short pop), 1 = full
   * hold (longer satisfying "thwip" with a higher pitch sweep). The two extremes feel
   * like different actions even though they're the same input.
   */
  playJumpRelease(chargeRatio: number) {
    if (!this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const ratio = MathUtils.clamp(chargeRatio, 0, 1);
    const t = ctx.currentTime;
    // Pitch sweep: short tap stays low, full charge sweeps higher to feel "lifted."
    const startFreq = 240 + ratio * 80;
    const endFreq = startFreq + 240 + ratio * 360;
    const duration = 0.09 + ratio * 0.11;
    const peakGain = 0.025 + ratio * 0.04;

    const o = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(startFreq, t);
    o.frequency.exponentialRampToValueAtTime(endFreq, t + duration * 0.55);
    filt.type = "bandpass";
    filt.frequency.setValueAtTime(640 + ratio * 280, t);
    filt.Q.setValueAtTime(1.6, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peakGain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(filt);
    filt.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + duration + 0.02);
  }

  /**
   * Air-boost — short filtered-noise whoosh when Shift fires the in-air planar dash.
   * Mid-band band-pass for "air rush," very brief so it doesn't muddy other audio.
   */
  playAirBoost() {
    if (!this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const t = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const noise = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      // Decaying noise envelope baked into the buffer so the whoosh trails off cleanly.
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    // Sweep band-pass center upward to imply forward motion.
    filt.frequency.setValueAtTime(560, t);
    filt.frequency.exponentialRampToValueAtTime(1120, t + 0.08);
    filt.Q.setValueAtTime(1.4, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(filt);
    filt.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.18);
  }

  /**
   * Roll engagement — a soft low rumble onset when the player transitions into rolling
   * on the ground. Single-shot (caller must detect false→true transition); designed to
   * feel like the moment Mossu becomes a ball, not a sustained loop.
   */
  playRollEngage() {
    if (!this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }

    const t = ctx.currentTime;
    // Low triangle oscillator with subtle pitch wobble = "vroom" not "beep."
    const osc = ctx.createOscillator();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(82, t + 0.16);
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(380, t);
    filt.Q.setValueAtTime(0.9, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.045, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  dispose() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.unlocked = false;
  }
}
