/**
 * Shared constants for the `SizedWebView` ↔ injected-bridge message protocol.
 *
 * Centralizing these values here keeps the hook, the component, and the
 * injected script honest about a single contract (DRY) and lets the tests
 * assert against one source of truth.
 */

/**
 * Namespace prefix stamped on every `postMessage` the auto-height bridge sends.
 *
 * Messages without this prefix are treated as user-land traffic and forwarded
 * untouched to the consumer's `onMessage` handler. This prevents hostile or
 * unrelated pages from being able to mutate the container height just by
 * sending a numeric string through `window.ReactNativeWebView.postMessage`.
 */
export const BRIDGE_MESSAGE_PREFIX = '__RN_SIZED_WV__:';

/**
 * Upper bound (in dp) for any height the hook is willing to commit to React
 * Native. Defends against runaway values from broken markup or malicious
 * third-party scripts running inside the WebView page context.
 *
 * Must stay in sync with the `MAX_REASONABLE_HEIGHT` constant embedded in the
 * injected bridge script.
 */
export const MAX_COMMITTED_HEIGHT = 120000;
