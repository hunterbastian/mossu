import {
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

type MountainPlacement = [x: number, z: number, scaleX: number, scaleY: number, scaleZ: number, yaw: number, lift: number];

function buildMountainGeometry(): BufferGeometry {
  const SEGMENTS = 20;
  const lobes: BufferGeometry[] = [];
  const lobeSpec: [radiusBottom: number, radiusTop: number, height: number, yOffset: number, snowFraction: number][] = [
    [1.12, 0.74, 0.34, 0, 0],
    [0.82, 0.44, 0.44, 0.3, 0.08],
    [0.48, 0.12, 0.5, 0.68, 0.54],
    [0.24, 0.02, 0.34, 1.08, 0.86],
  ];

  const colorBase = new Color("#dce9d4");
  const colorRock = new Color("#dce3de");
  const colorShade = new Color("#d2ddd5");
  const colorSnow = new Color("#fffdf2");

  lobes.push(
    ...lobeSpec.map(([radiusBottom, _radiusTop, height, yOffset, snowFraction]) => {
      const geometry = new ConeGeometry(radiusBottom, height, SEGMENTS, 3, false);
      geometry.translate(0, yOffset + height * 0.5, 0);

      const positions = geometry.attributes.position.array as Float32Array;
      const vertexCount = positions.length / 3;
      const colors = new Float32Array(vertexCount * 3);
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const vx = positions[vertex * 3];
        const vy = positions[vertex * 3 + 1];
        const heightRatio = Math.max(0, Math.min(1, (vy - yOffset) / height));
        const color = new Color();
        if (heightRatio < 0.5) {
          color.lerpColors(colorBase, colorRock, heightRatio * 2);
        } else {
          color.lerpColors(colorRock, colorSnow, (heightRatio - 0.5) * 2 * snowFraction);
        }
        color.lerp(colorShade, Math.max(0, -vx) * 0.012 + Math.max(0, 0.42 - heightRatio) * 0.014);
        colors[vertex * 3] = color.r;
        colors[vertex * 3 + 1] = color.g;
        colors[vertex * 3 + 2] = color.b;
      }
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
      return geometry;
    }),
  );

  const merged = mergeGeometries(lobes, false);
  lobes.forEach((geometry) => geometry.dispose());
  return merged;
}

function addMountainLayer(
  group: Group,
  placements: readonly MountainPlacement[],
  geometry: BufferGeometry,
  material: MeshBasicMaterial,
  renderOrder?: number,
) {
  placements.forEach(([x, z, scaleX, scaleY, scaleZ, yaw, lift]) => {
    const mountain = new Mesh(geometry, material);
    mountain.scale.set(scaleX, scaleY, scaleZ);
    mountain.rotation.y = yaw;
    mountain.position.set(x, lift, z);
    if (renderOrder !== undefined) {
      mountain.renderOrder = renderOrder;
    }
    group.add(mountain);
  });
}

export function buildMountainBackdrop() {
  const group = new Group();
  group.name = "mountain-backdrop";

  const mountainMaterial = new MeshBasicMaterial({
    vertexColors: true,
    color: "#edf4e8",
    transparent: true,
    opacity: 0.38,
    fog: true,
    depthWrite: false,
  });
  const farMountainMaterial = new MeshBasicMaterial({
    vertexColors: true,
    color: "#d6edf0",
    transparent: true,
    opacity: 0.24,
    fog: true,
    depthWrite: false,
  });
  const sharedGeometry = buildMountainGeometry();

  const nearBackdrop: readonly MountainPlacement[] = [
    [-174, 178, 82, 108, 96, -0.2, 8],
    [-128, 226, 112, 152, 122, 0.08, 12],
    [-58, 252, 126, 174, 128, -0.1, 15],
    [8, 238, 146, 184, 132, -0.04, 12],
    [82, 248, 122, 158, 116, 0.18, 14],
    [124, 212, 116, 148, 120, 0.22, 10],
    [166, 176, 72, 96, 82, 0.4, 7],
    [-48, 172, 58, 78, 66, -0.52, 6],
    [62, 162, 64, 84, 70, 0.34, 6],
  ];
  const farBackdrop: readonly MountainPlacement[] = [
    [-260, 284, 160, 170, 150, -0.22, 2],
    [-168, 336, 210, 218, 176, 0.04, 5],
    [-46, 366, 250, 244, 196, -0.08, 6],
    [96, 344, 220, 226, 178, 0.12, 5],
    [224, 286, 170, 178, 148, 0.28, 3],
    [-278, 112, 96, 116, 118, -0.38, -2],
    [284, 134, 108, 126, 124, 0.36, -1],
  ];

  addMountainLayer(group, nearBackdrop, sharedGeometry, mountainMaterial);
  addMountainLayer(group, farBackdrop, sharedGeometry, farMountainMaterial, -1);

  return group;
}
