export interface ProgressionObjectiveSnapshot {
  catalogedLandmarkIds?: ReadonlySet<string>;
  gatheredForageableIds?: ReadonlySet<string>;
}

export interface ObjectiveText {
  title: string;
  body: string;
}

export interface TrailProgressionView {
  label: string;
  detail: string;
  percent: number;
  collected: number;
  total: number;
}

export function sampleObjectiveText(progress?: ProgressionObjectiveSnapshot): ObjectiveText {
  const cataloged = progress?.catalogedLandmarkIds;
  const gathered = progress?.gatheredForageableIds;
  if (cataloged?.has("peak-shrine")) {
    return {
      title: "Summit Circuit unlocked",
      body: "Mossu reached Moss Crown. Follow the warm trail back through missed goods, Karu pockets, and field notes.",
    };
  }

  if (!cataloged?.has("start-burrow")) {
    return {
      title: "Wake at Burrow Hollow",
      body: "Leave the nest, follow the worn warm path, and use the bright lake edge as the first landmark.",
    };
  }

  if (!gathered?.has("lake-shell")) {
    return {
      title: "Fill the first binder sleeve",
      body: "Look along the soft lake shore for a pouch good, then keep the river on Mossu's right as the meadow opens.",
    };
  }

  if (!cataloged?.has("orange-tree-overlook")) {
    return {
      title: "Find the amber lookout",
      body: "Follow the warm rise toward the lone amber tree. If a Karu watches from the grass, move closer and press E.",
    };
  }

  return {
    title: "Climb toward the shrine",
    body: "Use the warm path, river bends, open glades, and highland shelves to read the route toward Moss Crown.",
  };
}

export function buildTrailProgression(
  progress: ProgressionObjectiveSnapshot,
  collected: number,
  total: number,
): TrailProgressionView {
  const cataloged = progress.catalogedLandmarkIds;
  const gathered = progress.gatheredForageableIds;
  const percent = total <= 0 ? 0 : Math.round((collected / total) * 100);
  if (cataloged?.has("peak-shrine")) {
    return {
      label: "Summit circuit",
      detail: "Moss Crown is stamped. The return loop is open for missed notes and samples.",
      percent,
      collected,
      total,
    };
  }
  if (!cataloged?.has("start-burrow")) {
    return {
      label: "Burrow start",
      detail: "Wake the field guide by leaving the nest and stamping Burrow Hollow.",
      percent,
      collected,
      total,
    };
  }
  if (!gathered?.has("lake-shell")) {
    return {
      label: "First sleeve",
      detail: "Find the lake-shore shell so the guide has both a note and a sample.",
      percent,
      collected,
      total,
    };
  }
  if (!cataloged?.has("orange-tree-overlook")) {
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
