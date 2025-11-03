import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAutoHeightOptions {
  /** Minimum height (in dp) enforced for the WebView container. */
  minHeight: number;
  /** Optional callback triggered whenever a new height is committed. */
  onHeightChange?: (height: number) => void;
}

export interface UseAutoHeightResult {
  /** Current height applied to the WebView container. */
  height: number;
  /**
   * Helper that parses any incoming payload (from the WebView bridge) and
   * commits a new height when appropriate.
   */
  setHeightFromPayload: (rawValue: unknown) => void;
}

const HEIGHT_DIFF_THRESHOLD = 1;

/**
 * React hook encapsulating the logic for tracking and updating the WebView height.
 * Ensures we avoid unnecessary renders while keeping the implementation testable.
 */
export const useAutoHeight = (
  options: UseAutoHeightOptions
): UseAutoHeightResult => {
  const { minHeight, onHeightChange } = options;

  const [height, setHeight] = useState(() => Math.max(minHeight, 1));

  const lastHeightRef = useRef(height);

  const frameRef = useRef<number | null>(null);

  const pendingHeightRef = useRef<number | undefined>(undefined);

  const commitHeight = useCallback(
    (nextHeight: number) => {
      lastHeightRef.current = nextHeight;
      setHeight(nextHeight);
      onHeightChange?.(nextHeight);
    },
    [onHeightChange]
  );

  const flushPendingHeight = useCallback(() => {
    frameRef.current = null;

    const pending = pendingHeightRef.current;

    pendingHeightRef.current = undefined;

    if (typeof pending === 'number') {
      commitHeight(pending);
    }
  }, [commitHeight]);

  const scheduleCommit = useCallback(
    (nextHeight: number) => {
      pendingHeightRef.current = nextHeight;

      if (frameRef.current != null) {
        return;
      }

      const request = globalThis.requestAnimationFrame;
      if (typeof request === 'function') {
        frameRef.current = request(() => {
          flushPendingHeight();
        });
        return;
      }

      flushPendingHeight();
    },
    [flushPendingHeight]
  );

  const setHeightFromPayload = useCallback(
    (rawValue: unknown) => {
      const numericValue =
        typeof rawValue === 'number' ? rawValue : Number(rawValue);

      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return;
      }

      const nextHeight = Math.max(minHeight, Math.ceil(numericValue));

      if (
        Math.abs(nextHeight - lastHeightRef.current) <= HEIGHT_DIFF_THRESHOLD
      ) {
        return;
      }

      scheduleCommit(nextHeight);
    },
    [minHeight, scheduleCommit]
  );

  useEffect(() => {
    if (minHeight > lastHeightRef.current) {
      scheduleCommit(Math.ceil(minHeight));
    }
  }, [minHeight, scheduleCommit]);

  useEffect(() => {
    return () => {
      const cancel = globalThis.cancelAnimationFrame;
      if (typeof cancel === 'function' && frameRef.current != null) {
        cancel(frameRef.current);
      }
    };
  }, []);

  return {
    height,
    setHeightFromPayload,
  };
};
