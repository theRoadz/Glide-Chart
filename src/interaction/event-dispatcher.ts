import type { PointerState, PointerCallback, WheelState, WheelCallback } from './types';

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

  constructor(container: HTMLElement) {
    if (!(container instanceof HTMLElement)) {
      throw new Error('EventDispatcher: container element is required');
    }

    this.container = container;

    this.boundPointermove = (e: PointerEvent) => this.handlePointermove(e);
    this.boundPointerleave = (e: PointerEvent) => this.handlePointerleave(e);
    this.boundPointerdown = (e: PointerEvent) => this.handlePointerdown(e);
    this.boundPointerup = (e: PointerEvent) => this.handlePointerup(e);
    this.boundPointercancel = (e: PointerEvent) => this.handlePointerup(e);
    this.boundWheel = (e: WheelEvent) => this.handleWheel(e);

    this.container.addEventListener('pointermove', this.boundPointermove);
    this.container.addEventListener('pointerleave', this.boundPointerleave);
    this.container.addEventListener('pointerdown', this.boundPointerdown);
    this.container.addEventListener('pointerup', this.boundPointerup);
    this.container.addEventListener('pointercancel', this.boundPointercancel);
    this.container.addEventListener('wheel', this.boundWheel, { passive: false });
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
    this.subscribers.length = 0;
    this.wheelSubscribers.length = 0;
  }

  private handlePointermove(e: PointerEvent): void {
    this.state.x = e.offsetX;
    this.state.y = e.offsetY;
    this.state.pointerType = e.pointerType;
    this.state.active = true;
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
  }

  private handlePointerup(e: PointerEvent): void {
    this.state.x = e.offsetX;
    this.state.y = e.offsetY;
    this.state.pointerType = e.pointerType;
    this.state.active = false;
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
}
