import type { WorldPerfStats } from "../world/WorldRenderer";
import type { ActiveRendererBackend, RenderPath, RequestedRendererBackend } from "./rendererBackend";

export const PERF_HUD_SAMPLE_LIMIT = 240;
export const PERF_HUD_UPDATE_MS = 250;
export const WORLD_PERF_STATS_UPDATE_MS = 30000;
export const PERF_CAPTURE_FLASH_MS = 2200;

type RendererInfoSnapshot = {
  render: {
    calls: number;
    triangles: number;
    lines: number;
    points: number;
  };
  memory: {
    geometries: number;
    textures: number;
  };
};

type CoopPerformanceSummary = {
  enabled: boolean;
  remoteCount: number;
  sharedEvents: number;
};

type RenderResolutionSummary = {
  preferredWidth: number;
  preferredHeight: number;
  preferredPixels: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportPixels: number;
  internalWidth: number;
  internalHeight: number;
  internalPixels: number;
};

export type PerformanceSnapshotInput = {
  rendererInfo: RendererInfoSnapshot;
  world: WorldPerfStats;
  smoothedFrameMs: number;
  latestFrameMs: number;
  rollingP95FrameMs: number;
  rollingSampleCount: number;
  qualitySampleFrameMs: number;
  activePixelRatio: number;
  maxPixelRatio: number;
  minPixelRatio: number;
  renderResolution: RenderResolutionSummary;
  bloomEnabled: boolean;
  retroTextureEnabled: boolean;
  renderPath: RenderPath;
  postProcessingReady: boolean;
  postProcessingSuppressedMs: number;
  waterDepthDebug: boolean;
  underwaterIntensity: number;
  webGlContextLostCount: number;
  webGlContextRestoredCount: number;
  coopStress: CoopPerformanceSummary;
  qualityLow: boolean;
  requestedBackend: RequestedRendererBackend;
  activeBackend: ActiveRendererBackend;
  webGpuAvailable: boolean;
  rendererFallbackReason: string | null;
  mapZoom: number;
};

export function createPerformanceSnapshot(input: PerformanceSnapshotInput) {
  return {
    fps: Number((1000 / Math.max(0.1, input.smoothedFrameMs)).toFixed(1)),
    frameMs: Number(input.smoothedFrameMs.toFixed(2)),
    latestFrameMs: Number(input.latestFrameMs.toFixed(2)),
    rollingP95FrameMs: Number(input.rollingP95FrameMs.toFixed(2)),
    rollingSampleCount: input.rollingSampleCount,
    qualitySampleFrameMs: Number(input.qualitySampleFrameMs.toFixed(2)),
    pixelRatio: Number(input.activePixelRatio.toFixed(2)),
    maxPixelRatio: Number(input.maxPixelRatio.toFixed(2)),
    minPixelRatio: Number(input.minPixelRatio.toFixed(2)),
    renderResolution: input.renderResolution,
    bloomEnabled: input.bloomEnabled,
    retroTextureEnabled: input.retroTextureEnabled,
    renderPath: input.renderPath,
    postProcessingReady: input.postProcessingReady,
    postProcessingSuppressedMs: input.postProcessingSuppressedMs,
    waterDepthDebug: input.waterDepthDebug,
    underwaterIntensity: Number(input.underwaterIntensity.toFixed(3)),
    webGlContextLostCount: input.webGlContextLostCount,
    webGlContextRestoredCount: input.webGlContextRestoredCount,
    coopStress: input.coopStress,
    qualityLow: input.qualityLow,
    requestedBackend: input.requestedBackend,
    activeBackend: input.activeBackend,
    webGpuAvailable: input.webGpuAvailable,
    rendererFallbackReason: input.rendererFallbackReason,
    mapZoom: input.mapZoom,
    renderer: {
      calls: input.rendererInfo.render.calls,
      triangles: input.rendererInfo.render.triangles,
      lines: input.rendererInfo.render.lines,
      points: input.rendererInfo.render.points,
    },
    memory: {
      geometries: input.rendererInfo.memory.geometries,
      textures: input.rendererInfo.memory.textures,
    },
    world: input.world,
  };
}

export type MossuPerformanceSnapshot = ReturnType<typeof createPerformanceSnapshot>;

export type PerfCapture = {
  capturedAt: string;
  route: string;
  performance: MossuPerformanceSnapshot;
};

export function createPerfCapture(route: string, performance: MossuPerformanceSnapshot): PerfCapture {
  return {
    capturedAt: new Date().toISOString(),
    route,
    performance,
  };
}

export function recordPerfFrameSample(samples: number[], sampleIndex: number, frameMs: number) {
  if (samples.length < PERF_HUD_SAMPLE_LIMIT) {
    samples.push(frameMs);
    return sampleIndex;
  }

  samples[sampleIndex] = frameMs;
  return (sampleIndex + 1) % PERF_HUD_SAMPLE_LIMIT;
}

export function getPerfFramePercentile(samples: readonly number[], fallbackFrameMs: number, percentile: number) {
  if (samples.length === 0) {
    return fallbackFrameMs;
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
  return sorted[index];
}

export function buildCompactPerfDebugText(perf: MossuPerformanceSnapshot, captureState: string) {
  return [
    "Mossu perf",
    `${perf.fps}fps  avg ${perf.frameMs}ms  p95 ${perf.rollingP95FrameMs}ms  last ${perf.latestFrameMs}ms`,
    `pixel ${perf.pixelRatio}  ${perf.renderPath}  bloom ${perf.bloomEnabled ? "on" : "off"}  texture ${perf.retroTextureEnabled ? "on" : "off"}  water debug ${perf.waterDepthDebug ? "on" : "off"}  ${perf.activeBackend}`,
    `coop ${perf.coopStress.enabled ? `${perf.coopStress.remoteCount} remotes / ${perf.coopStress.sharedEvents} events` : "off"}`,
    `draw ${formatPerfNumber(perf.renderer.calls)} calls  ${formatPerfNumber(perf.renderer.triangles)} tris`,
    `grass ${formatPerfNumber(perf.world.grassInstances)} inst  lod ${perf.world.grassLodVisitedCells}/${perf.world.grassLodCells} cells`,
    `water ${perf.world.waterSurfaces} surfaces  shaders ${perf.world.animatedShaderMeshes}`,
    captureState,
  ].join("\n");
}

export function buildFullPerfDebugText(perf: MossuPerformanceSnapshot) {
  return [
    `perf ${perf.fps}fps  avg ${perf.frameMs}ms  p95 ${perf.rollingP95FrameMs}ms  raw ${perf.latestFrameMs}ms`,
    `quality avg ${perf.qualitySampleFrameMs}ms  pixelRatio ${perf.pixelRatio} (${perf.minPixelRatio}-${perf.maxPixelRatio})  preferred ${perf.renderResolution.preferredWidth}x${perf.renderResolution.preferredHeight}  internal ${perf.renderResolution.internalWidth}x${perf.renderResolution.internalHeight}  path ${perf.renderPath}`,
    `post ${perf.postProcessingReady ? "ready" : "pending"} ${perf.postProcessingSuppressedMs}ms  bloom ${perf.bloomEnabled ? "on" : "off"}  texture ${perf.retroTextureEnabled ? "on" : "off"}  waterDebug ${perf.waterDepthDebug ? "on" : "off"}  lowQuality ${perf.qualityLow ? "yes" : "no"}  mapZoom ${perf.mapZoom.toFixed(2)}`,
    `coop stress ${perf.coopStress.enabled ? "on" : "off"}  remotes ${perf.coopStress.remoteCount}  shared events ${perf.coopStress.sharedEvents}`,
    `backend ${perf.activeBackend}  requested ${perf.requestedBackend}  webgpu ${perf.webGpuAvailable ? "available" : "unavailable"}${perf.rendererFallbackReason ? `  fallback ${perf.rendererFallbackReason}` : ""}`,
    `context lost ${perf.webGlContextLostCount}  restored ${perf.webGlContextRestoredCount}`,
    `renderer calls ${perf.renderer.calls}  tris ${perf.renderer.triangles}  lines ${perf.renderer.lines}  points ${perf.renderer.points}`,
    `memory geometries ${perf.memory.geometries}  textures ${perf.memory.textures}`,
    `terrain ${perf.world.terrainVertices}v / ${perf.world.terrainTriangles}t`,
    `grass ${perf.world.grassMeshes} meshes / ${perf.world.grassInstances} inst / est ${perf.world.grassEstimatedTriangles}t`,
    `grass impostors ${perf.world.grassImpostorMeshes} meshes / ${perf.world.grassImpostorInstances} patches / est ${perf.world.grassImpostorEstimatedTriangles}t`,
    `grass lod ${perf.world.grassLodVisitedCells}/${perf.world.grassLodCells} cells / ${perf.world.grassLodVisitedSources}/${perf.world.grassLodSourceInstances} src`,
    `forest ${perf.world.forestMeshes} meshes / ${perf.world.forestInstances} inst / est ${perf.world.forestEstimatedTriangles}t`,
    `small props ${perf.world.smallPropMeshes} meshes / ${perf.world.smallPropInstances} inst / est ${perf.world.smallPropEstimatedTriangles}t`,
    `water ${perf.world.waterSurfaces} surfaces / ${perf.world.waterVertices}v / ${perf.world.waterTriangles}t`,
    `animated shaders ${perf.world.animatedShaderMeshes}  grass ${perf.world.grassShaderMeshes}  trees ${perf.world.treeShaderMeshes}  water ${perf.world.waterShaderSurfaces}`,
  ].join("\n");
}

function formatPerfNumber(value: number) {
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(2))}M`;
  }
  if (value >= 10_000) {
    return `${Number((value / 1_000).toFixed(1))}k`;
  }
  return `${value}`;
}
