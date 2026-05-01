import {
  DataTexture,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

export interface PainterlyTextureSet {
  meadowGrass: DataTexture;
  forestFloor: DataTexture;
  rockCliff: DataTexture;
  sandShore: DataTexture;
  barkLeaves: DataTexture;
  waterFoam: DataTexture;
  terrainDetail: DataTexture;
}

interface PaletteStop {
  color: readonly [number, number, number];
  weight: number;
}

let cachedTextures: PainterlyTextureSet | null = null;

function fract(value: number) {
  return value - Math.floor(value);
}

function hash(x: number, y: number, salt: number) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123);
}

function valueNoise(x: number, y: number, salt: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - fx * 2);
  const uy = fy * fy * (3 - fy * 2);
  const a = hash(ix, iy, salt);
  const b = hash(ix + 1, iy, salt);
  const c = hash(ix, iy + 1, salt);
  const d = hash(ix + 1, iy + 1, salt);
  const low = a + (b - a) * ux;
  const high = c + (d - c) * ux;
  return low + (high - low) * uy;
}

function fbm(x: number, y: number, salt: number) {
  let value = 0;
  let amplitude = 0.56;
  let frequency = 1;
  let normalizer = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise(x * frequency, y * frequency, salt + octave * 19) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.04;
  }
  return value / normalizer;
}

function choosePaletteStop(stops: readonly PaletteStop[], t: number) {
  const total = stops.reduce((sum, stop) => sum + stop.weight, 0);
  let cursor = t * total;
  for (const stop of stops) {
    cursor -= stop.weight;
    if (cursor <= 0) {
      return stop.color;
    }
  }
  return stops[stops.length - 1].color;
}

function makeTexture(
  size: number,
  salt: number,
  stops: readonly PaletteStop[],
  paint: (x: number, y: number, base: readonly [number, number, number], grain: number) => readonly [number, number, number],
) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const grain = fbm(u * 7.5 + salt * 0.11, v * 7.5 - salt * 0.07, salt);
      const fleck = hash(x, y, salt + 91);
      const base = choosePaletteStop(stops, grain * 0.72 + fleck * 0.28);
      const color = paint(x, y, base, grain);
      const index = (y * size + x) * 4;
      data[index] = Math.max(0, Math.min(255, Math.round(color[0])));
      data[index + 1] = Math.max(0, Math.min(255, Math.round(color[1])));
      data[index + 2] = Math.max(0, Math.min(255, Math.round(color[2])));
      data[index + 3] = 255;
    }
  }

  const texture = new DataTexture(data, size, size);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function offsetColor(base: readonly [number, number, number], amount: number) {
  return [
    base[0] + amount,
    base[1] + amount,
    base[2] + amount,
  ] as const;
}

export function getPainterlyTextureSet() {
  if (cachedTextures) {
    return cachedTextures;
  }

  cachedTextures = {
    meadowGrass: makeTexture(128, 11, [
      { color: [99, 151, 58], weight: 3 },
      { color: [142, 178, 72], weight: 2 },
      { color: [190, 186, 80], weight: 0.7 },
      { color: [75, 125, 54], weight: 1.2 },
    ], (x, y, base, grain) => {
      const blade = Math.sin(x * 0.55 + y * 0.12) * 7 + Math.sin((x - y) * 0.16) * 5;
      return offsetColor(base, blade + (grain - 0.5) * 18);
    }),
    forestFloor: makeTexture(128, 23, [
      { color: [48, 92, 48], weight: 2 },
      { color: [62, 105, 54], weight: 1.6 },
      { color: [74, 83, 48], weight: 1.1 },
      { color: [34, 67, 42], weight: 1.4 },
    ], (x, y, base, grain) => {
      const fern = Math.sin(x * 0.22) * Math.cos(y * 0.46) * 13;
      return offsetColor(base, fern + (grain - 0.5) * 16);
    }),
    rockCliff: makeTexture(128, 37, [
      { color: [115, 103, 78], weight: 2 },
      { color: [144, 131, 94], weight: 1.6 },
      { color: [82, 76, 63], weight: 1.2 },
      { color: [102, 91, 69], weight: 1.4 },
    ], (x, y, base, grain) => {
      const strata = Math.sin(y * 0.25 + grain * 3.8) * 18 + Math.sin((x + y) * 0.09) * 8;
      return offsetColor(base, strata);
    }),
    sandShore: makeTexture(128, 41, [
      { color: [215, 185, 119], weight: 2.4 },
      { color: [235, 211, 151], weight: 1.8 },
      { color: [184, 157, 100], weight: 0.8 },
      { color: [232, 224, 190], weight: 0.8 },
    ], (x, y, base, grain) => {
      const ripple = Math.sin(x * 0.18 + Math.sin(y * 0.08) * 1.8) * 9;
      return offsetColor(base, ripple + (grain - 0.5) * 10);
    }),
    barkLeaves: makeTexture(128, 53, [
      { color: [53, 109, 48], weight: 2 },
      { color: [87, 130, 56], weight: 1.6 },
      { color: [105, 80, 47], weight: 0.8 },
      { color: [48, 58, 38], weight: 0.8 },
    ], (x, y, base, grain) => {
      const vertical = Math.sin(x * 0.34 + grain * 2.4) * 11;
      return offsetColor(base, vertical + (hash(x, y, 8) > 0.92 ? 28 : 0));
    }),
    waterFoam: makeTexture(128, 67, [
      { color: [110, 205, 213], weight: 2.2 },
      { color: [42, 139, 181], weight: 1.5 },
      { color: [234, 252, 244], weight: 0.8 },
      { color: [188, 233, 224], weight: 1.1 },
    ], (x, y, base, grain) => {
      const thread = Math.sin(x * 0.16 + y * 0.38 + grain * 4.5) * 18;
      const foam = hash(x, y, 12) > 0.88 ? 46 : 0;
      return offsetColor(base, thread + foam);
    }),
    terrainDetail: makeTexture(128, 79, [
      { color: [238, 242, 220], weight: 2.4 },
      { color: [221, 228, 198], weight: 1.4 },
      { color: [246, 237, 203], weight: 1.1 },
      { color: [210, 219, 188], weight: 0.9 },
    ], (x, y, base, grain) => {
      const brush = Math.sin(x * 0.19 - y * 0.11) * 4 + Math.sin((x + y) * 0.05) * 5;
      return offsetColor(base, brush + (grain - 0.5) * 8);
    }),
  };

  cachedTextures.terrainDetail.repeat.set(18, 18);
  cachedTextures.waterFoam.repeat.set(7, 18);
  cachedTextures.meadowGrass.repeat.set(20, 20);
  cachedTextures.forestFloor.repeat.set(16, 16);
  cachedTextures.rockCliff.repeat.set(14, 14);
  cachedTextures.sandShore.repeat.set(18, 18);
  cachedTextures.barkLeaves.repeat.set(8, 8);

  return cachedTextures;
}
