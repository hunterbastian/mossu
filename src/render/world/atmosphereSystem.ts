import {
  AdditiveBlending,
  BackSide,
  Camera,
  CircleGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { scenicPockets } from "../../simulation/world";
import { getAtmosphereHorizonTints } from "./sceneLighting";

const _sunDirScratch = new Vector3();
const _sunDirViewScratch = new Vector3();
const _horizonTintScratch = new Color();
const _horizonHazeScratch = new Color();
const _cloudBrightScratch = new Color();
const _cloudShadowScratch = new Color();
const _skySunPositionScratch = new Vector3();
const SKY_SUN_RENDER_ORDER = 20;

interface StylizedSkySunRefs {
  outerGlow: Mesh;
  warmHalo: Mesh;
  softCorona: Mesh;
  amberRing: Mesh;
  coronaShell: Mesh;
  disk: Mesh;
  surfaceFace: Mesh;
  creamyCore: Mesh;
  lowerGlow: Mesh;
  rays: Mesh[];
  godRays: Mesh[];
  flecks: Mesh[];
}

function makeSkySunCircle(color: string, opacity: number, radius: number, additive = true) {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    fog: false,
    side: DoubleSide,
    ...(additive ? { blending: AdditiveBlending } : {}),
  });
  material.toneMapped = false;

  const mesh = new Mesh(new CircleGeometry(radius, 56), material);
  mesh.renderOrder = SKY_SUN_RENDER_ORDER;
  return mesh;
}

function makeSkySunRing(color: string, opacity: number, innerRadius: number, outerRadius: number) {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    fog: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
  material.toneMapped = false;

  const mesh = new Mesh(new RingGeometry(innerRadius, outerRadius, 64), material);
  mesh.renderOrder = SKY_SUN_RENDER_ORDER + 3;
  return mesh;
}

function makeSunSurfaceMaterial() {
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMood: { value: 0 },
      uSunColor: { value: new Color("#ffd977") },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
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
        float limb = pow(1.0 - facing, 1.55);
        float grain = noise(vUv * vec2(9.0, 5.0) + vec2(uTime * 0.025, -uTime * 0.015));
        float slowMarble = noise(vUv * vec2(3.2, 7.4) + vec2(-uTime * 0.011, uTime * 0.018));
        vec3 apricot = mix(vec3(1.0, 0.61, 0.2), uSunColor, 0.38);
        vec3 butter = mix(vec3(1.0, 0.89, 0.43), uSunColor, 0.62);
        vec3 cream = mix(vec3(1.0, 0.97, 0.72), uSunColor, 0.48);
        vec3 color = mix(apricot, butter, smoothstep(0.18, 0.9, facing));
        color = mix(color, cream, pow(facing, 2.6) * 0.62);
        color += vec3(1.0, 0.46, 0.08) * (grain - 0.36) * 0.16;
        color += vec3(1.0, 0.78, 0.28) * (slowMarble - 0.38) * 0.12;
        color += vec3(1.0, 0.72, 0.18) * limb * (0.36 - uMood * 0.08);
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

function makeSkySunRayMaterial(color: string, opacity: number) {
  const material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uColor: { value: new Color(color) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;

      varying vec2 vUv;

      void main() {
        float crossFade = pow(clamp(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0, 1.0), 1.55);
        float lengthFade = smoothstep(0.02, 0.2, vUv.y) * (1.0 - smoothstep(0.74, 1.0, vUv.y));
        float pulse = 0.86 + 0.14 * sin(uTime * 0.28 + vUv.y * 7.0);
        float alpha = crossFade * lengthFade * uOpacity * pulse;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
  material.toneMapped = false;
  return material;
}

function makeSkySunRay(length: number, width: number, color: string, opacity: number, angle: number, distance: number) {
  const material = makeSkySunRayMaterial(color, opacity);
  const ray = new Mesh(new PlaneGeometry(width, length), material);
  ray.position.set(Math.cos(angle) * distance, Math.sin(angle) * distance, -0.08);
  ray.rotation.z = angle - Math.PI / 2;
  ray.renderOrder = SKY_SUN_RENDER_ORDER - 1;
  ray.userData.baseAngle = angle;
  ray.userData.baseDistance = distance;
  ray.userData.baseOpacity = opacity;
  ray.userData.length = length;
  return ray;
}

function makeSkySunGodRay(
  length: number,
  width: number,
  color: string,
  opacity: number,
  angle: number,
  distance: number,
) {
  const ray = makeSkySunRay(length, width, color, opacity, angle, distance);
  ray.renderOrder = SKY_SUN_RENDER_ORDER - 2;
  ray.userData.isGodRay = true;
  return ray;
}

export function buildStylizedSkySun() {
  const group = new Group();
  group.name = "stylized-sky-sun";
  group.renderOrder = SKY_SUN_RENDER_ORDER;

  const outerGlow = makeSkySunCircle("#fff2a4", 0.065, 112);
  const warmHalo = makeSkySunCircle("#ffd56a", 0.1, 76);
  const softCorona = makeSkySunCircle("#fff8ce", 0.08, 56);
  const amberRing = makeSkySunRing("#ffc35a", 0.18, 39, 46);
  amberRing.rotation.z = -0.18;

  const coronaShell = new Mesh(new SphereGeometry(44, 32, 18), makeSunCoronaMaterial(0.38));
  coronaShell.renderOrder = SKY_SUN_RENDER_ORDER + 3;
  const disk = new Mesh(new SphereGeometry(38, 36, 24), makeSunSurfaceMaterial());
  disk.renderOrder = SKY_SUN_RENDER_ORDER + 4;
  const surfaceFace = makeSkySunCircle("#ffc04f", 0.62, 35, false);
  surfaceFace.position.z = 38;
  surfaceFace.renderOrder = SKY_SUN_RENDER_ORDER + 5;
  const creamyCore = new Mesh(new SphereGeometry(12.5, 20, 14), makeSunCoronaMaterial(0.6));
  creamyCore.position.set(-9.5, 7.5, 29);
  creamyCore.scale.set(1.18, 0.78, 0.34);
  creamyCore.renderOrder = SKY_SUN_RENDER_ORDER + 6;
  const lowerGlow = makeSkySunCircle("#ffdf73", 0.12, 30);
  lowerGlow.position.set(8, -10, 0.04);
  lowerGlow.scale.set(1.28, 0.68, 1);

  const godRays = [
    [-0.72, 108, 13, "#fff5bc", 0.017, 93],
    [-0.34, 154, 17, "#ffe090", 0.015, 100],
    [0.08, 196, 22, "#fff8d2", 0.012, 114],
    [0.45, 142, 15, "#ffe4a0", 0.014, 101],
    [0.84, 118, 12, "#fff6cb", 0.012, 92],
  ].map(([angle, length, width, color, opacity, distance]) =>
    makeSkySunGodRay(
      length as number,
      width as number,
      color as string,
      opacity as number,
      angle as number,
      distance as number,
    ),
  );

  const rayAngles = [-0.34, 0.3, 0.92, 1.58, 2.28, 2.92, 3.66, 4.34, 5.08, 5.74];
  const rays = rayAngles.map((angle, index) =>
    makeSkySunRay(
      index % 3 === 0 ? 82 : index % 2 === 0 ? 62 : 48,
      index % 3 === 0 ? 10.5 : 7.2,
      index % 2 === 0 ? "#fff7c9" : "#ffd56d",
      index % 3 === 0 ? 0.12 : 0.085,
      angle,
      index % 3 === 0 ? 76 : 66,
    ),
  );

  const flecks = [
    [-48, 24, 3.6, "#fff7c6", 0.42],
    [48, 29, 3.2, "#ffe17d", 0.34],
    [-35, -33, 2.8, "#fff2ad", 0.3],
    [32, -39, 2.4, "#ffd36d", 0.26],
    [2, 54, 2.1, "#fff8d0", 0.32],
  ].map(([x, y, radius, color, opacity], index) => {
    const fleck = makeSkySunCircle(color as string, opacity as number, radius as number);
    fleck.position.set(x as number, y as number, 0.08 + index * 0.01);
    fleck.renderOrder = SKY_SUN_RENDER_ORDER + 4;
    fleck.userData.baseX = x;
    fleck.userData.baseY = y;
    fleck.userData.baseOpacity = opacity;
    return fleck;
  });

  group.add(
    ...godRays,
    outerGlow,
    ...rays,
    warmHalo,
    softCorona,
    amberRing,
    coronaShell,
    disk,
    surfaceFace,
    lowerGlow,
    creamyCore,
    ...flecks,
  );
  group.userData.skySunRefs = {
    outerGlow,
    warmHalo,
    softCorona,
    amberRing,
    coronaShell,
    disk,
    surfaceFace,
    creamyCore,
    lowerGlow,
    rays,
    godRays,
    flecks,
  } satisfies StylizedSkySunRefs;
  return group;
}

function createCloudPuffMaterial() {
  const material = new MeshBasicMaterial({
    color: "#fffaf0",
    transparent: true,
    opacity: 0.2,
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
  const geometry = new SphereGeometry(520, 40, 28);
  if (options.webGpuCompatible) {
    return new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: "#aeeeff",
        side: BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
  }

  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new Vector3(-0.86, 0.2, -0.41).normalize() },
      uSunColor: { value: new Color("#fff0cf") },
      uElevationMood: { value: 0 },
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
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uElevationMood;

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
        vec3 horizonColor = vec3(1.0, 0.975, 0.82);
        vec3 midColor = mix(vec3(0.70, 0.90, 0.965), vec3(0.66, 0.83, 0.955), mood);
        vec3 zenithColor = mix(vec3(0.52, 0.77, 0.965), vec3(0.47, 0.67, 0.94), mood);
        vec3 color = mix(horizonColor, midColor, smoothstep(-0.08, 0.18, dir.y));
        color = mix(color, zenithColor, smoothstep(0.22, 0.96, dir.y));

        vec3 sunDir = normalize(uSunDir);
        float sunDot = max(dot(dir, sunDir), 0.0);
        float sunBloom = pow(sunDot, 2.92);
        float sunCorona = pow(sunDot, 1.08) * (1.0 - pow(sunDot, 8.0) * 0.64);
        float rayNoise = fbm(vec2(atan(dir.z, dir.x) * 1.7, dir.y * 3.2) + vec2(uElevationMood * 0.8, 0.0));
        float rayBands = smoothstep(0.54, 0.88, rayNoise) * smoothstep(0.2, 0.98, sunDot);
        float lightShaft = rayBands * pow(sunDot, 4.4) * smoothstep(-0.04, 0.48, dir.y);
        float sunDisk = smoothstep(0.982, 0.993, sunDot);
        float sunCore = smoothstep(0.993, 0.9985, sunDot);
        vec3 sunTint = uSunColor * 1.1;
        vec3 sunApricot = mix(vec3(1.0, 0.66, 0.25), sunTint, 0.48);
        vec3 sunCream = mix(vec3(1.0, 0.96, 0.66), sunTint, 0.58);
        vec3 warmHaze = mix(vec3(1.0, 0.76, 0.36), sunCream, 0.46);
        vec3 coolBloom = vec3(0.58, 0.82, 0.96) * (0.09 + mood * 0.045);
        color += coolBloom * sunBloom;
        color += sunApricot * sunBloom * 0.3;
        color += warmHaze * sunCorona * (0.23 + (1.0 - mood) * 0.05);
        color += sunCream * lightShaft * (0.012 + (1.0 - mood) * 0.007);
        color = mix(color, sunApricot, sunDisk * 0.58);
        color = mix(color, sunCream, sunCore * 0.78);
        color += sunCream * sunCore * 0.32;

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

        float aquaLift = smoothstep(0.08, 0.72, dir.y) * (1.0 - smoothstep(0.76, 1.0, dir.y));
        color += vec3(0.075, 0.26, 0.24) * aquaLift * (0.046 - mood * 0.01);

        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        color += (dither - 0.5) * 0.0038;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  return new Mesh(geometry, material);
}

/** Keeps sky sun disc and volumetric-style clouds aligned with the scene DirectionalLight. */
export function syncAtmosphereLighting(
  skyDome: Mesh,
  clouds: Group,
  sun: DirectionalLight,
  elevationMood: number,
  camera: Camera,
  timeSeconds: number,
) {
  const mood = MathUtils.clamp(elevationMood, 0, 1);
  _sunDirScratch.subVectors(sun.position, sun.target.position).normalize();
  camera.updateMatrixWorld();
  const skyMat = skyDome.material;
  if (skyMat instanceof ShaderMaterial && skyMat.uniforms.uSunDir) {
    skyMat.uniforms.uSunDir.value.copy(_sunDirScratch);
    (skyMat.uniforms.uSunColor.value as Color).copy(sun.color);
    skyMat.uniforms.uElevationMood.value = mood;
  }
  const cloudMat = clouds.userData.cloudMaterial as ShaderMaterial | MeshBasicMaterial | undefined;
  if (cloudMat instanceof MeshBasicMaterial) {
    getAtmosphereHorizonTints(mood, _horizonTintScratch, _horizonHazeScratch, _cloudBrightScratch, _cloudShadowScratch);
    cloudMat.color.copy(_cloudBrightScratch).lerp(sun.color, 0.08 + (1 - mood) * 0.04);
    cloudMat.opacity = MathUtils.lerp(0.22, 0.18, mood);
  } else if (cloudMat?.uniforms?.uSunDirView) {
    _sunDirViewScratch.copy(_sunDirScratch).transformDirection(camera.matrixWorldInverse);
    cloudMat.uniforms.uSunDirView.value.copy(_sunDirViewScratch);
    (cloudMat.uniforms.uSunColor.value as Color).copy(sun.color);
    (cloudMat.uniforms.uCameraPosition.value as Vector3).copy(camera.position);
    cloudMat.uniforms.uTime.value = timeSeconds;
    cloudMat.uniforms.uElevationMood.value = mood;

    // Ghibli-ish: warm paper/cream at horizon, cooler cel highlights aloft; ties to sky + elevation.
    getAtmosphereHorizonTints(mood, _horizonTintScratch, _horizonHazeScratch, _cloudBrightScratch, _cloudShadowScratch);
    (cloudMat.uniforms.uHorizonTint.value as Color).copy(_horizonTintScratch);
    (cloudMat.uniforms.uHorizonHaze.value as Color).copy(_horizonHazeScratch);
    (cloudMat.uniforms.uCloudBright.value as Color).copy(_cloudBrightScratch);
    (cloudMat.uniforms.uCloudShadow.value as Color).copy(_cloudShadowScratch);
  }
}

export function syncStylizedSkySun(
  skySun: Group,
  sun: DirectionalLight,
  camera: Camera,
  elevationMood: number,
  timeSeconds = 0,
) {
  const mood = MathUtils.clamp(elevationMood, 0, 1);
  const lowAngleWarmth =
    typeof sun.userData.lowAngleWarmth === "number" ? MathUtils.clamp(sun.userData.lowAngleWarmth, 0, 1) : 0;
  const rayLift = MathUtils.lerp(0.48, 0.82, lowAngleWarmth);
  _sunDirScratch.subVectors(sun.position, sun.target.position).normalize();
  _skySunPositionScratch.copy(camera.position).addScaledVector(_sunDirScratch, 520);
  skySun.position.copy(_skySunPositionScratch);
  skySun.lookAt(camera.position);
  skySun.scale.setScalar(MathUtils.lerp(0.98, 0.82, mood));

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

  setOpacity(refs?.outerGlow, MathUtils.lerp(0.076, 0.05, mood) * MathUtils.lerp(0.95, 1.16, lowAngleWarmth));
  setOpacity(refs?.warmHalo, MathUtils.lerp(0.118, 0.08, mood) * MathUtils.lerp(0.95, 1.18, lowAngleWarmth));
  setOpacity(refs?.softCorona, MathUtils.lerp(0.098, 0.065, mood));
  setOpacity(refs?.amberRing, MathUtils.lerp(0.2, 0.13, mood));
  setOpacity(refs?.coronaShell, MathUtils.lerp(0.26, 0.18, mood));
  setOpacity(refs?.surfaceFace, MathUtils.lerp(0.66, 0.48, mood));
  setOpacity(refs?.creamyCore, MathUtils.lerp(0.58, 0.38, mood));
  setOpacity(refs?.lowerGlow, MathUtils.lerp(0.14, 0.08, mood));

  refs?.rays.forEach((ray, index) => {
    const baseAngle = (ray.userData.baseAngle as number | undefined) ?? 0;
    const baseDistance = (ray.userData.baseDistance as number | undefined) ?? 60;
    const baseOpacity = (ray.userData.baseOpacity as number | undefined) ?? 0.1;
    const drift = Math.sin(timeSeconds * 0.12 + index * 1.7) * 0.035;
    const pulse = 0.82 + Math.sin(timeSeconds * 0.34 + index * 0.83) * 0.18;
    ray.rotation.z = baseAngle - Math.PI / 2 + drift;
    ray.position.set(
      Math.cos(baseAngle + drift * 0.4) * (baseDistance + pulse * 2.2),
      Math.sin(baseAngle + drift * 0.4) * (baseDistance + pulse * 2.2),
      -0.08,
    );
    setOpacity(
      ray,
      baseOpacity * MathUtils.lerp(0.92, 0.58, mood) * pulse * MathUtils.lerp(0.95, 1.16, lowAngleWarmth),
    );
  });

  refs?.godRays.forEach((ray, index) => {
    const baseAngle = (ray.userData.baseAngle as number | undefined) ?? 0;
    const baseDistance = (ray.userData.baseDistance as number | undefined) ?? 96;
    const baseOpacity = (ray.userData.baseOpacity as number | undefined) ?? 0.06;
    const slowDrift = Math.sin(timeSeconds * 0.055 + index * 1.23) * 0.055;
    const breathe = 0.72 + Math.sin(timeSeconds * 0.18 + index * 0.71) * 0.16;
    ray.rotation.z = baseAngle - Math.PI / 2 + slowDrift;
    ray.position.set(
      Math.cos(baseAngle + slowDrift * 0.28) * (baseDistance + breathe * 5),
      Math.sin(baseAngle + slowDrift * 0.28) * (baseDistance + breathe * 5),
      -0.16,
    );
    setOpacity(ray, baseOpacity * MathUtils.lerp(1.0, 0.48, mood) * breathe * rayLift);
  });

  refs?.flecks.forEach((fleck, index) => {
    const baseX = (fleck.userData.baseX as number | undefined) ?? fleck.position.x;
    const baseY = (fleck.userData.baseY as number | undefined) ?? fleck.position.y;
    const baseOpacity = (fleck.userData.baseOpacity as number | undefined) ?? 0.3;
    fleck.position.x = baseX + Math.sin(timeSeconds * 0.2 + index * 0.9) * 1.2;
    fleck.position.y = baseY + Math.cos(timeSeconds * 0.16 + index * 1.3) * 0.9;
    setOpacity(fleck, baseOpacity * MathUtils.lerp(1, 0.62, mood));
  });
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
