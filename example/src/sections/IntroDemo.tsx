import { useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { SizedWebView } from 'react-native-sized-webview';
import { SectionHeader } from '../components/SectionHeader';
import { buildMarkdownSource } from '../data/articleSamples';
import { colors, spacing } from '../styles/theme';

/**
 * Local-HTML demo with a toggle that mutates the document so the WebView
 * height re-resolves on the fly. Demonstrates the basic `SizedWebView`
 * usage pattern.
 */
export const IntroDemo = () => {
  const [showExtended, setShowExtended] = useState(false);

  const source = useMemo(
    () => ({ html: buildMarkdownSource(showExtended) }),
    [showExtended]
  );

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Local HTML"
        subtitle="Toggle to mutate the document and watch the WebView re-size live."
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Show extended article</Text>
        <Switch value={showExtended} onValueChange={setShowExtended} />
      </View>

      <SizedWebView
        key={showExtended ? 'extended' : 'short'}
        minHeight={200}
        containerStyle={styles.webview}
        source={source}
      />

      <Text style={styles.footer}>
        Tip: the wrapping ScrollView keeps momentum scrolling smooth because the
        WebView stays height-locked to its content.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  switchLabel: {
    fontSize: 16,
    color: colors.textBody,
  },
  webview: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  footer: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
