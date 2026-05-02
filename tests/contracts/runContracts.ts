import { runCameraContracts } from "./cameraContracts";
import { runControlContracts } from "./controlContracts";
import { runHabitatContracts } from "./habitatContracts";
import { runIslandRegionContracts } from "./islandRegionContracts";
import { runMovementContracts } from "./movementContracts";
import { runRenderQualityContracts } from "./renderQualityContracts";
import { runRouteContracts } from "./routeContracts";
import { runSaveContracts } from "./saveContracts";
import { runContracts } from "./testHarness";
import { runVisualContracts } from "./visualContracts";
import { runWaterContracts } from "./waterContracts";

runContracts({
  camera: runCameraContracts,
  controls: runControlContracts,
  habitats: runHabitatContracts,
  "island-regions": runIslandRegionContracts,
  movement: runMovementContracts,
  "render-quality": runRenderQualityContracts,
  visuals: runVisualContracts,
  "water-state-agreement": runWaterContracts,
  "route-checkpoints": runRouteContracts,
  save: runSaveContracts,
});
