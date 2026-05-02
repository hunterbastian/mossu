import {
  BackSide,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from "three";
import { ART_DIRECTION_IDS, OOT_PS2_GRASSLANDS_PALETTE } from "../visualPalette";

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

function addSoftAnimeOutline(mesh: Mesh, color = "#3f625c", scale = 1.05, opacity = 0.28) {
  const outline = new Mesh(
    mesh.geometry,
    new MeshBasicMaterial({
      color,
      side: BackSide,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  outline.name = `${mesh.name || "karu-part"}-soft-anime-outline`;
  outline.scale.setScalar(scale);
  outline.renderOrder = -1;
  mesh.add(outline);
}

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

  const karuTextureArt = OOT_PS2_GRASSLANDS_PALETTE.karu.texture;
  const baseGradient = context.createRadialGradient(34, 20, 4, 68, 72, 100);
  baseGradient.addColorStop(0, karuTextureArt.gradientCore);
  baseGradient.addColorStop(0.32, karuTextureArt.gradientSoft);
  baseGradient.addColorStop(0.7, karuTextureArt.gradientMid);
  baseGradient.addColorStop(1, karuTextureArt.gradientDeep);
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 170; i += 1) {
    const x = (i * 47) % canvas.width;
    const y = (i * 83 + Math.floor(i / 5) * 17) % canvas.height;
    const radius = 1 + ((i * 19) % 10) * 0.15;
    const alpha = 0.045 + ((i * 23) % 8) * 0.01;
    context.beginPath();
    context.fillStyle =
      i % 4 === 0
        ? `rgba(${karuTextureArt.speckleWarmRgb}, ${alpha + 0.1})`
        : `rgba(${karuTextureArt.speckleCoolRgb}, ${alpha})`;
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let i = 0; i < 18; i += 1) {
    const x = (i * 31 + 12) % canvas.width;
    const y = (i * 59 + 18) % canvas.height;
    const radius = 1.4 + ((i * 7) % 8) * 0.24;
    context.beginPath();
    context.fillStyle = `rgba(${karuTextureArt.bloomRgb}, ${0.12 + (i % 3) * 0.025})`;
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 0.11;
  context.strokeStyle = karuTextureArt.stroke;
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
  karuTexture.repeat.set(...karuTextureArt.repeat);
  karuTexture.needsUpdate = true;
  return karuTexture;
}

export function createKaruModelRig(scale = 1.22): AmbientBlobRig {
  const group = new Group();
  const root = new Group();
  const karuArt = OOT_PS2_GRASSLANDS_PALETTE.karu;
  const materialArt = OOT_PS2_GRASSLANDS_PALETTE.material;
  group.userData.artDirection = ART_DIRECTION_IDS.ootPs2Characters;
  const furTexture = getKaruTexture();
  const bodyMaterial = new MeshStandardMaterial({
    color: karuArt.body.color,
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: materialArt.karuBumpSubtle,
    emissive: karuArt.body.emissive,
    emissiveIntensity: karuArt.body.emissiveIntensity,
    roughness: karuArt.body.roughness,
    metalness: 0,
    flatShading: false,
  });
  const fluffMaterial = new MeshStandardMaterial({
    color: karuArt.fluff.color,
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: materialArt.karuBumpSoft,
    emissive: karuArt.fluff.emissive,
    emissiveIntensity: karuArt.fluff.emissiveIntensity,
    roughness: karuArt.fluff.roughness,
    metalness: 0,
    flatShading: false,
  });
  const deepFluffMaterial = new MeshStandardMaterial({
    color: karuArt.deepFluff.color,
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: materialArt.karuBumpSubtle,
    emissive: karuArt.deepFluff.emissive,
    emissiveIntensity: karuArt.deepFluff.emissiveIntensity,
    roughness: karuArt.deepFluff.roughness,
    metalness: 0,
    flatShading: false,
  });
  const glowMaterial = new MeshBasicMaterial({
    color: karuArt.glow.color,
    transparent: true,
    opacity: karuArt.glow.opacity,
    depthWrite: false,
  });
  const footMaterial = new MeshStandardMaterial({
    color: karuArt.foot.color,
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: materialArt.karuBumpSoft,
    roughness: karuArt.foot.roughness,
    metalness: 0,
    flatShading: false,
  });
  const cheekMaterial = new MeshStandardMaterial({
    color: karuArt.cheek.color,
    emissive: karuArt.cheek.emissive,
    emissiveIntensity: karuArt.cheek.emissiveIntensity,
    roughness: 1,
    metalness: 0,
    flatShading: false,
  });
  const mouthMaterial = new MeshBasicMaterial({ color: karuArt.mouth });
  const eyeMaterial = new MeshStandardMaterial({
    color: karuArt.eye,
    roughness: materialArt.characterEyeRoughness,
    metalness: 0,
    flatShading: false,
  });
  const eyeHighlightMaterial = new MeshBasicMaterial({
    color: karuArt.eyeHighlight,
  });

  group.add(root);

  const body = new Mesh(new SphereGeometry(0.58 * scale, 22, 16), bodyMaterial);
  body.scale.set(1.18, 1.02, 1.12);
  body.position.y = 0.62 * scale;
  addSoftAnimeOutline(body, "#3f635d", 1.05, 0.28);
  root.add(body);

  const glow = new Mesh(new SphereGeometry(0.59 * scale, 16, 12), glowMaterial);
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
    const puff = new Mesh(new SphereGeometry(0.5 * scale, 14, 10), material);
    puff.position.set(x * scale, y * scale, z * scale);
    puff.scale.set(sx * scale, sy * scale, sz * scale);
    puff.userData.baseScale = { x: sx * scale, y: sy * scale, z: sz * scale };
    addSoftAnimeOutline(puff, "#4e6a5f", 1.06, 0.22);
    root.add(puff);
    fluffPuffs.push(puff);
  });

  const face = new Group();
  face.position.set(0, 0.73 * scale, 0.56 * scale);
  root.add(face);

  const leftEye = new Mesh(new SphereGeometry(0.115 * scale, 14, 10), eyeMaterial);
  leftEye.scale.set(0.72, 1.48, 0.28);
  leftEye.position.set(-0.2 * scale, 0.07 * scale, 0.045 * scale);
  face.add(leftEye);
  const leftEyeHighlight = new Mesh(new SphereGeometry(0.02 * scale, 8, 6), eyeHighlightMaterial);
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
  const leftCheek = new Mesh(new SphereGeometry(0.06 * scale, 10, 8), cheekMaterial);
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
    const foot = new Mesh(new SphereGeometry(0.102 * scale, 10, 8), footMaterial);
    foot.scale.set(spec.front ? 1.18 : 1, 0.42, spec.front ? 0.82 : 0.74);
    foot.position.set(spec.x * scale, 0.09 * scale, spec.z * scale);
    foot.userData.homeX = spec.x;
    foot.userData.homeZ = spec.z;
    foot.userData.front = spec.front;
    addSoftAnimeOutline(foot, "#70684d", 1.045, 0.2);
    root.add(foot);
    return foot;
  }) as unknown as [Mesh, Mesh, Mesh, Mesh];

  const tail = new Mesh(new SphereGeometry(0.2 * scale, 12, 8), fluffMaterial);
  tail.scale.set(0.54, 0.46, 0.86);
  tail.position.set(0, 0.46 * scale, -0.72 * scale);
  addSoftAnimeOutline(tail, "#4e6a5f", 1.06, 0.22);
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
