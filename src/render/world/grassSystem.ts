import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from "three";
import {
  BiomeZone,
  sampleBiomeZone,
  sampleGrassDensity,
  sampleHabitatLayer,
  sampleRiverNookMask,
  sampleRiverWetness,
  sampleTerrainHeight,
  sampleTerrainNormal,
} from "../../simulation/world";

const WORLD_SIZE = 560;

export interface GrassShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

export interface GrassOptions {
  crossPlanes?: number;
  bladeWidth?: number;
  bladeHeight?: number;
  placementMultiplier?: number;
  scaleMultiplier?: number;
  widthMultiplier?: number;
  fadeInStart?: number;
  fadeInEnd?: number;
  fadeOutStart?: number;
  fadeOutEnd?: number;
  rootFillBoost?: number;
  selfShadowStrength?: number;
  distanceCompressionBoost?: number;
  playerPushRadius?: number;
  playerPushStrength?: number;
  windExaggeration?: number;
  windTimeScale?: number;
  broadWindScale?: number;
  fineWindScale?: number;
  lod?: GrassLodOptions;
}

export interface GrassLodOptions {
  label: string;
  innerRadius: number;
  outerRadius: number;
  sampleStride?: number;
  updateEveryFrames?: number;
  movementThreshold?: number;
}

interface GrassLodSource {
  options: Required<GrassLodOptions>;
  sourceCount: number;
  matrices: Float32Array;
  phases: Float32Array;
  tints: Float32Array;
  scales: Float32Array;
  widths: Float32Array;
  roots: Float32Array;
  lastFrame: number;
  lastOriginX: number;
  lastOriginZ: number;
  activeCount: number;
}

export function mergeBufferGeometries(geometries: BufferGeometry[]) {
  const merged = new BufferGeometry();
  const attributeNames = ["position", "normal", "uv"] as const;

  attributeNames.forEach((name) => {
    const firstAttribute = geometries[0]?.getAttribute(name) as BufferAttribute | undefined;
    if (!firstAttribute) {
      return;
    }

    const mergedArray = new Float32Array(
      geometries.reduce((sum, geometry) => sum + (geometry.getAttribute(name) as BufferAttribute).array.length, 0),
    );
    let offset = 0;
    geometries.forEach((geometry) => {
      const attribute = geometry.getAttribute(name) as BufferAttribute;
      mergedArray.set(attribute.array as Float32Array, offset);
      offset += attribute.array.length;
    });
    merged.setAttribute(name, new BufferAttribute(mergedArray, firstAttribute.itemSize));
  });

  return merged;
}

export function sampleOpeningMeadowMask(x: number, z: number) {
  const startCore = Math.exp(-(((x + 58) / 34) ** 2) - (((z + 148) / 22) ** 2));
  const startLane = Math.exp(-(((x + 18) / 96) ** 2) - (((z + 82) / 82) ** 2));
  const amberRise = Math.exp(-(((x + 6) / 42) ** 2) - (((z + 28) / 30) ** 2));
  return MathUtils.clamp(startCore * 0.92 + startLane * 0.46 + amberRise * 0.54, 0, 1);
}

function makeGrassBladeGeometry(width: number, height: number, crossPlanes = 1) {
  const geometry = new PlaneGeometry(width, height, 2, 4);
  geometry.translate(0, height * 0.5, 0);

  const positions = geometry.attributes.position as BufferAttribute;
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i);
    const x = positions.getX(i);
    const yNorm = MathUtils.clamp(y / height, 0, 1);
    const center = 1 - Math.abs(x / (width * 0.5));
    const tuftWidth = MathUtils.lerp(0.12, 0.96, (1 - yNorm) ** 0.28);
    const topPinch = MathUtils.lerp(1, 0.1, yNorm ** 1.84);
    const shoulderLift = Math.sin(yNorm * Math.PI) * 0.038;
    const forwardSweep = Math.sin(yNorm * Math.PI * 0.76) * 0.08 + yNorm * yNorm * 0.42;
    const rib = Math.sin(yNorm * Math.PI) * 0.022;

    positions.setX(i, x * tuftWidth * topPinch);
    positions.setZ(i, shoulderLift * center * 0.08 + forwardSweep * (0.24 + center * 0.04) + rib * center);
  }

  if (crossPlanes <= 1) {
    return geometry;
  }

  const blades = [0, 0.62, -0.62]
    .slice(0, crossPlanes)
    .map((angle) => geometry.clone().rotateY(angle).toNonIndexed());
  geometry.dispose();
  return mergeBufferGeometries(blades);
}

export function createGrassMesh(
  count: number,
  zoneFilter: (zone: BiomeZone) => boolean,
  tintBottom: Color,
  tintTop: Color,
  options: GrassOptions = {},
) {
  const bladeGeometry = makeGrassBladeGeometry(
    options.bladeWidth ?? 0.76,
    options.bladeHeight ?? 3.35,
    options.crossPlanes ?? 1,
  );
  const material = new MeshLambertMaterial({
    color: "#98c66d",
    side: DoubleSide,
    transparent: true,
    alphaTest: 0.08,
  });

  const mesh = new InstancedMesh(bladeGeometry, material, count);
  const dummy = new Object3D();
  const phases = new Float32Array(count);
  const tints = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const widths = new Float32Array(count);
  const roots = new Float32Array(count * 3);
  const matrices = new Float32Array(count * 16);
  let placed = 0;

  while (placed < count) {
    const x = (Math.random() - 0.5) * (WORLD_SIZE - 32);
    const z = (Math.random() - 0.5) * (WORLD_SIZE - 32);
    const height = sampleTerrainHeight(x, z);
    const zone = sampleBiomeZone(x, z, height);
    if (!zoneFilter(zone)) {
      continue;
    }

    const density = sampleGrassDensity(x, z);
    const habitat = sampleHabitatLayer(x, z, height);
    const openingMask = sampleOpeningMeadowMask(x, z);
    const riverNookMask = sampleRiverNookMask(x, z);
    const riverWetness = sampleRiverWetness(x, z);
    const fieldCluster = Math.sin(x * 0.016 + z * 0.009 - 0.8) * 0.5 + 0.5;
    const placementBias =
      zone === "plains" || zone === "hills"
        ? 0.58 + openingMask * 0.74 + habitat.meadow * 0.28 + riverNookMask * 0.28 + fieldCluster * 0.14
        : zone === "foothills"
          ? 0.78 + openingMask * 0.1 + habitat.edge * 0.1 + riverNookMask * 0.18
          : 0.94 + habitat.edge * 0.08;
    const habitatPlacementFade = MathUtils.clamp(1 + habitat.meadow * 0.22 - habitat.forest * 0.16 - habitat.shore * 0.38, 0.42, 1.24);
    if (Math.random() > MathUtils.clamp(density * placementBias * habitatPlacementFade * (options.placementMultiplier ?? 1), 0, 1)) {
      continue;
    }

    const normal = sampleTerrainNormal(x, z);
    if (normal.y < 0.62) {
      continue;
    }

    dummy.position.set(x, height + 0.1, z);
    const isMeadow = zone === "plains" || zone === "hills";
    const meadowYaw = 0.34 + fieldCluster * 0.34;
    dummy.rotation.set(
      isMeadow ? (Math.random() - 0.5) * 0.08 : (Math.random() - 0.5) * 0.18,
      isMeadow ? meadowYaw + (Math.random() - 0.5) * 0.34 : Math.random() * Math.PI,
      isMeadow ? (Math.random() - 0.5) * 0.06 : (Math.random() - 0.5) * 0.14,
    );
    const scale = 0.66 + Math.random() * (zone === "alpine" || zone === "ridge" ? 0.26 : 0.72);
    const width = zone === "alpine" || zone === "ridge"
      ? 0.64 + Math.random() * 0.22
      : 0.72 + Math.random() * 0.24;
    const heroBoost = isMeadow ? Math.max(openingMask, habitat.meadow * 0.72) : 0;
    const riverNookBoost = MathUtils.clamp(riverNookMask * (1 - riverWetness), 0, 1);
    const adjustedScale =
      scale
      * (zone === "alpine" || zone === "ridge" ? 1.04 : 1.04 + heroBoost * 0.28 + riverNookBoost * 0.18)
      * (options.scaleMultiplier ?? 1);
    const adjustedWidth =
      width
      * (zone === "alpine" || zone === "ridge" ? 0.96 : 0.9 + heroBoost * 0.08 + riverNookBoost * 0.06)
      * (options.widthMultiplier ?? 1);
    dummy.scale.set(adjustedWidth, adjustedScale, adjustedWidth);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    dummy.matrix.toArray(matrices, placed * 16);

    const sunPatch = Math.sin(x * 0.022 + z * 0.017) * 0.5 + 0.5;
    const coolPatch = Math.cos(x * 0.018 - z * 0.013) * 0.5 + 0.5;
    const patchMix = MathUtils.clamp(
      sunPatch * 0.62 +
      coolPatch * 0.15 +
      fieldCluster * 0.12 +
      heroBoost * 0.14 +
      riverNookBoost * 0.16 +
      habitat.edge * 0.08 -
      habitat.forest * 0.1,
      0,
      1,
    );
    const color = tintBottom.clone().lerp(
      tintTop,
      MathUtils.clamp(0.14 + patchMix * 0.72 + Math.random() * 0.05, 0, 1),
    );
    color
      .lerp(new Color("#b7df75"), habitat.meadow * 0.16)
      .lerp(new Color("#6f8a5c"), habitat.forest * 0.18)
      .lerp(new Color("#7f9d69"), habitat.shore * 0.18);
    tints[placed * 3] = color.r;
    tints[placed * 3 + 1] = color.g;
    tints[placed * 3 + 2] = color.b;
    phases[placed] = Math.random() * Math.PI * 2;
    scales[placed] = adjustedScale;
    widths[placed] = adjustedWidth;
    roots[placed * 3] = x;
    roots[placed * 3 + 1] = height;
    roots[placed * 3 + 2] = z;
    placed += 1;
  }

  mesh.geometry.setAttribute("instancePhase", new InstancedBufferAttribute(phases, 1));
  mesh.geometry.setAttribute("instanceTint", new InstancedBufferAttribute(tints, 3));
  mesh.geometry.setAttribute("instanceScale", new InstancedBufferAttribute(scales, 1));
  mesh.geometry.setAttribute("instanceWidth", new InstancedBufferAttribute(widths, 1));
  mesh.geometry.setAttribute("instanceRoot", new InstancedBufferAttribute(roots, 3));
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);

  if (options.lod) {
    mesh.userData.grassLod = {
      options: {
        label: options.lod.label,
        innerRadius: options.lod.innerRadius,
        outerRadius: options.lod.outerRadius,
        sampleStride: options.lod.sampleStride ?? 1,
        updateEveryFrames: options.lod.updateEveryFrames ?? 6,
        movementThreshold: options.lod.movementThreshold ?? 2.5,
      },
      sourceCount: count,
      matrices: matrices.slice(),
      phases: phases.slice(),
      tints: tints.slice(),
      scales: scales.slice(),
      widths: widths.slice(),
      roots: roots.slice(),
      lastFrame: -9999,
      lastOriginX: Number.POSITIVE_INFINITY,
      lastOriginZ: Number.POSITIVE_INFINITY,
      activeCount: count,
    } satisfies GrassLodSource;
  }

  material.onBeforeCompile = (shader: GrassShader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uPlayerPosition = { value: new Vector3() };
    shader.uniforms.uPlayerVelocity = { value: new Vector3() };
    shader.uniforms.uPlayerPush = { value: 0 };
    shader.uniforms.uFadeInStart = { value: options.fadeInStart ?? -1 };
    shader.uniforms.uFadeInEnd = { value: options.fadeInEnd ?? 0 };
    shader.uniforms.uFadeOutStart = { value: options.fadeOutStart ?? 9999 };
    shader.uniforms.uFadeOutEnd = { value: options.fadeOutEnd ?? 10000 };
    shader.uniforms.uRootFillBoost = { value: options.rootFillBoost ?? 0 };
    shader.uniforms.uSelfShadowStrength = { value: options.selfShadowStrength ?? 0.5 };
    shader.uniforms.uDistanceCompressionBoost = { value: options.distanceCompressionBoost ?? 0 };
    shader.uniforms.uPlayerPushRadius = { value: options.playerPushRadius ?? 8.8 };
    shader.uniforms.uPlayerPushStrength = { value: options.playerPushStrength ?? 1.15 };
    shader.uniforms.uWindExaggeration = { value: options.windExaggeration ?? 1 };
    shader.uniforms.uWindTimeScale = { value: options.windTimeScale ?? 1 };
    shader.uniforms.uBroadWindScale = { value: options.broadWindScale ?? 1 };
    shader.uniforms.uFineWindScale = { value: options.fineWindScale ?? 1 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float instancePhase;
        attribute float instanceScale;
        attribute float instanceWidth;
        attribute vec3 instanceTint;
        attribute vec3 instanceRoot;
        varying float vBladeMix;
        varying float vSoftEdge;
        varying float vPlayerFade;
        varying float vPatchLight;
        varying float vStrokeSeed;
        varying float vDistanceBlend;
        varying float vDistanceBand;
        varying float vHeroField;
        varying float vElevationMood;
        varying float vSceneDepthMood;
        varying float vGustSignal;
        varying vec3 vTint;
        uniform float uTime;
        uniform vec3 uPlayerPosition;
        uniform vec3 uPlayerVelocity;
        uniform float uPlayerPush;
        uniform float uFadeInStart;
        uniform float uFadeInEnd;
        uniform float uFadeOutStart;
        uniform float uFadeOutEnd;
        uniform float uRootFillBoost;
        uniform float uSelfShadowStrength;
        uniform float uDistanceCompressionBoost;
        uniform float uPlayerPushRadius;
        uniform float uPlayerPushStrength;
        uniform float uWindExaggeration;
        uniform float uWindTimeScale;
        uniform float uBroadWindScale;
        uniform float uFineWindScale;
      `,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vBladeMix = uv.y;
        float bladeSide = abs(uv.x - 0.5) * 2.0;
        vSoftEdge = bladeSide;
        vTint = instanceTint;
        vPatchLight = sin(instanceRoot.x * 0.018 - instanceRoot.z * 0.014 + 1.2) * 0.5 + 0.5;
        vStrokeSeed = fract(sin(instancePhase * 2.7 + instanceRoot.x * 0.037 + instanceRoot.z * 0.051) * 43758.5453123);
        vElevationMood = clamp(
          smoothstep(42.0, 132.0, instanceRoot.y) * 0.72 +
          smoothstep(78.0, 206.0, instanceRoot.z) * 0.38,
          0.0,
          1.0
        );
        vHeroField = clamp(
          exp(-pow((instanceRoot.x + 58.0) / 34.0, 2.0) - pow((instanceRoot.z + 148.0) / 22.0, 2.0)) * 0.92 +
          exp(-pow((instanceRoot.x + 22.0) / 86.0, 2.0) - pow((instanceRoot.z + 86.0) / 74.0, 2.0)) * 0.46 +
          exp(-pow((instanceRoot.x + 6.0) / 42.0, 2.0) - pow((instanceRoot.z + 28.0) / 30.0, 2.0)) * 0.54,
          0.0,
          1.0
        );
        vec2 playerOffset = instanceRoot.xz - uPlayerPosition.xz;
        float playerDistance = length(playerOffset);
        vec2 playerAway = playerDistance > 0.001 ? normalize(playerOffset) : vec2(0.0, 0.0);
        float playerReadMask = 1.0 - smoothstep(uPlayerPushRadius * 0.56, uPlayerPushRadius * 1.42, playerDistance);
        float playerMask = playerReadMask * uPlayerPush * uPlayerPushStrength;
        float playerSpeed = length(uPlayerVelocity.xz);
        vec2 wakeDirection = playerSpeed > 0.01 ? normalize(-uPlayerVelocity.xz) : playerAway;
        vec2 pushDirection = normalize(playerAway * 1.35 + wakeDirection * smoothstep(1.0, 17.0, playerSpeed) * 0.6 + vec2(0.001, 0.0));
        float cameraDistance = length(cameraPosition.xz - instanceRoot.xz);
        vDistanceBlend = smoothstep(20.0, 146.0, cameraDistance);
        vSceneDepthMood = clamp(max(vDistanceBlend * 0.78, vElevationMood * 0.88), 0.0, 1.0);
        float fadeIn = uFadeInEnd <= uFadeInStart ? 1.0 : smoothstep(uFadeInStart, uFadeInEnd, cameraDistance);
        float fadeOut = uFadeOutEnd <= uFadeOutStart ? 0.0 : smoothstep(uFadeOutStart, uFadeOutEnd, cameraDistance);
        vDistanceBand = clamp(fadeIn * (1.0 - fadeOut), 0.0, 1.0);
        vec2 baseWindDirection = normalize(vec2(0.92, 0.39));
        vec2 crossWindDirection = vec2(-baseWindDirection.y, baseWindDirection.x);
        float windTime = uTime * uWindTimeScale;
        float breath = 0.84 + sin(windTime * 0.18 + sin(windTime * 0.041) * 1.7) * 0.16;
        float macroWind = (
          sin(dot(instanceRoot.xz, baseWindDirection) * 0.016 - windTime * 0.34 + instancePhase * 0.08) +
          cos(dot(instanceRoot.xz, crossWindDirection) * 0.011 + windTime * 0.22)
        ) * 0.5;
        float gustLane = sin(instanceRoot.x * 0.007 + instanceRoot.z * 0.004 - windTime * 0.18) * 0.5 + 0.5;
        float gustPhaseA = dot(instanceRoot.xz, baseWindDirection) * 0.036 - windTime * 1.02 + sin(instanceRoot.z * 0.008) * 0.44;
        float gustPhaseB = dot(instanceRoot.xz, normalize(vec2(0.48, 0.88))) * 0.024 - windTime * 0.62 + 2.1;
        float gustFront = smoothstep(0.48, 0.96, sin(gustPhaseA));
        float gustShoulder = smoothstep(0.38, 0.92, sin(gustPhaseB)) * 0.54;
        float gustRebound = -smoothstep(0.62, 0.98, sin(gustPhaseA - 1.24)) * 0.24;
        float gustExposure = mix(1.0 + vHeroField * 0.2, 1.14 + vElevationMood * 0.16, vSceneDepthMood);
        float gustWind = (gustFront + gustShoulder) * (0.58 + gustLane * 0.42) * gustExposure;
        float detailFlutter = sin(instanceRoot.x * 0.12 + windTime * 4.9 + instancePhase * 2.8)
          * cos(instanceRoot.z * 0.086 - windTime * 3.7 + instancePhase);
        detailFlutter *= mix(1.0, 0.42, vSceneDepthMood);
        float windLod = clamp(vDistanceBlend * 0.68 + vElevationMood * 0.34, 0.0, 1.0);
        float broadBend = (
          macroWind * mix(0.58, 0.72, vSceneDepthMood) +
          gustWind * mix(0.34, 0.54, vElevationMood) +
          gustRebound
        ) * breath * uWindExaggeration * uBroadWindScale * mix(0.98, 1.18, vElevationMood);
        float fineMotion = detailFlutter * (1.0 - windLod) * uWindExaggeration * uFineWindScale;
        vGustSignal = clamp(gustWind * (1.0 - vDistanceBlend * 0.28), 0.0, 1.0);
        vec2 windDirection = normalize(baseWindDirection + crossWindDirection * (macroWind * 0.08 + gustWind * 0.18));
        float tuftWeight = pow(uv.y, 1.24);
        float tipWeight = pow(uv.y, 1.78);
        float sweep = (mix(0.21, 0.16, vSceneDepthMood) + vHeroField * 0.14 + broadBend * 0.18) * tuftWeight * instanceScale;
        float bend = (0.045 + broadBend * 0.05 + gustWind * mix(0.018, 0.042, vElevationMood)) * tuftWeight * instanceScale;
        float flutter = fineMotion * tipWeight * instanceScale * (0.034 + vHeroField * 0.018);
        float baseLean = (mix(0.13, 0.08, vSceneDepthMood) + vHeroField * 0.1) * tuftWeight;
        float playerDisplace = playerMask * (0.14 + tipWeight * 1.48);
        transformed.x *= mix(0.84, 0.98, instanceWidth - 0.64);
        transformed.x += windDirection.x * (sweep + baseLean) + bend * sin(instancePhase) + flutter;
        transformed.z += windDirection.y * (sweep + baseLean) + bend * cos(instancePhase) - flutter * 0.42;
        transformed.z += (0.06 - bladeSide * 0.026) * sin(instancePhase * 0.8) * tuftWeight * instanceScale;
        transformed.x += pushDirection.x * playerDisplace;
        transformed.z += pushDirection.y * playerDisplace;
        transformed.y -= playerMask * tipWeight * 0.16 * instanceScale;
        vPlayerFade = 1.0 - playerReadMask * (0.34 + uPlayerPush * 0.18);
      `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vBladeMix;
        varying float vSoftEdge;
        varying float vPlayerFade;
        varying float vPatchLight;
        varying float vStrokeSeed;
        varying float vDistanceBlend;
        varying float vDistanceBand;
        varying float vHeroField;
        varying float vElevationMood;
        varying float vSceneDepthMood;
        varying float vGustSignal;
        varying vec3 vTint;
        uniform float uRootFillBoost;
        uniform float uSelfShadowStrength;
        uniform float uDistanceCompressionBoost;
      `,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float sideMask = smoothstep(1.0, 0.26, vSoftEdge);
        float tipMask = 1.0 - smoothstep(0.78, 1.0, vBladeMix + vSoftEdge * 0.16);
        float alphaShape = sideMask * tipMask * vDistanceBand;
        alphaShape *= mix(1.08 + vHeroField * 0.08, 0.72, vSceneDepthMood);
        float nearDetail = 1.0 - smoothstep(0.18, 0.88, vDistanceBlend);
        float stroke = sin(vBladeMix * (9.0 + vStrokeSeed * 6.0) + vStrokeSeed * 10.0 + vSoftEdge * 1.5) * 0.5 + 0.5;
        float sunStripe = smoothstep(0.32, 0.98, vBladeMix) * smoothstep(1.0, 0.14, vSoftEdge) * (0.44 + stroke * 0.56) * (0.62 + vHeroField * 0.38);
        float warmTip = smoothstep(0.46, 1.0, vBladeMix) * (0.28 + vPatchLight * 0.72);
        float rootFill = smoothstep(0.42, 0.0, vBladeMix) * (0.1 + uRootFillBoost + vDistanceBlend * 0.28 + vHeroField * 0.08);
        vec3 rooted = vTint * vec3(0.36, 0.64, 0.32);
        vec3 midBlade = mix(rooted, vTint * vec3(0.78, 1.03, 0.54), pow(vBladeMix, 0.58));
        vec3 sunlit = vTint * vec3(1.0, 1.18, 0.62) + vec3(0.12, 0.18, 0.03) * vPatchLight;
        vec3 meadowColor = mix(midBlade, sunlit, sunStripe * (0.6 + nearDetail * 0.14) + warmTip * 0.18);
        float tipGlow = smoothstep(0.62, 1.0, vBladeMix) * smoothstep(1.0, 0.12, vSoftEdge) * (0.04 + vHeroField * 0.08 + vPatchLight * 0.04);
        meadowColor += vec3(0.07, 0.12, 0.025) * tipGlow;
        float gustHighlight = vGustSignal * smoothstep(0.34, 1.0, vBladeMix) * smoothstep(1.0, 0.16, vSoftEdge);
        meadowColor += vec3(0.052, 0.082, 0.018) * gustHighlight * (0.32 + nearDetail * 0.48);
        vec3 lowlandLush = mix(meadowColor, vTint * vec3(0.72, 1.08, 0.5), (1.0 - vElevationMood) * nearDetail * 0.28);
        vec3 highlandSage = mix(vTint * vec3(0.62, 0.74, 0.58), vec3(0.63, 0.72, 0.66), vElevationMood * 0.48);
        meadowColor = mix(lowlandLush, highlandSage, vSceneDepthMood * (0.42 + vElevationMood * 0.34));
        vec3 distantMass = mix(vTint * vec3(0.56, 0.8, 0.42), vec3(0.58, 0.72, 0.6), vSceneDepthMood);
        distantMass = mix(distantMass, vTint * vec3(0.78, 1.0, 0.58), (vPatchLight * 0.42 + vHeroField * 0.1) * (1.0 - vElevationMood * 0.42));
        float distanceCompression = clamp(vDistanceBlend + uDistanceCompressionBoost, 0.0, 1.0);
        meadowColor = mix(meadowColor, distantMass, distanceCompression * 0.7);
        float rootShadow = smoothstep(1.0, 0.08, vBladeMix) * (0.16 + uSelfShadowStrength * 0.22);
        float bodyShadow = (1.0 - sunStripe) * smoothstep(0.24, 0.94, vBladeMix) * (0.08 + uSelfShadowStrength * 0.18);
        float coreShadow = (1.0 - smoothstep(0.0, 0.72, vSoftEdge)) * smoothstep(0.12, 0.92, vBladeMix) * (0.04 + uSelfShadowStrength * 0.08);
        float selfShadow = clamp(rootShadow + bodyShadow + coreShadow, 0.0, 0.62);
        meadowColor *= 1.0 - selfShadow;
        meadowColor = mix(rooted * vec3(1.08, 1.04, 0.96), meadowColor, 1.0 - rootFill * 0.22);
        alphaShape = max(alphaShape, rootFill * vDistanceBand);
        alphaShape = mix(alphaShape, 0.985, vDistanceBlend * 0.48);
        vec4 diffuseColor = vec4(meadowColor, opacity * alphaShape * vPlayerFade);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 posterized = floor(diffuseColor.rgb * 11.0) / 11.0;
        diffuseColor.rgb = mix(diffuseColor.rgb, posterized, 0.08);
      `,
      );

    mesh.userData.shader = shader;
  };

  return mesh;
}

export function updateGrassMeshLod(mesh: InstancedMesh, origin: Vector3, frameIndex: number) {
  const lod = mesh.userData.grassLod as GrassLodSource | undefined;
  if (!lod) {
    return;
  }

  const dx = origin.x - lod.lastOriginX;
  const dz = origin.z - lod.lastOriginZ;
  const movedEnough = dx * dx + dz * dz >= lod.options.movementThreshold ** 2;
  const frameDue = frameIndex - lod.lastFrame >= lod.options.updateEveryFrames;
  if (!movedEnough && !frameDue) {
    return;
  }

  const innerRadiusSq = lod.options.innerRadius ** 2;
  const outerRadiusSq = lod.options.outerRadius ** 2;
  const stride = Math.max(1, Math.floor(lod.options.sampleStride ?? 1));
  const matrixArray = mesh.instanceMatrix.array as Float32Array;
  const phaseArray = mesh.geometry.getAttribute("instancePhase").array as Float32Array;
  const tintArray = mesh.geometry.getAttribute("instanceTint").array as Float32Array;
  const scaleArray = mesh.geometry.getAttribute("instanceScale").array as Float32Array;
  const widthArray = mesh.geometry.getAttribute("instanceWidth").array as Float32Array;
  const rootArray = mesh.geometry.getAttribute("instanceRoot").array as Float32Array;
  let active = 0;

  for (let source = 0; source < lod.sourceCount; source += 1) {
    const rootIndex = source * 3;
    const rootX = lod.roots[rootIndex];
    const rootZ = lod.roots[rootIndex + 2];
    const distanceSq = (rootX - origin.x) ** 2 + (rootZ - origin.z) ** 2;
    if (distanceSq < innerRadiusSq || distanceSq > outerRadiusSq || source % stride !== 0) {
      continue;
    }

    matrixArray.set(lod.matrices.subarray(source * 16, source * 16 + 16), active * 16);
    phaseArray[active] = lod.phases[source];
    scaleArray[active] = lod.scales[source];
    widthArray[active] = lod.widths[source];
    tintArray.set(lod.tints.subarray(rootIndex, rootIndex + 3), active * 3);
    rootArray.set(lod.roots.subarray(rootIndex, rootIndex + 3), active * 3);
    active += 1;
  }

  mesh.count = active;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.geometry.getAttribute("instancePhase").needsUpdate = true;
  mesh.geometry.getAttribute("instanceTint").needsUpdate = true;
  mesh.geometry.getAttribute("instanceScale").needsUpdate = true;
  mesh.geometry.getAttribute("instanceWidth").needsUpdate = true;
  mesh.geometry.getAttribute("instanceRoot").needsUpdate = true;
  mesh.visible = active > 0;

  lod.activeCount = active;
  lod.lastFrame = frameIndex;
  lod.lastOriginX = origin.x;
  lod.lastOriginZ = origin.z;
}
