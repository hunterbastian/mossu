const HALF_TURN_RADIANS = Math.PI;
const DEFAULT_AUTORECENTER_MIN_SPEED = 1.2;
const DEFAULT_AUTORECENTER_FORWARD_ALIGNMENT = 0.36;

export function normalizeYaw(yaw: number) {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

export function cameraPositionYawToLookYaw(cameraPositionYaw: number) {
  return normalizeYaw(cameraPositionYaw + HALF_TURN_RADIANS);
}

export function movementYawToTrailingCameraYaw(movementYaw: number) {
  return normalizeYaw(movementYaw + HALF_TURN_RADIANS);
}

export function cameraForwardAlignment(cameraLookYaw: number, velocityX: number, velocityZ: number) {
  const speed = Math.hypot(velocityX, velocityZ);
  if (speed <= 0.0001) {
    return 0;
  }

  const forwardX = Math.sin(cameraLookYaw);
  const forwardZ = Math.cos(cameraLookYaw);
  return (velocityX * forwardX + velocityZ * forwardZ) / speed;
}

export function shouldAutoRecenterForMovement(
  cameraLookYaw: number,
  velocityX: number,
  velocityZ: number,
  minSpeed = DEFAULT_AUTORECENTER_MIN_SPEED,
  minForwardAlignment = DEFAULT_AUTORECENTER_FORWARD_ALIGNMENT,
) {
  if (Math.hypot(velocityX, velocityZ) < minSpeed) {
    return false;
  }

  return cameraForwardAlignment(cameraLookYaw, velocityX, velocityZ) >= minForwardAlignment;
}
