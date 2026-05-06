import { Color } from "three";

export function fract(value: number): number {
  return value - Math.floor(value);
}

export function forestHash(x: number, z: number, salt: number): number {
  return fract(Math.sin(x * 47.13 + z * 91.71 + salt * 17.97) * 43758.5453123);
}

export function makeTint(base: string, target: string, amount: number): string {
  return `#${new Color(base).lerp(new Color(target), amount).getHexString()}`;
}
