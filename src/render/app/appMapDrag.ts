export class MapDragController {
  private pointerId: number | null = null;
  private x = 0;
  private y = 0;

  begin(event: PointerEvent, target: HTMLElement) {
    event.preventDefault();
    this.pointerId = event.pointerId;
    this.x = event.clientX;
    this.y = event.clientY;
    target.setPointerCapture?.(event.pointerId);
  }

  move(event: PointerEvent, onDrag: (deltaX: number, deltaY: number) => void) {
    if (this.pointerId !== event.pointerId) {
      return false;
    }

    const deltaX = event.clientX - this.x;
    const deltaY = event.clientY - this.y;
    this.x = event.clientX;
    this.y = event.clientY;
    onDrag(deltaX, deltaY);
    return true;
  }

  end(event: PointerEvent, target: HTMLElement) {
    if (this.pointerId !== event.pointerId) {
      return false;
    }

    this.pointerId = null;
    try {
      target.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can already be released if the browser cancels a drag.
    }
    return true;
  }

  cancel() {
    this.pointerId = null;
  }
}
