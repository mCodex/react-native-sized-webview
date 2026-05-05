import { act, render } from '@testing-library/react-native';
import { View } from 'react-native';

import { SizedWebView } from '../components/SizedWebView';
import { AUTO_HEIGHT_BRIDGE } from '../constants/autoHeightBridge';
import { composeInjectedScript } from '../utils/composeInjectedScript';

jest.mock('../hooks/useAutoHeight', () => {
  const setHeightFromPayload = jest.fn();
  return {
    __esModule: true,
    useAutoHeight: jest.fn(() => ({
      height: 240,
      setHeightFromPayload,
    })),
    __setHeightFromPayload: setHeightFromPayload,
  };
});

const capturedWebViewProps: Array<Record<string, unknown>> = [];

jest.mock('react-native-webview', () => {
  const MockWebView = (props: any) => {
    capturedWebViewProps.push(props);
    return null;
  };

  (MockWebView as { displayName?: string }).displayName = 'MockWebView';

  return {
    __esModule: true,
    WebView: MockWebView,
  };
});

describe('SizedWebView', () => {
  beforeEach(() => {
    capturedWebViewProps.length = 0;

    const { useAutoHeight } = jest.requireMock('../hooks/useAutoHeight');
    const { __setHeightFromPayload } = jest.requireMock(
      '../hooks/useAutoHeight'
    );
    (useAutoHeight as jest.Mock).mockReturnValue({
      height: 240,
      setHeightFromPayload: __setHeightFromPayload,
    });
    __setHeightFromPayload.mockClear();
  });

  it('renders a container view that reflects the measured height', () => {
    const onMessage = jest.fn();

    const renderResult = render(
      <SizedWebView
        minHeight={120}
        containerStyle={{ backgroundColor: 'red' }}
        style={{ opacity: 0.5 }}
        source={{ html: '<p>Hello</p>' }}
        injectedJavaScriptBeforeContentLoaded="console.log('before');"
        injectedJavaScript="console.log('after');"
        onMessage={onMessage}
      />
    );

    const container = renderResult.UNSAFE_getByType(View);
    expect(container.props.style).toEqual([
      { height: 240 },
      { backgroundColor: 'red' },
    ]);

    const props = capturedWebViewProps.at(-1) ?? {};

    expect(props.style).toEqual([
      { backgroundColor: 'transparent' },
      { opacity: 0.5 },
    ]);
    expect(props.originWhitelist).toEqual(['http://*', 'https://*']);
    expect(props.scrollEnabled).toBe(false);
    expect(props.showsVerticalScrollIndicator).toBe(false);
    expect(props.javaScriptEnabled).toBe(true);

    const bridgeScript = composeInjectedScript(
      AUTO_HEIGHT_BRIDGE,
      "console.log('before');"
    );
    expect(props.injectedJavaScriptBeforeContentLoaded).toBe(bridgeScript);
    expect(props.injectedJavaScript).toBe(
      composeInjectedScript("console.log('after');")
    );

    act(() => {
      renderResult.unmount();
    });
  });

  it('delegates WebView message events to the auto-height hook and user callback', () => {
    const { __setHeightFromPayload } = jest.requireMock(
      '../hooks/useAutoHeight'
    );
    const onMessage = jest.fn();

    const renderResult = render(
      <SizedWebView source={{ html: '<p>Hi</p>' }} onMessage={onMessage} />
    );

    const webViewProps = capturedWebViewProps.at(-1) ?? {};
    const event = { nativeEvent: { data: '__RN_SIZED_WV__:360' } } as any;

    act(() => {
      (webViewProps.onMessage as (evt: unknown) => void)?.(event);
    });

    expect(__setHeightFromPayload).toHaveBeenCalledWith('__RN_SIZED_WV__:360');
    expect(onMessage).toHaveBeenCalledWith(event);

    act(() => {
      renderResult.unmount();
    });
  });

  it('still updates the hook when no onMessage callback is provided', () => {
    const { __setHeightFromPayload } = jest.requireMock(
      '../hooks/useAutoHeight'
    );

    const renderResult = render(
      <SizedWebView source={{ html: '<p>Hi</p>' }} />
    );

    const webViewProps = capturedWebViewProps.at(-1) ?? {};

    act(() => {
      (webViewProps.onMessage as (evt: unknown) => void)?.({
        nativeEvent: { data: '__RN_SIZED_WV__:480' },
      });
    });

    expect(__setHeightFromPayload).toHaveBeenCalledWith('__RN_SIZED_WV__:480');

    act(() => {
      renderResult.unmount();
    });
  });

  it('forwards custom origin whitelist and scroll props', () => {
    const renderResult = render(
      <SizedWebView
        source={{ html: '<p>Hi</p>' }}
        originWhitelist={['https://example.com']}
        scrollEnabled
        showsVerticalScrollIndicator
      />
    );

    const props = capturedWebViewProps.at(-1) ?? {};

    expect(props.originWhitelist).toEqual(['https://example.com']);
    expect(props.scrollEnabled).toBe(true);
    expect(props.showsVerticalScrollIndicator).toBe(true);

    act(() => {
      renderResult.unmount();
    });
  });

  it('passes minHeight and onHeightChange to the auto-height hook', () => {
    const onHeightChange = jest.fn();
    const hookModule = jest.requireMock('../hooks/useAutoHeight');

    const renderResult = render(
      <SizedWebView
        minHeight={77}
        source={{ html: '<p>hook</p>' }}
        onHeightChange={onHeightChange}
      />
    );

    expect(hookModule.useAutoHeight).toHaveBeenLastCalledWith({
      minHeight: 77,
      onHeightChange,
    });

    act(() => {
      renderResult.unmount();
    });
  });

  it('allows opting out of automatic inset adjustments', () => {
    const renderResult = render(
      <SizedWebView
        source={{ html: '<p>Insets</p>' }}
        automaticallyAdjustContentInsets={false}
      />
    );

    const props = capturedWebViewProps.at(-1) ?? {};
    expect(props.automaticallyAdjustContentInsets).toBe(false);

    act(() => {
      renderResult.unmount();
    });
  });

  it('does not force a height on the container when the hook returns undefined', () => {
    const { useAutoHeight, __setHeightFromPayload } = jest.requireMock(
      '../hooks/useAutoHeight'
    );
    (useAutoHeight as jest.Mock).mockReturnValue({
      height: undefined,
      setHeightFromPayload: __setHeightFromPayload,
    });

    const renderResult = render(
      <SizedWebView
        source={{ html: '<p>Hi</p>' }}
        containerStyle={{ backgroundColor: 'blue' }}
      />
    );

    const container = renderResult.UNSAFE_getByType(View);
    expect(container.props.style).toEqual({ backgroundColor: 'blue' });

    act(() => {
      renderResult.unmount();
    });
  });

  it('skips the height bridge and the hook dispatch when javaScriptEnabled is false', () => {
    const { __setHeightFromPayload } = jest.requireMock(
      '../hooks/useAutoHeight'
    );

    const renderResult = render(
      <SizedWebView
        source={{ html: '<p>Static</p>' }}
        javaScriptEnabled={false}
        injectedJavaScriptBeforeContentLoaded="console.log('before');"
      />
    );

    const props = capturedWebViewProps.at(-1) ?? {};

    expect(props.javaScriptEnabled).toBe(false);
    // Bridge must not be injected when the caller disabled JS.
    expect(props.injectedJavaScriptBeforeContentLoaded).toBe(
      composeInjectedScript("console.log('before');")
    );
    expect(String(props.injectedJavaScriptBeforeContentLoaded)).not.toContain(
      '__RN_SIZED_WEBVIEW__'
    );

    act(() => {
      (props.onMessage as (evt: unknown) => void)?.({
        nativeEvent: { data: '__RN_SIZED_WV__:400' },
      });
    });
    expect(__setHeightFromPayload).not.toHaveBeenCalled();

    act(() => {
      renderResult.unmount();
    });
  });

  it('does not forward unprefixed user-land messages to the auto-height hook', () => {
    const { __setHeightFromPayload } = jest.requireMock(
      '../hooks/useAutoHeight'
    );
    const onMessage = jest.fn();

    const renderResult = render(
      <SizedWebView source={{ html: '<p>Hi</p>' }} onMessage={onMessage} />
    );

    const webViewProps = capturedWebViewProps.at(-1) ?? {};
    const userLandEvent = {
      nativeEvent: { data: '400' },
    } as any;

    act(() => {
      (webViewProps.onMessage as (evt: unknown) => void)?.(userLandEvent);
    });

    // Bare numeric string is user-land traffic: must NOT reach the hook,
    // but MUST still be forwarded to the consumer's onMessage.
    expect(__setHeightFromPayload).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith(userLandEvent);

    act(() => {
      renderResult.unmount();
    });
  });

  it('applies loadingContainerStyle to the container while height is undefined', () => {
    const { useAutoHeight, __setHeightFromPayload } = jest.requireMock(
      '../hooks/useAutoHeight'
    );
    (useAutoHeight as jest.Mock).mockReturnValue({
      height: undefined,
      setHeightFromPayload: __setHeightFromPayload,
    });

    const renderResult = render(
      <SizedWebView
        source={{ html: '<p>Hi</p>' }}
        loadingContainerStyle={{ flex: 1 }}
        containerStyle={{ backgroundColor: 'blue' }}
      />
    );

    const container = renderResult.UNSAFE_getByType(View);
    expect(container.props.style).toEqual([
      { flex: 1 },
      { backgroundColor: 'blue' },
    ]);

    act(() => {
      renderResult.unmount();
    });
  });

  it('does not include loadingContainerStyle once height is committed', () => {
    const renderResult = render(
      <SizedWebView
        source={{ html: '<p>Hi</p>' }}
        loadingContainerStyle={{ flex: 1 }}
        containerStyle={{ backgroundColor: 'green' }}
      />
    );

    // Default mock returns height: 240 — measurement is already committed.
    const container = renderResult.UNSAFE_getByType(View);
    expect(container.props.style).toEqual([
      { height: 240 },
      { backgroundColor: 'green' },
    ]);

    act(() => {
      renderResult.unmount();
    });
  });
});
