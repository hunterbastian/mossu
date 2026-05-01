import type { CharacterScreenView } from "../../simulation/characterScreenData";
import type { CoopStressSnapshot } from "../../simulation/coopStress";
import type { FrameState } from "../../simulation/gameState";
import type { ViewMode } from "../../simulation/viewMode";
import type { AmbientBlobUpdateStats } from "../world/ambientBlobs";
import type { WorldQaStats } from "../world/WorldRenderer";
import type { AmbientWaterAudioState } from "./AmbientWaterAudio";
import type { FollowCamera } from "./FollowCamera";
import { LOCAL_SAVE_STORAGE_KEY, LOCAL_SAVE_VERSION } from "./localSave";
import type { MovementAudioState } from "./MovementAudio";
import type { MossuPerformanceSnapshot } from "./appPerformance";

type CameraDebugState = ReturnType<FollowCamera["getDebugState"]>;

type OpeningSequenceTextState = {
  active: boolean;
  progress: number;
};

type SharedTextStateInput = {
  frame: FrameState;
  viewMode: ViewMode;
  titleScreenOpen: boolean;
  openingSequence: OpeningSequenceTextState;
  pauseMenuOpen: boolean;
  characterScreenOpen: boolean;
  coopStressSnapshot: CoopStressSnapshot | null;
  camera: CameraDebugState;
};

type FullTextStateInput = SharedTextStateInput & {
  characterData: CharacterScreenView;
  focusedCollectionId: string | null;
  faunaStats: AmbientBlobUpdateStats;
  savePersistenceEnabled: boolean;
  movementAudio: MovementAudioState;
  waterAudio: AmbientWaterAudioState;
  performance: MossuPerformanceSnapshot;
  waterDepthDebugEnabled: boolean;
  underwaterIntensity: number;
  qa: WorldQaStats;
};

function fixed(value: number, digits: number) {
  return Number(value.toFixed(digits));
}

function buildCompactCoopStress(snapshot: CoopStressSnapshot | null) {
  return snapshot
    ? {
      enabled: true,
      remoteCount: snapshot.remoteCount,
      recentEvents: snapshot.shared.recentEvents.length,
    }
    : { enabled: false, remoteCount: 0, recentEvents: 0 };
}

function buildFullCoopStress(snapshot: CoopStressSnapshot | null) {
  return snapshot
    ? {
      enabled: true,
      remoteCount: snapshot.remoteCount,
      remotePlayers: snapshot.remotePlayers.map((remote) => ({
        id: remote.id,
        label: remote.label,
        activity: remote.activity,
        x: fixed(remote.player.position.x, 1),
        y: fixed(remote.player.position.y, 1),
        z: fixed(remote.player.position.z, 1),
        rolling: remote.player.rolling,
        swimming: remote.player.swimming,
      })),
      shared: snapshot.shared,
    }
    : { enabled: false, remoteCount: 0 };
}

export function serializeE2eGameTextState({
  frame,
  viewMode,
  titleScreenOpen,
  openingSequence,
  pauseMenuOpen,
  characterScreenOpen,
  coopStressSnapshot,
  camera,
}: SharedTextStateInput) {
  return JSON.stringify({
    e2e: true,
    titleScreenOpen,
    viewMode,
    openingSequence,
    pauseMenuOpen,
    characterScreenOpen,
    coopStress: buildCompactCoopStress(coopStressSnapshot),
    player: {
      x: fixed(frame.player.position.x, 1),
      y: fixed(frame.player.position.y, 1),
      z: fixed(frame.player.position.z, 1),
      heading: fixed(frame.player.heading, 3),
      swimming: frame.player.swimming,
      waterMode: frame.player.waterMode,
    },
    save: {
      catalogedLandmarkIds: [...frame.save.catalogedLandmarkIds],
      gatheredForageableIds: [...frame.save.gatheredForageableIds],
      unlockedAbilities: [...frame.save.unlockedAbilities],
    },
    camera,
    zone: frame.currentZone,
    landmark: frame.currentLandmark,
  });
}

export function serializeGameTextState({
  frame,
  viewMode,
  titleScreenOpen,
  openingSequence,
  pauseMenuOpen,
  characterScreenOpen,
  characterData,
  focusedCollectionId,
  faunaStats,
  savePersistenceEnabled,
  coopStressSnapshot,
  movementAudio,
  waterAudio,
  camera,
  performance,
  waterDepthDebugEnabled,
  underwaterIntensity,
  qa,
}: FullTextStateInput) {
  const focusedCollection = characterData.collections.find(
    (entry) => entry.landmarkId === (characterData.latestCollectionId ?? focusedCollectionId),
  );
  const latestGatheredGood = characterData.gatheredGoods.find(
    (entry) => entry.forageableId === characterData.latestGatheredGoodId,
  );
  const pouchCounts = characterData.gatheredGoods.reduce<Record<string, number>>((counts, entry) => {
    if (entry.gathered) {
      counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
    }
    return counts;
  }, {});

  return JSON.stringify({
    coordinateSystem: "x right, y up, z forward across the island",
    mode: viewMode,
    titleScreenOpen,
    openingSequence,
    pauseMenuOpen,
    characterScreenOpen,
    player: {
      x: fixed(frame.player.position.x, 1),
      y: fixed(frame.player.position.y, 1),
      z: fixed(frame.player.position.z, 1),
      stamina: fixed(frame.player.stamina, 1),
      staminaMax: fixed(frame.player.staminaMax, 1),
      rolling: frame.player.rolling,
      rollHoldSeconds: fixed(frame.player.rollHoldSeconds, 2),
      rollModeReady: frame.player.rollModeReady,
      floating: frame.player.floating,
      grounded: frame.player.grounded,
      swimming: frame.player.swimming,
      waterMode: frame.player.waterMode,
      waterDepth: fixed(frame.player.waterDepth, 1),
      heading: fixed(frame.player.heading, 3),
      velocity: {
        x: fixed(frame.player.velocity.x, 2),
        y: fixed(frame.player.velocity.y, 2),
        z: fixed(frame.player.velocity.z, 2),
      },
    },
    zone: frame.currentZone,
    landmark: frame.currentLandmark,
    save: {
      unlockedAbilities: [...frame.save.unlockedAbilities],
      catalogedLandmarkIds: [...frame.save.catalogedLandmarkIds],
      gatheredForageableIds: [...frame.save.gatheredForageableIds],
      persistent: {
        enabled: savePersistenceEnabled,
        key: savePersistenceEnabled ? LOCAL_SAVE_STORAGE_KEY : null,
        version: LOCAL_SAVE_VERSION,
      },
    },
    coopStress: buildFullCoopStress(coopStressSnapshot),
    characterScreen: {
      stats: characterData.stats.map((stat) => ({ label: stat.label, value: stat.value })),
      upgrades: {
        unlocked: characterData.upgrades.unlocked.map((upgrade) => upgrade.label),
        locked: characterData.upgrades.locked.map((upgrade) => upgrade.label),
      },
      collections: {
        discovered: characterData.totals.discovered,
        total: characterData.totals.total,
        focusedEntry: focusedCollection?.keepsakeTitle ?? null,
      },
      gatheredGoods: {
        gathered: characterData.gatheredTotals.gathered,
        total: characterData.gatheredTotals.total,
        latestEntry: latestGatheredGood?.title ?? null,
        pouchCounts,
        nearby: frame.forageableTarget
          ? {
            title: frame.forageableTarget.title,
            kind: frame.forageableTarget.kind,
            distance: fixed(frame.forageableTarget.distance, 1),
          }
          : null,
      },
    },
    fauna: {
      name: faunaStats.speciesName,
      recruited: faunaStats.recruitedCount,
      nearestRecruitableDistance:
        faunaStats.nearestRecruitableDistance === null
          ? null
          : fixed(faunaStats.nearestRecruitableDistance, 1),
      recruitedThisFrame: faunaStats.recruitedThisFrame,
      firstEncounterActive: faunaStats.firstEncounterActive,
      rollingCount: faunaStats.rollingCount,
      mossuCollisionCount: faunaStats.mossuCollisionCount,
      dominantMood: faunaStats.dominantMood,
      regroupActive: faunaStats.regroupActive,
      callHeardActive: faunaStats.callHeardActive,
    },
    audio: {
      ...movementAudio,
      waterAmbience: waterAudio,
    },
    camera,
    performance,
    waterDebug: {
      depthView: waterDepthDebugEnabled,
      underwaterIntensity: fixed(underwaterIntensity, 3),
    },
    qa,
  });
}
