import { memo, useCallback, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';

import { AUTO_HEIGHT_BRIDGE } from '../constants/autoHeightBridge';
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
 * - Respects `javaScriptEnabled={false}` (auto-sizing is skipped, `minHeight`
 *   or `containerStyle.height` becomes the authoritative height).
 * - Uses a namespaced `onMessage` protocol so user-land messages never
 *   collide with the internal height bridge.
 * - Returns `undefined` for the container height until the first valid
 *   measurement when `minHeight === 0`, avoiding the iOS 26 WKWebView
 *   feedback loop that collapses content to 1px.
 */
const SizedWebViewImpl = (props: SizedWebViewProps) => {
  const {
    minHeight = 0,
    containerStyle,
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
      if (isJsEnabled) {
        setHeightFromPayload(event.nativeEvent.data);
      }
      onMessage?.(event);
    },
    [isJsEnabled, onMessage, setHeightFromPayload]
  );

  const composedBeforeContentScript = useMemo(
    () =>
      composeInjectedScript(
        isJsEnabled ? AUTO_HEIGHT_BRIDGE : undefined,
        injectedJavaScriptBeforeContentLoaded
      ),
    [isJsEnabled, injectedJavaScriptBeforeContentLoaded]
  );

  const composedInjectedScript = useMemo(
    () => composeInjectedScript(injectedJavaScript),
    [injectedJavaScript]
  );

  const containerStyles = useMemo<StyleProp<ViewStyle>>(() => {
    if (height == null) {
      return containerStyle;
    }
    return [{ height }, containerStyle];
  }, [containerStyle, height]);

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
 * Memoized `SizedWebView`. See {@link SizedWebViewProps} for configuration.
 */
export const SizedWebView = memo(SizedWebViewImpl);
