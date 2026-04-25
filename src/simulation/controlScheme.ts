export type MovementAxis = "moveX" | "moveY";

export interface MovementBinding {
  code: string;
  key: string;
  axis: MovementAxis;
  value: -1 | 1;
  label: string;
  showInHud?: boolean;
}

export const MOVEMENT_BINDINGS: readonly MovementBinding[] = [
  { code: "KeyW", key: "w", axis: "moveY", value: 1, label: "forward", showInHud: true },
  { code: "KeyA", key: "a", axis: "moveX", value: -1, label: "left", showInHud: true },
  { code: "KeyS", key: "s", axis: "moveY", value: -1, label: "backward", showInHud: true },
  { code: "KeyD", key: "d", axis: "moveX", value: 1, label: "right", showInHud: true },
  { code: "ArrowUp", key: "arrowup", axis: "moveY", value: 1, label: "forward" },
  { code: "ArrowLeft", key: "arrowleft", axis: "moveX", value: -1, label: "left" },
  { code: "ArrowDown", key: "arrowdown", axis: "moveY", value: -1, label: "backward" },
  { code: "ArrowRight", key: "arrowright", axis: "moveX", value: 1, label: "right" },
] as const;

export const MOVEMENT_CONTROL_LABELS = MOVEMENT_BINDINGS
  .filter((binding) => binding.showInHud)
  .map((binding) => [binding.key.toUpperCase(), binding.label] as const);

export const MOVEMENT_CONTROL_SUMMARY = "W forward · A left · S backward · D right";

export function sampleMovementAxes(isPressed: (code: string, key: string) => boolean) {
  let moveX = 0;
  let moveY = 0;

  MOVEMENT_BINDINGS.forEach((binding) => {
    if (!isPressed(binding.code, binding.key)) {
      return;
    }

    if (binding.axis === "moveX") {
      moveX += binding.value;
    } else {
      moveY += binding.value;
    }
  });

  return {
    moveX: Math.max(-1, Math.min(1, moveX)),
    moveY: Math.max(-1, Math.min(1, moveY)),
  };
}
