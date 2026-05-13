import {
  AmbientLight,
  Camera,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector3,
} from "three";
import { FrameState } from "../../simulation/gameState";
import type { CoopRemoteMossuState } from "../../simulation/coopStress";
import {
  sampleBiomeZone,
  samplePaintedGroundMask,
  sampleRouteDirtPathMask,
  sampleRouteReadabilityClearing,
  sampleTerrainHeight,
  sampleTerrainNormal,
  sampleWaterState,
  sampleWindField,
  worldLandmarks,
  worldMapMarkers,
} from "../../simulation/world";
import { MossuAvatar } from "../objects/MossuAvatar";
import { OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";
import {
  createGrassMesh,
  createGrassPatchImpostorMesh,
  getGrassMeshLodStats,
  GrassShader,
  updateGrassMeshLod,
} from "./grassSystem";
import {
  buildClouds,
  buildMountainAtmosphere,
  buildSkyDome,
  buildStylizedSkySun,
  syncAtmosphereLighting,
  syncStylizedSkySun,
} from "./atmosphereSystem";
import { AmbientMoteSystem, buildAmbientMotes } from "./ambientMotes";
import { buildOceanSystem, type OceanSystem } from "./oceanSystem";
import {
  AMBIENT_BLOB_SPECIES_NAME,
  AmbientBlob,
  AmbientBlobUpdateStats,
  buildAmbientBlobs,
  buildAmbientBlobNests,
  updateAmbientBlobs,
} from "./ambientBlobs";
import {
  buildAnchorSceneAccents,
  buildBiomeThresholdLandmarks,
  buildBiomeTransitionAccents,
  buildForestGroveAccents,
  buildGroundLayer,
  buildHighlandAccents,
  buildMidLayer,
  buildTreeClusters,
  buildWaterBankAccents,
} from "./terrainDecorations";
import { batchStaticDecorations, freezeStaticHierarchy, moveChildren } from "./staticBatching";
import { countGeometryTriangles, countGeometryVertices, countInstancedTriangles } from "./geometryStats";
import {
  applySceneLightingColors,
  applySceneLightingMood,
  applySunRig,
  createWorldLightingMoodState,
  getAtmosphereHorizonTints,
  getSunDirectionWorld,
  type SceneColorPairs,
  updateSunOrbitRig,
  writeWorldLightingMood,
  writePatchSceneLightingUniforms,
} from "./sceneLighting";
import { buildTerrainFormStrokes, makeTerrainMesh } from "./terrainMesh";
import { buildHighlandWaterways, WaterSystem } from "./waterSystem";
import {
  DISTANT_BIRD_COUNT,
  GRASSLAND_LIFE_SIGNAL_COUNT,
  buildGrasslandImmersionSystem,
  updateGrasslandImmersionSystem,
} from "./grasslandImmersion";
import { buildMountainBackdrop } from "./mountainBackdrop";
import { createRemoteMossuVisual, type RemoteMossuVisual } from "./worldCoopVisuals";
import { buildForageableVisuals, type ForageableVisual } from "./worldForageables";
import { createMapMarker, type MapMarker } from "./worldMapMarkers";
import {
  buildDistantFloatingIslands,
  buildFloatingIslandShell,
  buildOpeningNestVista,
  buildOpeningWaterComposition,
  buildShadowPockets,
  buildShrine,
  buildValleyMist,
} from "./worldSetPieces";

const grasslandsArt = OOT_PS2_GRASSLANDS_PALETTE;

/** Instanced blade budgets — raise together when tuning meadow lushness vs GPU cost */
const GRASS_COUNT = 11800;
const FAR_GRASS_PATCH_COUNT = 1420;
const ALPINE_GRASS_COUNT = 220;
const LANDING_SPLASH_PARTICLES = 18;
const SNOW_TRAIL_PARTICLES = 20;
export const MOSSU_TRACE_STAMP_COUNT = 34;
export const WORLD_CLOUD_SHADOW_PATCH_COUNT = 6;
const DEFERRED_WORLD_SLICES_PER_COVERED_FRAME = 3;
const TREE_LEAF_WIND_UPDATE_INTERVAL = 1 / 30;
const TREE_LEAF_WIND_CULL_DISTANCE = 178;
const TREE_LEAF_WIND_HIGHLAND_CULL_DISTANCE = 116;
const TREE_LEAF_WIND_CAMERA_OCCLUDER_HIDE_DISTANCE = 20;
const SMALL_PROP_CULL_DISTANCE = 210;
const FAR_DECOR_CULL_DISTANCE = 280;
const WORLD_CULLING_UPDATE_INTERVAL = 10;
const CAMERA_OCCLUDER_FADE_OPACITY = 0.26;
const CAMERA_OCCLUDER_UPDATE_INTERVAL = 3;
const CAMERA_OCCLUDER_CORRIDOR_RADIUS = 5.4;
const CAMERA_OCCLUDER_MAX_CANDIDATES = 36;

interface LandingSplashParticle {
  mesh: Mesh;
  origin: Vector3;
  normal: Vector3;
  direction: Vector3;
  age: number;
  life: number;
  height: number;
  width: number;
  bend: number;
  twist: number;
}

interface SnowTrailParticle {
  mesh: Mesh;
  origin: Vector3;
  velocity: Vector3;
  age: number;
  life: number;
  drift: number;
}

interface MossuTraceStamp {
  age: number;
  life: number;
  maxAlpha: number;
}

interface MossuTraceSystem {
  mesh: InstancedMesh;
  alpha: Float32Array;
}

interface MossuTraceWearContext {
  dirt: number;
  shoulder: number;
  painted: number;
  readable: number;
}

function sampleMossuTraceWearContext(x: number, z: number): MossuTraceWearContext {
  const dirt = sampleRouteDirtPathMask(x, z);
  const clearing = sampleRouteReadabilityClearing(x, z);
  const painted = samplePaintedGroundMask(x, z);
  const shoulder = MathUtils.clamp(clearing - dirt * 0.54, 0, 1);
  return {
    dirt,
    shoulder,
    painted,
    readable: MathUtils.clamp(Math.max(dirt, shoulder * 0.82, painted * 0.58), 0, 1),
  };
}

function createMossuTraceSystem(): MossuTraceSystem {
  const geometry = new CircleGeometry(1, 18);
  geometry.rotateX(-Math.PI / 2);

  const alpha = new Float32Array(MOSSU_TRACE_STAMP_COUNT);
  const seed = new Float32Array(MOSSU_TRACE_STAMP_COUNT);
  for (let index = 0; index < seed.length; index += 1) {
    seed[index] = Math.random();
  }
  geometry.setAttribute("instanceTraceAlpha", new InstancedBufferAttribute(alpha, 1));
  geometry.setAttribute("instanceTraceSeed", new InstancedBufferAttribute(seed, 1));

  const material = new MeshBasicMaterial({
    color: "#82945b",
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  material.onBeforeCompile = (shader: GrassShader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float instanceTraceAlpha;
        attribute float instanceTraceSeed;
        varying float vTraceAlpha;
        varying float vTraceSeed;
        varying vec2 vTraceUv;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vTraceAlpha = instanceTraceAlpha;
        vTraceSeed = instanceTraceSeed;
        vTraceUv = uv;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vTraceAlpha;
        varying float vTraceSeed;
        varying vec2 vTraceUv;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `vec2 traceCenter = (vTraceUv - vec2(0.5)) * 2.0;
        float radius = length(traceCenter);
        float sketch = sin(vTraceUv.x * 21.0 + vTraceSeed * 7.0) * 0.5 +
          sin((vTraceUv.x + vTraceUv.y) * 15.0 - vTraceSeed * 5.0) * 0.35;
        float edge = 1.0 - smoothstep(0.55 + sketch * 0.025, 0.98, radius);
        float fiber = sin((vTraceUv.x * 0.86 + vTraceUv.y * 0.54) * 24.0 + vTraceSeed * 12.0) * 0.5 + 0.5;
        float brokenStroke = mix(0.68, 1.0, smoothstep(0.22, 0.9, fiber));
        float centerLift = 0.76 + smoothstep(0.1, 0.72, abs(traceCenter.y)) * 0.18;
        vec3 traceDiffuse = diffuse * vec3(0.94, 1.02, 0.82);
        vec4 diffuseColor = vec4(traceDiffuse, opacity * vTraceAlpha * edge * brokenStroke * centerLift);`,
      );
  };

  const mesh = new InstancedMesh(geometry, material, MOSSU_TRACE_STAMP_COUNT);
  const dummy = new Object3D();
  dummy.position.set(0, -999, 0);
  dummy.scale.setScalar(0.001);
  dummy.updateMatrix();
  for (let index = 0; index < MOSSU_TRACE_STAMP_COUNT; index += 1) {
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = "mossu-pressed-grass-trace";
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { mesh, alpha };
}

interface WorldRendererOptions {
  debugSpiritCloseup?: boolean;
  webGpuCompatibleMaterials?: boolean;
  waterDepthDebug?: boolean;
}

export interface WorldPerfStats {
  deferredWorldSlices: number;
  terrainVertices: number;
  terrainTriangles: number;
  grassMeshes: number;
  grassInstances: number;
  grassEstimatedTriangles: number;
  grassImpostorMeshes: number;
  grassImpostorInstances: number;
  grassImpostorEstimatedTriangles: number;
  grassLodCells: number;
  grassLodSourceInstances: number;
  grassLodVisitedCells: number;
  grassLodVisitedSources: number;
  mossuTraceMeshes: number;
  mossuTraceStampBudget: number;
  mossuTraceActiveStamps: number;
  grasslandLifeSignals: number;
  grasslandDistantBirds: number;
  forestMeshes: number;
  treeLeafWindVisibleMeshes: number;
  forestInstances: number;
  forestEstimatedTriangles: number;
  smallPropMeshes: number;
  smallPropInstances: number;
  smallPropEstimatedTriangles: number;
  waterSurfaces: number;
  waterVertices: number;
  waterTriangles: number;
  animatedShaderMeshes: number;
  grassShaderMeshes: number;
  treeShaderMeshes: number;
  waterShaderSurfaces: number;
}

export interface WorldQaStats {
  smallPropMeshes: number;
  smallPropInstances: number;
  smallPropMeshesUsingGeometryVertexColors: number;
  smallPropMeshesMissingInstanceColors: number;
  emptySmallPropMeshes: number;
}

export class WorldRenderer {
  readonly mossu = new MossuAvatar();
  readonly terrain = makeTerrainMesh();
  readonly skyDome: Mesh;
  readonly skySun = buildStylizedSkySun();
  readonly clouds = new Group();
  readonly windMeshes: Array<InstancedMesh> = [];
  private readonly treeWindMeshes: Array<InstancedMesh> = [];
  private readonly treeLeafWindMeshes: Mesh[] = [];
  private readonly grassImpostorMeshes: Array<InstancedMesh> = [];
  private readonly smallPropMeshes: Array<InstancedMesh> = [];
  private readonly waterSystem: WaterSystem;
  private readonly cameraCollisionMeshes: Mesh[] = [];
  private readonly cameraOccluderMeshes: Mesh[] = [];
  private readonly cameraOcclusionCandidates: Mesh[] = [];
  private readonly cameraOcclusionActiveMeshes = new Set<Mesh>();
  private readonly fadedCameraOccluders = new Set<Mesh>();
  private readonly cameraOcclusionRay = new Raycaster();
  private readonly cameraOcclusionDirection = new Vector3();
  private readonly cameraOcclusionTarget = new Vector3();
  private readonly cameraOcclusionMeshPosition = new Vector3();
  private cameraOcclusionFrame = 0;
  private readonly gameplayFog = new FogExp2(grasslandsArt.scene.fog, 0.00054);
  private readonly lowlandBackground = new Color(grasslandsArt.scene.lowlandBackground);
  private readonly highlandBackground = new Color(grasslandsArt.scene.highlandBackground);
  private readonly lowlandFogColor = new Color(grasslandsArt.scene.lowlandFog);
  private readonly highlandFogColor = new Color(grasslandsArt.scene.highlandFog);
  private readonly lowlandSunColor = new Color(grasslandsArt.scene.lowlandSun);
  private readonly highlandSunColor = new Color(grasslandsArt.scene.highlandSun);
  private readonly lowlandSkyFillColor = new Color(grasslandsArt.scene.lowlandSkyFill);
  private readonly highlandSkyFillColor = new Color(grasslandsArt.scene.highlandSkyFill);
  private readonly lowlandGroundFillColor = new Color(grasslandsArt.scene.lowlandGroundFill);
  private readonly highlandGroundFillColor = new Color(grasslandsArt.scene.highlandGroundFill);
  private readonly sceneColorPairs: SceneColorPairs = {
    sun: { lowland: this.lowlandSunColor, highland: this.highlandSunColor },
    skyFill: { lowland: this.lowlandSkyFillColor, highland: this.highlandSkyFillColor },
    skyGround: { lowland: this.lowlandGroundFillColor, highland: this.highlandGroundFillColor },
    fog: { lowland: this.lowlandFogColor, highland: this.highlandFogColor },
    background: { lowland: this.lowlandBackground, highland: this.highlandBackground },
  };
  private readonly ambientLight = new AmbientLight(grasslandsArt.scene.ambient, 1.06);
  private readonly skyFill = new HemisphereLight(grasslandsArt.scene.skyFill, grasslandsArt.scene.skyGround, 1.24);
  private readonly skyBounce = new DirectionalLight(grasslandsArt.scene.skyBounce, 0.42);
  private readonly scenePatchHaze = new Color();
  private readonly scenePatchBright = new Color();
  private readonly scenePatchShadow = new Color();
  private readonly scenePatchHorizon = new Color();
  private readonly scenePatchSunDir = new Vector3();
  private readonly worldLightingMood = createWorldLightingMoodState();
  private fogDensityScale = 1;
  private nordicFilmStrength = 0;
  private elevationMood = 0;
  private waterDepthDebug = false;
  private grassLodFrame = 0;
  private grassLodMeshCursor = 0;
  private worldCullingFrame = 0;
  private lastMapLookdown = false;
  private treeLeafWindUpdateCarry = 0;
  private readonly treeLeafWindCullCenter = new Vector3();
  private heroGrassPulse = 0;
  private environmentPulse = 0;
  private readonly debugHiddenLayers = new Set<string>();
  private suppressHighlandVistaGrass = false;

  private readonly shrine = buildShrine();
  private readonly terrainFormStrokes = buildTerrainFormStrokes();
  private readonly openingNestVista = batchStaticDecorations(buildOpeningNestVista(), "opening-nest-vista-batch");
  private readonly openingWaterComposition = batchStaticDecorations(
    buildOpeningWaterComposition(),
    "opening-water-composition-batch",
  );
  private readonly islandShell = buildFloatingIslandShell();
  private readonly distantFloatingIslands = buildDistantFloatingIslands();
  private readonly groundLayer = new Group();
  private readonly midLayer = new Group();
  private readonly treeClusters = new Group();
  private readonly forestGroveAccents = new Group();
  private readonly biomeTransitionAccents = batchStaticDecorations(
    buildBiomeTransitionAccents(),
    "biome-transition-batch",
  );
  private readonly biomeThresholdLandmarks = batchStaticDecorations(
    buildBiomeThresholdLandmarks(),
    "biome-threshold-landmark-batch",
  );
  private readonly waterBankAccents = batchStaticDecorations(buildWaterBankAccents(), "water-bank-batch");
  private readonly anchorSceneAccents = batchStaticDecorations(buildAnchorSceneAccents(), "anchor-scene-batch");
  private readonly highlandAccents = batchStaticDecorations(buildHighlandAccents(), "highland-accent-batch");
  private readonly grasslandImmersion = buildGrasslandImmersionSystem();
  private readonly mountainAtmosphere = new Group();
  private readonly valleyMist = new Group();
  private readonly ambientMotes: AmbientMoteSystem = buildAmbientMotes();
  private readonly ocean: OceanSystem = buildOceanSystem();
  private readonly _moteWindScratch = new Vector3();
  private readonly shadowVolumes = new Group();
  private readonly landmarkTrees = new Group();
  private readonly mountainSilhouettes = new Group();
  private readonly sun = new DirectionalLight(grasslandsArt.scene.sun, 3.28);
  private readonly mossuContactShadow = new Mesh(
    new CircleGeometry(1, 32),
    new MeshBasicMaterial({
      color: grasslandsArt.scene.contactShadow,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );

  debugSetLayerVisibility(layer: string, visible: boolean) {
    if (visible) {
      this.debugHiddenLayers.delete(layer);
    } else {
      this.debugHiddenLayers.add(layer);
    }
    this.applyDebugLayerVisibility();
  }
  private readonly meadowGlow = new PointLight(grasslandsArt.scene.meadowGlow, 1.48, 220, 1.4);
  private readonly alpineGlow = new PointLight(grasslandsArt.scene.alpineGlow, 0.74, 260, 1.1);
  private readonly landingSplash = new Group();
  private readonly landingParticles: LandingSplashParticle[] = [];
  private readonly snowTrail = new Group();
  private readonly snowTrailParticles: SnowTrailParticle[] = [];
  private readonly mossuTrace = createMossuTraceSystem();
  private readonly mossuTraceStamps: MossuTraceStamp[] = Array.from({ length: MOSSU_TRACE_STAMP_COUNT }, () => ({
    age: Number.POSITIVE_INFINITY,
    life: 1,
    maxAlpha: 0,
  }));
  private readonly ambientBlobs: AmbientBlob[] = [];
  private readonly ambientNestGroup = new Group();
  private readonly ambientBlobGroup = new Group();
  private faunaStats: AmbientBlobUpdateStats = {
    speciesName: AMBIENT_BLOB_SPECIES_NAME,
    recruitedCount: 0,
    maxFollowerDistance: 0,
    nearestRecruitableDistance: null,
    recruitedThisFrame: 0,
    firstEncounterActive: false,
    rollingCount: 0,
    mossuCollisionCount: 0,
    dominantMood: "curious",
    regroupActive: false,
    callHeardActive: false,
    idleRoutineCount: 0,
    followers: [],
  };
  private readonly landingUp = new Vector3(0, 1, 0);
  private readonly landingQuat = new Quaternion();
  private readonly landingPosition = new Vector3();
  private readonly landingNormal = new Vector3();
  private readonly trailVelocity = new Vector3();
  private readonly trailDirection = new Vector3();
  private readonly mossuTraceDummy = new Object3D();
  private readonly mossuTraceVelocity = new Vector3();
  private readonly mossuTraceDirection = new Vector3();
  private readonly remoteMossus = new Map<string, RemoteMossuVisual>();
  private readonly remoteMossuScratch = new Vector3();
  private trailEmissionCarry = 0;
  private mossuTraceEmissionCarry = 0;
  private mossuTraceCursor = 0;
  private mossuTraceActiveStamps = 0;
  private readonly mapMarkerGroup = new Group();
  private readonly forageableGroup = new Group();
  private readonly forageableVisuals: ForageableVisual[] = [];
  private readonly startupContentQueue: Array<() => void> = [];
  private startupIdleBuildHandle = 0;
  private readonly playerMapMarker: MapMarker = {
    group: createMapMarker(grasslandsArt.scene.playerMapMarker, 3.2, 12, 0.42),
    baseScale: 1,
    pulseSpeed: 4.2,
  };
  private readonly shrineMapMarker: MapMarker = {
    group: createMapMarker(grasslandsArt.scene.shrineMapMarker, 4.2, 18, 0.38),
    baseScale: 1,
    pulseSpeed: 2.4,
  };
  private readonly landmarkMapMarkers: Array<MapMarker> = [];
  private readonly atlasMapMarkers: Array<MapMarker> = [];
  private readonly deferredWorldSlices: Array<() => void> = [];
  private deferredWorldFrame = 0;

  constructor(
    private readonly scene: Scene,
    options: WorldRendererOptions = {},
  ) {
    this.waterDepthDebug = options.waterDepthDebug ?? false;
    this.waterSystem = new WaterSystem({ depthDebug: this.waterDepthDebug });
    this.skyDome = buildSkyDome({
      webGpuCompatible: options.webGpuCompatibleMaterials ?? false,
    });
    scene.background = this.lowlandBackground.clone();
    scene.fog = this.gameplayFog;

    this.skyBounce.position.set(148, 126, 196);
    scene.add(this.ambientLight, this.skyFill, this.skyBounce);

    this.sun.castShadow = false;
    applySunRig(this.sun);
    scene.add(this.sun.target);
    scene.add(this.sun);
    this.meadowGlow.color.set(grasslandsArt.scene.meadowGlowRuntime);
    this.meadowGlow.intensity = 0.46;
    this.meadowGlow.distance = 240;
    this.meadowGlow.position.set(-186, 38, -122);
    this.alpineGlow.color.set(grasslandsArt.scene.alpineGlowRuntime);
    this.alpineGlow.intensity = 0.56;
    this.alpineGlow.position.set(44, 128, 186);
    scene.add(this.meadowGlow, this.alpineGlow);

    scene.add(this.skyDome);
    scene.add(this.skySun);
    scene.add(this.ocean.mesh);
    scene.add(this.terrain);
    scene.add(this.terrainFormStrokes);
    scene.add(this.openingNestVista);
    scene.add(this.openingWaterComposition);
    this.mossuContactShadow.rotation.x = -Math.PI / 2;
    this.mossuContactShadow.renderOrder = 1;
    scene.add(this.mossuContactShadow);
    scene.add(this.islandShell);
    scene.add(this.distantFloatingIslands);
    scene.add(this.waterSystem.group);
    scene.add(this.groundLayer);
    scene.add(this.midLayer);
    scene.add(this.treeClusters);
    scene.add(this.forestGroveAccents);
    scene.add(this.biomeTransitionAccents);
    scene.add(this.biomeThresholdLandmarks);
    scene.add(this.waterBankAccents);
    scene.add(this.anchorSceneAccents);
    scene.add(this.highlandAccents);
    scene.add(this.grasslandImmersion.group);
    scene.add(this.mountainAtmosphere);
    scene.add(this.valleyMist);
    scene.add(this.ambientMotes.group);
    scene.add(this.landmarkTrees);
    scene.add(this.shadowVolumes);
    scene.add(this.shrine);
    scene.add(this.clouds);
    scene.add(this.mossu.group);
    scene.add(this.landingSplash);
    scene.add(this.snowTrail);
    scene.add(this.mossuTrace.mesh);
    scene.add(this.forageableGroup);
    scene.add(this.ambientNestGroup);
    scene.add(this.ambientBlobGroup);
    scene.add(this.mapMarkerGroup);

    const meadowNearGrass = createGrassMesh(
      Math.round(GRASS_COUNT * 0.5),
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color(grasslandsArt.grass.nearBottom),
      new Color(grasslandsArt.grass.nearTop),
      {
        crossPlanes: 2,
        bladeWidth: 0.74,
        bladeHeight: 3.85,
        placementMultiplier: 1.52,
        scaleMultiplier: 1.16,
        widthMultiplier: 1.06,
        fadeInStart: 5,
        fadeInEnd: 12,
        fadeOutStart: 44,
        fadeOutEnd: 88,
        rootFillBoost: 0.05,
        selfShadowStrength: 0.72,
        distanceCompressionBoost: 0.04,
        playerPushRadius: 16.5,
        playerPushStrength: 1.86,
        windExaggeration: 1.38,
        windTimeScale: 1,
        broadWindScale: 1.14,
        fineWindScale: 1.25,
        lod: {
          label: "near",
          innerRadius: 0,
          outerRadius: 88,
          cellSize: 22,
          sampleStride: 1,
          updateEveryFrames: 4,
          movementThreshold: 1.8,
        },
      },
    );
    const meadowMidGrass = createGrassMesh(
      Math.round(GRASS_COUNT * 0.34),
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color(grasslandsArt.grass.midBottom),
      new Color(grasslandsArt.grass.midTop),
      {
        crossPlanes: 1,
        bladeWidth: 0.94,
        bladeHeight: 3.32,
        placementMultiplier: 1.42,
        scaleMultiplier: 1.08,
        widthMultiplier: 1.12,
        fadeInStart: 24,
        fadeInEnd: 44,
        fadeOutStart: 118,
        fadeOutEnd: 190,
        rootFillBoost: 0.18,
        selfShadowStrength: 0.58,
        distanceCompressionBoost: 0.14,
        playerPushRadius: 15.5,
        playerPushStrength: 1.6,
        windExaggeration: 1.34,
        windTimeScale: 0.82,
        broadWindScale: 0.96,
        fineWindScale: 0.55,
        lod: {
          label: "mid",
          innerRadius: 48,
          outerRadius: 226,
          cellSize: 34,
          sampleStride: 2,
          updateEveryFrames: 6,
          movementThreshold: 3,
        },
      },
    );
    const meadowFarGrassPatches = createGrassPatchImpostorMesh(
      FAR_GRASS_PATCH_COUNT,
      (zone) => zone === "plains" || zone === "hills" || zone === "foothills",
      new Color(grasslandsArt.grass.farBottom),
      new Color(grasslandsArt.grass.farTop),
      {
        placementMultiplier: 1.42,
        scaleMultiplier: 1.12,
        opacity: 0.32,
      },
    );
    const alpineGrass = createGrassMesh(
      ALPINE_GRASS_COUNT,
      (zone) => zone === "alpine" || zone === "ridge",
      new Color(grasslandsArt.grass.alpineBottom),
      new Color(grasslandsArt.grass.alpineTop),
      {
        crossPlanes: 1,
        bladeWidth: 0.58,
        bladeHeight: 1.82,
        placementMultiplier: 0.76,
        scaleMultiplier: 0.62,
        widthMultiplier: 0.76,
        fadeInStart: 16,
        fadeInEnd: 32,
        fadeOutStart: 96,
        fadeOutEnd: 172,
        selfShadowStrength: 0.24,
        distanceCompressionBoost: 0.24,
        playerPushRadius: 11.5,
        playerPushStrength: 1.08,
        windExaggeration: 1.26,
        windTimeScale: 0.58,
        broadWindScale: 0.96,
        fineWindScale: 0.24,
        lod: {
          label: "alpine",
          innerRadius: 34,
          outerRadius: 188,
          cellSize: 52,
          sampleStride: 3,
          updateEveryFrames: 10,
          movementThreshold: 8,
        },
      },
    );
    this.windMeshes.push(meadowNearGrass, meadowMidGrass, alpineGrass);
    this.grassImpostorMeshes.push(meadowFarGrassPatches);
    scene.add(meadowFarGrassPatches, meadowNearGrass, meadowMidGrass, alpineGrass);

    scene.add(this.mountainSilhouettes);

    const splashGeometry = new PlaneGeometry(0.3, 1.15, 1, 5);
    splashGeometry.translate(0, 0.58, 0);
    for (let i = 0; i < LANDING_SPLASH_PARTICLES; i += 1) {
      const material = new MeshLambertMaterial({
        color: i % 4 === 0 ? "#a7d17e" : i % 3 === 0 ? "#89bd68" : "#6da357",
        side: DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new Mesh(splashGeometry, material);
      mesh.visible = false;
      this.landingSplash.add(mesh);
      this.landingParticles.push({
        mesh,
        origin: new Vector3(),
        normal: new Vector3(0, 1, 0),
        direction: new Vector3(1, 0, 0),
        age: 1,
        life: 0.45,
        height: 1,
        width: 1,
        bend: 0,
        twist: 0,
      });
    }

    for (let i = 0; i < SNOW_TRAIL_PARTICLES; i += 1) {
      const material = new MeshLambertMaterial({
        color: i % 3 === 0 ? "#f6fbff" : "#edf5ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new Mesh(new SphereGeometry(0.18 + (i % 4) * 0.02, 10, 8), material);
      mesh.visible = false;
      this.snowTrail.add(mesh);
      this.snowTrailParticles.push({
        mesh,
        origin: new Vector3(),
        velocity: new Vector3(),
        age: 1,
        life: 0.36,
        drift: 0,
      });
    }

    this.mapMarkerGroup.visible = false;
    this.mapMarkerGroup.add(this.playerMapMarker.group);
    this.mapMarkerGroup.add(this.shrineMapMarker.group);
    worldLandmarks.forEach((landmark, index) => {
      if (landmark.id === "peak-shrine") {
        return;
      }

      const marker: MapMarker = {
        group: createMapMarker("#f7fbff", 1.7, 8 + (index % 2) * 2, 0.22),
        baseScale: 0.82,
        pulseSpeed: 1.6 + index * 0.18,
      };
      marker.group.position.set(landmark.position.x, landmark.position.y, landmark.position.z);
      this.landmarkMapMarkers.push(marker);
      this.mapMarkerGroup.add(marker.group);
    });
    worldMapMarkers.forEach((atlasMarker, index) => {
      const color = atlasMarker.kind === "bridge" ? "#8edaf5" : atlasMarker.kind === "special" ? "#ffc75f" : "#aeea80";
      const radius = atlasMarker.kind === "bridge" ? 2.4 : atlasMarker.kind === "special" ? 2.8 : 2.2;
      const marker: MapMarker = {
        group: createMapMarker(color, radius, atlasMarker.kind === "special" ? 12 : 9, 0.28),
        baseScale: 0.9,
        pulseSpeed: 1.2 + index * 0.12,
      };
      marker.group.position.set(
        atlasMarker.position.x,
        sampleTerrainHeight(atlasMarker.position.x, atlasMarker.position.z) + 0.1,
        atlasMarker.position.z,
      );
      this.atlasMapMarkers.push(marker);
      this.mapMarkerGroup.add(marker.group);
    });

    this.registerCameraCollider(this.terrain);
    this.collectCameraColliders(this.islandShell);
    this.collectCameraColliders(this.shrine);
    this.collectCameraColliders(this.treeClusters);
    this.collectCameraColliders(this.biomeTransitionAccents);
    this.collectCameraColliders(this.biomeThresholdLandmarks);
    this.collectCameraColliders(this.anchorSceneAccents);
    this.collectCameraColliders(this.highlandAccents);
    this.collectCameraColliders(this.landmarkTrees);
    [
      this.groundLayer,
      this.midLayer,
      this.treeClusters,
      this.forestGroveAccents,
      this.biomeTransitionAccents,
      this.biomeThresholdLandmarks,
      this.waterBankAccents,
      this.anchorSceneAccents,
      this.highlandAccents,
      this.landmarkTrees,
    ].forEach((object) => this.collectTreeWindMeshes(object));
    [
      this.groundLayer,
      this.midLayer,
      this.treeClusters,
      this.forestGroveAccents,
      this.biomeTransitionAccents,
      this.biomeThresholdLandmarks,
      this.waterBankAccents,
      this.anchorSceneAccents,
      this.highlandAccents,
    ].forEach((object) => this.collectSmallPropMeshes(object));
    [
      this.terrain,
      this.openingNestVista,
      this.openingWaterComposition,
      this.islandShell,
      this.waterSystem.group,
      this.groundLayer,
      this.midLayer,
      this.treeClusters,
      this.forestGroveAccents,
      this.biomeTransitionAccents,
      this.biomeThresholdLandmarks,
      this.waterBankAccents,
      this.anchorSceneAccents,
      this.highlandAccents,
      this.grasslandImmersion.staticLayer,
      this.shadowVolumes,
      this.landmarkTrees,
      this.shrine,
      this.mountainSilhouettes,
    ].forEach((object) => freezeStaticHierarchy(object));

    this.queueDeferredWorldSlices(options);
  }

  getCameraCollisionMeshes() {
    return this.cameraCollisionMeshes;
  }

  setVisualQualitySettings(settings: { fogStrength?: number; nordicFilmStrength?: number }) {
    if (typeof settings.fogStrength === "number" && Number.isFinite(settings.fogStrength)) {
      this.fogDensityScale = MathUtils.clamp(settings.fogStrength, 0.7, 1.25);
    }
    if (typeof settings.nordicFilmStrength === "number" && Number.isFinite(settings.nordicFilmStrength)) {
      this.nordicFilmStrength = MathUtils.clamp(settings.nordicFilmStrength, 0, 1);
    }
  }

  getPerfStats() {
    return this.createPerfStats();
  }

  flushDeferredWorldSlices() {
    let flushed = 0;
    while (this.deferredWorldSlices.length > 0) {
      this.deferredWorldSlices.shift()?.();
      flushed += 1;
    }
    this.deferredWorldFrame = 0;
    return flushed;
  }

  setWaterDepthDebugEnabled(enabled: boolean) {
    this.waterDepthDebug = enabled;
    this.waterSystem.setDepthDebugEnabled(enabled);
  }

  setRemoteMossus(remotes: readonly CoopRemoteMossuState[]) {
    const activeIds = new Set(remotes.map((remote) => remote.id));
    this.remoteMossus.forEach((remote, id) => {
      if (!activeIds.has(id)) {
        this.scene.remove(remote.group);
        this.remoteMossus.delete(id);
        this.waterSystem.markActorDry(`coop-${id}`);
      }
    });

    remotes.forEach((remote, index) => {
      let visual = this.remoteMossus.get(remote.id);
      if (!visual) {
        visual = createRemoteMossuVisual(index, remote);
        this.scene.add(visual.group);
        this.remoteMossus.set(remote.id, visual);
      }
      visual.state = remote;
    });
  }

  isWaterDepthDebugEnabled() {
    return this.waterDepthDebug;
  }

  getQaStats(): WorldQaStats {
    return {
      smallPropMeshes: this.smallPropMeshes.length,
      smallPropInstances: this.smallPropMeshes.reduce((sum, mesh) => sum + mesh.count, 0),
      smallPropMeshesUsingGeometryVertexColors: this.smallPropMeshes.filter((mesh) => {
        const material = mesh.material as Material & { vertexColors?: boolean };
        return material.vertexColors === true;
      }).length,
      smallPropMeshesMissingInstanceColors: this.smallPropMeshes.filter((mesh) => !mesh.instanceColor).length,
      emptySmallPropMeshes: this.smallPropMeshes.filter((mesh) => mesh.count <= 0).length,
    };
  }

  getFaunaStats() {
    return this.faunaStats;
  }

  private queueDeferredWorldSlices(options: WorldRendererOptions) {
    this.deferredWorldSlices.push(
      () => {
        moveChildren(this.groundLayer, buildGroundLayer());
        this.collectTreeWindMeshes(this.groundLayer);
        this.collectSmallPropMeshes(this.groundLayer);
        freezeStaticHierarchy(this.groundLayer);
      },
      () => {
        moveChildren(this.midLayer, buildMidLayer());
        this.collectTreeWindMeshes(this.midLayer);
        this.collectSmallPropMeshes(this.midLayer);
        freezeStaticHierarchy(this.midLayer);
      },
      () => {
        moveChildren(this.treeClusters, buildTreeClusters());
        this.collectCameraColliders(this.treeClusters);
        this.collectTreeWindMeshes(this.treeClusters);
        this.collectSmallPropMeshes(this.treeClusters);
        freezeStaticHierarchy(this.treeClusters);
      },
      () => {
        moveChildren(this.forestGroveAccents, buildForestGroveAccents());
        this.collectCameraColliders(this.forestGroveAccents);
        this.collectTreeWindMeshes(this.forestGroveAccents);
        this.collectSmallPropMeshes(this.forestGroveAccents);
        freezeStaticHierarchy(this.forestGroveAccents);
      },
      () => {
        const clouds = buildClouds();
        this.clouds.userData.cloudMaterial = clouds.userData.cloudMaterial;
        moveChildren(this.clouds, clouds);
      },
      () => {
        moveChildren(this.mountainAtmosphere, buildMountainAtmosphere());
        freezeStaticHierarchy(this.mountainAtmosphere);
      },
      () => {
        moveChildren(this.valleyMist, buildValleyMist());
        freezeStaticHierarchy(this.valleyMist);
      },
      () => {
        moveChildren(this.shadowVolumes, buildShadowPockets());
      },
      () => {
        const waterways = buildHighlandWaterways();
        this.waterSystem.addWaterGroup(waterways);
      },
      () => {
        const visuals = buildForageableVisuals();
        this.forageableVisuals.push(...visuals);
        visuals.forEach((visual) => {
          this.forageableGroup.add(visual.group);
        });
      },
      () => {
        moveChildren(this.mountainSilhouettes, buildMountainBackdrop());
        freezeStaticHierarchy(this.mountainSilhouettes);
      },
      () => {
        const blobs = buildAmbientBlobs(options);
        this.ambientBlobs.push(...blobs);
        this.ambientNestGroup.add(batchStaticDecorations(buildAmbientBlobNests(this.ambientBlobs), "karu-nest-batch"));
        this.ambientBlobs.forEach((blob) => {
          this.ambientBlobGroup.add(blob.group);
        });
      },
    );
  }

  private processDeferredWorldSlice(coveredByTransition = false) {
    if (this.deferredWorldSlices.length === 0) {
      return;
    }

    this.deferredWorldFrame += 1;
    if (coveredByTransition) {
      const slicesThisFrame = Math.min(DEFERRED_WORLD_SLICES_PER_COVERED_FRAME, this.deferredWorldSlices.length);
      for (let i = 0; i < slicesThisFrame; i += 1) {
        this.deferredWorldSlices.shift()?.();
      }
      return;
    }

    if (this.deferredWorldFrame < 3 || this.deferredWorldFrame % 2 !== 0) {
      return;
    }

    this.deferredWorldSlices.shift()?.();
  }

  update(
    frame: FrameState,
    elapsed: number,
    dt: number,
    mapLookdown = false,
    recruitPressed = false,
    regroupPressed = false,
    viewCamera: Camera,
    coveredByTransition = false,
  ) {
    if (regroupPressed) {
      this.mossu.triggerKaruCall();
    }
    this.faunaStats = updateAmbientBlobs(
      this.ambientBlobs,
      this.ambientBlobGroup,
      frame,
      elapsed,
      dt,
      mapLookdown,
      recruitPressed,
      regroupPressed,
    );
    this.mossu.update(frame.player, dt);
    this.updateRemoteMossus(elapsed, mapLookdown);
    this.updateMossuContactShadow(frame, mapLookdown);
    this.skyDome.position.copy(frame.player.position);
    this.suppressHighlandVistaGrass = !mapLookdown && (frame.player.position.z > 122 || frame.player.position.y > 76);
    this.updateSceneMood(frame, dt, viewCamera, elapsed);
    this.scene.fog = mapLookdown ? null : this.gameplayFog;
    if (!mapLookdown) {
      this.updateWind(frame, elapsed, dt);
      this.updateClouds(elapsed);
      this.updateValleyMist(elapsed);
      this.updateAmbientMotes(frame, elapsed, dt, viewCamera);
      this.ocean.update(elapsed, this.sun, viewCamera);
    }
    updateGrasslandImmersionSystem(
      this.grasslandImmersion,
      elapsed,
      mapLookdown,
      frame.player.position,
      MathUtils.clamp(
        (this.faunaStats.firstEncounterActive ? 0.65 : 0) +
          (this.faunaStats.recruitedThisFrame > 0 ? 1 : 0) +
          (this.faunaStats.rollingCount > 0 ? 0.28 : 0),
        0,
        1,
      ),
    );
    this.updateWaterInteractions(frame, elapsed, mapLookdown);
    this.updateWater(elapsed, mapLookdown);
    this.updateLandingSplash(frame, dt);
    this.updateSnowTrail(frame, dt);
    this.updateMossuTrace(frame, dt, mapLookdown);
    this.updateForageables(frame, elapsed, mapLookdown);
    this.updateMapMarkers(frame, elapsed, mapLookdown);
    this.updateGrassLod(frame, mapLookdown, coveredByTransition);
    const mapLookdownChanged = this.lastMapLookdown !== mapLookdown;
    this.updateWorldCulling(frame, viewCamera, mapLookdown, mapLookdownChanged);
    this.syncMapLookdownVisibility(mapLookdown);
    this.updateCameraOccluderFade(frame, viewCamera, dt, mapLookdown);
    this.lastMapLookdown = mapLookdown;
    this.processDeferredWorldSlice(coveredByTransition);
  }

  private syncMapLookdownVisibility(mapLookdown: boolean) {
    const gameplayVisible = !mapLookdown;
    const grassVisible = gameplayVisible && !this.suppressHighlandVistaGrass;
    this.windMeshes.forEach((mesh) => {
      mesh.visible = grassVisible && mesh.count > 0;
    });
    this.treeWindMeshes.forEach((mesh) => {
      mesh.visible = gameplayVisible && mesh.count > 0;
    });
    this.treeLeafWindMeshes.forEach((mesh) => {
      mesh.visible = gameplayVisible && ((mesh.userData.treeLeafWindCullVisible as boolean | undefined) ?? true);
    });
    this.smallPropMeshes.forEach((mesh) => {
      if (mapLookdown) {
        mesh.visible = false;
      }
    });
    this.skyDome.visible = gameplayVisible;
    this.skySun.visible = gameplayVisible;
    this.islandShell.visible = gameplayVisible;
    this.distantFloatingIslands.visible = gameplayVisible;
    this.clouds.visible = gameplayVisible;
    this.mountainSilhouettes.visible = gameplayVisible;
    this.mountainAtmosphere.visible = gameplayVisible;
    this.groundLayer.visible = gameplayVisible;
    this.midLayer.visible = gameplayVisible;
    this.treeClusters.visible = gameplayVisible;
    this.forestGroveAccents.visible = gameplayVisible;
    this.waterBankAccents.visible = gameplayVisible;
    this.highlandAccents.visible = gameplayVisible;
    this.valleyMist.visible = gameplayVisible;
    this.ambientMotes.setVisible(gameplayVisible);
    this.ocean.setVisible(gameplayVisible);
    this.shadowVolumes.visible = gameplayVisible;
    this.terrainFormStrokes.visible = gameplayVisible;
    this.mossuTrace.mesh.visible = gameplayVisible && this.mossuTraceActiveStamps > 0;
    this.grassImpostorMeshes.forEach((mesh) => {
      mesh.visible = grassVisible && mesh.count > 0;
    });
    this.applyDebugLayerVisibility();
  }

  private applyDebugLayerVisibility() {
    if (this.debugHiddenLayers.size === 0) {
      return;
    }
    if (this.debugHiddenLayers.has("clouds")) {
      this.clouds.visible = false;
    }
    if (this.debugHiddenLayers.has("grass")) {
      this.windMeshes.forEach((mesh) => {
        mesh.visible = false;
      });
      this.grassImpostorMeshes.forEach((mesh) => {
        mesh.visible = false;
      });
    }
    if (this.debugHiddenLayers.has("mountains")) {
      this.mountainSilhouettes.visible = false;
    }
    if (this.debugHiddenLayers.has("mountainAtmosphere")) {
      this.mountainAtmosphere.visible = false;
    }
    if (this.debugHiddenLayers.has("sky")) {
      this.skyDome.visible = false;
    }
    if (this.debugHiddenLayers.has("sun")) {
      this.skySun.visible = false;
    }
    if (this.debugHiddenLayers.has("floatingIslands")) {
      this.distantFloatingIslands.visible = false;
    }
    if (this.debugHiddenLayers.has("terrain")) {
      this.terrain.visible = false;
    }
  }

  private updateRemoteMossus(elapsed: number, mapLookdown: boolean) {
    this.remoteMossus.forEach((remote) => {
      const player = remote.state.player;
      remote.group.visible = !mapLookdown;
      if (!mapLookdown) {
        const activityLift = remote.state.activity === "hop" || player.floating ? 0.12 : 0;
        const pulse = 1 + remote.state.eventPulse * 0.12;
        const rollSquash = player.rolling ? 0.88 : 1;
        const swimFlatten = player.swimming ? 0.84 : 1;
        remote.group.position.set(player.position.x, player.position.y - 1.15, player.position.z);
        remote.group.rotation.y = player.heading;
        remote.group.scale.setScalar(remote.baseScale * pulse);
        remote.body.position.y = 0.98 + Math.sin(elapsed * 2.2 + remote.bobOffset) * 0.08 + activityLift;
        remote.body.scale.set(1.1 + remote.state.eventPulse * 0.08, 0.86 * rollSquash * swimFlatten, 1.0);
        remote.tuft.position.y = 1.7 + activityLift + Math.sin(elapsed * 2.6 + remote.bobOffset) * 0.06;
        remote.tuft.rotation.z = Math.sin(elapsed * 2.1 + remote.bobOffset) * 0.18;
      }
    });
  }

  private updateForageables(frame: FrameState, elapsed: number, mapLookdown: boolean) {
    this.forageableGroup.visible = !mapLookdown;
    if (mapLookdown) {
      return;
    }

    this.forageableVisuals.forEach((visual, index) => {
      const gathered = frame.save.gatheredForageableIds.has(visual.id);
      const distanceToPlayer = Math.hypot(
        visual.group.position.x - frame.player.position.x,
        visual.group.position.z - frame.player.position.z,
      );
      visual.group.visible = !gathered && distanceToPlayer < 148;
      if (gathered) {
        return;
      }
      if (!visual.group.visible) {
        return;
      }

      const bob = Math.sin(elapsed * 1.8 + visual.bobOffset) * 0.18;
      visual.group.position.y = visual.baseY + bob;
      if (visual.kind === "berry" || visual.kind === "seed" || visual.kind === "shell") {
        visual.group.rotation.y = elapsed * 0.55 * visual.spinDirection + visual.swayOffset;
        visual.group.rotation.z = visual.kind === "shell" ? Math.sin(elapsed * 1.2 + visual.swayOffset) * 0.04 : 0;
      } else if (visual.kind === "feather") {
        visual.group.rotation.y = visual.swayOffset + Math.sin(elapsed * 1.35 + visual.swayOffset) * 0.16;
        visual.group.rotation.z = Math.sin(elapsed * 1.8 + index * 0.3) * 0.11;
      } else {
        visual.group.rotation.y = visual.swayOffset;
        visual.group.rotation.z = Math.sin(elapsed * 1.5 + visual.swayOffset + index * 0.3) * 0.08;
      }
    });
  }

  private collectCameraColliders(root: Object3D) {
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && mesh.userData.cameraCollider) {
        this.registerCameraCollider(mesh);
      }
    });
  }

  private registerCameraCollider(mesh: Mesh) {
    if (!this.cameraCollisionMeshes.includes(mesh)) {
      this.cameraCollisionMeshes.push(mesh);
    }
    if (mesh.userData.cameraOccluderFade && !this.cameraOccluderMeshes.includes(mesh)) {
      this.cameraOccluderMeshes.push(mesh);
    }
  }

  private createPerfStats(): WorldPerfStats {
    const waterControllers = this.waterSystem.getControllers();
    const waterGeometryStats = waterControllers.reduce(
      (stats, controller) => {
        stats.vertices += countGeometryVertices(controller.mesh.geometry);
        stats.triangles += countGeometryTriangles(controller.mesh.geometry);
        return stats;
      },
      { vertices: 0, triangles: 0 },
    );
    const grassInstances = this.windMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const grassLodStats = this.windMeshes.map((mesh) => getGrassMeshLodStats(mesh));
    const grassImpostorInstances = this.grassImpostorMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const forestInstances = this.treeWindMeshes.reduce((sum, mesh) => sum + mesh.count, 0);
    const treeLeafWindVisibleMeshes = this.treeLeafWindMeshes.reduce((sum, mesh) => sum + (mesh.visible ? 1 : 0), 0);
    const staticTreeWindTriangles = this.treeLeafWindMeshes.reduce(
      (sum, mesh) => sum + countGeometryTriangles(mesh.geometry),
      0,
    );
    const smallPropInstances = this.smallPropMeshes.reduce((sum, mesh) => sum + mesh.count, 0);

    return {
      deferredWorldSlices: this.deferredWorldSlices.length,
      terrainVertices: countGeometryVertices(this.terrain.geometry),
      terrainTriangles: countGeometryTriangles(this.terrain.geometry),
      grassMeshes: this.windMeshes.length,
      grassInstances,
      grassEstimatedTriangles: countInstancedTriangles(this.windMeshes),
      grassImpostorMeshes: this.grassImpostorMeshes.length,
      grassImpostorInstances,
      grassImpostorEstimatedTriangles: countInstancedTriangles(this.grassImpostorMeshes),
      grassLodCells: grassLodStats.reduce((sum, stats) => sum + (stats?.cells ?? 0), 0),
      grassLodSourceInstances: grassLodStats.reduce((sum, stats) => sum + (stats?.sourceInstances ?? 0), 0),
      grassLodVisitedCells: grassLodStats.reduce((sum, stats) => sum + (stats?.visitedCells ?? 0), 0),
      grassLodVisitedSources: grassLodStats.reduce((sum, stats) => sum + (stats?.visitedSources ?? 0), 0),
      mossuTraceMeshes: 1,
      mossuTraceStampBudget: MOSSU_TRACE_STAMP_COUNT,
      mossuTraceActiveStamps: this.mossuTraceActiveStamps,
      grasslandLifeSignals: GRASSLAND_LIFE_SIGNAL_COUNT,
      grasslandDistantBirds: DISTANT_BIRD_COUNT,
      forestMeshes: this.treeWindMeshes.length + this.treeLeafWindMeshes.length,
      treeLeafWindVisibleMeshes,
      forestInstances,
      forestEstimatedTriangles: countInstancedTriangles(this.treeWindMeshes) + staticTreeWindTriangles,
      smallPropMeshes: this.smallPropMeshes.length,
      smallPropInstances,
      smallPropEstimatedTriangles: countInstancedTriangles(this.smallPropMeshes),
      waterSurfaces: waterControllers.length,
      waterVertices: waterGeometryStats.vertices,
      waterTriangles: waterGeometryStats.triangles,
      animatedShaderMeshes:
        this.windMeshes.length + this.treeWindMeshes.length + this.treeLeafWindMeshes.length + waterControllers.length,
      grassShaderMeshes: this.windMeshes.length,
      treeShaderMeshes: this.treeWindMeshes.length + this.treeLeafWindMeshes.length,
      waterShaderSurfaces: waterControllers.length,
    };
  }

  private collectTreeWindMeshes(root: Object3D) {
    root.traverse((node) => {
      const instancedMesh = node as InstancedMesh;
      if (
        instancedMesh.isInstancedMesh &&
        instancedMesh.userData.canopyWind &&
        !this.treeWindMeshes.includes(instancedMesh)
      ) {
        this.treeWindMeshes.push(instancedMesh);
      }

      const mesh = node as Mesh;
      if (mesh.isMesh && mesh.userData.treeLeafWind && !this.treeLeafWindMeshes.includes(mesh)) {
        this.treeLeafWindMeshes.push(mesh);
      }
    });
  }

  private collectSmallPropMeshes(root: Object3D) {
    root.traverse((node) => {
      const mesh = node as InstancedMesh;
      if (mesh.isInstancedMesh && mesh.userData.smallPropBatch) {
        this.smallPropMeshes.push(mesh);
      }
    });
  }

  private updateMossuContactShadow(frame: FrameState, mapLookdown: boolean) {
    const player = frame.player;
    const terrainY = sampleTerrainHeight(player.position.x, player.position.z);
    const water = sampleWaterState(player.position.x, player.position.z);
    const surfaceY = water ? Math.max(terrainY, water.surfaceY) : terrainY;
    const heightAboveSurface = MathUtils.clamp(player.position.y - surfaceY, 0, 16);
    const groundedFade = player.fallingToVoid ? 0 : 1 - MathUtils.smoothstep(heightAboveSurface, 2.4, 14);
    const waterFade = water && water.depth > 0.24 ? 0.48 : 1;
    const rollingScale = player.rolling ? 1.22 : 1;
    const shadowScale = MathUtils.lerp(4.8, 7.4, MathUtils.clamp(heightAboveSurface / 12, 0, 1)) * rollingScale;
    const material = this.mossuContactShadow.material as MeshBasicMaterial;

    this.mossuContactShadow.visible = !mapLookdown && groundedFade > 0.02;
    this.mossuContactShadow.position.set(player.position.x, surfaceY + 0.055, player.position.z);
    this.mossuContactShadow.scale.set(shadowScale * 1.08, shadowScale * 0.74, 1);
    material.opacity = 0.12 * groundedFade * waterFade;
  }

  private updateGrassLod(frame: FrameState, mapLookdown: boolean, _coveredByTransition: boolean) {
    if (mapLookdown || this.suppressHighlandVistaGrass) {
      return;
    }

    this.grassLodFrame += 1;
    const meshCount = this.windMeshes.length;
    if (meshCount === 0) {
      return;
    }

    for (let offset = 0; offset < meshCount; offset += 1) {
      const meshIndex = (this.grassLodMeshCursor + offset) % meshCount;
      if (updateGrassMeshLod(this.windMeshes[meshIndex], frame.player.position, this.grassLodFrame)) {
        this.grassLodMeshCursor = (meshIndex + 1) % meshCount;
        return;
      }
    }
  }

  private updateWorldCulling(frame: FrameState, viewCamera: Camera, mapLookdown: boolean, force = false) {
    this.worldCullingFrame += 1;
    if (!force && this.worldCullingFrame % WORLD_CULLING_UPDATE_INTERVAL !== 0) {
      return;
    }

    if (mapLookdown) {
      this.smallPropMeshes.forEach((mesh) => {
        mesh.visible = false;
      });
      return;
    }

    const player = frame.player.position;
    const camera = viewCamera.position;
    this.smallPropMeshes.forEach((mesh) => {
      const centerX = (mesh.userData.smallPropCenterX as number | undefined) ?? 0;
      const centerZ = (mesh.userData.smallPropCenterZ as number | undefined) ?? 0;
      const radius = (mesh.userData.smallPropRadius as number | undefined) ?? 80;
      const playerDistance = Math.hypot(centerX - player.x, centerZ - player.z);
      const cameraDistance = Math.hypot(centerX - camera.x, centerZ - camera.z);
      const cullDistance = mesh.count > 80 ? SMALL_PROP_CULL_DISTANCE : FAR_DECOR_CULL_DISTANCE;
      mesh.visible = playerDistance <= radius + cullDistance || cameraDistance <= radius + cullDistance * 0.82;
    });
    this.updateTreeLeafWindCulling(player, camera);
  }

  private updateTreeLeafWindCulling(player: Vector3, camera: Vector3) {
    const cullDistance = this.suppressHighlandVistaGrass
      ? TREE_LEAF_WIND_HIGHLAND_CULL_DISTANCE
      : TREE_LEAF_WIND_CULL_DISTANCE;
    this.treeLeafWindMeshes.forEach((mesh) => {
      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      const sphere = mesh.geometry.boundingSphere;
      if (!sphere) {
        mesh.userData.treeLeafWindCullVisible = true;
        mesh.visible = true;
        return;
      }

      const center = this.treeLeafWindCullCenter.copy(sphere.center).applyMatrix4(mesh.matrixWorld);
      const radius = sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
      const playerDistance = Math.hypot(center.x - player.x, center.z - player.z);
      const cameraDistance = Math.hypot(center.x - camera.x, center.z - camera.z);
      const cameraOccluderDistance = Math.min(
        TREE_LEAF_WIND_CAMERA_OCCLUDER_HIDE_DISTANCE,
        Math.max(7, radius * 0.42),
      );
      const cameraInsideOccluder = cameraDistance <= cameraOccluderDistance && playerDistance > cameraDistance + 2;
      const visible =
        !cameraInsideOccluder &&
        (playerDistance <= radius + cullDistance || cameraDistance <= radius + cullDistance * 0.86);
      mesh.userData.treeLeafWindCullVisible = visible;
      mesh.visible = visible;
    });
  }

  private updateCameraOccluderFade(frame: FrameState, viewCamera: Camera, dt: number, mapLookdown: boolean) {
    if (mapLookdown || this.cameraOccluderMeshes.length === 0) {
      this.cameraOcclusionActiveMeshes.clear();
    } else {
      this.cameraOcclusionFrame += 1;
      if (this.cameraOcclusionFrame % CAMERA_OCCLUDER_UPDATE_INTERVAL === 0) {
        this.refreshCameraOccluders(frame, viewCamera);
      }
    }

    this.cameraOcclusionActiveMeshes.forEach((mesh) => this.fadedCameraOccluders.add(mesh));
    this.fadedCameraOccluders.forEach((mesh) => {
      const active = this.cameraOcclusionActiveMeshes.has(mesh);
      const stillFaded = this.setCameraOccluderOpacity(mesh, active ? CAMERA_OCCLUDER_FADE_OPACITY : 1, dt);
      if (!active && !stillFaded) {
        this.fadedCameraOccluders.delete(mesh);
      }
    });
  }

  private refreshCameraOccluders(frame: FrameState, viewCamera: Camera) {
    this.cameraOcclusionActiveMeshes.clear();
    this.cameraOcclusionTarget.copy(frame.player.position);
    this.cameraOcclusionTarget.y += frame.player.swimming ? 1.7 : 2.2;

    const cameraPosition = viewCamera.position;
    const distanceToMossu = cameraPosition.distanceTo(this.cameraOcclusionTarget);
    if (distanceToMossu < 5) {
      return;
    }

    this.cameraOcclusionDirection.copy(this.cameraOcclusionTarget).sub(cameraPosition);
    const rayLength = this.cameraOcclusionDirection.length();
    if (rayLength <= 0.001) {
      return;
    }
    this.cameraOcclusionDirection.multiplyScalar(1 / rayLength);

    const segmentX = this.cameraOcclusionTarget.x - cameraPosition.x;
    const segmentZ = this.cameraOcclusionTarget.z - cameraPosition.z;
    const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
    if (segmentLengthSq <= 0.001) {
      return;
    }

    this.cameraOcclusionCandidates.length = 0;
    for (const mesh of this.cameraOccluderMeshes) {
      if (!mesh.visible) {
        continue;
      }

      mesh.getWorldPosition(this.cameraOcclusionMeshPosition);
      const along =
        ((this.cameraOcclusionMeshPosition.x - cameraPosition.x) * segmentX +
          (this.cameraOcclusionMeshPosition.z - cameraPosition.z) * segmentZ) /
        segmentLengthSq;
      if (along <= 0.04 || along >= 0.96) {
        continue;
      }

      const closestX = cameraPosition.x + segmentX * along;
      const closestZ = cameraPosition.z + segmentZ * along;
      const corridorDistance = Math.hypot(
        this.cameraOcclusionMeshPosition.x - closestX,
        this.cameraOcclusionMeshPosition.z - closestZ,
      );
      if (corridorDistance > CAMERA_OCCLUDER_CORRIDOR_RADIUS) {
        continue;
      }

      this.cameraOcclusionCandidates.push(mesh);
      if (this.cameraOcclusionCandidates.length >= CAMERA_OCCLUDER_MAX_CANDIDATES) {
        break;
      }
    }

    if (this.cameraOcclusionCandidates.length === 0) {
      return;
    }

    this.cameraOcclusionRay.set(cameraPosition, this.cameraOcclusionDirection);
    this.cameraOcclusionRay.near = 0.7;
    this.cameraOcclusionRay.far = Math.max(1, distanceToMossu - 1.2);
    const hits = this.cameraOcclusionRay.intersectObjects(this.cameraOcclusionCandidates, false);
    let faded = 0;
    for (const hit of hits) {
      const mesh = hit.object as Mesh;
      if (this.cameraOcclusionActiveMeshes.has(mesh)) {
        continue;
      }
      this.cameraOcclusionActiveMeshes.add(mesh);
      faded += 1;
      if (faded >= 4) {
        break;
      }
    }
  }

  private setCameraOccluderOpacity(mesh: Mesh, targetOpacityScale: number, dt: number) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let stillFaded = false;
    const fadeDt = Math.min(dt, 1 / 20);

    for (const material of materials) {
      if (material.userData.cameraBaseOpacity === undefined) {
        material.userData.cameraBaseOpacity = material.opacity;
        material.userData.cameraBaseTransparent = material.transparent;
        material.userData.cameraBaseDepthWrite = material.depthWrite;
      }

      const baseOpacity =
        typeof material.userData.cameraBaseOpacity === "number"
          ? material.userData.cameraBaseOpacity
          : material.opacity;
      const baseTransparent =
        typeof material.userData.cameraBaseTransparent === "boolean" ? material.userData.cameraBaseTransparent : false;
      const baseDepthWrite =
        typeof material.userData.cameraBaseDepthWrite === "boolean" ? material.userData.cameraBaseDepthWrite : true;
      const targetOpacity = baseOpacity * targetOpacityScale;
      const nextOpacity = MathUtils.damp(material.opacity, targetOpacity, targetOpacityScale < 0.98 ? 16 : 9, fadeDt);

      if (nextOpacity < baseOpacity - 0.008) {
        material.opacity = nextOpacity;
        if (!material.transparent || material.depthWrite) {
          material.transparent = true;
          material.depthWrite = false;
          material.needsUpdate = true;
        }
        stillFaded = true;
      } else {
        material.opacity = baseOpacity;
        if (material.transparent !== baseTransparent || material.depthWrite !== baseDepthWrite) {
          material.transparent = baseTransparent;
          material.depthWrite = baseDepthWrite;
          material.needsUpdate = true;
        }
      }
    }

    return stillFaded;
  }

  private updateWind(frame: FrameState, elapsed: number, dt: number) {
    const planarSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
    if (frame.player.justLanded && !frame.player.fallingToVoid) {
      this.heroGrassPulse = Math.max(
        this.heroGrassPulse,
        MathUtils.clamp(0.34 + frame.player.landingImpact * 0.25, 0.34, 0.72),
      );
    }
    const landingPulse = this.heroGrassPulse;
    const rollingWake =
      frame.player.rolling && frame.player.grounded ? MathUtils.clamp(planarSpeed / 22, 0.18, 0.5) : 0;
    const karuWatchWake = this.faunaStats.firstEncounterActive ? 0.22 : 0;
    let coopWake = 0;
    let coopLandingWake = 0;
    this.remoteMossus.forEach((remote) => {
      const remotePlayer = remote.state.player;
      const remoteSpeed = Math.hypot(remotePlayer.velocity.x, remotePlayer.velocity.z);
      const distanceToMossu = this.remoteMossuScratch
        .copy(remotePlayer.position)
        .sub(frame.player.position)
        .setY(0)
        .length();
      const proximity = 1 - MathUtils.smoothstep(distanceToMossu, 6, 24);
      coopWake += proximity * MathUtils.clamp(remoteSpeed / 32, 0.04, 0.18);
      if (remotePlayer.justLanded) {
        coopLandingWake = Math.max(coopLandingWake, proximity * 0.18);
      }
    });
    const basePush =
      frame.player.fallingToVoid || !frame.player.grounded
        ? 0
        : frame.player.rolling
          ? MathUtils.clamp(planarSpeed / 24, 0.22, 1)
          : MathUtils.clamp(planarSpeed / 14, 0, 0.48);
    const playerPush = MathUtils.clamp(
      basePush + landingPulse + rollingWake + karuWatchWake + coopWake + coopLandingWake,
      0,
      1.35,
    );
    if (!this.suppressHighlandVistaGrass) {
      this.windMeshes.forEach((mesh) => {
        const shader = mesh.userData.shader;
        if (shader) {
          shader.uniforms.uTime.value = elapsed;
          (shader.uniforms.uPlayerPosition.value as Vector3).copy(frame.player.position);
          (shader.uniforms.uPlayerVelocity.value as Vector3).set(frame.player.velocity.x, 0, frame.player.velocity.z);
          shader.uniforms.uPlayerPush.value = playerPush;
          if (this.remoteMossus.size > 0) {
            shader.uniforms.uPlayerPushRadius.value = Math.max(shader.uniforms.uPlayerPushRadius.value as number, 13.8);
          }
        }
      });
    }
    this.heroGrassPulse = MathUtils.damp(this.heroGrassPulse, 0, 3.2, dt);
    this.treeWindMeshes.forEach((mesh) => {
      const shader = mesh.userData.windShader;
      if (shader) {
        shader.uniforms.uTime.value = elapsed;
      }
    });
    this.treeLeafWindUpdateCarry += dt;
    if (this.treeLeafWindUpdateCarry >= TREE_LEAF_WIND_UPDATE_INTERVAL) {
      this.treeLeafWindUpdateCarry %= TREE_LEAF_WIND_UPDATE_INTERVAL;
      this.treeLeafWindMeshes.forEach((mesh) => {
        const material = mesh.material;
        if (Array.isArray(material)) {
          return;
        }

        const shader = material.userData.windShader;
        if (shader?.uniforms.uTime) {
          shader.uniforms.uTime.value = elapsed;
        }
      });
    }
  }

  private updateSceneMood(frame: FrameState, dt: number, viewCamera: Camera, elapsed: number) {
    const playerHeight = sampleTerrainHeight(frame.player.position.x, frame.player.position.z);
    const planarSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
    if (frame.player.justLanded && !frame.player.fallingToVoid) {
      this.environmentPulse = Math.max(
        this.environmentPulse,
        MathUtils.clamp(0.18 + frame.player.landingImpact * 0.1, 0.18, 0.36),
      );
    }
    if (this.faunaStats.firstEncounterActive) {
      this.environmentPulse = Math.max(this.environmentPulse, 0.24);
    }
    this.remoteMossus.forEach((remote) => {
      if (remote.state.eventPulse > 0.05 || remote.state.player.justLanded) {
        this.environmentPulse = Math.max(this.environmentPulse, 0.12 + remote.state.eventPulse * 0.08);
      }
    });
    const playerX = frame.player.position.x;
    const playerZ = frame.player.position.z;
    const decisionClarityWindow = Math.max(
      Math.exp(-(((playerX - 24) / 46) ** 2) - ((playerZ - 88) / 36) ** 2),
      Math.exp(-(((playerX - 20) / 44) ** 2) - ((playerZ - 108) / 34) ** 2),
      Math.exp(-(((playerX - 42) / 46) ** 2) - ((playerZ - 134) / 34) ** 2),
      Math.exp(-(((playerX - 16) / 42) ** 2) - ((playerZ - 186) / 32) ** 2),
      Math.exp(-(((playerX - 18) / 44) ** 2) - ((playerZ - 214) / 34) ** 2),
    );
    const heightMood = MathUtils.smoothstep(playerHeight, 34, 128);
    const routeMood = MathUtils.smoothstep(playerZ, 64, 202);
    const targetMood = MathUtils.clamp(heightMood * 0.72 + routeMood * 0.4 - decisionClarityWindow * 0.055, 0, 1);
    const blend = 1 - Math.exp(-dt * 1.8);
    this.elevationMood = MathUtils.lerp(this.elevationMood, targetMood, blend);
    const movementWake =
      (frame.player.rolling ? 0.055 : 0.026) *
      MathUtils.clamp(planarSpeed / 30, 0, 1) *
      (frame.player.fallingToVoid ? 0 : 1);
    const cinematicLift =
      MathUtils.clamp(this.environmentPulse + movementWake, 0, 0.42) * (1 - decisionClarityWindow * 0.18);
    const breath = Math.sin(elapsed * 0.34 + this.elevationMood * 1.8) * 0.5 + 0.5;

    updateSunOrbitRig(this.sun, elapsed, this.elevationMood);
    writeWorldLightingMood(this.worldLightingMood, {
      playerX,
      playerZ,
      playerHeight,
      elevationMood: this.elevationMood,
      routeMood,
      decisionClarity: decisionClarityWindow,
      orbitHeight:
        typeof this.sun.userData.orbitHeight === "number" ? MathUtils.clamp(this.sun.userData.orbitHeight, 0, 1) : 0.8,
      lowAngleWarmth:
        typeof this.sun.userData.lowAngleWarmth === "number"
          ? MathUtils.clamp(this.sun.userData.lowAngleWarmth, 0, 1)
          : 0,
      nordicFilm: this.nordicFilmStrength,
    });
    applySceneLightingColors(
      {
        sun: this.sun,
        hemi: this.skyFill,
        fog: this.gameplayFog,
        background: this.scene.background instanceof Color ? this.scene.background : null,
      },
      this.sceneColorPairs,
      this.elevationMood,
      this.worldLightingMood,
    );
    applySceneLightingMood(
      {
        sun: this.sun,
        ambient: this.ambientLight,
        hemi: this.skyFill,
        bounce: this.skyBounce,
        meadowGlow: this.meadowGlow,
        alpineGlow: this.alpineGlow,
        fog: this.gameplayFog,
      },
      this.elevationMood,
      cinematicLift,
      breath,
      this.worldLightingMood,
    );
    this.gameplayFog.density = Math.max(
      0.00028,
      (this.gameplayFog.density - decisionClarityWindow * 0.000075) * this.fogDensityScale,
    );
    this.environmentPulse = MathUtils.damp(this.environmentPulse, 0, 2.35, dt);
    syncAtmosphereLighting(
      this.skyDome,
      this.clouds,
      this.sun,
      this.elevationMood,
      viewCamera,
      elapsed,
      this.worldLightingMood,
    );
    syncStylizedSkySun(this.skySun, this.sun, this.elevationMood, elapsed, this.worldLightingMood);

    getAtmosphereHorizonTints(
      this.elevationMood,
      this.scenePatchHorizon,
      this.scenePatchHaze,
      this.scenePatchBright,
      this.scenePatchShadow,
      this.worldLightingMood,
    );
    getSunDirectionWorld(this.sun, this.scenePatchSunDir);
    this.updateCloudShadowPockets(elapsed);
    const applyPatch = (shader: GrassShader | undefined) => {
      if (!shader) {
        return;
      }
      writePatchSceneLightingUniforms(
        shader,
        this.sun,
        this.ambientLight,
        this.skyFill,
        this.scenePatchHorizon,
        this.scenePatchSunDir,
        this.elevationMood,
        this.worldLightingMood,
      );
    };
    this.windMeshes.forEach((mesh) => {
      applyPatch(mesh.userData.shader);
    });
    this.treeWindMeshes.forEach((mesh) => {
      applyPatch(mesh.userData.windShader);
    });
    this.waterSystem.getControllers().forEach((controller) => {
      const mat = controller.mesh.material as MeshStandardMaterial & {
        userData?: { waterShader?: GrassShader };
      };
      applyPatch(mat.userData?.waterShader);
    });
  }

  private updateCloudShadowPockets(elapsed: number) {
    const shadowStrength = this.worldLightingMood.cloudShadow * (1 - this.worldLightingMood.decisionClarity * 0.28);
    const sunYaw = Math.atan2(this.scenePatchSunDir.x, this.scenePatchSunDir.z);
    const driftX = -this.scenePatchSunDir.x;
    const driftZ = -this.scenePatchSunDir.z;
    this.shadowVolumes.children.forEach((child, index) => {
      const patch = child as Mesh;
      const material = patch.material;
      if (!(material instanceof MeshBasicMaterial)) {
        return;
      }
      const baseX = (patch.userData.baseX as number | undefined) ?? patch.position.x;
      const baseZ = (patch.userData.baseZ as number | undefined) ?? patch.position.z;
      const baseOpacity = (patch.userData.baseOpacity as number | undefined) ?? 0.04;
      const baseRotation = (patch.userData.baseRotation as number | undefined) ?? 0;
      const drift = (patch.userData.drift as number | undefined) ?? 30;
      const speed = (patch.userData.speed as number | undefined) ?? 0.02;
      const phase = Math.sin(elapsed * speed + index * 1.7) * drift;
      patch.position.x = baseX + driftX * phase;
      patch.position.z = baseZ + driftZ * phase;
      patch.position.y = sampleTerrainHeight(patch.position.x, patch.position.z) + 0.09;
      patch.rotation.z = baseRotation + sunYaw * 0.18 + Math.sin(elapsed * 0.01 + index) * 0.025;
      const readableShadowStrength = Math.max(0.18, shadowStrength);
      material.opacity = baseOpacity * MathUtils.lerp(0.34, 1.04, readableShadowStrength);
      patch.visible = true;
    });
  }

  private updateWaterInteractions(frame: FrameState, elapsed: number, mapLookdown: boolean) {
    this.waterSystem.beginFrame(elapsed);

    if (mapLookdown) {
      return;
    }

    const playerSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
    const playerWaterStrength = frame.player.swimming
      ? 1.18
      : frame.player.rolling
        ? 1.16
        : frame.player.justLanded
          ? 1.05
          : 0.86;
    this.waterSystem.emitRippleForActor(
      "mossu",
      frame.player.position,
      playerSpeed,
      elapsed,
      playerWaterStrength,
      frame.player.justLanded,
    );

    this.remoteMossus.forEach((remote) => {
      const remotePlayer = remote.state.player;
      const remoteSpeed = Math.hypot(remotePlayer.velocity.x, remotePlayer.velocity.z);
      this.waterSystem.emitRippleForActor(
        `coop-${remote.state.id}`,
        remotePlayer.position,
        remoteSpeed,
        elapsed,
        remotePlayer.swimming ? 0.76 : remotePlayer.rolling ? 0.68 : 0.52,
        remotePlayer.justLanded,
      );
    });

    this.ambientBlobs.forEach((blob) => {
      if (!blob.recruited || (blob.waterReaction !== "splash" && blob.waterReaction !== "float")) {
        this.waterSystem.markActorDry(`karu-${blob.id}`);
        return;
      }

      this.waterSystem.emitRippleForActor(
        `karu-${blob.id}`,
        blob.group.position,
        blob.velocity.length(),
        elapsed,
        blob.waterReaction === "float" ? 0.48 : 0.58,
      );
    });
  }

  private updateValleyMist(elapsed: number) {
    this.valleyMist.children.forEach((patch, index) => {
      const baseX = (patch.userData.baseX as number | undefined) ?? patch.position.x;
      const baseZ = (patch.userData.baseZ as number | undefined) ?? patch.position.z;
      patch.position.x = baseX + Math.sin(elapsed * 0.06 + index * 1.7) * 2.4;
      patch.position.z = baseZ + Math.cos(elapsed * 0.04 + index * 0.9) * 1.6;

      const mesh = patch as Mesh;
      const material = mesh.material as MeshBasicMaterial;
      material.opacity =
        ((patch.userData.baseOpacity as number | undefined) ?? 0.12) * (0.82 + Math.sin(elapsed * 0.18 + index) * 0.18);
    });
  }

  private updateAmbientMotes(frame: FrameState, elapsed: number, dt: number, camera: Camera) {
    const px = frame.player.position.x;
    const pz = frame.player.position.z;
    const ph = sampleTerrainHeight(px, pz);
    const biome = sampleBiomeZone(px, pz, ph);
    const wind = sampleWindField(px, pz, ph);
    this._moteWindScratch.set(wind.direction.x * wind.strength, 0, wind.direction.y * wind.strength);
    this.ambientMotes.update(
      elapsed,
      dt,
      frame.player.position,
      camera,
      biome,
      this._moteWindScratch,
      frame.player.velocity,
    );
  }

  private updateWater(elapsed: number, mapLookdown: boolean) {
    this.waterSystem.setDepthDebugEnabled(this.waterDepthDebug);
    this.waterSystem.update(elapsed, mapLookdown);
  }

  private updateClouds(elapsed: number) {
    this.clouds.children.forEach((cloud: Object3D, index: number) => {
      const baseX = (cloud.userData.baseX as number | undefined) ?? cloud.position.x;
      const baseY = (cloud.userData.baseY as number | undefined) ?? cloud.position.y;
      const baseZ = (cloud.userData.baseZ as number | undefined) ?? cloud.position.z;
      const driftSpeed = (cloud.userData.driftSpeed as number | undefined) ?? 0.018;
      const driftRangeX = (cloud.userData.driftRangeX as number | undefined) ?? 10;
      const driftRangeZ = (cloud.userData.driftRangeZ as number | undefined) ?? 4;
      const bobRange = (cloud.userData.bobRange as number | undefined) ?? 1.2;
      cloud.position.x = baseX + Math.sin(elapsed * driftSpeed + index * 1.31) * driftRangeX;
      cloud.position.y = baseY + Math.sin(elapsed * driftSpeed * 0.72 + index * 0.9) * bobRange;
      cloud.position.z = baseZ + Math.cos(elapsed * driftSpeed * 0.84 + index * 1.07) * driftRangeZ;
      cloud.rotation.y += Math.sin(elapsed * 0.014 + index) * 0.00025;
    });

    this.mountainAtmosphere.children.forEach((cluster: Object3D, index: number) => {
      const baseX = (cluster.userData.baseX as number | undefined) ?? cluster.position.x;
      const baseZ = (cluster.userData.baseZ as number | undefined) ?? cluster.position.z;
      cluster.position.x = baseX + Math.sin(elapsed * 0.09 + index * 1.7) * 1.8;
      cluster.position.z = baseZ + Math.cos(elapsed * 0.07 + index * 0.8) * 2.2;
      cluster.children.forEach((puff: Object3D, puffIndex: number) => {
        const baseY = (puff.userData.baseY as number | undefined) ?? puff.position.y;
        puff.position.y = baseY + Math.sin(elapsed * 0.28 + puffIndex * 0.9 + index) * 0.7;
      });
    });
  }

  private updateLandingSplash(frame: FrameState, dt: number) {
    if (frame.player.justLanded) {
      this.emitLandingSplash(frame.player.position, frame.player.landingImpact);
    }

    this.landingParticles.forEach((particle) => {
      if (particle.age >= particle.life) {
        particle.mesh.visible = false;
        return;
      }

      particle.age += dt;
      const lifeT = Math.min(1, particle.age / particle.life);
      const easeOut = Math.sin(lifeT * Math.PI);
      const spread = easeOut * particle.bend;
      this.landingPosition
        .copy(particle.origin)
        .addScaledVector(particle.direction, spread)
        .addScaledVector(particle.normal, 0.05 + easeOut * 0.18);
      particle.mesh.position.copy(this.landingPosition);

      this.landingQuat.setFromUnitVectors(this.landingUp, particle.normal);
      particle.mesh.quaternion.copy(this.landingQuat);
      particle.mesh.rotateOnAxis(this.landingUp, particle.twist);
      particle.mesh.rotateX(-0.28 - (1 - lifeT) * 0.42);
      particle.mesh.rotateZ((Math.sin(lifeT * Math.PI * 1.2) * 0.16 + 0.06) * (particle.twist > 0 ? 1 : -1));

      const width = particle.width * (0.36 + easeOut * 0.64);
      const height = particle.height * (0.16 + easeOut * 0.72) * (1 - lifeT * 0.42);
      particle.mesh.scale.set(width, height, 1);
      particle.mesh.visible = true;
      const material = particle.mesh.material as MeshLambertMaterial;
      material.opacity = Math.max(0, (1 - lifeT) * 0.48);
      if (lifeT >= 1) {
        particle.mesh.visible = false;
      }
    });
  }

  private emitLandingSplash(origin: Vector3, impact: number) {
    this.landingParticles.forEach((particle, index) => {
      const angle = (index / this.landingParticles.length) * Math.PI * 2 + Math.random() * 0.28;
      const radius = 0.45 + Math.random() * 1.4 * Math.max(0.7, impact);
      const x = origin.x + Math.cos(angle) * radius;
      const z = origin.z + Math.sin(angle) * radius;
      const y = sampleTerrainHeight(x, z) + 0.04;
      this.landingNormal.copy(sampleTerrainNormal(x, z));

      particle.origin.set(x, y, z);
      particle.normal.copy(this.landingNormal);
      particle.direction.set(Math.cos(angle), 0, Math.sin(angle)).projectOnPlane(this.landingNormal).normalize();

      if (particle.direction.lengthSq() < 0.001) {
        particle.direction.set(Math.cos(angle), 0, Math.sin(angle)).normalize();
      }

      particle.age = 0;
      particle.life = 0.26 + Math.random() * 0.14;
      particle.height = (0.54 + Math.random() * 0.74) * (0.78 + impact * 0.18);
      particle.width = 0.42 + Math.random() * 0.22;
      particle.bend = (0.32 + Math.random() * 0.58) * impact;
      particle.twist = (Math.random() - 0.5) * 1.4;
      particle.mesh.position.copy(particle.origin);
      particle.mesh.scale.set(0.2, 0.12, 1);
      particle.mesh.visible = true;
      const material = particle.mesh.material as MeshLambertMaterial;
      material.opacity = 0.48;
    });
  }

  private updateSnowTrail(frame: FrameState, dt: number) {
    const player = frame.player;
    const planarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const shouldEmit = player.rolling && player.grounded && planarSpeed > 3.4;

    if (shouldEmit) {
      this.trailEmissionCarry += dt * MathUtils.clamp(planarSpeed * 0.45, 2.2, 9);
      while (this.trailEmissionCarry >= 1) {
        this.emitSnowTrailPuff(player.position, player.velocity);
        this.trailEmissionCarry -= 1;
      }
    } else {
      this.trailEmissionCarry = 0;
    }

    this.snowTrailParticles.forEach((particle) => {
      if (particle.age >= particle.life) {
        particle.mesh.visible = false;
        return;
      }

      particle.age += dt;
      const lifeT = Math.min(1, particle.age / particle.life);
      particle.origin.addScaledVector(particle.velocity, dt);
      particle.velocity.y += dt * 1.4;
      particle.mesh.position.copy(particle.origin);
      const size = MathUtils.lerp(0.16, 0.34 + particle.drift * 0.08, lifeT);
      particle.mesh.scale.setScalar(size);
      particle.mesh.visible = true;
      const material = particle.mesh.material as MeshLambertMaterial;
      material.opacity = Math.max(0, (1 - lifeT) * 0.55);
      if (lifeT >= 1) {
        particle.mesh.visible = false;
      }
    });
  }

  private emitSnowTrailPuff(origin: Vector3, velocity: Vector3) {
    const particle = this.snowTrailParticles.find((entry) => entry.age >= entry.life) ?? this.snowTrailParticles[0];
    this.trailVelocity.set(velocity.x, 0, velocity.z);
    if (this.trailVelocity.lengthSq() > 0.001) {
      this.trailDirection.copy(this.trailVelocity).normalize();
    } else {
      this.trailDirection.set(0, 0, -1);
    }

    const side = Math.random() > 0.5 ? 1 : -1;
    const sideX = -this.trailDirection.z * 0.35 * side;
    const sideZ = this.trailDirection.x * 0.35 * side;
    const x = origin.x - this.trailDirection.x * 1.05 + sideX;
    const z = origin.z - this.trailDirection.z * 1.05 + sideZ;
    const y = sampleTerrainHeight(x, z) + 0.22;

    particle.origin.set(x, y, z);
    particle.velocity.set(
      -this.trailDirection.x * (0.8 + Math.random() * 0.55) + sideX * 0.12,
      0.5 + Math.random() * 0.45,
      -this.trailDirection.z * (0.8 + Math.random() * 0.55) + sideZ * 0.12,
    );
    particle.age = 0;
    particle.life = 0.24 + Math.random() * 0.16;
    particle.drift = 0.7 + Math.random() * 0.8;
    particle.mesh.position.copy(particle.origin);
    particle.mesh.scale.setScalar(0.12);
    particle.mesh.visible = true;
    const material = particle.mesh.material as MeshLambertMaterial;
    material.opacity = 0.55;
  }

  private updateMossuTrace(frame: FrameState, dt: number, mapLookdown: boolean) {
    const player = frame.player;
    const planarSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const traceContext = sampleMossuTraceWearContext(player.position.x, player.position.z);
    const canEmit =
      !mapLookdown &&
      player.grounded &&
      !player.swimming &&
      !player.fallingToVoid &&
      planarSpeed > 2.2 &&
      (traceContext.readable > 0.06 || (player.rolling && planarSpeed > 8.5));

    if (canEmit) {
      const rate = player.rolling
        ? MathUtils.clamp(planarSpeed * 0.34, 2.8, 6.4)
        : MathUtils.clamp(planarSpeed * 0.23, 1, 2.8);
      const routeRate = MathUtils.lerp(
        0.7,
        1.45,
        MathUtils.clamp(traceContext.readable + traceContext.shoulder * 0.24, 0, 1),
      );
      this.mossuTraceEmissionCarry += dt * rate * routeRate;
      while (this.mossuTraceEmissionCarry >= 1) {
        this.emitMossuTraceStamp(player.position, player.velocity, player.rolling);
        this.mossuTraceEmissionCarry -= 1;
      }
    } else {
      this.mossuTraceEmissionCarry = 0;
    }

    let active = 0;
    let alphaChanged = false;
    this.mossuTraceStamps.forEach((stamp, index) => {
      if (stamp.age >= stamp.life) {
        if (this.mossuTrace.alpha[index] !== 0) {
          this.mossuTrace.alpha[index] = 0;
          alphaChanged = true;
        }
        return;
      }

      stamp.age += dt;
      if (stamp.age >= stamp.life) {
        this.mossuTrace.alpha[index] = 0;
        alphaChanged = true;
        return;
      }

      active += 1;
      const lifeT = stamp.age / stamp.life;
      const fadeIn = MathUtils.smoothstep(lifeT, 0, 0.14);
      const fadeOut = 1 - MathUtils.smoothstep(lifeT, 0.52, 1);
      const alpha = stamp.maxAlpha * fadeIn * fadeOut;
      if (Math.abs(this.mossuTrace.alpha[index] - alpha) > 0.001) {
        this.mossuTrace.alpha[index] = alpha;
        alphaChanged = true;
      }
    });

    if (alphaChanged) {
      this.mossuTrace.mesh.geometry.getAttribute("instanceTraceAlpha").needsUpdate = true;
    }
    this.mossuTraceActiveStamps = active;
    this.mossuTrace.mesh.visible = !mapLookdown && active > 0;
  }

  private emitMossuTraceStamp(origin: Vector3, velocity: Vector3, rolling: boolean) {
    this.mossuTraceVelocity.set(velocity.x, 0, velocity.z);
    if (this.mossuTraceVelocity.lengthSq() <= 0.01) {
      return;
    }
    this.mossuTraceDirection.copy(this.mossuTraceVelocity).normalize();

    const side = (Math.random() - 0.5) * (rolling ? 0.95 : 0.58);
    const back = rolling ? 1.3 : 0.82;
    const x = origin.x - this.mossuTraceDirection.x * back - this.mossuTraceDirection.z * side;
    const z = origin.z - this.mossuTraceDirection.z * back + this.mossuTraceDirection.x * side;
    const water = sampleWaterState(x, z);
    if (water && water.depth > 0.08) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const normal = sampleTerrainNormal(x, z);
    if (normal.y < 0.62) {
      return;
    }

    const zone = sampleBiomeZone(x, z, y);
    if (zone === "peak_shrine") {
      return;
    }

    const traceContext = sampleMossuTraceWearContext(x, z);
    if (traceContext.readable < 0.05 && (!rolling || Math.random() > 0.62)) {
      return;
    }
    const index = this.mossuTraceCursor;
    this.mossuTraceCursor = (this.mossuTraceCursor + 1) % this.mossuTraceStamps.length;
    const stamp = this.mossuTraceStamps[index];
    stamp.age = 0;
    const routeLife = MathUtils.lerp(
      0.82,
      1.32,
      MathUtils.clamp(traceContext.readable + traceContext.shoulder * 0.18, 0, 1),
    );
    stamp.life = MathUtils.lerp(6.8, 13.4, Math.random()) * (rolling ? 1.18 : 1) * routeLife;
    stamp.maxAlpha = MathUtils.clamp(
      (rolling ? 0.118 : 0.078) +
        traceContext.dirt * 0.052 +
        traceContext.shoulder * 0.046 +
        traceContext.painted * 0.016,
      0.048,
      0.18,
    );

    const routeEdgeLift = MathUtils.clamp(traceContext.shoulder + traceContext.painted * 0.16, 0, 1);
    const yaw =
      Math.atan2(this.mossuTraceDirection.x, this.mossuTraceDirection.z) +
      (Math.random() - 0.5) * MathUtils.lerp(0.24, 0.14, routeEdgeLift);
    const length =
      (rolling ? MathUtils.lerp(2.8, 4.0, Math.random()) : MathUtils.lerp(1.75, 2.84, Math.random())) *
      MathUtils.lerp(0.82, 1.18, routeEdgeLift);
    const width =
      (rolling ? MathUtils.lerp(0.92, 1.3, Math.random()) : MathUtils.lerp(0.62, 0.94, Math.random())) *
      MathUtils.lerp(0.86, 1.12, traceContext.dirt);
    this.mossuTraceDummy.position.set(x, y + 0.055, z);
    this.mossuTraceDummy.rotation.set(0, yaw, 0);
    this.mossuTraceDummy.scale.set(width, 1, length);
    this.mossuTraceDummy.updateMatrix();
    this.mossuTrace.mesh.setMatrixAt(index, this.mossuTraceDummy.matrix);
    this.mossuTrace.mesh.instanceMatrix.needsUpdate = true;
    this.mossuTrace.alpha[index] = Math.max(this.mossuTrace.alpha[index], stamp.maxAlpha * 0.18);
    this.mossuTrace.mesh.geometry.getAttribute("instanceTraceAlpha").needsUpdate = true;
  }

  private updateMapMarkers(frame: FrameState, elapsed: number, mapLookdown: boolean) {
    this.mapMarkerGroup.visible = mapLookdown;
    if (!mapLookdown) {
      return;
    }

    const player = frame.player.position;
    const playerGround = sampleTerrainHeight(player.x, player.z);
    this.playerMapMarker.group.position.set(player.x, playerGround + 0.2, player.z);
    this.shrineMapMarker.group.position.set(18, sampleTerrainHeight(18, 214) + 0.2, 214);

    [this.playerMapMarker, this.shrineMapMarker, ...this.landmarkMapMarkers, ...this.atlasMapMarkers].forEach(
      (marker, index) => {
        const pulse = 1 + Math.sin(elapsed * marker.pulseSpeed + index * 0.9) * 0.08;
        const highlightBoost = marker === this.playerMapMarker ? 1.95 : marker === this.shrineMapMarker ? 1.6 : 1.28;
        marker.group.scale.setScalar(marker.baseScale * pulse * highlightBoost);
      },
    );
  }
}
