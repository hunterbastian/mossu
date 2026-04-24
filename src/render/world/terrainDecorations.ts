import {
  BufferGeometry,
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
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import {
  isInsideIslandPlayableBounds,
  OPENING_LAKE_CENTER_X,
  OPENING_LAKE_CENTER_Z,
  OPENING_LAKE_RADIUS,
  sampleBiomeZone,
  sampleRiverWetness,
  sampleTerrainHeight,
  sampleTerrainNormal,
  scenicPockets,
} from "../../simulation/world";
import { markCameraCollider, scatterAroundPocket } from "./sceneHelpers";

type MaterialCompileShader = Parameters<MeshLambertMaterial["onBeforeCompile"]>[0];
type MaterialCompileRenderer = Parameters<MeshLambertMaterial["onBeforeCompile"]>[1];

const TREE_SIZE_MULTIPLIER = 4;
const FOREST_MIN_X = -182;
const FOREST_MAX_X = 174;
const FOREST_MIN_Z = -158;
const FOREST_MAX_Z = 226;

type InstancedForestKind = "round" | "pine";

interface InstancedTreePlacement {
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
}

interface ForestPoint {
  x: number;
  z: number;
}

function fract(value: number) {
  return value - Math.floor(value);
}

function forestHash(x: number, z: number, salt: number) {
  return fract(Math.sin(x * 47.13 + z * 91.71 + salt * 17.97) * 43758.5453123);
}

function makeSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function samplePoissonDisk(minX: number, maxX: number, minZ: number, maxZ: number, radius: number, seed: number) {
  const random = makeSeededRandom(seed);
  const cellSize = radius / Math.SQRT2;
  const gridWidth = Math.ceil((maxX - minX) / cellSize);
  const gridHeight = Math.ceil((maxZ - minZ) / cellSize);
  const grid = new Array<number>(gridWidth * gridHeight).fill(-1);
  const points: ForestPoint[] = [];
  const active: ForestPoint[] = [];

  const gridIndex = (x: number, z: number) => {
    const gx = Math.floor((x - minX) / cellSize);
    const gz = Math.floor((z - minZ) / cellSize);
    return { gx, gz, index: gz * gridWidth + gx };
  };

  const canAdd = (point: ForestPoint) => {
    if (point.x < minX || point.x > maxX || point.z < minZ || point.z > maxZ) {
      return false;
    }

    const { gx, gz } = gridIndex(point.x, point.z);
    for (let oz = -2; oz <= 2; oz += 1) {
      for (let ox = -2; ox <= 2; ox += 1) {
        const nx = gx + ox;
        const nz = gz + oz;
        if (nx < 0 || nz < 0 || nx >= gridWidth || nz >= gridHeight) {
          continue;
        }

        const neighborIndex = grid[nz * gridWidth + nx];
        if (neighborIndex < 0) {
          continue;
        }

        const neighbor = points[neighborIndex];
        if (Math.hypot(neighbor.x - point.x, neighbor.z - point.z) < radius) {
          return false;
        }
      }
    }

    return true;
  };

  const addPoint = (point: ForestPoint) => {
    const { index } = gridIndex(point.x, point.z);
    grid[index] = points.length;
    points.push(point);
    active.push(point);
  };

  addPoint({
    x: minX + random() * (maxX - minX),
    z: minZ + random() * (maxZ - minZ),
  });

  while (active.length > 0) {
    const activeIndex = Math.floor(random() * active.length);
    const origin = active[activeIndex];
    let accepted = false;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const distance = radius * (1 + random());
      const candidate = {
        x: origin.x + Math.cos(angle) * distance,
        z: origin.z + Math.sin(angle) * distance,
      };

      if (canAdd(candidate)) {
        addPoint(candidate);
        accepted = true;
        break;
      }
    }

    if (!accepted) {
      active.splice(activeIndex, 1);
    }
  }

  return points;
}

function canPlaceInstancedTree(kind: InstancedForestKind, x: number, z: number) {
  if (!isInsideIslandPlayableBounds(x, z)) {
    return false;
  }

  const lakeDistance = Math.hypot(x - OPENING_LAKE_CENTER_X, z - OPENING_LAKE_CENTER_Z);
  if (lakeDistance < OPENING_LAKE_RADIUS + 12 || sampleRiverWetness(x, z) > 0.42) {
    return false;
  }

  const y = sampleTerrainHeight(x, z);
  const zone = sampleBiomeZone(x, z, y);
  if (zone === "peak_shrine") {
    return false;
  }

  const slope = 1 - sampleTerrainNormal(x, z).y;
  if (slope > (kind === "pine" ? 0.42 : 0.32)) {
    return false;
  }

  if (kind === "round") {
    return (zone === "plains" || zone === "hills" || zone === "foothills") && y < 96;
  }

  return (zone === "foothills" || zone === "alpine" || zone === "ridge" || (zone === "hills" && z > 42)) && y < 176;
}

function sampleInstancedTreeDensity(kind: InstancedForestKind, x: number, z: number, y: number) {
  const zone = sampleBiomeZone(x, z, y);
  const wetness = sampleRiverWetness(x, z);
  const lakeDistance = Math.hypot(x - OPENING_LAKE_CENTER_X, z - OPENING_LAKE_CENTER_Z);
  const waterFade = MathUtils.smoothstep(lakeDistance, OPENING_LAKE_RADIUS + 8, OPENING_LAKE_RADIUS + 32) * (1 - wetness * 0.55);

  if (kind === "round") {
    const biomeDensity =
      zone === "plains" ? 0.5 :
      zone === "hills" ? 0.42 :
      zone === "foothills" ? 0.22 :
      0;
    return biomeDensity * waterFade;
  }

  const biomeDensity =
    zone === "hills" ? 0.16 :
    zone === "foothills" ? 0.46 :
    zone === "alpine" ? 0.58 :
    zone === "ridge" ? 0.34 :
    0;
  return biomeDensity * waterFade;
}

function buildInstancedTreePlacements(kind: InstancedForestKind) {
  const placements: InstancedTreePlacement[] = [];
  const candidates = samplePoissonDisk(
    FOREST_MIN_X,
    FOREST_MAX_X,
    FOREST_MIN_Z,
    FOREST_MAX_Z,
    kind === "round" ? 14.5 : 12.5,
    kind === "round" ? 184031 : 92713,
  );

  candidates.forEach(({ x, z }, index) => {
    if (!canPlaceInstancedTree(kind, x, z)) {
      return;
    }

    const y = sampleTerrainHeight(x, z);
    const density = sampleInstancedTreeDensity(kind, x, z, y);
    if (forestHash(x, z, kind === "round" ? 83 : 97) > density) {
      return;
    }

    const zone = sampleBiomeZone(x, z, y);
    const scaleBase =
      kind === "round"
        ? 0.48 + forestHash(x, z, 59) * 0.28
        : 0.54 + forestHash(x, z, 61) * 0.36;
    const altitudeScale = zone === "ridge" || zone === "alpine" ? 1.1 : zone === "foothills" ? 1.02 : 0.94;
    placements.push({
      x,
      z,
      y,
      scale: scaleBase * altitudeScale,
      yaw: forestHash(x, z, 71 + index * 0.01) * Math.PI * 2,
    });
  });

  return placements.slice(0, kind === "round" ? 96 : 132);
}

function mergeTreeGeometry(parts: Array<{ geometry: BufferGeometry; color: string; windWeight: number }>) {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const windWeights: number[] = [];
  const tint = new Color();

  parts.forEach((part) => {
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geometry.computeVertexNormals();
    const positionAttribute = geometry.getAttribute("position");
    const normalAttribute = geometry.getAttribute("normal");
    tint.set(part.color);

    for (let i = 0; i < positionAttribute.count; i += 1) {
      positions.push(positionAttribute.getX(i), positionAttribute.getY(i), positionAttribute.getZ(i));
      normals.push(normalAttribute.getX(i), normalAttribute.getY(i), normalAttribute.getZ(i));
      colors.push(tint.r, tint.g, tint.b);
      windWeights.push(part.windWeight);
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("windWeight", new Float32BufferAttribute(windWeights, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function makeRoundForestGeometry() {
  const trunk = new CylinderGeometry(0.18, 0.3, 3.8, 7);
  trunk.translate(0, 1.9, 0);
  const canopy = new SphereGeometry(1.58, 9, 8);
  canopy.translate(0, 4.32, 0);
  return mergeTreeGeometry([
    { geometry: trunk, color: "#7b6145", windWeight: 0 },
    { geometry: canopy, color: "#94d36c", windWeight: 1 },
  ]);
}

function makePineForestGeometry() {
  const trunk = new CylinderGeometry(0.15, 0.26, 4.4, 7);
  trunk.translate(0, 2.2, 0);
  const lower = new ConeGeometry(1.22, 2.2, 6);
  lower.translate(0, 2.55, 0);
  const middle = new ConeGeometry(1.02, 2, 6);
  middle.translate(0, 3.65, 0);
  const upper = new ConeGeometry(0.76, 1.68, 6);
  upper.translate(0, 4.76, 0);

  return mergeTreeGeometry([
    { geometry: trunk, color: "#7b6145", windWeight: 0 },
    { geometry: lower, color: "#5d7b4e", windWeight: 0.82 },
    { geometry: middle, color: "#668756", windWeight: 0.94 },
    { geometry: upper, color: "#71925f", windWeight: 1 },
  ]);
}

function makeWindTreeMaterial() {
  const material = new MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader: MaterialCompileShader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float windWeight;
uniform float uTime;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 treeRoot = instanceMatrix[3].xyz;
#else
vec3 treeRoot = vec3(0.0);
#endif
float slowSway = sin(uTime * 1.15 + treeRoot.x * 0.041 + treeRoot.z * 0.034);
float quickFlutter = sin(uTime * 3.4 + treeRoot.x * 0.13 - treeRoot.z * 0.09) * 0.34;
transformed.x += (slowSway + quickFlutter) * 0.14 * windWeight;
transformed.z += slowSway * 0.05 * windWeight;`,
      );
    material.userData.windShader = shader;
  };
  material.customProgramCacheKey = () => "mossu-instanced-tree-wind";
  return material;
}

function applyTreeInstances(mesh: InstancedMesh, placements: InstancedTreePlacement[], scaleMultiplier = 1) {
  const dummy = new Object3D();
  placements.forEach((placement, index) => {
    dummy.position.set(placement.x, placement.y, placement.z);
    dummy.rotation.set(0, placement.yaw, 0);
    dummy.scale.setScalar(placement.scale * scaleMultiplier);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function markInstancedTreeWind(mesh: InstancedMesh) {
  mesh.userData.canopyWind = true;
  const material = mesh.material as MeshLambertMaterial;
  const originalCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader: MaterialCompileShader, renderer: MaterialCompileRenderer) => {
    originalCompile.call(material, shader, renderer);
    mesh.userData.windShader = shader;
  };
}

function buildInstancedForest() {
  const group = new Group();
  const roundPlacements = buildInstancedTreePlacements("round");
  const pinePlacements = buildInstancedTreePlacements("pine");

  const roundTrees = new InstancedMesh(makeRoundForestGeometry(), makeWindTreeMaterial(), roundPlacements.length);
  const pineTrees = new InstancedMesh(makePineForestGeometry(), makeWindTreeMaterial(), pinePlacements.length);
  applyTreeInstances(roundTrees, roundPlacements, 1);
  applyTreeInstances(pineTrees, pinePlacements, 1);
  markInstancedTreeWind(roundTrees);
  markInstancedTreeWind(pineTrees);
  roundTrees.frustumCulled = true;
  pineTrees.frustumCulled = true;
  group.add(roundTrees, pineTrees);

  return group;
}

function makeRoundTree(scale: number, leafColor: string) {
  const scaledSize = scale * TREE_SIZE_MULTIPLIER;
  const group = new Group();
  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.22 * scaledSize, 0.34 * scaledSize, 3.8 * scaledSize, 7),
    new MeshLambertMaterial({ color: "#8f7253" }),
  ));
  trunk.position.y = 1.9 * scaledSize;
  group.add(trunk);

  for (const [x, y, z, size] of [
    [0, 4.6, 0, 1.8],
    [0.95, 4.2, 0.22, 1.2],
    [-0.9, 4.0, -0.12, 1.16],
    [0.18, 5.45, -0.18, 1.05],
  ]) {
    const canopy = new Mesh(
      new SphereGeometry(size * scaledSize, 10, 8),
      new MeshLambertMaterial({ color: leafColor }),
    );
    canopy.position.set(x * scaledSize, y * scaledSize, z * scaledSize);
    group.add(canopy);
  }

  return group;
}

function makePineTree(scale: number, tone = "#5b7d4d") {
  const scaledSize = scale * TREE_SIZE_MULTIPLIER;
  const group = new Group();
  const trunk = markCameraCollider(new Mesh(
    new CylinderGeometry(0.18 * scaledSize, 0.28 * scaledSize, 4.8 * scaledSize, 7),
    new MeshLambertMaterial({ color: "#7a6347" }),
  ));
  trunk.position.y = 2.4 * scaledSize;
  group.add(trunk);

  for (const [y, radius, height] of [
    [2.3, 1.2, 2.2],
    [3.4, 0.98, 1.9],
    [4.45, 0.72, 1.55],
  ]) {
    const cone = new Mesh(
      new ConeGeometry(radius * scaledSize, height * scaledSize, 6),
      new MeshLambertMaterial({ color: tone }),
    );
    cone.position.y = y * scaledSize;
    group.add(cone);
  }

  return group;
}

function makeFlower(color: string, scale: number, stemHeight: number) {
  const group = new Group();
  const stem = new Mesh(
    new CylinderGeometry(0.03 * scale, 0.05 * scale, stemHeight * scale, 5),
    new MeshLambertMaterial({ color: "#699953" }),
  );
  stem.position.y = stemHeight * scale * 0.5;
  group.add(stem);

  const center = new Mesh(
    new SphereGeometry(0.12 * scale, 7, 6),
    new MeshLambertMaterial({ color: "#f6d888" }),
  );
  center.position.y = stemHeight * scale;
  group.add(center);

  for (let i = 0; i < 5; i += 1) {
    const petal = new Mesh(
      new SphereGeometry(0.14 * scale, 6, 5),
      new MeshLambertMaterial({ color }),
    );
    const angle = (i / 5) * Math.PI * 2;
    petal.scale.set(1.2, 0.72, 1.05);
    petal.position.set(Math.cos(angle) * 0.18 * scale, stemHeight * scale, Math.sin(angle) * 0.18 * scale);
    group.add(petal);
  }

  return group;
}

function makeCloverPatch(radius: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, z, s] of [
    [0, 0, 1],
    [0.24, 0.08, 0.82],
    [-0.22, -0.1, 0.88],
    [0.04, -0.22, 0.76],
  ]) {
    const leaf = new Mesh(new SphereGeometry(radius * s, 7, 6), material);
    leaf.scale.set(1.2, 0.18, 1.2);
    leaf.position.set(x * radius * 2.4, 0.05, z * radius * 2.4);
    group.add(leaf);
  }
  return group;
}

function makeGrassClump(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, rot, h] of [
    [-0.16, -0.28, 0.7],
    [0, 0, 0.84],
    [0.16, 0.26, 0.72],
  ]) {
    const blade = new Mesh(new ConeGeometry(0.1 * scale, h * scale, 5), material);
    blade.position.set(x * scale, h * scale * 0.5, 0);
    blade.rotation.z = rot;
    group.add(blade);
  }
  return group;
}

function makeTinyRock(scale: number, color: string) {
  const rock = new Mesh(
    new SphereGeometry(0.28 * scale, 6, 5),
    new MeshLambertMaterial({ color }),
  );
  rock.scale.set(1.15, 0.72, 1);
  return rock;
}

function makeBush(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, y, z, s] of [
    [0, 0.5, 0, 1],
    [0.34, 0.42, 0.08, 0.72],
    [-0.32, 0.38, -0.04, 0.68],
  ]) {
    const puff = new Mesh(new SphereGeometry(0.6 * scale * s, 8, 7), material);
    puff.position.set(x * scale, y * scale, z * scale);
    group.add(puff);
  }
  return group;
}

function makeMossPatch(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, z, radius] of [
    [0, 0, 0.72],
    [0.34, -0.12, 0.46],
    [-0.28, 0.16, 0.42],
  ]) {
    const puff = new Mesh(new SphereGeometry(radius * scale, 8, 7), material);
    puff.scale.set(1.35, 0.24, 1.18);
    puff.position.set(x * scale, 0.06 * scale, z * scale);
    group.add(puff);
  }
  return group;
}

function makeRockFormation(scale: number, tone: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: tone });
  for (const [x, y, z, sx, sy, sz] of [
    [0, 0.56, 0, 1.3, 1.8, 1.1],
    [0.48, 0.42, -0.18, 0.92, 1.24, 0.86],
    [-0.44, 0.34, 0.22, 0.82, 1.02, 0.78],
  ]) {
    const rock = markCameraCollider(new Mesh(new SphereGeometry(0.72 * scale, 8, 7), material));
    rock.scale.set(sx * scale, sy * scale, sz * scale);
    rock.position.set(x * scale, y * scale, z * scale);
    group.add(rock);
  }
  return group;
}

function makeWaterfallRibbon(height: number, width: number) {
  const group = new Group();
  const outer = new Mesh(
    new PlaneGeometry(width, height, 1, 8),
    new MeshBasicMaterial({
      color: "#d8f4ff",
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  const inner = new Mesh(
    new PlaneGeometry(width * 0.56, height * 0.96, 1, 8),
    new MeshBasicMaterial({
      color: "#f7fdff",
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  outer.position.y = height * 0.5;
  inner.position.y = height * 0.48;
  inner.position.z = 0.08;
  group.add(outer, inner);
  return group;
}

function makeMushroom(scale: number, capColor: string) {
  const group = new Group();
  const stem = new Mesh(
    new CylinderGeometry(0.06 * scale, 0.08 * scale, 0.55 * scale, 6),
    new MeshLambertMaterial({ color: "#f3ead5" }),
  );
  stem.position.y = 0.28 * scale;
  const cap = new Mesh(
    new SphereGeometry(0.2 * scale, 8, 6),
    new MeshLambertMaterial({ color: capColor }),
  );
  cap.scale.set(1.4, 0.72, 1.4);
  cap.position.y = 0.56 * scale;
  group.add(stem, cap);
  return group;
}

export function buildGroundLayer() {
  const group = new Group();
  const flowerPalette = ["#fff7f0", "#ffd969", "#f6c6df", "#fdf8b9", "#f7d7ff"];

  scenicPockets.forEach((pocket) => {
    const isStartPocket = pocket.id === "start-meadow";
    const isUpperRoutePocket = pocket.id === "mistfall-basin" || pocket.id === "windstep-shelf" || pocket.id === "ridge-crossing";
    const clusterCount =
      isStartPocket ? 3 :
      pocket.zone === "plains" ? 5 :
      pocket.zone === "hills" ? 4 :
      pocket.zone === "foothills" ? (pocket.id === "fir-gate-entry" ? 3 : 2) :
      pocket.zone === "alpine" ? (pocket.kind === "stream_bend" || isUpperRoutePocket ? 1 : 0) :
      pocket.zone === "ridge" ? (isUpperRoutePocket ? 1 : 0) :
      0;
    const cloverCount =
      isStartPocket ? 2 :
      pocket.zone === "plains" ? 3 :
      pocket.zone === "hills" ? 2 :
      0;

    for (let i = 0; i < clusterCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, i, pocket.kind === "stream_bend" ? 0.72 : 0.9);
      const y = sampleTerrainHeight(x, z);
      const flowerGroup = new Group();
      const bloomCount =
        pocket.zone === "plains" ? 6 :
        pocket.zone === "hills" ? 5 :
        pocket.zone === "foothills" ? 3 :
        pocket.zone === "alpine" ? 2 :
        2;
      for (let j = 0; j < bloomCount; j += 1) {
        const localAngle = (j / Math.max(1, bloomCount)) * Math.PI * 2;
        const localRadius = 0.35 + (j % 3) * 0.16;
        const flower = makeFlower(
          flowerPalette[(i + j) % flowerPalette.length],
          0.66 + ((i + j) % 3) * 0.08,
          pocket.zone === "foothills" ? 0.9 : 0.72 + (j % 2) * 0.08,
        );
        flower.position.set(Math.cos(localAngle) * localRadius, 0, Math.sin(localAngle) * localRadius);
        flowerGroup.add(flower);
      }

      flowerGroup.position.set(x, y, z);
      group.add(flowerGroup);
    }

    for (let i = 0; i < cloverCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 30 + i, 0.78);
      const y = sampleTerrainHeight(x, z);
      const patch = makeCloverPatch(0.42 + i * 0.05, i % 2 === 0 ? "#7fb765" : "#90c777");
      patch.position.set(x, y, z);
      group.add(patch);
    }

    const grassPatchCount =
      isStartPocket ? 2 :
      pocket.zone === "foothills" ? 3 :
      pocket.zone === "alpine" ? 2 :
      pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 2 :
      3;
    for (let i = 0; i < grassPatchCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 50 + i, 0.82);
      const y = sampleTerrainHeight(x, z);
      const grass = makeGrassClump(
        pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 0.64 + (i % 2) * 0.1 : 0.8 + (i % 2) * 0.18,
        pocket.zone === "plains" ? "#7fb764" : pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? "#6d8a63" : "#739f5f",
      );
      grass.position.set(x, y, z);
      group.add(grass);
    }

    const rockCount =
      isStartPocket ? 1 :
      pocket.zone === "foothills" ? 5 :
      pocket.zone === "alpine" ? 7 :
      pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 7 :
      3;
    for (let i = 0; i < rockCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 70 + i, 0.88);
      const y = sampleTerrainHeight(x, z);
      const rock = makeTinyRock(
        pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 0.78 + (i % 3) * 0.2 : 0.6 + (i % 3) * 0.18,
        pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? "#a7a79d" : pocket.zone === "alpine" ? "#b3b0a2" : "#c5b99d",
      );
      rock.position.set(x, y + 0.08, z);
      rock.rotation.set(0, i * 0.8, 0.22 - i * 0.03);
      group.add(rock);
    }

    if (pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine") {
      for (let i = 0; i < 3; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 90 + i, 0.72);
        const y = sampleTerrainHeight(x, z);
        const moss = makeMossPatch(0.9 + i * 0.12, pocket.zone === "peak_shrine" ? "#7b8f76" : "#6e8c67");
        moss.position.set(x, y, z);
        group.add(moss);
      }
    }
  });

  return group;
}

export function buildMidLayer() {
  const group = new Group();

  scenicPockets.forEach((pocket) => {
    const isStartPocket = pocket.id === "start-meadow";
    const bushCount =
      isStartPocket ? 1 :
      pocket.zone === "plains" ? 2 :
      pocket.zone === "hills" ? 3 :
      pocket.zone === "foothills" ? (pocket.id === "fir-gate-entry" ? 5 : 4) :
      pocket.zone === "alpine" ? 2 :
      pocket.zone === "ridge" ? 1 :
      1;
    for (let i = 0; i < bushCount; i += 1) {
      const { x, z } = scatterAroundPocket(pocket, 100 + i, 0.82);
      const y = sampleTerrainHeight(x, z);
      const bush = makeBush(
        pocket.zone === "foothills" || pocket.zone === "ridge" || pocket.zone === "peak_shrine" ? 1.08 : pocket.zone === "alpine" ? 0.94 : 0.92,
        pocket.zone === "plains"
          ? "#8ec86e"
          : pocket.zone === "foothills"
            ? "#73995e"
            : pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine"
              ? "#667d60"
              : "#6f895e",
      );
      bush.position.set(x, y, z);
      group.add(bush);
    }

    if (pocket.zone === "plains" || pocket.zone === "hills" || pocket.zone === "foothills") {
      const mushroomCount = isStartPocket ? 1 : pocket.zone === "plains" ? 2 : 2;
      for (let i = 0; i < mushroomCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 120 + i, 0.7);
        const y = sampleTerrainHeight(x, z);
        const mushroom = makeMushroom(0.72 + i * 0.08, i % 2 === 0 ? "#d8a476" : "#e4b893");
        mushroom.position.set(x, y, z);
        group.add(mushroom);
      }
    }

    if (pocket.zone !== "peak_shrine") {
      const saplingCount =
        pocket.zone === "foothills" ? 2 :
        pocket.zone === "alpine" || pocket.zone === "ridge" ? 3 :
        2;
      for (let i = 0; i < saplingCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 140 + i, 0.9);
        const y = sampleTerrainHeight(x, z);
        const sapling = pocket.zone === "plains" || pocket.zone === "hills"
          ? makeRoundTree(0.46, "#95cb78")
          : makePineTree(
            pocket.zone === "alpine" || pocket.zone === "ridge" ? 0.82 + i * 0.04 : 0.68,
            pocket.zone === "alpine" || pocket.zone === "ridge" ? "#5f7f55" : "#6b8a55",
          );
        sapling.position.set(x, y, z);
        group.add(sapling);
      }
    }
  });

  return group;
}

export function buildTreeClusters() {
  const group = new Group();
  group.add(buildInstancedForest());

  const roundClusters = [
    [-108, -146, 1.12, "#9fd571"],
    [-76, -104, 0.96, "#91cf74"],
    [-22, -56, 1.04, "#aedf80"],
    [28, -8, 0.84, "#88c86c"],
    [-60, 22, 0.82, "#8dcc6d"],
  ];
  roundClusters.forEach(([x, z, scale, color], index) => {
    const tree = makeRoundTree(scale as number, color as string);
    tree.position.set(x as number, sampleTerrainHeight(x as number, z as number), z as number);
    tree.rotation.y = index * 0.8;
    group.add(tree);
  });

  const mixedClusters = [
    [-4, 72, 0.9, "round"],
    [18, 86, 0.96, "pine"],
    [34, 100, 1.08, "pine"],
    [-10, 106, 0.8, "round"],
    [14, 118, 1.04, "pine"],
    [42, 130, 1.12, "pine"],
    [-14, 146, 0.96, "pine"],
    [10, 156, 1.16, "pine"],
    [-28, 168, 1.12, "pine"],
    [20, 186, 1.22, "pine"],
    [-4, 198, 1.18, "pine"],
    [48, 210, 1.08, "pine"],
  ];
  mixedClusters.forEach(([x, z, scale, type], index) => {
    const tree = type === "round"
      ? makeRoundTree(scale as number, index % 2 === 0 ? "#83be68" : "#92c974")
      : makePineTree(scale as number, z as number > 150 ? "#58754b" : "#628552");
    tree.position.set(x as number, sampleTerrainHeight(x as number, z as number), z as number);
    tree.rotation.y = index * 0.55;
    group.add(tree);
  });

  return group;
}

export function buildHighlandAccents() {
  const group = new Group();

  scenicPockets
    .filter((pocket) => pocket.zone === "foothills" || pocket.zone === "alpine" || pocket.zone === "ridge" || pocket.zone === "peak_shrine")
    .forEach((pocket, pocketIndex) => {
      const formationCount =
        pocket.zone === "foothills" ? 2 :
        pocket.zone === "alpine" ? 3 :
        pocket.zone === "ridge" ? 3 :
        2;
      for (let i = 0; i < formationCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 300 + pocketIndex * 20 + i, pocket.kind === "overlook" ? 0.74 : 0.9);
        const y = sampleTerrainHeight(x, z);
        const rock = makeRockFormation(
          pocket.zone === "foothills" ? 1.1 + i * 0.12 : 1.34 + i * 0.14,
          pocket.zone === "peak_shrine" ? "#b8b4ac" : pocket.zone === "ridge" ? "#aba99e" : "#b7b1a5",
        );
        rock.position.set(x, y, z);
        rock.rotation.y = pocketIndex * 0.7 + i * 1.2;
        group.add(rock);
      }

      const mossCount = pocket.zone === "foothills" ? 2 : 3;
      for (let i = 0; i < mossCount; i += 1) {
        const { x, z } = scatterAroundPocket(pocket, 380 + pocketIndex * 20 + i, 0.76);
        const y = sampleTerrainHeight(x, z);
        const moss = makeMossPatch(
          pocket.zone === "foothills" ? 1.18 + i * 0.1 : 1.34 + i * 0.12,
          pocket.zone === "foothills" ? "#7c965f" : pocket.zone === "peak_shrine" ? "#71806d" : "#697f62",
        );
        moss.position.set(x, y, z);
        group.add(moss);
      }

      if (pocket.zone !== "peak_shrine") {
        const pineCount = pocket.zone === "foothills" ? 2 : 3;
        for (let i = 0; i < pineCount; i += 1) {
          const { x, z } = scatterAroundPocket(pocket, 430 + pocketIndex * 20 + i, 0.98);
          const y = sampleTerrainHeight(x, z);
          const pine = makePineTree(
            pocket.zone === "foothills" ? 1.02 + i * 0.08 : 1.18 + i * 0.12,
            pocket.zone === "foothills" ? "#6a8c56" : pocket.zone === "alpine" ? "#57744a" : "#4f6845",
          );
          pine.position.set(x, y, z);
          pine.rotation.y = i * 0.8 + pocketIndex * 0.4;
          group.add(pine);
        }
      }

      if (pocket.id === "mistfall-cascade") {
        const waterfall = makeWaterfallRibbon(28, 8);
        waterfall.position.set(pocket.position.x + 10, pocket.position.y + 4, pocket.position.z - 2);
        waterfall.rotation.y = -0.18;
        waterfall.rotation.z = 0.08;
        group.add(waterfall);
      }

      if (pocket.id === "fir-gate-entry") {
        for (const [xOffset, zOffset, scale] of [[-6, -1, 1.32], [5, 2, 1.46]] as const) {
          const pine = makePineTree(scale, "#5f804f");
          pine.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset),
            pocket.position.z + zOffset,
          );
          pine.rotation.y = xOffset * 0.12;
          group.add(pine);
        }
      }

      if (pocket.id === "windstep-shelf") {
        for (const [xOffset, zOffset, scale] of [[-7, -4, 1.46], [0, 0, 1.62], [7, 3, 1.38]] as const) {
          const rock = makeRockFormation(scale, "#aca79c");
          rock.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset),
            pocket.position.z + zOffset,
          );
          rock.rotation.y = xOffset * 0.08 + zOffset * 0.04;
          group.add(rock);
        }
      }

      if (pocket.id === "ridge-crossing") {
        for (const [xOffset, zOffset, scale] of [[-8, -2, 1.52], [8, 2, 1.44]] as const) {
          const pine = makePineTree(scale, "#4d6743");
          pine.position.set(
            pocket.position.x + xOffset,
            sampleTerrainHeight(pocket.position.x + xOffset, pocket.position.z + zOffset),
            pocket.position.z + zOffset,
          );
          group.add(pine);
        }
      }
    });

  return group;
}

export function buildLandmarkTrees() {
  const group = new Group();
  const trunkMaterial = new MeshStandardMaterial({ color: "#f5f5f1", roughness: 1 });
  const blackStripe = new MeshStandardMaterial({ color: "#464846", roughness: 1 });
  const orangeLeaves = new MeshStandardMaterial({ color: "#ea8845", roughness: 1 });
  const greenLeaves = new MeshStandardMaterial({ color: "#7ac35f", roughness: 1 });

  const makeTree = (x: number, z: number, color: MeshStandardMaterial) => {
    const tree = new Group();
    const trunk = markCameraCollider(new Mesh(new CylinderGeometry(0.33, 0.44, 7.2, 8), trunkMaterial));
    trunk.position.y = 3.6;
    tree.add(trunk);

    for (const [y, size, ox, oz] of [
      [7.1, 2.8, 0, 0],
      [8.2, 2.2, 1.1, 0.2],
      [8.1, 2, -1, 0.1],
      [6.8, 1.9, 0.5, 1],
    ]) {
      const leaf = new Mesh(new SphereGeometry(size, 12, 10), color);
      leaf.position.set(ox as number, y as number, oz as number);
      tree.add(leaf);
    }

    for (const y of [2.8, 4.4, 5.9]) {
      const stripe = new Mesh(new SphereGeometry(0.12, 8, 6), blackStripe);
      stripe.scale.set(0.6, 1, 0.08);
      stripe.position.set(0, y, 0.42);
      tree.add(stripe);
    }

    tree.scale.setScalar(TREE_SIZE_MULTIPLIER);
    tree.position.set(x, sampleTerrainHeight(x, z), z);
    group.add(tree);
  };

  makeTree(-10, -28, orangeLeaves);
  makeTree(-36, 8, orangeLeaves);
  makeTree(28, 34, greenLeaves);
  makeTree(-18, 88, orangeLeaves);
  makeTree(-28, 162, greenLeaves);
  return group;
}
