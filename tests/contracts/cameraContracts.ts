import {
  cameraForwardAlignment,
  cameraPositionYawToLookYaw,
  movementYawToTrailingCameraYaw,
  shouldAutoRecenterForMovement,
} from "../../src/render/app/cameraYaw";
import { assert, assertApprox } from "./testHarness";

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
  assertApprox(
    cameraPositionYawToLookYaw(Math.PI),
    0,
    0.001,
    "camera behind the player looks forward along route-positive Z",
  );
  assertApprox(
    cameraForwardAlignment(0, 0, 8),
    1,
    0.001,
    "forward velocity aligns with camera look direction",
  );
  assertApprox(
    cameraForwardAlignment(0, 8, 0),
    0,
    0.001,
    "right strafe velocity is lateral relative to camera look direction",
  );
  assert(shouldAutoRecenterForMovement(0, 0, 8), "forward movement can auto-recenter the camera");
  assert(!shouldAutoRecenterForMovement(0, -8, 0), "left strafe does not auto-recenter the camera");
  assert(!shouldAutoRecenterForMovement(0, 8, 0), "right strafe does not auto-recenter the camera");
  assert(!shouldAutoRecenterForMovement(0, 0, -8), "backpedal does not auto-recenter the camera");
}
