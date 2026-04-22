import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import { PlayerState } from "../../simulation/gameState";
import {
  collectibleOrbs,
  sampleIslandBoundaryPoint,
  sampleTerrainHeight,
  startingPosition,
  worldLandmarks,
} from "../../simulation/world";
import { ViewMode } from "../../simulation/viewMode";

const GAMEPLAY_FOV = 50;
const MAP_FOV = 24;
const MIN_DISTANCE = 20;
const MAX_DISTANCE = 37.4;
const MAP_MARGIN = 84;
const SPAWN_DISTANCE = 27.8;
const SPAWN_YAW = Math.atan2(-4 - startingPosition.x, -38 - startingPosition.z);
const SPAWN_PITCH = 0.46;

const MAP_BOUNDS = (() => {
  const points = [
    startingPosition,
    ...collectibleOrbs.map((orb) => orb.position),
    ...worldLandmarks.map((landmark) => landmark.position),
    ...Array.from({ length: 48 }, (_, index) => sampleIslandBoundaryPoint((index / 48) * Math.PI * 2)),
  ];
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  });

  return {
    minX: minX - MAP_MARGIN,
    maxX: maxX + MAP_MARGIN,
    minZ: minZ - MAP_MARGIN,
    maxZ: maxZ + MAP_MARGIN,
  };
})();

const START_OVERLOOK = new Vector3(-4, 18, -38);

export class FollowCamera {
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3();

  private yaw = SPAWN_YAW;
  private pitch = SPAWN_PITCH;
  private targetYaw = this.yaw;
  private targetPitch = this.pitch;
  private distance = SPAWN_DISTANCE;
  private targetDistance = this.distance;
  private pointerLocked = false;
  private viewMode: ViewMode = "third_person";
  private mapBlend = 0;
  private initialized = false;

  private readonly focus = new Vector3();
  private readonly desiredFocus = new Vector3();
  private readonly desiredPosition = new Vector3();
  private readonly gameplayPosition = new Vector3();
  private readonly mapPosition = new Vector3();
  private readonly mapTarget = new Vector3();
  private readonly currentTarget = new Vector3();
  private readonly finalPosition = new Vector3();
  private readonly finalTarget = new Vector3();
  private readonly currentPosition = new Vector3();
  private readonly collisionResolvedPosition = new Vector3();
  private readonly collisionSample = new Vector3();
  private readonly planarLook = new Vector3();
  private readonly offset = new Vector3();
  private readonly playerVelocity = new Vector3();
  private manualLookCooldown = 0;

  private readonly handlePointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.domElement;
    this.domElement.classList.toggle("is-pointer-locked", this.pointerLocked);
  };

  constructor(private readonly domElement: HTMLElement) {
    this.camera = new PerspectiveCamera(GAMEPLAY_FOV, 1, 0.1, 1200);
    this.attachInput();
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(player: PlayerState, dt: number) {
    const terrainLift = MathUtils.clamp((player.position.z + 160) / 360, 0, 1);
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const speedBoost = MathUtils.clamp(speed / 24, 0, 1);
    const focusHeight = player.fallingToVoid ? 3.8 : MathUtils.lerp(4.8, 7.4, terrainLift);
    const lookAhead = MathUtils.lerp(1.6, 4.2, speedBoost);
    this.manualLookCooldown = Math.max(0, this.manualLookCooldown - dt);

    if (player.justRespawned) {
      this.yaw = SPAWN_YAW;
      this.targetYaw = SPAWN_YAW;
      this.pitch = SPAWN_PITCH;
      this.targetPitch = SPAWN_PITCH;
      this.distance = SPAWN_DISTANCE;
      this.targetDistance = SPAWN_DISTANCE;
      this.manualLookCooldown = 0;
    }

    this.playerVelocity.set(player.velocity.x, 0, player.velocity.z);
    if (!player.fallingToVoid && speed > 1.5 && (this.manualLookCooldown <= 0 || !this.pointerLocked)) {
      const headingYaw = Math.atan2(this.playerVelocity.x, this.playerVelocity.z);
      this.targetYaw = this.angleLerp(this.targetYaw, headingYaw, 1 - Math.exp(-dt * 2.2));
    }

    const cinematicDistance = MathUtils.clamp(this.distance + terrainLift * 2.2 + speedBoost * 1.8, MIN_DISTANCE, MAX_DISTANCE + 2);
    const cameraLift = player.fallingToVoid ? 5.2 : MathUtils.lerp(10.6, 13.4, terrainLift) + speedBoost * 0.8;
    const targetPitchBase = player.fallingToVoid ? 0.54 : MathUtils.lerp(0.46, 0.42, terrainLift) - speedBoost * 0.02;
    if (this.manualLookCooldown <= 0 && this.viewMode === "third_person") {
      this.targetPitch = MathUtils.clamp(
        MathUtils.damp(this.targetPitch, targetPitchBase, 4.2, dt),
        0.28,
        0.84,
      );
    }

    this.desiredFocus
      .copy(player.position)
      .add(new Vector3(0, focusHeight, 0))
      .addScaledVector(this.playerVelocity, lookAhead * 0.08);

    const introBlend = MathUtils.clamp(1 - Math.max(0, player.position.z + 116) / 144, 0, 1);
    if (!player.fallingToVoid) {
      this.desiredFocus.lerp(START_OVERLOOK, introBlend * 0.08);
    }

    this.focus.lerp(this.desiredFocus, 1 - Math.exp(-dt * 8));

    this.pitch = MathUtils.damp(this.pitch, this.targetPitch, 11, dt);
    this.distance = MathUtils.damp(this.distance, this.targetDistance, 9, dt);
    this.yaw = this.angleLerp(this.yaw, this.targetYaw, 1 - Math.exp(-dt * 12));

    this.offset
      .set(0, cameraLift, -cinematicDistance)
      .applyAxisAngle(new Vector3(1, 0, 0), -this.pitch)
      .applyAxisAngle(new Vector3(0, 1, 0), this.yaw);

    this.desiredPosition.copy(this.focus).add(this.offset);
    if (player.fallingToVoid) {
      this.gameplayPosition.copy(this.desiredPosition);
    } else {
      this.resolveTerrainCollision(this.focus, this.desiredPosition);
      this.gameplayPosition.copy(this.collisionResolvedPosition);
    }

    const mapCenterX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) * 0.5;
    const mapCenterZ = (MAP_BOUNDS.minZ + MAP_BOUNDS.maxZ) * 0.5;
    const mapSpanX = Math.max(MAP_BOUNDS.maxX - MAP_BOUNDS.minX, 420);
    const mapSpanZ = Math.max(MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ, 420);
    const halfVerticalFov = MathUtils.degToRad(MAP_FOV * 0.5);
    const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * this.camera.aspect);
    const mapHeight = Math.max(
      (mapSpanZ * 0.5) / Math.tan(halfVerticalFov),
      (mapSpanX * 0.5) / Math.tan(halfHorizontalFov),
    ) + 88;

    this.mapTarget.set(mapCenterX, 8, mapCenterZ);
    this.mapPosition.set(mapCenterX, mapHeight, mapCenterZ);

    const targetBlend = this.viewMode === "map_lookdown" ? 1 : 0;
    this.mapBlend = MathUtils.damp(this.mapBlend, targetBlend, 10, dt);
    const easedBlend = this.mapBlend * this.mapBlend * (3 - 2 * this.mapBlend);

    this.finalPosition.lerpVectors(this.gameplayPosition, this.mapPosition, easedBlend);
    this.finalTarget.lerpVectors(this.focus, this.mapTarget, easedBlend);

    if (!this.initialized || player.justRespawned) {
      this.currentPosition.copy(this.finalPosition);
      this.currentTarget.copy(this.finalTarget);
      this.initialized = true;
    } else {
      this.currentPosition.lerp(this.finalPosition, 1 - Math.exp(-dt * 10));
      this.currentTarget.lerp(this.finalTarget, 1 - Math.exp(-dt * 8));
    }

    this.target.copy(this.currentTarget);
    this.camera.fov = MathUtils.lerp(GAMEPLAY_FOV, MAP_FOV, easedBlend);
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentTarget);
  }

  getYaw() {
    if (!this.initialized) {
      return this.yaw;
    }

    this.planarLook.subVectors(this.currentTarget, this.currentPosition).setY(0);
    if (this.planarLook.lengthSq() < 0.0001) {
      return this.yaw;
    }

    this.planarLook.normalize();
    return Math.atan2(this.planarLook.x, this.planarLook.z);
  }

  getViewMode() {
    return this.viewMode;
  }

  setViewMode(viewMode: ViewMode) {
    this.viewMode = viewMode;
    if (viewMode === "map_lookdown") {
      this.releasePointerLock();
    }
  }

  isPointerLocked() {
    return this.pointerLocked;
  }

  releasePointerLock() {
    if (document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }

  dispose() {
    this.domElement.onclick = null;
    this.domElement.onpointermove = null;
    this.domElement.onwheel = null;
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
  }

  private attachInput() {
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);

    this.domElement.onclick = async () => {
      if (this.pointerLocked || this.viewMode !== "third_person") {
        return;
      }

      try {
        await this.domElement.requestPointerLock();
      } catch (error) {
        console.warn("Pointer lock request failed", error);
      }
    };

    this.domElement.onpointermove = (event) => {
      if (!this.pointerLocked || this.viewMode !== "third_person") {
        return;
      }

      this.manualLookCooldown = 2.4;
      this.targetYaw -= event.movementX * 0.0028;
      this.targetPitch = MathUtils.clamp(this.targetPitch + event.movementY * 0.0019, 0.28, 0.84);
    };

    this.domElement.onwheel = (event) => {
      if (!this.pointerLocked || this.viewMode !== "third_person") {
        return;
      }
      this.manualLookCooldown = 1.2;
      this.targetDistance = MathUtils.clamp(this.targetDistance + event.deltaY * 0.01, MIN_DISTANCE, MAX_DISTANCE);
    };
  }

  private angleLerp(current: number, target: number, alpha: number) {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + delta * alpha;
  }

  private resolveTerrainCollision(focus: Vector3, desiredPosition: Vector3) {
    const sampleSteps = 7;
    const groundClearance = 1.2;
    let safeT = 1;

    for (let i = 1; i <= sampleSteps; i += 1) {
      const t = i / sampleSteps;
      this.collisionSample.lerpVectors(focus, desiredPosition, t);
      const terrainY = sampleTerrainHeight(this.collisionSample.x, this.collisionSample.z) + groundClearance;
      if (this.collisionSample.y < terrainY) {
        safeT = Math.max(0.18, (i - 1) / sampleSteps);
        break;
      }
    }

    this.collisionResolvedPosition.lerpVectors(focus, desiredPosition, safeT);
    const minCameraY =
      sampleTerrainHeight(this.collisionResolvedPosition.x, this.collisionResolvedPosition.z) + groundClearance;
    if (this.collisionResolvedPosition.y < minCameraY) {
      this.collisionResolvedPosition.y = minCameraY;
    }
  }
}
