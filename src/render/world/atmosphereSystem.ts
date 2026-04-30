import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Camera,
  CircleGeometry,
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
import { getAtmosphereHorizonTints } from "./sceneLighting";

const _sunDirScratch = new Vector3();
const _sunDirViewScratch = new Vector3();
const _horizonTintScratch = new Color();
const _horizonHazeScratch = new Color();
const _cloudBrightScratch = new Color();
const _cloudShadowScratch = new Color();
const _skySunPositionScratch = new Vector3();

function makeSkySunCircle(color: string, opacity: number, radius: number) {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  material.toneMapped = false;

  const mesh = new Mesh(new CircleGeometry(radius, 56), material);
  mesh.renderOrder = -80;
  return mesh;
}

export function buildStylizedSkySun() {
  const group = new Group();
  group.name = "stylized-sky-sun";
  group.renderOrder = -80;

  const outerGlow = makeSkySunCircle("#ffd66a", 0.16, 58);
  const warmHalo = makeSkySunCircle("#ffb94f", 0.16, 36);
  const disk = makeSkySunCircle("#ffd35f", 0.9, 24);
  const creamyCore = makeSkySunCircle("#fff2a3", 0.72, 13);

  group.add(outerGlow, warmHalo, disk, creamyCore);
  return group;
}

function createCloudPuffMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uSunDirView: { value: new Vector3(0, 1, 0) },
      uCameraPosition: { value: new Vector3() },
      uSunColor: { value: new Color("#fff0cf") },
      uCloudBright: { value: new Color("#f8feff") },
      uCloudShadow: { value: new Color("#c8d8e8") },
      uHorizonTint: { value: new Color("#f0e0d2") },
      uHorizonHaze: { value: new Color("#ddeef6") },
      uOpacity: { value: 0.48 },
      uTime: { value: 0 },
      uElevationMood: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aPuffPhase;
      attribute float aInterior;

      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vNormalWorld;
      varying vec3 vWorldPos;
      varying float vPuffPhase;
      varying float vInterior;

      void main() {
        vPuffPhase = aPuffPhase;
        vInterior = aInterior;
        vNormalView = normalize(normalMatrix * normal);
        vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 wPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = wPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirView;
      uniform vec3 uCameraPosition;
      uniform vec3 uSunColor;
      uniform vec3 uCloudBright;
      uniform vec3 uCloudShadow;
      uniform vec3 uHorizonTint;
      uniform vec3 uHorizonHaze;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uElevationMood;

      varying vec3 vNormalView;
      varying vec3 vViewDir;
      varying vec3 vNormalWorld;
      varying vec3 vWorldPos;
      varying float vPuffPhase;
      varying float vInterior;

      void main() {
        vec3 N = normalize(vNormalView);
        vec3 V = normalize(vViewDir);
        float ndotl = max(dot(N, normalize(uSunDirView)), 0.0);
        float wrap = 0.32 + 0.08 * uElevationMood;
        float diffuse = mix(wrap, 1.0, ndotl);

        // Per-puff / phase: subtle silver-lining variation (Ghibli billows).
        float phaseW = 0.91 + 0.09 * sin(uTime * 0.28 + vPuffPhase);
        float phaseLift = 0.04 * sin(uTime * 0.17 + vPuffPhase * 0.5);
        vec3 base = mix(uCloudShadow, uCloudBright, diffuse) * phaseW + vec3(phaseLift);
        vec3 sunMul = mix(vec3(1.0), uSunColor, 0.5 + 0.12 * (1.0 - uElevationMood));
        base *= sunMul;

        vec3 vWorld = normalize(vWorldPos - uCameraPosition);
        float viewHeight = vWorld.y;
        float nUp = max(vNormalWorld.y, 0.0);
        // Horizon: warmer / milkier on undersides; airy haze toward eye-level.
        float underbelly = 1.0 - nUp;
        float horizonView = 1.0 - abs(viewHeight);
        float hBlend = underbelly * (0.38 + 0.42 * horizonView) * (0.65 + 0.35 * (1.0 - uElevationMood));
        base = mix(base, uHorizonTint, hBlend * 0.5);
        base = mix(base, uHorizonHaze, smoothstep(0.12, 0.62, horizonView) * (0.12 + 0.14 * (1.0 - nUp)) * 0.85);

        // Fake inter-puff depth: darker in the cluster "core" + lower hemisphere = shelf shadow.
        float coreDark = 0.06 * vInterior * (0.5 + 0.5 * underbelly);
        float shelfAo = 1.0 - 0.16 * underbelly;
        base *= (0.9 + 0.1 * nUp) * (1.0 - coreDark) * mix(0.92, 1.0, shelfAo);
        // Soft cavity between lobes: lateral fold.
        float fold = abs(vNormalWorld.x) + abs(vNormalWorld.z);
        base *= 1.0 - 0.02 * smoothstep(0.2, 1.0, fold) * underbelly;

        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.55);
        base += vec3(1.0, 0.99, 0.97) * rim * (0.18 + 0.04 * (1.0 - uElevationMood));
        float alpha = uOpacity * (0.64 + 0.28 * rim + 0.2 * ndotl) * (0.95 + 0.05 * nUp);
        gl_FragColor = vec4(base, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
}

function setPuffAttributes(geometry: BufferGeometry, x: number, y: number, z: number, puffIndex: number) {
  const n = geometry.attributes.position.count;
  const phase = (puffIndex * 1.12 + x * 0.19 + y * 0.13 + z * 0.17) % 6.28318530718;
  const interior = MathUtils.clamp(Math.hypot(x, z) / 9.2, 0, 1);
  const aPhase = new Float32Array(n);
  const aInt = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    aPhase[i] = phase;
    aInt[i] = interior;
  }
  geometry.setAttribute("aPuffPhase", new BufferAttribute(aPhase, 1));
  geometry.setAttribute("aInterior", new BufferAttribute(aInt, 1));
}

function makeCloudCluster(position: Vector3, scale: number, puffMaterial: ShaderMaterial) {
  const group = new Group();
  const baseSphere = new SphereGeometry(1.2, 14, 12);

  const puffs: [number, number, number, number, number, number, number][] = [
    [0, 0, 0, 5.6, 2.5, 0.98, 1.72],
    [-6.8, 0.5, 0.6, 4.1, 2.0, 0.92, 1.4],
    [6.6, 0.35, -0.2, 4.4, 2.08, 0.94, 1.46],
    [-1.8, 2.4, 0.2, 3.1, 1.58, 0.88, 1.16],
    [3.6, 2.0, 0.5, 2.8, 1.5, 0.86, 1.12],
  ];

  // Second layer: very soft, dark shelf for depth (drawn under puffs; fake inter-lobe shadow).
  const shelfGeo = new SphereGeometry(1.0, 12, 10);
  const shelf = new Mesh(
    shelfGeo,
    new MeshBasicMaterial({
      color: 0xc8d5da,
      transparent: true,
      opacity: 0.035,
      depthWrite: false,
    }),
  );
  shelf.position.set(0, -1.4 * scale, 0.4);
  shelf.scale.set(scale * 11, scale * 0.9, scale * 6.2);
  shelf.renderOrder = -1;
  group.add(shelf);

  // Mid layer: hazy Ghibli-style mass behind the bright puffs (adds aerial perspective).
  const haze = new Mesh(
    baseSphere.clone(),
    new MeshBasicMaterial({
      color: 0xc5d2dc,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    }),
  );
  haze.position.set(2, 0.6, -4);
  haze.scale.set(scale * 5.2, scale * 2.2, scale * 3.2);
  haze.renderOrder = -1;
  group.add(haze);

  puffs.forEach(([x, y, z, size, sx, sy, sz], puffIndex) => {
    const geom = baseSphere.clone();
    setPuffAttributes(geom, x, y, z, puffIndex);
    const puff = new Mesh(geom, puffMaterial);
    puff.position.set(x, y, z);
    puff.scale.set(
      (size * sx) * scale,
      (size * sy) * scale,
      (size * sz) * scale,
    );
    group.add(puff);
  });

  group.position.copy(position);
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
    new Vector3(-132, 108, -102),
    new Vector3(164, 132, 18),
    new Vector3(148, 146, 154),
    new Vector3(-142, 152, 186),
  ];

  sets.forEach((position, index) => {
    const cluster = makeCloudCluster(position, 5.1 + index * 0.48, puffMaterial);
    cluster.rotation.y = index * 0.5 + 0.25;
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
        vec3 horizonColor = vec3(0.99, 0.972, 0.918);
        vec3 midColor = mix(vec3(0.695, 0.885, 0.948), vec3(0.62, 0.805, 0.935), mood);
        vec3 zenithColor = mix(vec3(0.495, 0.742, 0.935), vec3(0.42, 0.62, 0.92), mood);
        vec3 color = mix(horizonColor, midColor, smoothstep(-0.08, 0.18, dir.y));
        color = mix(color, zenithColor, smoothstep(0.22, 0.96, dir.y));

        vec3 sunDir = normalize(uSunDir);
        float sunDot = max(dot(dir, sunDir), 0.0);
        float sunBloom = pow(sunDot, 3.15);
        float sunCorona = pow(sunDot, 1.34) * (1.0 - pow(sunDot, 8.0) * 0.7);
        float sunDisk = smoothstep(0.982, 0.993, sunDot);
        float sunCore = smoothstep(0.993, 0.9985, sunDot);
        vec3 sunTint = uSunColor * 1.1;
        vec3 sunApricot = mix(vec3(1.0, 0.66, 0.25), sunTint, 0.48);
        vec3 sunCream = mix(vec3(1.0, 0.96, 0.66), sunTint, 0.58);
        vec3 coolBloom = vec3(0.52, 0.78, 0.92) * (0.075 + mood * 0.04);
        color += coolBloom * sunBloom;
        color += sunApricot * sunBloom * 0.28;
        color += mix(vec3(1.0, 0.82, 0.46), sunTint, 0.48) * sunCorona * 0.2;
        color = mix(color, sunApricot, sunDisk * 0.52);
        color = mix(color, sunCream, sunCore * 0.72);
        color += sunCream * sunCore * 0.28;

        vec2 skyUv = dir.xz * (2.05 / max(0.26, dir.y + 0.38));
        float highWisp = fbm(skyUv * vec2(0.72, 0.3) + vec2(8.0, 3.0));
        float veil = smoothstep(0.62, 0.82, highWisp) * smoothstep(0.12, 0.72, dir.y);
        vec3 veilColor = mix(vec3(0.9, 0.975, 0.995), vec3(1.0, 0.978, 0.895), 0.44 + sunBloom * 0.22);
        color = mix(color, veilColor, veil * 0.15);

        float horizonHaze = smoothstep(-0.14, 0.12, dir.y) * (1.0 - smoothstep(0.16, 0.44, dir.y));
        color = mix(color, vec3(0.945, 0.985, 0.955), horizonHaze * 0.26);

        float aquaLift = smoothstep(0.08, 0.72, dir.y) * (1.0 - smoothstep(0.76, 1.0, dir.y));
        color += vec3(0.085, 0.30, 0.255) * aquaLift * (0.062 - mood * 0.012);

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
  const cloudMat = clouds.userData.cloudMaterial as ShaderMaterial | undefined;
  if (cloudMat?.uniforms?.uSunDirView) {
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
  camera: Camera,
  elevationMood: number,
) {
  const mood = MathUtils.clamp(elevationMood, 0, 1);
  // The shader glow follows the world light; this disk is composed in sky-screen space
  // so the opening vista keeps a readable toy-like sun instead of losing it behind hills.
  _skySunPositionScratch.set(-0.78, 0.9, 0.5).unproject(camera);
  _sunDirScratch.subVectors(_skySunPositionScratch, camera.position).normalize();
  _skySunPositionScratch.copy(camera.position).addScaledVector(_sunDirScratch, 520);
  skySun.position.copy(_skySunPositionScratch);
  skySun.lookAt(camera.position);
  skySun.scale.setScalar(MathUtils.lerp(0.9, 0.76, mood));

  const outerGlow = skySun.children[0] as Mesh | undefined;
  const warmHalo = skySun.children[1] as Mesh | undefined;
  const disk = skySun.children[2] as Mesh | undefined;
  const creamyCore = skySun.children[3] as Mesh | undefined;
  const setOpacity = (mesh: Mesh | undefined, opacity: number) => {
    const material = mesh?.material;
    if (material instanceof MeshBasicMaterial) {
      material.opacity = opacity;
    }
  };

  setOpacity(outerGlow, MathUtils.lerp(0.18, 0.11, mood));
  setOpacity(warmHalo, MathUtils.lerp(0.16, 0.12, mood));
  setOpacity(disk, MathUtils.lerp(0.92, 0.82, mood));
  setOpacity(creamyCore, MathUtils.lerp(0.72, 0.58, mood));
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
