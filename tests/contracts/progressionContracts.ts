import { buildTrailProgression, sampleObjectiveText } from "../../src/simulation/progressionObjectives";
import { assert, assertEqual } from "./testHarness";

function makeProgress(cataloged: string[] = [], gathered: string[] = []) {
  return {
    catalogedLandmarkIds: new Set(cataloged),
    gatheredForageableIds: new Set(gathered),
  };
}

export function runProgressionContracts() {
  const freshObjective = sampleObjectiveText(makeProgress());
  assertEqual(freshObjective.title, "Wake at Burrow Hollow", "fresh objective starts at Burrow Hollow");

  const firstSleeve = sampleObjectiveText(makeProgress(["start-burrow"]));
  assertEqual(firstSleeve.title, "Fill the first binder sleeve", "after Burrow, objective asks for first good");

  const amberLookout = sampleObjectiveText(makeProgress(["start-burrow"], ["lake-shell"]));
  assertEqual(amberLookout.title, "Find the amber lookout", "after first good, objective points to Amber Tree");

  const summitObjective = sampleObjectiveText(makeProgress(["peak-shrine"], ["lake-shell"]));
  assertEqual(summitObjective.title, "Summit Circuit unlocked", "shrine objective unlocks summit circuit");

  const summitProgression = buildTrailProgression(makeProgress(["peak-shrine"], ["lake-shell"]), 4, 10);
  assertEqual(summitProgression.label, "Summit circuit", "field guide uses summit circuit after shrine stamp");
  assertEqual(summitProgression.percent, 40, "field guide progression keeps collected percent");
  assert(
    summitProgression.detail.includes("return loop"),
    "summit field-guide detail keeps return loop language for future expansion",
  );
}
