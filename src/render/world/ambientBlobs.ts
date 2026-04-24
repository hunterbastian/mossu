import {
  CanvasTexture,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { FrameState } from "../../simulation/gameState";
import { sampleTerrainHeight, sampleWaterState, scenicPockets, startingLookTarget, startingPosition } from "../../simulation/world";
import { scatterAroundPocket } from "./sceneHelpers";

export type KaruMood = "curious" | "shy" | "brave" | "sleepy";

export interface AmbientBlob {
  id: string;
  group: Group;
  root: Group;
  body: Mesh;
  face: Group;
  leftEye: Mesh;
  rightEye: Mesh;
  feet: [Mesh, Mesh];
  fluffPuffs: Mesh[];
  herdId: number;
  herdCenter: Vector3;
  home: Vector3;
  target: Vector3;
  velocity: Vector3;
  recruited: boolean;
  recruitedAt: number;
  leaderSlot: number;
  mood: KaruMood;
  regroupUntil: number;
  waterReaction: "dry" | "splash" | "float" | "bank_wait";
  restUntil: number;
  avoidPlayerUntil: number;
  investigateAgainAt: number;
  nextBlinkAt: number;
  blinkUntil: number;
  nextIdlePoseAt: number;
  idlePoseStartAt: number;
  idlePoseUntil: number;
  idlePose: "none" | "look_left" | "look_right" | "sniff" | "settle";
  nextHopAt: number;
  hopUntil: number;
  mode: "rest" | "wander" | "curious" | "shy";
  bobOffset: number;
  poseSeed: number;
  facingYaw: number;
  creatureScale: number;
}

export interface AmbientBlobBuildOptions {
  debugSpiritCloseup?: boolean;
}

export interface AmbientBlobUpdateStats {
  speciesName: string;
  recruitedCount: number;
  nearestRecruitableDistance: number | null;
  recruitedThisFrame: number;
  dominantMood: KaruMood;
  regroupActive: boolean;
}

export const AMBIENT_BLOB_SPECIES_NAME = "Karu";
const FAUNA_RECRUIT_RADIUS = 14.5;
const FAUNA_CLUSTER_RECRUIT_RADIUS = 16;
const FAUNA_CLUSTER_PLAYER_RADIUS = 19;
const FAUNA_FOLLOW_NEIGHBOR_RADIUS = 13.5;
const FAUNA_SEPARATION_RADIUS = 3.5;
const FAUNA_PLAYER_PERSONAL_SPACE = 3.1;
const FAUNA_REGROUP_SECONDS = 3.4;
const FAUNA_DEEP_WATER_DEPTH = 2.4;
const FAUNA_SHALLOW_WATER_DEPTH = 0.25;

const ambientPlayerMotion = new Vector3();
const ambientToPlayer = new Vector3();
const ambientNeighborOffset = new Vector3();
const ambientGroupCenter = new Vector3();
const ambientCohesion = new Vector3();
const ambientSeparation = new Vector3();
const ambientDesiredTarget = new Vector3();
const ambientTrailDirection = new Vector3();
const ambientFollowDirection = new Vector3();
const ambientRightDirection = new Vector3();
const ambientLeaderSlot = new Vector3();
const ambientBoidCohesion = new Vector3();
const ambientAlignment = new Vector3();
const ambientFollowSteer = new Vector3();
const ambientPlayerSpace = new Vector3();
const ambientBoidSteer = new Vector3();
let karuTexture: CanvasTexture | null = null;

function moodForBlob(pocketIndex: number, index: number): KaruMood {
  const moods: KaruMood[] = ["curious", "shy", "brave", "sleepy"];
  return moods[(pocketIndex * 2 + index) % moods.length];
}

function moodFollowTuning(mood: KaruMood) {
  switch (mood) {
    case "brave":
      return { backOffset: -1.2, sideScale: 0.9, speedScale: 1.12, waterBravery: 1 };
    case "shy":
      return { backOffset: 2.2, sideScale: 1.2, speedScale: 0.92, waterBravery: 0 };
    case "sleepy":
      return { backOffset: 3.3, sideScale: 1.05, speedScale: 0.78, waterBravery: 0 };
    case "curious":
    default:
      return { backOffset: 0, sideScale: 1, speedScale: 1, waterBravery: 0.35 };
  }
}

function findNearestDryBank(point: Vector3, fallback: Vector3) {
  const candidate = new Vector3();
  const best = new Vector3();
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let radius = 4; radius <= 24; radius += 4) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      candidate.set(point.x + Math.cos(angle) * radius, 0, point.z + Math.sin(angle) * radius);
      const water = sampleWaterState(candidate.x, candidate.z);
      if (water && water.swimAllowed && water.depth >= FAUNA_DEEP_WATER_DEPTH) {
        continue;
      }

      const distance = Math.hypot(candidate.x - fallback.x, candidate.z - fallback.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best.set(candidate.x, sampleTerrainHeight(candidate.x, candidate.z), candidate.z);
      }
    }

    if (bestDistance < Number.POSITIVE_INFINITY) {
      return best;
    }
  }

  best.set(fallback.x, sampleTerrainHeight(fallback.x, fallback.z), fallback.z);
  return best;
}

function dominantMood(blobs: AmbientBlob[]): KaruMood {
  const recruited = blobs.filter((blob) => blob.recruited);
  const relevant = recruited.length > 0 ? recruited : blobs;
  const counts = new Map<KaruMood, number>();
  relevant.forEach((blob) => {
    counts.set(blob.mood, (counts.get(blob.mood) ?? 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "curious";
}

function planarDistance(a: Vector3, b: Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function findNearestRecruitable(blobs: AmbientBlob[], playerPosition: Vector3) {
  let nearestBlob: AmbientBlob | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  blobs.forEach((blob) => {
    if (blob.recruited) {
      return;
    }

    const distance = planarDistance(blob.group.position, playerPosition);
    if (distance < nearestDistance) {
      nearestBlob = blob;
      nearestDistance = distance;
    }
  });

  return {
    blob: nearestBlob,
    distance: nearestBlob ? nearestDistance : null,
  };
}

function recruitNearbyBlobs(blobs: AmbientBlob[], sourceBlob: AmbientBlob, playerPosition: Vector3, elapsed: number) {
  let recruitedCount = 0;

  blobs.forEach((blob) => {
    if (blob.recruited) {
      return;
    }

    const isSource = blob === sourceBlob;
    const sameSmallHerd = blob.herdId === sourceBlob.herdId;
    const closeToSource = planarDistance(blob.group.position, sourceBlob.group.position) <= FAUNA_CLUSTER_RECRUIT_RADIUS;
    const closeToPlayer = planarDistance(blob.group.position, playerPosition) <= FAUNA_CLUSTER_PLAYER_RADIUS;
    if (!isSource && (!sameSmallHerd || !closeToSource || !closeToPlayer)) {
      return;
    }

    blob.recruited = true;
    blob.recruitedAt = elapsed;
    blob.regroupUntil = elapsed + 1.6;
    blob.mode = "curious";
    blob.avoidPlayerUntil = 0;
    blob.investigateAgainAt = elapsed + 5;
    blob.restUntil = elapsed + 0.18;
    blob.target.copy(playerPosition);
    recruitedCount += 1;
  });

  return recruitedCount;
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

  const baseGradient = context.createRadialGradient(42, 32, 4, 64, 68, 92);
  baseGradient.addColorStop(0, "#e4fbff");
  baseGradient.addColorStop(0.42, "#aedff4");
  baseGradient.addColorStop(1, "#7dbbdc");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 190; i += 1) {
    const x = (i * 47) % canvas.width;
    const y = (i * 83 + Math.floor(i / 5) * 17) % canvas.height;
    const radius = 0.7 + ((i * 19) % 10) * 0.14;
    const alpha = 0.08 + ((i * 23) % 8) * 0.012;
    context.beginPath();
    context.fillStyle = i % 4 === 0
      ? `rgba(255, 255, 255, ${alpha + 0.05})`
      : `rgba(75, 145, 188, ${alpha})`;
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 0.12;
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
  karuTexture.repeat.set(1.85, 1.45);
  karuTexture.needsUpdate = true;
  return karuTexture;
}

function makeAmbientBlob(scale: number) {
  const group = new Group();
  const root = new Group();
  const furTexture = getKaruTexture();
  const bodyMaterial = new MeshStandardMaterial({
    color: "#a8ddf3",
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: 0.025,
    emissive: "#dff7ff",
    emissiveIntensity: 0.09,
    roughness: 0.98,
    metalness: 0,
  });
  const fluffMaterial = new MeshStandardMaterial({
    color: "#c8eefb",
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: 0.018,
    roughness: 1,
    metalness: 0,
  });
  const deepFluffMaterial = new MeshStandardMaterial({
    color: "#86c7e7",
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: 0.022,
    roughness: 1,
    metalness: 0,
  });
  const footMaterial = new MeshStandardMaterial({ color: "#dff7ff", roughness: 1, metalness: 0 });
  const eyeMaterial = new MeshStandardMaterial({ color: "#121b24", roughness: 0.08, metalness: 0.02 });
  const eyeHighlightMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ffffff",
    emissiveIntensity: 0.25,
    roughness: 0.18,
    metalness: 0,
  });

  group.add(root);

  const body = new Mesh(new SphereGeometry(0.58 * scale, 18, 16), bodyMaterial);
  body.scale.set(1.12, 1.42, 1.08);
  body.position.y = 0.76 * scale;
  root.add(body);

  const fluffPuffs: Mesh[] = [];
  [
    { x: -0.35, y: 0.74, z: 0.08, sx: 0.48, sy: 0.56, sz: 0.46, material: fluffMaterial },
    { x: 0.35, y: 0.74, z: 0.08, sx: 0.48, sy: 0.56, sz: 0.46, material: fluffMaterial },
    { x: -0.28, y: 0.38, z: 0.16, sx: 0.36, sy: 0.22, sz: 0.3, material: fluffMaterial },
    { x: 0.28, y: 0.38, z: 0.16, sx: 0.36, sy: 0.22, sz: 0.3, material: fluffMaterial },
    { x: -0.18, y: 1.15, z: 0.04, sx: 0.3, sy: 0.36, sz: 0.28, material: deepFluffMaterial },
    { x: 0.18, y: 1.13, z: 0.05, sx: 0.29, sy: 0.35, sz: 0.27, material: deepFluffMaterial },
    { x: 0, y: 1.34, z: 0.02, sx: 0.24, sy: 0.28, sz: 0.22, material: fluffMaterial },
    { x: -0.26, y: 0.46, z: 0.3, sx: 0.2, sy: 0.17, sz: 0.18, material: deepFluffMaterial },
    { x: 0.26, y: 0.46, z: 0.3, sx: 0.2, sy: 0.17, sz: 0.18, material: deepFluffMaterial },
    { x: 0, y: 0.28, z: 0.22, sx: 0.24, sy: 0.14, sz: 0.18, material: deepFluffMaterial },
    { x: 0, y: 0.74, z: -0.08, sx: 0.34, sy: 0.4, sz: 0.26, material: deepFluffMaterial },
  ].forEach(({ x, y, z, sx, sy, sz, material }) => {
    const puff = new Mesh(new SphereGeometry(0.5 * scale, 10, 9), material);
    puff.position.set(x * scale, y * scale, z * scale);
    puff.scale.set(sx * scale, sy * scale, sz * scale);
    root.add(puff);
    fluffPuffs.push(puff);
  });

  const face = new Group();
  face.position.set(0, 0.88 * scale, 0.5 * scale);
  root.add(face);

  const leftEye = new Mesh(new SphereGeometry(0.112 * scale, 10, 9), eyeMaterial);
  leftEye.scale.set(0.86, 1.34, 0.68);
  leftEye.position.set(-0.18 * scale, -0.01 * scale, 0);
  face.add(leftEye);
  const leftEyeHighlight = new Mesh(new SphereGeometry(0.028 * scale, 8, 7), eyeHighlightMaterial);
  leftEyeHighlight.scale.set(0.72, 0.9, 0.45);
  leftEyeHighlight.position.set(-0.028 * scale, 0.04 * scale, 0.07 * scale);
  leftEye.add(leftEyeHighlight);

  const rightEye = leftEye.clone();
  rightEye.position.x = 0.18 * scale;
  face.add(rightEye);

  const leftFoot = new Mesh(new SphereGeometry(0.1 * scale, 10, 9), footMaterial);
  leftFoot.scale.set(1.08, 0.72, 0.9);
  leftFoot.position.set(-0.18 * scale, 0.1 * scale, 0.26 * scale);
  root.add(leftFoot);

  const rightFoot = leftFoot.clone();
  rightFoot.position.x = 0.2 * scale;
  root.add(rightFoot);

  return {
    group,
    root,
    body,
    face,
    leftEye,
    rightEye,
    feet: [leftFoot, rightFoot] as [Mesh, Mesh],
    fluffPuffs,
    creatureScale: scale,
  };
}

function stageAmbientBlobCloseup(blobs: AmbientBlob[]) {
  const forward = new Vector3().subVectors(startingLookTarget, startingPosition).setY(0).normalize();
  const right = new Vector3(forward.z, 0, -forward.x).normalize();
  const layouts = [
    { forwardOffset: 9.2, rightOffset: 9.8, restUntil: 0.2, groupScale: 1.32 },
    { forwardOffset: 12.8, rightOffset: 5.2, restUntil: 1.1, groupScale: 1.14 },
    { forwardOffset: 15.6, rightOffset: 11.6, restUntil: 1.8, groupScale: 1.08 },
  ];

  layouts.forEach((layout, index) => {
    const blob = blobs[index];
    if (!blob) {
      return;
    }

    const x = startingPosition.x + forward.x * layout.forwardOffset + right.x * layout.rightOffset;
    const z = startingPosition.z + forward.z * layout.forwardOffset + right.z * layout.rightOffset;
    const y = sampleTerrainHeight(x, z);
    const facingYaw = Math.atan2(startingPosition.x - x, startingPosition.z - z);
    blob.group.position.set(x, y, z);
    blob.home.set(x, y, z);
    blob.target.set(x, y, z);
    blob.velocity.set(0, 0, 0);
    blob.mode = "rest";
    blob.restUntil = layout.restUntil;
    blob.facingYaw = facingYaw;
    blob.group.rotation.y = facingYaw;
    blob.group.scale.setScalar(layout.groupScale);
  });

  const stagedHerdId = blobs[0]?.herdId;
  if (stagedHerdId !== undefined) {
    const stagedCenter = new Vector3();
    let stagedCount = 0;
    layouts.forEach((_layout, index) => {
      const blob = blobs[index];
      if (!blob || blob.herdId !== stagedHerdId) {
        return;
      }
      stagedCenter.add(blob.group.position);
      stagedCount += 1;
    });
    if (stagedCount > 0) {
      stagedCenter.multiplyScalar(1 / stagedCount);
      layouts.forEach((_layout, index) => {
        const blob = blobs[index];
        if (blob && blob.herdId === stagedHerdId) {
          blob.herdCenter.copy(stagedCenter);
        }
      });
    }
  }

  return blobs;
}

export function buildAmbientBlobs(options: AmbientBlobBuildOptions = {}) {
  const plainsHomes = scenicPockets.filter((pocket) => pocket.zone === "plains");
  const blobs = plainsHomes.flatMap((pocket, pocketIndex): AmbientBlob[] =>
    Array.from({ length: pocketIndex === 0 ? 3 : 2 }, (_, index) => {
      const { x, z } = scatterAroundPocket(pocket, 200 + pocketIndex * 20 + index, 0.46);
      const y = sampleTerrainHeight(x, z);
      const herdCenter = new Vector3(
        pocket.position.x,
        sampleTerrainHeight(pocket.position.x, pocket.position.z),
        pocket.position.z,
      );
      const creatureScale = 1.18 + index * 0.12;
      const rig = makeAmbientBlob(creatureScale);
      rig.group.position.set(x, y, z);
      const facingYaw = Math.sin((pocketIndex + 1) * 2.6 + index * 1.9) * 0.7;
      rig.group.rotation.y = facingYaw;
      return {
        ...rig,
        id: `karu-${pocketIndex}-${index}`,
        herdId: pocketIndex,
        herdCenter,
        home: new Vector3(x, y, z),
        target: new Vector3(x, y, z),
        velocity: new Vector3(),
        recruited: false,
        recruitedAt: 0,
        leaderSlot: pocketIndex * 3 + index,
        mood: moodForBlob(pocketIndex, index),
        regroupUntil: 0,
        waterReaction: "dry",
        restUntil: 0.8 + index * 0.5,
        avoidPlayerUntil: 0,
        investigateAgainAt: 0,
        nextBlinkAt: 0.9 + pocketIndex * 0.28 + index * 0.34,
        blinkUntil: 0,
        nextIdlePoseAt: 1.8 + pocketIndex * 0.4 + index * 0.45,
        idlePoseStartAt: 0,
        idlePoseUntil: 0,
        idlePose: "none",
        nextHopAt: 1.6 + pocketIndex * 0.35 + index * 0.5,
        hopUntil: 0,
        mode: "rest",
        bobOffset: pocketIndex * 0.9 + index * 0.7,
        poseSeed: pocketIndex * 2.2 + index * 1.4,
        facingYaw,
        creatureScale,
      };
    }),
  );

  return options.debugSpiritCloseup ? stageAmbientBlobCloseup(blobs) : blobs;
}

export function updateAmbientBlobs(
  blobs: AmbientBlob[],
  ambientBlobGroup: Group,
  frame: FrameState,
  elapsed: number,
  dt: number,
  mapLookdown: boolean,
  recruitPressed = false,
  regroupPressed = false,
): AmbientBlobUpdateStats {
  ambientBlobGroup.visible = !mapLookdown;
  if (mapLookdown) {
    return {
      speciesName: AMBIENT_BLOB_SPECIES_NAME,
      recruitedCount: blobs.filter((blob) => blob.recruited).length,
      nearestRecruitableDistance: null,
      recruitedThisFrame: 0,
      dominantMood: dominantMood(blobs),
      regroupActive: false,
    };
  }

  const playerPosition = frame.player.position;
  const playerPlanarSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
  ambientPlayerMotion.set(frame.player.velocity.x, 0, frame.player.velocity.z);
  const nearestBeforeRecruit = findNearestRecruitable(blobs, playerPosition);
  const recruitedThisFrame =
    recruitPressed &&
    nearestBeforeRecruit.blob &&
    nearestBeforeRecruit.distance !== null &&
    nearestBeforeRecruit.distance <= FAUNA_RECRUIT_RADIUS
      ? recruitNearbyBlobs(blobs, nearestBeforeRecruit.blob, playerPosition, elapsed)
      : 0;
  if (regroupPressed) {
    blobs.forEach((blob) => {
      if (blob.recruited) {
        blob.regroupUntil = elapsed + FAUNA_REGROUP_SECONDS;
      }
    });
  }

  blobs.forEach((blob, index) => {
    const groundY = sampleTerrainHeight(blob.group.position.x, blob.group.position.z);
    const toPlayer = ambientToPlayer.subVectors(playerPosition, blob.group.position);
    const planarToPlayer = Math.hypot(toPlayer.x, toPlayer.z);
    const playerTooClose = planarToPlayer < 8.5;
    const playerApproachAlignment =
      playerPlanarSpeed > 0.001 && planarToPlayer > 0.001
        ? ambientPlayerMotion.dot(toPlayer) / (playerPlanarSpeed * planarToPlayer)
        : 0;
    const playerApproaching =
      frame.player.grounded &&
      !frame.player.swimming &&
      planarToPlayer < 15.5 &&
      playerPlanarSpeed > 5 &&
      playerApproachAlignment > 0.55;
    const stillAvoidingPlayer = elapsed < blob.avoidPlayerUntil;

    ambientGroupCenter.copy(blob.group.position);
    ambientCohesion.set(0, 0, 0);
    ambientSeparation.set(0, 0, 0);

    let herdMateCount = 1;
    let nearbyMateCount = 0;
    let nearestMateDistance = Number.POSITIVE_INFINITY;
    blobs.forEach((otherBlob, otherIndex) => {
      if (otherIndex === index || otherBlob.herdId !== blob.herdId) {
        return;
      }

      ambientNeighborOffset
        .subVectors(otherBlob.group.position, blob.group.position)
        .setY(0);
      const neighborDistance = ambientNeighborOffset.length();
      if (neighborDistance <= 0.001) {
        return;
      }

      herdMateCount += 1;
      nearestMateDistance = Math.min(nearestMateDistance, neighborDistance);
      ambientGroupCenter.add(otherBlob.group.position);

      if (neighborDistance < 5.8) {
        nearbyMateCount += 1;
      }
      if (neighborDistance < 3.1) {
        ambientSeparation.addScaledVector(
          ambientNeighborOffset,
          -((3.1 - neighborDistance) / (3.1 * neighborDistance)),
        );
      }
    });

    if (herdMateCount > 1) {
      ambientGroupCenter.multiplyScalar(1 / herdMateCount);
    } else {
      ambientGroupCenter.copy(blob.herdCenter);
    }
    ambientGroupCenter.y = groundY;

    const herdOffset = ambientCohesion
      .subVectors(ambientGroupCenter, blob.group.position)
      .setY(0);
    const herdDistance = herdOffset.length();
    if (herdDistance > 0.001) {
      herdOffset.multiplyScalar(1 / herdDistance);
    }
    const separatedFromHerd =
      herdDistance > 4.8 || (herdMateCount > 1 && nearbyMateCount === 0 && nearestMateDistance > 6.4);
    const herdPullStrength = herdDistance > 2.2 ? MathUtils.clamp((herdDistance - 2.2) / 4.4, 0, 1.25) : 0;
    const separationStrength = ambientSeparation.length();

    if (blob.mode === "curious" && blob.restUntil < elapsed) {
      blob.investigateAgainAt = elapsed + 2.6 + (index % 2) * 0.5;
    }

    let recruitedMoveStrength = 0;
    if (blob.recruited) {
      const tuning = moodFollowTuning(blob.mood);
      const regroupActive = elapsed < blob.regroupUntil;
      blob.mode = "wander";
      blob.avoidPlayerUntil = 0;
      blob.restUntil = elapsed + 0.3;

      if (playerPlanarSpeed > 0.25) {
        ambientFollowDirection.copy(ambientPlayerMotion).normalize();
      } else {
        ambientFollowDirection.set(Math.sin(frame.player.heading), 0, Math.cos(frame.player.heading));
        if (ambientFollowDirection.lengthSq() < 0.001) {
          ambientFollowDirection.set(0, 0, 1);
        }
      }
      ambientRightDirection.set(ambientFollowDirection.z, 0, -ambientFollowDirection.x).normalize();

      const slotRow = Math.floor(blob.leaderSlot / 3);
      const slotColumn = (blob.leaderSlot % 3) - 1;
      const slotJitter = Math.sin(blob.poseSeed * 1.7) * 0.45;
      const regroupTighten = regroupActive ? 0.62 : 1;
      const followBackDistance =
        (5.6 + slotRow * 2.45 + (blob.leaderSlot % 2) * 0.45 + tuning.backOffset) * regroupTighten;
      const followSideDistance = (slotColumn * (3.25 + slotRow * 0.28) + slotJitter) * tuning.sideScale * regroupTighten;
      ambientLeaderSlot
        .copy(playerPosition)
        .addScaledVector(ambientFollowDirection, -followBackDistance)
        .addScaledVector(ambientRightDirection, followSideDistance);
      ambientLeaderSlot.y = sampleTerrainHeight(ambientLeaderSlot.x, ambientLeaderSlot.z);
      blob.waterReaction = "dry";

      const targetWater = sampleWaterState(ambientLeaderSlot.x, ambientLeaderSlot.z);
      const isDeepTarget = !!targetWater && targetWater.swimAllowed && targetWater.depth >= FAUNA_DEEP_WATER_DEPTH;
      if (targetWater && targetWater.depth > FAUNA_SHALLOW_WATER_DEPTH && !isDeepTarget) {
        blob.waterReaction = "splash";
      } else if (isDeepTarget) {
        if (blob.mood === "brave" || tuning.waterBravery >= 1) {
          blob.waterReaction = "float";
          ambientLeaderSlot.y = targetWater.surfaceY + 0.28;
        } else {
          blob.waterReaction = "bank_wait";
          ambientLeaderSlot.copy(findNearestDryBank(ambientLeaderSlot, playerPosition));
        }
      }

      ambientBoidCohesion.set(0, 0, 0);
      ambientAlignment.set(0, 0, 0);
      ambientSeparation.set(0, 0, 0);
      let recruitedNeighborCount = 0;

      blobs.forEach((otherBlob, otherIndex) => {
        if (otherIndex === index || !otherBlob.recruited) {
          return;
        }

        ambientNeighborOffset
          .subVectors(otherBlob.group.position, blob.group.position)
          .setY(0);
        const neighborDistance = ambientNeighborOffset.length();
        if (neighborDistance <= 0.001) {
          return;
        }

        if (neighborDistance < FAUNA_FOLLOW_NEIGHBOR_RADIUS) {
          recruitedNeighborCount += 1;
          ambientBoidCohesion.add(otherBlob.group.position);
          ambientAlignment.add(otherBlob.velocity);
        }

        if (neighborDistance < FAUNA_SEPARATION_RADIUS) {
          ambientSeparation.addScaledVector(
            ambientNeighborOffset,
            -((FAUNA_SEPARATION_RADIUS - neighborDistance) / (FAUNA_SEPARATION_RADIUS * neighborDistance)),
          );
        }
      });

      if (recruitedNeighborCount > 0) {
        ambientBoidCohesion
          .multiplyScalar(1 / recruitedNeighborCount)
          .sub(blob.group.position)
          .setY(0);
        if (ambientBoidCohesion.lengthSq() > 0.001) {
          ambientBoidCohesion.normalize();
        }

        ambientAlignment
          .multiplyScalar(1 / recruitedNeighborCount)
          .setY(0);
        if (ambientAlignment.lengthSq() > 0.001) {
          ambientAlignment.normalize();
        }
      }

      ambientFollowSteer
        .subVectors(ambientLeaderSlot, blob.group.position)
        .setY(0);
      const followDistance = ambientFollowSteer.length();
      if (followDistance > 0.001) {
        ambientFollowSteer.multiplyScalar(1 / followDistance);
      }

      ambientPlayerSpace.set(0, 0, 0);
      if (planarToPlayer < FAUNA_PLAYER_PERSONAL_SPACE && planarToPlayer > 0.001) {
        ambientPlayerSpace
          .copy(toPlayer)
          .setY(0)
          .multiplyScalar(-1 / planarToPlayer);
      }

      ambientBoidSteer
        .set(0, 0, 0)
        .addScaledVector(ambientFollowSteer, (1.55 + MathUtils.clamp(followDistance / 14, 0, 1.2)) * (regroupActive ? 1.25 : 1))
        .addScaledVector(ambientSeparation, 1.95)
        .addScaledVector(ambientBoidCohesion, 0.38)
        .addScaledVector(ambientAlignment, 0.3)
        .addScaledVector(ambientPlayerSpace, 1.35);
      if (ambientBoidSteer.lengthSq() > 0.001) {
        ambientBoidSteer.normalize();
      } else {
        ambientBoidSteer.copy(ambientFollowSteer);
      }

      const targetLead = MathUtils.clamp(followDistance * 0.3 + 2.4, 2.2, 7.4);
      blob.target
        .copy(blob.group.position)
        .addScaledVector(ambientBoidSteer, targetLead);
      blob.target.y = ambientLeaderSlot.y;
      recruitedMoveStrength =
        followDistance > 18 ? 5.6 :
        followDistance > 9 ? 4.1 :
        followDistance > 3.4 ? 2.55 :
        1.15;
      recruitedMoveStrength *= tuning.speedScale * (regroupActive ? 1.12 : 1);
      if (blob.waterReaction === "bank_wait") {
        recruitedMoveStrength *= 0.82;
      } else if (blob.waterReaction === "float") {
        recruitedMoveStrength *= 0.9;
      }
      if (followDistance < 1.2 && ambientSeparation.lengthSq() < 0.001) {
        recruitedMoveStrength = 0;
      }
    } else if (playerTooClose || playerApproaching || stillAvoidingPlayer) {
      blob.mode = "shy";
      const away = planarToPlayer > 0.001 ? toPlayer.multiplyScalar(-1 / planarToPlayer) : toPlayer.set(1, 0, 0);
      ambientDesiredTarget.copy(blob.group.position).addScaledVector(away, playerApproaching ? 6.6 : 4.8);
      if (herdPullStrength > 0) {
        ambientDesiredTarget.addScaledVector(herdOffset, 1.6 + herdPullStrength * 1.5);
      }
      blob.target.set(
        ambientDesiredTarget.x,
        blob.home.y,
        ambientDesiredTarget.z,
      );
      if (playerTooClose || playerApproaching) {
        blob.avoidPlayerUntil = Math.max(
          blob.avoidPlayerUntil,
          elapsed + (playerApproaching ? 3 : 2.8 + (index % 3) * 0.35),
        );
      }
      blob.restUntil = Math.max(blob.restUntil, elapsed + (playerApproaching ? 1.4 : 1.1));
    } else if (
      planarToPlayer < 16 &&
      blob.mode !== "shy" &&
      blob.restUntil < elapsed &&
      elapsed >= blob.avoidPlayerUntil &&
      elapsed >= blob.investigateAgainAt
    ) {
      blob.mode = "curious";
      blob.target.set(
        playerPosition.x - toPlayer.x * 0.35,
        playerPosition.y,
        playerPosition.z - toPlayer.z * 0.35,
      );
      blob.restUntil = elapsed + 1.3;
    } else if (blob.restUntil < elapsed) {
      if (separatedFromHerd && elapsed >= blob.avoidPlayerUntil) {
        blob.mode = "wander";
        const regroupAngle = blob.poseSeed + elapsed * 0.2;
        blob.target.set(
          ambientGroupCenter.x + Math.cos(regroupAngle) * 1.4,
          blob.home.y,
          ambientGroupCenter.z + Math.sin(regroupAngle) * 1.2,
        );
        blob.restUntil = elapsed + 1.5;
      } else if (blob.mode === "rest") {
        blob.mode = "wander";
        const wanderAngle = elapsed * 0.45 + index * 1.7;
        blob.target.set(
          blob.home.x + Math.cos(wanderAngle) * (1.6 + (index % 3) * 1.1),
          blob.home.y,
          blob.home.z + Math.sin(wanderAngle) * (1.2 + (index % 2) * 1.4),
        );
        blob.restUntil = elapsed + 2.2 + (index % 3) * 0.5;
      } else {
        blob.mode = "rest";
        blob.target.copy(blob.group.position);
        blob.restUntil = elapsed + 1.8 + (index % 2) * 0.8;
      }
    }

    if (elapsed >= blob.nextBlinkAt) {
      blob.blinkUntil = elapsed + 0.12;
      blob.nextBlinkAt =
        elapsed +
        1.8 +
        (((Math.sin(blob.poseSeed * 2.7 + elapsed * 0.42) + 1) * 0.5) * 2.4) +
        (blob.mode === "rest" ? 0.2 : 0);
    }

    const canDoIdlePose =
      !blob.recruited &&
      (blob.mode === "rest" || blob.mode === "wander") &&
      elapsed >= blob.avoidPlayerUntil &&
      planarToPlayer > 10.5;
    if (canDoIdlePose && elapsed >= blob.nextIdlePoseAt) {
      const idleRoll = (Math.sin(blob.poseSeed * 3.1 + elapsed * 0.58) + 1) * 0.5;
      blob.idlePose =
        idleRoll < 0.24 ? "look_left" :
        idleRoll < 0.48 ? "look_right" :
        idleRoll < 0.74 ? "sniff" :
        "settle";
      const idleDuration =
        blob.idlePose === "sniff" ? 0.9 :
        blob.idlePose === "settle" ? 1.35 :
        1.05;
      blob.idlePoseStartAt = elapsed;
      blob.idlePoseUntil = elapsed + idleDuration;
      blob.nextIdlePoseAt =
        elapsed +
        idleDuration +
        1.8 +
        (((Math.sin(blob.poseSeed * 1.6 + elapsed * 0.31) + 1) * 0.5) * 2.6);
      if (blob.mode === "rest") {
        blob.restUntil = Math.max(blob.restUntil, elapsed + idleDuration * 0.9);
      }
    } else if (!canDoIdlePose && blob.idlePoseUntil > elapsed) {
      blob.idlePose = "none";
      blob.idlePoseUntil = elapsed;
    }

    const canDoIdleHop =
      !blob.recruited &&
      (blob.mode === "rest" || blob.mode === "wander") &&
      elapsed >= blob.avoidPlayerUntil &&
      planarToPlayer > 10.5;
    if (canDoIdleHop && elapsed >= blob.nextHopAt) {
      blob.hopUntil = elapsed + 0.42;
      blob.nextHopAt =
        elapsed +
        2.8 +
        (((Math.sin(blob.poseSeed * 1.9 + elapsed * 0.35) + 1) * 0.5) * 2.4) +
        (index % 3) * 0.25;
      if (blob.mode === "rest") {
        blob.restUntil = Math.max(blob.restUntil, elapsed + 0.45);
      }
    } else if (!canDoIdleHop && blob.hopUntil > elapsed) {
      blob.hopUntil = elapsed;
    }

    const moveStrength = blob.recruited
      ? recruitedMoveStrength
      : blob.mode === "shy" ? 4.2 : blob.mode === "curious" ? 2.2 : blob.mode === "wander" ? 1.4 : 0;
    if (moveStrength > 0) {
      ambientDesiredTarget.copy(blob.target);
      if (!blob.recruited && herdPullStrength > 0 && blob.mode !== "curious") {
        ambientDesiredTarget.addScaledVector(
          herdOffset,
          (blob.mode === "shy" ? 1.2 : 1.8) * herdPullStrength,
        );
      }
      const activeSeparationStrength = blob.recruited ? ambientSeparation.length() : separationStrength;
      if (activeSeparationStrength > 0.001) {
        ambientDesiredTarget.addScaledVector(
          ambientSeparation,
          blob.recruited ? 1.6 : blob.mode === "shy" ? 1.8 : 1.2,
        );
      }
      ambientTrailDirection
        .subVectors(ambientDesiredTarget, blob.group.position)
        .setY(0);
      const distance = ambientTrailDirection.length();
      if (distance > 0.12) {
        ambientTrailDirection.normalize();
        blob.velocity.lerp(ambientTrailDirection.multiplyScalar(moveStrength), 1 - Math.exp(-dt * 2.6));
        blob.group.position.addScaledVector(blob.velocity, dt);
      } else {
        blob.velocity.multiplyScalar(0.72);
        if (blob.mode === "shy") {
          blob.mode = "rest";
        }
      }
    } else {
      blob.velocity.multiplyScalar(0.84);
    }

  const currentWater = sampleWaterState(blob.group.position.x, blob.group.position.z);
  if (blob.recruited && currentWater && currentWater.depth > FAUNA_SHALLOW_WATER_DEPTH) {
    const currentDeepWater = currentWater.swimAllowed && currentWater.depth >= FAUNA_DEEP_WATER_DEPTH;
    if (currentDeepWater && (blob.mood === "brave" || blob.waterReaction === "float")) {
      blob.waterReaction = "float";
    } else if (!currentDeepWater) {
      blob.waterReaction = "splash";
    } else {
      blob.waterReaction = "bank_wait";
    }
  } else if (!blob.recruited || !currentWater || currentWater.depth <= FAUNA_SHALLOW_WATER_DEPTH) {
    blob.waterReaction = "dry";
  }

  const planarSpeed = blob.velocity.length();
  const scale = blob.creatureScale;
  const restPulse = Math.sin(elapsed * 2.3 + blob.poseSeed);
  const curiousSway = Math.sin(elapsed * 2.1 + blob.poseSeed * 1.4);
  const wanderHop = Math.max(0, Math.sin(elapsed * 6.8 + blob.poseSeed));
  const shyHop = Math.max(0, Math.sin(elapsed * 9.6 + blob.poseSeed));
  const blinkT = blob.blinkUntil > elapsed ? 1 - (blob.blinkUntil - elapsed) / 0.12 : 0;
  const blink = blinkT > 0 && blinkT < 1 ? Math.sin(blinkT * Math.PI) : 0;
  const idlePoseDuration = Math.max(0.001, blob.idlePoseUntil - blob.idlePoseStartAt);
  const idlePoseT =
    blob.idlePoseUntil > elapsed && elapsed >= blob.idlePoseStartAt
      ? MathUtils.clamp((elapsed - blob.idlePoseStartAt) / idlePoseDuration, 0, 1)
      : 0;
  const idlePoseBlend = idlePoseT > 0 && idlePoseT < 1 ? Math.sin(idlePoseT * Math.PI) : 0;
  const idleLookYaw =
    blob.idlePose === "look_left" ? -0.42 * idlePoseBlend :
    blob.idlePose === "look_right" ? 0.42 * idlePoseBlend :
    0;
  const idleSniff = blob.idlePose === "sniff" ? idlePoseBlend : 0;
  const idleSettle = blob.idlePose === "settle" ? idlePoseBlend : 0;
  const idleHopT = blob.hopUntil > elapsed ? 1 - (blob.hopUntil - elapsed) / 0.42 : 0;
  const idleHop = idleHopT > 0 && idleHopT < 1 ? Math.sin(idleHopT * Math.PI) : 0;
  const idleHopSettle = idleHopT > 0 && idleHopT < 0.2 ? 1 - idleHopT / 0.2 : 0;
  const waterHop =
    blob.waterReaction === "splash" ? Math.max(0, Math.sin(elapsed * 12.5 + blob.poseSeed)) * 0.28 * scale :
    blob.waterReaction === "float" ? (0.1 + Math.sin(elapsed * 3.2 + blob.poseSeed) * 0.06) * scale :
    blob.waterReaction === "bank_wait" ? Math.max(0, Math.sin(elapsed * 8.8 + blob.poseSeed)) * 0.08 * scale :
    0;
  const groundedBob = Math.max(0, Math.sin(elapsed * 4.2 + blob.bobOffset)) * planarSpeed * 0.08;
  const poseLift =
      blob.mode === "wander" ? Math.max(wanderHop * 0.2 * scale, idleHop * 0.15 * scale, waterHop) :
      blob.mode === "shy" ? shyHop * 0.16 * scale :
      idleHop * 0.15 * scale;
    const poseDrop =
    blob.mode === "rest" ? (0.03 + restPulse * 0.012 + idleHopSettle * 0.028 + idleSettle * 0.022) * scale :
    blob.mode === "shy" ? (0.05 + (1 - shyHop) * 0.04) * scale :
    (idleHopSettle * 0.024 + idleSettle * 0.016) * scale;
  const stretch =
    blob.mode === "wander" ? 1 + wanderHop * 0.08 + idleHop * 0.03 + (blob.mood === "sleepy" ? 0.025 : 0) :
    blob.mode === "shy" ? 1 + shyHop * 0.05 :
    1 + Math.max(0, restPulse) * 0.02 + idleHop * 0.05 + idleSniff * 0.03;
  const squash =
    blob.mode === "rest" ? 1 - (0.06 + Math.max(0, -restPulse) * 0.04 + idleHopSettle * 0.05 + idleSettle * 0.05) :
    blob.mode === "shy" ? 1 - (0.08 + (1 - shyHop) * 0.06) :
    blob.mode === "wander" ? 1 - (wanderHop * 0.06 + idleHopSettle * 0.04 + idleSettle * 0.03 + (blob.waterReaction === "splash" ? 0.035 : 0)) :
    1 - idleHop * 0.04;
    const desiredYaw =
      planarSpeed > 0.05 ? Math.atan2(blob.velocity.x, blob.velocity.z) :
      blob.recruited && planarToPlayer > 0.001 ? Math.atan2(toPlayer.x, toPlayer.z) :
      blob.mode === "curious" && planarToPlayer > 0.001 ? Math.atan2(toPlayer.x, toPlayer.z) :
      blob.facingYaw + (blob.mode === "rest" ? curiousSway * 0.06 : 0);
    const yawBlend = 1 - Math.exp(-dt * (blob.mode === "shy" ? 8 : blob.recruited ? 6 : 5));
    blob.facingYaw = MathUtils.lerp(blob.facingYaw, desiredYaw, yawBlend);

    const visualWaterY =
      blob.recruited && currentWater && currentWater.depth > FAUNA_SHALLOW_WATER_DEPTH
        ? currentWater.surfaceY + (blob.waterReaction === "float" ? 0.36 : 0.12)
        : groundY + 0.08;
    blob.group.position.y = visualWaterY + groundedBob;
  blob.group.rotation.y = blob.facingYaw;
  blob.root.position.y = poseLift - poseDrop;
  blob.root.rotation.x =
    blob.mode === "curious" ? -0.12 + curiousSway * 0.03 :
    blob.mode === "shy" ? -0.08 :
    blob.mode === "wander" ? -0.03 + wanderHop * 0.02 - idleSniff * 0.07 - idleSettle * 0.05 :
    -0.02 + restPulse * 0.015 - idleHop * 0.03 - idleSniff * 0.12 - idleSettle * 0.06;
  blob.root.rotation.z =
    blob.mode === "curious" ? curiousSway * 0.08 :
    blob.mode === "wander" ? Math.sin(elapsed * 3.6 + blob.poseSeed) * 0.04 + idleLookYaw * 0.18 :
    restPulse * 0.02 + idleLookYaw * 0.22;

  blob.body.scale.set(1.12 * squash, 1.42 * stretch, 1.08 * squash);
  blob.body.position.y =
    0.76 * scale +
    (blob.mode === "rest" ? restPulse * 0.015 * scale : 0) -
    idleSettle * 0.015 * scale;
  blob.face.rotation.y =
    blob.mode === "curious" ? curiousSway * 0.28 :
    (blob.mode === "rest" ? curiousSway * 0.08 : 0) + idleLookYaw;
  blob.face.position.y =
    0.88 * scale +
    (blob.mode === "rest" ? restPulse * 0.012 * scale : 0) +
    idleSniff * 0.05 * scale -
    idleSettle * 0.015 * scale;
  blob.face.position.z =
    0.5 * scale +
    (blob.mode === "shy" ? -0.03 * scale : 0) +
    idleSniff * 0.035 * scale;

  const eyeSquish =
    blob.mode === "rest" ? 0.35 + Math.max(0, -restPulse) * 0.22 + idleSettle * 0.16 + blink * 1.35 :
    blob.mode === "shy" ? 0.24 :
    blink * 1.35 + idleSniff * 0.08;
  blob.leftEye.scale.set(0.86 + eyeSquish * 0.18, 1.34 - eyeSquish * 0.56, 0.68);
  blob.rightEye.scale.copy(blob.leftEye.scale);

  blob.feet.forEach((foot, footIndex) => {
      const footHop =
        blob.mode === "wander" ? Math.max(0, Math.sin(elapsed * 6.8 + blob.poseSeed + footIndex * Math.PI * 0.65)) * 0.05 * scale :
        blob.mode === "shy" ? Math.max(0, Math.sin(elapsed * 9.6 + blob.poseSeed + footIndex * Math.PI * 0.75)) * 0.04 * scale :
        idleHop * 0.02 * scale;
    foot.position.set(
      (footIndex === 0 ? -0.18 : 0.18) * scale,
      0.1 * scale + footHop - idleSettle * 0.015 * scale,
      (blob.mode === "shy" ? 0.18 : 0.26) * scale - idleSniff * 0.015 * scale,
    );
      foot.scale.set(
        1.08 - eyeSquish * 0.08,
        0.72 - eyeSquish * 0.08 + footHop / Math.max(0.001, scale),
        0.9,
      );
    });

    blob.fluffPuffs.forEach((puff, puffIndex) => {
      const sway = Math.sin(elapsed * 2.8 + blob.poseSeed + puffIndex * 0.8);
      const puffScale = 1 + sway * 0.03 + (blob.mode === "wander" ? wanderHop * 0.02 : 0);
      if (puffIndex < 4) {
        puff.scale.set(0.42 * scale * puffScale, 0.4 * scale * (1 - sway * 0.02), 0.38 * scale);
      } else if (puffIndex < 7) {
        puff.scale.set(0.28 * scale * puffScale, 0.34 * scale, 0.26 * scale);
      } else {
        puff.scale.set(0.22 * scale * puffScale, 0.16 * scale, 0.18 * scale);
      }
    });
  });

  const nearestAfterRecruit = findNearestRecruitable(blobs, playerPosition);
  return {
    speciesName: AMBIENT_BLOB_SPECIES_NAME,
    recruitedCount: blobs.filter((blob) => blob.recruited).length,
    nearestRecruitableDistance: nearestAfterRecruit.distance,
    recruitedThisFrame,
    dominantMood: dominantMood(blobs),
    regroupActive: blobs.some((blob) => blob.recruited && elapsed < blob.regroupUntil),
  };
}
