import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SizedWebView } from 'react-native-sized-webview';

import { PillButton } from '../components/PillButton';
import { SectionHeader } from '../components/SectionHeader';
import { DEFAULT_REMOTE_PAGE_ID, REMOTE_PAGES } from '../data/remotePages';
import { colors, radius, spacing } from '../styles/theme';

/**
 * Live remote-website demo. Tapping a pill swaps the WebView source and the
 * height resolves automatically — proving that the multi-source measurement
 * algorithm copes with arbitrary CMS-driven pages.
 */
export const RemoteSitePicker = () => {
  const [selectedId, setSelectedId] = useState(DEFAULT_REMOTE_PAGE_ID);
  const [height, setHeight] = useState<number | null>(null);

  const source = useMemo(() => {
    const page = REMOTE_PAGES.find((entry) => entry.id === selectedId);
    return page ? { uri: page.uri } : undefined;
  }, [selectedId]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setHeight(null);
  }, []);

  return (
    <View style={styles.container}>
      <SectionHeader
        title="External Websites"
        subtitle="Tap a provider to load the live site inside the auto-sized WebView."
      />

      <View style={styles.row}>
        {REMOTE_PAGES.map((page) => (
          <PillButton
            key={page.id}
            label={page.label}
            active={page.id === selectedId}
            onPress={() => handleSelect(page.id)}
          />
        ))}
      </View>

      {source ? (
        <SizedWebView
          key={source.uri}
          minHeight={320}
          containerStyle={styles.webview}
          source={source}
          onHeightChange={setHeight}
        />
      ) : null}

      <Text style={styles.hint}>
        {height == null
          ? 'Waiting for remote content to size…'
          : `Rendered height: ${Math.round(height).toLocaleString()} dp`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  webview: {
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
