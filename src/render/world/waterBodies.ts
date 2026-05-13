import { Group, MathUtils, Vector3 } from "three";
import {
  HIGHLAND_CREEK_PATHS,
  MAIN_RIVER_SURFACE_OFFSET,
  RIVER_BRANCH_SEGMENTS,
  RIVER_WATER_VISUAL_FILL_SCALE,
  STARTING_WATER_POOLS,
  STARTING_WATER_VISUAL_FILL_SCALE,
  sampleRiverChannelAt,
  sampleRiverChannelCenter,
  sampleRiverRenderWidthScale,
  sampleTerrainHeight,
} from "../../simulation/world";
import type { HighlandCreekPath, RiverChannelId, StartingWaterPool } from "../../simulation/worldTypes";
import { WATER_PROFILES, type WaterProfile } from "./waterProfiles";
import { createLakeSurface, createWaterSurface } from "./waterSurfaceFactory";
import type { WaterSurfaceController, WaterSurfaceGroup } from "./waterTypes";
import { addSmallWaterfall } from "./waterWaterfalls";

function makeCreekSurface(points: Vector3[], radius: number, profile: WaterProfile, opacity = profile.opacity) {
  return createWaterSurface(points, {
    profile,
    width: radius * 1.58,
    segments: 42,
    opacity,
  });
}

function makeHighlandCreekSurface(path: HighlandCreekPath) {
  const profile = WATER_PROFILES[path.profile];
  const points = path.points.map(([x, z]) => new Vector3(x, sampleTerrainHeight(x, z) + path.surfaceOffset, z));
  return makeCreekSurface(points, path.width, profile, path.opacity);
}

function makeRiverSurface(
  channelId: RiverChannelId,
  zStart: number,
  zEnd: number,
  sampleCount: number,
  widthScale = 1,
  opacity = WATER_PROFILES.mainRiver.opacity,
) {
  const points: Vector3[] = [];
  for (let i = 0; i <= sampleCount; i += 1) {
    const t = i / sampleCount;
    const z = zStart + t * (zEnd - zStart);
    const x = sampleRiverChannelCenter(channelId, z);
    const y = sampleTerrainHeight(x, z) + MAIN_RIVER_SURFACE_OFFSET;
    points.push(new Vector3(x, y, z));
  }

  return createWaterSurface(points, {
    profile: WATER_PROFILES.mainRiver,
    width: (point: Vector3) => {
      const channel = sampleRiverChannelAt(channelId, point.z);
      const foothillTaper = MathUtils.smoothstep(36, 104, point.z);
      const alpineTaper = MathUtils.smoothstep(114, 184, point.z);
      const mainTaper = 1 - foothillTaper * 0.34 - alpineTaper * 0.12;
      const branchTaper = 1 - foothillTaper * 0.2 - alpineTaper * 0.08;
      return (
        channel.width * widthScale * RIVER_WATER_VISUAL_FILL_SCALE * (channelId === "main" ? mainTaper : branchTaper)
      );
    },
    segments: Math.max(56, Math.round(sampleCount * 1.45)),
    opacity,
    flowBraidStrength: channelId === "main" ? 0.34 : 0.86,
  });
}

export function buildRiverSystem(): WaterSurfaceGroup {
  const group = new Group();
  const controllers: WaterSurfaceController[] = [];
  const addRiver = (
    channelId: RiverChannelId,
    zStart: number,
    zEnd: number,
    sampleCount: number,
    widthScale = 1,
    opacity = WATER_PROFILES.mainRiver.opacity,
  ) => {
    const surface = makeRiverSurface(channelId, zStart, zEnd, sampleCount, widthScale, opacity);
    surface.mesh.name = `river-${channelId}-${zStart}-${zEnd}`;
    group.add(surface.mesh);
    controllers.push(surface);
  };
  const renderPathWidthScale = (channelId: RiverChannelId) =>
    sampleRiverRenderWidthScale(channelId) / WATER_PROFILES.mainRiver.widthScale;

  group.name = "braided-river-system";
  addRiver("main", -218, 244, 226, renderPathWidthScale("main") * 1.2, 0.56);
  RIVER_BRANCH_SEGMENTS.forEach((segment) => {
    const sampleCount = Math.max(42, Math.round((segment.endZ - segment.startZ) * 0.68));
    addRiver(
      segment.id,
      segment.startZ,
      segment.endZ,
      sampleCount,
      renderPathWidthScale(segment.id),
      segment.id === "silver-braid" ? 0.38 : 0.44,
    );
  });

  return { group, controllers };
}

function makeStartingWaterSurface(pool: StartingWaterPool) {
  const center = new Vector3(pool.x, sampleTerrainHeight(pool.x, pool.z) + pool.surfaceOffset, pool.z);
  const isOpeningLake = pool.id === "opening-lake";
  const isGreatLake = pool.id === "great-lake";

  return createLakeSurface(
    center,
    {
      profile: WATER_PROFILES.stillPool,
      width: Math.max(pool.renderRadiusX, pool.renderRadiusZ) * 2,
      flowSpeed: pool.flowSpeed,
      opacity: pool.opacity,
    },
    {
      radiusX: pool.renderRadiusX * STARTING_WATER_VISUAL_FILL_SCALE,
      radiusZ: pool.renderRadiusZ * STARTING_WATER_VISUAL_FILL_SCALE,
      radialSegments: isGreatLake ? 104 : isOpeningLake ? 76 : 48,
      rings: isGreatLake ? 13 : isOpeningLake ? 10 : 7,
      edgeSoftness: pool.edgeSoftness,
    },
  );
}

export function buildStartingWaterSystem(): WaterSurfaceGroup {
  const group = new Group();
  const controllers: WaterSurfaceController[] = [];
  group.name = "starting-water-pools";

  STARTING_WATER_POOLS.forEach((pool) => {
    const surface = makeStartingWaterSurface(pool);
    surface.mesh.name = `starting-water-${pool.id}`;
    group.add(surface.mesh);
    controllers.push(surface);
  });

  return { group, controllers };
}

export function buildHighlandWaterways(): WaterSurfaceGroup {
  const group = new Group();
  const controllers: WaterSurfaceController[] = [];
  group.name = "highland-waterways-muted";

  HIGHLAND_CREEK_PATHS.forEach((path) => {
    const surface = makeHighlandCreekSurface(path);
    surface.mesh.name = `highland-creek-${path.id}`;
    surface.mesh.renderOrder = 1;
    group.add(surface.mesh);
    controllers.push(surface);
  });

  addSmallWaterfall(group, controllers, 25, 89, 3.2, 4.8, -0.22, 0.18);
  addSmallWaterfall(group, controllers, 38, 128, 5.8, 11.2, -0.36, 0.24);
  addSmallWaterfall(group, controllers, 31, 139, 2.8, 6.2, -0.14, 0.18);
  addSmallWaterfall(group, controllers, -16, 158, 2.8, 5.6, 0.48, 0.18);
  addSmallWaterfall(group, controllers, 10, 154, 3.8, 7.4, 0.3, 0.2);
  addSmallWaterfall(group, controllers, 14, 186, 4.8, 16.5, -0.12, 0.26);
  addSmallWaterfall(group, controllers, 8, 212, 5.4, 22, -0.04, 0.3);

  return { group, controllers };
}
