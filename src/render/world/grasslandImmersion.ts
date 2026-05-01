import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Points,
  PointsMaterial,
  SphereGeometry,
} from "three";
import {
  isInsideIslandPlayableBounds,
  sampleTerrainHeight,
  sampleTerrainNormal,
} from "../../simulation/world";
import { OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";

const immersionArt = OOT_PS2_GRASSLANDS_PALETTE.scene;

export interface GrasslandImmersionSystem {
  group: Group;
  staticLayer: Group;
  dynamicLayer: Group;
  pollen: Points;
  cloudShadows: Mesh[];
}

interface PollenData {
  base: Float32Array;
  phase: Float32Array;
}

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

  const crown = new Mesh(
    new SphereGeometry(1, 8, 6),
    new MeshLambertMaterial({ color: leafColor }),
  );
  crown.position.y = 1.7 * scale;
  crown.scale.set(1.0 * scale, 0.78 * scale, 0.88 * scale);
  group.add(crown);

  const cap = new Mesh(
    new SphereGeometry(1, 8, 6),
    new MeshLambertMaterial({ color: leafColor }),
  );
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
      index % 4 === 0 ? immersionArt.immersionDistantLeafDeep :
      index % 3 === 0 ? immersionArt.immersionDistantLeafB :
      immersionArt.immersionDistantLeafA;
    const tree = kind === "pine"
      ? makeDistantPine(scale * 2.85, leafColor, immersionArt.immersionDistantTrunk)
      : makeDistantTree(scale * 2.65, leafColor, immersionArt.immersionDistantTrunk);
    tree.position.set(x, sampleTerrainHeight(x, z), z);
    tree.rotation.y = seededUnit(index + x * 0.1) * Math.PI * 2;
    group.add(tree);
  });

  return group;
}

function buildCloudShadowPatches() {
  return [];
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

export function buildGrasslandImmersionSystem(): GrasslandImmersionSystem {
  const group = new Group();
  group.name = "grassland-immersion";
  const staticLayer = new Group();
  staticLayer.name = "grassland-immersion-static";
  const dynamicLayer = new Group();
  dynamicLayer.name = "grassland-immersion-dynamic";
  const cloudShadows = buildCloudShadowPatches();
  const pollen = buildPollenMotes();

  staticLayer.add(buildDistantTreeBelts());
  dynamicLayer.add(...cloudShadows, pollen);
  group.add(staticLayer, dynamicLayer);

  return { group, staticLayer, dynamicLayer, pollen, cloudShadows };
}

export function updateGrasslandImmersionSystem(
  system: GrasslandImmersionSystem,
  elapsed: number,
  mapLookdown: boolean,
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

  system.cloudShadows.forEach((shadow, index) => {
    const baseX = (shadow.userData.baseX as number | undefined) ?? shadow.position.x;
    const baseZ = (shadow.userData.baseZ as number | undefined) ?? shadow.position.z;
    shadow.position.x = baseX + Math.sin(elapsed * 0.025 + index * 1.6) * 3.8;
    shadow.position.z = baseZ + Math.cos(elapsed * 0.022 + index * 1.1) * 2.4;
    shadow.position.y = sampleTerrainHeight(shadow.position.x, shadow.position.z) + 0.08;
    const material = shadow.material as MeshBasicMaterial;
    material.opacity = ((shadow.userData.baseOpacity as number | undefined) ?? 0.12) *
      (0.78 + Math.sin(elapsed * 0.18 + index * 0.9) * 0.22);
  });

  system.staticLayer.children.forEach((belt: Object3D, beltIndex: number) => {
    belt.children.forEach((tree, index) => {
      tree.rotation.z = Math.sin(elapsed * 0.32 + index * 0.8 + beltIndex) * 0.008;
    });
  });
}
