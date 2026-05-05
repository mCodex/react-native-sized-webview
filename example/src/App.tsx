import {
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoogleFontDemo } from './sections/GoogleFontDemo';
import { IntroDemo } from './sections/IntroDemo';
import { LongArticleDemo } from './sections/LongArticleDemo';
import { RemoteSitePicker } from './sections/RemoteSitePicker';
import { colors, spacing } from './styles/theme';

/**
 * Showcase app for `react-native-sized-webview`. Demonstrates four scenarios
 * the auto-sizing pipeline must handle correctly:
 *
 * 1. Local HTML with live mutation ({@link IntroDemo}).
 * 2. Remote websites with arbitrary CMS markup ({@link RemoteSitePicker}).
 * 3. Local HTML loading a custom Google Font ({@link GoogleFontDemo}).
 * 4. Long, image-heavy CMS article ({@link LongArticleDemo}).
 */
export default function App() {
  const isDark = useColorScheme() === 'dark';

  return (
    <SafeAreaView style={[styles.safeArea, isDark && styles.safeAreaDark]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        alwaysBounceVertical={false}
      >
        <View style={styles.intro}>
          <Text style={styles.title}>react-native-sized-webview</Text>
          <Text style={styles.subtitle}>
            Resize-friendly WebView that plays nicely with your native layout.
          </Text>
        </View>

        <IntroDemo />
        <RemoteSitePicker />
        <GoogleFontDemo />
        <LongArticleDemo />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safeAreaDark: {
    backgroundColor: colors.bgDark,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.xl,
    gap: spacing.xl,
  },
  intro: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
  },
});
