import { useCallback, useLayoutEffect, useSyncExternalStore, type RefObject } from 'react';

const initialSize: ResizeObserverSize = {
  inlineSize: 1,
  blockSize: 1
};

// use an unmanaged WeakMap so we preserve the cache even when
// the component partially unmounts via Suspense or Activity
const sizeMap = new WeakMap<RefObject<HTMLDivElement | null>, ResizeObserverSize>();
const targetToRefMap = new WeakMap<HTMLDivElement, RefObject<HTMLDivElement | null>>();
const subscribers = new Map<RefObject<HTMLDivElement | null>, () => void>();
const pendingSizes = new Map<HTMLDivElement, ResizeObserverSize>();
let animationFrame: number | null = null;

// don't break in Node.js (SSR), jsdom, and environments that don't support ResizeObserver
const resizeObserver =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  globalThis.ResizeObserver == null ? null : new ResizeObserver(resizeObserverCallback);

function resizeObserverCallback(entries: ResizeObserverEntry[]) {
  for (const entry of entries) {
    const target = entry.target as HTMLDivElement;

    if (targetToRefMap.has(target)) {
      pendingSizes.set(target, entry.contentBoxSize[0]);
    }
  }

  // Synchronous store notifications can change layout during ResizeObserver delivery.
  if (pendingSizes.size > 0 && animationFrame === null) {
    animationFrame = requestAnimationFrame(() => {
      animationFrame = null;
      const sizes = new Map(pendingSizes);
      pendingSizes.clear();
      for (const [target, size] of sizes) {
        const ref = targetToRefMap.get(target);
        if (ref !== undefined) {
          updateSize(ref, size);
        }
      }
    });
  }
}

function updateSize(ref: RefObject<HTMLDivElement | null>, size: ResizeObserverSize) {
  if (sizeMap.has(ref)) {
    const prevSize = sizeMap.get(ref)!;
    if (prevSize.inlineSize === size.inlineSize && prevSize.blockSize === size.blockSize) {
      return;
    }
  }

  sizeMap.set(ref, size);
  subscribers.get(ref)?.();
}

function getServerSnapshot(): ResizeObserverSize {
  return initialSize;
}

export function useGridDimensions(gridRef: React.RefObject<HTMLDivElement | null>) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      subscribers.set(gridRef, onStoreChange);

      return () => {
        subscribers.delete(gridRef);
      };
    },
    [gridRef]
  );

  const getSnapshot = useCallback((): ResizeObserverSize => {
    // ref.current is null during the initial render, when suspending, or in <Activity mode="hidden">.
    // We use ref as key instead to access stable values regardless of rendering state.
    return sizeMap.get(gridRef) ?? initialSize;
  }, [gridRef]);

  // We use `useSyncExternalStore` instead of `useState` to avoid tearing,
  // which can lead to flashing scrollbars.
  const { inlineSize, blockSize } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useLayoutEffect(() => {
    const target = gridRef.current!;

    targetToRefMap.set(target, gridRef);
    resizeObserver?.observe(target);

    if (!sizeMap.has(gridRef)) {
      updateSize(gridRef, {
        inlineSize: target.clientWidth,
        blockSize: target.clientHeight
      });
    }

    return () => {
      resizeObserver?.unobserve(target);
      targetToRefMap.delete(target);
      pendingSizes.delete(target);
      if (pendingSizes.size === 0 && animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };
  }, [gridRef]);

  return [inlineSize, blockSize] as const;
}
