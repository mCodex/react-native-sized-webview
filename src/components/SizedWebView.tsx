import { useCallback, useMemo } from 'react';
import type { FC } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';

import { AUTO_HEIGHT_BRIDGE } from '../constants/autoHeightBridge';
import { useAutoHeight } from '../hooks/useAutoHeight';
import { composeInjectedScript } from '../utils/composeInjectedScript';

/**
 * Props for the SizedWebView component.
 *
 * Extends all standard WebViewProps with additional auto-sizing capabilities.
 *
 * @example
 * ```tsx
 * <SizedWebView
 *   source={{ html: '<h1>Hello World</h1>' }}
 *   minHeight={100}
 *   onHeightChange={(height) => console.log(`New height: ${height}`)}
 * />
 * ```
 */
export interface SizedWebViewProps extends WebViewProps {
  /**
   * Minimum height (in dp/points) for the WebView container.
   *
   * Useful to:
   * - Avoid layout shifts during initial render while content height is loading
   * - Prevent the WebView from becoming too small if content is minimal
   * - Provide a baseline height for skeleton/loading states
   *
   * @default 0
   */
  minHeight?: number;

  /**
   * Style object applied to the wrapping `View` container that hosts the WebView.
   *
   * Use this to add padding, margins, borders, or other styling to the container.
   * Note: Do not set `height` here—it's automatically managed by the component.
   *
   * @example
   * ```tsx
   * containerStyle={{ paddingHorizontal: 12, borderRadius: 8 }}
   * ```
   */
  containerStyle?: StyleProp<ViewStyle>;

  /**
   * Callback fired whenever the WebView's auto-calculated height changes.
   *
   * This is useful for:
   * - Analytics tracking when content size changes
   * - Triggering animations or other side effects
   * - Syncing height with parent layout logic
   *
   * The callback receives the new committed height in density-independent pixels (dp).
   *
   * @param height - The new height in dp/points
   *
   * @example
   * ```tsx
   * onHeightChange={(height) => {
   *   console.log(`WebView height updated to: ${height}dp`);
   * }}
   * ```
   */
  onHeightChange?: (height: number) => void;
}

/**
 * A React Native WebView component that automatically sizes itself to fit its HTML content.
 *
 * ## Overview
 * `SizedWebView` wraps the standard React Native `WebView` component and automatically
 * adjusts its height to match the rendered HTML content. This prevents layout flicker,
 * eliminates manual height calculations, and keeps scroll control with the parent ScrollView.
 *
 * ## Key Features
 * - ✅ Automatic height adjustment based on HTML content
 * - ✅ Smooth rendering with no layout flicker
 * - ✅ Scroll control remains with parent container
 * - ✅ Supports both local HTML and external URLs
 * - ✅ Configurable minimum height to prevent excessive shrinking
 * - ✅ Height change notifications via callback
 *
 * ## How it Works
 * 1. An injected JavaScript bridge measures the HTML content's height
 * 2. The height value is sent back to the native layer
 * 3. The component updates its container size on each frame
 * 4. The WebView stays scroll-disabled to prevent internal scrolling
 *
 * ## Usage Example
 * ```tsx
 * import { SizedWebView } from 'react-native-sized-webview';
 *
 * export function MyComponent() {
 *   return (
 *     <ScrollView>
 *       <SizedWebView
 *         source={{ html: '<h1>Dynamic Content</h1>' }}
 *         minHeight={100}
 *         containerStyle={{ marginVertical: 10 }}
 *         onHeightChange={(height) => console.log(`Height: ${height}dp`)}
 *       />
 *     </ScrollView>
 *   );
 * }
 * ```
 *
 * ## Props
 * - All standard `WebViewProps` are supported
 * - Plus 3 additional props: `minHeight`, `containerStyle`, `onHeightChange`
 *
 * ## Important Notes
 * - The component disables scroll by default (`scrollEnabled={false}`)
 * - Origin whitelist defaults to `['*']` to allow all sources
 * - JavaScript is automatically enabled for the height bridge to work
 * - Minimum height is always enforced to avoid layout issues
 *
 * @component
 * @param props - SizedWebViewProps containing all configuration options
 * @returns A View containing the auto-sized WebView
 *
 * @example
 * ```tsx
 * // With inline HTML
 * <SizedWebView
 *   source={{ html: '<p>Hello</p>' }}
 *   minHeight={50}
 * />
 * ```
 *
 * @example
 * ```tsx
 * // With external URL
 * <SizedWebView
 *   source={{ uri: 'https://example.com' }}
 *   containerStyle={{ borderRadius: 8 }}
 * />
 * ```
 */
export const SizedWebView: FC<SizedWebViewProps> = ({
  minHeight = 0,
  containerStyle,
  style,
  injectedJavaScript,
  injectedJavaScriptBeforeContentLoaded,
  onMessage,
  onHeightChange,
  originWhitelist,
  showsVerticalScrollIndicator = false,
  scrollEnabled = false,
  automaticallyAdjustContentInsets = true,
  source,
  ...rest
}) => {
  const { height, setHeightFromPayload } = useAutoHeight({
    minHeight,
    onHeightChange,
  });

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      setHeightFromPayload(event.nativeEvent.data);
      onMessage?.(event);
    },
    [onMessage, setHeightFromPayload]
  );

  const composedBeforeContentScript = useMemo(
    () =>
      composeInjectedScript(
        AUTO_HEIGHT_BRIDGE,
        injectedJavaScriptBeforeContentLoaded
      ),
    [injectedJavaScriptBeforeContentLoaded]
  );

  const composedInjectedScript = useMemo(
    () => composeInjectedScript(injectedJavaScript),
    [injectedJavaScript]
  );

  const containerStyles = useMemo(
    () => [{ height }, containerStyle],
    [containerStyle, height]
  );

  const webViewStyles = useMemo(
    () => [{ backgroundColor: 'transparent' }, style],
    [style]
  );

  return (
    <View style={containerStyles}>
      <WebView
        {...rest}
        style={webViewStyles}
        originWhitelist={originWhitelist ?? ['*']}
        javaScriptEnabled
        automaticallyAdjustContentInsets={automaticallyAdjustContentInsets}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        injectedJavaScript={composedInjectedScript}
        injectedJavaScriptBeforeContentLoaded={composedBeforeContentScript}
        onMessage={handleMessage}
        source={source}
      />
    </View>
  );
};

export default SizedWebView;
