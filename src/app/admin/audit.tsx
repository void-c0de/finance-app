import { Redirect } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { listAuditLog, type AuditLogRow } from '@/services/adminProduct';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

const FILTERS: { label: string; prefix?: string }[] = [
  { label: 'Alle' },
  { label: 'Löschungen', prefix: 'deletion' },
  { label: 'Coupons', prefix: 'coupon' },
  { label: 'Entitlements', prefix: 'entitlement' },
  { label: 'Releases', prefix: 'release' },
];

const ACTION_LABEL: Record<string, string> = {
  'deletion.requested': 'Löschung beantragt',
  'deletion.cancelled': 'Löschung storniert',
  'deletion.finalized': 'Löschung ausgeführt',
  'deletion.sweep': 'Lösch-Sweep',
  'coupon.created': 'Coupon erstellt',
  'coupon.enabled': 'Coupon aktiviert',
  'coupon.disabled': 'Coupon deaktiviert',
  'debug_logs.pruned': 'Debug-Logs bereinigt',
};

function shortId(id: string | null): string {
  return id ? `${id.slice(0, 8)}…` : '–';
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function safeMeta(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata ?? {}).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
}

export default function AdminAuditScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading, refresh } = useProductAccessStore();
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(0);

  useEffect(() => { void refresh(); }, [refresh]);

  const load = useCallback(async (prefix?: string) => {
    setError(null);
    try {
      setRows(await listAuditLog(150, prefix));
    } catch {
      setError('Audit-Protokoll konnte nicht geladen werden.');
      setRows([]);
    }
  }, []);

  useEffect(() => { void load(FILTERS[filter].prefix); }, [load, filter]);

  if (isLoading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} />;
  if (!access.isSuperuser) return <Redirect href="/(tabs)/more" />;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <ScreenHeader title="Audit-Protokoll" />
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          Operative Ereignisse mit sicheren Metadaten. Keine Finanzinhalte, keine Tokens, keine Passwörter.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.lg }}>
          {FILTERS.map((f, index) => (
            <FinancePressable
              key={f.label}
              accessibilityRole="button"
              onPress={() => setFilter(index)}
              intent="navigation"
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: 999,
                backgroundColor: filter === index ? colors.primarySoft : colors.surfaceInteractive,
              }}
            >
              <Text style={[typography.caption, { color: filter === index ? colors.primary : colors.textSecondary }]}>
                {f.label}
              </Text>
            </FinancePressable>
          ))}
        </View>

        {error ? <Text style={[typography.body, { color: colors.negative, marginTop: spacing.lg }]}>{error}</Text> : null}

        <FinanceCard style={{ marginTop: spacing.lg }}>
          {rows === null ? (
            <Text style={[typography.body, { color: colors.textSecondary }]}>Wird geladen…</Text>
          ) : rows.length === 0 ? (
            <Text style={[typography.body, { color: colors.textSecondary }]}>Keine Einträge.</Text>
          ) : (
            rows.map((row, index) => (
              <View
                key={row.id}
                style={{
                  marginBottom: spacing.md,
                  paddingTop: index > 0 ? spacing.md : 0,
                  borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[typography.bodyMedium, { color: colors.text }]}>
                    {ACTION_LABEL[row.action] ?? row.action}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{fmt(row.created_at)}</Text>
                </View>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
                  Akteur {shortId(row.actor_user_id)}
                  {row.target_user_id ? ` · Ziel ${shortId(row.target_user_id)}` : ''}
                  {row.entity_id ? ` · ${row.entity_id.slice(0, 16)}` : ''}
                </Text>
                {safeMeta(row.metadata) ? (
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxs }]}>
                    {safeMeta(row.metadata)}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </FinanceCard>

        <FinanceButton label="Neu laden" variant="ghost" size="small" onPress={() => void load(FILTERS[filter].prefix)} style={{ marginTop: spacing.lg }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 44 },
});
