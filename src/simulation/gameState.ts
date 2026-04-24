import { Vector3 } from "three";
import { InputSnapshot } from "./input";
import {
  AbilityId,
  BiomeZone,
  ForageableKind,
  sampleBiomeZone,
  sampleObjectiveText,
  sampleTerrainHeight,
  sampleWaterState,
  startingPosition,
  worldLandmarks,
} from "./world";
import { updateForageableProgress } from "./forageableProgress";
import { updateLandmarkProgress } from "./landmarkProgress";
import { createMovementScratch, applyMovementPhysics, tickMovementTimers } from "./movementPhysics";
import { createPlayerSimulationRuntime } from "./playerSimulationRuntime";
import { beginVoidFall, respawnPlayerAtStart, shouldStartVoidFall, updateVoidFall } from "./respawnSystem";
import { tickStaminaCooldown, updateStaminaAndAbilityState } from "./staminaAbilities";
import { buildCharacterScreenData, type CharacterScreenView } from "./characterScreenData";
import {
  applySwimForces,
  applyWaterState,
  clampSwimVelocity,
  resolveWaterContact,
  shouldSwim,
} from "./waterTraversal";
import { STAMINA_MAX } from "./playerSimulationConstants";

export interface PlayerState {
  position: Vector3;
  velocity: Vector3;
  heading: number;
  stamina: number;
  staminaMax: number;
  staminaVisible: boolean;
  rolling: boolean;
  rollingBoostActive: boolean;
  grounded: boolean;
  swimming: boolean;
  waterDepth: number;
  waterSurfaceY: number;
  fallingToVoid: boolean;
  voidFallTime: number;
  justLanded: boolean;
  justRespawned: boolean;
  landingImpact: number;
}

export interface SaveState {
  unlockedAbilities: Set<AbilityId>;
  catalogedLandmarkIds: Set<string>;
  gatheredForageableIds: Set<string>;
}

export interface InteractionTargetState {
  landmarkId: string;
  landmarkTitle: string;
  keepsakeTitle: string;
  keepsakeSummary: string;
  distance: number;
  alreadyCataloged: boolean;
}

export interface InventoryEntryState {
  landmarkId: string;
  landmarkTitle: string;
  keepsakeTitle: string;
  keepsakeSummary: string;
  zone: BiomeZone;
  discovered: boolean;
}

export interface ForageableEntryState {
  forageableId: string;
  title: string;
  summary: string;
  kind: ForageableKind;
  zone: BiomeZone;
  gathered: boolean;
}

export interface ForageableTargetState {
  forageableId: string;
  title: string;
  kind: ForageableKind;
  distance: number;
}

export interface FrameState {
  player: PlayerState;
  save: SaveState;
  currentZone: ReturnType<typeof sampleBiomeZone>;
  currentLandmark: string;
  objective: ReturnType<typeof sampleObjectiveText>;
  interactionTarget: InteractionTargetState | null;
  forageableTarget: ForageableTargetState | null;
  lastCatalogedLandmarkId: string | null;
  lastGatheredForageableId: string | null;
}

export class GameState {
  readonly frame: FrameState;
  private readonly movementScratch = createMovementScratch();
  private readonly simulationRuntime = createPlayerSimulationRuntime();

  constructor() {
    this.frame = {
      player: {
        position: startingPosition.clone(),
        velocity: new Vector3(),
        heading: 0,
        stamina: STAMINA_MAX,
        staminaMax: STAMINA_MAX,
        staminaVisible: false,
        rolling: false,
        rollingBoostActive: false,
        grounded: true,
        swimming: false,
        waterDepth: 0,
        waterSurfaceY: 0,
        fallingToVoid: false,
        voidFallTime: 0,
        justLanded: false,
        justRespawned: false,
        landingImpact: 0,
      },
      save: {
        unlockedAbilities: new Set<AbilityId>(["breeze_float"]),
        catalogedLandmarkIds: new Set<string>(),
        gatheredForageableIds: new Set<string>(),
      },
      currentZone: sampleBiomeZone(startingPosition.x, startingPosition.z, sampleTerrainHeight(startingPosition.x, startingPosition.z)),
      currentLandmark: worldLandmarks[0]?.title ?? "Mossu",
      objective: sampleObjectiveText(),
      interactionTarget: null,
      forageableTarget: null,
      lastCatalogedLandmarkId: null,
      lastGatheredForageableId: null,
    };
    this.updateProgress();
  }

  update(dt: number, input: InputSnapshot, cameraYaw: number) {
    const player = this.frame.player;
    const runtime = this.simulationRuntime;
    const wasGrounded = player.grounded;
    const downwardSpeedBeforeResolve = Math.max(0, -player.velocity.y);
    player.justLanded = false;
    player.justRespawned = false;
    player.landingImpact = 0;
    this.frame.lastCatalogedLandmarkId = null;
    tickStaminaCooldown(runtime, dt);
    tickMovementTimers(player, input, dt, runtime);

    const waterStateAtStart = sampleWaterState(player.position.x, player.position.z);
    applyWaterState(player, waterStateAtStart);
    player.swimming = shouldSwim(player, waterStateAtStart);

    if (player.fallingToVoid) {
      if (updateVoidFall(player, dt)) {
        respawnPlayerAtStart(player, runtime);
      }

      this.updateProgress(false);
      return;
    }

    const { sustainedRolling, isFloating, horizontalSpeed } = applyMovementPhysics(
      player,
      this.frame.save,
      input,
      cameraYaw,
      dt,
      runtime,
      this.movementScratch,
    );

    if (player.swimming && waterStateAtStart) {
      applySwimForces(player, waterStateAtStart, dt);
      clampSwimVelocity(player, input.jumpHeld, dt);
    }

    player.position.addScaledVector(player.velocity, dt);

    if (shouldStartVoidFall(player)) {
      beginVoidFall(player, runtime);
      this.updateProgress(false);
      return;
    }

    const terrainHeight = sampleTerrainHeight(player.position.x, player.position.z);
    const waterStateAfterMove = sampleWaterState(player.position.x, player.position.z);
    resolveWaterContact(player, terrainHeight, waterStateAfterMove, wasGrounded, downwardSpeedBeforeResolve, runtime);

    updateStaminaAndAbilityState(player, dt, runtime, sustainedRolling, isFloating);

    if (horizontalSpeed > 0.3) {
      player.heading = Math.atan2(player.velocity.x, player.velocity.z);
    }

    this.updateProgress(input.interactPressed);
  }

  getCharacterScreenData(): CharacterScreenView {
    return buildCharacterScreenData(this.frame.save, this.frame);
  }

  private updateProgress(gatherPressed = false) {
    const player = this.frame.player.position;
    const height = sampleTerrainHeight(player.x, player.z);
    this.frame.currentZone = sampleBiomeZone(player.x, player.z, height);
    this.frame.objective = sampleObjectiveText();
    const landmarkProgress = updateLandmarkProgress(player, this.frame.save.catalogedLandmarkIds);
    const forageableProgress = updateForageableProgress(player, this.frame.save.gatheredForageableIds, gatherPressed);
    this.frame.currentLandmark = landmarkProgress.currentLandmark;
    this.frame.interactionTarget = landmarkProgress.interactionTarget;
    this.frame.forageableTarget = forageableProgress.forageableTarget;
    this.frame.lastCatalogedLandmarkId = landmarkProgress.lastCatalogedLandmarkId;
    this.frame.lastGatheredForageableId = forageableProgress.lastGatheredForageableId;
  }
}
