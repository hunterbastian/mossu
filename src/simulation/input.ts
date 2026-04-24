export interface InputSnapshot {
  moveX: number;
  moveY: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  rollHeld: boolean;
  interactPressed: boolean;
  inventoryTogglePressed: boolean;
  mapTogglePressed: boolean;
  escapePressed: boolean;
}

export class InputController {
  private pressed = new Set<string>();
  private jumpPressedFrame = false;
  private interactPressedFrame = false;
  private inventoryTogglePressedFrame = false;
  private mapTogglePressedFrame = false;
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
      if (!this.isPressed("KeyE", "e") && this.matchesKey(event, "KeyE", "e")) {
        this.interactPressedFrame = true;
      }
      if (!this.isPressed("Tab", "tab") && this.matchesKey(event, "Tab", "tab")) {
        this.inventoryTogglePressedFrame = true;
      }
      if (!this.isPressed("KeyM", "m") && this.matchesKey(event, "KeyM", "m")) {
        this.mapTogglePressedFrame = true;
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
    const moveX = (this.isPressed("KeyD", "d") || this.isPressed("ArrowRight", "arrowright") ? 1 : 0) - (this.isPressed("KeyA", "a") || this.isPressed("ArrowLeft", "arrowleft") ? 1 : 0);
    const moveY = (this.isPressed("KeyW", "w") || this.isPressed("ArrowUp", "arrowup") ? 1 : 0) - (this.isPressed("KeyS", "s") || this.isPressed("ArrowDown", "arrowdown") ? 1 : 0);
    const jumpHeld = this.isPressed("Space", " ");
    const jumpPressed = this.jumpPressedFrame;
    const rollHeld = this.isPressed("ShiftLeft", "shift") || this.isPressed("ShiftRight", "shift");
    const interactPressed = this.interactPressedFrame;
    const inventoryTogglePressed = this.inventoryTogglePressedFrame;
    const mapTogglePressed = this.mapTogglePressedFrame;
    const escapePressed = this.escapePressedFrame;
    this.jumpPressedFrame = false;
    this.interactPressedFrame = false;
    this.inventoryTogglePressedFrame = false;
    this.mapTogglePressedFrame = false;
    this.escapePressedFrame = false;
    return {
      moveX,
      moveY,
      jumpHeld,
      jumpPressed,
      rollHeld,
      interactPressed,
      inventoryTogglePressed,
      mapTogglePressed,
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
  }

  private matchesKey(event: KeyboardEvent, code: string, key: string) {
    return event.code === code || event.key.toLowerCase() === key;
  }

  private isPressed(code: string, key?: string) {
    return this.pressed.has(code) || (key ? this.pressed.has(key) : false);
  }
}
