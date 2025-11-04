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
 * ## Main Exports
 *
 * ### Components
 * - **`SizedWebView`** - The main auto-sizing WebView component
 *
 * ### Hooks
 * - **`useAutoHeight`** - Hook for managing WebView height state (advanced usage)
 *
 * ### Utilities
 * - **`composeInjectedScript`** - Merges multiple JavaScript snippets for injection
 * - **`AUTO_HEIGHT_BRIDGE`** - The JavaScript bridge code (usually not needed directly)
 *
 * ### Types
 * - **`SizedWebViewProps`** - Props interface for SizedWebView component
 * - **`UseAutoHeightOptions`** - Configuration for useAutoHeight hook
 * - **`UseAutoHeightResult`** - Return value from useAutoHeight hook
 *
 * @packageDocumentation
 */

export { SizedWebView } from './components/SizedWebView';
export type { SizedWebViewProps } from './components/SizedWebView';

export { useAutoHeight } from './hooks/useAutoHeight';
export type {
  UseAutoHeightOptions,
  UseAutoHeightResult,
} from './hooks/useAutoHeight';

export { AUTO_HEIGHT_BRIDGE } from './constants/autoHeightBridge';
export { composeInjectedScript } from './utils/composeInjectedScript';

// Default export for convenience
export { SizedWebView as default } from './components/SizedWebView';
