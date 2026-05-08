import type { ForageableEntryState, FrameState, InventoryEntryState, SaveState } from "./gameState";
import { getForageableEntries } from "./forageableProgress";
import { getCollectionEntries } from "./landmarkProgress";
import { JUMP_VELOCITY, ROLL_BOOST_MULTIPLIER, ROLL_SPEED, WALK_SPEED } from "./playerSimulationConstants";
import { canUseBreezeFloat } from "./staminaAbilities";

const FORAGE_GOAL_TARGET = 3;
const KARU_PROFILE_NAMES = ["Dewcap", "Sprig", "Pebble", "Luma", "Fenn", "Mallow", "Pip", "Thistle"];
const KARU_PROFILE_MOODS = ["curious", "shy", "brave", "sleepy"] as const;

export type KaruProfileMood = (typeof KARU_PROFILE_MOODS)[number];

export interface KaruCompanionProfileView {
  id: string;
  label: string;
  mood: KaruProfileMood;
  trait: string;
  detail: string;
  cardIndex: number;
  total: number;
}

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
  progression: {
    label: string;
    detail: string;
    percent: number;
    collected: number;
    total: number;
  };
  stats: CharacterStatView[];
  upgrades: {
    unlocked: CharacterUpgradeView[];
    locked: CharacterUpgradeView[];
  };
  collections: InventoryEntryState[];
  gatheredGoods: ForageableEntryState[];
  karuCompanions: KaruCompanionProfileView[];
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
  const totalCollectibles = collections.length + gatheredGoods.length;
  const totalCollected = discoveredCount + gatheredCount;
  const canFloat = canUseBreezeFloat(save);
  const progression = getTrailProgression(save, totalCollected, totalCollectibles);
  const forageGoalTarget = Math.min(FORAGE_GOAL_TARGET, gatheredGoods.length);
  const forageGoalCount = Math.min(gatheredCount, forageGoalTarget);
  const shrineRewardClaimed = save.catalogedLandmarkIds.has("peak-shrine");
  const recruitedKaruIds = [...save.recruitedKaruIds].sort();
  const karuCompanions = recruitedKaruIds.map((id, index) =>
    buildKaruCompanionProfile(id, index, recruitedKaruIds.length),
  );

  return {
    progression,
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
        detail: canFloat ? "Hold Space in the air to drift across ravines and shelves." : "No glide unlocked yet.",
      },
      {
        id: "collection-progress",
        label: "Collection Log",
        value: `${discoveredCount}/${collections.length}`,
        detail: "Keepsakes recorded automatically whenever Mossu reaches a landmark.",
      },
      {
        id: "forage-goal",
        label: "Forage Goal",
        value: `${forageGoalCount}/${forageGoalTarget}`,
        detail:
          forageGoalCount >= forageGoalTarget
            ? "Starter pouch complete. Extra samples now fill out the habitat set."
            : "Gather three easy trail samples so the route has both places and pocket finds.",
      },
      {
        id: "karu-trail",
        label: "Karu Friends",
        value: `${save.recruitedKaruIds.size}`,
        detail:
          save.recruitedKaruIds.size > 0
            ? "Invited Karu stay with Mossu after reloads and resets only clear them by choice."
            : "Invite nearby Karu with E once they settle close enough to the trail.",
      },
      {
        id: "shrine-reward",
        label: "Shrine Gift",
        value: shrineRewardClaimed ? "Claimed" : "Waiting",
        detail: shrineRewardClaimed
          ? "The Moss Crown stamp opened the Summit Circuit for return trips and missed samples."
          : "Reach Moss Crown to claim the route-complete field guide state.",
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
    karuCompanions,
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

function buildKaruCompanionProfile(id: string, index: number, total: number): KaruCompanionProfileView {
  const hash = stableHash(id);
  const mood = karuMoodForId(id, hash);
  const name = KARU_PROFILE_NAMES[hash % KARU_PROFILE_NAMES.length] ?? "Trail";
  return {
    id,
    label: `${name} Karu`,
    mood,
    trait: karuMoodTrait(mood),
    detail: karuMoodDetail(mood),
    cardIndex: index + 1,
    total,
  };
}

function karuMoodForId(id: string, fallbackHash: number): KaruProfileMood {
  const match = /^karu-(\d+)-(\d+)$/.exec(id);
  if (!match) {
    return KARU_PROFILE_MOODS[fallbackHash % KARU_PROFILE_MOODS.length] ?? "curious";
  }
  const pocketIndex = Number(match[1] ?? 0);
  const karuIndex = Number(match[2] ?? 0);
  return KARU_PROFILE_MOODS[(pocketIndex * 2 + karuIndex) % KARU_PROFILE_MOODS.length] ?? "curious";
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function karuMoodTrait(mood: KaruProfileMood) {
  switch (mood) {
    case "brave":
      return "bank scout";
    case "shy":
      return "soft-step";
    case "sleepy":
      return "moss napper";
    case "curious":
    default:
      return "ripple watcher";
  }
}

function karuMoodDetail(mood: KaruProfileMood) {
  switch (mood) {
    case "brave":
      return "Pads closest to the banks and keeps the trail line brave.";
    case "shy":
      return "Hangs near Mossu's wake and settles when the grass gets quiet.";
    case "sleepy":
      return "Follows in soft little hops, then dozes whenever Mossu pauses.";
    case "curious":
    default:
      return "Perks up at tiny ripples, leaf glints, and Mossu's call.";
  }
}

function getTrailProgression(save: SaveState, collected: number, total: number): CharacterScreenView["progression"] {
  const percent = total <= 0 ? 0 : Math.round((collected / total) * 100);
  if (save.catalogedLandmarkIds.has("peak-shrine")) {
    return {
      label: "Summit circuit",
      detail: "Moss Crown is stamped. The return loop is open for missed notes and samples.",
      percent,
      collected,
      total,
    };
  }
  if (!save.catalogedLandmarkIds.has("start-burrow")) {
    return {
      label: "Burrow start",
      detail: "Wake the field guide by leaving the nest and stamping Burrow Hollow.",
      percent,
      collected,
      total,
    };
  }
  if (!save.gatheredForageableIds.has("lake-shell")) {
    return {
      label: "First sleeve",
      detail: "Find the lake-shore shell so the guide has both a note and a sample.",
      percent,
      collected,
      total,
    };
  }
  if (!save.catalogedLandmarkIds.has("orange-tree-overlook")) {
    return {
      label: "Amber lookout",
      detail: "Follow the warm rise to the lone amber tree and stamp the next field note.",
      percent,
      collected,
      total,
    };
  }
  return {
    label: "Shrine climb",
    detail: "The guide is started. Keep following river bends, glades, and highland shelves.",
    percent,
    collected,
    total,
  };
}
