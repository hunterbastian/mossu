import { sampleMovementAxes } from "./controlScheme";

export interface InputSnapshot {
  moveX: number;
  moveY: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  abilityHeld: boolean;
  abilityPressed: boolean;
  interactHeld: boolean;
  interactHoldSeconds: number;
  rollHeld: boolean;
  interactPressed: boolean;
  inventoryTogglePressed: boolean;
  mapTogglePressed: boolean;
  mapViewResetPressed: boolean;
  mapFocusNextPressed: boolean;
  escapePressed: boolean;
}

export class InputController {
  private pressed = new Set<string>();
  private interactHeldSince: number | null = null;
  private jumpPressedFrame = false;
  private abilityPressedFrame = false;
  private interactPressedFrame = false;
  private inventoryTogglePressedFrame = false;
  private mapTogglePressedFrame = false;
  private mapViewResetPressedFrame = false;
  private mapFocusNextPressedFrame = false;
  private escapePressedFrame = false;
  private disposeCallbacks: Array<() => void> = [];

  constructor(private readonly target: Window | HTMLElement = window) {
    const keydown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(event.code)) {
        event.preventDefault();
      }
      if (!this.isPressed("Space", " ") && this.matchesKey(event, "Space", " ")) {
        this.jumpPressedFrame = true;
      }
      if (!this.isPressed("KeyQ", "q") && this.matchesKey(event, "KeyQ", "q")) {
        this.abilityPressedFrame = true;
      }
      if (!this.isPressed("KeyE", "e") && this.matchesKey(event, "KeyE", "e")) {
        this.interactPressedFrame = true;
        this.interactHeldSince = performance.now();
      }
      if (!this.isPressed("Tab", "tab") && this.matchesKey(event, "Tab", "tab")) {
        this.inventoryTogglePressedFrame = true;
      }
      if (!this.isPressed("KeyM", "m") && this.matchesKey(event, "KeyM", "m")) {
        this.mapTogglePressedFrame = true;
      }
      if (!this.isPressed("KeyR", "r") && this.matchesKey(event, "KeyR", "r")) {
        this.mapViewResetPressedFrame = true;
      }
      if (!this.isPressed("Home", "home") && event.code === "Home") {
        this.mapViewResetPressedFrame = true;
      }
      if (!this.isPressed("KeyF", "f") && this.matchesKey(event, "KeyF", "f")) {
        this.mapFocusNextPressedFrame = true;
      }
      if (!this.isPressed("Escape", "escape") && this.matchesKey(event, "Escape", "escape")) {
        this.escapePressedFrame = true;
      }
      this.addPressed(event);
    };

    const keyup = (event: KeyboardEvent) => {
      this.removePressed(event);
    };

    this.target.addEventListener("keydown", keydown as EventListener);
    this.target.addEventListener("keyup", keyup as EventListener);
    this.disposeCallbacks.push(() => this.target.removeEventListener("keydown", keydown as EventListener));
    this.disposeCallbacks.push(() => this.target.removeEventListener("keyup", keyup as EventListener));
  }

  sample(): InputSnapshot {
    const { moveX, moveY } = sampleMovementAxes((code, key) => this.isPressed(code, key));
    const jumpHeld = this.isPressed("Space", " ");
    const jumpPressed = this.jumpPressedFrame;
    const abilityHeld = this.isPressed("KeyQ", "q");
    const abilityPressed = this.abilityPressedFrame;
    const interactHeld = this.isPressed("KeyE", "e");
    const interactHoldSeconds =
      interactHeld && this.interactHeldSince !== null
        ? Math.max(0, (performance.now() - this.interactHeldSince) / 1000)
        : 0;
    const rollHeld = this.isPressed("ShiftLeft", "shift") || this.isPressed("ShiftRight", "shift");
    const interactPressed = this.interactPressedFrame;
    const inventoryTogglePressed = this.inventoryTogglePressedFrame;
    const mapTogglePressed = this.mapTogglePressedFrame;
    const mapViewResetPressed = this.mapViewResetPressedFrame;
    const mapFocusNextPressed = this.mapFocusNextPressedFrame;
    const escapePressed = this.escapePressedFrame;
    this.jumpPressedFrame = false;
    this.abilityPressedFrame = false;
    this.interactPressedFrame = false;
    this.inventoryTogglePressedFrame = false;
    this.mapTogglePressedFrame = false;
    this.mapViewResetPressedFrame = false;
    this.mapFocusNextPressedFrame = false;
    this.escapePressedFrame = false;
    return {
      moveX,
      moveY,
      jumpHeld,
      jumpPressed,
      abilityHeld,
      abilityPressed,
      interactHeld,
      interactHoldSeconds,
      rollHeld,
      interactPressed,
      inventoryTogglePressed,
      mapTogglePressed,
      mapViewResetPressed,
      mapFocusNextPressed,
      escapePressed,
    };
  }

  dispose() {
    this.disposeCallbacks.forEach((callback) => callback());
  }

  private addPressed(event: KeyboardEvent) {
    if (event.code) {
      this.pressed.add(event.code);
    }
    if (event.key) {
      this.pressed.add(event.key.toLowerCase());
    }
  }

  private removePressed(event: KeyboardEvent) {
    if (event.code) {
      this.pressed.delete(event.code);
    }
    if (event.key) {
      this.pressed.delete(event.key.toLowerCase());
    }
    if (this.matchesKey(event, "KeyE", "e")) {
      this.interactHeldSince = null;
    }
  }

  private matchesKey(event: KeyboardEvent, code: string, key: string) {
    return event.code === code || event.key.toLowerCase() === key;
  }

  private isPressed(code: string, key?: string) {
    return this.pressed.has(code) || (key ? this.pressed.has(key) : false);
  }
}
