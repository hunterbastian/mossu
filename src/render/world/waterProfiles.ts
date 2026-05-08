import {
  ALPINE_RUNOFF_SURFACE_OFFSET,
  FOOTHILL_CREEK_SURFACE_OFFSET,
  MAIN_RIVER_SURFACE_OFFSET,
  WATERFALL_OUTFLOW_SURFACE_OFFSET,
} from "../../simulation/world";

export type WaterProfileKey = "mainRiver" | "stillPool" | "foothillCreek" | "alpineRunoff" | "waterfallOutflow";

export interface WaterProfile {
  key: WaterProfileKey;
  widthScale: number;
  levelOffset: number;
  opacity: number;
  depthColorScale: number;
  flowSpeed: number;
  roughness: number;
  metalness: number;
  baseWaveAmplitude: number;
  detailWaveAmplitude: number;
  baseFrequency: number;
  detailFrequency: number;
  shallowColor: string;
  deepColor: string;
  foamColor: string;
  shorelineMilkColor: string;
  highlightColor: string;
  sparkleColor: string;
  reflectionColor: string;
  sedimentColor: string;
  bedColor: string;
  causticColor: string;
  shorelineFoamStrength: number;
  shorelineMilkStrength: number;
  slopeFoamStrength: number;
  highlightStrength: number;
  clarity: number;
  rippleContrast: number;
  depthShadowStrength: number;
  causticStrength: number;
  sparkleStrength: number;
}

export interface WaterSystemTuning {
  waterLevel: number;
  shallowColor: string;
  deepColor: string;
  depthMax: number;
  waveSpeed: number;
  waveScale: number;
  distortionStrength: number;
  foamDistance: number;
  shoreFadeDistance: number;
  swimDepthThreshold: number;
  wadeDepthThreshold: number;
}

export const WATER_SYSTEM_TUNING: WaterSystemTuning = {
  waterLevel: MAIN_RIVER_SURFACE_OFFSET,
  shallowColor: "#6fcbd0",
  deepColor: "#1d7195",
  depthMax: 5.2,
  waveSpeed: 0.82,
  waveScale: 1,
  distortionStrength: 0.16,
  foamDistance: 0.26,
  shoreFadeDistance: 0.18,
  swimDepthThreshold: 1.35,
  wadeDepthThreshold: 0.32,
};

export const WATER_PROFILES: Record<WaterProfileKey, WaterProfile> = {
  // Painterly adventure water: clear turquoise depth, readable shallow beds, soft foam, and warm glints.
  mainRiver: {
    key: "mainRiver",
    widthScale: 1.02,
    levelOffset: MAIN_RIVER_SURFACE_OFFSET,
    opacity: 0.58,
    depthColorScale: 4.2,
    flowSpeed: 1.12,
    roughness: 0.9,
    metalness: 0,
    baseWaveAmplitude: 0.028,
    detailWaveAmplitude: 0.01,
    baseFrequency: 17,
    detailFrequency: 41,
    shallowColor: "#6ddfe3",
    deepColor: "#0d87bd",
    foamColor: "#fffdf0",
    shorelineMilkColor: "#f0f8dc",
    highlightColor: "#fff0b6",
    sparkleColor: "#fffde0",
    reflectionColor: "#c9fbf1",
    sedimentColor: "#94ba78",
    bedColor: "#4f8d70",
    causticColor: "#fff0b8",
    shorelineFoamStrength: 0.52,
    shorelineMilkStrength: 0.36,
    slopeFoamStrength: 0.12,
    highlightStrength: 0.2,
    clarity: 0.8,
    rippleContrast: 0.66,
    depthShadowStrength: 0.045,
    causticStrength: 0.145,
    sparkleStrength: 0.105,
  },
  stillPool: {
    key: "stillPool",
    widthScale: 1,
    levelOffset: MAIN_RIVER_SURFACE_OFFSET,
    opacity: 0.46,
    depthColorScale: 5.6,
    flowSpeed: 0.44,
    roughness: 0.92,
    metalness: 0,
    baseWaveAmplitude: 0.017,
    detailWaveAmplitude: 0.006,
    baseFrequency: 12,
    detailFrequency: 30,
    shallowColor: "#6bd8dc",
    deepColor: "#0f7dab",
    foamColor: "#fffdf1",
    shorelineMilkColor: "#edf6d8",
    highlightColor: "#ffedb5",
    sparkleColor: "#fffde1",
    reflectionColor: "#c7f5ef",
    sedimentColor: "#9fba83",
    bedColor: "#577f69",
    causticColor: "#fff0b9",
    shorelineFoamStrength: 0.42,
    shorelineMilkStrength: 0.3,
    slopeFoamStrength: 0.11,
    highlightStrength: 0.18,
    clarity: 0.84,
    rippleContrast: 0.5,
    depthShadowStrength: 0.04,
    causticStrength: 0.15,
    sparkleStrength: 0.09,
  },
  foothillCreek: {
    key: "foothillCreek",
    widthScale: 0.92,
    levelOffset: FOOTHILL_CREEK_SURFACE_OFFSET,
    opacity: 0.94,
    depthColorScale: 1.8,
    flowSpeed: 1.42,
    roughness: 0.88,
    metalness: 0,
    baseWaveAmplitude: 0.03,
    detailWaveAmplitude: 0.011,
    baseFrequency: 24,
    detailFrequency: 44,
    shallowColor: "#9ce9e8",
    deepColor: "#319cc0",
    foamColor: "#fffdf2",
    shorelineMilkColor: "#f0f9df",
    highlightColor: "#ffedb8",
    sparkleColor: "#fffde5",
    reflectionColor: "#d5f8f3",
    sedimentColor: "#cbd9a3",
    bedColor: "#86a27f",
    causticColor: "#fff1c7",
    shorelineFoamStrength: 0.5,
    shorelineMilkStrength: 0.25,
    slopeFoamStrength: 0.44,
    highlightStrength: 0.18,
    clarity: 0.78,
    rippleContrast: 0.58,
    depthShadowStrength: 0.035,
    causticStrength: 0.12,
    sparkleStrength: 0.095,
  },
  alpineRunoff: {
    key: "alpineRunoff",
    widthScale: 0.88,
    levelOffset: ALPINE_RUNOFF_SURFACE_OFFSET,
    opacity: 0.96,
    depthColorScale: 1.3,
    flowSpeed: 1.7,
    roughness: 0.88,
    metalness: 0,
    baseWaveAmplitude: 0.032,
    detailWaveAmplitude: 0.013,
    baseFrequency: 28,
    detailFrequency: 52,
    shallowColor: "#b9edf0",
    deepColor: "#4698c5",
    foamColor: "#fffdf5",
    shorelineMilkColor: "#f2f9e7",
    highlightColor: "#fff0c0",
    sparkleColor: "#fffdf0",
    reflectionColor: "#def8fa",
    sedimentColor: "#c8ddd0",
    bedColor: "#749389",
    causticColor: "#fff3d0",
    shorelineFoamStrength: 0.46,
    shorelineMilkStrength: 0.21,
    slopeFoamStrength: 0.62,
    highlightStrength: 0.2,
    clarity: 0.76,
    rippleContrast: 0.62,
    depthShadowStrength: 0.035,
    causticStrength: 0.11,
    sparkleStrength: 0.1,
  },
  waterfallOutflow: {
    key: "waterfallOutflow",
    widthScale: 0.9,
    levelOffset: WATERFALL_OUTFLOW_SURFACE_OFFSET,
    opacity: 0.96,
    depthColorScale: 1.05,
    flowSpeed: 1.92,
    roughness: 0.86,
    metalness: 0,
    baseWaveAmplitude: 0.035,
    detailWaveAmplitude: 0.015,
    baseFrequency: 32,
    detailFrequency: 58,
    shallowColor: "#bfe3ec",
    deepColor: "#5aa8cc",
    foamColor: "#fffdf6",
    shorelineMilkColor: "#f4f4ec",
    highlightColor: "#fde2b7",
    sparkleColor: "#fff9ef",
    reflectionColor: "#dfeefa",
    sedimentColor: "#d7ded3",
    bedColor: "#879089",
    causticColor: "#f7f5e5",
    shorelineFoamStrength: 0.6,
    shorelineMilkStrength: 0.28,
    slopeFoamStrength: 0.76,
    highlightStrength: 0.16,
    clarity: 0.74,
    rippleContrast: 0.66,
    depthShadowStrength: 0.035,
    causticStrength: 0.1,
    sparkleStrength: 0.08,
  },
};
