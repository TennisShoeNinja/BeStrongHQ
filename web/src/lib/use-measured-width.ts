import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks the padding-box width (clientWidth) of an element via ResizeObserver.
 *
 * Returns a ref callback to attach to the element you want to measure and
 * the latest observed width in pixels (0 until first measured). clientWidth
 * includes the element's own padding but excludes borders and any scrollbar,
 * and is reported consistently on the initial measure and every resize, so
 * callers can subtract a known padding to get the usable inner width.
 *
 * Used by the share dialogs to scale a fixed-native-width preview card down
 * to whatever width is actually available, so the preview fits on phones
 * instead of overflowing at a hardcoded desktop size.
 */
export function useMeasuredWidth(): [(node: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(() => {
      setWidth(node.clientWidth);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, width];
}
