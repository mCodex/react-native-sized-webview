import { render, act } from '@testing-library/react-native';
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
    expect(props.originWhitelist).toEqual(['*']);
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
    const event = { nativeEvent: { data: '360' } } as any;

    act(() => {
      (webViewProps.onMessage as (evt: unknown) => void)?.(event);
    });

    expect(__setHeightFromPayload).toHaveBeenCalledWith('360');
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
        nativeEvent: { data: '480' },
      });
    });

    expect(__setHeightFromPayload).toHaveBeenCalledWith('480');

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
});
