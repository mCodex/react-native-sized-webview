import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SizedWebView } from 'react-native-sized-webview';

import { SectionHeader } from '../components/SectionHeader';
import { LONG_ARTICLE } from '../data/articleSamples';
import { colors, radius, spacing } from '../styles/theme';

/**
 * CMS-style long article that mirrors the production payload used to validate
 * the multi-source measurement algorithm. Lazy-loaded images and trailing
 * margins force the bridge to combine `scrollHeight` with the
 * `getBoundingClientRect()` probe to land on the correct final height.
 */
export const LongArticleDemo = () => {
  const source = useMemo(() => ({ html: LONG_ARTICLE }), []);

  return (
    <View style={styles.container}>
      <SectionHeader
        title="Long article"
        subtitle="CMS-style document with lazy images — exercises the trailing-margin probe."
      />
      <SizedWebView
        minHeight={240}
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
