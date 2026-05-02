import type { SaveState } from "../../simulation/gameState";
import {
  applyStoredSaveState,
  buildStoredSaveStatePayload,
  clearStoredSaveState,
  getSaveSignature,
  readStoredSaveState,
  writeStoredSaveState,
} from "./localSave";

export type LocalSaveRuntime = {
  lastPersistedSaveSignature: string;
};

export function createLocalSaveRuntime(): LocalSaveRuntime {
  return {
    lastPersistedSaveSignature: "",
  };
}

export function restoreLocalSaveState(save: SaveState, runtime: LocalSaveRuntime) {
  try {
    const payload = readStoredSaveState();
    if (!payload) {
      return false;
    }

    applyStoredSaveState(save, payload);
    runtime.lastPersistedSaveSignature = getSaveSignature(save);
    return true;
  } catch (error) {
    console.warn("Mossu save restore failed", error);
    return false;
  }
}

export function persistLocalSaveState(save: SaveState, runtime: LocalSaveRuntime) {
  const signature = getSaveSignature(save);
  if (signature === runtime.lastPersistedSaveSignature) {
    return false;
  }

  const payload = buildStoredSaveStatePayload(save);

  try {
    writeStoredSaveState(payload);
    runtime.lastPersistedSaveSignature = signature;
    return true;
  } catch (error) {
    console.warn("Mossu save persist failed", error);
    return false;
  }
}

export function clearLocalSaveState(save: SaveState, runtime: LocalSaveRuntime) {
  try {
    clearStoredSaveState();
    runtime.lastPersistedSaveSignature = getSaveSignature(save);
    return true;
  } catch (error) {
    console.warn("Mossu save clear failed", error);
    return false;
  }
}
