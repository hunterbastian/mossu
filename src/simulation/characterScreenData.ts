import type { ForageableEntryState, FrameState, InventoryEntryState, SaveState } from "./gameState";
import { getForageableEntries } from "./forageableProgress";
import { getCollectionEntries } from "./landmarkProgress";
import {
  JUMP_VELOCITY,
  ROLL_BOOST_MULTIPLIER,
  ROLL_SPEED,
  WALK_SPEED,
} from "./playerSimulationConstants";
import { canUseBreezeFloat } from "./staminaAbilities";

export interface CharacterStatView {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface CharacterUpgradeView {
  id: string;
  label: string;
  status: "unlocked" | "locked";
  description: string;
}

export interface CharacterScreenView {
  stats: CharacterStatView[];
  upgrades: {
    unlocked: CharacterUpgradeView[];
    locked: CharacterUpgradeView[];
  };
  collections: InventoryEntryState[];
  gatheredGoods: ForageableEntryState[];
  totals: {
    discovered: number;
    total: number;
  };
  gatheredTotals: {
    gathered: number;
    total: number;
  };
  nearbyCollectionId: string | null;
  latestCollectionId: string | null;
  latestGatheredGoodId: string | null;
}

export function buildCharacterScreenData(save: SaveState, frame: FrameState): CharacterScreenView {
  const collections = getCollectionEntries(save.catalogedLandmarkIds);
  const discoveredCount = collections.filter((entry) => entry.discovered).length;
  const gatheredGoods = getForageableEntries(save.gatheredForageableIds);
  const gatheredCount = gatheredGoods.filter((entry) => entry.gathered).length;
  const canFloat = canUseBreezeFloat(save);

  return {
    stats: [
      {
        id: "walk-speed",
        label: "Walk Speed",
        value: WALK_SPEED.toFixed(1),
        detail: "Grounded strolling pace through the meadows and passes.",
      },
      {
        id: "roll-speed",
        label: "Roll Speed",
        value: `${ROLL_SPEED.toFixed(1)} / ${(ROLL_SPEED * ROLL_BOOST_MULTIPLIER).toFixed(1)}`,
        detail: "Base roll pace with the charged burst shown as the second value.",
      },
      {
        id: "jump-strength",
        label: "Jump Strength",
        value: JUMP_VELOCITY.toFixed(1),
        detail: "Vertical lift used for cliffs, banks, and ridge ledges.",
      },
      {
        id: "stamina-ring",
        label: "Stamina Ring",
        value: `${Math.round((frame.player.stamina / frame.player.staminaMax) * 100)}%`,
        detail: "Breeze Float uses this meter; rolling stays free so slopes remain playful.",
      },
      {
        id: "glide-status",
        label: "Glide Status",
        value: canFloat ? "Awakened" : "Dormant",
        detail: canFloat
          ? "Hold Space in the air to drift across ravines and shelves."
          : "No glide unlocked yet.",
      },
      {
        id: "collection-progress",
        label: "Collection Log",
        value: `${discoveredCount}/${collections.length}`,
        detail: "Keepsakes recorded automatically whenever Mossu reaches a landmark.",
      },
    ],
    upgrades: {
      unlocked: [
        {
          id: "breeze_float",
          label: "Breeze Float",
          status: "unlocked",
          description: "Unlocked. Hold Space in midair to soften descents and drift through the mountain route.",
        },
      ],
      locked: [
        {
          id: "moss_compass",
          label: "Moss Compass",
          status: "locked",
          description: "Locked. Reserved for a future exploration upgrade slot.",
        },
        {
          id: "ridge_curl",
          label: "Ridge Curl",
          status: "locked",
          description: "Locked. Reserved for a future traversal upgrade slot.",
        },
        {
          id: "burrow_blessing",
          label: "Burrow Blessing",
          status: "locked",
          description: "Locked. Reserved for a future collection or comfort upgrade slot.",
        },
      ],
    },
    collections,
    gatheredGoods,
    totals: {
      discovered: discoveredCount,
      total: collections.length,
    },
    gatheredTotals: {
      gathered: gatheredCount,
      total: gatheredGoods.length,
    },
    nearbyCollectionId: frame.interactionTarget?.landmarkId ?? null,
    latestCollectionId: frame.lastCatalogedLandmarkId,
    latestGatheredGoodId: frame.lastGatheredForageableId,
  };
}
