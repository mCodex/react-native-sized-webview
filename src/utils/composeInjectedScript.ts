/**
 * Composes multiple JavaScript code snippets into a single valid script for WebView injection.
 *
 * ## Overview
 * This utility function takes one or more JavaScript code strings (and optional undefined values)
 * and combines them into a single script with proper formatting. It's designed to:
 * - Merge the auto-height bridge script with user-provided injected scripts
 * - Filter out undefined values to allow optional script chunks
 * - Ensure the final script returns `true` (required by React Native WebView)
 * - Maintain code structure for better debugging
 *
 * ## How it Works
 * 1. Filters out any undefined or empty values
 * 2. Joins remaining scripts with newlines
 * 3. Appends `true;` at the end (React Native WebView requirement)
 * 4. Returns undefined if no valid scripts provided (lets WebView skip injection)
 *
 * ## Return Value Semantics
 * - **undefined**: Indicates no injection needed; WebView will use default behavior
 * - **string**: A complete JavaScript snippet ready for injection into the WebView
 *
 * ## Example: Auto-Height with Custom Script
 * ```ts
 * const script = composeInjectedScript(
 *   'const myVar = "initialized";',  // Custom script
 *   AUTO_HEIGHT_BRIDGE,              // Auto-height measurement bridge
 *   'console.log("Scripts loaded");'  // Another custom script
 * );
 * // Result (simplified):
 * // "const myVar = "initialized";\n[AUTO_HEIGHT_BRIDGE_CODE]\nconsole.log(\"Scripts loaded\");\ntrue;"
 * ```
 *
 * ## React Native WebView Integration
 * ```tsx
 * <WebView
 *   injectedJavaScript={composeInjectedScript(script1, script2)}
 *   injectedJavaScriptBeforeContentLoaded={composeInjectedScript(AUTO_HEIGHT_BRIDGE, script3)}
 * />
 * ```
 *
 * @param chunks - Variable number of JavaScript code strings or undefined values
 *                 Undefined values are automatically filtered out
 * @returns A complete JavaScript script ready for WebView injection, or `undefined`
 *          if no valid script chunks are provided
 *
 * @example
 * ```ts
 * // With auto-height bridge only
 * const script = composeInjectedScript(AUTO_HEIGHT_BRIDGE);
 * // Returns: "[BRIDGE_CODE]\ntrue;"
 * ```
 *
 * @example
 * ```ts
 * // With custom scripts and undefined values
 * const script = composeInjectedScript(
 *   'console.log("start");',
 *   undefined,                // This is safely ignored
 *   'console.log("end");'
 * );
 * // Returns: "console.log("start");\nconsole.log("end");\ntrue;"
 * ```
 *
 * @example
 * ```ts
 * // With all undefined values
 * const script = composeInjectedScript(undefined, undefined);
 * // Returns: undefined (no injection)
 * ```
 *
 * @internal This is primarily used internally by SizedWebView to merge the
 *           auto-height bridge with user-provided injected scripts
 */
export const composeInjectedScript = (
  ...chunks: Array<string | undefined>
): string | undefined => {
  const parts = chunks.filter(Boolean);

  if (parts.length === 0) {
    return undefined;
  }

  return `${parts.join('\n')}\ntrue;`;
};
