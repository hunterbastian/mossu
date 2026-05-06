import { startingPosition, worldForageables, worldLandmarks } from "../../simulation/world";
import type { DebugSaveStatePayload } from "./appRuntimeConfig";

export type DebugSavePresetId =
  | "fresh-start"
  | "karu-recruited"
  | "handbook-populated"
  | "water-route"
  | "summit-ready";

export interface DebugSavePresetSummary {
  id: DebugSavePresetId;
  label: string;
  summary: string;
}

type DebugSavePreset = DebugSavePresetSummary & {
  payload: DebugSaveStatePayload;
};

const BASE_ABILITIES = ["breeze_float"];
const OPENING_LANDMARK_IDS = ["start-burrow", "orange-tree-overlook", "river-bend"];
const ROUTE_LANDMARK_IDS = ["start-burrow", "fir-gate", "highland-basin", "ridge-saddle-landmark", "peak-shrine"];
const OPENING_FORAGEABLE_IDS = ["meadow-seed-pouch", "lake-shell", "amber-berries", "river-smooth-stone"];
const ALL_LANDMARK_IDS = worldLandmarks.map((landmark) => landmark.id);
const ALL_FORAGEABLE_IDS = worldForageables.map((forageable) => forageable.id);

const DEBUG_SAVE_PRESETS: DebugSavePreset[] = [
  {
    id: "fresh-start",
    label: "Fresh Start",
    summary: "Opening state at the burrow with no discovered progress.",
    payload: {
      player: {
        x: startingPosition.x,
        z: startingPosition.z,
        heading: 0,
      },
      save: {
        unlockedAbilities: BASE_ABILITIES,
        catalogedLandmarkIds: [],
        gatheredForageableIds: [],
        recruitedKaruIds: [],
      },
    },
  },
  {
    id: "karu-recruited",
    label: "Karu Recruited",
    summary: "Early meadow state with Karu already following Mossu.",
    payload: {
      player: {
        x: -21,
        z: -34,
        heading: 0.42,
      },
      save: {
        unlockedAbilities: BASE_ABILITIES,
        catalogedLandmarkIds: ["start-burrow"],
        gatheredForageableIds: ["meadow-seed-pouch", "lake-shell"],
        recruitedKaruIds: ["karu-0-0"],
      },
    },
  },
  {
    id: "handbook-populated",
    label: "Populated Handbook",
    summary: "Several route stamps, gathered goods, and Karu data for HUD checks.",
    payload: {
      player: {
        x: 22,
        z: 48,
        heading: -0.16,
      },
      save: {
        unlockedAbilities: BASE_ABILITIES,
        catalogedLandmarkIds: OPENING_LANDMARK_IDS,
        gatheredForageableIds: OPENING_FORAGEABLE_IDS,
        recruitedKaruIds: ["karu-0-0"],
      },
    },
  },
  {
    id: "water-route",
    label: "Water Route",
    summary: "River and lake progress near the Silver Bend water readability checks.",
    payload: {
      player: {
        x: 38,
        z: 24,
        heading: -0.48,
      },
      save: {
        unlockedAbilities: BASE_ABILITIES,
        catalogedLandmarkIds: ["start-burrow", "river-bend"],
        gatheredForageableIds: ["lake-shell", "river-smooth-stone"],
        recruitedKaruIds: ["karu-0-0"],
      },
    },
  },
  {
    id: "summit-ready",
    label: "Summit Ready",
    summary: "Full sourcebook progress near the Moss Crown route finish.",
    payload: {
      player: {
        x: 8,
        z: 220,
        heading: -0.2,
      },
      save: {
        unlockedAbilities: BASE_ABILITIES,
        catalogedLandmarkIds: [...new Set([...ROUTE_LANDMARK_IDS, ...ALL_LANDMARK_IDS])],
        gatheredForageableIds: ALL_FORAGEABLE_IDS,
        recruitedKaruIds: ["karu-0-0", "karu-1-0", "karu-2-0"],
      },
    },
  },
];

const PRESETS_BY_ID = new Map(DEBUG_SAVE_PRESETS.map((preset) => [preset.id, preset]));

export function listDebugSavePresets(): DebugSavePresetSummary[] {
  return DEBUG_SAVE_PRESETS.map(({ id, label, summary }) => ({ id, label, summary }));
}

export function getDebugSavePreset(id: string): DebugSavePreset | null {
  return PRESETS_BY_ID.get(id as DebugSavePresetId) ?? null;
}

export function buildDebugSavePresetPayload(id: string): DebugSaveStatePayload | null {
  const preset = getDebugSavePreset(id);
  if (!preset) {
    return null;
  }

  return {
    player: preset.payload.player ? { ...preset.payload.player } : undefined,
    save: preset.payload.save
      ? {
          unlockedAbilities: [...(preset.payload.save.unlockedAbilities ?? [])],
          catalogedLandmarkIds: [...(preset.payload.save.catalogedLandmarkIds ?? [])],
          gatheredForageableIds: [...(preset.payload.save.gatheredForageableIds ?? [])],
          recruitedKaruIds: [...(preset.payload.save.recruitedKaruIds ?? [])],
        }
      : undefined,
  };
}
