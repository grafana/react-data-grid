import type { EffectCallback, RefObject } from 'react';

const mocks = vi.hoisted(() => {
  const effects: EffectCallback[] = [];
  const listeners: (() => void)[] = [];
  const snapshots: (() => unknown)[] = [];
  return { effects, listeners, snapshots };
});

vi.mock(import('react'), () => ({
  useCallback: <T>(callback: T) => callback,
  useLayoutEffect: vi.fn((effect: EffectCallback) => {
    mocks.effects.push(effect);
  }),
  useSyncExternalStore: captureStore
}));

function captureStore<T>(subscribe: (listener: () => void) => void, snapshot: () => T) {
  const listener = vi.fn();
  mocks.listeners.push(listener);
  mocks.snapshots.push(snapshot);
  subscribe(listener);
  return snapshot();
}

test('defers resize notifications, coalesces sizes, and cancels work for removed grids', async () => {
  let notify!: ResizeObserverCallback;
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        notify = callback;
      }
      observe = vi.fn();
      unobserve = vi.fn();
    }
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame++;
    frames.set(nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));

  try {
    const { useGridDimensions } = await import('../../src/hooks/useGridDimensions');
    const first = {
      current: { clientWidth: 100, clientHeight: 100 }
    } as unknown as RefObject<HTMLDivElement>;
    const second = {
      current: { clientWidth: 200, clientHeight: 200 }
    } as unknown as RefObject<HTMLDivElement>;
    useGridDimensions(first);
    useGridDimensions(second);
    const cleanupFirst = mocks.effects[0]();
    const cleanupSecond = mocks.effects[1]();
    expect(mocks.snapshots[0]()).toStrictEqual({ inlineSize: 100, blockSize: 100 });
    vi.mocked(mocks.listeners[0]).mockClear();

    const resize = (ref: RefObject<HTMLDivElement>, height: number) => {
      notify(
        [
          {
            target: ref.current,
            contentBoxSize: [{ inlineSize: 100, blockSize: height }]
          }
        ] as unknown as ResizeObserverEntry[],
        null as unknown as ResizeObserver
      );
    };

    resize(first, 120);
    resize(first, 140);
    resize(second, 160);
    expect(mocks.listeners[0]).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    cleanupSecond?.();
    const callback = [...frames.values()][0];
    frames.clear();
    callback(0);
    expect(mocks.snapshots[0]()).toStrictEqual({ inlineSize: 100, blockSize: 140 });
    expect(mocks.listeners[0]).toHaveBeenCalledOnce();
    expect(mocks.snapshots[1]()).toStrictEqual({ inlineSize: 200, blockSize: 200 });

    resize(first, 180);
    expect(frames.size).toBe(1);
    cleanupFirst?.();
    expect(frames.size).toBe(0);
    resize(first, 190);
    expect(frames.size).toBe(0);
  } finally {
    vi.unstubAllGlobals();
  }
});
