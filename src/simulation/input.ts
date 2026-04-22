export interface InputSnapshot {
  moveX: number;
  moveY: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  shiftPressed: boolean;
  mapTogglePressed: boolean;
  escapePressed: boolean;
}

export class InputController {
  private pressed = new Set<string>();
  private jumpPressedFrame = false;
  private shiftPressedFrame = false;
  private mapTogglePressedFrame = false;
  private escapePressedFrame = false;
  private disposeCallbacks: Array<() => void> = [];

  constructor(private readonly target: Window | HTMLElement = window) {
    const keydown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      if (!this.pressed.has(event.code) && event.code === "Space") {
        this.jumpPressedFrame = true;
      }
      if (!this.pressed.has(event.code) && (event.code === "ShiftLeft" || event.code === "ShiftRight")) {
        this.shiftPressedFrame = true;
      }
      if (!this.pressed.has(event.code) && event.code === "KeyM") {
        this.mapTogglePressedFrame = true;
      }
      if (!this.pressed.has(event.code) && event.code === "Escape") {
        this.escapePressedFrame = true;
      }
      this.pressed.add(event.code);
    };

    const keyup = (event: KeyboardEvent) => {
      this.pressed.delete(event.code);
    };

    this.target.addEventListener("keydown", keydown as EventListener);
    this.target.addEventListener("keyup", keyup as EventListener);
    this.disposeCallbacks.push(() => this.target.removeEventListener("keydown", keydown as EventListener));
    this.disposeCallbacks.push(() => this.target.removeEventListener("keyup", keyup as EventListener));
  }

  sample(): InputSnapshot {
    const moveX = (this.isPressed("KeyD") || this.isPressed("ArrowRight") ? 1 : 0) - (this.isPressed("KeyA") || this.isPressed("ArrowLeft") ? 1 : 0);
    const moveY = (this.isPressed("KeyW") || this.isPressed("ArrowUp") ? 1 : 0) - (this.isPressed("KeyS") || this.isPressed("ArrowDown") ? 1 : 0);
    const jumpHeld = this.isPressed("Space");
    const jumpPressed = this.jumpPressedFrame;
    const shiftPressed = this.shiftPressedFrame;
    const mapTogglePressed = this.mapTogglePressedFrame;
    const escapePressed = this.escapePressedFrame;
    this.jumpPressedFrame = false;
    this.shiftPressedFrame = false;
    this.mapTogglePressedFrame = false;
    this.escapePressedFrame = false;
    return { moveX, moveY, jumpHeld, jumpPressed, shiftPressed, mapTogglePressed, escapePressed };
  }

  dispose() {
    this.disposeCallbacks.forEach((callback) => callback());
  }

  private isPressed(code: string) {
    return this.pressed.has(code);
  }
}
