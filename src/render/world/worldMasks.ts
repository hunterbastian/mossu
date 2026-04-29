import { MathUtils } from "three";

export function sampleOpeningMeadowMask(x: number, z: number) {
  const startCore = Math.exp(-(((x + 58) / 34) ** 2) - (((z + 148) / 22) ** 2));
  const startLane = Math.exp(-(((x + 18) / 96) ** 2) - (((z + 82) / 82) ** 2));
  const amberRise = Math.exp(-(((x + 6) / 42) ** 2) - (((z + 28) / 30) ** 2));
  return MathUtils.clamp(startCore * 0.92 + startLane * 0.46 + amberRise * 0.54, 0, 1);
}
