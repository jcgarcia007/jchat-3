import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useThemeColors } from './theme/colors';
import { palette } from './theme/tokens';

/** Token preview — verifies Section 1 colors render and that the theme
 *  follows useColorScheme (Task 0.2 test step). */

const SWATCHES: { name: string; color: string }[] = [
  { name: 'brand', color: palette.brand },
  { name: 'brand-dark', color: palette.brandDark },
  { name: 'brand-purple', color: palette.brandPurple },
  { name: 'success', color: palette.success },
  { name: 'warning', color: palette.warning },
  { name: 'danger', color: palette.danger },
  { name: 'gold', color: palette.gold },
  { name: 'heat-hot', color: palette.heatHot },
  { name: 'heat-warm', color: palette.heatWarm },
  { name: 'heat-mild', color: palette.heatMild },
  { name: 'heat-cool', color: palette.heatCool },
];

export default function App() {
  const c = useThemeColors();
  const scheme = useColorScheme() ?? 'dark';

  return (
    <View style={[styles.container, { backgroundColor: c.bgBase }]}>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          JChat 3.0 — Design Tokens
        </Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>
          Scheme: {scheme}
        </Text>

        <View style={styles.grid}>
          {SWATCHES.map((s) => (
            <View
              key={s.name}
              style={[
                styles.card,
                { backgroundColor: c.bgSurface, borderColor: c.borderSubtle },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={[styles.swatchLabel, { color: c.textSecondary }]}>
                {s.name}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: 64 },
  title: { fontSize: 22, fontWeight: '600' },
  subtitle: { fontSize: 14, marginTop: 4, marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: 100,
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  swatch: { height: 48, width: '100%' },
  swatchLabel: { fontSize: 11, padding: 6 },
});
