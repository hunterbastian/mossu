const HALF_TURN_RADIANS = Math.PI;

export function normalizeYaw(yaw: number) {
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

export function movementYawToTrailingCameraYaw(movementYaw: number) {
  return normalizeYaw(movementYaw + HALF_TURN_RADIANS);
}
