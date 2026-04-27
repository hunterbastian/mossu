import {
  BackSide,
  Camera,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { scenicPockets } from "../../simulation/world";

const _sunDirScratch = new Vector3();
const _sunDirViewScratch = new Vector3();

function createCloudPuffMaterial() {
  return new ShaderMaterial({
    uniforms: {
      uSunDirView: { value: new Vector3(0, 1, 0) },
      uSunColor: { value: new Color("#fff0cf") },
      uCloudBright: { value: new Color("#f8feff") },
      uCloudShadow: { value: new Color("#c8d8e8") },
      uOpacity: { value: 0.94 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewDir;

      void main() {
        vNormalView = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirView;
      uniform vec3 uSunColor;
      uniform vec3 uCloudBright;
      uniform vec3 uCloudShadow;
      uniform float uOpacity;

      varying vec3 vNormalView;
      varying vec3 vViewDir;

      void main() {
        vec3 N = normalize(vNormalView);
        vec3 V = normalize(vViewDir);
        float ndotl = max(dot(N, normalize(uSunDirView)), 0.0);
        float wrap = 0.38;
        float diffuse = mix(wrap, 1.0, ndotl);
        vec3 base = mix(uCloudShadow, uCloudBright, diffuse);
        vec3 sunMul = mix(vec3(1.0), uSunColor, 0.55);
        base *= sunMul;
        float rim = pow(1.0 - max(dot(N, V), 0.0), 2.85);
        base += vec3(1.0, 0.99, 0.97) * rim * 0.2;
        float alpha = uOpacity * (0.68 + 0.26 * rim + 0.18 * ndotl);
        gl_FragColor = vec4(base, clamp(alpha, 0.0, 1.0));
      }
    `,
  });
}

function makeCloudCluster(position: Vector3, scale: number, puffMaterial: ShaderMaterial) {
  const group = new Group();
  const puffGeometry = new SphereGeometry(1.2, 14, 12);

  const puffs = [
    [0, 0, 0, 5.6, 2.5, 0.98, 1.72],
    [-6.8, 0.5, 0.6, 4.1, 2.0, 0.92, 1.4],
    [6.6, 0.35, -0.2, 4.4, 2.08, 0.94, 1.46],
    [-1.8, 2.4, 0.2, 3.1, 1.58, 0.88, 1.16],
    [3.6, 2.0, 0.5, 2.8, 1.5, 0.86, 1.12],
  ];

  puffs.forEach(([x, y, z, size, sx, sy, sz]) => {
    const puff = new Mesh(puffGeometry, puffMaterial);
    puff.position.set(x as number, y as number, z as number);
    puff.scale.set((size as number) * (sx as number) * scale, (size as number) * (sy as number) * scale, (size as number) * (sz as number) * scale);
    group.add(puff);
  });

  group.position.copy(position);
  return group;
}

function makeMistPuff(scale: number, color: string, opacity: number) {
  const puff = new Mesh(
    new SphereGeometry(1, 12, 10),
    new MeshLambertMaterial({
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
    new Vector3(22, 126, 24),
    new Vector3(148, 146, 154),
    new Vector3(-102, 152, 164),
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
        float sunBloom = pow(sunDot, 4.05);
        float sunCorona = pow(sunDot, 1.75) * (1.0 - pow(sunDot, 5.5) * 0.85);
        float sunCore = pow(sunDot, 28.0);
        vec3 sunTint = uSunColor * 1.08;
        vec3 coolBloom = vec3(0.52, 0.78, 0.92) * (0.1 + mood * 0.06);
        color += coolBloom * sunBloom;
        color += sunTint * sunBloom * 0.42;
        color += mix(vec3(1.0, 0.97, 0.88), sunTint, 0.65) * sunCorona * 0.14;
        color += mix(vec3(1.0, 0.98, 0.9), sunTint, 0.72) * sunCore * 0.5;

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
) {
  _sunDirScratch.subVectors(sun.position, sun.target.position).normalize();
  camera.updateMatrixWorld();
  const skyMat = skyDome.material;
  if (skyMat instanceof ShaderMaterial && skyMat.uniforms.uSunDir) {
    skyMat.uniforms.uSunDir.value.copy(_sunDirScratch);
    (skyMat.uniforms.uSunColor.value as Color).copy(sun.color);
    skyMat.uniforms.uElevationMood.value = MathUtils.clamp(elevationMood, 0, 1);
  }
  const cloudMat = clouds.userData.cloudMaterial as ShaderMaterial | undefined;
  if (cloudMat?.uniforms?.uSunDirView) {
    _sunDirViewScratch.copy(_sunDirScratch).transformDirection(camera.matrixWorldInverse);
    cloudMat.uniforms.uSunDirView.value.copy(_sunDirViewScratch);
    (cloudMat.uniforms.uSunColor.value as Color).copy(sun.color);
  }
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
