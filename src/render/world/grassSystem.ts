import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
} from "three";
import { BiomeZone, sampleBiomeZone, sampleGrassDensity, sampleTerrainHeight, sampleTerrainNormal } from "../../simulation/world";

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
  const geometry = new PlaneGeometry(width, height, 4, 6);
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
    const openingMask = sampleOpeningMeadowMask(x, z);
    const fieldCluster = Math.sin(x * 0.016 + z * 0.009 - 0.8) * 0.5 + 0.5;
    const placementBias =
      zone === "plains" || zone === "hills"
        ? 0.58 + openingMask * 0.78 + fieldCluster * 0.14
        : zone === "foothills"
          ? 0.82 + openingMask * 0.1
          : 1;
    if (Math.random() > MathUtils.clamp(density * placementBias * (options.placementMultiplier ?? 1), 0, 1)) {
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
    const heroBoost = isMeadow ? openingMask : 0;
    const adjustedScale =
      scale
      * (zone === "alpine" || zone === "ridge" ? 1.04 : 1.04 + heroBoost * 0.3)
      * (options.scaleMultiplier ?? 1);
    const adjustedWidth =
      width
      * (zone === "alpine" || zone === "ridge" ? 0.96 : 0.9 + heroBoost * 0.08)
      * (options.widthMultiplier ?? 1);
    dummy.scale.set(adjustedWidth, adjustedScale, adjustedWidth);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    const sunPatch = Math.sin(x * 0.022 + z * 0.017) * 0.5 + 0.5;
    const coolPatch = Math.cos(x * 0.018 - z * 0.013) * 0.5 + 0.5;
    const patchMix = MathUtils.clamp(sunPatch * 0.68 + coolPatch * 0.18 + fieldCluster * 0.14 + heroBoost * 0.12, 0, 1);
    const color = tintBottom.clone().lerp(tintTop, MathUtils.clamp(0.12 + patchMix * 0.7 + Math.random() * 0.05, 0, 1));
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
        float playerReadMask = 1.0 - smoothstep(4.6, 10.8, playerDistance);
        float playerMask = playerReadMask * uPlayerPush;
        float cameraDistance = length(cameraPosition.xz - instanceRoot.xz);
        vDistanceBlend = smoothstep(20.0, 146.0, cameraDistance);
        float fadeIn = uFadeInEnd <= uFadeInStart ? 1.0 : smoothstep(uFadeInStart, uFadeInEnd, cameraDistance);
        float fadeOut = uFadeOutEnd <= uFadeOutStart ? 0.0 : smoothstep(uFadeOutStart, uFadeOutEnd, cameraDistance);
        vDistanceBand = clamp(fadeIn * (1.0 - fadeOut), 0.0, 1.0);
        float macroWind = sin(instanceRoot.x * 0.011 + uTime * 0.38 + instanceRoot.z * 0.008)
          + cos(instanceRoot.z * 0.012 - uTime * 0.28 + instanceRoot.x * 0.004);
        float microWind = sin(instanceRoot.x * 0.058 + uTime * 1.1 + instancePhase * 1.1) * 0.38
          + cos(instanceRoot.z * 0.05 + uTime * 0.92 + instancePhase * 0.68) * 0.24;
        float windLane = sin(instanceRoot.x * 0.007 + instanceRoot.z * 0.004 - uTime * 0.14) * 0.5 + 0.5;
        float patchWind = macroWind * 0.62 + microWind * 0.12 + windLane * (0.2 + vHeroField * 0.18);
        vec2 windDirection = normalize(vec2(0.92, 0.39));
        float tuftWeight = pow(uv.y, 1.25);
        float sweep = (0.16 + vHeroField * 0.1 + patchWind * 0.11) * tuftWeight * instanceScale;
        float bend = (0.04 + patchWind * 0.045) * tuftWeight * instanceScale;
        float baseLean = (0.11 + vHeroField * 0.1) * tuftWeight;
        float playerDisplace = playerMask * (0.2 + tuftWeight * 0.72);
        transformed.x *= mix(0.84, 0.98, instanceWidth - 0.64);
        transformed.x += windDirection.x * (sweep + baseLean) + bend * sin(instancePhase);
        transformed.z += windDirection.y * (sweep + baseLean) + bend * cos(instancePhase);
        transformed.z += (0.06 - bladeSide * 0.026) * sin(instancePhase * 0.8) * tuftWeight * instanceScale;
        transformed.x += playerAway.x * playerDisplace;
        transformed.z += playerAway.y * playerDisplace;
        vPlayerFade = 1.0 - playerReadMask * 0.42;
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
        float nearDetail = 1.0 - smoothstep(0.18, 0.88, vDistanceBlend);
        float stroke = sin(vBladeMix * (9.0 + vStrokeSeed * 6.0) + vStrokeSeed * 10.0 + vSoftEdge * 1.5) * 0.5 + 0.5;
        float sunStripe = smoothstep(0.32, 0.98, vBladeMix) * smoothstep(1.0, 0.14, vSoftEdge) * (0.44 + stroke * 0.56) * (0.62 + vHeroField * 0.38);
        float warmTip = smoothstep(0.46, 1.0, vBladeMix) * (0.28 + vPatchLight * 0.72);
        float rootFill = smoothstep(0.42, 0.0, vBladeMix) * (0.1 + uRootFillBoost + vDistanceBlend * 0.28 + vHeroField * 0.08);
        vec3 rooted = vTint * vec3(0.42, 0.58, 0.36);
        vec3 midBlade = mix(rooted, vTint * vec3(0.84, 0.94, 0.66), pow(vBladeMix, 0.58));
        vec3 sunlit = vTint * vec3(1.1, 1.08, 0.74) + vec3(0.18, 0.14, 0.05) * vPatchLight;
        vec3 meadowColor = mix(midBlade, sunlit, sunStripe * (0.6 + nearDetail * 0.14) + warmTip * 0.18);
        vec3 distantMass = mix(vTint * vec3(0.62, 0.76, 0.5), vTint * vec3(0.84, 0.94, 0.66), vPatchLight * 0.42 + vHeroField * 0.1);
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
