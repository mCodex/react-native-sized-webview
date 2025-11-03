import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SizedWebView } from 'react-native-sized-webview';

const MARKDOWN_SAMPLE = `
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px; }
      h1 { font-size: 28px; margin-bottom: 12px; }
      p { font-size: 16px; line-height: 1.52; }
      ul { padding-left: 22px; }
      code { background: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Auto-sized WebView</h1>
    <p>
      This <code>SizedWebView</code> expands to match the height of its HTML content, meaning
      your outer <code>ScrollView</code> stays in full control of the scrolling behaviour.
    </p>
    <p>
      Try toggling the switch below to view an extended version of the article. The WebView will
      recalculate its intrinsic height on the fly without flicker or layout jumps.
    </p>
  </body>
</html>
`;

const EXTENDED_SECTION = `
  <section>
    <h2>When should you use it?</h2>
    <ul>
      <li>Rendering CMS-driven content without fixed dimensions;</li>
      <li>Embedding FAQ or policy pages in your native app;</li>
      <li>Displaying components generated on the fly, such as charts.</li>
    </ul>
    <p>
      The component listens to mutations and resizes using <em>requestAnimationFrame</em> to avoid
      blocking the main thread.
    </p>
  </section>
`;

const REMOTE_PAGES = [
  {
    id: 'marvel',
    label: 'Marvel',
    uri: 'https://www.marvel.com/',
  },
  {
    id: 'nfl',
    label: 'NFL',
    uri: 'https://www.nfl.com/',
  },
  {
    id: 'google',
    label: 'Google',
    uri: 'https://www.google.com/search?q=marvel+studios',
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    uri: 'https://en.wikipedia.org/wiki/Marvel_Cinematic_Universe',
  },
  {
    id: 'verge',
    label: 'The Verge',
    uri: 'https://www.theverge.com/tech',
  },
];

export default function App() {
  const colorScheme = useColorScheme();

  const [showExtended, setShowExtended] = useState(false);

  const [selectedPageId, setSelectedPageId] = useState(
    () => REMOTE_PAGES[0]?.id ?? 'marvel'
  );

  const [remoteHeight, setRemoteHeight] = useState<number | null>(null);

  const htmlSource = useMemo(() => {
    return {
      html: showExtended
        ? MARKDOWN_SAMPLE.replace('</body>', `${EXTENDED_SECTION}</body>`)
        : MARKDOWN_SAMPLE,
    };
  }, [showExtended]);

  const remoteSource = useMemo(() => {
    const selected = REMOTE_PAGES.find((page) => page.id === selectedPageId);
    return selected ? { uri: selected.uri } : undefined;
  }, [selectedPageId]);

  return (
    <SafeAreaView
      style={[styles.safeArea, colorScheme === 'dark' && styles.safeAreaDark]}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        alwaysBounceVertical={false}
      >
        <Text style={styles.title}>react-native-sized-webview</Text>
        <Text style={styles.subtitle}>
          Resize-friendly WebView that plays nicely with your native layout.
        </Text>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Show extended article</Text>
          <Switch value={showExtended} onValueChange={setShowExtended} />
        </View>

        <SizedWebView
          minHeight={200}
          containerStyle={styles.webviewContainer}
          source={htmlSource}
          scrollEnabled={false}
        />

        <Text style={styles.footer}>
          Tip: The wrapping ScrollView keeps momentum scrolling smooth because
          the WebView stays height-locked to its content.
        </Text>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>External Websites</Text>
          <Text style={styles.sectionSubtitle}>
            Tap a provider to load the live site inside the auto-sized WebView.
          </Text>
        </View>

        <View style={styles.siteSelector}>
          {REMOTE_PAGES.map((page) => {
            const isActive = page.id === selectedPageId;
            return (
              <Pressable
                key={page.id}
                onPress={() => {
                  setSelectedPageId(page.id);
                  setRemoteHeight(null);
                }}
                style={[styles.siteButton, isActive && styles.siteButtonActive]}
              >
                <Text
                  style={[
                    styles.siteButtonText,
                    isActive && styles.siteButtonTextActive,
                  ]}
                >
                  {page.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {remoteSource ? (
          <SizedWebView
            key={remoteSource.uri}
            minHeight={320}
            containerStyle={styles.webviewContainer}
            source={remoteSource}
            onHeightChange={setRemoteHeight}
            scrollEnabled={false}
          />
        ) : null}

        <Text style={styles.remoteHint}>
          {remoteHeight == null
            ? 'Waiting for remote content to size…'
            : `Rendered height: ${Math.round(remoteHeight).toLocaleString()} dp`}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  safeAreaDark: {
    backgroundColor: '#0f172a',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 16,
    color: '#1e293b',
  },
  webviewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#ffffff',
  },
  footer: {
    fontSize: 14,
    color: '#64748b',
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#475569',
  },
  siteSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  siteButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    backgroundColor: '#ffffff',
  },
  siteButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#dbeafe',
  },
  siteButtonText: {
    fontSize: 14,
    color: '#1e293b',
  },
  siteButtonTextActive: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  remoteHint: {
    fontSize: 13,
    color: '#64748b',
  },
});
