import type { PointerState, PointerCallback, WheelState, WheelCallback, PinchState, PinchCallback, KeyboardState, KeyboardCallback } from './types';

export class EventDispatcher {
  private container: HTMLElement;
  private subscribers: PointerCallback[] = [];
  private state: PointerState = { x: 0, y: 0, active: false, pointerType: '' };
  private boundPointermove: (e: PointerEvent) => void;
  private boundPointerleave: (e: PointerEvent) => void;
  private boundPointerdown: (e: PointerEvent) => void;
  private boundPointerup: (e: PointerEvent) => void;
  private boundPointercancel: (e: PointerEvent) => void;
  private wheelSubscribers: WheelCallback[] = [];
  private wheelState: WheelState = { x: 0, y: 0, deltaY: 0 };
  private currentWheelEvent: WheelEvent | null = null;
  private boundWheel: (e: WheelEvent) => void;
  private pinchSubscribers: PinchCallback[] = [];
  private pinchState: PinchState = { centerX: 0, centerY: 0, scale: 1 };
  private pinchPointers: Map<number, { x: number; y: number }> = new Map();
  private pinchStartDistance: number = 0;
  private isPinching: boolean = false;
  private wasPinching: boolean = false;
  private originalTouchAction: string = '';
  private touchActionOverridden: boolean = false;
  private keyboardSubscribers: KeyboardCallback[] = [];
  private keyboardState: KeyboardState = { key: '' };
  private boundKeydown: (e: KeyboardEvent) => void;
  private boundBlur: () => void;

  constructor(container: HTMLElement, options?: { disableTouchAction?: boolean }) {
    if (!(container instanceof HTMLElement)) {
      throw new Error('EventDispatcher: container element is required');
    }

    this.container = container;

    if (options?.disableTouchAction) {
      this.originalTouchAction = container.style.touchAction;
      container.style.touchAction = 'none';
      this.touchActionOverridden = true;
    }

    this.boundPointermove = (e: PointerEvent) => this.handlePointermove(e);
    this.boundPointerleave = (e: PointerEvent) => this.handlePointerleave(e);
    this.boundPointerdown = (e: PointerEvent) => this.handlePointerdown(e);
    this.boundPointerup = (e: PointerEvent) => this.handlePointerup(e);
    this.boundPointercancel = (e: PointerEvent) => this.handlePointerup(e);
    this.boundWheel = (e: WheelEvent) => this.handleWheel(e);
    this.boundKeydown = (e: KeyboardEvent) => this.handleKeydown(e);
    this.boundBlur = () => this.handleBlur();

    container.setAttribute('tabindex', '0');
    container.setAttribute('role', 'application');

    this.container.addEventListener('pointermove', this.boundPointermove);
    this.container.addEventListener('pointerleave', this.boundPointerleave);
    this.container.addEventListener('pointerdown', this.boundPointerdown);
    this.container.addEventListener('pointerup', this.boundPointerup);
    this.container.addEventListener('pointercancel', this.boundPointercancel);
    this.container.addEventListener('wheel', this.boundWheel, { passive: false });
    this.container.addEventListener('keydown', this.boundKeydown);
    this.container.addEventListener('blur', this.boundBlur);
  }

  subscribe(callback: PointerCallback): () => void {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx !== -1) this.subscribers.splice(idx, 1);
    };
  }

  subscribeWheel(callback: WheelCallback): () => void {
    this.wheelSubscribers.push(callback);
    return () => {
      const idx = this.wheelSubscribers.indexOf(callback);
      if (idx !== -1) this.wheelSubscribers.splice(idx, 1);
    };
  }

  subscribePinch(callback: PinchCallback): () => void {
    this.pinchSubscribers.push(callback);
    return () => {
      const idx = this.pinchSubscribers.indexOf(callback);
      if (idx !== -1) this.pinchSubscribers.splice(idx, 1);
    };
  }

  subscribeKeyboard(callback: KeyboardCallback): () => void {
    this.keyboardSubscribers.push(callback);
    return () => {
      const idx = this.keyboardSubscribers.indexOf(callback);
      if (idx !== -1) this.keyboardSubscribers.splice(idx, 1);
    };
  }

  preventWheel(): void {
    this.currentWheelEvent?.preventDefault();
  }

  destroy(): void {
    this.container.removeEventListener('pointermove', this.boundPointermove);
    this.container.removeEventListener('pointerleave', this.boundPointerleave);
    this.container.removeEventListener('pointerdown', this.boundPointerdown);
    this.container.removeEventListener('pointerup', this.boundPointerup);
    this.container.removeEventListener('pointercancel', this.boundPointercancel);
    this.container.removeEventListener('wheel', this.boundWheel);
    this.container.removeEventListener('keydown', this.boundKeydown);
    this.container.removeEventListener('blur', this.boundBlur);
    this.subscribers.length = 0;
    this.wheelSubscribers.length = 0;
    this.pinchSubscribers.length = 0;
    this.keyboardSubscribers.length = 0;
    this.pinchPointers.clear();
    this.isPinching = false;
    this.wasPinching = false;
    if (this.touchActionOverridden) {
      this.container.style.touchAction = this.originalTouchAction;
    }
  }

  private handlePointermove(e: PointerEvent): void {
    this.state.x = e.offsetX;
    this.state.y = e.offsetY;
    this.state.pointerType = e.pointerType;

    if (this.isPinching && e.pointerType === 'touch' && this.pinchPointers.has(e.pointerId)) {
      this.pinchPointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      const iter = this.pinchPointers.values();
      const p1 = iter.next().value!;
      const p2 = iter.next().value!;
      const newDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (this.pinchStartDistance === 0) {
        this.pinchStartDistance = newDistance;
        this.state.active = false;
        this.notify();
        return;
      }
      const scale = newDistance / this.pinchStartDistance;
      this.pinchState.centerX = (p1.x + p2.x) / 2;
      this.pinchState.centerY = (p1.y + p2.y) / 2;
      this.pinchState.scale = scale;
      try {
        this.notifyPinch();
      } finally {
        this.pinchStartDistance = newDistance;
        this.state.active = false;
        this.notify();
      }
      return;
    }

    // Suppress crosshair for remaining touch finger after pinch ends
    if (this.wasPinching && e.pointerType === 'touch') {
      this.state.active = false;
    } else {
      this.state.active = true;
    }
    this.notify();
  }

  private handlePointerleave(e: PointerEvent): void {
    this.state.x = e.offsetX;
    this.state.y = e.offsetY;
    this.state.pointerType = e.pointerType;
    this.state.active = false;
    this.notify();
  }

  private handlePointerdown(e: PointerEvent): void {
    this.state.x = e.offsetX;
    this.state.y = e.offsetY;
    this.state.pointerType = e.pointerType;
    this.state.active = true;
    this.notify();

    if (e.pointerType === 'touch') {
      try { this.container.setPointerCapture(e.pointerId); } catch { /* may not be supported */ }
      if (this.pinchPointers.size < 2) {
        this.pinchPointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        if (this.pinchPointers.size === 2) {
          const iter = this.pinchPointers.values();
          const p1 = iter.next().value!;
          const p2 = iter.next().value!;
          this.pinchStartDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          this.isPinching = true;
        }
      }
    }
  }

  private handlePointerup(e: PointerEvent): void {
    this.state.x = e.offsetX;
    this.state.y = e.offsetY;
    this.state.pointerType = e.pointerType;
    this.state.active = false;

    if (e.pointerType === 'touch') {
      try { this.container.releasePointerCapture(e.pointerId); } catch { /* may already be released */ }
      this.pinchPointers.delete(e.pointerId);
      if (this.isPinching && this.pinchPointers.size < 2) {
        this.isPinching = false;
        this.wasPinching = true;
        this.pinchStartDistance = 0;
        this.pinchPointers.clear();
      }
      if (this.pinchPointers.size === 0) {
        this.wasPinching = false;
      }
    }

    this.notify();
  }

  private handleWheel(e: WheelEvent): void {
    this.currentWheelEvent = e;
    this.wheelState.x = e.offsetX;
    this.wheelState.y = e.offsetY;
    this.wheelState.deltaY = e.deltaY;
    try {
      this.notifyWheel();
    } finally {
      this.currentWheelEvent = null;
    }
  }

  private notify(): void {
    for (let i = 0; i < this.subscribers.length; i++) {
      const cb = this.subscribers[i];
      if (cb) cb(this.state);
    }
  }

  private notifyWheel(): void {
    for (let i = 0; i < this.wheelSubscribers.length; i++) {
      const cb = this.wheelSubscribers[i];
      if (cb) cb(this.wheelState);
    }
  }

  private notifyPinch(): void {
    for (let i = 0; i < this.pinchSubscribers.length; i++) {
      const cb = this.pinchSubscribers[i];
      if (cb) cb(this.pinchState);
    }
  }

  private handleKeydown(e: KeyboardEvent): void {
    const key = e.key;
    const handled = key === 'ArrowLeft' || key === 'ArrowRight' ||
      key === '+' || key === '=' || key === '-';
    if (!handled) return;

    e.preventDefault();
    this.keyboardState.key = key;
    this.notifyKeyboard();
  }

  private handleBlur(): void {
    this.state.active = false;
    this.notify();
  }

  private notifyKeyboard(): void {
    for (let i = 0; i < this.keyboardSubscribers.length; i++) {
      const cb = this.keyboardSubscribers[i];
      if (cb) cb(this.keyboardState);
    }
  }
}
