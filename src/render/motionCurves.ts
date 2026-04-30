export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function easeOutCubic(value: number) {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

export function easeInOutSine(value: number) {
  const t = clamp01(value);
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeOutBack(value: number, overshoot = 1.35) {
  const t = clamp01(value);
  const c3 = overshoot + 1;
  return 1 + c3 * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
}

export function easeOutElastic(value: number) {
  const t = clamp01(value);
  if (t === 0 || t === 1) {
    return t;
  }
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export function pulseCurve(
  remainingSeconds: number,
  durationSeconds: number,
  easing: (value: number) => number = easeOutCubic,
) {
  if (durationSeconds <= 0) {
    return 0;
  }
  return easing(clamp01(remainingSeconds / durationSeconds));
}
