import { GameState, createDefaultSaveState } from "../../src/simulation/gameState";
import { startingPosition } from "../../src/simulation/world";
import { assert, assertApprox, assertDeepEqual } from "./testHarness";

export function runSaveContracts() {
  const fresh = createDefaultSaveState();
  assert(fresh.unlockedAbilities.has("breeze_float"), "fresh save keeps Breeze Float unlocked");
  assert(fresh.catalogedLandmarkIds.size === 0, "fresh save starts with no stamped landmarks");
  assert(fresh.gatheredForageableIds.size === 0, "fresh save starts with no gathered goods");
  assert(fresh.recruitedKaruIds.size === 0, "fresh save starts with no recruited Karu");

  const state = new GameState();
  state.frame.player.position.set(40, 80, 120);
  state.frame.player.velocity.set(1, 2, 3);
  state.frame.save.catalogedLandmarkIds.add("start-burrow");
  state.frame.save.gatheredForageableIds.add("lake-shell");
  state.frame.save.recruitedKaruIds.add("karu-0-0");
  state.markSaveDirty();
  const revisionBeforeReset = state.getSaveRevision();

  state.resetProgress();
  const freshRuntimeState = new GameState();

  assert(state.getSaveRevision() > revisionBeforeReset, "resetting progress marks the save dirty");
  assertApprox(state.frame.player.position.x, startingPosition.x, 0.001, "reset returns Mossu to start x");
  assertApprox(state.frame.player.position.y, startingPosition.y, 0.001, "reset returns Mossu to start y");
  assertApprox(state.frame.player.position.z, startingPosition.z, 0.001, "reset returns Mossu to start z");
  assert(state.frame.player.velocity.lengthSq() === 0, "reset clears player velocity");
  assert(state.frame.save.unlockedAbilities.has("breeze_float"), "reset keeps Breeze Float unlocked");
  assertDeepEqual(
    [...state.frame.save.catalogedLandmarkIds].sort(),
    [...freshRuntimeState.frame.save.catalogedLandmarkIds].sort(),
    "reset returns stamped landmarks to the fresh runtime baseline",
  );
  assert(state.frame.save.gatheredForageableIds.size === 0, "reset clears gathered goods");
  assert(state.frame.save.recruitedKaruIds.size === 0, "reset clears recruited Karu");
}
