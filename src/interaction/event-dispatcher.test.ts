import { EventDispatcher } from './event-dispatcher';
import type { PointerState, WheelState, PinchState } from './types';

function createContainer(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function dispatchPointer(
  el: HTMLElement,
  type: string,
  options: Partial<PointerEventInit & { offsetX: number; offsetY: number }> = {},
): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    pointerType: options.pointerType ?? 'mouse',
    ...options,
  });
  // jsdom doesn't support offsetX/offsetY on PointerEvent constructor — define them
  Object.defineProperty(event, 'offsetX', { value: options.offsetX ?? 0 });
  Object.defineProperty(event, 'offsetY', { value: options.offsetY ?? 0 });
  el.dispatchEvent(event);
}

describe('EventDispatcher', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it('throws if container is not an HTMLElement', () => {
    expect(() => new EventDispatcher(null as unknown as HTMLElement)).toThrow(
      'EventDispatcher: container element is required',
    );
  });

  it('dispatches normalised coordinates to subscribers on pointermove', () => {
    const dispatcher = new EventDispatcher(container);
    const received: PointerState[] = [];
    dispatcher.subscribe((state) => {
      received.push({ ...state });
    });

    dispatchPointer(container, 'pointermove', { offsetX: 100, offsetY: 200, pointerType: 'mouse' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      x: 100,
      y: 200,
      active: true,
      pointerType: 'mouse',
    });

    dispatcher.destroy();
  });

  it('sets active=false and notifies on pointerleave', () => {
    const dispatcher = new EventDispatcher(container);
    const received: PointerState[] = [];
    dispatcher.subscribe((state) => {
      received.push({ ...state });
    });

    dispatchPointer(container, 'pointerleave', { offsetX: 50, offsetY: 60 });

    expect(received).toHaveLength(1);
    expect(received[0]!.active).toBe(false);
    expect(received[0]!.x).toBe(50);
    expect(received[0]!.y).toBe(60);

    dispatcher.destroy();
  });

  it('handles touch events (pointerType === "touch") identically', () => {
    const dispatcher = new EventDispatcher(container);
    const received: PointerState[] = [];
    dispatcher.subscribe((state) => {
      received.push({ ...state });
    });

    dispatchPointer(container, 'pointermove', { offsetX: 30, offsetY: 40, pointerType: 'touch' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      x: 30,
      y: 40,
      active: true,
      pointerType: 'touch',
    });

    dispatcher.destroy();
  });

  it('removes all event listeners on destroy', () => {
    const addSpy = vi.spyOn(container, 'addEventListener');
    const removeSpy = vi.spyOn(container, 'removeEventListener');
    const dispatcher = new EventDispatcher(container);

    // 6 listeners registered: pointermove, pointerleave, pointerdown, pointerup, pointercancel, wheel
    expect(addSpy).toHaveBeenCalledTimes(6);

    dispatcher.destroy();

    expect(removeSpy).toHaveBeenCalledTimes(6);
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerleave', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));

    // After destroy, events should not trigger subscribers
    const received: PointerState[] = [];
    dispatcher.subscribe((state) => {
      received.push({ ...state });
    });
    dispatchPointer(container, 'pointermove', { offsetX: 10, offsetY: 20 });
    // Subscriber was added after destroy so subscribers array was cleared
    expect(received).toHaveLength(0);
  });

  it('notifies all subscribers on each update', () => {
    const dispatcher = new EventDispatcher(container);
    const results1: PointerState[] = [];
    const results2: PointerState[] = [];
    dispatcher.subscribe((state) => results1.push({ ...state }));
    dispatcher.subscribe((state) => results2.push({ ...state }));

    dispatchPointer(container, 'pointermove', { offsetX: 5, offsetY: 10 });

    expect(results1).toHaveLength(1);
    expect(results2).toHaveLength(1);
    expect(results1[0]!.x).toBe(5);
    expect(results2[0]!.x).toBe(5);

    dispatcher.destroy();
  });

  it('pointerdown sets active=true and enables subsequent tracking on touch', () => {
    const dispatcher = new EventDispatcher(container);
    const received: PointerState[] = [];
    dispatcher.subscribe((state) => {
      received.push({ ...state });
    });

    dispatchPointer(container, 'pointerdown', {
      offsetX: 70,
      offsetY: 80,
      pointerType: 'touch',
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      x: 70,
      y: 80,
      active: true,
      pointerType: 'touch',
    });

    // Subsequent pointermove should also fire
    dispatchPointer(container, 'pointermove', {
      offsetX: 75,
      offsetY: 85,
      pointerType: 'touch',
    });

    expect(received).toHaveLength(2);
    expect(received[1]!.active).toBe(true);
    expect(received[1]!.x).toBe(75);

    dispatcher.destroy();
  });

  it('pointerup sets active=false (touch end hides crosshair)', () => {
    const dispatcher = new EventDispatcher(container);
    const received: PointerState[] = [];
    dispatcher.subscribe((state) => {
      received.push({ ...state });
    });

    dispatchPointer(container, 'pointerdown', {
      offsetX: 70,
      offsetY: 80,
      pointerType: 'touch',
    });
    dispatchPointer(container, 'pointerup', {
      offsetX: 70,
      offsetY: 80,
      pointerType: 'touch',
    });

    expect(received).toHaveLength(2);
    expect(received[0]!.active).toBe(true);
    expect(received[1]!.active).toBe(false);

    dispatcher.destroy();
  });

  it('pointercancel sets active=false', () => {
    const dispatcher = new EventDispatcher(container);
    const received: PointerState[] = [];
    dispatcher.subscribe((state) => {
      received.push({ ...state });
    });

    dispatchPointer(container, 'pointerdown', {
      offsetX: 10,
      offsetY: 20,
      pointerType: 'touch',
    });
    dispatchPointer(container, 'pointercancel', {
      offsetX: 10,
      offsetY: 20,
      pointerType: 'touch',
    });

    expect(received).toHaveLength(2);
    expect(received[1]!.active).toBe(false);

    dispatcher.destroy();
  });

  it('subscribe returns an unsubscribe function', () => {
    const dispatcher = new EventDispatcher(container);
    const received: PointerState[] = [];
    const unsub = dispatcher.subscribe((state) => {
      received.push({ ...state });
    });

    dispatchPointer(container, 'pointermove', { offsetX: 1, offsetY: 2 });
    expect(received).toHaveLength(1);

    unsub();

    dispatchPointer(container, 'pointermove', { offsetX: 3, offsetY: 4 });
    expect(received).toHaveLength(1);

    dispatcher.destroy();
  });

  it('reuses the same PointerState object (no allocations per event)', () => {
    const dispatcher = new EventDispatcher(container);
    const stateRefs: Readonly<PointerState>[] = [];
    dispatcher.subscribe((state) => {
      stateRefs.push(state);
    });

    dispatchPointer(container, 'pointermove', { offsetX: 1, offsetY: 2 });
    dispatchPointer(container, 'pointermove', { offsetX: 3, offsetY: 4 });

    // Both callbacks should receive the same object reference (mutated in place)
    expect(stateRefs[0]).toBe(stateRefs[1]);

    dispatcher.destroy();
  });

  describe('wheel events', () => {
    function dispatchWheel(
      el: HTMLElement,
      options: { offsetX?: number; offsetY?: number; deltaY?: number } = {},
    ): WheelEvent {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        deltaY: options.deltaY ?? 0,
      });
      Object.defineProperty(event, 'offsetX', { value: options.offsetX ?? 0 });
      Object.defineProperty(event, 'offsetY', { value: options.offsetY ?? 0 });
      el.dispatchEvent(event);
      return event;
    }

    it('dispatches WheelState with correct x, y, deltaY to wheel subscribers', () => {
      const dispatcher = new EventDispatcher(container);
      const received: WheelState[] = [];
      dispatcher.subscribeWheel((state) => {
        received.push({ ...state });
      });

      dispatchWheel(container, { offsetX: 100, offsetY: 200, deltaY: -120 });

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ x: 100, y: 200, deltaY: -120 });

      dispatcher.destroy();
    });

    it('multiple wheel subscribers all receive updates', () => {
      const dispatcher = new EventDispatcher(container);
      const results1: WheelState[] = [];
      const results2: WheelState[] = [];
      dispatcher.subscribeWheel((state) => results1.push({ ...state }));
      dispatcher.subscribeWheel((state) => results2.push({ ...state }));

      dispatchWheel(container, { offsetX: 50, offsetY: 60, deltaY: 100 });

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
      expect(results1[0]!.deltaY).toBe(100);
      expect(results2[0]!.deltaY).toBe(100);

      dispatcher.destroy();
    });

    it('subscribeWheel returns unsubscribe function that removes subscriber', () => {
      const dispatcher = new EventDispatcher(container);
      const received: WheelState[] = [];
      const unsub = dispatcher.subscribeWheel((state) => {
        received.push({ ...state });
      });

      dispatchWheel(container, { deltaY: -10 });
      expect(received).toHaveLength(1);

      unsub();

      dispatchWheel(container, { deltaY: -20 });
      expect(received).toHaveLength(1);

      dispatcher.destroy();
    });

    it('preventWheel() calls preventDefault on the current WheelEvent during subscriber notification', () => {
      const dispatcher = new EventDispatcher(container);
      let preventDefaultCalled = false;

      dispatcher.subscribeWheel(() => {
        dispatcher.preventWheel();
      });

      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'offsetX', { value: 0 });
      Object.defineProperty(event, 'offsetY', { value: 0 });
      vi.spyOn(event, 'preventDefault').mockImplementation(() => {
        preventDefaultCalled = true;
      });
      container.dispatchEvent(event);

      expect(preventDefaultCalled).toBe(true);

      dispatcher.destroy();
    });

    it('preventWheel() is a no-op when called outside of a wheel event', () => {
      const dispatcher = new EventDispatcher(container);
      // Should not throw
      expect(() => dispatcher.preventWheel()).not.toThrow();
      dispatcher.destroy();
    });

    it('destroy removes wheel event listener', () => {
      const removeSpy = vi.spyOn(container, 'removeEventListener');
      const dispatcher = new EventDispatcher(container);
      dispatcher.destroy();

      expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function));

      // After destroy, wheel events should not trigger subscribers
      const received: WheelState[] = [];
      dispatcher.subscribeWheel((state) => {
        received.push({ ...state });
      });
      dispatchWheel(container, { deltaY: 50 });
      expect(received).toHaveLength(0);
    });

    it('wheel listener registered with passive: false', () => {
      const addSpy = vi.spyOn(container, 'addEventListener');
      const dispatcher = new EventDispatcher(container);

      const wheelCall = addSpy.mock.calls.find((call) => call[0] === 'wheel');
      expect(wheelCall).toBeDefined();
      expect(wheelCall![2]).toEqual({ passive: false });

      dispatcher.destroy();
    });

    it('reuses the same WheelState object (no allocations per event)', () => {
      const dispatcher = new EventDispatcher(container);
      const stateRefs: Readonly<WheelState>[] = [];
      dispatcher.subscribeWheel((state) => {
        stateRefs.push(state);
      });

      dispatchWheel(container, { offsetX: 1, offsetY: 2, deltaY: -10 });
      dispatchWheel(container, { offsetX: 3, offsetY: 4, deltaY: 10 });

      expect(stateRefs[0]).toBe(stateRefs[1]);

      dispatcher.destroy();
    });
  });

  describe('pinch events', () => {
    function mockPointerCapture(el: HTMLElement): void {
      el.setPointerCapture = vi.fn();
      el.releasePointerCapture = vi.fn();
    }

    function dispatchTouch(
      el: HTMLElement,
      type: string,
      pointerId: number,
      offsetX: number,
      offsetY: number,
    ): void {
      dispatchPointer(el, type, { pointerType: 'touch', pointerId, offsetX, offsetY });
    }

    it('two touch pointerdown events start pinch tracking', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);

      // Move to trigger pinch callback
      dispatchTouch(container, 'pointermove', 2, 250, 100);

      expect(received.length).toBeGreaterThanOrEqual(1);
      dispatcher.destroy();
    });

    it('pinch pointermove dispatches PinchState with correct centerX, centerY, and scale', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      // Two fingers 100px apart
      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);
      // Spread to 150px apart (move finger 2 to 250)
      dispatchTouch(container, 'pointermove', 2, 250, 100);

      expect(received).toHaveLength(1);
      expect(received[0]!.centerX).toBe((100 + 250) / 2); // 175
      expect(received[0]!.centerY).toBe((100 + 100) / 2); // 100
      // New distance = 150, start distance = 100, scale = 1.5
      expect(received[0]!.scale).toBe(1.5);

      dispatcher.destroy();
    });

    it('pinch scale > 1 when fingers spread apart, < 1 when fingers move together', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);

      // Spread apart
      dispatchTouch(container, 'pointermove', 2, 300, 100);
      expect(received[0]!.scale).toBeGreaterThan(1);

      // Move together (relative to previous position — continuous delta)
      dispatchTouch(container, 'pointermove', 2, 150, 100);
      expect(received[1]!.scale).toBeLessThan(1);

      dispatcher.destroy();
    });

    it('pinch deactivates pointer state (active = false) to hide crosshair', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const pointerStates: PointerState[] = [];
      dispatcher.subscribe((state) => pointerStates.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);
      dispatchTouch(container, 'pointermove', 2, 250, 100);

      // The last notification should have active = false (crosshair hidden)
      const last = pointerStates[pointerStates.length - 1]!;
      expect(last.active).toBe(false);

      dispatcher.destroy();
    });

    it('pointerup during pinch ends pinch tracking', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);
      dispatchTouch(container, 'pointermove', 2, 250, 100);
      const countAfterPinch = received.length;

      // Lift one finger
      dispatchTouch(container, 'pointerup', 2, 250, 100);

      // Further moves should not trigger pinch
      dispatchTouch(container, 'pointermove', 1, 120, 100);
      expect(received.length).toBe(countAfterPinch);

      dispatcher.destroy();
    });

    it('pointercancel during pinch ends pinch tracking', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);
      dispatchTouch(container, 'pointermove', 2, 250, 100);
      const countAfterPinch = received.length;

      dispatchTouch(container, 'pointercancel', 2, 250, 100);

      dispatchTouch(container, 'pointermove', 1, 120, 100);
      expect(received.length).toBe(countAfterPinch);

      dispatcher.destroy();
    });

    it('mouse events do not trigger pinch (only pointerType === "touch")', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchPointer(container, 'pointerdown', { pointerType: 'mouse', pointerId: 1, offsetX: 100, offsetY: 100 });
      dispatchPointer(container, 'pointerdown', { pointerType: 'mouse', pointerId: 2, offsetX: 200, offsetY: 100 });
      dispatchPointer(container, 'pointermove', { pointerType: 'mouse', pointerId: 2, offsetX: 250, offsetY: 100 });

      expect(received).toHaveLength(0);

      dispatcher.destroy();
    });

    it('subscribePinch returns unsubscribe function that removes subscriber', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      const unsub = dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);
      dispatchTouch(container, 'pointermove', 2, 250, 100);
      expect(received).toHaveLength(1);

      unsub();

      dispatchTouch(container, 'pointermove', 2, 300, 100);
      expect(received).toHaveLength(1);

      dispatcher.destroy();
    });

    it('multiple pinch subscribers all receive updates', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const results1: PinchState[] = [];
      const results2: PinchState[] = [];
      dispatcher.subscribePinch((state) => results1.push({ ...state }));
      dispatcher.subscribePinch((state) => results2.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);
      dispatchTouch(container, 'pointermove', 2, 250, 100);

      expect(results1).toHaveLength(1);
      expect(results2).toHaveLength(1);
      expect(results1[0]!.scale).toBe(results2[0]!.scale);

      dispatcher.destroy();
    });

    it('destroy clears pinch tracking state and subscribers', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);

      dispatcher.destroy();

      // After destroy, no pinch events should fire
      dispatchTouch(container, 'pointermove', 2, 250, 100);
      expect(received).toHaveLength(0);
    });

    it('touch-action: none is set on container when disableTouchAction option is true and restored in destroy', () => {
      container.style.touchAction = 'auto';
      const dispatcher = new EventDispatcher(container, { disableTouchAction: true });

      expect(container.style.touchAction).toBe('none');

      dispatcher.destroy();

      expect(container.style.touchAction).toBe('auto');
    });

    it('touch-action is not modified when disableTouchAction option is not set', () => {
      container.style.touchAction = 'auto';
      const dispatcher = new EventDispatcher(container);

      expect(container.style.touchAction).toBe('auto');

      dispatcher.destroy();

      expect(container.style.touchAction).toBe('auto');
    });

    it('setPointerCapture is called on touch pointerdown', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);

      dispatchTouch(container, 'pointerdown', 42, 100, 100);

      expect(container.setPointerCapture).toHaveBeenCalledWith(42);

      dispatcher.destroy();
    });

    it('single touch pointer does not trigger pinch (need exactly 2)', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointermove', 1, 150, 100);

      expect(received).toHaveLength(0);

      dispatcher.destroy();
    });

    it('third touch pointer is ignored (pinch only tracks first 2)', () => {
      mockPointerCapture(container);
      const dispatcher = new EventDispatcher(container);
      const received: PinchState[] = [];
      dispatcher.subscribePinch((state) => received.push({ ...state }));

      dispatchTouch(container, 'pointerdown', 1, 100, 100);
      dispatchTouch(container, 'pointerdown', 2, 200, 100);
      dispatchTouch(container, 'pointerdown', 3, 300, 100);

      // Only 2 pointers tracked — third ignored
      dispatchTouch(container, 'pointermove', 3, 350, 100);
      // Pointer 3 is not in the map, so no pinch event
      expect(received).toHaveLength(0);

      // Existing 2 should still work
      dispatchTouch(container, 'pointermove', 2, 250, 100);
      expect(received).toHaveLength(1);

      dispatcher.destroy();
    });
  });
});
