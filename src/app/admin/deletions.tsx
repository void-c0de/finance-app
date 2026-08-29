import { Redirect } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinanceDialog, type FinanceDialogConfig } from '@/components/feedback/FinanceDialog';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { listDeletionRequests, sweepDueDeletions, type DeletionRequestRow } from '@/services/adminProduct';
import { groupDeletionRequests } from '@/services/dataLifecycleCore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

const KIND_LABEL: Record<DeletionRequestRow['kind'], string> = {
  finance_data: 'Cloud-Finanzdaten',
  account: 'Konto',
};
const STATUS_LABEL: Record<DeletionRequestRow['status'], string> = {
  pending: 'offen',
  cancelled: 'storniert',
  completed: 'abgeschlossen',
};

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function fmt(iso: string | null): string {
  if (!iso) return '–';
  try {
    return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function AdminDeletionsScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading, refresh } = useProductAccessStore();
  const [rows, setRows] = useState<DeletionRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<FinanceDialogConfig | null>(null);

  useEffect(() => { void refresh(); }, [refresh]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listDeletionRequests());
    } catch {
      setError('Löschanträge konnten nicht geladen werden.');
      setRows([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (isLoading) return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} />;
  if (!access.isSuperuser) return <Redirect href="/(tabs)/more" />;

  const { due, pending, closed } = groupDeletionRequests(rows ?? []);

  function confirmSweep() {
    setDialog({
      title: `${due.length} fällige Löschung${due.length === 1 ? '' : 'en'} ausführen?`,
      message:
        'Nur Anträge, deren 3-Tage-Kulanzfenster abgelaufen ist, werden endgültig ausgeführt. Konto-Anträge entfernen zusätzlich den Auth-Nutzer über die Edge Function beim nächsten Aufruf durch den Nutzer.',
      tone: 'danger',
      confirmLabel: 'Ausführen',
      cancelLabel: 'Abbrechen',
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          try {
            const result = await sweepDueDeletions();
            await load();
            setDialog({
              title: 'Ausgeführt',
              message: `${result.requests} Antrag/Anträge · ${result.rowsDeleted} Zeilen entfernt.`,
              confirmLabel: 'OK',
            });
          } catch {
            setDialog({ title: 'Fehlgeschlagen', message: 'Der Sweep konnte nicht ausgeführt werden.', confirmLabel: 'OK' });
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  }

  const Row = ({ item }: { item: DeletionRequestRow }) => (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[typography.bodyMedium, { color: colors.text }]}>
          {KIND_LABEL[item.kind]} · {shortId(item.user_id)}
        </Text>
        <Text style={[typography.caption, { color: item.status === 'completed' ? colors.positive : colors.textMuted }]}>
          {STATUS_LABEL[item.status]}
        </Text>
      </View>
      <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
        beantragt {fmt(item.requested_at)} · Frist {fmt(item.grace_until)}
        {item.finalized_at ? ` · fertig ${fmt(item.finalized_at)}` : ''}
        {typeof item.rows_deleted === 'number' ? ` · ${item.rows_deleted} Zeilen` : ''}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <ScreenHeader title="Löschanträge" />
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.lg }]}>
          Nur operative Metadaten (Typ, Zeitpunkte, Status, Zeilenanzahl). Es werden keine gelöschten Finanzinhalte angezeigt.
        </Text>

        {error ? <Text style={[typography.body, { color: colors.negative, marginTop: spacing.lg }]}>{error}</Text> : null}

        <FinanceCard style={{ marginTop: spacing.xl }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>FÄLLIG (KULANZFENSTER ABGELAUFEN)</Text>
          {due.length === 0 ? (
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>Keine.</Text>
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              {due.map((item) => <Row key={item.user_id} item={item} />)}
              <FinanceButton
                label={`Jetzt ausführen (${due.length})`}
                variant="danger"
                size="small"
                loading={busy}
                onPress={confirmSweep}
                style={{ marginTop: spacing.sm }}
              />
            </View>
          )}
        </FinanceCard>

        <FinanceCard style={{ marginTop: spacing.lg }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>IM KULANZFENSTER</Text>
          {pending.length === 0 ? (
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>Keine.</Text>
          ) : (
            <View style={{ marginTop: spacing.sm }}>{pending.map((item) => <Row key={item.user_id} item={item} />)}</View>
          )}
        </FinanceCard>

        <FinanceCard style={{ marginTop: spacing.lg }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>ABGESCHLOSSEN / STORNIERT</Text>
          {closed.length === 0 ? (
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>Keine.</Text>
          ) : (
            <View style={{ marginTop: spacing.sm }}>{closed.slice(0, 30).map((item) => <Row key={item.user_id} item={item} />)}</View>
          )}
        </FinanceCard>

        <FinanceButton label="Neu laden" variant="ghost" size="small" onPress={() => void load()} style={{ marginTop: spacing.lg }} />
      </ScrollView>
      <FinanceDialog visible={dialog !== null} config={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  spacer: { width: 44 },
});
