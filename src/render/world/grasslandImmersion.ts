import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { isInsideIslandPlayableBounds, sampleTerrainHeight, sampleTerrainNormal } from "../../simulation/world";
import { OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";

const immersionArt = OOT_PS2_GRASSLANDS_PALETTE.scene;
export const GRASSLAND_LIFE_SIGNAL_COUNT = 96;
export const DISTANT_BIRD_COUNT = 12;
const LEAF_GLINT_COUNT = 72;

export interface GrasslandImmersionSystem {
  group: Group;
  staticLayer: Group;
  dynamicLayer: Group;
  pollen: Points;
  lifeSignals: Points;
  leafGlints: Points;
  distantBirds: InstancedMesh;
  cloudShadows: Mesh[];
}

interface PollenData {
  base: Float32Array;
  phase: Float32Array;
}

interface LifeSignalData {
  base: Float32Array;
  phase: Float32Array;
  kind: Float32Array;
}

interface LeafGlintData {
  base: Float32Array;
  phase: Float32Array;
  warmth: Float32Array;
}

type ImmersionPointLayer = "pollen" | "life" | "glint";

interface DistantBirdData {
  base: Float32Array;
  phase: Float32Array;
  radius: Float32Array;
  speed: Float32Array;
  scale: Float32Array;
}

const distantBirdUpdateRig = new Object3D();

const IMMERSION_POINT_LAYER_ID: Record<ImmersionPointLayer, number> = {
  pollen: 0,
  life: 1,
  glint: 2,
};

function seededUnit(seed: number) {
  return MathUtils.euclideanModulo(Math.sin(seed * 127.1 + 37.7) * 43758.5453123, 1);
}

function canPlaceGroundAccent(x: number, z: number, maxSlope = 0.42) {
  if (!isInsideIslandPlayableBounds(x, z)) {
    return false;
  }

  const slope = 1 - sampleTerrainNormal(x, z).y;
  return slope <= maxSlope;
}

function buildImmersionPointMaterial({
  layer,
  size,
  opacity,
  additive = false,
}: {
  layer: ImmersionPointLayer;
  size: number;
  opacity: number;
  additive?: boolean;
}) {
  return new ShaderMaterial({
    name: `mossu-${layer}-gpu-point-material`,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    ...(additive ? { blending: AdditiveBlending } : {}),
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opacity },
      uSize: { value: size },
      uLayer: { value: IMMERSION_POINT_LAYER_ID[layer] },
      uLifeWake: { value: 0 },
      uHasPlayer: { value: 0 },
      uPlayerPosition: { value: new Vector3() },
    },
    vertexShader: `
      attribute vec3 aBase;
      attribute float aPhase;
      attribute float aKind;
      attribute float aWarmth;

      uniform float uTime;
      uniform float uOpacity;
      uniform float uSize;
      uniform float uLayer;
      uniform float uLifeWake;
      uniform float uHasPlayer;
      uniform vec3 uPlayerPosition;

      varying vec3 vColor;
      varying float vAlpha;
      varying float vLayer;
      varying float vSpark;

      float saturate(float value) {
        return clamp(value, 0.0, 1.0);
      }

      void main() {
        vec3 pos = aBase;
        float alphaPulse = 1.0;
        float sizePulse = 1.0;
        float spark = 0.0;

        if (uLayer < 0.5) {
          pos.x += sin(uTime * 0.2 + aPhase) * 1.8 + sin(uTime * 0.053 + aPhase * 1.7) * 0.8;
          pos.y += sin(uTime * 0.36 + aPhase * 1.4) * 0.42;
          pos.z += cos(uTime * 0.15 + aPhase) * 1.4;
          alphaPulse = 0.82 + sin(uTime * 0.13 + aPhase * 0.4) * 0.1;
          sizePulse = 0.9 + sin(uTime * 0.28 + aPhase) * 0.08;
        } else if (uLayer < 1.5) {
          float hoverSpeed = mix(0.58, 0.48, step(0.5, aKind));
          hoverSpeed = mix(hoverSpeed, 0.28, step(1.5, aKind));
          float flutter = mix(0.72, 0.18, step(0.5, aKind));
          flutter = mix(flutter, 0.45, step(1.5, aKind));
          pos.x += sin(uTime * hoverSpeed + aPhase) * mix(1.15, 0.36, step(0.5, aKind));
          pos.x += sin(uTime * 1.8 + aPhase * 1.3) * flutter * 0.18;
          pos.y += sin(uTime * mix(1.05, 1.4, step(0.5, aKind)) + aPhase * 0.8) * mix(0.32, 0.06, step(0.5, aKind));
          pos.z += cos(uTime * hoverSpeed * 0.76 + aPhase) * mix(0.82, 0.26, step(0.5, aKind));

          if (uHasPlayer > 0.5) {
            vec2 away = aBase.xz - uPlayerPosition.xz;
            float distanceToPlayer = length(away);
            float proximity = 1.0 - smoothstep(8.0, 28.0, distanceToPlayer);
            if (proximity > 0.001 && distanceToPlayer > 0.001) {
              float wake = proximity * (0.55 + uLifeWake * 0.55);
              vec2 direction = away / distanceToPlayer;
              pos.x += direction.x * wake * mix(1.6, 0.18, step(0.5, aKind));
              pos.z += direction.y * wake * mix(1.1, 0.12, step(0.5, aKind));
              pos.y += wake * mix(0.72, 0.08, step(0.5, aKind));
            }
          }

          alphaPulse = 0.86 + sin(uTime * 0.2 + aPhase * 0.6) * 0.12 + uLifeWake * 0.18;
          sizePulse = 0.92 + sin(uTime * 1.1 + aPhase) * 0.12;
        } else {
          float flicker = max(0.0, sin(uTime * (0.72 + aWarmth * 0.42) + aPhase));
          pos.x += sin(uTime * 0.22 + aPhase) * 0.54;
          pos.y += flicker * 0.16 + sin(uTime * 0.44 + aPhase * 1.3) * 0.1;
          pos.z += cos(uTime * 0.18 + aPhase) * 0.42;
          spark = flicker;
          alphaPulse = 0.5 + flicker * 0.85 + uLifeWake * 0.2;
          sizePulse = 0.72 + flicker * 0.58;
        }

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = uSize * sizePulse * (320.0 / max(18.0, -mvPosition.z));

        float cameraFade = 1.0 - smoothstep(210.0, 360.0, -mvPosition.z);
        float playerFade = 1.0;
        if (uHasPlayer > 0.5 && uLayer > 1.5) {
          playerFade = 1.0 - smoothstep(128.0, 230.0, length(aBase.xz - uPlayerPosition.xz));
        }

        vColor = color * (1.0 + spark * 0.24);
        vAlpha = uOpacity * alphaPulse * cameraFade * playerFade;
        vLayer = uLayer;
        vSpark = spark;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vLayer;
      varying float vSpark;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float radius = length(centered) * 2.0;
        float disc = smoothstep(1.0, 0.18, radius);
        float core = smoothstep(0.42, 0.0, radius);
        float cross = max(
          smoothstep(0.12, 0.0, abs(centered.x)) * smoothstep(0.52, 0.0, abs(centered.y)),
          smoothstep(0.12, 0.0, abs(centered.y)) * smoothstep(0.52, 0.0, abs(centered.x))
        );
        float shape = vLayer > 1.5 ? max(core, cross * (0.42 + vSpark * 0.58)) : disc;
        float alpha = vAlpha * shape;
        if (alpha < 0.01) {
          discard;
        }

        gl_FragColor = vec4(vColor * (1.0 + core * 0.2 + vSpark * 0.18), alpha);
      }
    `,
  });
}

function addGpuPointAttributes(
  geometry: BufferGeometry,
  base: Float32Array,
  phase: Float32Array,
  kind?: Float32Array,
  warmth?: Float32Array,
) {
  const count = phase.length;
  geometry.setAttribute("aBase", new Float32BufferAttribute(base, 3));
  geometry.setAttribute("aPhase", new Float32BufferAttribute(phase, 1));
  geometry.setAttribute("aKind", new Float32BufferAttribute(kind ?? new Float32Array(count), 1));
  geometry.setAttribute("aWarmth", new Float32BufferAttribute(warmth ?? new Float32Array(count), 1));
}

function updateImmersionPointMaterial(
  points: Points,
  elapsed: number,
  opacity: number,
  lifeWake = 0,
  playerPosition?: Vector3,
) {
  const material = points.material;
  if (!(material instanceof ShaderMaterial)) {
    return;
  }

  material.uniforms.uTime.value = elapsed;
  material.uniforms.uOpacity.value = opacity;
  material.uniforms.uLifeWake.value = lifeWake;
  if (playerPosition) {
    material.uniforms.uHasPlayer.value = 1;
    (material.uniforms.uPlayerPosition.value as Vector3).copy(playerPosition);
  } else {
    material.uniforms.uHasPlayer.value = 0;
  }
}

function makeDistantTree(scale: number, leafColor: string, trunkColor: string) {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.12 * scale, 0.18 * scale, 1.45 * scale, 5),
    new MeshLambertMaterial({ color: trunkColor }),
  );
  trunk.position.y = 0.72 * scale;
  group.add(trunk);

  const crown = new Mesh(new SphereGeometry(1, 8, 6), new MeshLambertMaterial({ color: leafColor }));
  crown.position.y = 1.7 * scale;
  crown.scale.set(1.0 * scale, 0.78 * scale, 0.88 * scale);
  group.add(crown);

  const cap = new Mesh(new SphereGeometry(1, 8, 6), new MeshLambertMaterial({ color: leafColor }));
  cap.position.set(-0.26 * scale, 2.16 * scale, 0.04 * scale);
  cap.scale.set(0.68 * scale, 0.46 * scale, 0.58 * scale);
  group.add(cap);

  return group;
}

function makeDistantPine(scale: number, leafColor: string, trunkColor: string) {
  const group = new Group();
  const trunk = new Mesh(
    new CylinderGeometry(0.1 * scale, 0.14 * scale, 1.4 * scale, 5),
    new MeshLambertMaterial({ color: trunkColor }),
  );
  trunk.position.y = 0.7 * scale;
  group.add(trunk);

  const lower = new Mesh(
    new ConeGeometry(0.92 * scale, 1.72 * scale, 7),
    new MeshLambertMaterial({ color: leafColor }),
  );
  lower.position.y = 1.55 * scale;
  group.add(lower);

  const upper = new Mesh(
    new ConeGeometry(0.62 * scale, 1.32 * scale, 7),
    new MeshLambertMaterial({ color: leafColor }),
  );
  upper.position.y = 2.32 * scale;
  group.add(upper);

  return group;
}

function buildDistantTreeBelts() {
  const group = new Group();
  group.name = "grassland-distant-tree-belts";

  const placements = [
    [-144, -132, 0.95, "round"],
    [-164, -104, 0.82, "round"],
    [-154, -70, 0.74, "round"],
    [126, -126, 0.72, "round"],
    [152, -94, 0.84, "round"],
    [138, -56, 0.78, "round"],
    [-172, -24, 0.82, "pine"],
    [-148, 18, 0.9, "round"],
    [156, -10, 0.88, "pine"],
    [136, 36, 0.8, "round"],
    [-132, 74, 0.92, "pine"],
    [126, 92, 0.98, "pine"],
  ] as const;

  placements.forEach(([x, z, scale, kind], index) => {
    if (!canPlaceGroundAccent(x, z, 0.5)) {
      return;
    }

    const leafColor =
      index % 4 === 0
        ? immersionArt.immersionDistantLeafDeep
        : index % 3 === 0
          ? immersionArt.immersionDistantLeafB
          : immersionArt.immersionDistantLeafA;
    const tree =
      kind === "pine"
        ? makeDistantPine(scale * 2.85, leafColor, immersionArt.immersionDistantTrunk)
        : makeDistantTree(scale * 2.65, leafColor, immersionArt.immersionDistantTrunk);
    tree.position.set(x, sampleTerrainHeight(x, z), z);
    tree.rotation.y = seededUnit(index + x * 0.1) * Math.PI * 2;
    group.add(tree);
  });

  return group;
}

function buildCloudShadowPatches() {
  const shadows: Mesh[] = [];
  const placements = [
    [-72, -132, 42, 17, 0.052, -0.22],
    [20, -84, 50, 19, 0.045, 0.18],
    [-34, -24, 54, 21, 0.049, -0.08],
    [44, 42, 46, 17, 0.04, 0.34],
    [-52, 96, 52, 19, 0.037, -0.3],
    [38, 128, 48, 17, 0.034, 0.16],
  ] as const;

  placements.forEach(([x, z, radiusX, radiusZ, opacity, rotation], index) => {
    if (!canPlaceGroundAccent(x, z, 0.72)) {
      return;
    }

    const material = new MeshBasicMaterial({
      color: index % 2 === 0 ? "#71856a" : "#6c8069",
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
    });
    const shadow = new Mesh(new CircleGeometry(1, 34), material);
    shadow.name = `moving-cloud-shadow-${index}`;
    shadow.rotation.x = -Math.PI / 2;
    shadow.rotation.z = rotation;
    shadow.scale.set(radiusX, radiusZ, 1);
    shadow.position.set(x, sampleTerrainHeight(x, z) + 0.075 + index * 0.002, z);
    shadow.renderOrder = 1;
    shadow.userData.baseX = x;
    shadow.userData.baseZ = z;
    shadow.userData.baseOpacity = opacity;
    shadow.userData.driftX = 13 + index * 2.2;
    shadow.userData.driftZ = 6 + index * 1.2;
    shadow.userData.driftSpeed = 0.007 + index * 0.0012;
    shadows.push(shadow);
  });

  return shadows;
}

function buildPollenMotes() {
  const count = 170;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const color = new Color();
  const colors = new Float32Array(count * 3);
  const warm = new Color(immersionArt.immersionPollen);
  const cool = new Color(immersionArt.immersionPollenCool);

  for (let i = 0; i < count; i += 1) {
    const lane = i % 5;
    const x = MathUtils.lerp(-108, 96, seededUnit(i * 3.3 + 4)) + Math.sin(i * 1.9) * 9;
    const z = MathUtils.lerp(-166, 118, seededUnit(i * 4.7 + 8)) + (lane === 0 ? 42 : 0);
    const y = sampleTerrainHeight(x, z) + 2.3 + seededUnit(i * 2.1 + 11) * 7.2;
    const p = i * 3;
    base[p] = x;
    base[p + 1] = y;
    base[p + 2] = z;
    positions[p] = x;
    positions[p + 1] = y;
    positions[p + 2] = z;
    phase[i] = seededUnit(i * 5.9 + 2) * Math.PI * 2;
    color.copy(warm).lerp(cool, seededUnit(i * 7.2 + 1) * 0.42);
    colors[p] = color.r;
    colors[p + 1] = color.g;
    colors[p + 2] = color.b;
  }

  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  pointGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  addGpuPointAttributes(pointGeometry, base, phase);

  const material = buildImmersionPointMaterial({ layer: "pollen", size: 0.72, opacity: 0.34 });

  const pollen = new Points(pointGeometry, material);
  pollen.name = "grassland-drifting-pollen";
  pollen.userData.pollenData = { base, phase } satisfies PollenData;
  return pollen;
}

function buildLifeSignals() {
  const count = GRASSLAND_LIFE_SIGNAL_COUNT;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const kind = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const color = new Color();
  const warmWing = new Color("#fff0ac");
  const coolWing = new Color("#cceeff");
  const waterGlint = new Color("#bdfaff");
  const shrineGlow = new Color("#e8ddff");
  const anchors = [
    [-92, -136, 0],
    [-62, -128, 0],
    [-34, -112, 1],
    [8, 22, 1],
    [28, 88, 0],
    [42, 134, 1],
    [16, 186, 2],
    [2, 214, 2],
  ] as const;

  for (let i = 0; i < count; i += 1) {
    const anchor = anchors[i % anchors.length];
    const spreadX = anchor[2] === 1 ? 22 : anchor[2] === 2 ? 18 : 26;
    const spreadZ = anchor[2] === 1 ? 14 : anchor[2] === 2 ? 12 : 18;
    const x = anchor[0] + (seededUnit(i * 4.3 + 8) - 0.5) * spreadX + Math.sin(i * 1.71) * 2.6;
    const z = anchor[1] + (seededUnit(i * 3.7 + 3) - 0.5) * spreadZ + Math.cos(i * 1.33) * 2.2;
    const signalKind = anchor[2];
    const y =
      sampleTerrainHeight(x, z) +
      (signalKind === 1 ? 0.48 + seededUnit(i * 2.2 + 5) * 0.22 : 1.05 + seededUnit(i * 2.2 + 5) * 1.6);
    const p = i * 3;
    base[p] = x;
    base[p + 1] = y;
    base[p + 2] = z;
    positions[p] = x;
    positions[p + 1] = y;
    positions[p + 2] = z;
    phase[i] = seededUnit(i * 6.9 + 4) * Math.PI * 2;
    kind[i] = signalKind;

    if (signalKind === 1) {
      color.copy(waterGlint).lerp(warmWing, seededUnit(i * 1.8 + 11) * 0.18);
    } else if (signalKind === 2) {
      color.copy(shrineGlow).lerp(warmWing, seededUnit(i * 2.4 + 9) * 0.28);
    } else {
      color.copy(warmWing).lerp(coolWing, seededUnit(i * 2.9 + 7) * 0.34);
    }
    colors[p] = color.r;
    colors[p + 1] = color.g;
    colors[p + 2] = color.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  addGpuPointAttributes(geometry, base, phase, kind);

  const material = buildImmersionPointMaterial({ layer: "life", size: 0.48, opacity: 0.32, additive: true });

  const signals = new Points(geometry, material);
  signals.name = "grassland-living-habitat-signals";
  signals.userData.lifeSignalData = { base, phase, kind } satisfies LifeSignalData;
  return signals;
}

function buildLeafGlints() {
  const count = LEAF_GLINT_COUNT;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const warmth = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const color = new Color();
  const sunGold = new Color("#fff4a8");
  const skySilver = new Color("#d8fbff");
  const leafGreen = new Color("#c5ef7a");
  const anchors = [
    [-118, -144, 3.8, 22],
    [-42, -138, 3.2, 24],
    [18, -146, 3.3, 18],
    [-44, 30, 3.6, 20],
    [54, 28, 3.2, 18],
    [-28, 86, 4.2, 18],
    [36, 118, 4.8, 16],
    [4, 196, 5.2, 14],
  ] as const;

  for (let i = 0; i < count; i += 1) {
    const anchor = anchors[i % anchors.length];
    const spread = anchor[3];
    const x = anchor[0] + (seededUnit(i * 3.4 + 9) - 0.5) * spread + Math.sin(i * 1.31) * 2.4;
    const z = anchor[1] + (seededUnit(i * 4.1 + 5) - 0.5) * spread * 0.62 + Math.cos(i * 1.77) * 1.6;
    const y = sampleTerrainHeight(x, z) + anchor[2] + seededUnit(i * 2.3 + 7) * 3.4;
    const p = i * 3;
    base[p] = x;
    base[p + 1] = y;
    base[p + 2] = z;
    positions[p] = x;
    positions[p + 1] = y;
    positions[p + 2] = z;
    phase[i] = seededUnit(i * 5.6 + 2) * Math.PI * 2;
    warmth[i] = seededUnit(i * 7.1 + 4);

    color.copy(skySilver).lerp(sunGold, warmth[i] * 0.66).lerp(leafGreen, seededUnit(i * 2.7 + 13) * 0.2);
    colors[p] = color.r;
    colors[p + 1] = color.g;
    colors[p + 2] = color.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  addGpuPointAttributes(geometry, base, phase, undefined, warmth);

  const material = buildImmersionPointMaterial({ layer: "glint", size: 0.92, opacity: 0.2, additive: true });

  const glints = new Points(geometry, material);
  glints.name = "grassland-leaf-and-water-glints";
  glints.userData.leafGlintData = { base, phase, warmth } satisfies LeafGlintData;
  return glints;
}

function buildDistantBirdGeometry() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [0, 0.05, 0, -1.22, 0.22, 0, -0.24, -0.1, 0, 0, 0.05, 0, 1.22, 0.22, 0, 0.24, -0.1, 0],
      3,
    ),
  );
  return geometry;
}

function buildDistantBirds() {
  const count = DISTANT_BIRD_COUNT;
  const geometry = buildDistantBirdGeometry();
  const material = new MeshBasicMaterial({
    color: "#52674f",
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: DoubleSide,
  });
  const birds = new InstancedMesh(geometry, material, count);
  birds.name = "grassland-distant-birds";
  birds.frustumCulled = false;
  birds.renderOrder = 3;

  const base = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const radius = new Float32Array(count);
  const speed = new Float32Array(count);
  const scale = new Float32Array(count);
  const flockAnchors = [
    [-136, -184, 54],
    [118, -118, 66],
    [-98, 28, 72],
    [112, 134, 86],
  ] as const;
  const rig = new Object3D();

  for (let i = 0; i < count; i += 1) {
    const anchor = flockAnchors[i % flockAnchors.length];
    const p = i * 3;
    base[p] = anchor[0] + (seededUnit(i * 4.7 + 2) - 0.5) * 24;
    base[p + 1] = anchor[2] + seededUnit(i * 5.1 + 9) * 14;
    base[p + 2] = anchor[1] + (seededUnit(i * 3.8 + 5) - 0.5) * 22;
    phase[i] = seededUnit(i * 2.9 + 7) * Math.PI * 2;
    radius[i] = 18 + seededUnit(i * 6.4 + 3) * 28;
    speed[i] = 0.026 + seededUnit(i * 3.1 + 11) * 0.028;
    scale[i] = 0.72 + seededUnit(i * 8.2 + 4) * 0.48;

    rig.position.set(base[p], base[p + 1], base[p + 2]);
    rig.rotation.set(-0.18, phase[i], Math.sin(phase[i]) * 0.08);
    rig.scale.setScalar(scale[i]);
    rig.updateMatrix();
    birds.setMatrixAt(i, rig.matrix);
  }
  birds.instanceMatrix.needsUpdate = true;
  birds.userData.distantBirdData = { base, phase, radius, speed, scale } satisfies DistantBirdData;
  return birds;
}

export function buildGrasslandImmersionSystem(): GrasslandImmersionSystem {
  const group = new Group();
  group.name = "grassland-immersion";
  const staticLayer = new Group();
  staticLayer.name = "grassland-immersion-static";
  const dynamicLayer = new Group();
  dynamicLayer.name = "grassland-immersion-dynamic";
  const cloudShadows = buildCloudShadowPatches();
  const pollen = buildPollenMotes();
  const lifeSignals = buildLifeSignals();
  const leafGlints = buildLeafGlints();
  const distantBirds = buildDistantBirds();

  staticLayer.add(buildDistantTreeBelts());
  dynamicLayer.add(...cloudShadows, pollen, lifeSignals, leafGlints, distantBirds);
  group.add(staticLayer, dynamicLayer);

  return { group, staticLayer, dynamicLayer, pollen, lifeSignals, leafGlints, distantBirds, cloudShadows };
}

export function updateGrasslandImmersionSystem(
  system: GrasslandImmersionSystem,
  elapsed: number,
  mapLookdown: boolean,
  playerPosition?: Vector3,
  lifeWake = 0,
) {
  system.group.visible = !mapLookdown;
  if (mapLookdown) {
    return;
  }

  updateImmersionPointMaterial(system.pollen, elapsed, 0.34 + Math.sin(elapsed * 0.13) * 0.04, lifeWake, playerPosition);
  updateImmersionPointMaterial(
    system.lifeSignals,
    elapsed,
    MathUtils.clamp(0.3 + Math.sin(elapsed * 0.2) * 0.04 + lifeWake * 0.08, 0.22, 0.48),
    lifeWake,
    playerPosition,
  );
  updateImmersionPointMaterial(
    system.leafGlints,
    elapsed,
    MathUtils.clamp(0.16 + Math.max(0, Math.sin(elapsed * 0.38)) * 0.08 + lifeWake * 0.05, 0.12, 0.34),
    lifeWake,
    playerPosition,
  );

  const birdData = system.distantBirds.userData.distantBirdData as DistantBirdData | undefined;
  if (birdData) {
    const rig = distantBirdUpdateRig;
    for (let i = 0; i < birdData.phase.length; i += 1) {
      const p = i * 3;
      const phase = birdData.phase[i];
      const travel = elapsed * birdData.speed[i] + phase;
      const wingBeat = Math.sin(elapsed * (1.9 + birdData.speed[i] * 24) + phase);
      const radius = birdData.radius[i];
      const x = birdData.base[p] + Math.sin(travel) * radius + Math.sin(elapsed * 0.07 + phase * 1.7) * 5.2;
      const y = birdData.base[p + 1] + Math.sin(elapsed * 0.16 + phase) * 3.4 + Math.max(0, wingBeat) * 0.45;
      const z = birdData.base[p + 2] + Math.cos(travel * 0.82) * radius * 0.48;
      const yaw = travel + Math.PI * 0.54;
      const birdScale = birdData.scale[i] * (1 + wingBeat * 0.08);
      rig.position.set(x, y, z);
      rig.rotation.set(-0.14 + Math.sin(travel * 1.3) * 0.04, yaw, wingBeat * 0.11);
      rig.scale.set(birdScale * (1 + wingBeat * 0.1), birdScale * (1 - wingBeat * 0.18), birdScale);
      rig.updateMatrix();
      system.distantBirds.setMatrixAt(i, rig.matrix);
    }
    system.distantBirds.instanceMatrix.needsUpdate = true;
    const birdMaterial = system.distantBirds.material as MeshBasicMaterial;
    birdMaterial.opacity = 0.28 + Math.sin(elapsed * 0.045) * 0.04;
  }

  system.cloudShadows.forEach((shadow, index) => {
    const baseX = (shadow.userData.baseX as number | undefined) ?? shadow.position.x;
    const baseZ = (shadow.userData.baseZ as number | undefined) ?? shadow.position.z;
    const driftX = (shadow.userData.driftX as number | undefined) ?? 5;
    const driftZ = (shadow.userData.driftZ as number | undefined) ?? 3;
    const driftSpeed = (shadow.userData.driftSpeed as number | undefined) ?? 0.02;
    shadow.position.x = baseX + Math.sin(elapsed * driftSpeed + index * 1.6) * driftX;
    shadow.position.z = baseZ + Math.cos(elapsed * driftSpeed * 0.84 + index * 1.1) * driftZ;
    shadow.position.y = sampleTerrainHeight(shadow.position.x, shadow.position.z) + 0.08;
    const material = shadow.material as MeshBasicMaterial;
    material.opacity =
      ((shadow.userData.baseOpacity as number | undefined) ?? 0.1) *
      (0.5 + Math.sin(elapsed * 0.12 + index * 0.9) * 0.14);
  });

  system.staticLayer.children.forEach((belt: Object3D, beltIndex: number) => {
    belt.children.forEach((tree, index) => {
      tree.rotation.z = Math.sin(elapsed * 0.32 + index * 0.8 + beltIndex) * 0.008;
    });
  });
}
