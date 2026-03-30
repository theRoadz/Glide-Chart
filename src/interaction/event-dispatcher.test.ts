import { EventDispatcher } from './event-dispatcher';
import type { PointerState } from './types';

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

    // 5 listeners registered: pointermove, pointerleave, pointerdown, pointerup, pointercancel
    expect(addSpy).toHaveBeenCalledTimes(5);

    dispatcher.destroy();

    expect(removeSpy).toHaveBeenCalledTimes(5);
    expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerleave', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));

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
});
