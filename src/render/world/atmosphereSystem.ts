import {
  AdditiveBlending,
  BackSide,
  Camera,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { scenicPockets } from "../../simulation/world";
import { getAtmosphereHorizonTints, type WorldLightingMoodState } from "./sceneLighting";

const _sunDirScratch = new Vector3();
const _sunDirViewScratch = new Vector3();
const _horizonTintScratch = new Color();
const _horizonHazeScratch = new Color();
const _cloudBrightScratch = new Color();
const _cloudShadowScratch = new Color();
const SKY_DOME_RENDER_ORDER = -100;
const SKY_SUN_RENDER_ORDER = 20;

interface StylizedSkySunRefs {
  body: Mesh;
  coronaShell: Mesh;
  warmGlowShell: Mesh;
}

function makeSunSurfaceMaterial() {
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMood: { value: 0 },
      uSunColor: { value: new Color("#ffd977") },
    },
    transparent: false,
    depthWrite: true,
    depthTest: false,
    fog: false,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;

      void main() {
        vUv = uv;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uMood;
      uniform vec3 uSunColor;

      varying vec2 vUv;
      varying vec3 vNormalView;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.7, 289.2))) * 97143.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        vec3 n = normalize(vNormalView);
        float facing = clamp(n.z * 0.5 + 0.5, 0.0, 1.0);
        vec2 centered = vUv - vec2(0.5);
        float radial = length(centered) * 2.0;
        float limb = pow(1.0 - facing, 1.22);
        float grain = noise(vUv * vec2(7.0, 4.2) + vec2(uTime * 0.014, -uTime * 0.009));
        float broadCloud = noise(vUv * vec2(2.4, 5.8) + vec2(-uTime * 0.006, uTime * 0.01));
        float veil = smoothstep(0.42, 0.82, broadCloud) * smoothstep(0.28, 1.18, radial);
        float lowerHeat = smoothstep(-0.34, 0.42, centered.y + centered.x * 0.18);
        vec3 ochre = mix(vec3(0.98, 0.54, 0.18), uSunColor, 0.3);
        vec3 honey = mix(vec3(1.0, 0.76, 0.28), uSunColor, 0.52);
        vec3 ivory = mix(vec3(1.0, 0.94, 0.62), uSunColor, 0.34);
        vec3 milk = vec3(1.0, 0.985, 0.79);
        vec3 color = mix(ochre, honey, smoothstep(0.08, 0.9, facing));
        color = mix(color, ivory, pow(facing, 2.0) * 0.7);
        color = mix(color, milk, (1.0 - veil) * pow(facing, 3.2) * 0.34);
        color += vec3(1.0, 0.5, 0.08) * (grain - 0.42) * 0.11;
        color = mix(color, vec3(1.0, 0.74, 0.34), veil * (0.16 - uMood * 0.035));
        color = mix(color, vec3(0.92, 0.43, 0.12), limb * (0.28 - uMood * 0.035));
        color += vec3(1.0, 0.9, 0.48) * pow(facing, 4.2) * 0.16;
        color += vec3(1.0, 0.72, 0.24) * lowerHeat * 0.075;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  material.toneMapped = false;
  return material;
}

function makeSunCoronaMaterial(opacity: number) {
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMood: { value: 0 },
      uOpacity: { value: opacity },
      uSunColor: { value: new Color("#ffe58c") },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    blending: AdditiveBlending,
    vertexShader: `
      varying vec3 vNormalView;

      void main() {
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uMood;
      uniform float uOpacity;
      uniform vec3 uSunColor;

      varying vec3 vNormalView;

      void main() {
        vec3 n = normalize(vNormalView);
        float facing = clamp(n.z * 0.5 + 0.5, 0.0, 1.0);
        float rim = pow(1.0 - facing, 1.9);
        float ember = 0.84 + 0.16 * sin(uTime * 0.23 + n.y * 7.0 + n.x * 4.0);
        vec3 color = mix(vec3(1.0, 0.62, 0.16), uSunColor, 0.55);
        float alpha = rim * uOpacity * ember * (1.0 - uMood * 0.18);
        gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
  material.toneMapped = false;
  return material;
}

export function buildStylizedSkySun() {
  const group = new Group();
  group.name = "far-world-sun";
  group.renderOrder = SKY_SUN_RENDER_ORDER;

  const warmGlowShell = new Mesh(new SphereGeometry(72, 28, 16), makeSunCoronaMaterial(0.14));
  warmGlowShell.renderOrder = SKY_SUN_RENDER_ORDER;
  const coronaShell = new Mesh(new SphereGeometry(48, 30, 18), makeSunCoronaMaterial(0.34));
  coronaShell.renderOrder = SKY_SUN_RENDER_ORDER + 1;
  const body = new Mesh(new SphereGeometry(31, 36, 24), makeSunSurfaceMaterial());
  body.renderOrder = SKY_SUN_RENDER_ORDER + 2;

  group.add(warmGlowShell, coronaShell, body);
  group.userData.skySunRefs = {
    body,
    coronaShell,
    warmGlowShell,
  } satisfies StylizedSkySunRefs;
  return group;
}

function createCloudPuffMaterial() {
  const material = new MeshBasicMaterial({
    color: "#fff8e9",
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    fog: true,
  });
  material.toneMapped = false;
  return material;
}

function makeCloudCluster(position: Vector3, scale: number, puffMaterial: MeshBasicMaterial) {
  const group = new Group();
  const baseSphere = new SphereGeometry(1.2, 8, 6);

  const puffs: [number, number, number, number, number, number, number][] = [
    [0, 0, 0, 3.9, 2.35, 0.72, 1.42],
    [-5.6, 0.3, 0.3, 3.2, 1.88, 0.68, 1.18],
    [5.4, 0.18, -0.25, 3.3, 1.9, 0.7, 1.22],
    [-1.4, 1.35, 0.05, 2.3, 1.42, 0.6, 0.92],
    [3.0, 1.1, 0.18, 2.1, 1.34, 0.58, 0.88],
  ];

  puffs.forEach(([x, y, z, size, sx, sy, sz]) => {
    const geom = baseSphere.clone();
    const puff = new Mesh(geom, puffMaterial);
    puff.position.set(x, y, z);
    puff.scale.set(size * sx * scale, size * sy * scale, size * sz * scale);
    puff.userData.baseY = puff.position.y;
    group.add(puff);
  });

  group.position.copy(position);
  group.userData.baseX = position.x;
  group.userData.baseY = position.y;
  group.userData.baseZ = position.z;
  return group;
}

function makeMistPuff(scale: number, color: string, opacity: number) {
  const puff = new Mesh(
    new SphereGeometry(1, 12, 10),
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  puff.scale.set(scale * 1.5, scale, scale * 1.2);
  return puff;
}

export function buildClouds() {
  const clouds = new Group();
  const puffMaterial = createCloudPuffMaterial();
  clouds.userData.cloudMaterial = puffMaterial;
  const sets = [
    new Vector3(-310, 174, -238),
    new Vector3(306, 188, -116),
    new Vector3(-276, 214, 126),
    new Vector3(282, 228, 246),
    new Vector3(-118, 242, -18),
    new Vector3(156, 256, 132),
  ];

  sets.forEach((position, index) => {
    const layerScale = index >= 4 ? 2.2 + (index - 4) * 0.18 : 2.85 + index * 0.24;
    const cluster = makeCloudCluster(position, layerScale, puffMaterial);
    cluster.name = `clean-sky-cloud-${index}`;
    cluster.rotation.y = index * 0.42 + 0.18;
    cluster.userData.driftRangeX = 10 + index * 1.8 + (index >= 4 ? 6 : 0);
    cluster.userData.driftRangeZ = 4 + index * 0.7 + (index >= 4 ? 3 : 0);
    cluster.userData.bobRange = 1.2 + index * 0.14;
    cluster.userData.driftSpeed = (index >= 4 ? 0.012 : 0.018) + index * 0.002;
    clouds.add(cluster);
  });

  return clouds;
}

export function buildSkyDome(options: { webGpuCompatible?: boolean } = {}) {
  const geometry = new SphereGeometry(1100, 40, 28);
  if (options.webGpuCompatible) {
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: "#aeeeff",
        side: BackSide,
        depthWrite: false,
        depthTest: true,
        fog: false,
      }),
    );
    mesh.renderOrder = SKY_DOME_RENDER_ORDER;
    return mesh;
  }

  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new Vector3(-0.86, 0.2, -0.41).normalize() },
      uSunColor: { value: new Color("#fff0cf") },
      uElevationMood: { value: 0 },
      uSunHaze: { value: 0 },
      uWarmHaze: { value: 0 },
      uWatercolorFog: { value: 0 },
      uLandmarkGlow: { value: 0 },
      uSilhouetteContrast: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldDirection;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uElevationMood;
      uniform float uSunHaze;
      uniform float uWarmHaze;
      uniform float uWatercolorFog;
      uniform float uLandmarkGlow;
      uniform float uSilhouetteContrast;

      varying vec3 vWorldDirection;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int i = 0; i < 4; i += 1) {
          value += amplitude * noise(p);
          p = p * 2.03 + vec2(17.3, 9.1);
          amplitude *= 0.52;
        }
        return value;
      }

      void main() {
        vec3 dir = normalize(vWorldDirection);
        float mood = clamp(uElevationMood, 0.0, 1.0);
        // Cozy lowland → cooler alpine: zenith and mid band shift with elevation mood.
        vec3 horizonColor = vec3(1.0, 0.965, 0.78);
        vec3 midColor = mix(vec3(0.62, 0.88, 0.99), vec3(0.64, 0.84, 0.965), mood);
        vec3 zenithColor = mix(vec3(0.39, 0.68, 0.98), vec3(0.45, 0.66, 0.94), mood);
        vec3 color = mix(horizonColor, midColor, smoothstep(-0.08, 0.18, dir.y));
        color = mix(color, zenithColor, smoothstep(0.22, 0.96, dir.y));

        vec3 sunDir = normalize(uSunDir);
        float sunDot = max(dot(dir, sunDir), 0.0);
        float sunBloom = pow(sunDot, 2.28);
        float broadSunHaze = pow(sunDot, 0.78) * (1.0 - pow(sunDot, 10.0) * 0.52);
        float sunCorona = pow(sunDot, 1.0) * (1.0 - pow(sunDot, 8.0) * 0.54);
        float rayNoise = fbm(vec2(atan(dir.z, dir.x) * 1.32, dir.y * 3.65) + vec2(uElevationMood * 0.8, 0.0));
        float rayBands = smoothstep(0.5, 0.86, rayNoise) * smoothstep(0.16, 0.98, sunDot);
        float lightShaft = rayBands * pow(sunDot, 3.65) * smoothstep(-0.04, 0.5, dir.y);
        vec3 sunTint = uSunColor * 1.05;
        vec3 sunApricot = mix(vec3(1.0, 0.62, 0.24), sunTint, 0.42);
        vec3 sunCream = mix(vec3(1.0, 0.965, 0.7), sunTint, 0.5);
        vec3 sunIvory = mix(vec3(1.0, 0.985, 0.83), sunCream, 0.58);
        vec3 warmHaze = mix(vec3(1.0, 0.78, 0.42), sunCream, 0.42);
        vec3 coolBloom = vec3(0.62, 0.82, 0.94) * (0.055 + mood * 0.025);
        color += coolBloom * sunBloom;
        color += sunApricot * sunBloom * 0.28;
        color += warmHaze * sunCorona * (0.25 + (1.0 - mood) * 0.065 + uSunHaze * 0.1);
        color += sunIvory * broadSunHaze * (0.1 + (1.0 - mood) * 0.03 + uSunHaze * 0.06);
        color += sunCream * lightShaft * (0.018 + (1.0 - mood) * 0.01 + uSunHaze * 0.018);

        vec2 skyUv = dir.xz * (2.05 / max(0.26, dir.y + 0.38));
        float highWisp = fbm(skyUv * vec2(0.62, 0.26) + vec2(8.0, 3.0));
        float softWash = fbm(skyUv * vec2(0.32, 0.14) + vec2(-4.0, 6.2));
        float veil = smoothstep(0.6, 0.88, highWisp) * smoothstep(0.12, 0.74, dir.y);
        float upperWash = smoothstep(0.42, 0.82, softWash) * smoothstep(0.04, 0.62, dir.y);
        vec3 veilColor = mix(vec3(0.9, 0.975, 0.995), vec3(1.0, 0.97, 0.84), 0.54 + sunBloom * 0.22);
        color = mix(color, veilColor, veil * 0.085 + upperWash * 0.024);

        float horizonHaze = smoothstep(-0.14, 0.12, dir.y) * (1.0 - smoothstep(0.16, 0.44, dir.y));
        float paperBloom = fbm(vec2(atan(dir.z, dir.x) * 0.9, dir.y * 2.6) + vec2(2.4, 11.2));
        vec3 watercolorFog = mix(vec3(0.94, 0.985, 0.99), vec3(1.0, 0.95, 0.76), 0.34 + sunBloom * 0.26);
        color = mix(color, watercolorFog, horizonHaze * (0.34 + paperBloom * 0.055));
        color = mix(color, vec3(1.0, 0.965, 0.78), horizonHaze * uLandmarkGlow * 0.08);

        float aquaLift = smoothstep(0.08, 0.72, dir.y) * (1.0 - smoothstep(0.76, 1.0, dir.y));
        color += vec3(0.075, 0.26, 0.24) * aquaLift * (0.046 - mood * 0.01);

        vec2 dirFlat = normalize(dir.xz + vec2(0.0001, -0.0001));
        vec2 sunFlat = normalize(sunDir.xz + vec2(0.0001, -0.0001));
        float sunAzimuth = max(dot(dirFlat, sunFlat), 0.0);
        float antiSunAzimuth = max(dot(dirFlat, -sunFlat), 0.0);
        float horizonCore = smoothstep(-0.22, 0.025, dir.y) * (1.0 - smoothstep(0.075, 0.24, dir.y));
        float horizonShelf = smoothstep(-0.16, 0.18, dir.y) * (1.0 - smoothstep(0.27, 0.58, dir.y));
        float horizonGrain = fbm(vec2(atan(dir.z, dir.x) * 1.46 + uTime * 0.012, dir.y * 5.2 + 4.0));
        float atmosphericDepth = horizonShelf * (0.5 + uWatercolorFog * 0.34 + uWarmHaze * 0.18);
        float warmHorizon = horizonShelf * pow(sunAzimuth, 1.55) * (0.4 + uSunHaze * 0.34 + uLandmarkGlow * 0.12);
        float coolHorizon = horizonCore * pow(antiSunAzimuth, 1.35) * (0.13 + mood * 0.06 + uSilhouetteContrast * 0.04);
        vec3 creamAir = mix(vec3(0.99, 0.985, 0.86), vec3(1.0, 0.9, 0.58), 0.2 + uWarmHaze * 0.28);
        vec3 sunMilk = mix(vec3(1.0, 0.95, 0.72), sunCream, 0.56);
        vec3 coolDistantAir = mix(vec3(0.84, 0.97, 1.0), vec3(0.78, 0.9, 1.0), mood);
        color = mix(color, creamAir, atmosphericDepth * (0.16 + horizonGrain * 0.06));
        color = mix(color, sunMilk, warmHorizon * (0.22 + horizonGrain * 0.08));
        color = mix(color, coolDistantAir, coolHorizon);

        float cloudBandA = fbm(vec2(atan(dir.z, dir.x) * 1.9 + uTime * 0.004, dir.y * 7.2 + 5.0));
        float cloudBandB = fbm(vec2(atan(dir.z, dir.x) * 2.7 - uTime * 0.003, dir.y * 9.4 - 2.0));
        float lowCloudShelf = smoothstep(-0.1, 0.32, dir.y) * (1.0 - smoothstep(0.38, 0.72, dir.y));
        float cloudBand = smoothstep(0.58, 0.86, cloudBandA * 0.66 + cloudBandB * 0.34) * lowCloudShelf;
        vec3 bandCream = mix(vec3(0.9, 0.985, 1.0), sunMilk, 0.38 + sunAzimuth * 0.24);
        color = mix(color, bandCream, cloudBand * (0.055 + uWatercolorFog * 0.035 + uWarmHaze * 0.025));

        float viewAz = atan(dir.z, dir.x);
        float sunAz = atan(sunDir.z, sunDir.x);
        float azDelta = atan(sin(viewAz - sunAz), cos(viewAz - sunAz));
        float fan = 1.0 - smoothstep(0.02, 1.42, abs(azDelta));
        float lowAir = pow(1.0 - smoothstep(0.24, 0.88, dir.y), 1.18);
        float rayAltitude = smoothstep(-0.07, 0.26, dir.y) * (1.0 - smoothstep(0.72, 1.0, dir.y));
        float rayFlow = uTime * 0.027;
        float broadRayNoise = fbm(vec2(azDelta * 2.8 + rayFlow, dir.y * 4.4 - rayFlow * 0.65));
        float fineRayWave = 0.5 + 0.5 * sin(azDelta * 17.0 + broadRayNoise * 6.0 + uTime * 0.075);
        float brokenBands = smoothstep(0.34, 0.72, broadRayNoise) * (0.45 + smoothstep(0.48, 0.9, fineRayWave) * 0.55);
        float volumeShafts =
          fan *
          lowAir *
          rayAltitude *
          brokenBands *
          (0.028 + uSunHaze * 0.028 + uWarmHaze * 0.014 + uLandmarkGlow * 0.012);
        color += sunMilk * volumeShafts;
        color = mix(color, coolDistantAir, fan * lowAir * rayAltitude * (1.0 - brokenBands) * 0.012);

        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        color += (dither - 0.5) * 0.0038;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = SKY_DOME_RENDER_ORDER;
  return mesh;
}

/** Keeps the sky haze and volumetric-style clouds aligned with the scene DirectionalLight. */
export function syncAtmosphereLighting(
  skyDome: Mesh,
  clouds: Group,
  sun: DirectionalLight,
  elevationMood: number,
  camera: Camera,
  timeSeconds: number,
  worldMood?: WorldLightingMoodState,
) {
  const mood = MathUtils.clamp(elevationMood, 0, 1);
  _sunDirScratch.subVectors(sun.position, sun.target.position).normalize();
  camera.updateMatrixWorld();
  const skyMat = skyDome.material;
  if (skyMat instanceof ShaderMaterial && skyMat.uniforms.uSunDir) {
    if (skyMat.uniforms.uTime) {
      skyMat.uniforms.uTime.value = timeSeconds;
    }
    skyMat.uniforms.uSunDir.value.copy(_sunDirScratch);
    (skyMat.uniforms.uSunColor.value as Color).copy(sun.color);
    skyMat.uniforms.uElevationMood.value = mood;
    if (skyMat.uniforms.uSunHaze) {
      skyMat.uniforms.uSunHaze.value = worldMood?.sunHaze ?? 0;
    }
    if (skyMat.uniforms.uWarmHaze) {
      skyMat.uniforms.uWarmHaze.value = worldMood?.warmHaze ?? 0;
    }
    if (skyMat.uniforms.uWatercolorFog) {
      skyMat.uniforms.uWatercolorFog.value = worldMood?.watercolorFog ?? 0;
    }
    if (skyMat.uniforms.uLandmarkGlow) {
      skyMat.uniforms.uLandmarkGlow.value = worldMood?.landmarkGlow ?? 0;
    }
    if (skyMat.uniforms.uSilhouetteContrast) {
      skyMat.uniforms.uSilhouetteContrast.value = worldMood?.silhouetteContrast ?? 0;
    }
  }
  const cloudMat = clouds.userData.cloudMaterial as ShaderMaterial | MeshBasicMaterial | undefined;
  if (cloudMat instanceof MeshBasicMaterial) {
    getAtmosphereHorizonTints(
      mood,
      _horizonTintScratch,
      _horizonHazeScratch,
      _cloudBrightScratch,
      _cloudShadowScratch,
      worldMood,
    );
    cloudMat.color.copy(_cloudBrightScratch).lerp(sun.color, 0.08 + (1 - mood) * 0.04);
    cloudMat.opacity =
      MathUtils.lerp(0.22, 0.18, mood) +
      (worldMood?.watercolorFog ?? 0) * 0.018 -
      (worldMood?.landmarkGlow ?? 0) * 0.008;
  } else if (cloudMat?.uniforms?.uSunDirView) {
    _sunDirViewScratch.copy(_sunDirScratch).transformDirection(camera.matrixWorldInverse);
    cloudMat.uniforms.uSunDirView.value.copy(_sunDirViewScratch);
    (cloudMat.uniforms.uSunColor.value as Color).copy(sun.color);
    (cloudMat.uniforms.uCameraPosition.value as Vector3).copy(camera.position);
    cloudMat.uniforms.uTime.value = timeSeconds;
    cloudMat.uniforms.uElevationMood.value = mood;

    // Ghibli-ish: warm paper/cream at horizon, cooler cel highlights aloft; ties to sky + elevation.
    getAtmosphereHorizonTints(
      mood,
      _horizonTintScratch,
      _horizonHazeScratch,
      _cloudBrightScratch,
      _cloudShadowScratch,
      worldMood,
    );
    (cloudMat.uniforms.uHorizonTint.value as Color).copy(_horizonTintScratch);
    (cloudMat.uniforms.uHorizonHaze.value as Color).copy(_horizonHazeScratch);
    (cloudMat.uniforms.uCloudBright.value as Color).copy(_cloudBrightScratch);
    (cloudMat.uniforms.uCloudShadow.value as Color).copy(_cloudShadowScratch);
  }
}

export function syncStylizedSkySun(
  skySun: Group,
  sun: DirectionalLight,
  elevationMood: number,
  timeSeconds = 0,
  worldMood?: WorldLightingMoodState,
) {
  const mood = MathUtils.clamp(elevationMood, 0, 1);
  const lowAngleWarmth =
    typeof sun.userData.lowAngleWarmth === "number" ? MathUtils.clamp(sun.userData.lowAngleWarmth, 0, 1) : 0;
  skySun.position.copy(sun.position);
  skySun.scale.setScalar(MathUtils.lerp(1, 0.94, mood) * MathUtils.lerp(1, 1.045, worldMood?.sunHaze ?? 0));
  skySun.rotation.set(
    -0.16 + Math.sin(timeSeconds * 0.018) * 0.035,
    timeSeconds * 0.026,
    0.08 + Math.sin(timeSeconds * 0.013) * 0.025,
  );

  const refs = skySun.userData.skySunRefs as StylizedSkySunRefs | undefined;
  const setOpacity = (mesh: Mesh | undefined, opacity: number) => {
    const material = mesh?.material;
    if (material instanceof MeshBasicMaterial) {
      material.opacity = opacity;
    } else if (material instanceof ShaderMaterial && material.uniforms.uOpacity) {
      material.uniforms.uOpacity.value = opacity;
    }
  };

  skySun.traverse((node) => {
    const material = (node as Mesh).material;
    if (material instanceof ShaderMaterial) {
      if (material.uniforms.uTime) {
        material.uniforms.uTime.value = timeSeconds;
      }
      if (material.uniforms.uMood) {
        material.uniforms.uMood.value = mood;
      }
      if (material.uniforms.uSunColor) {
        (material.uniforms.uSunColor.value as Color).copy(sun.color);
      }
    }
  });

  setOpacity(
    refs?.coronaShell,
    MathUtils.lerp(0.26, 0.18, mood) *
      MathUtils.lerp(0.96, 1.16, lowAngleWarmth) *
      MathUtils.lerp(1, 1.18, worldMood?.sunHaze ?? 0),
  );
  setOpacity(
    refs?.warmGlowShell,
    MathUtils.lerp(0.08, 0.052, mood) *
      MathUtils.lerp(0.92, 1.16, lowAngleWarmth) *
      MathUtils.lerp(1, 1.26, worldMood?.landmarkGlow ?? 0),
  );
}

export function buildMountainAtmosphere() {
  const group = new Group();

  scenicPockets
    .filter((pocket) => pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine")
    .forEach((pocket, pocketIndex) => {
      const cluster = new Group();
      const baseY = pocket.position.y + (pocket.zone === "peak_shrine" ? 14 : pocket.zone === "ridge" ? 10 : 8);
      const puffCount = pocket.zone === "peak_shrine" ? 5 : pocket.zone === "ridge" ? 5 : 4;
      for (let i = 0; i < puffCount; i += 1) {
        const puff = makeMistPuff(
          pocket.zone === "peak_shrine" ? 14 + i * 2 : pocket.zone === "ridge" ? 12 + i * 1.9 : 10 + i * 1.8,
          pocket.zone === "peak_shrine" ? "#eef6ff" : "#e2eef6",
          pocket.zone === "peak_shrine" ? 0.16 - i * 0.02 : 0.14 - i * 0.02,
        );
        const puffBaseY = i * (pocket.zone === "peak_shrine" ? 3.4 : pocket.zone === "ridge" ? 3 : 2.8);
        puff.position.set(
          Math.cos(i * 1.4 + pocketIndex) * (8 + i * 5),
          puffBaseY,
          Math.sin(i * 1.2 + pocketIndex * 0.7) * (10 + i * 4),
        );
        puff.userData.baseY = puffBaseY;
        cluster.add(puff);
      }
      cluster.position.set(pocket.position.x, baseY, pocket.position.z);
      cluster.userData.baseX = cluster.position.x;
      cluster.userData.baseZ = cluster.position.z;
      group.add(cluster);
    });

  return group;
}
