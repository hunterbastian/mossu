import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from "three";

export type MossbackTitanPose = "idle" | "hop" | "roll" | "glide" | "sniff" | "rest";

export interface MossbackTitanRig {
  group: Group;
  body: Mesh;
  head: Mesh;
  jaw: Mesh;
  eyes: Mesh[];
  crystals: Mesh[];
  legs: Mesh[];
  shadow: Mesh;
  glow: PointLight;
  update: (time: number, dt: number, pose: MossbackTitanPose) => void;
}

function createLowPolyStone(scale: [number, number, number], material: Material) {
  const mesh = new Mesh(new DodecahedronGeometry(1, 0), material);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  return mesh;
}

export function createMossbackTitanRig(scale = 1): MossbackTitanRig {
  const group = new Group();
  group.name = "mossback-titan";

  const stoneMaterial = new MeshStandardMaterial({
    color: "#848579",
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
  });
  const darkerStoneMaterial = new MeshStandardMaterial({
    color: "#565d51",
    roughness: 0.98,
    metalness: 0.01,
    flatShading: true,
  });
  const warmStoneMaterial = new MeshStandardMaterial({
    color: "#9b9278",
    roughness: 0.9,
    metalness: 0.02,
    flatShading: true,
  });
  const mossMaterial = new MeshLambertMaterial({ color: "#77a744" });
  const darkMossMaterial = new MeshLambertMaterial({ color: "#476f2d" });
  const brightGrassMaterial = new MeshLambertMaterial({ color: "#9fd94d" });
  const treeLeafMaterial = new MeshLambertMaterial({ color: "#57a93a" });
  const treeDarkLeafMaterial = new MeshLambertMaterial({ color: "#2f7e3a" });
  const trunkMaterial = new MeshLambertMaterial({ color: "#8b633f" });
  const waterMaterial = new MeshBasicMaterial({ color: "#64dfee", transparent: true, opacity: 0.72, side: DoubleSide });
  const lichenMaterial = new MeshLambertMaterial({ color: "#b7c37b" });
  const vineMaterial = new MeshLambertMaterial({ color: "#4f7d38" });
  const crystalMaterial = new MeshStandardMaterial({
    color: "#83eadf",
    emissive: "#267b78",
    emissiveIntensity: 0.28,
    roughness: 0.28,
    metalness: 0,
    transparent: true,
    opacity: 0.84,
    flatShading: true,
  });
  const eyeMaterial = new MeshBasicMaterial({ color: "#f4d65d" });
  const mouthMaterial = new MeshBasicMaterial({ color: "#1f211d" });
  const clawMaterial = new MeshStandardMaterial({
    color: "#d1c5a3",
    roughness: 0.8,
    metalness: 0,
    flatShading: true,
  });
  const flowerMaterial = new MeshBasicMaterial({ color: "#c9a5e8", transparent: true, opacity: 0.9, side: DoubleSide });
  const mushroomStemMaterial = new MeshLambertMaterial({ color: "#dfd0a4" });
  const mushroomCapMaterial = new MeshLambertMaterial({ color: "#b98258" });

  const shadow = new Mesh(
    new CircleGeometry(1, 32),
    new MeshBasicMaterial({
      color: "#233014",
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(14, 9, 1);
  group.add(shadow);

  const glow = new PointLight("#77f1dc", 0.35, 58, 1.8);
  glow.position.set(0, 12.8, -1.2);
  group.add(glow);

  const body = createLowPolyStone([10.5, 4.9, 7.6], stoneMaterial);
  body.position.y = 6.6;
  body.rotation.z = -0.04;
  group.add(body);

  const islandDeck = new Mesh(new CylinderGeometry(7.1, 8.05, 1.05, 18, 1), brightGrassMaterial);
  islandDeck.scale.set(0.96, 1, 0.58);
  islandDeck.position.set(0.1, 10.72, -2.75);
  islandDeck.rotation.y = 0.12;
  group.add(islandDeck);

  const mossBlanket = new Mesh(new SphereGeometry(1, 13, 8), mossMaterial);
  mossBlanket.scale.set(8.65, 1.05, 5.35);
  mossBlanket.position.set(-0.28, 11.12, -2.1);
  group.add(mossBlanket);

  const shoulderMoss = new Mesh(new SphereGeometry(1, 10, 6), darkMossMaterial);
  shoulderMoss.scale.set(4.4, 0.7, 2.3);
  shoulderMoss.position.set(0, 9.6, 5.35);
  shoulderMoss.rotation.x = 0.16;
  group.add(shoulderMoss);

  const head = createLowPolyStone([5.7, 3.55, 4.9], darkerStoneMaterial);
  head.position.set(0, 6.2, 8.5);
  head.rotation.x = 0.08;
  group.add(head);

  const snout = createLowPolyStone([3.3, 1.55, 2.15], warmStoneMaterial);
  snout.position.set(0, 5.92, 12.35);
  snout.rotation.x = -0.08;
  group.add(snout);

  const browLeft = createLowPolyStone([1.85, 0.72, 1.15], stoneMaterial);
  browLeft.position.set(-1.9, 7.35, 11.9);
  browLeft.rotation.set(0.12, -0.18, -0.38);
  const browRight = browLeft.clone();
  browRight.position.x = 1.9;
  browRight.rotation.z = 0.38;
  group.add(browLeft, browRight);

  [-1, 1].forEach((side) => {
    const cheek = createLowPolyStone([1.38, 0.78, 1.9], stoneMaterial);
    cheek.position.set(side * 3.02, 5.52, 10.9);
    cheek.rotation.set(-0.12, side * 0.24, side * 0.34);
    group.add(cheek);

    const horn = new Mesh(new ConeGeometry(0.74, 2.8, 6), clawMaterial);
    horn.position.set(side * 2.85, 8.02, 10.72);
    horn.rotation.set(-0.56, 0, side * 0.74);
    group.add(horn);

    const sideSpike = new Mesh(new ConeGeometry(0.5, 2.1, 5), warmStoneMaterial);
    sideSpike.position.set(side * 4.18, 6.55, 9.5);
    sideSpike.rotation.set(0.2, side * 0.75, side * 1.2);
    group.add(sideSpike);
  });

  const jaw = createLowPolyStone([4.2, 1.35, 2.8], darkerStoneMaterial);
  jaw.position.set(0, 4.45, 11.1);
  jaw.rotation.x = -0.18;
  group.add(jaw);

  const mouth = new Mesh(new BoxGeometry(3.4, 0.34, 0.18), mouthMaterial);
  mouth.position.set(0, 5.2, 13.55);
  group.add(mouth);

  const lowerMouth = new Mesh(new BoxGeometry(2.95, 0.2, 0.16), mouthMaterial);
  lowerMouth.position.set(0, 0.72, 2.66);
  jaw.add(lowerMouth);

  for (let i = 0; i < 7; i += 1) {
    const tooth = new Mesh(new ConeGeometry(0.18 + (i % 2) * 0.04, 0.78, 5), clawMaterial);
    tooth.position.set(-1.5 + i * 0.5, 4.8 + (i % 2) * 0.08, 13.66);
    tooth.rotation.x = Math.PI;
    group.add(tooth);
  }

  for (let i = 0; i < 5; i += 1) {
    const tooth = new Mesh(new ConeGeometry(0.14 + (i % 2) * 0.035, 0.58, 5), clawMaterial);
    tooth.position.set(-0.98 + i * 0.49, 0.95 + (i % 2) * 0.06, 2.86);
    tooth.rotation.x = 0.08;
    jaw.add(tooth);
  }

  [-1, 1].forEach((side) => {
    const nostril = new Mesh(new SphereGeometry(0.16, 7, 5), mouthMaterial);
    nostril.scale.set(1.25, 0.62, 0.42);
    nostril.position.set(side * 0.74, 5.82, 13.82);
    group.add(nostril);
  });

  const eyes = [-1, 1].map((side) => {
    const eye = new Mesh(new SphereGeometry(0.48, 12, 8), eyeMaterial);
    eye.scale.set(1, 0.72, 0.32);
    eye.position.set(side * 1.78, 6.35, 12.68);
    group.add(eye);

    const eyeRim = new Mesh(new TorusGeometry(0.55, 0.055, 6, 18), warmStoneMaterial);
    eyeRim.scale.set(1, 0.72, 0.36);
    eyeRim.position.set(side * 1.78, 6.35, 12.66);
    eyeRim.rotation.set(0.05, 0, 0);
    group.add(eyeRim);
    return eye;
  });

  const legs = [
    [-5.8, 2.85, 4.55],
    [5.8, 2.85, 4.55],
    [-5.6, 2.8, -4.95],
    [5.6, 2.8, -4.95],
  ].map(([x, y, z], index) => {
    const leg = new Mesh(new CylinderGeometry(1.6, 2.35, 5.6, 7, 1), darkerStoneMaterial);
    leg.position.set(x, y, z);
    leg.rotation.z = x < 0 ? -0.12 : 0.12;
    leg.rotation.x = z > 0 ? -0.16 : 0.1;
    leg.userData.baseX = x;
    leg.userData.baseY = y;
    leg.userData.baseZ = z;
    leg.userData.swingOffset = index % 2 === 0 ? 0 : Math.PI;
    group.add(leg);

    const ankleMoss = new Mesh(new SphereGeometry(1, 8, 5), index % 2 === 0 ? mossMaterial : darkMossMaterial);
    ankleMoss.scale.set(1.62, 0.34, 1.22);
    ankleMoss.position.set(x, 0.72, z + (z > 0 ? 0.5 : -0.42));
    group.add(ankleMoss);

    for (let clawIndex = 0; clawIndex < 3; clawIndex += 1) {
      const toeSide = clawIndex - 1;
      const claw = new Mesh(new ConeGeometry(0.34, 1.35, 6), clawMaterial);
      claw.position.set(x + toeSide * 0.72, 0.48, z + (z > 0 ? 2.08 : -1.72));
      claw.rotation.x = z > 0 ? Math.PI / 2 + 0.18 : -Math.PI / 2 - 0.18;
      claw.rotation.z = toeSide * 0.12;
      group.add(claw);
    }
    return leg;
  });

  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const shellPlate = createLowPolyStone(
        [1.25 + (col % 3) * 0.18, 0.46, 1.28 + row * 0.16],
        (row + col) % 2 === 0 ? stoneMaterial : warmStoneMaterial,
      );
      shellPlate.position.set(-5.55 + col * 1.85 + (row % 2) * 0.48, 10.82 + row * 0.3, -4.9 + row * 2.15);
      shellPlate.rotation.set(0.18 + row * 0.05, col * 0.16, -0.18 + row * 0.1);
      group.add(shellPlate);
    }
  }

  const crystals: Mesh[] = [];
  for (let i = 0; i < 11; i += 1) {
    const crystal = new Mesh(new ConeGeometry(0.72 + (i % 4) * 0.18, 3.6 + (i % 5) * 0.72, 5), crystalMaterial);
    crystal.position.set((i - 5) * 1.26, 12 + (i % 3) * 0.58, -2.6 + Math.sin(i * 1.7) * 3.4);
    crystal.rotation.set(0.18 + i * 0.04, i * 0.36, (i % 2 === 0 ? 1 : -1) * 0.18);
    group.add(crystal);
    crystals.push(crystal);
  }

  const pond = new Mesh(new CircleGeometry(1.75, 24), waterMaterial);
  pond.scale.set(1.45, 0.74, 1);
  pond.position.set(0.8, 12.08, -1.9);
  pond.rotation.x = -Math.PI / 2;
  group.add(pond);

  const waterfall = new Mesh(new PlaneGeometry(1.35, 3.7, 1, 4), waterMaterial.clone());
  waterfall.position.set(1.75, 9.95, -7.12);
  waterfall.rotation.x = 0.05;
  group.add(waterfall);

  for (let i = 0; i < 9; i += 1) {
    const x = [-3.8, -2.7, -1.3, 2.4, 3.8, 4.35, -4.3, 3.0, 0.25][i] ?? 0;
    const z = [-4.7, -2.0, 0.25, -5.2, -2.7, 0.35, -0.8, 1.4, -5.6][i] ?? 0;
    const treeScale = 0.68 + (i % 3) * 0.18;
    const trunk = new Mesh(new CylinderGeometry(0.12, 0.17, 1.1 * treeScale, 6), trunkMaterial);
    trunk.position.set(x, 12.14 + 0.48 * treeScale, z);
    const lowerLeaves = new Mesh(new ConeGeometry(0.52 * treeScale, 1.06 * treeScale, 7), i % 2 === 0 ? treeDarkLeafMaterial : treeLeafMaterial);
    lowerLeaves.position.set(x, 12.92 + 0.55 * treeScale, z);
    const upperLeaves = new Mesh(new ConeGeometry(0.36 * treeScale, 0.76 * treeScale, 7), treeLeafMaterial);
    upperLeaves.position.set(x, 13.48 + 0.82 * treeScale, z);
    group.add(trunk, lowerLeaves, upperLeaves);
  }

  for (let i = 0; i < 4; i += 1) {
    const peak = new Mesh(new ConeGeometry(0.64 + i * 0.08, 2.7 + i * 0.46, 6), warmStoneMaterial);
    peak.position.set(-1.55 + i * 0.95, 13.1 + i * 0.18, -3.95 + i * 0.24);
    peak.rotation.set(0.08, i * 0.28, (i % 2 === 0 ? 1 : -1) * 0.14);
    group.add(peak);
  }

  for (let i = 0; i < 28; i += 1) {
    const tuft = new Mesh(new SphereGeometry(0.58 + (i % 4) * 0.08, 8, 6), i % 3 === 0 ? darkMossMaterial : mossMaterial);
    tuft.scale.set(1.18 + (i % 3) * 0.12, 0.38 + (i % 2) * 0.08, 0.92 + (i % 4) * 0.06);
    tuft.position.set(-6.7 + (i % 7) * 2.1, 11.3 + Math.sin(i) * 0.24, -5.2 + Math.floor(i / 7) * 2.35);
    tuft.rotation.set(0.1, i * 0.7, 0.05);
    group.add(tuft);
  }

  for (let i = 0; i < 9; i += 1) {
    const lichen = new Mesh(new CircleGeometry(0.26 + (i % 3) * 0.08, 10), lichenMaterial);
    lichen.position.set(-4.8 + (i % 5) * 2.4, 10.98 + (i % 2) * 0.04, -5.25 + Math.floor(i / 5) * 4.2);
    lichen.rotation.set(-Math.PI / 2 + 0.18, i * 0.4, 0);
    group.add(lichen);
  }

  for (let i = 0; i < 7; i += 1) {
    const stem = new Mesh(new CylinderGeometry(0.05, 0.07, 0.58 + (i % 2) * 0.2, 6), mushroomStemMaterial);
    stem.position.set(-5.1 + (i % 4) * 2.4, 11.42, -4.7 + Math.floor(i / 4) * 4.1);
    const cap = new Mesh(new SphereGeometry(0.28 + (i % 2) * 0.08, 8, 5), mushroomCapMaterial);
    cap.scale.set(1.28, 0.48, 1.05);
    cap.position.set(stem.position.x, stem.position.y + 0.38, stem.position.z);
    group.add(stem, cap);
  }

  for (let i = 0; i < 10; i += 1) {
    const flower = new Mesh(new CircleGeometry(0.18 + (i % 3) * 0.025, 8), flowerMaterial);
    flower.position.set(-6 + (i % 5) * 2.7, 11.72 + Math.sin(i) * 0.12, -5.6 + Math.floor(i / 5) * 4.7);
    flower.rotation.set(-0.95, i * 0.7, 0.1);
    group.add(flower);
  }

  const saplingTrunk = new Mesh(new CylinderGeometry(0.12, 0.18, 1.8, 7), vineMaterial);
  saplingTrunk.position.set(3.8, 12.32, -4.7);
  saplingTrunk.rotation.z = -0.16;
  const saplingCrown = new Mesh(new SphereGeometry(0.8, 9, 6), mossMaterial);
  saplingCrown.scale.set(1.4, 0.72, 1.1);
  saplingCrown.position.set(3.55, 13.46, -4.7);
  group.add(saplingTrunk, saplingCrown);

  group.scale.setScalar(scale);

  const rig: MossbackTitanRig = {
    group,
    body,
    head,
    jaw,
    eyes,
    crystals,
    legs,
    shadow,
    glow,
    update: (time, _dt, pose) => updateMossbackTitanRig(rig, time, pose),
  };
  rig.update(0, 1 / 60, "idle");
  return rig;
}

function updateMossbackTitanRig(rig: MossbackTitanRig, time: number, pose: MossbackTitanPose) {
  const speed =
    pose === "roll" ? 1 :
      pose === "hop" ? 0.72 :
        pose === "glide" ? 0.42 :
          pose === "rest" ? 0.08 :
            0.28;
  const alert = pose === "sniff" ? 0.82 : pose === "roll" ? 1 : pose === "hop" ? 0.52 : 0.2;
  const stride = time * MathUtils.lerp(1.45, 3.25, speed);
  const breath = Math.sin(time * (pose === "rest" ? 0.42 : 0.8)) * 0.5 + 0.5;
  const stepLift = Math.sin(stride) * speed;
  const idleMouth = Math.max(0, Math.sin(time * 1.65 - 0.45)) ** 2;
  const mouthOpen =
    pose === "sniff" ? 0.72 + Math.max(0, Math.sin(time * 3.2)) * 0.28 :
      pose === "roll" ? 0.36 + Math.max(0, Math.sin(time * 5.6)) * 0.38 :
        pose === "hop" ? 0.34 :
          pose === "rest" ? 0.04 :
            0.08 + idleMouth * 0.22;

  rig.body.position.y = 6.45 + breath * 0.28 + Math.abs(stepLift) * 0.24;
  rig.body.rotation.x = Math.sin(stride * 0.5) * 0.025;
  rig.body.rotation.z = Math.sin(stride * 0.72) * 0.035;
  rig.head.position.y = 6.15 + breath * 0.18 + alert * 0.22;
  rig.head.rotation.x = 0.08 - alert * 0.2 + Math.sin(time * 1.7) * 0.025;
  rig.jaw.position.y = 4.45 - mouthOpen * 0.68;
  rig.jaw.position.z = 11.1 + mouthOpen * 0.34;
  rig.jaw.rotation.x = -0.18 - mouthOpen * 0.52 + Math.sin(time * 5.4) * 0.035 * alert;
  rig.shadow.scale.set(14 + alert * 2.4, 9 + alert * 1.2, 1);
  rig.glow.intensity = 0.22 + alert * 0.72 + Math.sin(time * 1.4) * 0.04;
  rig.glow.color.set(pose === "roll" ? "#ffb867" : pose === "sniff" ? "#9ff4d6" : "#77f1dc");

  rig.eyes.forEach((eye, index) => {
    const material = eye.material as MeshBasicMaterial;
    material.color.set(pose === "roll" ? "#ffb23c" : pose === "sniff" ? "#ffd85e" : "#f4d65d");
    eye.scale.set(1.05 + alert * 0.18, 0.72 - alert * 0.08, 0.32);
    eye.position.y = 6.34 + Math.sin(time * 1.3 + index) * 0.035;
  });

  rig.crystals.forEach((crystal, index) => {
    const pulse = 1 + Math.sin(time * 1.1 + index * 0.8) * 0.025 + alert * 0.035;
    crystal.scale.setScalar(pulse);
    const material = crystal.material as MeshStandardMaterial;
    material.emissiveIntensity = 0.22 + alert * 0.34 + Math.sin(time * 1.2 + index) * 0.025;
    material.opacity = MathUtils.clamp(0.78 + alert * 0.12, 0.78, 0.92);
  });

  rig.legs.forEach((leg) => {
    const baseX = (leg.userData.baseX as number | undefined) ?? leg.position.x;
    const baseY = (leg.userData.baseY as number | undefined) ?? leg.position.y;
    const baseZ = (leg.userData.baseZ as number | undefined) ?? leg.position.z;
    const swingOffset = (leg.userData.swingOffset as number | undefined) ?? 0;
    const swing = Math.sin(stride + swingOffset) * speed;
    const lift = Math.max(0, Math.sin(stride + swingOffset)) * MathUtils.lerp(0.06, 0.72, speed);
    leg.position.x = baseX + swing * 0.35;
    leg.position.y = baseY + lift;
    leg.position.z = baseZ + Math.cos(stride + swingOffset) * 0.24 * speed;
    leg.rotation.x = (baseZ > 0 ? -0.16 : 0.1) + swing * 0.22;
    leg.rotation.z = (baseX < 0 ? -0.12 : 0.12) - swing * 0.06;
  });

  rig.group.rotation.z = pose === "rest" ? Math.sin(time * 0.7) * 0.015 : 0;
}
