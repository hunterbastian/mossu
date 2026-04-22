import { MathUtils, Vector2, Vector3 } from "three";
import { InputSnapshot } from "./input";
import {
  AbilityId,
  collectibleOrbs,
  CollectibleOrb,
  isInsideIslandPlayableBounds,
  sampleBiomeZone,
  sampleIslandVoidThreshold,
  sampleObjectiveText,
  sampleTerrainHeight,
  sampleTerrainNormal,
  startingPosition,
  worldLandmarks,
} from "./world";

export interface PlayerState {
  position: Vector3;
  velocity: Vector3;
  heading: number;
  rolling: boolean;
  rollingBoostActive: boolean;
  grounded: boolean;
  fallingToVoid: boolean;
  voidFallTime: number;
  justLanded: boolean;
  justRespawned: boolean;
  landingImpact: number;
}

export interface SaveState {
  collectedOrbIds: Set<string>;
  unlockedAbilities: Set<AbilityId>;
}

export interface FrameState {
  player: PlayerState;
  save: SaveState;
  currentZone: ReturnType<typeof sampleBiomeZone>;
  currentLandmark: string;
  objective: ReturnType<typeof sampleObjectiveText>;
}

const PLAYER_RADIUS = 2.2;
const WALK_SPEED = 18.5;
const ROLL_SPEED = 27.5;
const ROLL_BOOST_DELAY = 3;
const ROLL_BOOST_MULTIPLIER = 1.2;
const AIR_SPEED = 17;
const GROUND_ACCELERATION = 84;
const GROUND_DECELERATION = 110;
const GROUND_TURN_ACCELERATION = 118;
const AIR_ACCELERATION = 28;
const AIR_DECELERATION = 10;
const JUMP_VELOCITY = 24.5;
const GRAVITY = 38;
const FLOAT_GRAVITY_SCALE = 0.28;
const FLOAT_FORWARD_BONUS = 6;
const ORB_PICKUP_RADIUS = 4.4;
const VOID_FALL_DURATION = 10;
const VOID_HORIZONTAL_DRAG = 0.985;

export class GameState {
  readonly frame: FrameState;

  private readonly moveVector = new Vector3();
  private readonly worldMove = new Vector3();
  private readonly desiredPlanarVelocity = new Vector3();
  private readonly planarVelocity = new Vector3();
  private readonly cameraForward = new Vector3();
  private readonly cameraRight = new Vector3();
  private readonly groundNormal = new Vector3();
  private readonly orbitalScratch = new Vector2();
  private readonly remainingOrbs = new Map<string, CollectibleOrb>();
  private rollingChargeSeconds = 0;

  constructor() {
    collectibleOrbs.forEach((orb) => this.remainingOrbs.set(orb.id, orb));
    this.frame = {
      player: {
        position: startingPosition.clone(),
        velocity: new Vector3(),
        heading: 0,
        rolling: false,
        rollingBoostActive: false,
        grounded: true,
        fallingToVoid: false,
        voidFallTime: 0,
        justLanded: false,
        justRespawned: false,
        landingImpact: 0,
      },
      save: {
        collectedOrbIds: new Set<string>(),
        unlockedAbilities: new Set<AbilityId>(),
      },
      currentZone: sampleBiomeZone(startingPosition.x, startingPosition.z, sampleTerrainHeight(startingPosition.x, startingPosition.z)),
      currentLandmark: worldLandmarks[0]?.title ?? "Mossu",
      objective: sampleObjectiveText(0, false),
    };
  }

  update(dt: number, input: InputSnapshot, cameraYaw: number) {
    const player = this.frame.player;
    const wasGrounded = player.grounded;
    const downwardSpeedBeforeResolve = Math.max(0, -player.velocity.y);
    player.justLanded = false;
    player.justRespawned = false;
    player.landingImpact = 0;
    this.moveVector.set(input.moveX, 0, input.moveY);
    this.groundNormal.copy(sampleTerrainNormal(player.position.x, player.position.z));

    if (player.fallingToVoid) {
      player.rolling = false;
      player.rollingBoostActive = false;
      player.grounded = false;
      player.voidFallTime += dt;
      player.velocity.x *= Math.pow(VOID_HORIZONTAL_DRAG, dt * 60);
      player.velocity.z *= Math.pow(VOID_HORIZONTAL_DRAG, dt * 60);
      player.velocity.y -= GRAVITY * 0.9 * dt;
      player.position.addScaledVector(player.velocity, dt);

      if (player.voidFallTime >= VOID_FALL_DURATION) {
        this.respawnAtStart();
      }

      this.updateProgress();
      return;
    }

    if (this.moveVector.lengthSq() > 0.0001) {
      this.moveVector.normalize();
      this.cameraForward.set(Math.sin(cameraYaw), 0, Math.cos(cameraYaw)).normalize();
      this.cameraRight.set(this.cameraForward.z, 0, -this.cameraForward.x).normalize();
      this.worldMove
        .copy(this.cameraRight)
        .multiplyScalar(this.moveVector.x)
        .addScaledVector(this.cameraForward, this.moveVector.z)
        .normalize();

      if (player.grounded) {
        this.worldMove.projectOnPlane(this.groundNormal).normalize();
      }
    } else {
      this.worldMove.setScalar(0);
    }

    if (input.shiftPressed) {
      player.rolling = !player.rolling;
    }
    const sustainedRolling = player.rolling && player.grounded && this.worldMove.lengthSq() > 0.001;
    if (sustainedRolling) {
      this.rollingChargeSeconds += dt;
    } else {
      this.rollingChargeSeconds = 0;
    }
    player.rollingBoostActive = this.rollingChargeSeconds >= ROLL_BOOST_DELAY;
    const groundSpeed = player.rolling
      ? ROLL_SPEED * (player.rollingBoostActive ? ROLL_BOOST_MULTIPLIER : 1)
      : WALK_SPEED;

    this.planarVelocity.set(player.velocity.x, 0, player.velocity.z);
    this.desiredPlanarVelocity
      .copy(this.worldMove)
      .multiplyScalar(player.grounded ? groundSpeed : AIR_SPEED);

    const hasMoveInput = this.worldMove.lengthSq() > 0.001;
    const alignment =
      hasMoveInput && this.planarVelocity.lengthSq() > 0.001
        ? this.planarVelocity.clone().normalize().dot(this.worldMove)
        : 1;

    const acceleration = player.grounded
      ? alignment < 0 ? GROUND_TURN_ACCELERATION : GROUND_ACCELERATION
      : AIR_ACCELERATION;
    const deceleration = player.grounded ? GROUND_DECELERATION : AIR_DECELERATION;

    this.planarVelocity.x = this.moveTowards(
      this.planarVelocity.x,
      hasMoveInput ? this.desiredPlanarVelocity.x : 0,
      (hasMoveInput ? acceleration : deceleration) * dt,
    );
    this.planarVelocity.z = this.moveTowards(
      this.planarVelocity.z,
      hasMoveInput ? this.desiredPlanarVelocity.z : 0,
      (hasMoveInput ? acceleration : deceleration) * dt,
    );

    if (player.grounded && this.planarVelocity.lengthSq() > 0.0001) {
      this.planarVelocity.projectOnPlane(this.groundNormal).setLength(
        Math.min(this.planarVelocity.length(), groundSpeed),
      );
    } else if (this.planarVelocity.lengthSq() > 0.0001) {
      this.planarVelocity.setLength(Math.min(this.planarVelocity.length(), AIR_SPEED + 2.5));
    }

    player.velocity.x = this.planarVelocity.x;
    player.velocity.z = this.planarVelocity.z;

    if (player.grounded && input.jumpPressed) {
      player.velocity.y = JUMP_VELOCITY;
      player.grounded = false;
    }

    const canFloat = this.frame.save.unlockedAbilities.has("breeze_float");
    const horizontalSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    const isFloating = canFloat && !player.grounded && input.jumpHeld && player.velocity.y < 5;

    player.velocity.y -= GRAVITY * (isFloating ? FLOAT_GRAVITY_SCALE : 1) * dt;

    if (isFloating && horizontalSpeed > 0.15) {
      const boost = FLOAT_FORWARD_BONUS * dt;
      player.velocity.x += (player.velocity.x / horizontalSpeed) * boost;
      player.velocity.z += (player.velocity.z / horizontalSpeed) * boost;
    }

    player.position.addScaledVector(player.velocity, dt);

    if (!isInsideIslandPlayableBounds(player.position.x, player.position.z)
      && player.position.y <= sampleIslandVoidThreshold(player.position.x, player.position.z)) {
      player.fallingToVoid = true;
      player.voidFallTime = 0;
      player.grounded = false;
      player.rolling = false;
      player.rollingBoostActive = false;
      this.rollingChargeSeconds = 0;
      this.updateProgress();
      return;
    }

    const terrainHeight = sampleTerrainHeight(player.position.x, player.position.z);
    const groundY = terrainHeight + PLAYER_RADIUS;
    if (player.position.y <= groundY) {
      player.position.y = groundY;
      player.velocity.y = 0;
      player.grounded = true;
      if (!wasGrounded) {
        player.justLanded = true;
        player.landingImpact = MathUtils.clamp(downwardSpeedBeforeResolve / 26, 0.2, 1.35);
      }
    } else {
      player.grounded = false;
    }

    if (horizontalSpeed > 0.3) {
      player.heading = Math.atan2(player.velocity.x, player.velocity.z);
    }

    this.collectNearbyOrbs();
    this.updateProgress();
  }

  getOrbCount() {
    return this.frame.save.collectedOrbIds.size;
  }

  getRemainingOrbs() {
    return this.remainingOrbs;
  }

  private collectNearbyOrbs() {
    for (const [id, orb] of this.remainingOrbs) {
      if (orb.position.distanceTo(this.frame.player.position) <= ORB_PICKUP_RADIUS) {
        this.remainingOrbs.delete(id);
        this.frame.save.collectedOrbIds.add(id);
      }
    }
  }

  private updateProgress() {
    const orbCount = this.getOrbCount();
    if (orbCount >= 8) {
      this.frame.save.unlockedAbilities.add("breeze_float");
    }

    const player = this.frame.player.position;
    const height = sampleTerrainHeight(player.x, player.z);
    this.frame.currentZone = sampleBiomeZone(player.x, player.z, height);
    this.frame.objective = sampleObjectiveText(orbCount, this.frame.save.unlockedAbilities.has("breeze_float"));

    let closestTitle = worldLandmarks[0]?.title ?? "Mossu";
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const landmark of worldLandmarks) {
      this.orbitalScratch.set(player.x - landmark.position.x, player.z - landmark.position.z);
      const distance = this.orbitalScratch.lengthSq();
      if (distance < closestDistance) {
        closestDistance = distance;
        closestTitle = landmark.title;
      }
    }
    this.frame.currentLandmark = closestTitle;
  }

  private respawnAtStart() {
    const player = this.frame.player;
    player.position.copy(startingPosition);
    player.velocity.set(0, 0, 0);
    player.heading = 0;
    player.rolling = false;
    player.rollingBoostActive = false;
    player.grounded = true;
    player.fallingToVoid = false;
    player.voidFallTime = 0;
    player.justRespawned = true;
    player.justLanded = false;
    player.landingImpact = 0;
    this.rollingChargeSeconds = 0;
  }

  private moveTowards(current: number, target: number, maxDelta: number) {
    if (Math.abs(target - current) <= maxDelta) {
      return target;
    }
    return current + Math.sign(target - current) * maxDelta;
  }
}
