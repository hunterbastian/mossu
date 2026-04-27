import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from "three";

export interface AmbientBlobRig {
  group: Group;
  root: Group;
  body: Mesh;
  face: Group;
  leftEye: Mesh;
  rightEye: Mesh;
  tail: Mesh;
  feet: [Mesh, Mesh, Mesh, Mesh];
  fluffPuffs: Mesh[];
  creatureScale: number;
}

let karuTexture: CanvasTexture | null = null;

function getKaruTexture() {
  if (karuTexture) {
    return karuTexture;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create Karu texture");
  }

  const baseGradient = context.createRadialGradient(34, 20, 4, 68, 72, 100);
  baseGradient.addColorStop(0, "#ffffff");
  baseGradient.addColorStop(0.3, "#edfaff");
  baseGradient.addColorStop(0.68, "#c2ecfb");
  baseGradient.addColorStop(1, "#93d4ee");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 170; i += 1) {
    const x = (i * 47) % canvas.width;
    const y = (i * 83 + Math.floor(i / 5) * 17) % canvas.height;
    const radius = 0.7 + ((i * 19) % 10) * 0.11;
    const alpha = 0.035 + ((i * 23) % 8) * 0.008;
    context.beginPath();
    context.fillStyle = i % 4 === 0
      ? `rgba(255, 255, 255, ${alpha + 0.12})`
      : `rgba(78, 151, 196, ${alpha})`;
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let i = 0; i < 18; i += 1) {
    const x = (i * 31 + 12) % canvas.width;
    const y = (i * 59 + 18) % canvas.height;
    const radius = 1.4 + ((i * 7) % 8) * 0.24;
    context.beginPath();
    context.fillStyle = `rgba(255, 255, 255, ${0.14 + (i % 3) * 0.03})`;
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 0.08;
  context.strokeStyle = "#ffffff";
  context.lineWidth = 1;
  for (let y = -8; y < canvas.height + 16; y += 12) {
    context.beginPath();
    context.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 12) {
      context.lineTo(x, y + Math.sin(x * 0.08 + y * 0.15) * 2.2);
    }
    context.stroke();
  }
  context.globalAlpha = 1;

  karuTexture = new CanvasTexture(canvas);
  karuTexture.colorSpace = SRGBColorSpace;
  karuTexture.wrapS = RepeatWrapping;
  karuTexture.wrapT = RepeatWrapping;
  karuTexture.repeat.set(1.35, 1.15);
  karuTexture.needsUpdate = true;
  return karuTexture;
}

export function createKaruModelRig(scale = 1.22): AmbientBlobRig {
  const group = new Group();
  const root = new Group();
  const furTexture = getKaruTexture();
  const bodyMaterial = new MeshStandardMaterial({
    color: "#c9effc",
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: 0.012,
    emissive: "#e9fbff",
    emissiveIntensity: 0.16,
    roughness: 0.98,
    metalness: 0,
  });
  const fluffMaterial = new MeshStandardMaterial({
    color: "#e7f8ff",
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: 0.01,
    emissive: "#f7feff",
    emissiveIntensity: 0.08,
    roughness: 1,
    metalness: 0,
  });
  const deepFluffMaterial = new MeshStandardMaterial({
    color: "#9fdcf3",
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: 0.012,
    emissive: "#dcf7ff",
    emissiveIntensity: 0.08,
    roughness: 1,
    metalness: 0,
  });
  const glowMaterial = new MeshBasicMaterial({
    color: "#dff8ff",
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  });
  const footMaterial = new MeshStandardMaterial({
    color: "#e7fbff",
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: 0.012,
    roughness: 1,
    metalness: 0,
  });
  const cheekMaterial = new MeshStandardMaterial({
    color: "#ffbfca",
    emissive: "#ffd3da",
    emissiveIntensity: 0.14,
    roughness: 1,
    metalness: 0,
  });
  const mouthMaterial = new MeshBasicMaterial({ color: "#3b2432" });
  const eyeMaterial = new MeshStandardMaterial({
    color: "#101923",
    roughness: 0.18,
    metalness: 0,
  });
  const eyeHighlightMaterial = new MeshBasicMaterial({
    color: "#ffffff",
  });

  group.add(root);

  const body = new Mesh(new SphereGeometry(0.58 * scale, 22, 18), bodyMaterial);
  body.scale.set(1.16, 1.04, 1.14);
  body.position.y = 0.62 * scale;
  root.add(body);

  const glow = new Mesh(new SphereGeometry(0.59 * scale, 20, 16), glowMaterial);
  glow.scale.set(1.22, 1.1, 1.2);
  glow.position.y = 0.62 * scale;
  root.add(glow);

  const fluffPuffs: Mesh[] = [];
  [
    { x: 0, y: 1.17, z: 0.04, sx: 0.2, sy: 0.17, sz: 0.18, material: fluffMaterial },
    { x: 0.01, y: 1.14, z: -0.16, sx: 0.23, sy: 0.2, sz: 0.21, material: fluffMaterial },
    { x: 0.02, y: 1.07, z: -0.34, sx: 0.24, sy: 0.22, sz: 0.22, material: deepFluffMaterial },
    { x: 0.01, y: 0.96, z: -0.51, sx: 0.22, sy: 0.22, sz: 0.21, material: deepFluffMaterial },
    { x: 0, y: 0.82, z: -0.66, sx: 0.19, sy: 0.19, sz: 0.19, material: deepFluffMaterial },
    { x: -0.4, y: 0.72, z: -0.18, sx: 0.15, sy: 0.17, sz: 0.15, material: deepFluffMaterial },
    { x: 0.4, y: 0.72, z: -0.18, sx: 0.15, sy: 0.17, sz: 0.15, material: deepFluffMaterial },
    { x: -0.26, y: 0.43, z: 0.38, sx: 0.19, sy: 0.12, sz: 0.14, material: fluffMaterial },
    { x: 0.26, y: 0.43, z: 0.38, sx: 0.19, sy: 0.12, sz: 0.14, material: fluffMaterial },
    { x: 0, y: 0.5, z: -0.82, sx: 0.16, sy: 0.16, sz: 0.2, material: deepFluffMaterial },
  ].forEach(({ x, y, z, sx, sy, sz, material }) => {
    const puff = new Mesh(new SphereGeometry(0.5 * scale, 10, 9), material);
    puff.position.set(x * scale, y * scale, z * scale);
    puff.scale.set(sx * scale, sy * scale, sz * scale);
    puff.userData.baseScale = { x: sx * scale, y: sy * scale, z: sz * scale };
    root.add(puff);
    fluffPuffs.push(puff);
  });

  const face = new Group();
  face.position.set(0, 0.73 * scale, 0.56 * scale);
  root.add(face);

  const leftEye = new Mesh(new SphereGeometry(0.11 * scale, 24, 18), eyeMaterial);
  leftEye.scale.set(0.72, 1.58, 0.32);
  leftEye.position.set(-0.19 * scale, 0.07 * scale, 0.045 * scale);
  face.add(leftEye);
  const leftEyeHighlight = new Mesh(new SphereGeometry(0.022 * scale, 10, 8), eyeHighlightMaterial);
  leftEyeHighlight.scale.set(0.62, 0.86, 0.28);
  leftEyeHighlight.position.set(-0.02 * scale, 0.05 * scale, 0.042 * scale);
  leftEye.add(leftEyeHighlight);

  const rightEye = leftEye.clone();
  rightEye.position.x = 0.19 * scale;
  face.add(rightEye);

  const mouth = new Mesh(new SphereGeometry(0.018 * scale, 8, 6), mouthMaterial);
  mouth.scale.set(1.08, 0.28, 0.18);
  mouth.position.set(0, -0.13 * scale, 0.045 * scale);
  face.add(mouth);
  const leftCheek = new Mesh(new SphereGeometry(0.06 * scale, 8, 7), cheekMaterial);
  leftCheek.scale.set(1.45, 0.62, 0.18);
  leftCheek.position.set(-0.33 * scale, -0.07 * scale, 0.035 * scale);
  face.add(leftCheek);
  const rightCheek = leftCheek.clone();
  rightCheek.position.x = 0.33 * scale;
  face.add(rightCheek);

  const feet = [
    { x: -0.29, z: 0.32, front: 1 },
    { x: 0.29, z: 0.32, front: 1 },
    { x: -0.25, z: -0.32, front: 0 },
    { x: 0.25, z: -0.32, front: 0 },
  ].map((spec) => {
    const foot = new Mesh(new SphereGeometry(0.098 * scale, 10, 9), footMaterial);
    foot.scale.set(spec.front ? 1.1 : 0.94, 0.46, spec.front ? 0.84 : 0.76);
    foot.position.set(spec.x * scale, 0.09 * scale, spec.z * scale);
    foot.userData.homeX = spec.x;
    foot.userData.homeZ = spec.z;
    foot.userData.front = spec.front;
    root.add(foot);
    return foot;
  }) as unknown as [Mesh, Mesh, Mesh, Mesh];

  const tail = new Mesh(new SphereGeometry(0.19 * scale, 10, 9), fluffMaterial);
  tail.scale.set(0.52, 0.5, 0.82);
  tail.position.set(0, 0.46 * scale, -0.72 * scale);
  root.add(tail);

  return {
    group,
    root,
    body,
    face,
    leftEye,
    rightEye,
    tail,
    feet,
    fluffPuffs,
    creatureScale: scale,
  };
}
