/**
 * Merges optional JavaScript chunks into a single script for WebView injection,
 * ensuring exactly one trailing `true;` evaluation guard required by
 * `react-native-webview`.
 *
 * Falsy (`undefined` / empty) chunks are dropped. If every chunk is dropped, the
 * function returns `undefined` so the caller can skip injection altogether.
 *
 * @security Do **not** interpolate untrusted strings into these chunks. Anything
 * passed here is evaluated inside the WebView page context and can post
 * arbitrary messages back to React Native via `window.ReactNativeWebView`.
 *
 * @example
 * ```ts
 * composeInjectedScript(AUTO_HEIGHT_BRIDGE, userScript);
 * ```
 */
export const composeInjectedScript = (
  ...chunks: Array<string | undefined>
): string | undefined => {
  const parts: string[] = [];

  for (const chunk of chunks) {
    if (!chunk) continue;
    // Strip an existing trailing `true;` so we always emit exactly one.
    parts.push(chunk.replace(/\s*true\s*;?\s*$/, ''));
  }

  if (parts.length === 0) {
    return undefined;
  }

  return `${parts.join('\n')}\ntrue;`;
};
