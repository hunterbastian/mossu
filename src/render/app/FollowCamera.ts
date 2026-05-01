import CameraControls from "camera-controls";
import {
  BufferGeometry,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Spherical,
  Vector3,
} from "three";
import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { PlayerState } from "../../simulation/gameState";
import {
  sampleIslandBoundaryPoint,
  sampleBiomeZone,
  sampleHabitatLayer,
  sampleTerrainHeight,
  startingLookTarget,
  startingPosition,
  worldLandmarks,
} from "../../simulation/world";
import { ViewMode } from "../../simulation/viewMode";
import {
  cameraPositionYawToLookYaw,
  movementYawToTrailingCameraYaw,
  shouldAutoRecenterForMovement,
} from "./cameraYaw";
import { easeInOutSine, easeOutCubic } from "../motionCurves";

CameraControls.install({ THREE });
(BufferGeometry.prototype as BufferGeometry & { computeBoundsTree?: typeof computeBoundsTree }).computeBoundsTree =
  computeBoundsTree;
(BufferGeometry.prototype as BufferGeometry & { disposeBoundsTree?: typeof disposeBoundsTree }).disposeBoundsTree =
  disposeBoundsTree;
(Mesh.prototype as Mesh).raycast = acceleratedRaycast;
(Raycaster.prototype as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;

const GAMEPLAY_FOV = 50;
const MAP_FOV = 32;
const MIN_DISTANCE = 24;
const MAX_DISTANCE = 92;
const DEFAULT_DISTANCE = 50;
const MAP_MARGIN = 84;
const DEFAULT_FOCUS_HEIGHT = 5.8;
const START_DISTANCE = 56;
const START_FOCUS_HEIGHT = 5.1;
const START_CAMERA_LIFT = 13.6;
const START_SHOULDER = -2.8;
const OPENING_HANDOFF_START = 0.72;
const MIN_POLAR_ANGLE = 0.58;
const MAX_POLAR_ANGLE = 2.28;
const MANUAL_LOOK_COOLDOWN_SECONDS = 3.4;
const IDLE_ORBIT_YAW_SPEED = 0.16;
const IDLE_ORBIT_YAW_DAMPING = 2.4;
const IDLE_ORBIT_DISTANCE_BOOST = 3.8;
const IDLE_ORBIT_POLAR_OFFSET = -0.035;
const IDLE_ORBIT_BLEND_IN_DAMPING = 1.45;
const IDLE_ORBIT_BLEND_OUT_DAMPING = 6.8;
const MAP_ZOOM_MIN = 0.72;
const MAP_ZOOM_MAX = 1.2;
const MAP_ZOOM_WHEEL_SENSITIVITY = 0.00085;
const MAP_KEYBOARD_PAN_SPEED = 118;
const CINEMATIC_SHOULDER_DRIFT = 0.24;
const OPEN_FIELD_DISTANCE_BOOST = 9.5;
const OPEN_FIELD_FOV_BOOST = 3.4;
const OPEN_FIELD_FOCUS_LIFT = 1.1;
const OPEN_FIELD_LOOK_AHEAD_BOOST = 0.035;

type CameraProfileName = "walk" | "roll" | "air" | "swim" | "ridge" | "summit" | "void";

export interface DebugRouteCameraOptions {
  distance?: number;
  focusHeight?: number;
  lift?: number;
}

interface CameraProfile {
  name: CameraProfileName;
  distance: number;
  speedDistanceBoost: number;
  terrainDistanceBoost: number;
  focusHeight: number;
  terrainFocusLift: number;
  lookAheadBase: number;
  lookAheadSpeed: number;
  polar: number;
  terrainPolarLift: number;
  speedPolarLift: number;
  fov: number;
  shoulder: number;
  yawResponsiveness: number;
  focusDamping: number;
  distanceDamping: number;
  profileDamping: number;
  positionDamping: number;
  targetDamping: number;
}

const CAMERA_PROFILES: Record<CameraProfileName, CameraProfile> = {
  walk: {
    name: "walk",
    distance: 48,
    speedDistanceBoost: 1.15,
    terrainDistanceBoost: 4.8,
    focusHeight: 5.65,
    terrainFocusLift: 1.18,
    lookAheadBase: 0.11,
    lookAheadSpeed: 0.15,
    polar: 1.43,
    terrainPolarLift: 0.035,
    speedPolarLift: 0.008,
    fov: 50,
    shoulder: 0.14,
    yawResponsiveness: 0.42,
    focusDamping: 3.8,
    distanceDamping: 3.2,
    profileDamping: 2.7,
    positionDamping: 4.7,
    targetDamping: 3.9,
  },
  roll: {
    name: "roll",
    distance: 46,
    speedDistanceBoost: 6.4,
    terrainDistanceBoost: 1.2,
    focusHeight: 5.9,
    terrainFocusLift: 0.78,
    lookAheadBase: 0.18,
    lookAheadSpeed: 0.34,
    polar: 1.5,
    terrainPolarLift: 0.06,
    speedPolarLift: 0.025,
    fov: 54,
    shoulder: 0.16,
    yawResponsiveness: 0.6,
    focusDamping: 4.05,
    distanceDamping: 3.15,
    profileDamping: 3.0,
    positionDamping: 4.9,
    targetDamping: 3.95,
  },
  air: {
    name: "air",
    distance: 39,
    speedDistanceBoost: 1.1,
    terrainDistanceBoost: 1.7,
    focusHeight: 7.15,
    terrainFocusLift: 1.15,
    lookAheadBase: 0.13,
    lookAheadSpeed: 0.14,
    polar: 1.24,
    terrainPolarLift: 0.05,
    speedPolarLift: 0,
    fov: 52,
    shoulder: 0.18,
    yawResponsiveness: 0.34,
    focusDamping: 3.45,
    distanceDamping: 2.85,
    profileDamping: 2.45,
    positionDamping: 4.35,
    targetDamping: 3.5,
  },
  swim: {
    name: "swim",
    distance: 32,
    speedDistanceBoost: 0.62,
    terrainDistanceBoost: 0.75,
    focusHeight: 4.75,
    terrainFocusLift: 0.25,
    lookAheadBase: 0.052,
    lookAheadSpeed: 0.07,
    polar: 1.42,
    terrainPolarLift: 0,
    speedPolarLift: 0.02,
    fov: 50,
    shoulder: 0.1,
    yawResponsiveness: 0.48,
    focusDamping: 3.7,
    distanceDamping: 3.05,
    profileDamping: 2.95,
    positionDamping: 4.5,
    targetDamping: 3.65,
  },
  ridge: {
    name: "ridge",
    distance: 56,
    speedDistanceBoost: 0.9,
    terrainDistanceBoost: 4.8,
    focusHeight: 8.5,
    terrainFocusLift: 1.65,
    lookAheadBase: 0.095,
    lookAheadSpeed: 0.11,
    polar: 1.46,
    terrainPolarLift: 0.06,
    speedPolarLift: 0.01,
    fov: 51,
    shoulder: 0.35,
    yawResponsiveness: 0.36,
    focusDamping: 3.25,
    distanceDamping: 2.7,
    profileDamping: 2.35,
    positionDamping: 3.85,
    targetDamping: 3.05,
  },
  summit: {
    name: "summit",
    distance: 60,
    speedDistanceBoost: 0.65,
    terrainDistanceBoost: 4.2,
    focusHeight: 9.8,
    terrainFocusLift: 1.4,
    lookAheadBase: 0.085,
    lookAheadSpeed: 0.1,
    polar: 1.48,
    terrainPolarLift: 0.06,
    speedPolarLift: 0,
    fov: 51,
    shoulder: 0.28,
    yawResponsiveness: 0.3,
    focusDamping: 2.9,
    distanceDamping: 2.35,
    profileDamping: 2.15,
    positionDamping: 3.45,
    targetDamping: 2.75,
  },
  void: {
    name: "void",
    distance: 34,
    speedDistanceBoost: 0,
    terrainDistanceBoost: 0,
    focusHeight: 4.4,
    terrainFocusLift: 0,
    lookAheadBase: 0.035,
    lookAheadSpeed: 0,
    polar: 1.18,
    terrainPolarLift: 0,
    speedPolarLift: 0,
    fov: 50,
    shoulder: 0,
    yawResponsiveness: 0,
    focusDamping: 7,
    distanceDamping: 7,
    profileDamping: 6,
    positionDamping: 12,
    targetDamping: 10,
  },
};

const START_DIRECTION = new Vector3().subVectors(startingLookTarget, startingPosition).setY(0).normalize();
if (START_DIRECTION.lengthSq() < 0.0001) {
  START_DIRECTION.set(0, 0, 1);
}
const START_RIGHT = new Vector3(START_DIRECTION.z, 0, -START_DIRECTION.x).normalize();

const MAP_BOUNDS = (() => {
  const points = [
    startingPosition,
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

const MAP_CENTER_X = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) * 0.5;
const MAP_CENTER_Z = (MAP_BOUNDS.minZ + MAP_BOUNDS.maxZ) * 0.5;
const MAP_SPAN_X = Math.max(MAP_BOUNDS.maxX - MAP_BOUNDS.minX, 420);
const MAP_SPAN_Z = Math.max(MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ, 420);

type GeometryWithBvh = BufferGeometry & {
  boundsTree?: unknown;
  computeBoundsTree?: typeof computeBoundsTree;
};

type CameraControlsInternals = CameraControls & {
  _needsUpdate: boolean;
  _sphericalEnd: Spherical;
  _targetEnd: Vector3;
};

export class FollowCamera {
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3();

  private readonly controls: CameraControls;
  private pointerLocked = false;
  private viewMode: ViewMode = "third_person";
  private mapBlend = 0;
  /** Scales the computed map camera height: below 1 zooms in, above 1 zooms out. */
  private mapZoomFactor = 1;
  private mapUnitsPerPixel = 1;
  private viewportHeight = 1;
  private openingSequenceProgress: number | null = null;
  private initialized = false;
  private manualLookCooldown = 0;
  private idleOrbitRequested = false;
  private idleOrbitBlend = 0;
  private idleOrbitYaw = 0;
  private controlActivityPending = false;
  private distanceBias = 0;
  private lastProfileName: CameraProfileName = "walk";
  private polarFeedbackKick = 0;
  private distanceFeedbackKick = 0;
  private shoulderFeedbackKick = 0;
  private landingSettle = 0;
  private rollSettle = 0;
  private cinematicTime = 0;
  private previousRolling = false;
  private activeProfileName: CameraProfileName = "walk";
  private autoRecenterEligible = false;
  private currentDistance = DEFAULT_DISTANCE;
  private currentFocusHeight = DEFAULT_FOCUS_HEIGHT;
  private currentLookAhead = 0.08;
  private currentPolar = CAMERA_PROFILES.walk.polar;
  private currentFov = GAMEPLAY_FOV;
  private appliedFov = GAMEPLAY_FOV;
  private currentShoulder = 0;
  private openFieldBlend = 0;

  private readonly focus = new Vector3();
  private readonly desiredFocus = new Vector3();
  private readonly playerVelocity = new Vector3();
  private readonly shoulderRight = new Vector3();
  private readonly gameplayPosition = new Vector3();
  private readonly gameplayTarget = new Vector3();
  private readonly mapPosition = new Vector3();
  private readonly mapTarget = new Vector3();
  private readonly mapPanOffset = new Vector3();
  private readonly finalPosition = new Vector3();
  private readonly finalTarget = new Vector3();
  private readonly currentPosition = new Vector3();
  private readonly currentTarget = new Vector3();
  private readonly currentUp = new Vector3(0, 1, 0);
  private readonly planarLook = new Vector3();
  private readonly gameplayUp = new Vector3(0, 1, 0);
  private readonly mapUp = new Vector3(0, 0, -1);
  private readonly focusOffset = new Vector3();
  private readonly routeVistaOffset = new Vector3();
  private readonly respawnCameraPosition = new Vector3();
  private readonly openingSequencePosition = new Vector3();
  private readonly openingSequenceTarget = new Vector3();
  private readonly startFocus = startingPosition.clone().add(new Vector3(0, START_FOCUS_HEIGHT, 0));
  private readonly startCameraPosition = this.startFocus
    .clone()
    .addScaledVector(START_DIRECTION, -START_DISTANCE)
    .addScaledVector(START_RIGHT, START_SHOULDER)
    .add(new Vector3(0, START_CAMERA_LIFT, 0));

  private readonly handlePointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.domElement;
    this.domElement.classList.toggle("is-pointer-locked", this.pointerLocked);
    if (!this.pointerLocked) {
      this.controls.mouseButtons.left = CameraControls.ACTION.NONE;
    }
  };

  private readonly handleControl = () => {
    if (this.viewMode === "third_person") {
      this.controlActivityPending = true;
      this.idleOrbitRequested = false;
      this.manualLookCooldown = MANUAL_LOOK_COOLDOWN_SECONDS;
    }
  };

  constructor(private readonly domElement: HTMLElement) {
    this.camera = new PerspectiveCamera(GAMEPLAY_FOV, 1, 0.1, 3800);
    this.controls = new CameraControls(this.camera, this.domElement);
    this.configureControls();
    this.resetGameplayRig(this.startFocus, this.startCameraPosition);
    this.attachInput();
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.viewportHeight = Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setCollisionMeshes(meshes: Mesh[]) {
    const uniqueMeshes = Array.from(new Set(meshes));
    uniqueMeshes.forEach((mesh) => {
      const geometry = mesh.geometry as GeometryWithBvh;
      if (!geometry.boundsTree && geometry.computeBoundsTree) {
        geometry.computeBoundsTree();
      }
    });
    this.controls.colliderMeshes = uniqueMeshes;
  }

  update(player: PlayerState, dt: number) {
    this.cinematicTime += dt;
    const terrainLift = MathUtils.clamp((player.position.z + 160) / 360, 0, 1);
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    const speedBoost = MathUtils.clamp(speed / 24, 0, 1);
    const profile = this.selectCameraProfile(player, terrainLift);
    const playerGround = sampleTerrainHeight(player.position.x, player.position.z);
    const habitat = sampleHabitatLayer(player.position.x, player.position.z, playerGround);
    const biome = sampleBiomeZone(player.position.x, player.position.z, playerGround);
    const meadowBiomeBoost =
      biome === "plains" ? 0.28 :
      biome === "hills" ? 0.24 :
      biome === "foothills" ? 0.18 :
      biome === "alpine" ? 0.1 :
      0;
    const openFieldTarget =
      player.swimming || player.fallingToVoid
        ? 0
        : MathUtils.clamp(
            habitat.meadow * 0.54 +
            habitat.clearing * 0.5 +
            meadowBiomeBoost -
            habitat.forest * 0.48 -
            habitat.shore * 0.24,
            0,
            1,
          );
    this.openFieldBlend = MathUtils.damp(this.openFieldBlend, openFieldTarget, 1.85, dt);
    this.activeProfileName = profile.name;
    if (profile.name !== this.lastProfileName) {
      this.distanceBias = 0;
      this.lastProfileName = profile.name;
    }
    this.manualLookCooldown = Math.max(0, this.manualLookCooldown - dt);
    const idleOrbitAllowed =
      this.idleOrbitRequested &&
      this.viewMode === "third_person" &&
      this.openingSequenceProgress === null &&
      !player.fallingToVoid;
    this.idleOrbitBlend = MathUtils.damp(
      this.idleOrbitBlend,
      idleOrbitAllowed ? 1 : 0,
      idleOrbitAllowed ? IDLE_ORBIT_BLEND_IN_DAMPING : IDLE_ORBIT_BLEND_OUT_DAMPING,
      dt,
    );
    if (idleOrbitAllowed) {
      this.idleOrbitYaw += IDLE_ORBIT_YAW_SPEED * dt;
    }
    this.polarFeedbackKick = MathUtils.damp(this.polarFeedbackKick, 0, 11, dt);
    this.distanceFeedbackKick = MathUtils.damp(this.distanceFeedbackKick, 0, 5.8, dt);
    this.shoulderFeedbackKick = MathUtils.damp(this.shoulderFeedbackKick, 0, 6.6, dt);
    this.landingSettle = MathUtils.damp(this.landingSettle, 0, 5.8, dt);
    this.rollSettle = MathUtils.damp(this.rollSettle, 0, 4.2, dt);
    if (player.justLanded) {
      this.landingSettle = Math.max(
        this.landingSettle,
        MathUtils.clamp(0.18 + player.landingImpact * 0.18, 0.18, 0.42),
      );
    }
    if (player.rolling && !this.previousRolling) {
      this.rollSettle = Math.max(this.rollSettle, 0.34);
    }

    const openFieldProfileScale =
      profile.name === "walk" ? 1 :
      profile.name === "roll" ? 0.82 :
      profile.name === "ridge" || profile.name === "summit" ? 0.58 :
      profile.name === "air" ? 0.36 :
      0;
    const openFieldDistanceBoost = this.openFieldBlend * OPEN_FIELD_DISTANCE_BOOST * openFieldProfileScale;
    const focusHeightTarget =
      profile.focusHeight +
      terrainLift * profile.terrainFocusLift +
      this.openFieldBlend * OPEN_FIELD_FOCUS_LIFT * openFieldProfileScale;
    const lookAheadTarget =
      profile.lookAheadBase +
      speedBoost * profile.lookAheadSpeed +
      this.openFieldBlend * OPEN_FIELD_LOOK_AHEAD_BOOST * openFieldProfileScale;
    const shoulderDrift =
      Math.sin(this.cinematicTime * 0.34 + terrainLift * 0.8) *
      CINEMATIC_SHOULDER_DRIFT *
      (1 - speedBoost * 0.52) *
      (profile.name === "void" ? 0 : 1);
    const shoulderTarget =
      profile.shoulder * MathUtils.lerp(0.45, 1, speedBoost) +
      shoulderDrift +
      this.shoulderFeedbackKick +
      this.rollSettle * 0.28;
    this.currentFocusHeight = MathUtils.damp(this.currentFocusHeight, focusHeightTarget, profile.profileDamping, dt);
    this.currentLookAhead = MathUtils.damp(this.currentLookAhead, lookAheadTarget, profile.profileDamping, dt);
    this.currentShoulder = MathUtils.damp(this.currentShoulder, shoulderTarget, profile.profileDamping, dt);
    this.currentFov = MathUtils.damp(
      this.currentFov,
      profile.fov + this.openFieldBlend * OPEN_FIELD_FOV_BOOST * openFieldProfileScale,
      profile.profileDamping,
      dt,
    );

    this.playerVelocity.set(player.velocity.x, 0, player.velocity.z);
    const cameraLookYaw = cameraPositionYawToLookYaw(this.controls.azimuthAngle);
    this.shoulderRight.set(Math.cos(cameraLookYaw), 0, -Math.sin(cameraLookYaw));
    const routeVistaBias = profile.name === "walk" || profile.name === "ridge" || profile.name === "summit"
      ? MathUtils.lerp(1.4, 3.2, terrainLift) * (1 - speedBoost * 0.32)
      : 0;
    this.desiredFocus
      .copy(player.position)
      .addScalar(0)
      .add(this.focusOffset.set(0, this.currentFocusHeight, 0))
      .addScaledVector(this.playerVelocity, this.currentLookAhead)
      .add(this.routeVistaOffset.set(0, 0, routeVistaBias))
      .addScaledVector(this.shoulderRight, this.currentShoulder);
    this.focus.lerp(this.desiredFocus, 1 - Math.exp(-dt * profile.focusDamping));

    if (player.justRespawned) {
      this.distanceBias = 0;
      this.respawnCameraPosition
        .copy(this.focus)
        .addScaledVector(START_DIRECTION, -DEFAULT_DISTANCE)
        .add(this.focusOffset.set(0, 7.2, 0));
      this.resetGameplayRig(this.focus, this.respawnCameraPosition);
      this.manualLookCooldown = 0;
    }

    if (this.viewMode === "third_person") {
      const controls = this.controls as CameraControlsInternals;
      const targetDistance =
        profile.distance
        + terrainLift * profile.terrainDistanceBoost
        + openFieldDistanceBoost
        + speedBoost * profile.speedDistanceBoost
        + this.distanceBias
        + this.distanceFeedbackKick
        + this.rollSettle * 3.8
        + this.landingSettle * 1.35
        + IDLE_ORBIT_DISTANCE_BOOST * this.idleOrbitBlend;
      const easedOrbitBlend = easeInOutSine(this.idleOrbitBlend);
      this.currentDistance = MathUtils.damp(
        this.currentDistance,
        targetDistance - IDLE_ORBIT_DISTANCE_BOOST * this.idleOrbitBlend + IDLE_ORBIT_DISTANCE_BOOST * easedOrbitBlend,
        profile.distanceDamping,
        dt,
      );
      controls._targetEnd.copy(this.focus);
      controls._sphericalEnd.radius = MathUtils.clamp(
        this.currentDistance,
        MIN_DISTANCE,
        MAX_DISTANCE,
      );

      if (this.manualLookCooldown <= 0 && !player.fallingToVoid) {
        const targetPolar =
          profile.polar
          + terrainLift * profile.terrainPolarLift
          + speedBoost * profile.speedPolarLift
          + this.polarFeedbackKick
          - this.landingSettle * 0.055
          + this.rollSettle * 0.018
          + IDLE_ORBIT_POLAR_OFFSET * easeInOutSine(this.idleOrbitBlend);
        this.currentPolar = MathUtils.damp(this.currentPolar, targetPolar, profile.profileDamping, dt);
        controls._sphericalEnd.phi = MathUtils.clamp(
          this.currentPolar,
          this.controls.minPolarAngle,
          this.controls.maxPolarAngle,
        );
      } else {
        this.currentPolar = controls._sphericalEnd.phi;
      }

      this.autoRecenterEligible = shouldAutoRecenterForMovement(
        cameraPositionYawToLookYaw(controls._sphericalEnd.theta),
        player.velocity.x,
        player.velocity.z,
      );

      if (this.manualLookCooldown <= 0 && !player.fallingToVoid) {
        if (this.idleOrbitBlend > 0.02) {
          const currentYaw = controls._sphericalEnd.theta;
          const delta = Math.atan2(Math.sin(this.idleOrbitYaw - currentYaw), Math.cos(this.idleOrbitYaw - currentYaw));
          controls._sphericalEnd.theta =
            currentYaw + delta * (1 - Math.exp(-dt * IDLE_ORBIT_YAW_DAMPING * this.idleOrbitBlend));
          this.autoRecenterEligible = false;
        } else if (player.grounded && this.autoRecenterEligible && profile.yawResponsiveness > 0) {
          const desiredYaw = Math.atan2(player.velocity.x, player.velocity.z);
          const desiredCameraYaw = movementYawToTrailingCameraYaw(desiredYaw);
          const currentYaw = controls._sphericalEnd.theta;
          const delta = Math.atan2(Math.sin(desiredCameraYaw - currentYaw), Math.cos(desiredCameraYaw - currentYaw));
          const tightFollow =
            profile.name === "walk" && this.currentDistance <= MIN_DISTANCE + 1.35 && !player.swimming;
          const yawGain = tightFollow ? 1.28 : 1;
          controls._sphericalEnd.theta =
            currentYaw + delta * (1 - Math.exp(-dt * profile.yawResponsiveness * yawGain));
        }
      }

      controls._needsUpdate = true;
    }

    this.controls.update(dt);
    this.controls.getPosition(this.gameplayPosition, false);
    this.controls.getTarget(this.gameplayTarget, false);

    if (this.openingSequenceProgress !== null && this.viewMode === "third_person") {
      const introT = MathUtils.clamp(this.openingSequenceProgress, 0, 1);
      const vistaT = easeOutCubic(MathUtils.smoothstep(introT, 0, 1));
      const handoffT = easeInOutSine(MathUtils.smoothstep(introT, OPENING_HANDOFF_START, 1));
      this.openingSequenceTarget
        .copy(startingPosition)
        .addScaledVector(START_DIRECTION, MathUtils.lerp(10, 72, vistaT))
        .addScaledVector(START_RIGHT, MathUtils.lerp(-5.5, 10.5, vistaT))
        .add(this.focusOffset.set(0, MathUtils.lerp(4.8, 10.8, vistaT), 0));
      this.openingSequencePosition
        .copy(startingPosition)
        .addScaledVector(START_DIRECTION, MathUtils.lerp(-30, -58, vistaT))
        .addScaledVector(START_RIGHT, MathUtils.lerp(-16, 18, vistaT))
        .add(this.focusOffset.set(0, MathUtils.lerp(12, 25, vistaT), 0));
      this.gameplayPosition.lerpVectors(this.openingSequencePosition, this.gameplayPosition, handoffT);
      this.gameplayTarget.lerpVectors(this.openingSequenceTarget, this.gameplayTarget, handoffT);
    }

    const targetBlend = this.viewMode === "map_lookdown" ? 1 : 0;
    this.mapBlend = MathUtils.damp(this.mapBlend, targetBlend, 10, dt);
    const easedBlend = easeInOutSine(this.mapBlend);

    if (targetBlend > 0 || easedBlend > 0.001) {
      const halfVerticalFov = MathUtils.degToRad(MAP_FOV * 0.5);
      const verticalTan = Math.tan(halfVerticalFov);
      const halfHorizontalFov = Math.atan(verticalTan * this.camera.aspect);
      const baseMapHeight =
        Math.max(
          (MAP_SPAN_Z * 0.5) / verticalTan,
          (MAP_SPAN_X * 0.5) / Math.tan(halfHorizontalFov),
        ) *
          0.76 +
        56;
      const mapHeight = baseMapHeight * this.mapZoomFactor;
      this.mapUnitsPerPixel = (verticalTan * mapHeight * 2) / this.viewportHeight;
      this.clampMapPanOffset();

      const mapCenterX = MAP_CENTER_X + this.mapPanOffset.x;
      const mapCenterZ = MAP_CENTER_Z + this.mapPanOffset.z;
      this.mapTarget.set(mapCenterX, 10, mapCenterZ);
      this.mapPosition.set(mapCenterX, mapHeight, mapCenterZ);
      this.finalPosition.lerpVectors(this.gameplayPosition, this.mapPosition, easedBlend);
      this.finalTarget.lerpVectors(this.gameplayTarget, this.mapTarget, easedBlend);
    } else {
      this.finalPosition.copy(this.gameplayPosition);
      this.finalTarget.copy(this.gameplayTarget);
    }

    if (!this.initialized || player.justRespawned) {
      this.currentPosition.copy(this.finalPosition);
      this.currentTarget.copy(this.finalTarget);
      this.initialized = true;
    } else {
      this.currentPosition.lerp(this.finalPosition, 1 - Math.exp(-dt * profile.positionDamping));
      this.currentTarget.lerp(this.finalTarget, 1 - Math.exp(-dt * profile.targetDamping));
    }

    this.target.copy(this.currentTarget);
    const nextFov = MathUtils.lerp(this.currentFov, MAP_FOV, easedBlend);
    if (Math.abs(nextFov - this.appliedFov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
      this.appliedFov = nextFov;
    }
    this.camera.position.copy(this.currentPosition);
    this.currentUp.lerpVectors(this.gameplayUp, this.mapUp, easedBlend).normalize();
    this.camera.up.copy(this.currentUp);
    this.camera.lookAt(this.currentTarget);
    this.previousRolling = player.rolling;
  }

  getYaw() {
    if (!this.initialized) {
      return Math.atan2(START_DIRECTION.x, START_DIRECTION.z);
    }

    this.planarLook.subVectors(this.gameplayTarget, this.gameplayPosition).setY(0);
    if (this.planarLook.lengthSq() < 0.0001) {
      return Math.atan2(START_DIRECTION.x, START_DIRECTION.z);
    }

    this.planarLook.normalize();
    return Math.atan2(this.planarLook.x, this.planarLook.z);
  }

  debugSnapToPlayerHeading(player: PlayerState, heading = player.heading, options: DebugRouteCameraOptions = {}) {
    const routeDirection = new Vector3(Math.sin(heading), 0, Math.cos(heading));
    if (routeDirection.lengthSq() < 0.0001) {
      routeDirection.copy(START_DIRECTION);
    } else {
      routeDirection.normalize();
    }
    const distance = MathUtils.clamp(options.distance ?? DEFAULT_DISTANCE, 12, 72);
    const focusHeight = MathUtils.clamp(options.focusHeight ?? CAMERA_PROFILES.walk.focusHeight, 2, 18);
    const lift = MathUtils.clamp(options.lift ?? 7.2, 2, 30);
    const focus = player.position
      .clone()
      .add(this.focusOffset.set(0, focusHeight, 0));
    const cameraPosition = focus
      .clone()
      .addScaledVector(routeDirection, -distance)
      .add(this.focusOffset.set(0, lift, 0));
    this.resetGameplayRig(focus, cameraPosition);
    this.manualLookCooldown = 0;
  }

  getViewMode() {
    return this.viewMode;
  }

  getDebugState() {
    const profile = CAMERA_PROFILES[this.activeProfileName];
    return {
      style: "journey-scenic",
      profile: this.activeProfileName,
      mapZoom: Number(this.mapZoomFactor.toFixed(3)),
      mapPan: {
        x: Number(this.mapPanOffset.x.toFixed(2)),
        z: Number(this.mapPanOffset.z.toFixed(2)),
      },
      pointerLocked: this.pointerLocked,
      idleOrbitActive: this.idleOrbitRequested,
      idleOrbitBlend: Number(this.idleOrbitBlend.toFixed(3)),
      distance: Number(this.currentDistance.toFixed(2)),
      polar: Number(this.currentPolar.toFixed(3)),
      fov: Number(this.currentFov.toFixed(1)),
      focusHeight: Number(this.currentFocusHeight.toFixed(2)),
      lookAhead: Number(this.currentLookAhead.toFixed(3)),
      shoulder: Number(this.currentShoulder.toFixed(2)),
      openFieldBlend: Number(this.openFieldBlend.toFixed(3)),
      manualLookCooldown: Number(this.manualLookCooldown.toFixed(2)),
      recenterCooldown: Number(this.manualLookCooldown.toFixed(2)),
      autoRecenterEligible: this.autoRecenterEligible,
      yawResponsiveness: Number(profile.yawResponsiveness.toFixed(2)),
      openingSequenceProgress:
        this.openingSequenceProgress === null ? null : Number(this.openingSequenceProgress.toFixed(3)),
      minPolar: MIN_POLAR_ANGLE,
      maxPolar: MAX_POLAR_ANGLE,
      upLookLimitDegrees: Number(MathUtils.radToDeg(MAX_POLAR_ANGLE).toFixed(1)),
    };
  }

  setViewMode(viewMode: ViewMode) {
    this.viewMode = viewMode;
    if (viewMode === "map_lookdown") {
      this.setIdleOrbitActive(false);
      this.releasePointerLock();
    }
  }

  setIdleOrbitActive(active: boolean) {
    if (active === this.idleOrbitRequested) {
      return;
    }

    this.idleOrbitRequested = active;
    if (active) {
      const controls = this.controls as CameraControlsInternals;
      this.idleOrbitYaw = controls._sphericalEnd.theta;
    } else {
      this.idleOrbitBlend = 0;
    }
  }

  consumeControlActivity() {
    const active = this.controlActivityPending;
    this.controlActivityPending = false;
    return active;
  }

  adjustMapZoomFromWheel(deltaY: number) {
    const next = MathUtils.clamp(
      this.mapZoomFactor - deltaY * MAP_ZOOM_WHEEL_SENSITIVITY,
      MAP_ZOOM_MIN,
      MAP_ZOOM_MAX,
    );
    this.mapZoomFactor = next;
    this.clampMapPanOffset();
  }

  getMapZoomFactor() {
    return this.mapZoomFactor;
  }

  /** Brief polar nudge for landing / interact / zone feedback (decays automatically). */
  kickPolar(radians: number) {
    this.polarFeedbackKick += radians;
  }

  /** Small cinematic nudges for reveals without taking control away from the player. */
  kickCinematic(options: { polar?: number; distance?: number; shoulder?: number }) {
    this.polarFeedbackKick += options.polar ?? 0;
    this.distanceFeedbackKick += options.distance ?? 0;
    this.shoulderFeedbackKick += options.shoulder ?? 0;
  }

  setOpeningSequenceProgress(progress: number | null) {
    this.openingSequenceProgress = progress === null ? null : MathUtils.clamp(progress, 0, 1);
  }

  /** Resets world-view zoom to default (after wheel zoom in map mode). */
  recenterMapView() {
    this.mapZoomFactor = 1;
    this.mapPanOffset.set(0, 0, 0);
  }

  panMapViewFromInput(moveX: number, moveY: number, dt: number) {
    if (this.viewMode !== "map_lookdown" || (moveX === 0 && moveY === 0)) {
      return;
    }
    const zoomT = (this.mapZoomFactor - MAP_ZOOM_MIN) / (MAP_ZOOM_MAX - MAP_ZOOM_MIN);
    const zoomBoost = MathUtils.lerp(0.72, 1.28, MathUtils.clamp(zoomT, 0, 1));
    this.mapPanOffset.x += moveX * MAP_KEYBOARD_PAN_SPEED * zoomBoost * dt;
    this.mapPanOffset.z -= moveY * MAP_KEYBOARD_PAN_SPEED * zoomBoost * dt;
    this.clampMapPanOffset();
  }

  panMapViewFromDrag(deltaX: number, deltaY: number) {
    if (this.viewMode !== "map_lookdown") {
      return;
    }
    this.mapPanOffset.x -= deltaX * this.mapUnitsPerPixel;
    this.mapPanOffset.z -= deltaY * this.mapUnitsPerPixel;
    this.clampMapPanOffset();
  }

  focusMapOnWorldPoint(x: number, z: number) {
    const baseMapCenterX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) * 0.5;
    const baseMapCenterZ = (MAP_BOUNDS.minZ + MAP_BOUNDS.maxZ) * 0.5;
    this.mapPanOffset.set(x - baseMapCenterX, 0, z - baseMapCenterZ);
    this.mapZoomFactor = Math.min(this.mapZoomFactor, 0.88);
    this.clampMapPanOffset();
  }

  private clampMapPanOffset() {
    const baseMapCenterX = (MAP_BOUNDS.minX + MAP_BOUNDS.maxX) * 0.5;
    const baseMapCenterZ = (MAP_BOUNDS.minZ + MAP_BOUNDS.maxZ) * 0.5;
    const horizontalSpan = (MAP_BOUNDS.maxX - MAP_BOUNDS.minX) * 0.34 * MathUtils.clamp(1.08 - this.mapZoomFactor, 0.06, 0.36);
    const verticalSpan = (MAP_BOUNDS.maxZ - MAP_BOUNDS.minZ) * 0.34 * MathUtils.clamp(1.08 - this.mapZoomFactor, 0.06, 0.36);
    const targetX = MathUtils.clamp(baseMapCenterX + this.mapPanOffset.x, baseMapCenterX - horizontalSpan, baseMapCenterX + horizontalSpan);
    const targetZ = MathUtils.clamp(baseMapCenterZ + this.mapPanOffset.z, baseMapCenterZ - verticalSpan, baseMapCenterZ + verticalSpan);
    this.mapPanOffset.set(targetX - baseMapCenterX, 0, targetZ - baseMapCenterZ);
  }

  isPointerLocked() {
    return this.pointerLocked;
  }

  releasePointerLock() {
    if (document.pointerLockElement === this.domElement) {
      this.controls.unlockPointer();
    }
  }

  dispose() {
    this.domElement.onclick = null;
    this.domElement.onwheel = null;
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.controls.removeEventListener("controlstart", this.handleControl);
    this.controls.removeEventListener("control", this.handleControl);
    this.controls.removeEventListener("controlend", this.handleControl);
    this.controls.dispose();
  }

  private configureControls() {
    this.controls.mouseButtons.left = CameraControls.ACTION.NONE;
    this.controls.mouseButtons.middle = CameraControls.ACTION.NONE;
    this.controls.mouseButtons.right = CameraControls.ACTION.NONE;
    this.controls.mouseButtons.wheel = CameraControls.ACTION.NONE;
    this.controls.touches.one = CameraControls.ACTION.NONE;
    this.controls.touches.two = CameraControls.ACTION.NONE;
    this.controls.touches.three = CameraControls.ACTION.NONE;
    this.controls.smoothTime = 0.58;
    this.controls.draggingSmoothTime = 0.18;
    this.controls.restThreshold = 0.003;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.minPolarAngle = MIN_POLAR_ANGLE;
    this.controls.maxPolarAngle = MAX_POLAR_ANGLE;
    this.controls.infinityDolly = false;
    this.controls.colliderMeshes = [];
    this.controls.addEventListener("controlstart", this.handleControl);
    this.controls.addEventListener("control", this.handleControl);
    this.controls.addEventListener("controlend", this.handleControl);
  }

  private resetGameplayRig(focus: Vector3, cameraPosition: Vector3) {
    this.controls.setLookAt(
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
      focus.x,
      focus.y,
      focus.z,
      false,
    );
    this.currentDistance = cameraPosition.distanceTo(focus);
    this.currentPolar = MathUtils.clamp(this.controls.polarAngle, MIN_POLAR_ANGLE, MAX_POLAR_ANGLE);
    this.currentFov = GAMEPLAY_FOV;
    this.currentFocusHeight = START_FOCUS_HEIGHT;
    this.currentLookAhead = CAMERA_PROFILES.walk.lookAheadBase;
    this.currentShoulder = CAMERA_PROFILES.walk.shoulder;
    this.controls.minPolarAngle = MIN_POLAR_ANGLE;
    this.controls.maxPolarAngle = MAX_POLAR_ANGLE;
    this.controls.minDistance = MIN_DISTANCE;
    this.controls.maxDistance = MAX_DISTANCE;
    this.controls.getPosition(this.gameplayPosition, false);
    this.controls.getTarget(this.gameplayTarget, false);
    this.currentPosition.copy(this.gameplayPosition);
    this.currentTarget.copy(this.gameplayTarget);
    this.target.copy(this.gameplayTarget);
    this.initialized = true;
  }

  private attachInput() {
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);

    this.domElement.onclick = () => {
      if (this.pointerLocked || this.viewMode !== "third_person") {
        return;
      }

      this.controlActivityPending = true;
      this.setIdleOrbitActive(false);
      this.controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
      const originalRequestPointerLock = this.domElement.requestPointerLock;
      this.domElement.requestPointerLock = ((...args: Parameters<HTMLElement["requestPointerLock"]>) => {
        try {
          const result = originalRequestPointerLock.apply(this.domElement, args);
          if (result && typeof (result as Promise<void>).catch === "function") {
            void (result as Promise<void>).catch(() => {
              this.pointerLocked = false;
            });
          }
          return result;
        } catch {
          this.pointerLocked = false;
          return Promise.resolve() as ReturnType<HTMLElement["requestPointerLock"]>;
        }
      }) as HTMLElement["requestPointerLock"];
      try {
        this.controls.lockPointer();
      } catch {
        this.pointerLocked = false;
      } finally {
        this.domElement.requestPointerLock = originalRequestPointerLock;
      }
    };

    this.domElement.onwheel = (event) => {
      if (!this.pointerLocked || this.viewMode !== "third_person") {
        return;
      }

      event.preventDefault();
      this.controlActivityPending = true;
      this.idleOrbitRequested = false;
      this.manualLookCooldown = 1.2;
      this.distanceBias = MathUtils.clamp(this.distanceBias + event.deltaY * 0.012, -6.5, 8);
    };
  }

  private selectCameraProfile(player: PlayerState, terrainLift: number): CameraProfile {
    if (player.fallingToVoid) {
      return CAMERA_PROFILES.void;
    }
    if (player.swimming) {
      return CAMERA_PROFILES.swim;
    }
    if (!player.grounded) {
      return CAMERA_PROFILES.air;
    }
    if (player.position.z > 198 || player.position.y > 144) {
      return CAMERA_PROFILES.summit;
    }
    if (player.rolling) {
      return CAMERA_PROFILES.roll;
    }
    if (terrainLift > 0.74 || player.position.z > 112) {
      return CAMERA_PROFILES.ridge;
    }
    return CAMERA_PROFILES.walk;
  }
}
