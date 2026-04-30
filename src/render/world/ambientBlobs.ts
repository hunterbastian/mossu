import {
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  MathUtils,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import type { FrameState } from "../../simulation/gameState";
import { PLAYER_RADIUS } from "../../simulation/playerSimulationConstants";
import { sampleTerrainHeight, sampleWaterState, scenicPockets, startingLookTarget, startingPosition } from "../../simulation/world";
import { easeOutBack } from "../motionCurves";
import { createKaruModelRig, type AmbientBlobRig } from "../objects/KaruAvatar";
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
  tail: Mesh;
  feet: [Mesh, Mesh, Mesh, Mesh];
  fluffPuffs: Mesh[];
  herdId: number;
  herdCenter: Vector3;
  nestCenter: Vector3;
  nestRadius: number;
  nestYaw: number;
  home: Vector3;
  target: Vector3;
  velocity: Vector3;
  recruited: boolean;
  recruitedAt: number;
  leaderSlot: number;
  mood: KaruMood;
  regroupUntil: number;
  callRespondUntil: number;
  callWaveStartAt: number;
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
  rolling: boolean;
  rollBlend: number;
  rollSpin: number;
  breezeBlend: number;
  lookAtBlend: number;
}

export interface AmbientBlobBuildOptions {
  debugSpiritCloseup?: boolean;
}

export interface AmbientBlobUpdateStats {
  speciesName: string;
  recruitedCount: number;
  nearestRecruitableDistance: number | null;
  recruitedThisFrame: number;
  firstEncounterActive: boolean;
  rollingCount: number;
  mossuCollisionCount: number;
  dominantMood: KaruMood;
  regroupActive: boolean;
  callHeardActive: boolean;
}

export const AMBIENT_BLOB_SPECIES_NAME = "Karu";
const FAUNA_RECRUIT_RADIUS = 14.5;
const FAUNA_CLUSTER_RECRUIT_RADIUS = 16;
const FAUNA_CLUSTER_PLAYER_RADIUS = 19;
const FAUNA_FOLLOW_NEIGHBOR_RADIUS = 13.5;
const FAUNA_SEPARATION_RADIUS = 3.5;
const FAUNA_PLAYER_PERSONAL_SPACE = 3.1;
const FAUNA_REGROUP_SECONDS = 3.4;
const FAUNA_CALL_LISTEN_SECONDS = 0.58;
const FAUNA_CALL_WAVE_STAGGER = 0.13;
const FAUNA_DEEP_WATER_DEPTH = 2.4;
const FAUNA_SHALLOW_WATER_DEPTH = 0.25;
const FAUNA_ROLL_STAGGER_SECONDS = 0.045;
const FAUNA_ROLL_SPEED_MULTIPLIER = 1.34;
const FAUNA_IDLE_COLLISION_RADIUS = 1.08;
const FAUNA_RECRUITED_COLLISION_RADIUS = 1.26;
const FAUNA_ROLL_COLLISION_RADIUS = 1.48;
const FAUNA_COLLISION_MAX_CORRECTION = 0.82;
const FAUNA_COLLISION_VELOCITY_RESPONSE = 0.42;
const FAUNA_RECRUITED_IDLE_PLAYER_SPEED = 0.65;
const FAUNA_RECRUITED_IDLE_MAX_DISTANCE = 13.5;
const FAUNA_RECRUITED_IDLE_SLOT_DISTANCE = 7.5;
const FAUNA_NEST_WANDER_RADIUS = 2.8;
const FAUNA_NEST_RETURN_RADIUS = 7.2;
const FAUNA_NEST_SHY_LIMIT_RADIUS = 11.5;

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
const ambientCollisionNormal = new Vector3();
const ambientNestOffset = new Vector3();

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
  let bestScore = Number.POSITIVE_INFINITY;
  let found = false;

  for (let radius = 4; radius <= 24; radius += 4) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      candidate.set(point.x + Math.cos(angle) * radius, 0, point.z + Math.sin(angle) * radius);
      const water = sampleWaterState(candidate.x, candidate.z);
      if (water && water.swimAllowed && water.depth >= FAUNA_DEEP_WATER_DEPTH) {
        continue;
      }

      const depth = water ? water.depth : 0;
      const distance = Math.hypot(candidate.x - fallback.x, candidate.z - fallback.z);
      // Prefer standable bank: shallower water first, then closer to the player path.
      const score = distance * 0.55 + depth * 9.5;
      if (score < bestScore) {
        bestScore = score;
        best.set(candidate.x, sampleTerrainHeight(candidate.x, candidate.z), candidate.z);
        found = true;
      }
    }
  }

  if (found) {
    return best;
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

function clampTargetAroundNest(blob: AmbientBlob, target: Vector3, radius: number) {
  ambientNestOffset
    .subVectors(target, blob.nestCenter)
    .setY(0);
  const distance = ambientNestOffset.length();
  if (distance > radius && distance > 0.001) {
    ambientNestOffset.multiplyScalar(radius / distance);
    target.set(
      blob.nestCenter.x + ambientNestOffset.x,
      blob.nestCenter.y,
      blob.nestCenter.z + ambientNestOffset.z,
    );
  }
  target.y = sampleTerrainHeight(target.x, target.z);
}

function collisionRadiusForBlob(blob: AmbientBlob) {
  const baseRadius =
    blob.rolling ? FAUNA_ROLL_COLLISION_RADIUS :
    blob.recruited ? FAUNA_RECRUITED_COLLISION_RADIUS :
    FAUNA_IDLE_COLLISION_RADIUS;
  return baseRadius * MathUtils.clamp(blob.creatureScale / 1.22, 0.92, 1.18);
}

function resolveMossuKaruCollision(blob: AmbientBlob, frame: FrameState) {
  const player = frame.player;
  if (player.fallingToVoid) {
    return false;
  }

  const blobRadius = collisionRadiusForBlob(blob);
  const playerRadius = PLAYER_RADIUS * (player.rolling ? 0.82 : 0.74);
  const minDistance = blobRadius + playerRadius;
  const dx = blob.group.position.x - player.position.x;
  const dz = blob.group.position.z - player.position.z;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= minDistance * minDistance) {
    return false;
  }

  const distance = Math.sqrt(distanceSq);
  if (distance > 0.001) {
    ambientCollisionNormal.set(dx / distance, 0, dz / distance);
  } else {
    ambientCollisionNormal.set(Math.sin(blob.poseSeed), 0, Math.cos(blob.poseSeed)).normalize();
  }

  const overlap = minDistance - Math.max(distance, 0.001);
  const correction = Math.min(overlap, FAUNA_COLLISION_MAX_CORRECTION);
  const playerPushShare = player.swimming ? 0 : blob.recruited ? (player.rolling ? 0.18 : 0.1) : 0.04;
  const blobPushShare = 1 - playerPushShare;

  blob.group.position.addScaledVector(ambientCollisionNormal, correction * blobPushShare);
  if (playerPushShare > 0) {
    player.position.addScaledVector(ambientCollisionNormal, -correction * playerPushShare);
    if (player.grounded && !player.swimming) {
      player.position.y = sampleTerrainHeight(player.position.x, player.position.z);
    }
  }

  const relativeVelocity =
    (blob.velocity.x - player.velocity.x) * ambientCollisionNormal.x +
    (blob.velocity.z - player.velocity.z) * ambientCollisionNormal.z;
  if (relativeVelocity < 0) {
    const impulse = -relativeVelocity * FAUNA_COLLISION_VELOCITY_RESPONSE;
    blob.velocity.addScaledVector(ambientCollisionNormal, impulse * blobPushShare);
    if (playerPushShare > 0) {
      player.velocity.x -= ambientCollisionNormal.x * impulse * playerPushShare;
      player.velocity.z -= ambientCollisionNormal.z * impulse * playerPushShare;
    }
  }

  return true;
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

/** One press recruits the nearest Karu plus same-herd mates nearby (small-cluster). */
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
    blob.callRespondUntil = elapsed + 0.3;
    blob.callWaveStartAt = elapsed + 0.04 + blob.leaderSlot * 0.03;
    blob.mode = "curious";
    blob.avoidPlayerUntil = 0;
    blob.investigateAgainAt = elapsed + 5;
    blob.restUntil = elapsed + 0.18;
    blob.target.copy(playerPosition);
    recruitedCount += 1;
  });

  return recruitedCount;
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
    blob.nestCenter.set(x, y, z);
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

export function buildAmbientBlobNests(blobs: readonly AmbientBlob[]) {
  const group = new Group();
  group.name = "karu-nest-habitats";

  const nestFloorMaterial = new MeshLambertMaterial({
    color: "#b7a777",
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: DoubleSide,
  });
  const mossMaterial = new MeshLambertMaterial({ color: "#83ad58" });
  const deepMossMaterial = new MeshLambertMaterial({ color: "#58723e" });
  const leafMaterial = new MeshLambertMaterial({ color: "#9fc96b" });
  const twigMaterial = new MeshLambertMaterial({ color: "#80633f" });
  const beddingMaterial = new MeshLambertMaterial({ color: "#eee0b9" });
  const warmBeddingMaterial = new MeshLambertMaterial({ color: "#f5e7bd" });
  const pebbleMaterial = new MeshStandardMaterial({ color: "#bdb49b", roughness: 1, metalness: 0 });
  const flowerMaterial = new MeshBasicMaterial({ color: "#fff3ce", transparent: true, opacity: 0.9 });
  const berryMaterial = new MeshLambertMaterial({ color: "#c66e46" });
  const glowSeedMaterial = new MeshBasicMaterial({ color: "#ffd978", transparent: true, opacity: 0.82 });

  blobs.forEach((blob, blobIndex) => {
    const center = blob.nestCenter;
    const radius = blob.nestRadius;
    const yaw = blob.nestYaw;
    const nest = new Group();
    nest.name = `${blob.id}-nest`;

    const floor = new Mesh(new CircleGeometry(1, 30), nestFloorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.rotation.z = yaw;
    floor.position.set(center.x, center.y + 0.035, center.z);
    floor.scale.set(radius * 1.1, radius * 0.82, 1);
    nest.add(floor);

    const cupShadow = new Mesh(new CircleGeometry(1, 24), deepMossMaterial);
    cupShadow.rotation.x = -Math.PI / 2;
    cupShadow.rotation.z = yaw + 0.12;
    cupShadow.position.set(center.x, center.y + 0.058, center.z);
    cupShadow.scale.set(radius * 0.54, radius * 0.42, 1);
    nest.add(cupShadow);

    const wovenRim = new Mesh(new TorusGeometry(1, 0.09, 8, 32), twigMaterial);
    wovenRim.rotation.x = Math.PI / 2;
    wovenRim.rotation.z = yaw;
    wovenRim.position.set(center.x, center.y + 0.16, center.z);
    wovenRim.scale.set(radius * 0.9, radius * 0.64, 0.74);
    nest.add(wovenRim);

    for (let i = 0; i < 14; i += 1) {
      const angle = yaw + (i / 14) * Math.PI * 2 + Math.sin(blob.poseSeed + i * 1.9) * 0.1;
      const ringRadius = radius * (0.8 + (i % 4) * 0.065);
      const x = center.x + Math.cos(angle) * ringRadius;
      const z = center.z + Math.sin(angle) * ringRadius;
      const y = sampleTerrainHeight(x, z);
      const clump = new Mesh(
        new SphereGeometry(1, 10, 7),
        i % 3 === 0 ? deepMossMaterial : i % 2 === 0 ? mossMaterial : leafMaterial,
      );
      clump.position.set(x, y + 0.16 + (i % 3) * 0.024, z);
      clump.rotation.y = angle;
      clump.scale.set(radius * (0.22 + (i % 3) * 0.035), 0.13, radius * (0.13 + (i % 4) * 0.025));
      nest.add(clump);
    }

    for (let i = 0; i < 11; i += 1) {
      const angle = yaw + (i / 11) * Math.PI * 2 + 0.22;
      const x = center.x + Math.cos(angle) * radius * 0.72;
      const z = center.z + Math.sin(angle) * radius * 0.72;
      const twig = new Mesh(new CylinderGeometry(0.03, 0.045, radius * 0.78, 6), twigMaterial);
      twig.position.set(x, sampleTerrainHeight(x, z) + 0.18, z);
      twig.rotation.set(0.08 * Math.sin(i + blob.poseSeed), angle + Math.PI / 2, Math.PI / 2 + Math.sin(i * 0.8) * 0.16);
      nest.add(twig);
    }

    for (let i = 0; i < 9; i += 1) {
      const angle = yaw + (i / 9) * Math.PI * 2 + 0.1;
      const x = center.x + Math.cos(angle) * radius * (0.26 + (i % 2) * 0.06);
      const z = center.z + Math.sin(angle) * radius * (0.2 + (i % 3) * 0.035);
      const y = sampleTerrainHeight(x, z);
      const petal = new Mesh(new SphereGeometry(1, 10, 6), i % 3 === 0 ? warmBeddingMaterial : beddingMaterial);
      petal.position.set(x, y + 0.13 + i * 0.004, z);
      petal.rotation.y = angle;
      petal.scale.set(radius * 0.17, 0.045, radius * 0.3);
      nest.add(petal);
    }

    for (let i = 0; i < 5; i += 1) {
      const angle = yaw + Math.PI * 0.86 + i * 0.35;
      const x = center.x + Math.cos(angle) * radius * (0.98 + (i % 2) * 0.16);
      const z = center.z + Math.sin(angle) * radius * (0.98 + (i % 2) * 0.16);
      const pebble = new Mesh(new SphereGeometry(1, 8, 6), i === 2 ? berryMaterial : pebbleMaterial);
      pebble.position.set(x, sampleTerrainHeight(x, z) + 0.08, z);
      pebble.scale.set(0.12 + (i % 2) * 0.035, 0.055, 0.1 + (i % 3) * 0.024);
      nest.add(pebble);
    }

    for (let i = 0; i < 4; i += 1) {
      const side = i < 2 ? -1 : 1;
      const angle = yaw + side * (0.55 + i * 0.13);
      const x = center.x + Math.cos(angle) * radius * 1.04;
      const z = center.z + Math.sin(angle) * radius * 1.04;
      const y = sampleTerrainHeight(x, z);
      const stem = new Mesh(new ConeGeometry(0.025, 0.34, 6), leafMaterial);
      stem.position.set(x, y + 0.18, z);
      stem.rotation.z = side * 0.16;
      nest.add(stem);

      const bloom = new Mesh(new SphereGeometry(0.07, 8, 6), i % 2 === 0 ? flowerMaterial : glowSeedMaterial);
      bloom.position.set(x, y + 0.38 + (i % 2) * 0.05, z);
      bloom.scale.set(1, 0.48, 1);
      nest.add(bloom);
    }

    const shadeLeaf = new Mesh(new SphereGeometry(1, 10, 6), leafMaterial);
    shadeLeaf.position.set(
      center.x + Math.cos(yaw - 0.62) * radius * 0.22,
      sampleTerrainHeight(center.x, center.z) + 0.52 + (blobIndex % 2) * 0.05,
      center.z + Math.sin(yaw - 0.62) * radius * 0.22,
    );
    shadeLeaf.rotation.set(0.08, yaw - 0.42, -0.18);
    shadeLeaf.scale.set(radius * 0.28, 0.05, radius * 0.42);
    nest.add(shadeLeaf);

    const backCanopy = new Mesh(new SphereGeometry(1, 10, 6), leafMaterial);
    backCanopy.position.set(
      center.x + Math.cos(yaw + Math.PI) * radius * 0.42,
      sampleTerrainHeight(center.x, center.z) + 0.34,
      center.z + Math.sin(yaw + Math.PI) * radius * 0.42,
    );
    backCanopy.rotation.set(0.02, yaw + 0.18, 0.12);
    backCanopy.scale.set(radius * 0.36, 0.08, radius * 0.2);
    nest.add(backCanopy);

    group.add(nest);
  });

  return group;
}

function openingHerdLayout(pocketId: string, index: number) {
  const forward = new Vector3().subVectors(startingLookTarget, startingPosition).setY(0).normalize();
  const right = new Vector3(forward.z, 0, -forward.x).normalize();
  const layouts: Record<string, Array<{ forwardOffset: number; rightOffset: number }>> = {
    "start-meadow": [
      { forwardOffset: 7.5, rightOffset: -1.8 },
      { forwardOffset: 11.2, rightOffset: 1.8 },
      { forwardOffset: 14.6, rightOffset: -4.5 },
    ],
    "burrow-bloom": [
      { forwardOffset: 42, rightOffset: 11 },
      { forwardOffset: 50, rightOffset: 16 },
    ],
  };
  const layout = layouts[pocketId]?.[index];
  if (!layout) {
    return null;
  }
  return {
    x: startingPosition.x + forward.x * layout.forwardOffset + right.x * layout.rightOffset,
    z: startingPosition.z + forward.z * layout.forwardOffset + right.z * layout.rightOffset,
  };
}

export function buildAmbientBlobs(options: AmbientBlobBuildOptions = {}) {
  const plainsHomes = scenicPockets.filter((pocket) => pocket.zone === "plains");
  const blobs = plainsHomes.flatMap((pocket, pocketIndex): AmbientBlob[] =>
    Array.from({ length: pocketIndex === 0 ? 3 : 2 }, (_, index) => {
      const scattered = scatterAroundPocket(pocket, 200 + pocketIndex * 20 + index, 0.46);
      const staged = openingHerdLayout(pocket.id, index);
      const x = staged?.x ?? scattered.x;
      const z = staged?.z ?? scattered.z;
      const y = sampleTerrainHeight(x, z);
      const herdCenter = new Vector3(
        pocket.position.x,
        sampleTerrainHeight(pocket.position.x, pocket.position.z),
        pocket.position.z,
      );
      const creatureScale = 1.18 + index * 0.12;
      const rig = createKaruModelRig(creatureScale);
      rig.group.position.set(x, y, z);
      const facingYaw = staged
        ? Math.atan2(startingPosition.x - x, startingPosition.z - z)
        : Math.sin((pocketIndex + 1) * 2.6 + index * 1.9) * 0.7;
      const nestRadius = 2.25 + (index % 2) * 0.18 + (pocket.kind === "moss_hollow" ? 0.18 : 0);
      const nestYaw = staged ? facingYaw + 0.08 * (index - 1) : facingYaw + Math.sin(pocketIndex * 1.8 + index) * 0.28;
      rig.group.rotation.y = facingYaw;
      return {
        ...rig,
        id: `karu-${pocketIndex}-${index}`,
        herdId: pocketIndex,
        herdCenter,
        nestCenter: new Vector3(x, y, z),
        nestRadius,
        nestYaw,
        home: new Vector3(x, y, z),
        target: new Vector3(x, y, z),
        velocity: new Vector3(),
        recruited: false,
        recruitedAt: 0,
        leaderSlot: pocketIndex * 3 + index,
        mood: moodForBlob(pocketIndex, index),
        regroupUntil: 0,
        callRespondUntil: 0,
        callWaveStartAt: 0,
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
        rolling: false,
        rollBlend: 0,
        rollSpin: 0,
        breezeBlend: 0,
        lookAtBlend: 0,
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
      firstEncounterActive: false,
      rollingCount: blobs.filter((blob) => blob.recruited && blob.rolling).length,
      mossuCollisionCount: 0,
      dominantMood: dominantMood(blobs),
      regroupActive: false,
      callHeardActive: false,
    };
  }

  const playerPosition = frame.player.position;
  const playerPlanarSpeed = Math.hypot(frame.player.velocity.x, frame.player.velocity.z);
  const playerFloating = frame.player.floating && !frame.player.swimming;
  const playerRolling = frame.player.rolling && !frame.player.swimming && !playerFloating;
  ambientPlayerMotion.set(frame.player.velocity.x, 0, frame.player.velocity.z);
  const nearestBeforeRecruit = findNearestRecruitable(blobs, playerPosition);
  const recruitedThisFrame =
    recruitPressed &&
    nearestBeforeRecruit.blob &&
    nearestBeforeRecruit.distance !== null &&
    nearestBeforeRecruit.distance <= FAUNA_RECRUIT_RADIUS
      ? recruitNearbyBlobs(blobs, nearestBeforeRecruit.blob, playerPosition, elapsed)
      : 0;
  let mossuCollisionCount = 0;
  let firstEncounterActive = false;
  if (regroupPressed) {
    blobs.forEach((blob) => {
      if (blob.recruited) {
        blob.regroupUntil = elapsed + FAUNA_REGROUP_SECONDS;
        blob.callRespondUntil = elapsed + FAUNA_CALL_LISTEN_SECONDS + blob.leaderSlot * 0.035;
        blob.callWaveStartAt = elapsed + 0.07 + blob.leaderSlot * FAUNA_CALL_WAVE_STAGGER;
        blob.restUntil = Math.max(blob.restUntil, blob.callRespondUntil);
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
    const firstEncounterWatch =
      !blob.recruited &&
      frame.player.grounded &&
      !frame.player.swimming &&
      !frame.player.fallingToVoid &&
      !playerApproaching &&
      !stillAvoidingPlayer &&
      planarToPlayer > 7.2 &&
      planarToPlayer < 19.5;
    firstEncounterActive = firstEncounterActive || firstEncounterWatch;

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
    const nestDistance = ambientNestOffset
      .subVectors(blob.group.position, blob.nestCenter)
      .setY(0)
      .length();
    const awayFromNest = !blob.recruited && nestDistance > FAUNA_NEST_RETURN_RADIUS && elapsed >= blob.avoidPlayerUntil;

    if (blob.mode === "curious" && blob.restUntil < elapsed) {
      blob.investigateAgainAt = elapsed + 2.6 + (index % 2) * 0.5;
    }

    let recruitedMoveStrength = 0;
    let recruitedIdleWanderActive = false;
    if (blob.recruited) {
      const tuning = moodFollowTuning(blob.mood);
      const regroupActive = elapsed < blob.regroupUntil;
      const listeningForCall = elapsed < blob.callRespondUntil;
      const waitingForCallWave = regroupActive && elapsed < blob.callWaveStartAt;
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
      const callWaveTighten = waitingForCallWave ? 1.18 : 1;
      const rollFollowTighten = playerRolling ? 0.8 : 1;
      const followBackDistance =
        (5.6 + slotRow * 2.45 + (blob.leaderSlot % 2) * 0.45 + tuning.backOffset)
        * regroupTighten
        * callWaveTighten
        * rollFollowTighten;
      const followSideDistance =
        (slotColumn * (3.25 + slotRow * 0.28) + slotJitter)
        * tuning.sideScale
        * regroupTighten
        * callWaveTighten
        * rollFollowTighten;
      ambientLeaderSlot
        .copy(playerPosition)
        .addScaledVector(ambientFollowDirection, -followBackDistance)
        .addScaledVector(ambientRightDirection, followSideDistance);
      ambientLeaderSlot.y = sampleTerrainHeight(ambientLeaderSlot.x, ambientLeaderSlot.z);
      const formationDistance = planarDistance(blob.group.position, ambientLeaderSlot);
      recruitedIdleWanderActive =
        playerPlanarSpeed < FAUNA_RECRUITED_IDLE_PLAYER_SPEED &&
        !frame.player.swimming &&
        frame.player.grounded &&
        !playerRolling &&
        !playerFloating &&
        !regroupActive &&
        !listeningForCall &&
        !waitingForCallWave &&
        elapsed - blob.recruitedAt > 0.8 &&
        planarToPlayer < FAUNA_RECRUITED_IDLE_MAX_DISTANCE &&
        formationDistance < FAUNA_RECRUITED_IDLE_SLOT_DISTANCE;
      if (recruitedIdleWanderActive) {
        const moodOrbitSpeed =
          blob.mood === "sleepy" ? 0.12 :
          blob.mood === "brave" ? 0.2 :
          0.16;
        const orbitAngle = elapsed * moodOrbitSpeed + blob.poseSeed * 2.4 + blob.leaderSlot * 1.37;
        const orbitRadius =
          (4.6 + (blob.leaderSlot % 3) * 0.82 + Math.floor(blob.leaderSlot / 3) * 0.38)
          * (blob.mood === "shy" ? 1.16 : blob.mood === "sleepy" ? 0.92 : 1);
        const orbitBreath = Math.sin(elapsed * 0.37 + blob.poseSeed) * 0.42;
        ambientLeaderSlot
          .copy(playerPosition)
          .addScaledVector(ambientFollowDirection, Math.cos(orbitAngle) * orbitRadius * 0.78 + orbitBreath)
          .addScaledVector(ambientRightDirection, Math.sin(orbitAngle) * orbitRadius);
        ambientLeaderSlot.y = sampleTerrainHeight(ambientLeaderSlot.x, ambientLeaderSlot.z);
      }
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

      const rollStagger = Math.min(0.42, blob.leaderSlot * FAUNA_ROLL_STAGGER_SECONDS);
      const canRollWithMossu =
        blob.waterReaction !== "float" &&
        blob.waterReaction !== "bank_wait" &&
        !listeningForCall &&
        !waitingForCallWave;
      blob.rolling =
        canRollWithMossu &&
        playerRolling &&
        frame.player.rollHoldSeconds >= rollStagger &&
        (playerPlanarSpeed > 2.6 || followDistance > 3.2);

      ambientPlayerSpace.set(0, 0, 0);
      if (planarToPlayer < FAUNA_PLAYER_PERSONAL_SPACE && planarToPlayer > 0.001) {
        ambientPlayerSpace
          .copy(toPlayer)
          .setY(0)
          .multiplyScalar(-1 / planarToPlayer);
      }

      ambientBoidSteer
        .set(0, 0, 0)
        .addScaledVector(
          ambientFollowSteer,
          (1.55 + MathUtils.clamp(followDistance / 14, 0, 1.2)) * (regroupActive && !waitingForCallWave ? 1.25 : 1),
        )
        .addScaledVector(ambientSeparation, 1.95)
        .addScaledVector(ambientBoidCohesion, 0.38)
        .addScaledVector(ambientAlignment, 0.3)
        .addScaledVector(ambientPlayerSpace, 1.35);
      if (ambientBoidSteer.lengthSq() > 0.001) {
        ambientBoidSteer.normalize();
      } else {
        ambientBoidSteer.copy(ambientFollowSteer);
      }

      const targetLead = recruitedIdleWanderActive
        ? MathUtils.clamp(followDistance * 0.2 + 1.18, 1.1, 3.2)
        : MathUtils.clamp(
          followDistance * (blob.rolling ? 0.36 : playerRolling ? 0.34 : 0.3) + (blob.rolling ? 3.35 : playerRolling ? 3.1 : 2.4),
          2.2,
          blob.rolling ? 8.8 : playerRolling ? 8.2 : 7.4,
        );
      blob.target
        .copy(blob.group.position)
        .addScaledVector(ambientBoidSteer, targetLead);
      blob.target.y = ambientLeaderSlot.y;
      recruitedMoveStrength =
        followDistance > 18 ? 5.6 :
        followDistance > 9 ? 4.1 :
        followDistance > 3.4 ? 2.55 :
        1.15;
      recruitedMoveStrength *=
        tuning.speedScale *
        (regroupActive && !waitingForCallWave ? 1.12 : 1) *
        (playerRolling ? 1.12 : 1) *
        (blob.rolling ? FAUNA_ROLL_SPEED_MULTIPLIER : 1);
      if (recruitedIdleWanderActive) {
        recruitedMoveStrength *= 0.58;
      }
      if (blob.waterReaction === "bank_wait") {
        recruitedMoveStrength *= 0.82;
      } else if (blob.waterReaction === "float") {
        recruitedMoveStrength *= 0.9;
      }
      if (listeningForCall) {
        recruitedMoveStrength = 0;
        blob.velocity.multiplyScalar(0.78);
      } else if (waitingForCallWave) {
        recruitedMoveStrength *= 0.28;
      }
      if (followDistance < 1.2 && ambientSeparation.lengthSq() < 0.001) {
        recruitedMoveStrength = 0;
      }
    } else if (firstEncounterWatch && blob.mode !== "shy") {
      blob.rolling = false;
      blob.mode = "curious";
      blob.target.copy(blob.group.position);
      blob.target.y = sampleTerrainHeight(blob.target.x, blob.target.z);
      blob.restUntil = Math.max(blob.restUntil, elapsed + 0.78 + (index % 2) * 0.12);
      blob.nextHopAt = Math.max(blob.nextHopAt, elapsed + 0.72);
      blob.idlePose = planarToPlayer < 12.5 ? "sniff" : (index % 2 === 0 ? "look_left" : "look_right");
      blob.idlePoseStartAt = elapsed;
      blob.idlePoseUntil = elapsed + 0.86;
      blob.investigateAgainAt = Math.max(blob.investigateAgainAt, elapsed + 1.7);
    } else if (playerTooClose || playerApproaching || stillAvoidingPlayer) {
      blob.rolling = false;
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
      clampTargetAroundNest(blob, blob.target, FAUNA_NEST_SHY_LIMIT_RADIUS);
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
      blob.rolling = false;
      blob.mode = "curious";
      blob.target.set(
        playerPosition.x - toPlayer.x * 0.35,
        playerPosition.y,
        playerPosition.z - toPlayer.z * 0.35,
      );
      blob.restUntil = elapsed + 1.3;
    } else if (blob.restUntil < elapsed) {
      blob.rolling = false;
      if (awayFromNest) {
        blob.mode = "wander";
        const returnAngle = Math.atan2(blob.group.position.z - blob.nestCenter.z, blob.group.position.x - blob.nestCenter.x) + 0.65;
        blob.target.set(
          blob.nestCenter.x + Math.cos(returnAngle) * blob.nestRadius * 0.8,
          blob.nestCenter.y,
          blob.nestCenter.z + Math.sin(returnAngle) * blob.nestRadius * 0.7,
        );
        blob.target.y = sampleTerrainHeight(blob.target.x, blob.target.z);
        blob.restUntil = elapsed + 1.2;
      } else if (separatedFromHerd && elapsed >= blob.avoidPlayerUntil) {
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
        const wanderRadiusX = Math.min(FAUNA_NEST_WANDER_RADIUS, blob.nestRadius * (1.08 + (index % 3) * 0.08));
        const wanderRadiusZ = Math.min(FAUNA_NEST_WANDER_RADIUS * 0.82, blob.nestRadius * (0.82 + (index % 2) * 0.1));
        blob.target.set(
          blob.nestCenter.x + Math.cos(wanderAngle) * wanderRadiusX,
          blob.nestCenter.y,
          blob.nestCenter.z + Math.sin(wanderAngle) * wanderRadiusZ,
        );
        blob.target.y = sampleTerrainHeight(blob.target.x, blob.target.z);
        blob.restUntil = elapsed + 2.2 + (index % 3) * 0.5;
      } else {
        blob.mode = "rest";
        blob.target.copy(blob.group.position);
        blob.restUntil = elapsed + 1.8 + (index % 2) * 0.8;
      }
    }

    const wantsLookAtPlayer =
      !blob.recruited &&
      !frame.player.fallingToVoid &&
      planarToPlayer > 0.001 &&
      planarToPlayer < 21 &&
      (firstEncounterWatch || blob.mode === "curious");
    blob.lookAtBlend = MathUtils.damp(
      blob.lookAtBlend,
      wantsLookAtPlayer ? 1 : 0,
      wantsLookAtPlayer ? 4.6 : 7.2,
      dt,
    );
    const lookAtT = easeOutBack(blob.lookAtBlend, 1.08);

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
      if (!blob.recruited) {
        const nestLimit = blob.mode === "shy"
          ? FAUNA_NEST_SHY_LIMIT_RADIUS
          : blob.mode === "curious"
            ? FAUNA_NEST_SHY_LIMIT_RADIUS * 0.9
          : Math.max(FAUNA_NEST_WANDER_RADIUS * 1.3, blob.nestRadius * 1.55);
        clampTargetAroundNest(blob, ambientDesiredTarget, nestLimit);
      }
      ambientTrailDirection
        .subVectors(ambientDesiredTarget, blob.group.position)
        .setY(0);
      const distance = ambientTrailDirection.length();
      if (distance > 0.12) {
        ambientTrailDirection.normalize();
        blob.velocity.lerp(ambientTrailDirection.multiplyScalar(moveStrength), 1 - Math.exp(-dt * (blob.rolling ? 4.1 : 2.6)));
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

    if (resolveMossuKaruCollision(blob, frame)) {
      mossuCollisionCount += 1;
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
  if (!blob.recruited || blob.waterReaction === "float" || blob.waterReaction === "bank_wait") {
    blob.rolling = false;
  }

  const planarSpeed = blob.velocity.length();
  const wantsRollMimic = blob.rolling;
  blob.rollBlend = MathUtils.damp(blob.rollBlend, wantsRollMimic ? 1 : 0, wantsRollMimic ? 8.5 : 6.5, dt);
  const wantsBreezeMimic =
    blob.recruited &&
    playerFloating &&
    !blob.rolling &&
    blob.waterReaction !== "float" &&
    blob.waterReaction !== "bank_wait" &&
    planarToPlayer < 18;
  blob.breezeBlend = MathUtils.damp(blob.breezeBlend, wantsBreezeMimic ? 1 : 0, wantsBreezeMimic ? 5.4 : 7.2, dt);
  if (blob.rollBlend > 0.02) {
    blob.rollSpin = (blob.rollSpin + (playerPlanarSpeed * 0.16 + planarSpeed * 0.36 + 1.6 + index * 0.08) * dt) % (Math.PI * 2);
  }
  const rollMimicT = blob.rollBlend;
  const breezeMimicT = blob.breezeBlend;
  const rollBounce = Math.max(0, Math.sin(blob.rollSpin * 2 + blob.poseSeed)) * rollMimicT;
  const breezeBounce = (0.12 + Math.sin(elapsed * 2.5 + blob.poseSeed) * 0.045) * breezeMimicT;
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
  const callWaveT =
    blob.recruited && elapsed >= blob.callWaveStartAt && elapsed < blob.callWaveStartAt + 0.62
      ? Math.sin(MathUtils.clamp((elapsed - blob.callWaveStartAt) / 0.62, 0, 1) * Math.PI)
      : 0;
  const callListenT =
    blob.recruited && elapsed < blob.callRespondUntil
      ? Math.sin(MathUtils.clamp(1 - (blob.callRespondUntil - elapsed) / FAUNA_CALL_LISTEN_SECONDS, 0, 1) * Math.PI)
      : 0;
  const groundedBob = Math.max(0, Math.sin(elapsed * 4.2 + blob.bobOffset)) * planarSpeed * 0.08;
  const poseLift =
    (blob.mode === "wander" ? Math.max(wanderHop * 0.2 * scale, idleHop * 0.15 * scale, waterHop, callWaveT * 0.34 * scale) :
    blob.mode === "shy" ? shyHop * 0.16 * scale :
    idleHop * 0.15 * scale) + rollBounce * 0.14 * scale + breezeBounce * scale;
    const poseDrop =
    blob.mode === "rest" ? (0.03 + restPulse * 0.012 + idleHopSettle * 0.028 + idleSettle * 0.022) * scale :
    blob.mode === "shy" ? (0.05 + (1 - shyHop) * 0.04) * scale :
    (idleHopSettle * 0.024 + idleSettle * 0.016) * scale;
  const baseStretch =
    blob.mode === "wander" ? 1 + wanderHop * 0.08 + idleHop * 0.03 + (blob.mood === "sleepy" ? 0.025 : 0) :
    blob.mode === "shy" ? 1 + shyHop * 0.05 :
    1 + Math.max(0, restPulse) * 0.02 + idleHop * 0.05 + idleSniff * 0.03;
  const stretch = MathUtils.lerp(baseStretch + breezeMimicT * 0.08, 0.92 + rollBounce * 0.04, rollMimicT * 0.68);
  const baseSquash =
    blob.mode === "rest" ? 1 - (0.06 + Math.max(0, -restPulse) * 0.04 + idleHopSettle * 0.05 + idleSettle * 0.05) :
    blob.mode === "shy" ? 1 - (0.08 + (1 - shyHop) * 0.06) :
    blob.mode === "wander" ? 1 - (wanderHop * 0.06 + idleHopSettle * 0.04 + idleSettle * 0.03 + (blob.waterReaction === "splash" ? 0.035 : 0)) :
    1 - idleHop * 0.04;
  const squash = MathUtils.lerp(baseSquash - breezeMimicT * 0.035, 1.15 - rollBounce * 0.04, rollMimicT * 0.68);
    const playerLookYaw = planarToPlayer > 0.001 ? Math.atan2(toPlayer.x, toPlayer.z) : blob.facingYaw;
    const desiredYaw =
      callListenT > 0.001 && planarToPlayer > 0.001 ? playerLookYaw :
      planarSpeed > 0.05 ? Math.atan2(blob.velocity.x, blob.velocity.z) :
      blob.recruited && planarToPlayer > 0.001 ? playerLookYaw :
      lookAtT > 0.04 ? playerLookYaw :
      blob.facingYaw + (blob.mode === "rest" ? curiousSway * 0.06 : 0);
    const baseYawDamping = blob.mode === "shy" ? 8 : blob.recruited ? 6 : 4.6;
    const yawBlend = 1 - Math.exp(-dt * (baseYawDamping + lookAtT * 2.4));
    blob.facingYaw = MathUtils.lerp(blob.facingYaw, desiredYaw, yawBlend);

    const visualWaterY =
      blob.recruited && currentWater && currentWater.depth > FAUNA_SHALLOW_WATER_DEPTH
        ? currentWater.surfaceY + (blob.waterReaction === "float" ? 0.36 : 0.12)
        : groundY + 0.08;
    blob.group.position.y = visualWaterY + groundedBob;
  blob.group.rotation.y = blob.facingYaw;
  blob.root.position.y = poseLift - poseDrop;
  const baseRootX =
    callListenT > 0 ? -0.18 - callListenT * 0.08 :
    blob.mode === "curious" ? -0.12 + curiousSway * 0.03 - lookAtT * 0.035 :
    blob.mode === "shy" ? -0.08 :
    blob.mode === "wander" ? -0.03 + wanderHop * 0.02 - idleSniff * 0.07 - idleSettle * 0.05 :
    -0.02 + restPulse * 0.015 - idleHop * 0.03 - idleSniff * 0.12 - idleSettle * 0.06;
  const baseRootZ =
    blob.mode === "curious" ? curiousSway * 0.08 :
    blob.mode === "wander" ? Math.sin(elapsed * 3.6 + blob.poseSeed) * 0.04 + idleLookYaw * 0.18 :
    restPulse * 0.02 + idleLookYaw * 0.22;
  blob.root.rotation.x = baseRootX + rollMimicT * blob.rollSpin - breezeMimicT * 0.1;
  blob.root.rotation.z = baseRootZ + rollMimicT * Math.sin(blob.rollSpin * 0.7 + blob.poseSeed) * 0.16 + breezeMimicT * Math.sin(elapsed * 2.2 + blob.poseSeed) * 0.045;

  blob.body.scale.set(1.16 * squash, 1.04 * stretch, 1.14 * MathUtils.lerp(squash, 0.92, rollMimicT * 0.36));
  blob.body.position.y =
    0.62 * scale +
    (blob.mode === "rest" ? restPulse * 0.015 * scale : 0) -
    idleSettle * 0.015 * scale;
  blob.face.rotation.y =
    callListenT > 0 ? Math.sin(elapsed * 9.5 + blob.poseSeed) * 0.06 :
    blob.mode === "curious" ? curiousSway * 0.22 + lookAtT * Math.sin(elapsed * 3.4 + blob.poseSeed) * 0.045 :
    (blob.mode === "rest" ? curiousSway * 0.08 : 0) + idleLookYaw;
  blob.face.position.y =
    0.73 * scale +
    (blob.mode === "rest" ? restPulse * 0.012 * scale : 0) +
    idleSniff * 0.05 * scale -
    idleSettle * 0.015 * scale +
    breezeMimicT * 0.035 * scale;
  blob.face.position.z =
    0.56 * scale +
    (blob.mode === "shy" ? -0.03 * scale : 0) +
    idleSniff * 0.045 * scale -
    breezeMimicT * 0.04 * scale;

  const baseEyeSquish =
    callListenT > 0 ? 0.08 + blink * 0.4 :
    blob.mode === "rest" ? 0.35 + Math.max(0, -restPulse) * 0.22 + idleSettle * 0.16 + blink * 1.35 :
    blob.mode === "shy" ? 0.24 :
    blink * 1.35 + idleSniff * 0.08;
  const eyeSquish = Math.max(0, baseEyeSquish + rollMimicT * 0.12 - breezeMimicT * 0.05);
  blob.leftEye.scale.set(0.72 + eyeSquish * 0.12, 1.58 - eyeSquish * 0.7, 0.32);
  blob.rightEye.scale.copy(blob.leftEye.scale);

  const tailWag = Math.sin(elapsed * 3.2 + blob.poseSeed) * (
    blob.mode === "wander" ? 0.12 :
    blob.mode === "curious" ? 0.08 :
    0.045
  ) + callListenT * 0.12;
  blob.tail.position.set(
    Math.sin(elapsed * 2.2 + blob.poseSeed) * 0.035 * scale,
    0.46 * scale + wanderHop * 0.025 * scale - idleSettle * 0.012 * scale + breezeMimicT * 0.06 * scale,
    -0.72 * scale + rollMimicT * 0.12 * scale,
  );
  blob.tail.rotation.y = tailWag + breezeMimicT * Math.sin(elapsed * 2.9 + blob.poseSeed) * 0.08;
  blob.tail.rotation.x = -0.12 + rollMimicT * 0.46 - breezeMimicT * 0.2;
  blob.tail.scale.set(
    0.52 * MathUtils.lerp(1 + tailWag * 0.2, 0.58, rollMimicT),
    0.5 * MathUtils.lerp(1 + wanderHop * 0.08, 0.48, rollMimicT),
    0.82 * MathUtils.lerp(1, 0.62, rollMimicT),
  );

  blob.feet.forEach((foot, footIndex) => {
    const homeX = typeof foot.userData.homeX === "number" ? foot.userData.homeX : (footIndex % 2 === 0 ? -0.3 : 0.3);
    const homeZ = typeof foot.userData.homeZ === "number" ? foot.userData.homeZ : (footIndex < 2 ? 0.38 : -0.38);
    const isFrontFoot = homeZ > 0;
    const gaitPhase = footIndex % 2 === 0 ? 0 : Math.PI;
    const footHop =
      blob.mode === "wander" ? Math.max(0, Math.sin(elapsed * 6.8 + blob.poseSeed + gaitPhase + (isFrontFoot ? 0 : 0.55))) * 0.052 * scale :
      blob.mode === "shy" ? Math.max(0, Math.sin(elapsed * 9.6 + blob.poseSeed + gaitPhase + (isFrontFoot ? 0.2 : 0.7))) * 0.036 * scale :
      idleHop * (isFrontFoot ? 0.022 : 0.014) * scale;
    const footTuck = Math.max(rollMimicT, breezeMimicT * 0.62);
    foot.visible = footTuck < 0.86;
    const footSide = MathUtils.lerp(homeX * scale, homeX * 0.28 * scale, footTuck);
    const footHeight = MathUtils.lerp(0.09 * scale + footHop - idleSettle * 0.015 * scale, 0.16 * scale, footTuck);
    const sniffOffset = idleSniff * (isFrontFoot ? 0.028 : -0.01) * scale;
    const footForward = MathUtils.lerp(homeZ * scale + sniffOffset, (homeZ * 0.24 + 0.04) * scale, footTuck);
    foot.position.set(
      footSide,
      footHeight,
      footForward,
    );
    const footSize = isFrontFoot ? 1 : 0.9;
    foot.scale.set(
      MathUtils.lerp(((isFrontFoot ? 1.1 : 0.94) - eyeSquish * 0.05) * footSize, 0.36, footTuck),
      MathUtils.lerp(0.46 - eyeSquish * 0.03 + footHop / Math.max(0.001, scale), 0.26, footTuck),
      MathUtils.lerp((isFrontFoot ? 0.84 : 0.76) * footSize, 0.32, footTuck),
    );
  });

  blob.fluffPuffs.forEach((puff, puffIndex) => {
    const sway = Math.sin(elapsed * 2.8 + blob.poseSeed + puffIndex * 0.8);
    const puffScale = 1 + sway * 0.035 + (blob.mode === "wander" ? wanderHop * 0.024 : 0) + rollMimicT * 0.035 + breezeMimicT * 0.045;
    const baseScale = puff.userData.baseScale as { x?: number; y?: number; z?: number } | undefined;
    const baseX = baseScale?.x ?? 0.26 * scale;
    const baseY = baseScale?.y ?? 0.26 * scale;
    const baseZ = baseScale?.z ?? 0.24 * scale;
    puff.scale.set(
      baseX * puffScale,
      baseY * (1 - sway * 0.018 + rollMimicT * 0.018 + breezeMimicT * 0.04),
      baseZ * (1 + rollMimicT * 0.025 + breezeMimicT * 0.02),
    );
  });
  });

  const nearestAfterRecruit = findNearestRecruitable(blobs, playerPosition);
  return {
    speciesName: AMBIENT_BLOB_SPECIES_NAME,
    recruitedCount: blobs.filter((blob) => blob.recruited).length,
    nearestRecruitableDistance: nearestAfterRecruit.distance,
    recruitedThisFrame,
    firstEncounterActive,
    rollingCount: blobs.filter((blob) => blob.recruited && blob.rolling).length,
    mossuCollisionCount,
    dominantMood: dominantMood(blobs),
    regroupActive: blobs.some((blob) => blob.recruited && elapsed < blob.regroupUntil),
    callHeardActive: blobs.some((blob) => blob.recruited && elapsed < blob.callRespondUntil),
  };
}
