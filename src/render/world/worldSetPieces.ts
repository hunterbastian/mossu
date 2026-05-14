import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import {
  STARTING_WATER_POOLS,
  sampleBaseTerrainHeight,
  sampleIslandBoundaryPoint,
  sampleTerrainHeight,
  sampleTerrainNormal,
  startingLookTarget,
  startingPosition,
} from "../../simulation/world";
import { buildSmoothIslandUnderside } from "./floatingIslandGeometry";
import { markCameraCollider } from "./sceneHelpers";

export const ISLAND_EDGE_WATERFALL_TURNS = [
  0.02,
  0.055,
  0.1,
  0.16,
  0.24,
  0.35,
  0.46,
  0.52,
  0.58,
  0.66,
  0.765,
  0.78,
  0.88,
  0.93,
  0.965,
] as const;

export function buildOpeningNestVista() {
  const group = new Group();
  group.name = "opening-nest-vista";

  const forward = new Vector3().subVectors(startingLookTarget, startingPosition).setY(0).normalize();
  const right = new Vector3(forward.z, 0, -forward.x).normalize();
  const nestCenter = startingPosition.clone();
  nestCenter.y = sampleTerrainHeight(nestCenter.x, nestCenter.z);
  const terrainNormal = sampleTerrainNormal(nestCenter.x, nestCenter.z);
  const uphill = new Vector3(-terrainNormal.x, 0, -terrainNormal.z);
  if (uphill.lengthSq() < 0.001) {
    uphill.copy(right).multiplyScalar(-1);
  }
  uphill.normalize();
  const downhill = uphill.clone().multiplyScalar(-1);
  const rimSide = new Vector3(uphill.z, 0, -uphill.x).normalize();
  const trailForward = forward.clone().addScaledVector(downhill, 0.18).normalize();
  const trailRight = new Vector3(trailForward.z, 0, -trailForward.x).normalize();

  const nestFloorMaterial = new MeshLambertMaterial({
    color: "#b9a978",
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: DoubleSide,
  });
  const softLeafMaterial = new MeshLambertMaterial({ color: "#8fc86a" });
  const darkLeafMaterial = new MeshLambertMaterial({ color: "#6fa257" });
  const mossLeafMaterial = new MeshLambertMaterial({ color: "#b8d873" });
  const podRimMaterial = new MeshLambertMaterial({ color: "#a4bf75" });
  const podShadowMaterial = new MeshLambertMaterial({ color: "#6f844f" });
  const cushionMaterial = new MeshLambertMaterial({ color: "#d1e48d" });
  const seedPearlMaterial = new MeshStandardMaterial({
    color: "#fff1b8",
    emissive: "#ffd87a",
    emissiveIntensity: 0.1,
    roughness: 0.82,
    metalness: 0,
  });
  const dewMaterial = new MeshBasicMaterial({
    color: "#ecfbff",
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  const twigMaterial = new MeshLambertMaterial({ color: "#8a6a43" });
  const pebbleMaterial = new MeshStandardMaterial({ color: "#c8c3aa", roughness: 1, metalness: 0 });
  const flowerMaterial = new MeshBasicMaterial({ color: "#f7f4d6", transparent: true, opacity: 0.92 });
  const pollenMaterial = new MeshBasicMaterial({ color: "#ffd76a", transparent: true, opacity: 0.88 });
  const hearthGlowMaterial = new MeshBasicMaterial({
    color: "#ffe8a2",
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const liningPetalMaterial = new MeshLambertMaterial({ color: "#ead39a" });
  const warmLiningMaterial = new MeshLambertMaterial({ color: "#f3dfad" });
  const lanternSeedMaterial = new MeshBasicMaterial({
    color: "#ffd986",
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
  });
  const pressedGrassMaterial = new MeshLambertMaterial({
    color: "#9fb86a",
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
    side: DoubleSide,
  });
  const warmTreadMaterial = new MeshLambertMaterial({
    color: "#c7b879",
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: DoubleSide,
  });

  const floor = new Mesh(new CircleGeometry(1, 34), nestFloorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = Math.atan2(forward.x, forward.z) + 0.2;
  floor.position.set(nestCenter.x, nestCenter.y + 0.075, nestCenter.z);
  floor.scale.set(7.3, 4.7, 1);
  group.add(floor);

  const innerCup = new Mesh(new CircleGeometry(1, 30), podShadowMaterial);
  innerCup.rotation.x = -Math.PI / 2;
  innerCup.rotation.z = Math.atan2(forward.x, forward.z) + 0.24;
  innerCup.position.set(nestCenter.x + forward.x * 0.18, nestCenter.y + 0.096, nestCenter.z + forward.z * 0.18);
  innerCup.scale.set(4.45, 2.35, 1);
  innerCup.renderOrder = 1;
  group.add(innerCup);

  const hearthGlow = new Mesh(new CircleGeometry(1, 28), hearthGlowMaterial);
  hearthGlow.rotation.x = -Math.PI / 2;
  hearthGlow.rotation.z = Math.atan2(forward.x, forward.z) + 0.18;
  hearthGlow.position.set(nestCenter.x + forward.x * 0.16, nestCenter.y + 0.108, nestCenter.z + forward.z * 0.16);
  hearthGlow.scale.set(4.9, 2.58, 1);
  hearthGlow.renderOrder = 2;
  group.add(hearthGlow);

  const podRim = new Mesh(new TorusGeometry(1, 0.105, 8, 52), podRimMaterial);
  podRim.rotation.x = Math.PI / 2;
  podRim.rotation.z = Math.atan2(forward.x, forward.z) + 0.18;
  podRim.position.set(nestCenter.x, nestCenter.y + 0.2, nestCenter.z);
  podRim.scale.set(4.25, 2.55, 0.7);
  group.add(podRim);

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2 + 0.12;
    const frontBias = Math.max(0, Math.cos(angle - Math.atan2(forward.z, forward.x)));
    const ringRadius = 3.55 + (i % 3) * 0.12 - frontBias * 0.38;
    const x = nestCenter.x + Math.cos(angle) * ringRadius;
    const z = nestCenter.z + Math.sin(angle) * ringRadius;
    const y = sampleTerrainHeight(x, z);
    const rib = new Mesh(new CylinderGeometry(0.035, 0.055, 1.28 + (i % 3) * 0.14, 6), twigMaterial);
    rib.position.set(x, y + 0.28 + (i % 2) * 0.03, z);
    rib.rotation.set(
      0.15 * Math.sin(i * 1.4),
      angle + Math.PI / 2,
      Math.PI / 2 + 0.2 * Math.sin(i * 0.9),
    );
    group.add(rib);
  }

  for (let i = 0; i < 9; i += 1) {
    const angle = -1.95 + i * 0.48;
    const radius = 1.05 + (i % 3) * 0.18;
    const x = nestCenter.x + right.x * Math.sin(angle) * radius + forward.x * (0.1 + Math.cos(angle) * 0.72);
    const z = nestCenter.z + right.z * Math.sin(angle) * radius + forward.z * (0.1 + Math.cos(angle) * 0.72);
    const y = sampleTerrainHeight(x, z);
    const cushion = new Mesh(
      new SphereGeometry(1, 12, 8),
      i % 3 === 0 ? cushionMaterial : i % 2 === 0 ? mossLeafMaterial : softLeafMaterial,
    );
    cushion.position.set(x, y + 0.17 + (i % 3) * 0.018, z);
    cushion.rotation.y = Math.atan2(forward.x, forward.z) + angle * 0.22;
    cushion.scale.set(0.72 + (i % 4) * 0.08, 0.105, 0.42 + (i % 3) * 0.06);
    group.add(cushion);
  }

  for (let i = 0; i < 10; i += 1) {
    const lateral = (i - 4.5) * 0.32 + Math.sin(i * 1.7) * 0.08;
    const depth = -0.42 + Math.cos(i * 0.82) * 0.22 + (i % 2) * 0.12;
    const x = nestCenter.x + right.x * lateral + forward.x * depth;
    const z = nestCenter.z + right.z * lateral + forward.z * depth;
    const y = sampleTerrainHeight(x, z);
    const lining = new Mesh(new SphereGeometry(1, 10, 6), i % 3 === 0 ? warmLiningMaterial : liningPetalMaterial);
    lining.position.set(x, y + 0.15 + (i % 3) * 0.006, z);
    lining.rotation.set(
      0.03 * Math.sin(i),
      Math.atan2(forward.x, forward.z) + Math.sin(i * 1.3) * 0.14,
      0.04 * Math.cos(i),
    );
    lining.scale.set(0.38 + (i % 3) * 0.05, 0.035, 0.68 + (i % 2) * 0.08);
    group.add(lining);
  }

  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2 + Math.sin(i * 1.7) * 0.12;
    const ringRadius = 3.6 + (i % 5) * 0.28 + Math.sin(i * 2.31) * 0.34;
    const x = nestCenter.x + Math.cos(angle) * ringRadius + forward.x * Math.sin(i * 0.9) * 0.55;
    const z = nestCenter.z + Math.sin(angle) * ringRadius + forward.z * Math.sin(i * 0.9) * 0.55;
    const y = sampleTerrainHeight(x, z);
    const material = i % 5 === 0 ? mossLeafMaterial : i % 3 === 0 ? darkLeafMaterial : softLeafMaterial;
    const clump = new Mesh(new SphereGeometry(1, 10, 8), material);
    clump.position.set(x, y + 0.16 + (i % 4) * 0.018, z);
    clump.rotation.y = angle;
    clump.scale.set(0.8 + (i % 4) * 0.16, 0.12 + (i % 3) * 0.03, 0.32 + (i % 5) * 0.05);
    group.add(clump);
  }

  for (let i = 0; i < 18; i += 1) {
    const lateral = (i - 8.5) * 0.46 + Math.sin(i * 1.9) * 0.24;
    const depth = 3.35 + (i % 4) * 0.22 + Math.sin(i * 0.83) * 0.32;
    const x = nestCenter.x + uphill.x * depth + rimSide.x * lateral;
    const z = nestCenter.z + uphill.z * depth + rimSide.z * lateral;
    const y = sampleTerrainHeight(x, z);
    const material = i % 4 === 0 ? mossLeafMaterial : i % 3 === 0 ? darkLeafMaterial : softLeafMaterial;
    const backWall = new Mesh(new SphereGeometry(1, 10, 8), material);
    backWall.position.set(x, y + 0.26 + (i % 3) * 0.035, z);
    backWall.rotation.y = Math.atan2(rimSide.x, rimSide.z) + Math.sin(i * 1.1) * 0.18;
    backWall.scale.set(1.08 + (i % 3) * 0.18, 0.18 + (i % 4) * 0.025, 0.58 + (i % 5) * 0.08);
    group.add(backWall);
  }

  for (let i = 0; i < 13; i += 1) {
    const angle = (i / 13) * Math.PI * 2 + 0.28;
    const radius = 2.3 + (i % 4) * 0.42;
    const x = nestCenter.x + Math.cos(angle) * radius;
    const z = nestCenter.z + Math.sin(angle) * radius;
    const twig = new Mesh(new CylinderGeometry(0.045, 0.06, 1.25 + (i % 4) * 0.2, 6), twigMaterial);
    twig.position.set(x, sampleTerrainHeight(x, z) + 0.18, z);
    twig.rotation.set(0.06 * Math.sin(i), angle + Math.PI / 2, Math.PI / 2 + Math.sin(i * 0.8) * 0.18);
    group.add(twig);
  }

  for (let i = 0; i < 22; i += 1) {
    const angle = (i / 22) * Math.PI * 2 + Math.sin(i * 1.3) * 0.16;
    const radius = 2.55 + (i % 5) * 0.34;
    const x = nestCenter.x + Math.cos(angle) * radius + forward.x * 0.24;
    const z = nestCenter.z + Math.sin(angle) * radius + forward.z * 0.24;
    const y = sampleTerrainHeight(x, z);
    const pearl = new Mesh(new SphereGeometry(1, 8, 6), i % 3 === 0 ? seedPearlMaterial : dewMaterial);
    pearl.position.set(x, y + 0.24 + (i % 4) * 0.025, z);
    pearl.scale.setScalar(i % 3 === 0 ? 0.095 + (i % 2) * 0.02 : 0.055 + (i % 2) * 0.015);
    group.add(pearl);
  }

  for (let i = 0; i < 6; i += 1) {
    const side = i < 3 ? -1 : 1;
    const depth = 2.15 + (i % 3) * 0.44;
    const lateral = side * (1.95 + (i % 3) * 0.38);
    const x = nestCenter.x + uphill.x * depth + rimSide.x * lateral;
    const z = nestCenter.z + uphill.z * depth + rimSide.z * lateral;
    const y = sampleTerrainHeight(x, z);
    const stem = new Mesh(new ConeGeometry(0.035, 0.42 + (i % 2) * 0.05, 6), darkLeafMaterial);
    stem.position.set(x, y + 0.21, z);
    stem.rotation.z = side * (0.16 + (i % 2) * 0.04);
    group.add(stem);

    const seed = new Mesh(new SphereGeometry(1, 8, 6), lanternSeedMaterial);
    seed.position.set(x + rimSide.x * side * 0.04, y + 0.45 + (i % 2) * 0.035, z + rimSide.z * side * 0.04);
    seed.scale.setScalar(0.07 + (i % 3) * 0.012);
    group.add(seed);
  }

  for (let i = 0; i < 8; i += 1) {
    const side = i < 4 ? -1 : 1;
    const distance = 1.8 + (i % 4) * 0.78;
    const lateral = side * (2.7 + (i % 2) * 0.48);
    const x = nestCenter.x + forward.x * distance + right.x * lateral;
    const z = nestCenter.z + forward.z * distance + right.z * lateral;
    const y = sampleTerrainHeight(x, z);
    const sprout = new Mesh(new ConeGeometry(0.055, 0.68 + (i % 3) * 0.08, 6), darkLeafMaterial);
    sprout.position.set(x, y + 0.34, z);
    sprout.rotation.z = side * (0.22 + (i % 2) * 0.08);
    group.add(sprout);

    const leaf = new Mesh(new SphereGeometry(1, 8, 6), i % 2 === 0 ? mossLeafMaterial : softLeafMaterial);
    leaf.position.set(x + right.x * side * 0.14, y + 0.72 + (i % 2) * 0.04, z + right.z * side * 0.14);
    leaf.rotation.set(0.08, Math.atan2(forward.x, forward.z) + side * 0.28, side * 0.16);
    leaf.scale.set(0.28, 0.045, 0.18);
    group.add(leaf);
  }

  const exitMouth = new Mesh(new CircleGeometry(1, 20), warmTreadMaterial);
  exitMouth.rotation.x = -Math.PI / 2;
  exitMouth.rotation.z = Math.atan2(trailForward.x, trailForward.z);
  exitMouth.position.set(
    nestCenter.x + trailForward.x * 3.95,
    sampleTerrainHeight(nestCenter.x + trailForward.x * 3.95, nestCenter.z + trailForward.z * 3.95) + 0.08,
    nestCenter.z + trailForward.z * 3.95,
  );
  exitMouth.scale.set(3.3, 0.92, 1);
  exitMouth.renderOrder = 2;
  group.add(exitMouth);

  for (let i = 0; i < 13; i += 1) {
    const distance = 4.8 + i * 2.15;
    const lateral = Math.sin(i * 1.62) * 0.62 + (i % 2 === 0 ? -0.18 : 0.18);
    const x = nestCenter.x + trailForward.x * distance + trailRight.x * lateral;
    const z = nestCenter.z + trailForward.z * distance + trailRight.z * lateral;
    const y = sampleTerrainHeight(x, z);
    const patch = new Mesh(new CircleGeometry(1, 14), i % 3 === 0 ? warmTreadMaterial : pressedGrassMaterial);
    patch.position.set(x, y + 0.072, z);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = Math.atan2(trailForward.x, trailForward.z) + Math.sin(i * 0.91) * 0.18;
    patch.scale.set(1.9 + (i % 4) * 0.22, 0.66 + (i % 3) * 0.08, 1);
    patch.renderOrder = 1;
    group.add(patch);
  }

  for (let i = 0; i < 14; i += 1) {
    const distance = 6.2 + i * 2.6;
    const lateral = Math.sin(i * 1.42) * 1.4 + (i % 2 === 0 ? -0.28 : 0.28);
    const x = nestCenter.x + trailForward.x * distance + trailRight.x * lateral;
    const z = nestCenter.z + trailForward.z * distance + trailRight.z * lateral;
    const y = sampleTerrainHeight(x, z);
    const stone = new Mesh(new SphereGeometry(1, 10, 8), pebbleMaterial);
    stone.position.set(x, y + 0.11, z);
    stone.rotation.y = Math.sin(i * 2.1);
    stone.scale.set(0.38 + (i % 4) * 0.06, 0.1, 0.28 + (i % 3) * 0.05);
    group.add(stone);
  }

  for (let i = 0; i < 18; i += 1) {
    const distance = 9 + (i % 9) * 4.2;
    const side = i < 9 ? -1 : 1;
    const lateral = side * (3.3 + Math.sin(i * 1.37) * 1.2);
    const x = nestCenter.x + trailForward.x * distance + trailRight.x * lateral;
    const z = nestCenter.z + trailForward.z * distance + trailRight.z * lateral;
    const y = sampleTerrainHeight(x, z);
    const stem = new Mesh(new ConeGeometry(0.06, 0.62 + (i % 3) * 0.08, 6), mossLeafMaterial);
    stem.position.set(x, y + 0.3, z);
    stem.rotation.z = side * 0.12 + Math.sin(i) * 0.08;
    group.add(stem);

    if (i % 3 === 0) {
      const flower = new Mesh(new SphereGeometry(0.12, 8, 6), i % 2 === 0 ? flowerMaterial : pollenMaterial);
      flower.position.set(x, y + 0.72, z);
      flower.scale.set(1.2, 0.45, 1.2);
      group.add(flower);
    }
  }

  return group;
}

export function buildOpeningWaterComposition() {
  const group = new Group();
  group.name = "opening-water-composition";

  const dampMaterial = new MeshLambertMaterial({
    color: "#86a77b",
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
    side: DoubleSide,
  });
  const sandMaterial = new MeshLambertMaterial({
    color: "#d6c487",
    transparent: true,
    opacity: 0.66,
    depthWrite: false,
    side: DoubleSide,
  });
  const wetSandMaterial = new MeshLambertMaterial({
    color: "#9eb68b",
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: DoubleSide,
  });
  const reedMaterial = new MeshLambertMaterial({ color: "#6fa759", side: DoubleSide });
  const reedTipMaterial = new MeshLambertMaterial({ color: "#c89c58" });
  const stoneMaterial = new MeshStandardMaterial({ color: "#bfc5b2", roughness: 1, metalness: 0 });
  const lakeRockMaterial = new MeshStandardMaterial({ color: "#9e967f", roughness: 1, metalness: 0 });
  const lakeWetRockMaterial = new MeshStandardMaterial({ color: "#778476", roughness: 1, metalness: 0 });

  const patchGeometry = new CircleGeometry(1, 18);
  patchGeometry.rotateX(-Math.PI / 2);
  const reedGeometry = new ConeGeometry(0.08, 1, 6);
  const reedTipGeometry = new SphereGeometry(0.12, 8, 6);
  const stoneGeometry = new SphereGeometry(1, 10, 8);
  const lakeRockGeometry = new SphereGeometry(1, 7, 5);

  const addPatch = (material: MeshLambertMaterial, x: number, z: number, sx: number, sz: number, yaw: number) => {
    const patch = new Mesh(patchGeometry, material);
    patch.position.set(x, sampleTerrainHeight(x, z) + 0.066, z);
    patch.rotation.y = yaw;
    patch.scale.set(sx, 1, sz);
    patch.renderOrder = 1;
    group.add(patch);
  };

  const addReedCluster = (x: number, z: number, seed: number) => {
    const count = 3 + (seed % 3);
    for (let i = 0; i < count; i += 1) {
      const offsetX = Math.sin(seed * 1.7 + i * 2.1) * 0.42;
      const offsetZ = Math.cos(seed * 1.3 + i * 1.9) * 0.42;
      const reedX = x + offsetX;
      const reedZ = z + offsetZ;
      const height = 1.1 + ((seed + i) % 4) * 0.22;
      const reed = new Mesh(reedGeometry, reedMaterial);
      reed.position.set(reedX, sampleTerrainHeight(reedX, reedZ) + height * 0.5, reedZ);
      reed.rotation.z = Math.sin(seed + i) * 0.16;
      reed.scale.set(0.8, height, 0.8);
      group.add(reed);

      if ((seed + i) % 2 === 0) {
        const tip = new Mesh(reedTipGeometry, reedTipMaterial);
        tip.position.set(reedX, sampleTerrainHeight(reedX, reedZ) + height + 0.06, reedZ);
        tip.scale.set(0.68, 0.34, 0.68);
        group.add(tip);
      }
    }
  };

  const addLakeRock = (x: number, z: number, seed: number, scale = 1) => {
    const rock = new Mesh(lakeRockGeometry, seed % 3 === 0 ? lakeWetRockMaterial : lakeRockMaterial);
    rock.name = "great-lake-shore-rock";
    rock.position.set(x, sampleTerrainHeight(x, z) + 0.32 * scale, z);
    rock.rotation.set(Math.sin(seed * 1.7) * 0.18, seed * 0.71, Math.cos(seed * 1.3) * 0.2);
    rock.scale.set(
      scale * (1.4 + (seed % 5) * 0.22),
      scale * (0.34 + (seed % 4) * 0.08),
      scale * (0.88 + (seed % 6) * 0.16),
    );
    group.add(rock);
  };

  STARTING_WATER_POOLS.forEach((pool, poolIndex) => {
    const isMainLake = pool.id === "opening-lake";
    const isGreatLake = pool.id === "great-lake";
    const patchCount = isGreatLake ? 84 : isMainLake ? 48 : 18;
    for (let i = 0; i < patchCount; i += 1) {
      const angle = (i / patchCount) * Math.PI * 2 + Math.sin(i * 1.93 + poolIndex) * 0.08;
      const scallop = Math.sin(i * 2.37 + pool.x * 0.04 + pool.z * 0.02);
      const shoreScale = 0.96 + scallop * 0.06 + (i % 5) * 0.012;
      const edgeX = pool.x + Math.cos(angle) * pool.renderRadiusX * shoreScale;
      const edgeZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * shoreScale;
      const tangentYaw = -angle + Math.PI * 0.5;
      const longAxis = isGreatLake ? 5.6 + (i % 5) * 0.7 : isMainLake ? 3.6 + (i % 4) * 0.4 : 2.5 + (i % 3) * 0.34;
      const shortAxis = isGreatLake ? 1 + (i % 4) * 0.18 : isMainLake ? 0.8 + (i % 3) * 0.16 : 0.62 + (i % 2) * 0.16;
      addPatch(i % 4 === 0 ? wetSandMaterial : dampMaterial, edgeX, edgeZ, longAxis, shortAxis, tangentYaw);

      if ((isMainLake || isGreatLake) && (i % 6 === 0 || (i > 28 && i < 40 && i % 3 === 0))) {
        const sandX = pool.x + Math.cos(angle) * pool.renderRadiusX * (0.78 + scallop * 0.04);
        const sandZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * (0.78 + scallop * 0.04);
        addPatch(
          sandMaterial,
          sandX,
          sandZ,
          (isGreatLake ? 4.4 : 2.6) + (i % 5) * 0.3,
          (isGreatLake ? 0.82 : 0.62) + (i % 4) * 0.12,
          tangentYaw + 0.2,
        );
      }

      if ((isMainLake && i % 5 === 0) || (isGreatLake && i % 8 === 0) || (!isMainLake && !isGreatLake && i % 7 === 0)) {
        const reedX = pool.x + Math.cos(angle) * pool.renderRadiusX * 1.08;
        const reedZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * 1.08;
        addReedCluster(reedX, reedZ, i + poolIndex * 19);
      }

      if (isGreatLake && (i % 4 === 0 || (i > 54 && i < 72 && i % 3 === 0))) {
        const rockScale = 0.78 + (i % 7) * 0.09;
        const rockX = pool.x + Math.cos(angle) * pool.renderRadiusX * (1.02 + scallop * 0.08);
        const rockZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * (1.02 + scallop * 0.08);
        addLakeRock(rockX, rockZ, i + poolIndex * 31, rockScale);
        if (i % 12 === 0) {
          addLakeRock(
            pool.x + Math.cos(angle + 0.09) * pool.renderRadiusX * 0.92,
            pool.z + Math.sin(angle + 0.09) * pool.renderRadiusZ * 0.92,
            i + poolIndex * 37 + 5,
            rockScale * 0.7,
          );
        }
      }
    }
  });

  const forward = new Vector3().subVectors(startingLookTarget, startingPosition).setY(0).normalize();
  const right = new Vector3(forward.z, 0, -forward.x).normalize();
  for (let i = 0; i < 18; i += 1) {
    const distance = 22 + i * 4.2;
    const lateral = Math.sin(i * 1.41) * 4.6 + (i % 2 === 0 ? -2.2 : 2.2);
    const x = startingPosition.x + forward.x * distance + right.x * lateral;
    const z = startingPosition.z + forward.z * distance + right.z * lateral;
    const stone = new Mesh(stoneGeometry, stoneMaterial);
    stone.position.set(x, sampleTerrainHeight(x, z) + 0.13, z);
    stone.rotation.y = Math.sin(i * 1.9);
    stone.scale.set(0.52 + (i % 4) * 0.12, 0.12, 0.36 + (i % 3) * 0.08);
    group.add(stone);
  }

  return group;
}

export function buildShrine() {
  const shrine = new Group();
  const stoneMaterial = new MeshStandardMaterial({ color: "#f0e7ce", roughness: 1 });
  const mossMaterial = new MeshStandardMaterial({ color: "#8bb66f", roughness: 1 });
  const crownStoneMaterial = new MeshStandardMaterial({ color: "#fff4d6", roughness: 0.96 });
  const crownMossMaterial = new MeshStandardMaterial({ color: "#9bcf75", roughness: 1 });
  const crownGlowMaterial = new MeshBasicMaterial({
    color: "#fff6c7",
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const base = markCameraCollider(new Mesh(new CylinderGeometry(4.4, 5.6, 2.2, 7), stoneMaterial));
  const cap = markCameraCollider(new Mesh(new CylinderGeometry(3.5, 3.8, 3.2, 7), stoneMaterial));
  const moss = markCameraCollider(new Mesh(new CylinderGeometry(4.6, 4.4, 0.7, 7), mossMaterial));
  base.position.y = 1.1;
  cap.position.y = 3.6;
  moss.position.y = 2.2;

  const crown = new Group();
  crown.name = "moss-crown-destination-silhouette";
  const spires = [
    { angle: -0.92, radius: 3.35, height: 5.2, width: 0.48 },
    { angle: -0.42, radius: 3.8, height: 6.9, width: 0.56 },
    { angle: 0, radius: 4.05, height: 8.4, width: 0.62 },
    { angle: 0.42, radius: 3.8, height: 6.9, width: 0.56 },
    { angle: 0.92, radius: 3.35, height: 5.2, width: 0.48 },
  ] as const;
  spires.forEach(({ angle, radius, height, width }, index) => {
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius * 0.72;
    const pillar = markCameraCollider(
      new Mesh(new CylinderGeometry(width * 0.66, width, height, 7), crownStoneMaterial),
    );
    pillar.position.set(x, 4.25 + height * 0.5, z);
    pillar.rotation.z = -angle * 0.045;
    const mossCap = new Mesh(new CylinderGeometry(width * 1.16, width * 1.02, 0.32, 7), crownMossMaterial);
    mossCap.position.set(x, 4.25 + height + 0.16, z);
    const tip = new Mesh(new ConeGeometry(width * 1.08, 1.24 + index * 0.04, 7), crownStoneMaterial);
    tip.position.set(x, 4.25 + height + 0.88, z);
    crown.add(pillar, mossCap, tip);
  });
  const mossRing = new Mesh(new TorusGeometry(4.34, 0.15, 8, 48), crownMossMaterial);
  mossRing.rotation.x = Math.PI / 2;
  mossRing.position.y = 6.05;
  mossRing.scale.z = 0.72;
  const crownGlow = new Mesh(new CircleGeometry(5.8, 32), crownGlowMaterial);
  crownGlow.position.set(0, 8.4, -0.28);
  crownGlow.scale.set(1.25, 1, 1);
  crown.add(mossRing, crownGlow);

  shrine.add(base, cap, moss, crown);
  shrine.position.set(18, sampleTerrainHeight(18, 214), 214);
  return shrine;
}

export function buildShadowPockets() {
  const group = new Group();
  const geometry = new CircleGeometry(1, 30);
  const placements = [
    [-112, -112, 118, 30, 0.052, 0.18],
    [-22, -58, 136, 34, 0.045, -0.08],
    [58, 18, 114, 31, 0.042, 0.14],
    [-76, 78, 126, 34, 0.04, -0.24],
    [36, 132, 148, 42, 0.048, -0.18],
    [-20, 178, 132, 38, 0.043, 0.06],
    [34, 218, 110, 31, 0.038, -0.12],
    [-94, 208, 104, 28, 0.036, 0.22],
  ] as const;

  placements.forEach(([x, z, width, depth, opacity, rotation], index) => {
    const material = new MeshBasicMaterial({
      color: index > 3 ? "#4e604f" : "#566e55",
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
    });
    const patch = new Mesh(geometry.clone(), material);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rotation;
    patch.position.set(x, sampleTerrainHeight(x, z) + 0.09, z);
    patch.scale.set(width, depth, 1);
    patch.renderOrder = 1;
    patch.userData.baseX = x;
    patch.userData.baseZ = z;
    patch.userData.baseOpacity = opacity;
    patch.userData.baseRotation = rotation;
    patch.userData.drift = 38 + index * 4;
    patch.userData.speed = 0.0065 + index * 0.0011;
    patch.name = `moving-cloud-shadow-${index + 1}`;
    group.add(patch);
  });

  return group;
}

export function buildValleyMist() {
  const group = new Group();
  const patches = [
    [-54, -118, 54, 20, 3.6, 0.026, -0.08],
    [-8, -28, 112, 34, 7.2, 0.036, 0.04],
    [26, 72, 92, 26, 10.2, 0.03, -0.14],
    [18, 134, 84, 28, 13.4, 0.024, 0.1],
    [2, 158, 120, 32, 16.4, 0.03, 0.04],
    [-18, 190, 134, 40, 17, 0.034, -0.02],
    [-36, 222, 148, 34, 21, 0.024, -0.06],
  ] as const;

  patches.forEach(([x, z, width, depth, lift, opacity, rotation], index) => {
    const material = new MeshBasicMaterial({
      color: index < 2 ? "#effbf4" : "#eef8ff",
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
    });
    const mist = new Mesh(new PlaneGeometry(width, depth), material);
    mist.rotation.x = -Math.PI / 2;
    mist.rotation.z = rotation;
    mist.position.set(x, sampleTerrainHeight(x, z) + lift, z);
    mist.userData.baseX = x;
    mist.userData.baseZ = z;
    mist.userData.baseOpacity = opacity;
    group.add(mist);
  });

  return group;
}

export function buildFloatingIslandShell() {
  const group = new Group();
  group.name = "floating-island-shell";

  const undersideMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.99,
    metalness: 0.01,
    emissive: new Color("#343226"),
    emissiveIntensity: 0.1,
    vertexColors: true,
    side: DoubleSide,
  });
  const waterfallLipMaterial = new MeshStandardMaterial({ color: "#b2c58a", roughness: 0.96 });
  const mossMaterial = new MeshStandardMaterial({
    color: "#91b76d",
    roughness: 0.97,
    emissive: new Color("#2a351e"),
    emissiveIntensity: 0.12,
  });
  const perchedMossMaterial = new MeshStandardMaterial({ color: "#9cc978", roughness: 0.98 });
  const perchedTrunkMaterial = new MeshStandardMaterial({ color: "#6a543f", roughness: 0.98 });
  const perchedLeafMaterial = new MeshStandardMaterial({
    color: "#5f8a4d",
    roughness: 0.96,
    emissive: new Color("#24311f"),
    emissiveIntensity: 0.08,
  });
  const perchedLeafWarmMaterial = new MeshStandardMaterial({
    color: "#7fb95d",
    roughness: 0.96,
    emissive: new Color("#25361e"),
    emissiveIntensity: 0.08,
  });
  const hangMaterial = new MeshStandardMaterial({ color: "#65725f", roughness: 0.97 });
  const cliffStrataMaterial = new MeshStandardMaterial({ color: "#967954", roughness: 0.99 });
  const cliffHighlightMaterial = new MeshStandardMaterial({ color: "#dec486", roughness: 0.98 });
  const frontCliffFaceMaterial = new MeshStandardMaterial({
    color: "#a8875c",
    roughness: 0.99,
    emissive: new Color("#2d2419"),
    emissiveIntensity: 0.07,
  });
  const frontCliffWarmLipMaterial = new MeshStandardMaterial({
    color: "#d4bb7d",
    roughness: 0.98,
    emissive: new Color("#302515"),
    emissiveIntensity: 0.05,
  });
  const frontCliffShadowMaterial = new MeshStandardMaterial({
    color: "#80694b",
    roughness: 0.99,
    emissive: new Color("#211b14"),
    emissiveIntensity: 0.07,
  });
  const aerialCliffWallMaterial = new MeshStandardMaterial({
    color: "#9a8566",
    roughness: 0.99,
    emissive: new Color("#2b241c"),
    emissiveIntensity: 0.055,
  });
  const aerialCliffShadowMaterial = new MeshStandardMaterial({
    color: "#695e50",
    roughness: 1,
    emissive: new Color("#1d1b17"),
    emissiveIntensity: 0.075,
  });
  const aerialPathMaterial = new MeshBasicMaterial({
    color: "#caa45b",
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const aerialPathCoreMaterial = new MeshBasicMaterial({
    color: "#f1dea2",
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const surfFoamMaterial = new MeshBasicMaterial({
    color: "#f7fff1",
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const surfFoamBrightMaterial = new MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const surfBlueMaterial = new MeshBasicMaterial({
    color: "#92f4ec",
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const contactDarkWaterMaterial = new MeshBasicMaterial({
    color: "#064f72",
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const contactDeepWaterMaterial = new MeshBasicMaterial({
    color: "#032f54",
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const cliffShelfGeometry = new BoxGeometry(1, 1, 1);
  const aerialCliffWallGeometry = new BoxGeometry(1, 1, 1);
  const aerialPathGeometry = new CircleGeometry(1, 18);
  const surfFoamGeometry = new CircleGeometry(1, 24);
  const contactWaterGeometry = new CircleGeometry(1, 28);
  const perchedMossGeometry = new CircleGeometry(1, 18);
  const perchedTrunkGeometry = new CylinderGeometry(0.22, 0.34, 2.8, 5);
  const perchedPineGeometry = new ConeGeometry(1, 2.9, 7);
  const perchedRoundGeometry = new SphereGeometry(1, 7, 5);
  const perimeter: Vector3[] = [];
  const center = new Vector3();

  for (let i = 0; i < 28; i += 1) {
    const boundary = sampleIslandBoundaryPoint((i / 28) * Math.PI * 2);
    boundary.y = sampleBaseTerrainHeight(boundary.x, boundary.z) - 12;
    perimeter.push(boundary);
    center.add(boundary);
  }

  center.multiplyScalar(1 / perimeter.length);
  let radiusX = 0;
  let radiusZ = 0;
  let rimHeight = 0;
  perimeter.forEach((point) => {
    radiusX = Math.max(radiusX, Math.abs(point.x - center.x));
    radiusZ = Math.max(radiusZ, Math.abs(point.z - center.z));
    rimHeight += point.y;
  });
  rimHeight /= perimeter.length;

  const maxR = Math.max(radiusX, radiusZ);
  const smoothUnderside = new Mesh(buildSmoothIslandUnderside(center, rimHeight), undersideMaterial);
  smoothUnderside.name = "floating-island-smooth-underside";
  markCameraCollider(smoothUnderside);

  const mossBand = new Mesh(new CylinderGeometry(1, 0.93, 5, 40, 1, true), mossMaterial);
  mossBand.scale.set(radiusX * 1.01, 1, radiusZ * 1.03);
  mossBand.position.set(center.x, rimHeight - 24, center.z);
  markCameraCollider(mossBand);

  const mist1 = new Mesh(
    new CircleGeometry(maxR * 0.98, 56),
    new MeshBasicMaterial({
      color: "#d0e2ec",
      transparent: true,
      opacity: 0.038,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist1.rotation.x = -Math.PI / 2;
  mist1.position.set(center.x, rimHeight - 64, center.z);

  const mist2 = new Mesh(
    new CircleGeometry(maxR * 0.68, 48),
    new MeshBasicMaterial({
      color: "#bdd3dd",
      transparent: true,
      opacity: 0.024,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist2.rotation.x = -Math.PI / 2;
  mist2.position.set(center.x, rimHeight - 116, center.z);

  const mist3 = new Mesh(
    new CircleGeometry(maxR * 0.46, 40),
    new MeshBasicMaterial({
      color: "#aac1cb",
      transparent: true,
      opacity: 0.016,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist3.rotation.x = -Math.PI / 2;
  mist3.position.set(center.x, rimHeight - 168, center.z);

  group.add(smoothUnderside, mossBand, mist1, mist2, mist3);

  for (let i = 0; i < 34; i += 1) {
    const turn = i / 34 + 0.5 / 34;
    const angle = turn * Math.PI * 2 + Math.sin(i * 1.37) * 0.012;
    const point = sampleIslandBoundaryPoint(angle);
    const rimY = sampleBaseTerrainHeight(point.x, point.z);
    const frontWeight = Math.max(0, 1 - Math.abs(turn - 0.755) / 0.18);
    const sideWeight = Math.max(
      Math.max(0, 1 - Math.abs(turn - 0.5) / 0.16),
      Math.max(0, 1 - Math.abs(turn - 0.98) / 0.18),
    );
    const wallHeight = 78 + frontWeight * 72 + sideWeight * 28 + (i % 4) * 9;
    const wall = new Mesh(
      aerialCliffWallGeometry,
      (i + Math.floor(frontWeight * 2)) % 3 === 0 ? aerialCliffShadowMaterial : aerialCliffWallMaterial,
    );
    wall.name = `reference-aerial-sheer-cliff-wall-${i}`;
    wall.rotation.y = Math.PI / 2 - angle + Math.sin(i * 0.74) * 0.045;
    wall.rotation.z = Math.sin(i * 1.18) * 0.025;
    wall.scale.set(34 + frontWeight * 34 + sideWeight * 12 + (i % 5) * 4.8, wallHeight, 4.4 + frontWeight * 1.8);
    wall.position.set(
      point.x * 0.989 + center.x * 0.011,
      rimY - 38 - wallHeight * 0.5 - (i % 3) * 4,
      point.z * 0.989 + center.z * 0.011,
    );
    markCameraCollider(wall);
    group.add(wall);
  }

  for (let i = 0; i < 72; i += 1) {
    const tLoop = (i / 72) * Math.PI * 2;
    const radiusXLoop = 176 + Math.sin(tLoop * 3.0 + 0.8) * 8;
    const radiusZLoop = 101 + Math.cos(tLoop * 2.0 - 0.4) * 6;
    const x = 6 + Math.cos(tLoop) * radiusXLoop + Math.sin(tLoop * 2.0) * 5;
    const z = -62 + Math.sin(tLoop) * radiusZLoop + Math.cos(tLoop * 1.6) * 4;
    if (sampleTerrainNormal(x, z).y < 0.5) {
      continue;
    }
    const y = sampleTerrainHeight(x, z);
    const path = new Mesh(aerialPathGeometry, i % 3 === 0 ? aerialPathCoreMaterial : aerialPathMaterial);
    path.name = `reference-aerial-meadow-path-loop-${i}`;
    path.rotation.x = -Math.PI / 2;
    path.rotation.z = tLoop + Math.PI / 2 + Math.sin(i * 0.57) * 0.12;
    path.position.set(x, y + 0.42, z);
    path.scale.set(13.2 + Math.sin(i * 0.48) * 1.8, 4.7 + (i % 2) * 0.5, 1);
    path.renderOrder = 3;
    group.add(path);
  }

  for (let i = 0; i < 28; i += 1) {
    const turn = i / 28 + Math.sin(i * 1.13) * 0.004;
    const angle = turn * Math.PI * 2;
    const point = sampleIslandBoundaryPoint(angle);
    const frontWeight = Math.max(0, 1 - Math.abs(turn - 0.755) / 0.2);
    const sideBreak = 0.72 + (Math.sin(i * 2.31) * 0.5 + 0.5) * 0.28;
    if (i % 7 === 2 && frontWeight < 0.25 && sideBreak < 0.84) {
      continue;
    }
    const outwardScale = 1.018 + (i % 5) * 0.008 + frontWeight * 0.012;
    const contactWater = new Mesh(contactWaterGeometry, i % 4 === 1 ? contactDeepWaterMaterial : contactDarkWaterMaterial);
    contactWater.name = `reference-aerial-ocean-contact-dark-water-${i}`;
    contactWater.rotation.x = -Math.PI / 2;
    contactWater.rotation.z = angle + Math.PI / 2 + Math.sin(i * 0.61) * 0.18;
    contactWater.position.set(
      center.x + (point.x - center.x) * outwardScale,
      -351.2 + Math.sin(i * 0.37) * 0.75,
      center.z + (point.z - center.z) * outwardScale,
    );
    contactWater.scale.set(48 + (i % 6) * 11 + frontWeight * 30, 12 + (i % 4) * 3 + frontWeight * 5, 1);
    contactWater.renderOrder = 1;
    group.add(contactWater);
  }

  for (let i = 0; i < 48; i += 1) {
    const turn = i / 48 + Math.sin(i * 1.13) * 0.004;
    const angle = turn * Math.PI * 2;
    const point = sampleIslandBoundaryPoint(angle);
    const frontWeight = Math.max(0, 1 - Math.abs(turn - 0.755) / 0.2);
    const brokenBand = Math.sin(i * 1.87) * 0.5 + 0.5;
    if (i % 9 === 4 && frontWeight < 0.3 && brokenBand < 0.72) {
      continue;
    }
    const outwardScale = 1.036 + (i % 5) * 0.007 + frontWeight * 0.014;
    const foamMaterial = i % 5 === 0 ? surfBlueMaterial : i % 3 === 0 || frontWeight > 0.68 ? surfFoamBrightMaterial : surfFoamMaterial;
    const foam = new Mesh(surfFoamGeometry, foamMaterial);
    foam.name = `reference-aerial-ocean-contact-foam-${i}`;
    foam.rotation.x = -Math.PI / 2;
    foam.rotation.z = angle + Math.PI / 2 + Math.sin(i * 0.91) * 0.18;
    foam.position.set(
      center.x + (point.x - center.x) * outwardScale,
      -349 + Math.sin(i * 0.67) * 1.8,
      center.z + (point.z - center.z) * outwardScale,
    );
    foam.scale.set(
      38 + (i % 6) * 10 + Math.sin(i * 0.31) * 5 + frontWeight * 28,
      6.4 + (i % 4) * 1.6 + frontWeight * 3.2,
      1,
    );
    foam.renderOrder = 3;
    group.add(foam);
  }

  const addPerchedGrove = (
    turn: number,
    members: Array<[number, number, number, "pine" | "round"]>,
    groveScale = 1,
  ) => {
    const angle = turn * Math.PI * 2;
    const boundary = sampleIslandBoundaryPoint(angle);
    const inward = new Vector3(center.x - boundary.x, 0, center.z - boundary.z).normalize();
    const tangent = new Vector3(-inward.z, 0, inward.x);

    members.forEach(([sideOffset, inwardOffset, scale, kind], index) => {
      const x = boundary.x * 0.9 + center.x * 0.1 + tangent.x * sideOffset + inward.x * inwardOffset;
      const z = boundary.z * 0.9 + center.z * 0.1 + tangent.z * sideOffset + inward.z * inwardOffset;
      const normal = sampleTerrainNormal(x, z);
      if (normal.y < 0.48) {
        return;
      }
      const y = sampleTerrainHeight(x, z);
      const finalScale = scale * groveScale;
      const mossPatch = new Mesh(perchedMossGeometry, perchedMossMaterial);
      mossPatch.rotation.x = -Math.PI / 2;
      mossPatch.rotation.z = angle + index * 0.7;
      mossPatch.position.set(x, y + 0.055, z);
      mossPatch.scale.set(2.2 * finalScale, 1.18 * finalScale, 1);
      mossPatch.renderOrder = 1;

      const trunk = new Mesh(perchedTrunkGeometry, perchedTrunkMaterial);
      trunk.position.set(x, y + 1.35 * finalScale, z);
      trunk.rotation.z = Math.sin(angle + index) * 0.04;
      trunk.scale.set(finalScale, finalScale, finalScale);

      const leaf =
        kind === "pine"
          ? new Mesh(perchedPineGeometry, index % 2 === 0 ? perchedLeafMaterial : perchedLeafWarmMaterial)
          : new Mesh(perchedRoundGeometry, index % 2 === 0 ? perchedLeafWarmMaterial : perchedLeafMaterial);
      leaf.position.set(x, y + (kind === "pine" ? 3.05 : 2.98) * finalScale, z);
      leaf.scale.set(1.12 * finalScale, kind === "pine" ? 1.18 * finalScale : 0.78 * finalScale, 1.02 * finalScale);
      leaf.rotation.y = angle + index * 0.52;

      group.add(mossPatch, trunk, leaf);
    });
  };

  addPerchedGrove(0.06, [
    [-7.2, 24, 0.86, "round"],
    [0.5, 18, 0.72, "pine"],
    [7.6, 25, 0.66, "round"],
  ]);
  addPerchedGrove(0.31, [
    [-5.8, 22, 0.66, "pine"],
    [2.2, 17, 0.8, "pine"],
    [8.4, 26, 0.58, "round"],
  ]);
  addPerchedGrove(0.49, [
    [-8, 26, 0.7, "round"],
    [0.2, 19, 0.62, "pine"],
    [7.6, 24, 0.74, "round"],
  ]);
  addPerchedGrove(0.73, [
    [-6.4, 20, 0.64, "pine"],
    [1.4, 15, 0.56, "round"],
    [6.8, 23, 0.68, "pine"],
  ]);
  addPerchedGrove(0.92, [
    [-5.6, 22, 0.7, "round"],
    [2.2, 17, 0.64, "round"],
    [8.2, 25, 0.58, "pine"],
  ]);

  for (let i = 0; i < 36; i += 1) {
    const angle = (i / 36) * Math.PI * 2 + Math.sin(i * 1.7) * 0.018;
    const point = sampleIslandBoundaryPoint(angle);
    const rimY = sampleBaseTerrainHeight(point.x, point.z);
    const band = new Mesh(cliffShelfGeometry, i % 4 === 1 ? cliffHighlightMaterial : cliffStrataMaterial);
    band.name = `island-cliff-strata-${i}`;
    band.rotation.y = Math.PI / 2 - angle + Math.sin(i * 0.73) * 0.08;
    band.rotation.z = Math.sin(i * 0.91) * 0.025;
    band.scale.set(15.8 + (i % 5) * 4.3, 1.35 + (i % 3) * 0.44, 1.08);
    band.position.set(
      point.x * 0.992 + center.x * 0.008,
      rimY - 18 - (i % 7) * 8.4,
      point.z * 0.992 + center.z * 0.008,
    );
    markCameraCollider(band);
    group.add(band);
  }

  [0.675, 0.705, 0.735, 0.765, 0.795, 0.825].forEach((turn, index) => {
    const angle = turn * Math.PI * 2;
    const point = sampleIslandBoundaryPoint(angle);
    const rimY = sampleBaseTerrainHeight(point.x, point.z);
    const shelf = new Mesh(cliffShelfGeometry, index % 2 === 0 ? frontCliffWarmLipMaterial : cliffHighlightMaterial);
    shelf.name = `island-front-concept-cliff-shelf-${index}`;
    shelf.rotation.y = Math.PI / 2 - angle + Math.sin(index * 0.8) * 0.075;
    shelf.rotation.z = Math.sin(index * 1.37) * 0.045;
    shelf.scale.set(23 + Math.sin(index * 1.4) * 4 + (index === 2 || index === 3 ? 10 : 0), 1.15, 1.25);
    shelf.position.set(
      point.x * 0.98 + center.x * 0.02,
      rimY - 34 - (index % 3) * 14,
      point.z * 0.98 + center.z * 0.02,
    );
    markCameraCollider(shelf);
    group.add(shelf);
  });

  [0.692, 0.72, 0.748, 0.776, 0.804, 0.832].forEach((turn, index) => {
    const angle = turn * Math.PI * 2;
    const point = sampleIslandBoundaryPoint(angle);
    const rimY = sampleBaseTerrainHeight(point.x, point.z);
    const heroFaceWeight = Math.max(0, 1 - Math.abs(turn - 0.765) / 0.07);
    for (let level = 0; level < 3; level += 1) {
      const face =
        level === 0
          ? new Mesh(cliffShelfGeometry, frontCliffWarmLipMaterial)
          : new Mesh(cliffShelfGeometry, (index + level) % 2 === 0 ? frontCliffFaceMaterial : frontCliffShadowMaterial);
      face.name = `island-front-layered-cliff-face-${index}-${level}`;
      face.rotation.y = Math.PI / 2 - angle + Math.sin(index * 0.76 + level) * 0.045;
      face.rotation.z = Math.sin(index * 1.23 + level * 0.6) * 0.065;
      face.scale.set(
        18 + level * 5.8 + heroFaceWeight * 17 + (index % 2) * 3.6,
        2.1 + level * 1.15 + heroFaceWeight * 1.6,
        1.45 + level * 0.24,
      );
      face.position.set(
        point.x * (0.976 - level * 0.008) + center.x * (0.024 + level * 0.008),
        rimY - 50 - level * 24 - (index % 3) * 6,
        point.z * (0.976 - level * 0.008) + center.z * (0.024 + level * 0.008),
      );
      markCameraCollider(face);
      group.add(face);
    }
  });

  for (let h = 0; h < 10; h += 1) {
    const ang = (h / 10) * Math.PI * 2 + 0.41;
    const hang = new Mesh(new ConeGeometry(1.2 + (h % 3) * 0.74, 7 + (h % 4) * 2.8, 5), hangMaterial);
    hang.position.set(
      center.x + Math.cos(ang) * radiusX * 0.84,
      rimHeight - 28 - (h % 3) * 4.2,
      center.z + Math.sin(ang) * radiusZ * 0.84,
    );
    hang.rotation.set(Math.PI, 0, -ang);
    markCameraCollider(hang);
    group.add(hang);
  }

  const waterfallMaterial = new MeshBasicMaterial({
    color: "#dff8ff",
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    side: DoubleSide,
  });
  const waterfallCoreMaterial = new MeshBasicMaterial({
    color: "#fbfff4",
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    side: DoubleSide,
  });
  const heroWaterfallMaterial = new MeshBasicMaterial({
    color: "#e7fbff",
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: DoubleSide,
  });
  const heroWaterfallCoreMaterial = new MeshBasicMaterial({
    color: "#fffff1",
    transparent: true,
    opacity: 0.21,
    depthWrite: false,
    side: DoubleSide,
  });
  const waterfallMistMaterial = new MeshBasicMaterial({
    color: "#e9fbff",
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const waterfallAirMistMaterial = new MeshBasicMaterial({
    color: "#ecffff",
    transparent: true,
    opacity: 0.046,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const waterfallImpactMistMaterial = new MeshBasicMaterial({
    color: "#f4ffff",
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const underShoreMistMaterial = new MeshBasicMaterial({
    color: "#dff7f4",
    transparent: true,
    opacity: 0.048,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  const underShoreMistGeometry = new CircleGeometry(1, 24);

  for (let i = 0; i < 18; i += 1) {
    const turn = i / 18 + Math.sin(i * 1.83) * 0.004;
    const angle = turn * Math.PI * 2;
    const point = sampleIslandBoundaryPoint(angle);
    const mist = new Mesh(underShoreMistGeometry, underShoreMistMaterial);
    mist.name = `island-under-shoreline-mist-${i}`;
    mist.rotation.x = -Math.PI / 2;
    mist.rotation.z = angle + Math.PI / 2 + Math.sin(i * 1.19) * 0.16;
    mist.position.set(
      point.x * 0.92 + center.x * 0.08,
      rimHeight - 238 - (i % 5) * 5.5,
      point.z * 0.92 + center.z * 0.08,
    );
    mist.scale.set(27 + (i % 4) * 7, 7 + (i % 3) * 1.7, 1);
    mist.renderOrder = 2;
    group.add(mist);
  }

  ISLAND_EDGE_WATERFALL_TURNS.forEach((turn, index) => {
    const angle = turn * Math.PI * 2;
    const point = sampleIslandBoundaryPoint(angle);
    const rimY = sampleBaseTerrainHeight(point.x, point.z) - 32 - (index % 3) * 4;
    const isFrontHero = turn >= 0.72 && turn <= 0.805;
    const heroCenterWeight = isFrontHero ? Math.max(0, 1 - Math.abs(turn - 0.765) / 0.045) : 0;
    const isSideAccent = turn < 0.07 || (turn >= 0.45 && turn <= 0.54) || turn > 0.92;
    const width =
      3.8 +
      (index % 4) * 1.35 +
      (index % 5 === 0 ? 1.6 : 0) +
      (isFrontHero ? 24.5 + heroCenterWeight * 22.2 + (index % 2) * 3.2 : 0) +
      (isSideAccent ? 1.25 : 0);
    const height =
      58 +
      (index % 5) * 14 +
      (index % 3 === 1 ? 26 : 0) +
      (isFrontHero ? 170 + heroCenterWeight * 92 + (index % 2) * 24 : 0) +
      (isSideAccent ? 22 : 0);
    const ledge = new Mesh(cliffShelfGeometry, index % 3 === 0 ? mossMaterial : waterfallLipMaterial);
    ledge.name = `island-edge-waterfall-lip-${index}`;
    ledge.rotation.y = Math.PI / 2 - angle + Math.sin(index * 1.1) * 0.06;
    ledge.scale.set(width * 1.42, 1.15, 5.2 + (index % 3) * 0.55);
    ledge.position.set(
      point.x * 0.987 + center.x * 0.013,
      rimY + 4.8,
      point.z * 0.987 + center.z * 0.013,
    );
    const veil = new Mesh(new PlaneGeometry(width, height, 1, isFrontHero ? 12 : 8), isFrontHero ? heroWaterfallMaterial : waterfallMaterial);
    veil.name = `island-edge-waterfall-${index}`;
    veil.rotation.y = Math.PI / 2 - angle + Math.sin(index * 1.3) * 0.07;
    veil.position.set(
      point.x * 0.992 + center.x * 0.008,
      rimY - height * 0.48,
      point.z * 0.992 + center.z * 0.008,
    );
    const core = new Mesh(
      new PlaneGeometry(width * (isFrontHero ? 0.46 : 0.36), height * 0.9, 1, isFrontHero ? 12 : 8),
      isFrontHero ? heroWaterfallCoreMaterial : waterfallCoreMaterial,
    );
    core.rotation.copy(veil.rotation);
    core.position.copy(veil.position);
    core.position.y += height * 0.02;
    const lowerMist = new Mesh(new CircleGeometry(width * 1.72, 18), waterfallMistMaterial);
    lowerMist.name = `island-edge-waterfall-mist-${index}`;
    lowerMist.rotation.x = -Math.PI / 2;
    lowerMist.position.set(
      point.x * 0.95 + center.x * 0.05,
      rimY - height * 0.96,
      point.z * 0.95 + center.z * 0.05,
    );
    const lowerFallY = rimY - height * 0.96;
    const impactY = Math.max(-346, Math.min(lowerFallY - 18, rimHeight - 292 - (index % 4) * 7));
    const driftHeight = Math.max(18, lowerFallY - impactY);
    const airDrift = new Mesh(new PlaneGeometry(width * 1.45, driftHeight, 1, 2), waterfallAirMistMaterial);
    airDrift.name = `island-edge-waterfall-air-mist-${index}`;
    airDrift.rotation.copy(veil.rotation);
    airDrift.position.set(
      point.x * 0.9 + center.x * 0.1,
      impactY + driftHeight * 0.5,
      point.z * 0.9 + center.z * 0.1,
    );
    airDrift.renderOrder = 3;

    const impactMist = new Mesh(new CircleGeometry(1, 22), waterfallImpactMistMaterial);
    impactMist.name = `island-edge-waterfall-impact-mist-${index}`;
    impactMist.rotation.x = -Math.PI / 2;
    impactMist.rotation.z = angle + Math.PI / 2;
    impactMist.position.set(
      point.x * 0.84 + center.x * 0.16,
      impactY - 2.5,
      point.z * 0.84 + center.z * 0.16,
    );
    impactMist.scale.set(width * 3.9, width * 1.35, 1);
    impactMist.renderOrder = 4;
    if (isFrontHero) {
      ledge.scale.x *= 1.36;
      ledge.scale.z *= 1.24;
      veil.renderOrder = 5;
      core.renderOrder = 6;
      lowerMist.renderOrder = 5;
      airDrift.renderOrder = 6;
      impactMist.scale.x *= 1.62;
      impactMist.scale.y *= 1.28;
    }

    group.add(ledge, veil, core, lowerMist, airDrift, impactMist);
  });

  return group;
}

export function buildDistantFloatingIslands() {
  const group = new Group();
  group.name = "distant-floating-islands";

  const grassMaterial = new MeshBasicMaterial({ color: "#95ba6c", fog: true });
  const cliffMaterial = new MeshBasicMaterial({ color: "#9a9078", fog: true });
  const shadowMaterial = new MeshBasicMaterial({
    color: "#9aa68c",
    fog: true,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const treeMaterial = new MeshBasicMaterial({ color: "#477042", fog: true });
  const silhouetteMaterial = new MeshBasicMaterial({
    color: "#6f8ea0",
    fog: true,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });
  const hazeSilhouetteMaterial = new MeshBasicMaterial({
    color: "#8bb9c5",
    fog: true,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  const mistMaterial = new MeshBasicMaterial({
    color: "#d5ecf5",
    fog: true,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: DoubleSide,
  });
  const placements = [
    [-1840, 520, 88, 42, 0.18, 0],
    [-1360, 980, 58, 24, -0.32, 1],
    [-760, 1540, 44, 12, 0.42, 2],
    [160, 1780, 38, 8, -0.18, 2],
    [720, 1480, 76, 34, 0.08, 0],
    [1460, 940, 62, 28, -0.44, 1],
    [1940, 460, 92, 48, -0.12, 0],
    [1180, -1320, 42, 12, 0.32, 2],
    [-1220, -1420, 48, 16, -0.28, 2],
    [2140, -260, 34, 2, 0.26, 2],
    [-2160, -160, 32, 0, -0.36, 2],
  ] as const;

  placements.forEach(([x, z, radius, lift, yaw, distantTier], index) => {
    const island = new Group();
    island.name = `distant-floating-island-${index}`;
    const y = 148 + lift + index * 4;
    const isFaint = distantTier > 0;
    const isHazeTiny = distantTier > 1;
    const islandMaterial = isHazeTiny ? hazeSilhouetteMaterial : isFaint ? silhouetteMaterial : grassMaterial;
    const rockMaterial = isHazeTiny ? hazeSilhouetteMaterial : isFaint ? silhouetteMaterial : cliffMaterial;
    const top = new Mesh(new CylinderGeometry(1, 0.92, 8, 18, 1), islandMaterial);
    top.scale.set(radius, isHazeTiny ? 0.72 : 1, radius * (0.62 + (index % 2) * 0.16));
    top.rotation.y = yaw;
    top.position.y = y;
    const cliff = new Mesh(new ConeGeometry(1, 44 + radius * 0.25, 18), rockMaterial);
    cliff.scale.set(radius * 0.82, 1, radius * 0.52);
    cliff.rotation.y = yaw;
    cliff.position.y = y - 24;
    const shadow = new Mesh(new ConeGeometry(1, 54 + radius * 0.18, 18), shadowMaterial);
    shadow.scale.set(radius * (isHazeTiny ? 0.38 : 0.56), 1, radius * (isHazeTiny ? 0.26 : 0.36));
    shadow.rotation.y = yaw;
    shadow.position.y = y - 52;
    const mist = new Mesh(new CircleGeometry(radius * 1.18, 24), mistMaterial);
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = y - 8;
    island.add(top, cliff, shadow, mist);

    const treeCount = isHazeTiny ? 0 : isFaint ? 1 : 3;
    for (let tree = 0; tree < treeCount; tree += 1) {
      const angle = yaw + tree * 2.1 + index * 0.4;
      const trunk = new Mesh(new CylinderGeometry(0.55, 0.78, 7, 6), rockMaterial);
      trunk.position.set(Math.cos(angle) * radius * 0.24, y + 5.4, Math.sin(angle) * radius * 0.18);
      const crown = new Mesh(new ConeGeometry(4.4, 11, 8), isFaint ? silhouetteMaterial : treeMaterial);
      crown.position.copy(trunk.position);
      crown.position.y += 8.2;
      island.add(trunk, crown);
    }

    island.position.set(x, 0, z);
    group.add(island);
  });

  return group;
}
