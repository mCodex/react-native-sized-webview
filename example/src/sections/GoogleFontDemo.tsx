import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SizedWebView } from 'react-native-sized-webview';

import { SectionHeader } from '../components/SectionHeader';
import { GOOGLE_FONT_HTML } from '../data/googleFontDemo';
import { colors, radius, spacing } from '../styles/theme';

/**
 * Local HTML payload that loads the `Lobster` Google Font over the network.
 * The WebView hangs briefly while the font downloads — once it lands, the
 * bridge listens to `document.fonts.loadingdone`, refreshes the bootstrap
 * window and the container snaps to the final height with no clipping.
 */
export const GoogleFontDemo = () => {
  const source = useMemo(() => ({ html: GOOGLE_FONT_HTML }), []);

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Custom Google Font"
        subtitle="Loads Lobster over the network — bridge re-measures after font swap."
      />
      <SizedWebView
        minHeight={120}
        containerStyle={styles.webview}
        source={source}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  webview: {
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
