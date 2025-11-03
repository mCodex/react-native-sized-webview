/**
 * Compose JavaScript snippets into a single script suitable for WebView injection.
 * Returns `undefined` when no script chunks are provided so the WebView defaults apply.
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
