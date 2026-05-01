import type { SaveState } from "../../simulation/gameState";
import type { AbilityId } from "../../simulation/world";

export const LOCAL_SAVE_VERSION = 1;
export const LOCAL_SAVE_STORAGE_KEY = "mossu.save.v1";

export type StoredSaveStatePayload = {
  version: typeof LOCAL_SAVE_VERSION;
  save: {
    unlockedAbilities: string[];
    catalogedLandmarkIds: string[];
    gatheredForageableIds: string[];
  };
};

export function shouldUsePersistentSave(params: URLSearchParams) {
  return (
    !params.has("qaDebug") &&
    !params.has("e2e") &&
    !params.has("perfDebug") &&
    !params.has("perfHud") &&
    !params.has("coopStress")
  );
}

export function readStoredSaveState(): StoredSaveStatePayload | null {
  const raw = window.localStorage.getItem(LOCAL_SAVE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  const payload = JSON.parse(raw) as Partial<StoredSaveStatePayload>;
  if (payload.version !== LOCAL_SAVE_VERSION || !payload.save) {
    return null;
  }
  return payload as StoredSaveStatePayload;
}

export function applyStoredSaveState(save: SaveState, payload: StoredSaveStatePayload) {
  save.unlockedAbilities = new Set(payload.save.unlockedAbilities as AbilityId[]);
  save.catalogedLandmarkIds = new Set(payload.save.catalogedLandmarkIds ?? []);
  save.gatheredForageableIds = new Set(payload.save.gatheredForageableIds ?? []);
}

export function buildStoredSaveStatePayload(save: SaveState): StoredSaveStatePayload {
  return {
    version: LOCAL_SAVE_VERSION,
    save: {
      unlockedAbilities: [...save.unlockedAbilities].sort(),
      catalogedLandmarkIds: [...save.catalogedLandmarkIds].sort(),
      gatheredForageableIds: [...save.gatheredForageableIds].sort(),
    },
  };
}

export function writeStoredSaveState(payload: StoredSaveStatePayload) {
  window.localStorage.setItem(LOCAL_SAVE_STORAGE_KEY, JSON.stringify(payload));
}

export function getSaveSignature(save: SaveState) {
  return [
    [...save.unlockedAbilities].sort().join(","),
    [...save.catalogedLandmarkIds].sort().join(","),
    [...save.gatheredForageableIds].sort().join(","),
  ].join("|");
}
