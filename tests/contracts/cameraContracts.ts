import { movementYawToTrailingCameraYaw } from "../../src/render/app/cameraYaw";
import { assertApprox } from "./testHarness";

export function runCameraContracts() {
  assertApprox(
    movementYawToTrailingCameraYaw(0),
    Math.PI,
    0.001,
    "forward movement places the trailing camera behind the player",
  );
  assertApprox(
    movementYawToTrailingCameraYaw(Math.PI / 2),
    -Math.PI / 2,
    0.001,
    "rightward movement places the trailing camera on the opposite side",
  );
  assertApprox(
    movementYawToTrailingCameraYaw(-Math.PI / 2),
    Math.PI / 2,
    0.001,
    "leftward movement places the trailing camera on the opposite side",
  );
}
