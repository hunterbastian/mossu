import { runCameraContracts } from "./cameraContracts";
import { runControlContracts } from "./controlContracts";
import { runHabitatContracts } from "./habitatContracts";
import { runRouteContracts } from "./routeContracts";
import { runContracts } from "./testHarness";
import { runWaterContracts } from "./waterContracts";

runContracts({
  camera: runCameraContracts,
  controls: runControlContracts,
  habitats: runHabitatContracts,
  "water-state-agreement": runWaterContracts,
  "route-checkpoints": runRouteContracts,
});
