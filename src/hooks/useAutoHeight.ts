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
   * Accepts only the namespaced string the bridge emits
   * (`"__RN_SIZED_WV__:<number>"`) or a raw `number` (useful for direct /
   * programmatic calls from tests and custom integrations). Bare numeric
   * strings, invalid values, and out-of-range values are silently ignored —
   * this is what prevents user-land `postMessage('123')` from mutating the
   * container height.
   */
  setHeightFromPayload: (rawValue: unknown) => void;
}

/** Minimum pixel delta that triggers a re-render. Filters layout noise. */
const HEIGHT_DIFF_THRESHOLD = 1;

/**
 * Parses a raw payload into a positive finite pixel count, or `null` if the
 * value is unusable.
 *
 * Accepts:
 * - `number` values (direct/programmatic calls — never reach the WebView).
 * - Strings starting with {@link BRIDGE_MESSAGE_PREFIX} whose suffix is a
 *   non-empty run of ASCII digits (the only shape the bridge ever emits:
 *   `MESSAGE_PREFIX + String(Math.ceil(height))`).
 *
 * Bare numeric strings (e.g. `'360'`) are rejected: only the namespaced
 * bridge protocol is trusted, so user-land `postMessage('123')` cannot mutate
 * the container height.
 *
 * Decimals (`12.5`), hex (`0x100`), exponential (`1e10`), and
 * whitespace-padded inputs are also rejected — `Number()` would silently
 * coerce them, but the bridge never produces such payloads, so anything
 * matching those shapes is treated as a tampered/forged message.
 */
const BRIDGE_NUMBER_PATTERN = /^\d+$/;

const parseHeightPayload = (rawValue: unknown): number | null => {
  let numericValue: number;

  if (typeof rawValue === 'number') {
    numericValue = rawValue;
  } else if (
    typeof rawValue === 'string' &&
    rawValue.startsWith(BRIDGE_MESSAGE_PREFIX)
  ) {
    const suffix = rawValue.slice(BRIDGE_MESSAGE_PREFIX.length);
    if (!BRIDGE_NUMBER_PATTERN.test(suffix)) {
      return null;
    }
    numericValue = Number(suffix);
  } else {
    return null;
  }

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
 * @remarks
 * - Initial value is `undefined` when `minHeight` is `0`, otherwise `minHeight`.
 * - Incoming payloads are validated, clamped to `MAX_COMMITTED_HEIGHT`, and
 *   rAF-batched to at most one commit per frame.
 * - Sub-`HEIGHT_DIFF_THRESHOLD` changes are dropped to avoid layout thrash.
 * - Pending frames are cancelled on unmount.
 *
 * Use this hook directly when you need to drive the auto-sizing pipeline
 * yourself (e.g. wrapping a custom WebView component). Otherwise prefer the
 * pre-wired {@link SizedWebView} component.
 *
 * @param options - See {@link UseAutoHeightOptions}.
 * @returns `{ height, setHeightFromPayload }` — see {@link UseAutoHeightResult}.
 *
 * @example
 * ```tsx
 * import { View } from 'react-native';
 * import { WebView } from 'react-native-webview';
 * import { AUTO_HEIGHT_BRIDGE, useAutoHeight } from 'react-native-sized-webview';
 *
 * function CustomSizedView({ html }: { html: string }) {
 *   const { height, setHeightFromPayload } = useAutoHeight({ minHeight: 0 });
 *   return (
 *     <View style={{ height }}>
 *       <WebView
 *         source={{ html }}
 *         injectedJavaScriptBeforeContentLoaded={AUTO_HEIGHT_BRIDGE}
 *         onMessage={(e) => setHeightFromPayload(e.nativeEvent.data)}
 *       />
 *     </View>
 *   );
 * }
 * ```
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
