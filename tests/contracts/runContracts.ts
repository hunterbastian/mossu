import { runCameraContracts } from "./cameraContracts";
import { runControlContracts } from "./controlContracts";
import { runHabitatContracts } from "./habitatContracts";
import { runMovementContracts } from "./movementContracts";
import { runRouteContracts } from "./routeContracts";
import { runContracts } from "./testHarness";
import { runVisualContracts } from "./visualContracts";
import { runWaterContracts } from "./waterContracts";

runContracts({
  camera: runCameraContracts,
  controls: runControlContracts,
  habitats: runHabitatContracts,
  movement: runMovementContracts,
  visuals: runVisualContracts,
  "water-state-agreement": runWaterContracts,
  "route-checkpoints": runRouteContracts,
});
