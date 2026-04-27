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
    void this.ensureContext()?.resume().catch(() => {});
  }

  private ensureContext(): AudioContext | null {
    const AC = typeof AudioContext !== "undefined" ? AudioContext : (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  dispose() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.unlocked = false;
  }
}
