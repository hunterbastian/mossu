import {
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
  PointsMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { isInsideIslandPlayableBounds, sampleTerrainHeight, sampleTerrainNormal } from "../../simulation/world";
import { OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";

const immersionArt = OOT_PS2_GRASSLANDS_PALETTE.scene;
export const GRASSLAND_LIFE_SIGNAL_COUNT = 96;
export const DISTANT_BIRD_COUNT = 12;

export interface GrasslandImmersionSystem {
  group: Group;
  staticLayer: Group;
  dynamicLayer: Group;
  pollen: Points;
  lifeSignals: Points;
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

interface DistantBirdData {
  base: Float32Array;
  phase: Float32Array;
  radius: Float32Array;
  speed: Float32Array;
  scale: Float32Array;
}

const distantBirdUpdateRig = new Object3D();

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
    [-62, -128, 34, 16, 0.055, -0.22],
    [20, -78, 42, 18, 0.048, 0.18],
    [-28, -20, 46, 20, 0.052, -0.08],
    [42, 42, 38, 16, 0.044, 0.34],
    [-44, 92, 44, 18, 0.04, -0.3],
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
    shadow.userData.driftX = 8 + index * 2.4;
    shadow.userData.driftZ = 4 + index * 1.3;
    shadow.userData.driftSpeed = 0.018 + index * 0.002;
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

  const material = new PointsMaterial({
    size: 0.7,
    vertexColors: true,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    sizeAttenuation: true,
  });

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

  const material = new PointsMaterial({
    size: 0.42,
    vertexColors: true,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const signals = new Points(geometry, material);
  signals.name = "grassland-living-habitat-signals";
  signals.userData.lifeSignalData = { base, phase, kind } satisfies LifeSignalData;
  return signals;
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
  const distantBirds = buildDistantBirds();

  staticLayer.add(buildDistantTreeBelts());
  dynamicLayer.add(...cloudShadows, pollen, lifeSignals, distantBirds);
  group.add(staticLayer, dynamicLayer);

  return { group, staticLayer, dynamicLayer, pollen, lifeSignals, distantBirds, cloudShadows };
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

  const pollenData = system.pollen.userData.pollenData as PollenData | undefined;
  const positionAttr = system.pollen.geometry.getAttribute("position") as Float32BufferAttribute;
  if (pollenData) {
    for (let i = 0; i < pollenData.phase.length; i += 1) {
      const p = i * 3;
      const phase = pollenData.phase[i];
      positionAttr.setXYZ(
        i,
        pollenData.base[p] + Math.sin(elapsed * 0.2 + phase) * 1.8 + Math.sin(elapsed * 0.053 + i) * 0.8,
        pollenData.base[p + 1] + Math.sin(elapsed * 0.36 + phase * 1.4) * 0.42,
        pollenData.base[p + 2] + Math.cos(elapsed * 0.15 + phase) * 1.4,
      );
    }
    positionAttr.needsUpdate = true;
  }

  const pollenMaterial = system.pollen.material as PointsMaterial;
  pollenMaterial.opacity = 0.34 + Math.sin(elapsed * 0.13) * 0.04;

  const lifeData = system.lifeSignals.userData.lifeSignalData as LifeSignalData | undefined;
  const lifePositionAttr = system.lifeSignals.geometry.getAttribute("position") as Float32BufferAttribute;
  if (lifeData) {
    for (let i = 0; i < lifeData.phase.length; i += 1) {
      const p = i * 3;
      const phase = lifeData.phase[i];
      const signalKind = lifeData.kind[i];
      const hoverSpeed = signalKind === 1 ? 0.48 : signalKind === 2 ? 0.28 : 0.58;
      const flutter = signalKind === 1 ? 0.18 : signalKind === 2 ? 0.45 : 0.72;
      let x =
        lifeData.base[p] +
        Math.sin(elapsed * hoverSpeed + phase) * (signalKind === 1 ? 0.36 : 1.15) +
        Math.sin(elapsed * 1.8 + phase * 1.3) * flutter * 0.18;
      let y =
        lifeData.base[p + 1] +
        Math.sin(elapsed * (signalKind === 1 ? 1.4 : 1.05) + phase * 0.8) * (signalKind === 1 ? 0.06 : 0.32);
      let z = lifeData.base[p + 2] + Math.cos(elapsed * (hoverSpeed * 0.76) + phase) * (signalKind === 1 ? 0.26 : 0.82);

      if (playerPosition) {
        const dx = lifeData.base[p] - playerPosition.x;
        const dz = lifeData.base[p + 2] - playerPosition.z;
        const distance = Math.hypot(dx, dz);
        const proximity = 1 - MathUtils.smoothstep(distance, 8, 28);
        if (proximity > 0.001 && distance > 0.001) {
          const wake = proximity * (0.55 + lifeWake * 0.55);
          x += (dx / distance) * wake * (signalKind === 1 ? 0.18 : 1.6);
          z += (dz / distance) * wake * (signalKind === 1 ? 0.12 : 1.1);
          y += wake * (signalKind === 1 ? 0.08 : 0.72);
        }
      }

      lifePositionAttr.setXYZ(i, x, y, z);
    }
    lifePositionAttr.needsUpdate = true;
  }

  const lifeMaterial = system.lifeSignals.material as PointsMaterial;
  lifeMaterial.opacity = MathUtils.clamp(0.3 + Math.sin(elapsed * 0.2) * 0.04 + lifeWake * 0.08, 0.22, 0.48);

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
