import { MathUtils, type Camera } from "three";
import type { PlayerState } from "../../simulation/gameState";
import { sampleWaterState } from "../../simulation/world";

export function getUnderwaterEffectTargetIntensity(camera: Camera, player: PlayerState) {
  const cameraWater = sampleWaterState(camera.position.x, camera.position.z);
  const depthBelowSurface = cameraWater ? cameraWater.surfaceY - camera.position.y : 0;
  const cameraIntensity = cameraWater && depthBelowSurface > 0.08
    ? MathUtils.clamp(0.22 + depthBelowSurface / 8.5, 0, 1)
    : 0;
  const playerIntensity = player.waterMode === "underwater"
    ? MathUtils.clamp(0.38 + player.waterDepth / 10, 0.38, 0.82)
    : 0;
  return Math.max(cameraIntensity, playerIntensity);
}
