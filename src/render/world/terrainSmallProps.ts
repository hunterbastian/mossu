import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { ART_DIRECTION_IDS, OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";
import { markCameraCollider } from "./sceneHelpers";
import { forestHash, makeTint } from "./terrainDecorationMath";

const grasslandProps = OOT_PS2_GRASSLANDS_PALETTE.props;
const forestGroveProps = grasslandProps.forestGroves;
const futureLakeArt = OOT_PS2_GRASSLANDS_PALETTE.futureLakes;

export function makeGrasslandSignpost(scale: number) {
  const group = new Group();
  group.name = `${ART_DIRECTION_IDS.grasslands}-signpost`;
  const postMaterial = new MeshLambertMaterial({ color: grasslandProps.signpost.post });
  const signMaterial = new MeshLambertMaterial({ color: grasslandProps.signpost.face });
  const trimMaterial = new MeshLambertMaterial({ color: grasslandProps.signpost.trim });

  const post = new Mesh(new BoxGeometry(0.34 * scale, 2.4 * scale, 0.34 * scale), postMaterial);
  post.position.y = 1.2 * scale;
  group.add(post);

  const face = new Mesh(new BoxGeometry(1.9 * scale, 0.78 * scale, 0.2 * scale), signMaterial);
  face.position.set(0.18 * scale, 2.12 * scale, 0);
  face.rotation.z = -0.04;
  group.add(face);

  const leaf = new Mesh(new SphereGeometry(0.16 * scale, 7, 5), trimMaterial);
  leaf.position.set(-0.78 * scale, 2.16 * scale, 0.12 * scale);
  leaf.scale.set(1.4, 0.42, 0.7);
  leaf.rotation.z = 0.36;
  group.add(leaf);

  const pointer = new Mesh(new BoxGeometry(0.8 * scale, 0.18 * scale, 0.16 * scale), trimMaterial);
  pointer.position.set(0.48 * scale, 2.13 * scale, 0.14 * scale);
  pointer.rotation.z = -0.04;
  group.add(pointer);

  return group;
}

type SmallPropGeometryKind = "cone-5" | "flower-stem" | "mushroom-stem" | "sphere-5-4" | "sphere-6-5";

interface SmallPropBucket {
  kind: SmallPropGeometryKind;
  cellX: number;
  cellZ: number;
  geometry: BufferGeometry;
  material: MeshLambertMaterial;
  matrices: Matrix4[];
  colors: Color[];
}

export class SmallPropInstancer {
  private static readonly CELL_SIZE = 112;
  private readonly buckets = new Map<string, SmallPropBucket>();
  private readonly dummy = new Object3D();

  constructor(private readonly name: string) {}

  addFlower(x: number, y: number, z: number, yaw: number, color: string, scale: number, stemHeight: number) {
    const height = stemHeight * scale;
    this.addPrimitive("flower-stem", "#699953", x, y + height * 0.5, z, yaw, 0.05 * scale, height, 0.05 * scale);
    this.addPrimitive("sphere-5-4", "#f6d888", x, y + height, z, yaw, 0.12 * scale, 0.12 * scale, 0.12 * scale);

    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      const local = this.transformLocal(Math.cos(angle) * 0.18 * scale, Math.sin(angle) * 0.18 * scale, yaw);
      this.addPrimitive(
        "sphere-5-4",
        color,
        x + local.x,
        y + height,
        z + local.z,
        yaw,
        0.14 * scale * 1.2,
        0.14 * scale * 0.72,
        0.14 * scale * 1.05,
      );
    }
  }

  addCloverPatch(x: number, y: number, z: number, yaw: number, radius: number, color: string) {
    for (const [lx, lz, s] of [
      [0, 0, 1],
      [0.24, 0.08, 0.82],
      [-0.22, -0.1, 0.88],
      [0.04, -0.22, 0.76],
    ] as const) {
      const local = this.transformLocal(lx * radius * 2.4, lz * radius * 2.4, yaw);
      this.addPrimitive(
        "sphere-5-4",
        color,
        x + local.x,
        y + 0.05,
        z + local.z,
        yaw,
        radius * s * 1.2,
        radius * s * 0.18,
        radius * s * 1.2,
      );
    }
  }

  addGrassClump(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, rotZ, h] of [
      [-0.16, -0.28, 0.7],
      [0, 0, 0.84],
      [0.16, 0.26, 0.72],
    ] as const) {
      const local = this.transformLocal(lx * scale, 0, yaw);
      this.addPrimitive(
        "cone-5",
        color,
        x + local.x,
        y + h * scale * 0.5,
        z + local.z,
        yaw,
        0.1 * scale,
        h * scale,
        0.1 * scale,
        0,
        rotZ,
      );
    }
  }

  addReedCluster(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, lz, rotZ, h] of [
      [-0.24, -0.08, -0.18, 1],
      [-0.08, 0.12, 0.06, 1.18],
      [0.12, -0.02, 0.2, 1.08],
      [0.28, 0.14, 0.34, 0.86],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      this.addPrimitive(
        "cone-5",
        color,
        x + local.x,
        y + h * scale * 0.5,
        z + local.z,
        yaw,
        0.055 * scale,
        h * scale,
        0.055 * scale,
        0,
        rotZ,
      );
    }
  }

  addTinyRock(x: number, y: number, z: number, yaw: number, rotZ: number, scale: number, color: string) {
    const radius = 0.28 * scale;
    this.addPrimitive("sphere-6-5", color, x, y, z, yaw, radius * 1.15, radius * 0.72, radius, 0, rotZ);
  }

  addBankPebbleCluster(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, lz, sx, sy, sz] of [
      [0, 0, 1.28, 0.28, 0.86],
      [0.46, -0.16, 0.78, 0.22, 0.56],
      [-0.42, 0.18, 0.92, 0.24, 0.64],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      const radius = 0.34 * scale;
      this.addPrimitive(
        "sphere-5-4",
        color,
        x + local.x,
        y + 0.08 * scale,
        z + local.z,
        yaw,
        radius * sx * scale,
        radius * sy * scale,
        radius * sz * scale,
      );
    }
  }

  addBankLipPebbleTrail(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, lz, width, depth, localYaw] of [
      [-1.16, -0.08, 0.78, 0.36, -0.18],
      [-0.46, 0.12, 0.54, 0.28, 0.28],
      [0.18, -0.02, 0.66, 0.32, -0.08],
      [0.86, 0.1, 0.5, 0.26, 0.2],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      const radius = 0.28 * scale;
      this.addPrimitive(
        "sphere-5-4",
        color,
        x + local.x,
        y + 0.07 * scale,
        z + local.z,
        yaw + localYaw,
        radius * width * scale,
        radius * 0.18 * scale,
        radius * depth * scale,
      );
    }
  }

  addBush(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    const darkLeaf = makeTint(color, "#315b39", 0.34);
    const lightLeaf = makeTint(color, "#e6df6a", 0.34);
    const branchColor = "#725238";
    const blossomColor = "#fff6de";
    const berryColor = forestHash(x, z, 431) > 0.5 ? "#ef9a38" : "#d95636";

    for (const [lx, lz, height, roll] of [
      [-0.34, 0.12, 0.72, -0.34],
      [-0.12, -0.12, 0.82, -0.12],
      [0.18, 0.04, 0.78, 0.2],
      [0.38, -0.08, 0.62, 0.36],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      this.addPrimitive(
        "mushroom-stem",
        branchColor,
        x + local.x,
        y + height * scale * 0.34,
        z + local.z,
        yaw,
        0.05 * scale,
        height * scale,
        0.05 * scale,
        0,
        roll,
      );
    }

    for (const [lx, ly, lz, sx, sy, sz, tint] of [
      [0, 0.58, 0, 0.92, 0.56, 0.82, color],
      [-0.5, 0.48, 0.02, 0.62, 0.42, 0.58, darkLeaf],
      [0.5, 0.5, -0.02, 0.62, 0.42, 0.58, color],
      [-0.2, 0.88, -0.08, 0.54, 0.34, 0.5, lightLeaf],
      [0.26, 0.82, 0.1, 0.5, 0.32, 0.46, lightLeaf],
      [0.02, 0.32, 0.46, 0.62, 0.24, 0.42, darkLeaf],
      [-0.08, 0.34, -0.44, 0.58, 0.24, 0.42, darkLeaf],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      this.addPrimitive(
        "sphere-6-5",
        tint,
        x + local.x,
        y + ly * scale,
        z + local.z,
        yaw,
        sx * scale,
        sy * scale,
        sz * scale,
      );
    }

    for (const [lx, ly, lz, size] of [
      [-0.42, 0.72, 0.42, 0.09],
      [0.42, 0.68, 0.34, 0.08],
      [0.1, 0.96, -0.34, 0.075],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      const isBerry = forestHash(x + lx, z + lz, 439) > 0.58;
      this.addPrimitive(
        "sphere-5-4",
        isBerry ? berryColor : blossomColor,
        x + local.x,
        y + ly * scale,
        z + local.z,
        yaw,
        size * scale,
        size * scale * 0.82,
        size * scale,
      );
    }
  }

  addMossPatch(x: number, y: number, z: number, yaw: number, scale: number, color: string) {
    for (const [lx, lz, radius] of [
      [0, 0, 0.72],
      [0.34, -0.12, 0.46],
      [-0.28, 0.16, 0.42],
    ] as const) {
      const local = this.transformLocal(lx * scale, lz * scale, yaw);
      this.addPrimitive(
        "sphere-6-5",
        color,
        x + local.x,
        y + 0.06 * scale,
        z + local.z,
        yaw,
        radius * scale * 1.35,
        radius * scale * 0.24,
        radius * scale * 1.18,
      );
    }
  }

  addMushroom(x: number, y: number, z: number, yaw: number, scale: number, capColor: string) {
    this.addPrimitive(
      "mushroom-stem",
      "#f3ead5",
      x,
      y + 0.28 * scale,
      z,
      yaw,
      0.08 * scale,
      0.55 * scale,
      0.08 * scale,
    );
    this.addPrimitive(
      "sphere-6-5",
      capColor,
      x,
      y + 0.56 * scale,
      z,
      yaw,
      0.2 * scale * 1.4,
      0.2 * scale * 0.72,
      0.2 * scale * 1.4,
    );
  }

  buildGroup() {
    const group = new Group();
    group.name = this.name;
    this.buckets.forEach((bucket, key) => {
      const mesh = new InstancedMesh(bucket.geometry, bucket.material, bucket.matrices.length);
      mesh.name = `${this.name}-${key}`;
      mesh.userData.smallPropBatch = true;
      mesh.userData.smallPropInstances = bucket.matrices.length;
      mesh.userData.smallPropCellX = bucket.cellX;
      mesh.userData.smallPropCellZ = bucket.cellZ;
      bucket.matrices.forEach((matrix, index) => {
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, bucket.colors[index]);
      });
      let centerX = 0;
      let centerZ = 0;
      bucket.matrices.forEach((matrix) => {
        const elements = matrix.elements;
        centerX += elements[12];
        centerZ += elements[14];
      });
      centerX /= Math.max(1, bucket.matrices.length);
      centerZ /= Math.max(1, bucket.matrices.length);
      let radius = 0;
      bucket.matrices.forEach((matrix) => {
        const elements = matrix.elements;
        radius = Math.max(radius, Math.hypot(elements[12] - centerX, elements[14] - centerZ));
      });
      mesh.userData.smallPropCenterX = centerX;
      mesh.userData.smallPropCenterZ = centerZ;
      mesh.userData.smallPropRadius = radius + SmallPropInstancer.CELL_SIZE * 0.72;
      mesh.frustumCulled = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
      group.add(mesh);
    });
    return group;
  }

  private addPrimitive(
    kind: SmallPropGeometryKind,
    color: string,
    x: number,
    y: number,
    z: number,
    yaw: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
    pitch = 0,
    roll = 0,
  ) {
    const cellX = Math.floor(x / SmallPropInstancer.CELL_SIZE);
    const cellZ = Math.floor(z / SmallPropInstancer.CELL_SIZE);
    const key = `${kind}:${cellX},${cellZ}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        kind,
        cellX,
        cellZ,
        geometry: this.createGeometry(kind),
        material: new MeshLambertMaterial({ color: "#ffffff" }),
        matrices: [],
        colors: [],
      };
      this.buckets.set(key, bucket);
    }

    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(pitch, yaw, roll);
    this.dummy.scale.set(scaleX, scaleY, scaleZ);
    this.dummy.updateMatrix();
    bucket.matrices.push(this.dummy.matrix.clone());
    bucket.colors.push(new Color(color));
  }

  transformLocal(x: number, z: number, yaw: number) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return {
      x: x * cos + z * sin,
      z: -x * sin + z * cos,
    };
  }

  private createGeometry(kind: SmallPropGeometryKind) {
    switch (kind) {
      case "cone-5":
        return new ConeGeometry(1, 1, 5);
      case "flower-stem":
        return new CylinderGeometry(0.6, 1, 1, 5);
      case "mushroom-stem":
        return new CylinderGeometry(0.75, 1, 1, 6);
      case "sphere-6-5":
        return new SphereGeometry(1, 6, 5);
      case "sphere-5-4":
      default:
        return new SphereGeometry(1, 5, 4);
    }
  }
}

function _makeFlower(color: string, scale: number, stemHeight: number) {
  const group = new Group();
  const stem = new Mesh(
    new CylinderGeometry(0.03 * scale, 0.05 * scale, stemHeight * scale, 5),
    new MeshLambertMaterial({ color: "#699953" }),
  );
  stem.position.y = stemHeight * scale * 0.5;
  group.add(stem);

  const center = new Mesh(new SphereGeometry(0.12 * scale, 5, 4), new MeshLambertMaterial({ color: "#f6d888" }));
  center.position.y = stemHeight * scale;
  group.add(center);

  for (let i = 0; i < 5; i += 1) {
    const petal = new Mesh(new SphereGeometry(0.14 * scale, 5, 4), new MeshLambertMaterial({ color }));
    const angle = (i / 5) * Math.PI * 2;
    petal.scale.set(1.2, 0.72, 1.05);
    petal.position.set(Math.cos(angle) * 0.18 * scale, stemHeight * scale, Math.sin(angle) * 0.18 * scale);
    group.add(petal);
  }

  return group;
}

function _makeCloverPatch(radius: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, z, s] of [
    [0, 0, 1],
    [0.24, 0.08, 0.82],
    [-0.22, -0.1, 0.88],
    [0.04, -0.22, 0.76],
  ]) {
    const leaf = new Mesh(new SphereGeometry(radius * s, 5, 4), material);
    leaf.scale.set(1.2, 0.18, 1.2);
    leaf.position.set(x * radius * 2.4, 0.05, z * radius * 2.4);
    group.add(leaf);
  }
  return group;
}

export function makeGrassClump(scale: number, color: string) {
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

function _makeReedCluster(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, z, rot, h] of [
    [-0.24, -0.08, -0.18, 1],
    [-0.08, 0.12, 0.06, 1.18],
    [0.12, -0.02, 0.2, 1.08],
    [0.28, 0.14, 0.34, 0.86],
  ]) {
    const reed = new Mesh(new ConeGeometry(0.055 * scale, h * scale, 5), material);
    reed.position.set(x * scale, h * scale * 0.5, z * scale);
    reed.rotation.z = rot;
    group.add(reed);
  }
  return group;
}

function _makeTinyRock(scale: number, color: string) {
  const rock = new Mesh(new SphereGeometry(0.28 * scale, 6, 5), new MeshLambertMaterial({ color }));
  rock.scale.set(1.15, 0.72, 1);
  return rock;
}

export function makeBankPebbleCluster(scale: number, tone: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: tone });
  for (const [x, z, sx, sy, sz] of [
    [0, 0, 1.28, 0.28, 0.86],
    [0.46, -0.16, 0.78, 0.22, 0.56],
    [-0.42, 0.18, 0.92, 0.24, 0.64],
  ]) {
    const pebble = new Mesh(new SphereGeometry(0.34 * scale, 5, 4), material);
    pebble.scale.set(sx * scale, sy * scale, sz * scale);
    pebble.position.set(x * scale, 0.08 * scale, z * scale);
    group.add(pebble);
  }
  return group;
}

function _makeBankLipPebbleTrail(scale: number, tone: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: tone });
  for (const [x, z, width, depth, yaw] of [
    [-1.16, -0.08, 0.78, 0.36, -0.18],
    [-0.46, 0.12, 0.54, 0.28, 0.28],
    [0.18, -0.02, 0.66, 0.32, -0.08],
    [0.86, 0.1, 0.5, 0.26, 0.2],
  ]) {
    const pebble = new Mesh(new SphereGeometry(0.28 * scale, 5, 4), material);
    pebble.scale.set(width * scale, 0.18 * scale, depth * scale);
    pebble.position.set(x * scale, 0.07 * scale, z * scale);
    pebble.rotation.y = yaw;
    group.add(pebble);
  }
  return group;
}

export function makeBankWashPatch(scale: number, tone: string, opacity: number) {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: tone,
    transparent: true,
    opacity: opacity * 0.36,
    depthWrite: false,
    side: DoubleSide,
  });

  for (const [x, z, width, depth, rotation, alpha] of [
    [0, 0, 3.2, 1.28, 0, 1],
    [0.84, -0.28, 1.8, 0.62, 0.42, 0.72],
    [-0.94, 0.22, 1.54, 0.52, -0.36, 0.58],
  ]) {
    const patchMaterial = alpha === 1 ? material : material.clone();
    patchMaterial.opacity *= alpha;
    const patch = new Mesh(new PlaneGeometry(width * scale, depth * scale), patchMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rotation;
    patch.position.set(x * scale, 0.035, z * scale);
    group.add(patch);
  }

  return group;
}

export function makeShoreShelfPatch(scale: number, tone: string, opacity: number) {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: tone,
    transparent: true,
    opacity: opacity * 0.3,
    depthWrite: false,
    side: DoubleSide,
  });

  for (const [x, z, width, depth, rotation, alpha] of [
    [0, 0, 4.8, 1.35, 0.02, 1],
    [1.24, -0.18, 2.5, 0.68, 0.28, 0.58],
    [-1.32, 0.22, 2.2, 0.6, -0.32, 0.46],
  ]) {
    const patchMaterial = alpha === 1 ? material : material.clone();
    patchMaterial.opacity *= alpha;
    const patch = new Mesh(new PlaneGeometry(width * scale, depth * scale), patchMaterial);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rotation;
    patch.position.set(x * scale, 0.032, z * scale);
    group.add(patch);
  }

  return group;
}

export function makeCanopyShadowPatch(_scale: number, _tone: string, _opacity: number) {
  return new Group();
}

function _makeBankSedgePatch(scale: number, tone: "meadow" | "foothill" | "alpine") {
  const group = new Group();
  const mossColor = tone === "meadow" ? "#8fb66b" : tone === "foothill" ? "#738f61" : "#697d68";
  const grassColor = tone === "meadow" ? "#7fa958" : tone === "foothill" ? "#6f8b5a" : "#667960";
  const pebbleColor = tone === "alpine" ? "#aeb0a2" : "#c5bb9a";

  const moss = makeMossPatch(0.62 * scale, mossColor);
  moss.position.set(-0.34 * scale, 0, -0.1 * scale);
  group.add(moss);

  const grass = makeGrassClump(0.62 * scale, grassColor);
  grass.position.set(0.34 * scale, 0, 0.18 * scale);
  group.add(grass);

  const pebble = makeBankPebbleCluster(0.44 * scale, pebbleColor);
  pebble.position.set(0.05 * scale, 0.02 * scale, -0.42 * scale);
  group.add(pebble);

  return group;
}

export function makeBush(scale: number, color: string) {
  const group = new Group();
  const leafMaterial = new MeshLambertMaterial({ color });
  const darkLeafMaterial = new MeshLambertMaterial({ color: makeTint(color, "#315b39", 0.34) });
  const lightLeafMaterial = new MeshLambertMaterial({ color: makeTint(color, "#e6df6a", 0.34) });
  const branchMaterial = new MeshLambertMaterial({ color: "#725238" });
  const blossomMaterial = new MeshLambertMaterial({ color: "#fff6de" });

  for (const [x, z, height, roll] of [
    [-0.34, 0.12, 0.72, -0.34],
    [-0.12, -0.12, 0.82, -0.12],
    [0.18, 0.04, 0.78, 0.2],
    [0.38, -0.08, 0.62, 0.36],
  ]) {
    const branch = new Mesh(new CylinderGeometry(0.035 * scale, 0.055 * scale, height * scale, 6), branchMaterial);
    branch.position.set((x as number) * scale, (height as number) * scale * 0.34, (z as number) * scale);
    branch.rotation.z = roll as number;
    group.add(branch);
  }

  for (const [x, y, z, sx, sy, sz, material] of [
    [0, 0.58, 0, 0.92, 0.56, 0.82, leafMaterial],
    [-0.5, 0.48, 0.02, 0.62, 0.42, 0.58, darkLeafMaterial],
    [0.5, 0.5, -0.02, 0.62, 0.42, 0.58, leafMaterial],
    [-0.2, 0.88, -0.08, 0.54, 0.34, 0.5, lightLeafMaterial],
    [0.26, 0.82, 0.1, 0.5, 0.32, 0.46, lightLeafMaterial],
    [0.02, 0.32, 0.46, 0.62, 0.24, 0.42, darkLeafMaterial],
    [-0.08, 0.34, -0.44, 0.58, 0.24, 0.42, darkLeafMaterial],
  ]) {
    const puff = new Mesh(new SphereGeometry(scale, 6, 5), material as MeshLambertMaterial);
    puff.scale.set(sx as number, sy as number, sz as number);
    puff.position.set((x as number) * scale, (y as number) * scale, (z as number) * scale);
    group.add(puff);
  }

  for (const [x, y, z, size] of [
    [-0.42, 0.72, 0.42, 0.09],
    [0.42, 0.68, 0.34, 0.08],
    [0.1, 0.96, -0.34, 0.075],
  ]) {
    const blossom = new Mesh(new SphereGeometry((size as number) * scale, 6, 4), blossomMaterial);
    blossom.scale.set(1, 0.82, 1);
    blossom.position.set((x as number) * scale, (y as number) * scale, (z as number) * scale);
    group.add(blossom);
  }
  return group;
}

export function makeMossPatch(scale: number, color: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color });
  for (const [x, z, radius] of [
    [0, 0, 0.72],
    [0.34, -0.12, 0.46],
    [-0.28, 0.16, 0.42],
  ]) {
    const puff = new Mesh(new SphereGeometry(radius * scale, 6, 5), material);
    puff.scale.set(1.35, 0.24, 1.18);
    puff.position.set(x * scale, 0.06 * scale, z * scale);
    group.add(puff);
  }
  return group;
}

export function makeRockFormation(scale: number, tone: string) {
  const group = new Group();
  const material = new MeshLambertMaterial({ color: tone });
  for (const [x, y, z, sx, sy, sz] of [
    [0, 0.56, 0, 1.3, 1.8, 1.1],
    [0.48, 0.42, -0.18, 0.92, 1.24, 0.86],
    [-0.44, 0.34, 0.22, 0.82, 1.02, 0.78],
  ]) {
    const rock = markCameraCollider(new Mesh(new SphereGeometry(0.72 * scale, 6, 5), material));
    rock.scale.set(sx * scale, sy * scale, sz * scale);
    rock.position.set(x * scale, y * scale, z * scale);
    group.add(rock);
  }
  return group;
}

export function makeMossyStump(scale: number) {
  const group = new Group();
  group.name = "forest-grove-mossy-stump";
  const barkMaterial = new MeshLambertMaterial({ color: forestGroveProps.stumpBark });
  const topMaterial = new MeshLambertMaterial({ color: forestGroveProps.stumpTop });
  const mossMaterial = new MeshLambertMaterial({ color: forestGroveProps.mossGlow });
  const rootMaterial = new MeshLambertMaterial({ color: forestGroveProps.rootDark });

  const trunk = markCameraCollider(
    new Mesh(new CylinderGeometry(0.54 * scale, 0.68 * scale, 1.26 * scale, 9), barkMaterial),
  );
  trunk.position.y = 0.63 * scale;
  trunk.rotation.z = -0.04;
  group.add(trunk);

  const top = new Mesh(new CylinderGeometry(0.56 * scale, 0.5 * scale, 0.12 * scale, 9), topMaterial);
  top.position.y = 1.28 * scale;
  top.rotation.z = -0.035;
  group.add(top);

  const mossCap = new Mesh(new SphereGeometry(0.36 * scale, 7, 5), mossMaterial);
  mossCap.position.set(-0.18 * scale, 1.36 * scale, 0.12 * scale);
  mossCap.scale.set(1.25, 0.22, 0.9);
  group.add(mossCap);

  for (const [x, z, yaw, length] of [
    [-0.58, -0.16, -0.48, 1.12],
    [0.54, 0.12, 0.44, 0.94],
    [0.02, 0.64, 1.48, 0.78],
  ] as const) {
    const root = new Mesh(new CylinderGeometry(0.055 * scale, 0.09 * scale, length * scale, 6), rootMaterial);
    root.position.set(x * scale, 0.16 * scale, z * scale);
    root.rotation.z = Math.PI * 0.5;
    root.rotation.y = yaw;
    group.add(root);
  }

  const moss = makeMossPatch(0.42 * scale, forestGroveProps.mossGlow);
  moss.position.set(0.34 * scale, 0.05 * scale, -0.34 * scale);
  group.add(moss);

  return group;
}

export function makeFernPatch(scale: number, tone: string = forestGroveProps.fern) {
  const group = new Group();
  group.name = "forest-grove-fern-patch";
  const leafMaterial = new MeshLambertMaterial({
    color: tone,
    side: DoubleSide,
  });
  const ribMaterial = new MeshLambertMaterial({ color: makeTint(tone, "#d3e58b", 0.18) });

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const length = scale * (0.88 + (i % 3) * 0.13);
    const width = scale * (0.18 + (i % 2) * 0.04);
    const leaf = new Mesh(new PlaneGeometry(width, length), leafMaterial);
    leaf.position.set(Math.cos(angle) * length * 0.26, 0.1 * scale, Math.sin(angle) * length * 0.26);
    leaf.rotation.x = -Math.PI / 2 + 0.24;
    leaf.rotation.y = angle;
    leaf.rotation.z = i % 2 === 0 ? -0.08 : 0.08;
    group.add(leaf);
  }

  const rib = new Mesh(new ConeGeometry(0.055 * scale, 0.96 * scale, 5), ribMaterial);
  rib.position.y = 0.26 * scale;
  rib.rotation.z = 0.12;
  group.add(rib);

  return group;
}

export function makeWoodlandLightShaft(scale: number) {
  const group = new Group();
  group.name = "forest-grove-light-shaft";
  const material = new MeshBasicMaterial({
    color: forestGroveProps.lightShaft,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });

  for (const [x, z, width, height, yaw, alpha] of [
    [0, 0, 1.25, 9.4, 0, 1],
    [0.92, 0.5, 0.72, 7.2, 0.18, 0.62],
    [-0.78, -0.36, 0.62, 6.4, -0.16, 0.5],
  ] as const) {
    const shaftMaterial = alpha === 1 ? material : material.clone();
    shaftMaterial.opacity *= alpha;
    const shaft = new Mesh(new PlaneGeometry(width * scale, height * scale), shaftMaterial);
    shaft.position.set(x * scale, height * scale * 0.5 + 0.45 * scale, z * scale);
    shaft.rotation.y = yaw;
    shaft.rotation.z = -0.16;
    group.add(shaft);
  }

  return group;
}

export function makeCodexCaveMouth(scale: number) {
  const group = new Group();
  group.name = "codex-cave-mouth";
  const shadowMaterial = new MeshBasicMaterial({
    color: "#78856c",
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: DoubleSide,
  });
  const stoneMaterial = new MeshLambertMaterial({ color: "#9d998f" });
  const mossMaterial = new MeshLambertMaterial({ color: "#70865c" });

  const mouth = new Mesh(new CircleGeometry(1.12 * scale, 18), shadowMaterial);
  mouth.scale.set(1, 1.2, 0.7);
  mouth.position.set(0, 1.02 * scale, -0.18 * scale);
  group.add(mouth);

  for (const [x, y, z, sx, sy, sz] of [
    [-0.78, 0.58, 0, 0.42, 1.1, 0.34],
    [0.8, 0.54, 0, 0.42, 1.02, 0.36],
    [0, 1.42, -0.02, 1.32, 0.42, 0.44],
    [-0.32, 0.18, 0.1, 0.56, 0.26, 0.4],
    [0.42, 0.16, 0.1, 0.5, 0.22, 0.36],
  ] as const) {
    const stone = markCameraCollider(new Mesh(new SphereGeometry(0.72 * scale, 6, 5), stoneMaterial));
    stone.position.set(x * scale, y * scale, z * scale);
    stone.scale.set(sx * scale, sy * scale, sz * scale);
    group.add(stone);
  }

  const moss = makeMossPatch(0.52 * scale, "#70865c");
  moss.position.set(-0.38 * scale, 0.14 * scale, 0.42 * scale);
  group.add(moss);
  const sprig = makeGrassClump(0.46 * scale, "#819a62");
  sprig.position.set(0.55 * scale, 0.06 * scale, 0.38 * scale);
  group.add(sprig);

  const lip = new Mesh(new CylinderGeometry(0.04 * scale, 0.06 * scale, 1.18 * scale, 5), mossMaterial);
  lip.position.set(0, 1.63 * scale, 0.2 * scale);
  lip.rotation.z = Math.PI * 0.5;
  group.add(lip);
  return group;
}

export function makeCodexRuinMarker(scale: number) {
  const group = new Group();
  group.name = "codex-ruin-marker";
  const stoneMaterial = new MeshLambertMaterial({ color: "#bdb5a2" });
  const capMaterial = new MeshLambertMaterial({ color: "#d1c7ad" });

  for (const x of [-0.48, 0.48]) {
    const pillar = markCameraCollider(
      new Mesh(new CylinderGeometry(0.16 * scale, 0.22 * scale, 1.65 * scale, 6), stoneMaterial),
    );
    pillar.position.set(x * scale, 0.82 * scale, 0);
    pillar.rotation.z = x < 0 ? -0.05 : 0.04;
    group.add(pillar);
  }

  const lintel = markCameraCollider(new Mesh(new BoxGeometry(1.46 * scale, 0.28 * scale, 0.34 * scale), capMaterial));
  lintel.position.set(0, 1.68 * scale, 0);
  lintel.rotation.z = -0.04;
  group.add(lintel);

  const baseLeft = new Mesh(new BoxGeometry(0.54 * scale, 0.24 * scale, 0.42 * scale), stoneMaterial);
  baseLeft.position.set(-0.52 * scale, 0.12 * scale, 0.08 * scale);
  group.add(baseLeft);
  const baseRight = new Mesh(new BoxGeometry(0.62 * scale, 0.18 * scale, 0.38 * scale), stoneMaterial);
  baseRight.position.set(0.55 * scale, 0.09 * scale, -0.04 * scale);
  baseRight.rotation.y = 0.14;
  group.add(baseRight);

  const moss = makeMossPatch(0.36 * scale, "#728a5b");
  moss.position.set(0.2 * scale, 0.18 * scale, 0.34 * scale);
  group.add(moss);
  return group;
}

export function makeAlpineHerbCluster(scale: number, flowerTone = "#f3e7aa") {
  const group = new Group();
  const leafMaterial = new MeshLambertMaterial({ color: "#708a61" });
  const flowerMaterial = new MeshLambertMaterial({ color: flowerTone });
  for (const [x, z, h, tilt] of [
    [-0.26, -0.08, 0.72, -0.2],
    [-0.08, 0.14, 0.84, 0.08],
    [0.16, -0.04, 0.68, 0.18],
    [0.34, 0.12, 0.56, 0.3],
  ] as const) {
    const stem = new Mesh(new ConeGeometry(0.055 * scale, h * scale, 6), leafMaterial);
    stem.position.set(x * scale, h * scale * 0.5, z * scale);
    stem.rotation.z = tilt;
    group.add(stem);
    if (h > 0.65) {
      const flower = new Mesh(new SphereGeometry(0.095 * scale, 7, 5), flowerMaterial);
      flower.position.set(x * scale, h * scale, z * scale);
      flower.scale.set(1.2, 0.56, 1.2);
      group.add(flower);
    }
  }
  return group;
}

export function makeWaterfallRibbon(height: number, width: number) {
  const group = new Group();

  const makeRibbon = (
    ribbonWidth: number,
    ribbonHeight: number,
    color: string,
    opacity: number,
    x: number,
    z: number,
  ) => {
    const ribbon = new Mesh(
      new PlaneGeometry(ribbonWidth, ribbonHeight, 1, 8),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    ribbon.position.set(x, ribbonHeight * 0.5, z);
    return ribbon;
  };

  const veil = makeRibbon(width * 1.14, height, futureLakeArt.shallowEdge, 0.34, 0, -0.04);
  const blueFall = makeRibbon(width * 0.72, height * 0.96, futureLakeArt.clearSurface, 0.4, -width * 0.08, 0.03);
  const brightFall = makeRibbon(width * 0.44, height * 0.94, "#fbfffb", 0.54, width * 0.08, 0.09);
  const leftThread = makeRibbon(width * 0.12, height * 0.54, "#ffffff", 0.5, -width * 0.34, 0.14);
  const rightThread = makeRibbon(width * 0.1, height * 0.46, "#e8fbff", 0.42, width * 0.36, 0.16);
  leftThread.position.y = height * 0.66;
  rightThread.position.y = height * 0.42;

  const makeFoam = (radius: number, x: number, z: number, color: string, opacity: number) => {
    const foam = new Mesh(
      new CircleGeometry(radius, 18),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.scale.z = 0.4;
    foam.position.set(x, 0.06, z);
    return foam;
  };

  const foamA = makeFoam(width * 0.58, -width * 0.12, 0.42, futureLakeArt.foam, 0.44);
  const foamB = makeFoam(width * 0.42, width * 0.24, 0.58, "#def6ff", 0.34);
  const warmSpray = makeFoam(width * 0.26, width * 0.02, 0.74, futureLakeArt.sunFoam, 0.18);

  for (let i = 0; i < 6; i += 1) {
    const spray = new Mesh(
      new CircleGeometry(width * (0.045 + i * 0.006), 10),
      new MeshBasicMaterial({
        color: i % 2 === 0 ? "#f3fdff" : "#fff4d5",
        transparent: true,
        opacity: 0.14 + (i % 3) * 0.04,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    spray.position.set(Math.sin(i * 1.4) * width * 0.5, height * (0.08 + (i % 4) * 0.08), 0.2 + i * 0.035);
    group.add(spray);
  }

  group.add(veil, blueFall, brightFall, leftThread, rightThread, foamA, foamB, warmSpray);
  return group;
}

export function makeHighlandSprayCloud(scale: number, opacity = 0.18) {
  const group = new Group();
  const colors = ["#f7fdff", "#fff6d8", "#e7fbff"];
  for (let i = 0; i < 7; i += 1) {
    const radius = scale * (0.14 + (i % 4) * 0.034);
    const puff = new Mesh(
      new CircleGeometry(radius, 14),
      new MeshBasicMaterial({
        color: colors[i % colors.length],
        transparent: true,
        opacity: opacity * (0.32 + (i % 3) * 0.1),
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    puff.position.set(
      Math.sin(i * 1.7) * scale * 0.58,
      scale * (0.14 + (i % 5) * 0.15),
      Math.cos(i * 1.1) * scale * 0.14,
    );
    puff.rotation.y = ((i % 3) - 1) * 0.24;
    puff.rotation.z = Math.sin(i * 0.9) * 0.16;
    group.add(puff);
  }
  return group;
}

export function makeHighlandFoamPatch(scale: number, opacity = 0.34) {
  const group = new Group();
  for (let i = 0; i < 4; i += 1) {
    const foam = new Mesh(
      new CircleGeometry(scale * (0.42 - i * 0.045), 20),
      new MeshBasicMaterial({
        color: i % 2 === 0 ? futureLakeArt.foam : futureLakeArt.foamCool,
        transparent: true,
        opacity: opacity * (0.62 - i * 0.08),
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    foam.rotation.x = -Math.PI / 2;
    foam.scale.z = 0.28 + i * 0.05;
    foam.position.set(Math.sin(i * 1.4) * scale * 0.22, 0.03 + i * 0.006, Math.cos(i * 1.9) * scale * 0.18);
    group.add(foam);
  }
  return group;
}

export function makeHighlandWetStone(scale: number) {
  const group = makeRockFormation(scale, "#aeb5aa");
  const shine = new Mesh(
    new PlaneGeometry(0.72 * scale, 0.16 * scale, 1, 1),
    new MeshBasicMaterial({
      color: "#d7e8dd",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  shine.rotation.x = -Math.PI / 2;
  shine.rotation.z = -0.24;
  shine.position.set(-0.12 * scale, 0.42 * scale, 0.28 * scale);
  group.add(shine);
  return group;
}

function _makeMushroom(scale: number, capColor: string) {
  const group = new Group();
  const stem = new Mesh(
    new CylinderGeometry(0.06 * scale, 0.08 * scale, 0.55 * scale, 6),
    new MeshLambertMaterial({ color: "#f3ead5" }),
  );
  stem.position.y = 0.28 * scale;
  const cap = new Mesh(new SphereGeometry(0.2 * scale, 6, 4), new MeshLambertMaterial({ color: capColor }));
  cap.scale.set(1.4, 0.72, 1.4);
  cap.position.y = 0.56 * scale;
  group.add(stem, cap);
  return group;
}
