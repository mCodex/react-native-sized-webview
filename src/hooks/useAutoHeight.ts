import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BRIDGE_MESSAGE_PREFIX,
  MAX_COMMITTED_HEIGHT,
} from '../constants/bridgeProtocol';

/**
 * Configuration options for the {@link useAutoHeight} hook.
 */
export interface UseAutoHeightOptions {
  /**
   * Minimum height (dp) enforced on the committed value. Defaults to `0`, which
   * means the hook returns `undefined` until the bridge reports a real height.
   *
   * The final committed value is always `max(minHeight, measuredHeight)`.
   */
  minHeight: number;

  /**
   * Optional callback fired after every committed height change (rAF-batched,
   * diff-thresholded). Never fires for ignored/invalid payloads.
   */
  onHeightChange?: (height: number) => void;
}

/**
 * Return value of {@link useAutoHeight}.
 */
export interface UseAutoHeightResult {
  /**
   * The current committed container height in dp.
   *
   * `undefined` when `minHeight === 0` and no valid measurement has been
   * received yet — the caller should not force a `height` style in that case
   * so the native WebView can lay itself out from its intrinsic content.
   */
  height: number | undefined;

  /**
   * Handler for raw `onMessage` payloads from `react-native-webview`.
   *
   * Accepts either the namespaced string the bridge emits
   * (`"__RN_SIZED_WV__:<number>"`) or a bare numeric value (kept for backward
   * compatibility with tests and custom integrations). Invalid, out-of-range,
   * or sub-threshold values are silently ignored.
   */
  setHeightFromPayload: (rawValue: unknown) => void;
}

/** Minimum pixel delta that triggers a re-render. Filters layout noise. */
const HEIGHT_DIFF_THRESHOLD = 1;

/**
 * Parses a raw payload into a positive finite pixel count, or `null` if the
 * value is unusable. Accepts the namespaced protocol string, plain numbers,
 * and numeric strings.
 */
const parseHeightPayload = (rawValue: unknown): number | null => {
  let candidate: unknown = rawValue;

  if (
    typeof candidate === 'string' &&
    candidate.startsWith(BRIDGE_MESSAGE_PREFIX)
  ) {
    candidate = candidate.slice(BRIDGE_MESSAGE_PREFIX.length);
  }

  const numericValue =
    typeof candidate === 'number' ? candidate : Number(candidate);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  if (numericValue > MAX_COMMITTED_HEIGHT) {
    return null;
  }

  return Math.ceil(numericValue);
};

/**
 * React hook that owns the WebView's container height state.
 *
 * - Initial value is `undefined` when `minHeight` is `0`, otherwise `minHeight`.
 * - Incoming payloads are validated, clamped to `MAX_COMMITTED_HEIGHT`, and
 *   rAF-batched to at most one commit per frame.
 * - Sub-`HEIGHT_DIFF_THRESHOLD` changes are dropped to avoid layout thrash.
 * - Pending frames are cancelled on unmount.
 */
export const useAutoHeight = (
  options: UseAutoHeightOptions
): UseAutoHeightResult => {
  const { minHeight, onHeightChange } = options;

  const [height, setHeight] = useState<number | undefined>(() =>
    minHeight > 0 ? minHeight : undefined
  );

  const lastHeightRef = useRef<number | undefined>(height);
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
      const parsed = parseHeightPayload(rawValue);
      if (parsed === null) {
        return;
      }

      const nextHeight = Math.max(minHeight, parsed);
      const lastHeight = lastHeightRef.current ?? 0;

      if (Math.abs(nextHeight - lastHeight) <= HEIGHT_DIFF_THRESHOLD) {
        return;
      }

      scheduleCommit(nextHeight);
    },
    [minHeight, scheduleCommit]
  );

  useEffect(() => {
    const lastHeight = lastHeightRef.current ?? 0;
    if (minHeight > lastHeight) {
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
