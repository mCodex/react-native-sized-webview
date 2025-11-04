import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Configuration options for the useAutoHeight hook.
 *
 * @interface UseAutoHeightOptions
 */
export interface UseAutoHeightOptions {
  /**
   * Minimum height (in dp/points) enforced for the WebView container.
   *
   * Prevents the component from becoming too small when content is minimal.
   * The actual height will be: `max(minHeight, measuredContentHeight)`
   *
   * @default 0
   */
  minHeight: number;

  /**
   * Optional callback triggered whenever a new height is committed.
   *
   * This callback fires after the height has been validated, throttled by the
   * HEIGHT_DIFF_THRESHOLD, and scheduled for the next animation frame.
   *
   * Use this callback for:
   * - Analytics or logging height changes
   * - Triggering dependent UI updates
   * - Syncing with external state management
   *
   * The callback is not called for changes smaller than 1dp to avoid noise.
   *
   * @param height - The new committed height in dp/points
   *
   * @example
   * ```ts
   * onHeightChange={(height) => {
   *   analytics.track('webview_height_change', { height });
   * }}
   * ```
   */
  onHeightChange?: (height: number) => void;
}

/**
 * Return value from the useAutoHeight hook.
 *
 * @interface UseAutoHeightResult
 */
export interface UseAutoHeightResult {
  /**
   * The current height applied to the WebView container in dp/points.
   *
   * This value is:
   * - At least `minHeight` (respects minimum)
   * - Updated smoothly using requestAnimationFrame
   * - Batched to avoid excessive re-renders
   * - Only committed if change exceeds 1dp threshold
   *
   * @type {number}
   */
  height: number;

  /**
   * Parser and dispatcher for incoming height payloads from the WebView bridge.
   *
   * This function should be called with any data received from the injected JavaScript
   * bridge. It handles:
   * - Type coercion (number strings are converted to numbers)
   * - Validation (finite positive numbers only)
   * - Throttling (changes < 1dp are ignored)
   * - Scheduling (uses requestAnimationFrame for smooth updates)
   *
   * Safe to call with any value—invalid inputs are silently ignored.
   *
   * @param rawValue - Any value received from the WebView bridge
   *
   * @example
   * ```ts
   * const { height, setHeightFromPayload } = useAutoHeight({ minHeight: 100 });
   *
   * const handleMessage = (event) => {
   *   setHeightFromPayload(event.nativeEvent.data);
   * };
   * ```
   */
  setHeightFromPayload: (rawValue: unknown) => void;
}

/**
 * Threshold (in dp) below which height changes are ignored.
 *
 * Prevents excessive re-renders from minor content layout fluctuations.
 * @internal
 */
const HEIGHT_DIFF_THRESHOLD = 1;

/**
 * React hook for managing automatic WebView height calculation and updates.
 *
 * ## Overview
 * This hook encapsulates all the logic needed to:
 * 1. Track the WebView's content height
 * 2. Validate and normalize incoming height values
 * 3. Throttle updates to prevent layout thrashing
 * 4. Schedule updates on the next animation frame
 * 5. Invoke callbacks when height changes
 *
 * ## Features
 * - 🎯 Enforces minimum height to prevent shrinking below acceptable bounds
 * - ⚡ Batches updates using requestAnimationFrame for smooth 60fps rendering
 * - 🚫 Ignores changes smaller than 1dp to reduce noise
 * - 🔒 Type-safe with strong validation of incoming values
 * - 🧪 Fully testable with deterministic behavior
 * - 🧹 Automatically cleans up animation frame requests on unmount
 *
 * ## How it Works
 * ```
 * WebView Bridge sends height → setHeightFromPayload() validates
 *   → scheduleCommit() batches update
 *   → requestAnimationFrame executes flushPendingHeight()
 *   → commitHeight() updates state + callback
 * ```
 *
 * ## Usage Example
 * ```ts
 * import { useAutoHeight } from 'react-native-sized-webview';
 *
 * function MyComponent() {
 *   const { height, setHeightFromPayload } = useAutoHeight({
 *     minHeight: 100,
 *     onHeightChange: (h) => console.log(`Height: ${h}dp`),
 *   });
 *
 *   const handleMessage = (event) => {
 *     setHeightFromPayload(event.nativeEvent.data);
 *   };
 *
 *   return (
 *     <View style={{ height }}>
 *       <WebView onMessage={handleMessage} />
 *     </View>
 *   );
 * }
 * ```
 *
 * ## Performance Considerations
 * - Uses requestAnimationFrame to sync with 60fps screen refresh
 * - Only processes height changes exceeding 1dp threshold
 * - Maintains refs to avoid unnecessary re-render triggers
 * - Properly cancels pending frames on unmount
 *
 * @param options - Configuration object with minHeight and optional onHeightChange callback
 * @returns Object containing current height and payload processor function
 *
 * @throws Does not throw—all invalid inputs are silently ignored
 *
 * @example
 * ```ts
 * // Basic usage with defaults
 * const { height, setHeightFromPayload } = useAutoHeight({ minHeight: 50 });
 * ```
 *
 * @example
 * ```ts
 * // With callback to track changes
 * const { height, setHeightFromPayload } = useAutoHeight({
 *   minHeight: 100,
 *   onHeightChange: (newHeight) => {
 *     analytics.track('webview_resized', { newHeight });
 *   },
 * });
 * ```
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
