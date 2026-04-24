/**
 * # react-native-sized-webview
 *
 * A high-performance React Native WebView component that automatically adjusts its height
 * to match its HTML content—eliminating the need for manual measurements, timers, or layout flicker.
 *
 * ## Quick Start
 *
 * ```tsx
 * import { SizedWebView } from 'react-native-sized-webview';
 *
 * <SizedWebView
 *   source={{ html: '<h1>Hello World</h1>' }}
 *   minHeight={100}
 * />
 * ```
 *
 * ## Named exports only
 *
 * This package intentionally exposes **only named exports** — no default. This
 * keeps tree-shaking friendly across bundlers and avoids the common pitfall of
 * mixing `import X from ...` with named imports.
 *
 * @packageDocumentation
 */

export type { SizedWebViewProps } from './components/SizedWebView';
export { SizedWebView } from './components/SizedWebView';
export { AUTO_HEIGHT_BRIDGE } from './constants/autoHeightBridge';
export {
  BRIDGE_MESSAGE_PREFIX,
  MAX_COMMITTED_HEIGHT,
} from './constants/bridgeProtocol';
export type {
  UseAutoHeightOptions,
  UseAutoHeightResult,
} from './hooks/useAutoHeight';
export { useAutoHeight } from './hooks/useAutoHeight';
export { composeInjectedScript } from './utils/composeInjectedScript';
