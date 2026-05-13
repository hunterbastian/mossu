import {
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { worldForageables } from "../../simulation/world";
import type { ForageableKind } from "../../simulation/worldTypes";

export interface ForageableVisual {
  id: string;
  kind: ForageableKind;
  group: Group;
  baseY: number;
  bobOffset: number;
  swayOffset: number;
  spinDirection: number;
}

function createSeedPickup(seed: number) {
  const group = new Group();
  const huskMaterial = new MeshLambertMaterial({ color: seed % 2 === 0 ? "#d9a85f" : "#c88f52" });
  const capMaterial = new MeshLambertMaterial({ color: "#7aa55f" });

  [-0.28, 0, 0.27].forEach((offset, index) => {
    const seedMesh = new Mesh(new SphereGeometry(0.24 + index * 0.02, 12, 8), huskMaterial);
    seedMesh.position.set(offset, 0.24 + index * 0.02, (index - 1) * 0.08);
    seedMesh.scale.set(0.82, 1.18, 0.72);
    seedMesh.rotation.z = offset * -1.6;
    group.add(seedMesh);
  });

  const sprout = new Mesh(new PlaneGeometry(0.6, 0.22, 1, 1), capMaterial);
  sprout.position.set(0.06, 0.56, 0);
  sprout.rotation.set(-0.4, 0.2, -0.38);
  group.add(sprout);

  group.scale.setScalar(1 + (seed % 3) * 0.05);
  return group;
}

function createShellPickup(seed: number) {
  const group = new Group();
  const shellMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#f2dfc9" : "#e9d5c5",
  });
  const ridgeMaterial = new MeshLambertMaterial({ color: "#d6b89e" });

  const shell = new Mesh(new SphereGeometry(0.56, 16, 10), shellMaterial);
  shell.scale.set(1.18, 0.34, 0.8);
  shell.position.y = 0.25;
  group.add(shell);

  [-0.28, -0.12, 0.04, 0.2, 0.35].forEach((x, index) => {
    const ridge = new Mesh(new CylinderGeometry(0.024, 0.035, 0.72 - Math.abs(x) * 0.7, 6), ridgeMaterial);
    ridge.position.set(x, 0.32, 0.03);
    ridge.rotation.set(Math.PI / 2, 0, 0.15 + index * 0.05);
    group.add(ridge);
  });

  return group;
}

function createMossTuftPickup(seed: number) {
  const group = new Group();
  const baseMaterial = new MeshLambertMaterial({ color: seed % 2 === 0 ? "#5f9d68" : "#6baa62" });
  const tipMaterial = new MeshLambertMaterial({ color: "#9edc83" });

  [-0.34, -0.15, 0.05, 0.24, 0.38].forEach((offset, index) => {
    const strand = new Mesh(new ConeGeometry(0.12 + (index % 2) * 0.03, 0.72 + index * 0.08, 7), baseMaterial);
    strand.position.set(offset, 0.36 + index * 0.02, (index - 2) * 0.06);
    strand.rotation.z = offset * -0.8;
    group.add(strand);
  });

  const glowTip = new Mesh(new SphereGeometry(0.18, 10, 8), tipMaterial);
  glowTip.position.set(0.02, 0.82, 0);
  glowTip.scale.set(1.25, 0.55, 1);
  group.add(glowTip);

  group.scale.setScalar(0.96 + (seed % 3) * 0.06);
  return group;
}

function createBerryPickup(seed: number) {
  const group = new Group();
  const stemMaterial = new MeshLambertMaterial({ color: "#5f7845" });
  const berryMaterial = new MeshLambertMaterial({
    color: seed % 3 === 0 ? "#ffba66" : seed % 2 === 0 ? "#ff8b78" : "#ffd06b",
  });
  const leafMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#7cc170" : "#6aa462",
    side: DoubleSide,
  });

  const stem = new Mesh(new CylinderGeometry(0.1, 0.16, 0.95, 8), stemMaterial);
  stem.position.y = 0.52;
  group.add(stem);

  [
    [0, 0.98, 0],
    [-0.34, 0.72, 0.1],
    [0.31, 0.78, -0.12],
    [0.06, 0.58, 0.3],
  ].forEach(([x, y, z], index) => {
    const berry = new Mesh(new SphereGeometry(index === 0 ? 0.34 : 0.28, 12, 10), berryMaterial);
    berry.position.set(x as number, y as number, z as number);
    berry.scale.set(1, 0.92, 1);
    group.add(berry);
  });

  const leaf = new Mesh(new PlaneGeometry(0.68, 0.3, 1, 1), leafMaterial);
  leaf.position.set(0.14, 1.03, -0.06);
  leaf.rotation.set(-0.5, 0.45, -0.28);
  group.add(leaf);

  group.scale.setScalar(1 + (seed % 3) * 0.08);
  return group;
}

function createSmoothStonePickup(seed: number) {
  const group = new Group();
  const stoneMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#9eb2b2" : "#8fa4b8",
  });
  const highlightMaterial = new MeshLambertMaterial({
    color: "#cbd9d4",
    transparent: true,
    opacity: 0.82,
    side: DoubleSide,
  });

  const stone = new Mesh(new SphereGeometry(0.52, 16, 10), stoneMaterial);
  stone.scale.set(1.34, 0.36, 0.86);
  stone.position.y = 0.24;
  group.add(stone);

  const shine = new Mesh(new PlaneGeometry(0.48, 0.12, 1, 1), highlightMaterial);
  shine.position.set(-0.12, 0.43, 0.24);
  shine.rotation.set(-0.5, 0.1, -0.22);
  group.add(shine);

  return group;
}

function createFeatherPickup(seed: number) {
  const group = new Group();
  const shaftMaterial = new MeshLambertMaterial({ color: "#d8bc88" });
  const vaneMaterial = new MeshLambertMaterial({
    color: seed % 2 === 0 ? "#f4ead2" : "#dbe9f3",
    transparent: true,
    opacity: 0.92,
    side: DoubleSide,
  });

  const shaft = new Mesh(new CylinderGeometry(0.025, 0.035, 1.18, 7), shaftMaterial);
  shaft.position.y = 0.58;
  shaft.rotation.z = -0.28;
  group.add(shaft);

  const leftVane = new Mesh(new PlaneGeometry(0.34, 0.9, 1, 1), vaneMaterial);
  leftVane.position.set(-0.16, 0.74, 0);
  leftVane.rotation.set(0, 0.1, -0.42);
  group.add(leftVane);

  const rightVane = new Mesh(new PlaneGeometry(0.32, 0.82, 1, 1), vaneMaterial.clone());
  rightVane.position.set(0.18, 0.7, 0.02);
  rightVane.rotation.set(0, -0.12, 0.22);
  group.add(rightVane);

  group.scale.setScalar(1.05 + (seed % 3) * 0.05);
  return group;
}

function createForageablePickup(kind: ForageableKind, seed: number) {
  switch (kind) {
    case "seed":
      return createSeedPickup(seed);
    case "shell":
      return createShellPickup(seed);
    case "moss_tuft":
      return createMossTuftPickup(seed);
    case "berry":
      return createBerryPickup(seed);
    case "smooth_stone":
      return createSmoothStonePickup(seed);
    case "feather":
      return createFeatherPickup(seed);
  }
}

function getForageablePickupLift(kind: ForageableKind) {
  switch (kind) {
    case "seed":
    case "shell":
    case "smooth_stone":
      return 0.58;
    case "moss_tuft":
      return 0.78;
    case "berry":
      return 1.15;
    case "feather":
      return 0.92;
  }
}

export function buildForageableVisuals() {
  return worldForageables.map<ForageableVisual>((forageable, index) => {
    const group = createForageablePickup(forageable.kind, index);
    group.position.copy(forageable.position);
    group.position.y += getForageablePickupLift(forageable.kind);
    return {
      id: forageable.id,
      kind: forageable.kind,
      group,
      baseY: group.position.y,
      bobOffset: index * 0.9,
      swayOffset: index * 0.55,
      spinDirection: index % 2 === 0 ? 1 : -1,
    };
  });
}
