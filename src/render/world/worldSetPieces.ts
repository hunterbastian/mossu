import {
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
import { markCameraCollider } from "./sceneHelpers";

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
  const twigMaterial = new MeshLambertMaterial({ color: "#8a6a43" });
  const pebbleMaterial = new MeshStandardMaterial({ color: "#c8c3aa", roughness: 1, metalness: 0 });
  const flowerMaterial = new MeshBasicMaterial({ color: "#f7f4d6", transparent: true, opacity: 0.92 });
  const pollenMaterial = new MeshBasicMaterial({ color: "#ffd76a", transparent: true, opacity: 0.88 });
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
  floor.scale.set(6.6, 4.15, 1);
  group.add(floor);

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

  const patchGeometry = new CircleGeometry(1, 18);
  patchGeometry.rotateX(-Math.PI / 2);
  const reedGeometry = new ConeGeometry(0.08, 1, 6);
  const reedTipGeometry = new SphereGeometry(0.12, 8, 6);
  const stoneGeometry = new SphereGeometry(1, 10, 8);

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

  STARTING_WATER_POOLS.forEach((pool, poolIndex) => {
    const isMainLake = pool.id === "opening-lake";
    const patchCount = isMainLake ? 48 : 18;
    for (let i = 0; i < patchCount; i += 1) {
      const angle = (i / patchCount) * Math.PI * 2 + Math.sin(i * 1.93 + poolIndex) * 0.08;
      const scallop = Math.sin(i * 2.37 + pool.x * 0.04 + pool.z * 0.02);
      const shoreScale = 0.96 + scallop * 0.06 + (i % 5) * 0.012;
      const edgeX = pool.x + Math.cos(angle) * pool.renderRadiusX * shoreScale;
      const edgeZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * shoreScale;
      const tangentYaw = -angle + Math.PI * 0.5;
      const longAxis = isMainLake ? 3.6 + (i % 4) * 0.4 : 2.5 + (i % 3) * 0.34;
      const shortAxis = isMainLake ? 0.8 + (i % 3) * 0.16 : 0.62 + (i % 2) * 0.16;
      addPatch(i % 4 === 0 ? wetSandMaterial : dampMaterial, edgeX, edgeZ, longAxis, shortAxis, tangentYaw);

      if (isMainLake && (i % 6 === 0 || (i > 28 && i < 40 && i % 3 === 0))) {
        const sandX = pool.x + Math.cos(angle) * pool.renderRadiusX * (0.78 + scallop * 0.04);
        const sandZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * (0.78 + scallop * 0.04);
        addPatch(sandMaterial, sandX, sandZ, 2.6 + (i % 5) * 0.3, 0.62 + (i % 4) * 0.12, tangentYaw + 0.2);
      }

      if ((isMainLake && i % 5 === 0) || (!isMainLake && i % 7 === 0)) {
        const reedX = pool.x + Math.cos(angle) * pool.renderRadiusX * 1.08;
        const reedZ = pool.z + Math.sin(angle) * pool.renderRadiusZ * 1.08;
        addReedCluster(reedX, reedZ, i + poolIndex * 19);
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
  const base = markCameraCollider(new Mesh(new CylinderGeometry(4.4, 5.6, 2.2, 7), stoneMaterial));
  const cap = markCameraCollider(new Mesh(new CylinderGeometry(3.5, 3.8, 3.2, 7), stoneMaterial));
  const moss = markCameraCollider(new Mesh(new CylinderGeometry(4.6, 4.4, 0.7, 7), mossMaterial));
  base.position.y = 1.1;
  cap.position.y = 3.6;
  moss.position.y = 2.2;
  shrine.add(base, cap, moss);
  shrine.position.set(18, sampleTerrainHeight(18, 214), 214);
  return shrine;
}

export function buildShadowPockets() {
  const group = new Group();
  const geometry = new PlaneGeometry(1, 1, 10, 3);
  const placements = [
    [-84, -84, 92, 28, 0.055, 0.18],
    [-10, -12, 124, 34, 0.048, -0.08],
    [48, 68, 106, 32, 0.044, 0.14],
    [30, 132, 128, 42, 0.052, -0.18],
    [-18, 178, 118, 38, 0.046, 0.06],
    [24, 214, 98, 30, 0.04, -0.12],
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
    patch.userData.drift = 26 + index * 5;
    patch.userData.speed = 0.018 + index * 0.003;
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

  const upperMaterial = new MeshStandardMaterial({ color: "#d4cdb8", roughness: 0.98, side: DoubleSide });
  const lowerMaterial = new MeshStandardMaterial({ color: "#b9b7a2", roughness: 0.99, side: DoubleSide });
  const lowerShadowMaterial = new MeshStandardMaterial({ color: "#b6baa5", roughness: 0.99, side: DoubleSide });
  const underbellyMaterial = new MeshStandardMaterial({
    color: "#98aa8f",
    roughness: 0.99,
    side: DoubleSide,
    metalness: 0.02,
  });
  const mossMaterial = new MeshStandardMaterial({
    color: "#91b76d",
    roughness: 0.97,
    side: DoubleSide,
    emissive: new Color("#2a351e"),
    emissiveIntensity: 0.12,
  });
  const rimLipMaterial = new MeshStandardMaterial({ color: "#8a9f72", roughness: 0.9, side: DoubleSide });
  const hangMaterial = new MeshStandardMaterial({ color: "#727467", roughness: 0.97, side: DoubleSide });
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
  const upperSkirt = new Mesh(new CylinderGeometry(1.04, 0.86, 90, 40, 5, true), upperMaterial);
  upperSkirt.scale.set(radiusX * 1.02, 1, radiusZ * 1.04);
  upperSkirt.position.set(center.x, rimHeight - 57, center.z);
  markCameraCollider(upperSkirt);

  const mossBand = new Mesh(new CylinderGeometry(1, 0.95, 12, 40, 1, true), mossMaterial);
  mossBand.scale.set(radiusX * 1.03, 1, radiusZ * 1.05);
  mossBand.position.set(center.x, rimHeight - 8, center.z);
  markCameraCollider(mossBand);

  /** Upper taper: soil → overhang; lower taper: stronger shadow and pinching before the belly. */
  const lowerSkirtTop = new Mesh(new CylinderGeometry(0.86, 0.62, 64, 40, 5, true), lowerMaterial);
  lowerSkirtTop.scale.set(radiusX * 0.95, 1, radiusZ * 0.98);
  lowerSkirtTop.position.set(center.x, rimHeight - 127, center.z);
  markCameraCollider(lowerSkirtTop);

  const lowerSkirtBottom = new Mesh(new CylinderGeometry(0.62, 0.3, 64, 40, 5, true), lowerShadowMaterial);
  lowerSkirtBottom.scale.set(radiusX * 0.95, 1, radiusZ * 0.98);
  lowerSkirtBottom.position.set(center.x, rimHeight - 191, center.z);
  markCameraCollider(lowerSkirtBottom);

  const lowerBelly = new Mesh(new SphereGeometry(1.2, 22, 18), underbellyMaterial);
  lowerBelly.scale.set(radiusX * 0.55, 54, radiusZ * 0.5);
  lowerBelly.position.set(center.x, rimHeight - 240, center.z);
  markCameraCollider(lowerBelly);

  const rimLip = new TorusGeometry(1, 0.04, 8, 56);
  const rimMesh = new Mesh(rimLip, rimLipMaterial);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.set(center.x, rimHeight - 2.2, center.z);
  rimMesh.scale.set(radiusX * 0.96, 1, radiusZ * 0.96);
  markCameraCollider(rimMesh);

  const mist1 = new Mesh(
    new CircleGeometry(maxR * 1.14, 56),
    new MeshBasicMaterial({
      color: "#d0e2ec",
      transparent: true,
      opacity: 0.065,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist1.rotation.x = -Math.PI / 2;
  mist1.position.set(center.x, rimHeight - 30, center.z);

  const mist2 = new Mesh(
    new CircleGeometry(maxR * 0.88, 48),
    new MeshBasicMaterial({
      color: "#bdd3dd",
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist2.rotation.x = -Math.PI / 2;
  mist2.position.set(center.x, rimHeight - 56, center.z);

  const mist3 = new Mesh(
    new CircleGeometry(maxR * 0.64, 40),
    new MeshBasicMaterial({
      color: "#aac1cb",
      transparent: true,
      opacity: 0.028,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mist3.rotation.x = -Math.PI / 2;
  mist3.position.set(center.x, rimHeight - 88, center.z);

  group.add(upperSkirt, mossBand, lowerSkirtTop, lowerSkirtBottom, lowerBelly, rimMesh, mist1, mist2, mist3);

  for (let h = 0; h < 10; h += 1) {
    const ang = (h / 10) * Math.PI * 2 + 0.41;
    const hang = new Mesh(new ConeGeometry(1.4 + (h % 3) * 0.9, 5.5 + (h % 4) * 2, 5), hangMaterial);
    hang.position.set(
      center.x + Math.cos(ang) * radiusX * 0.8,
      rimHeight - 20 - (h % 3) * 2.5,
      center.z + Math.sin(ang) * radiusZ * 0.8,
    );
    hang.rotation.set(Math.PI, 0, -ang);
    markCameraCollider(hang);
    group.add(hang);
  }

  perimeter.forEach((point, index) => {
    const useUpper = index % 3 === 0;
    const cliffBulge = markCameraCollider(
      new Mesh(new SphereGeometry(1.08, 10, 8), useUpper ? upperMaterial : lowerMaterial),
    );
    cliffBulge.scale.set(14 + (index % 4) * 4, 24 + (index % 3) * 8, 16 + (index % 5) * 3);
    cliffBulge.position.set(
      point.x * 0.99 + center.x * 0.01,
      point.y - 28 - (index % 4) * 7.5,
      point.z * 0.99 + center.z * 0.01,
    );
    group.add(cliffBulge);
  });

  const waterfallMaterial = new MeshBasicMaterial({
    color: "#dff8ff",
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: DoubleSide,
  });
  const waterfallCoreMaterial = new MeshBasicMaterial({
    color: "#fbfff4",
    transparent: true,
    opacity: 0.065,
    depthWrite: false,
    side: DoubleSide,
  });
  [0.06, 0.46, 0.88].forEach((turn, index) => {
    const angle = turn * Math.PI * 2;
    const point = sampleIslandBoundaryPoint(angle);
    const rimY = sampleBaseTerrainHeight(point.x, point.z) - 34;
    const width = 5.5 + (index % 2) * 2.2;
    const height = 42 + (index % 3) * 9;
    const veil = new Mesh(new PlaneGeometry(width, height, 1, 8), waterfallMaterial);
    veil.name = `island-edge-waterfall-${index}`;
    veil.rotation.y = Math.PI / 2 - angle;
    veil.position.set(point.x, rimY - height * 0.48, point.z);
    const core = new Mesh(new PlaneGeometry(width * 0.42, height * 0.92, 1, 8), waterfallCoreMaterial);
    core.rotation.copy(veil.rotation);
    core.position.copy(veil.position);
    core.position.y += height * 0.02;
    group.add(veil, core);
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
  const mistMaterial = new MeshBasicMaterial({
    color: "#d5ecf5",
    fog: true,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: DoubleSide,
  });
  const placements = [
    [-760, 140, 48, 18, 0.18],
    [690, 70, 42, 15, -0.26],
    [-540, -360, 34, 12, 0.42],
    [560, -430, 30, 11, -0.44],
    [220, 620, 52, 20, 0.08],
  ] as const;

  placements.forEach(([x, z, radius, lift, yaw], index) => {
    const island = new Group();
    island.name = `distant-floating-island-${index}`;
    const y = 132 + lift + index * 8;
    const top = new Mesh(new CylinderGeometry(1, 0.92, 8, 18, 1), grassMaterial);
    top.scale.set(radius, 1, radius * (0.62 + (index % 2) * 0.16));
    top.rotation.y = yaw;
    top.position.y = y;
    const cliff = new Mesh(new ConeGeometry(1, 44 + radius * 0.25, 18), cliffMaterial);
    cliff.scale.set(radius * 0.82, 1, radius * 0.52);
    cliff.rotation.y = yaw;
    cliff.position.y = y - 24;
    const shadow = new Mesh(new ConeGeometry(1, 54 + radius * 0.18, 18), shadowMaterial);
    shadow.scale.set(radius * 0.56, 1, radius * 0.36);
    shadow.rotation.y = yaw;
    shadow.position.y = y - 52;
    const mist = new Mesh(new CircleGeometry(radius * 1.18, 24), mistMaterial);
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = y - 8;
    island.add(top, cliff, shadow, mist);

    for (let tree = 0; tree < 3; tree += 1) {
      const angle = yaw + tree * 2.1 + index * 0.4;
      const trunk = new Mesh(new CylinderGeometry(0.55, 0.78, 7, 6), cliffMaterial);
      trunk.position.set(Math.cos(angle) * radius * 0.24, y + 5.4, Math.sin(angle) * radius * 0.18);
      const crown = new Mesh(new ConeGeometry(4.4, 11, 8), treeMaterial);
      crown.position.copy(trunk.position);
      crown.position.y += 8.2;
      island.add(trunk, crown);
    }

    island.position.set(x, 0, z);
    group.add(island);
  });

  return group;
}
