import { useCallback, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewProps,
} from 'react-native-webview';

import { AUTO_HEIGHT_BRIDGE } from '../constants/autoHeightBridge';
import { useAutoHeight } from '../hooks/useAutoHeight';
import { composeInjectedScript } from '../utils/composeInjectedScript';

export interface SizedWebViewProps extends WebViewProps {
  /**
   * Minimum height (in dp) applied to the WebView container.
   * Useful to avoid layout shifts on the initial render while the content height loads.
   */
  minHeight?: number;
  /** Optional styles applied to the wrapping `View` that hosts the WebView. */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * Callback invoked whenever the auto-calculated height changes.
   * Receives the committed height (in dp).
   */
  onHeightChange?: (height: number) => void;
}

/**
 * High-level WebView wrapper that automatically grows to match its HTML content height.
 * The component stays scroll-less and keeps the parent scroll view in control.
 */
export const SizedWebView: React.FC<SizedWebViewProps> = ({
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
