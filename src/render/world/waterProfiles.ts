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
  shorelineDefinition: number;
  depthBandStrength: number;
  currentStrokeStrength: number;
  heroSpecularStrength: number;
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
  // Main river: readable downstream motion, turquoise depth bands, bank foam, and warm SoT-like glints.
  mainRiver: {
    key: "mainRiver",
    widthScale: 1.02,
    levelOffset: MAIN_RIVER_SURFACE_OFFSET,
    opacity: 0.98,
    depthColorScale: 4.2,
    flowSpeed: 1.2,
    roughness: 0.9,
    metalness: 0,
    baseWaveAmplitude: 0.034,
    detailWaveAmplitude: 0.012,
    baseFrequency: 16,
    detailFrequency: 44,
    shallowColor: "#18c7dc",
    deepColor: "#00578f",
    foamColor: "#fffdf0",
    shorelineMilkColor: "#f6f5dc",
    highlightColor: "#fff2bf",
    sparkleColor: "#fffde8",
    reflectionColor: "#d6fff4",
    sedimentColor: "#71b790",
    bedColor: "#236f8d",
    causticColor: "#fff0b8",
    shorelineFoamStrength: 0.6,
    shorelineMilkStrength: 0.39,
    slopeFoamStrength: 0.16,
    highlightStrength: 0.28,
    clarity: 0.84,
    rippleContrast: 0.72,
    depthShadowStrength: 0.045,
    causticStrength: 0.145,
    sparkleStrength: 0.125,
    shorelineDefinition: 0.72,
    depthBandStrength: 0.62,
    currentStrokeStrength: 0.88,
    heroSpecularStrength: 0.78,
  },
  // Great lake and still pools: calmer hero water with stronger shoreline definition, clarity, and specular.
  stillPool: {
    key: "stillPool",
    widthScale: 1,
    levelOffset: MAIN_RIVER_SURFACE_OFFSET,
    opacity: 0.82,
    depthColorScale: 4.75,
    flowSpeed: 0.62,
    roughness: 0.92,
    metalness: 0,
    baseWaveAmplitude: 0.027,
    detailWaveAmplitude: 0.011,
    baseFrequency: 13,
    detailFrequency: 38,
    shallowColor: "#35d9e3",
    deepColor: "#004f86",
    foamColor: "#fffef2",
    shorelineMilkColor: "#faf6dc",
    highlightColor: "#fff2b8",
    sparkleColor: "#fffdeb",
    reflectionColor: "#dcfff6",
    sedimentColor: "#78bd98",
    bedColor: "#1f6f92",
    causticColor: "#fff1b8",
    shorelineFoamStrength: 0.7,
    shorelineMilkStrength: 0.5,
    slopeFoamStrength: 0.16,
    highlightStrength: 0.38,
    clarity: 0.94,
    rippleContrast: 0.72,
    depthShadowStrength: 0.055,
    causticStrength: 0.2,
    sparkleStrength: 0.19,
    shorelineDefinition: 1.28,
    depthBandStrength: 1.18,
    currentStrokeStrength: 0.72,
    heroSpecularStrength: 1.28,
  },
  // Foothill creek: narrower fast water for route edges where readable bank entry matters more than depth drama.
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
    shallowColor: "#a4efea",
    deepColor: "#2396c4",
    foamColor: "#fffdf2",
    shorelineMilkColor: "#f6f5de",
    highlightColor: "#fff0bf",
    sparkleColor: "#fffdeb",
    reflectionColor: "#dcfbf4",
    sedimentColor: "#cbd9a3",
    bedColor: "#86a27f",
    causticColor: "#fff1c7",
    shorelineFoamStrength: 0.5,
    shorelineMilkStrength: 0.25,
    slopeFoamStrength: 0.44,
    highlightStrength: 0.21,
    clarity: 0.78,
    rippleContrast: 0.58,
    depthShadowStrength: 0.035,
    causticStrength: 0.12,
    sparkleStrength: 0.11,
    shorelineDefinition: 0.74,
    depthBandStrength: 0.45,
    currentStrokeStrength: 0.8,
    heroSpecularStrength: 0.55,
  },
  // Highland creek: brighter cold runoff with tighter ripples, more slope foam, and restrained shallow depth bands.
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
    shallowColor: "#c5f1f1",
    deepColor: "#3d99c7",
    foamColor: "#fffdf5",
    shorelineMilkColor: "#f8f6e7",
    highlightColor: "#fff2c8",
    sparkleColor: "#fffdf4",
    reflectionColor: "#e6fbfb",
    sedimentColor: "#c8ddd0",
    bedColor: "#749389",
    causticColor: "#fff3d0",
    shorelineFoamStrength: 0.46,
    shorelineMilkStrength: 0.21,
    slopeFoamStrength: 0.62,
    highlightStrength: 0.23,
    clarity: 0.76,
    rippleContrast: 0.62,
    depthShadowStrength: 0.035,
    causticStrength: 0.11,
    sparkleStrength: 0.115,
    shorelineDefinition: 0.68,
    depthBandStrength: 0.4,
    currentStrokeStrength: 0.9,
    heroSpecularStrength: 0.55,
  },
  // Waterfall outflow: the foamiest fast-water profile for cascade feet and shrine/highland swim pockets.
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
    shallowColor: "#c8edf0",
    deepColor: "#54a5cc",
    foamColor: "#fffdf6",
    shorelineMilkColor: "#f4f4ec",
    highlightColor: "#ffedc3",
    sparkleColor: "#fffaf1",
    reflectionColor: "#e6f6ff",
    sedimentColor: "#d7ded3",
    bedColor: "#879089",
    causticColor: "#f7f5e5",
    shorelineFoamStrength: 0.6,
    shorelineMilkStrength: 0.28,
    slopeFoamStrength: 0.76,
    highlightStrength: 0.19,
    clarity: 0.74,
    rippleContrast: 0.66,
    depthShadowStrength: 0.035,
    causticStrength: 0.1,
    sparkleStrength: 0.09,
    shorelineDefinition: 0.8,
    depthBandStrength: 0.42,
    currentStrokeStrength: 1,
    heroSpecularStrength: 0.45,
  },
};
