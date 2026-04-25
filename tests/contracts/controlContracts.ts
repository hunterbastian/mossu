import {
  MOVEMENT_CONTROL_LABELS,
  MOVEMENT_CONTROL_SUMMARY,
  sampleMovementAxes,
} from "../../src/simulation/controlScheme";
import { assertDeepEqual, assertEqual } from "./testHarness";

export function runControlContracts() {
  assertDeepEqual(sampleMovementAxes((code) => code === "KeyW"), { moveX: 0, moveY: 1 }, "W moves forward");
  assertDeepEqual(sampleMovementAxes((code) => code === "KeyA"), { moveX: -1, moveY: 0 }, "A moves left");
  assertDeepEqual(sampleMovementAxes((code) => code === "KeyS"), { moveX: 0, moveY: -1 }, "S moves backward");
  assertDeepEqual(sampleMovementAxes((code) => code === "KeyD"), { moveX: 1, moveY: 0 }, "D moves right");

  assertDeepEqual(sampleMovementAxes((code) => code === "ArrowUp"), { moveX: 0, moveY: 1 }, "ArrowUp mirrors W");
  assertDeepEqual(sampleMovementAxes((code) => code === "ArrowLeft"), { moveX: -1, moveY: 0 }, "ArrowLeft mirrors A");
  assertDeepEqual(sampleMovementAxes((code) => code === "ArrowDown"), { moveX: 0, moveY: -1 }, "ArrowDown mirrors S");
  assertDeepEqual(sampleMovementAxes((code) => code === "ArrowRight"), { moveX: 1, moveY: 0 }, "ArrowRight mirrors D");

  assertDeepEqual(
    MOVEMENT_CONTROL_LABELS,
    [
      ["W", "forward"],
      ["A", "left"],
      ["S", "backward"],
      ["D", "right"],
    ],
    "HUD movement labels match canonical bindings",
  );
  assertEqual(MOVEMENT_CONTROL_SUMMARY, "W forward · A left · S backward · D right", "HUD summary matches canonical bindings");
}
