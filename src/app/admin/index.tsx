import { Redirect, router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { SettingsRow } from '@/components/finance/SettingsRow';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

export default function AdminScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading, refresh } = useProductAccessStore();
  useEffect(() => { void refresh(); }, [refresh]);
  if (!isLoading && !access.isSuperuser) return <Redirect href="/(tabs)/more" />;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <View style={styles.header}><FinanceButton label="‹" variant="ghost" size="small" onPress={() => router.back()} /><Text style={[typography.title, { color: colors.text }]}>Administration</Text><View style={styles.spacer} /></View>
        <FinanceCard variant="highlight" style={{ marginTop: spacing.xl }}>
          <Text style={[typography.cardTitle, { color: colors.text }]}>Superuser Control Center</Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>Administrative Aktionen werden serverseitig autorisiert und revisionssicher protokolliert.</Text>
        </FinanceCard>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxxl, marginBottom: spacing.sm }]}>PRODUKTVERWALTUNG</Text>
        <FinanceCard padded={false}>
          <SettingsRow title="Premium-Coupons" description="Codes erstellen, Nutzung prüfen und deaktivieren" value="›" onPress={() => router.push('/admin/coupons' as Href)} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow title="Release-Steuerung" description="Patch Notes und Mindestversionen veröffentlichen" value="›" onPress={() => router.push('/admin/releases' as Href)} />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow title="Nutzer-Entitlements" description="Premium gezielt gewähren oder entziehen" value="›" onPress={() => router.push('/admin/users' as Href)} />
        </FinanceCard>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ safe: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, spacer: { width: 44 }, divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20 } });
