import { memo, useCallback, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';

import { AUTO_HEIGHT_BRIDGE } from '../constants/autoHeightBridge';
import { BRIDGE_MESSAGE_PREFIX } from '../constants/bridgeProtocol';
import { useAutoHeight } from '../hooks/useAutoHeight';
import { composeInjectedScript } from '../utils/composeInjectedScript';

/**
 * Props for the {@link SizedWebView} component. Extends every prop accepted by
 * `react-native-webview` with auto-sizing knobs on top.
 */
export interface SizedWebViewProps extends WebViewProps {
  /**
   * Minimum container height (dp). `0` (default) lets the component render at
   * the WebView's intrinsic size as soon as the bridge reports it — useful for
   * avoiding a forced layout height before the first measurement arrives.
   */
  minHeight?: number;

  /**
   * Style applied to the wrapping `View`. Do **not** set `height` here; it is
   * managed by the hook. Padding, margins, borders, etc., are fine.
   */
  containerStyle?: StyleProp<ViewStyle>;

  /**
   * Style applied to the wrapping `View` only while the content height is
   * still being measured (i.e. while `height` is `undefined`).
   *
   * Use this to keep the container visible during loading so the native
   * activity indicator is never clipped. A common pattern:
   *
   * ```tsx
   * // Inside a ScrollView with contentContainerStyle={{ flexGrow: 1 }}
   * <SizedWebView
   *   source={source}
   *   loadingContainerStyle={{ flex: 1 }}
   * />
   * ```
   *
   * Once the first height measurement is committed, this style is dropped and
   * `containerStyle` + the measured `{ height }` take full effect. Setting
   * this on the **outer container** (not the inner WebView) is safe — the
   * injected wrapper `div` has `height: auto` and no `overflow: hidden`, so
   * `wrapper.scrollHeight` is never clamped by the native frame size.
   */
  loadingContainerStyle?: StyleProp<ViewStyle>;

  /**
   * Fires after each committed auto-height change. Values are rAF-batched and
   * clamped to a sane upper bound for safety.
   */
  onHeightChange?: (height: number) => void;
}

/**
 * Safe defaults applied **before** the caller's props so user-supplied values
 * always win. Centralizing them keeps the merge logic DRY.
 *
 * `originWhitelist` defaults to `['http://*', 'https://*']` — a safer middle
 * ground than the upstream `['*']`. Standard HTTP(S) navigation works out of
 * the box, but non-web schemes (`file:`, `javascript:`, `data:`, `intent:`,
 * etc.) are blocked by default. Callers with stricter requirements can pass
 * their own whitelist (e.g. `['https://trusted.example.com']`).
 */
const WEBVIEW_DEFAULTS = {
  originWhitelist: ['http://*', 'https://*'],
  javaScriptEnabled: true,
  scrollEnabled: false,
  showsVerticalScrollIndicator: false,
  automaticallyAdjustContentInsets: true,
} satisfies Partial<WebViewProps>;

const TRANSPARENT_WEBVIEW_STYLE = { backgroundColor: 'transparent' as const };

/**
 * A `react-native-webview` that sizes itself to match its rendered HTML.
 *
 * @remarks
 * - Respects `javaScriptEnabled={false}` (auto-sizing is skipped, `minHeight`
 *   or `containerStyle.height` becomes the authoritative height).
 * - Uses a namespaced `onMessage` protocol (`__RN_SIZED_WV__:<height>`) so
 *   user-land messages never collide with the internal height bridge.
 * - Returns `undefined` for the container height until the first valid
 *   measurement when `minHeight === 0`, avoiding the iOS 26 WKWebView
 *   feedback loop that collapses content to 1px.
 * - The injected bridge measures via the `Math.max` of multiple authoritative
 *   layout sources (`scrollHeight`, `offsetHeight`, last-child
 *   `getBoundingClientRect().bottom + marginBottom`) so it never under-reports
 *   on iOS WKWebView even with margin-collapse, late image reflow, or async
 *   web fonts.
 *
 * @example
 * ```tsx
 * import { SizedWebView } from 'react-native-sized-webview';
 *
 * export function ArticleBody({ html }: { html: string }) {
 *   return (
 *     <SizedWebView
 *       source={{ html }}
 *       containerStyle={{ marginHorizontal: 16 }}
 *       onHeightChange={(h) => console.log('measured', h)}
 *     />
 *   );
 * }
 * ```
 *
 * @example Inside a ScrollView with a centered loading state:
 * ```tsx
 * <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
 *   <SizedWebView
 *     source={{ uri: 'https://example.com/article' }}
 *     loadingContainerStyle={{ flex: 1 }}
 *   />
 * </ScrollView>
 * ```
 */
const SizedWebViewImpl = (props: SizedWebViewProps) => {
  const {
    minHeight = 0,
    containerStyle,
    loadingContainerStyle,
    style,
    injectedJavaScript,
    injectedJavaScriptBeforeContentLoaded,
    onMessage,
    onHeightChange,
    source,
    ...rest
  } = props;

  const mergedProps = { ...WEBVIEW_DEFAULTS, ...rest };
  const isJsEnabled = mergedProps.javaScriptEnabled !== false;

  const { height, setHeightFromPayload } = useAutoHeight({
    minHeight,
    onHeightChange,
  });

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      // Only bridge-prefixed strings can mutate the container height. Any
      // other payload (user-land `postMessage('hello')`, numeric strings from
      // the page, etc.) is forwarded untouched to the consumer's `onMessage`.
      const data = event.nativeEvent.data;
      if (
        isJsEnabled &&
        typeof data === 'string' &&
        data.startsWith(BRIDGE_MESSAGE_PREFIX)
      ) {
        setHeightFromPayload(data);
      }
      onMessage?.(event);
    },
    [isJsEnabled, onMessage, setHeightFromPayload]
  );

  // The bridge is intentionally injected at BOTH lifecycle hooks:
  //
  // - `injectedJavaScriptBeforeContentLoaded` runs at WKUserScriptInjectionTimeAtDocumentStart
  //   so observers/styles are wired up before any user CSS or scripts can
  //   interfere. This is the preferred path on Android.
  // - `injectedJavaScript` runs after the document loads and is the only
  //   reliable path on iOS WKWebView for inline `source.html` payloads —
  //   `injectedJavaScriptBeforeContentLoaded` is documented to occasionally
  //   miss `loadHTMLString:baseURL:` loads (react-native-webview#1498).
  //
  // The bridge is idempotent: a second injection finds the frozen global
  // handle, calls `refresh()` to re-run measurement, and returns.
  const composedBeforeContentScript = useMemo(
    () =>
      composeInjectedScript(
        isJsEnabled ? AUTO_HEIGHT_BRIDGE : undefined,
        injectedJavaScriptBeforeContentLoaded
      ),
    [isJsEnabled, injectedJavaScriptBeforeContentLoaded]
  );

  const composedInjectedScript = useMemo(
    () =>
      composeInjectedScript(
        isJsEnabled ? AUTO_HEIGHT_BRIDGE : undefined,
        injectedJavaScript
      ),
    [isJsEnabled, injectedJavaScript]
  );

  const containerStyles = useMemo<StyleProp<ViewStyle>>(() => {
    if (height == null) {
      return loadingContainerStyle != null
        ? [loadingContainerStyle, containerStyle]
        : containerStyle;
    }
    return [{ height }, containerStyle];
  }, [containerStyle, height, loadingContainerStyle]);

  const webViewStyles = useMemo(
    () => [TRANSPARENT_WEBVIEW_STYLE, style],
    [style]
  );

  return (
    <View style={containerStyles}>
      <WebView
        {...mergedProps}
        style={webViewStyles}
        injectedJavaScript={composedInjectedScript}
        injectedJavaScriptBeforeContentLoaded={composedBeforeContentScript}
        onMessage={handleMessage}
        source={source}
      />
    </View>
  );
};

SizedWebViewImpl.displayName = 'SizedWebView';

/**
 * Memoized `SizedWebView` — a drop-in replacement for `WebView` from
 * `react-native-webview` that auto-sizes its container to the rendered HTML.
 *
 * @see {@link SizedWebViewProps} for the full prop reference.
 * @see {@link useAutoHeight} if you need the bare height-tracking hook
 *   without the component shell.
 */
export const SizedWebView = memo(SizedWebViewImpl);
