import type { PointerState, PointerCallback } from './types';

export class EventDispatcher {
  private container: HTMLElement;
  private subscribers: PointerCallback[] = [];
  private state: PointerState = { x: 0, y: 0, active: false, pointerType: '' };
  private boundPointermove: (e: PointerEvent) => void;
  private boundPointerleave: (e: PointerEvent) => void;
  private boundPointerdown: (e: PointerEvent) => void;
  private boundPointerup: (e: PointerEvent) => void;
  private boundPointercancel: (e: PointerEvent) => void;

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

    this.container.addEventListener('pointermove', this.boundPointermove);
    this.container.addEventListener('pointerleave', this.boundPointerleave);
    this.container.addEventListener('pointerdown', this.boundPointerdown);
    this.container.addEventListener('pointerup', this.boundPointerup);
    this.container.addEventListener('pointercancel', this.boundPointercancel);
  }

  subscribe(callback: PointerCallback): () => void {
    this.subscribers.push(callback);
    return () => {
      const idx = this.subscribers.indexOf(callback);
      if (idx !== -1) this.subscribers.splice(idx, 1);
    };
  }

  destroy(): void {
    this.container.removeEventListener('pointermove', this.boundPointermove);
    this.container.removeEventListener('pointerleave', this.boundPointerleave);
    this.container.removeEventListener('pointerdown', this.boundPointerdown);
    this.container.removeEventListener('pointerup', this.boundPointerup);
    this.container.removeEventListener('pointercancel', this.boundPointercancel);
    this.subscribers.length = 0;
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

  private notify(): void {
    for (let i = 0; i < this.subscribers.length; i++) {
      const cb = this.subscribers[i];
      if (cb) cb(this.state);
    }
  }
}
