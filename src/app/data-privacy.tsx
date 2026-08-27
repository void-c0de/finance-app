import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { SettingsRow } from '@/components/finance/SettingsRow';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { FinanceDialog, type FinanceDialogConfig } from '@/components/feedback/FinanceDialog';
import { TypedConfirmSheet, type TypedConfirmConfig } from '@/components/data/TypedConfirmSheet';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { performFinanceHaptic } from '@/services/haptics';
import { exportAndShare } from '@/services/exportService';
import { countUnsyncedChanges } from '@/services/pendingSyncStatus';
import { wipeLocalFinanceData } from '@/services/localDataReset';
import {
  cancelDataDeletion,
  finalizeAccountDeletion,
  getDeletionStatus,
  requestDataDeletion,
  type DeletionStatus,
} from '@/services/dataLifecycle';
import { graceHoursRemaining, isDeletionDue } from '@/services/dataLifecycleCore';
import { getPersonalAccountInfo } from '@/services/cloud/authService';
import { useCloudSyncStore } from '@/stores/useCloudSyncStore';
import { useFinanceStore } from '@/stores/useFinanceStore';

type ActiveFlow = 'local_reset' | 'cloud_delete' | 'account_delete' | null;

export default function DataPrivacyScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const cloudSync = useCloudSyncStore();
  const refreshFinanceData = useFinanceStore((state) => state.refreshFinanceData);

  const [signedIn, setSignedIn] = useState(false);
  const [deletion, setDeletion] = useState<DeletionStatus>({ status: 'none' });
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<FinanceDialogConfig | null>(null);
  const [flow, setFlow] = useState<ActiveFlow>(null);
  const [typed, setTyped] = useState<TypedConfirmConfig | null>(null);

  const reload = useCallback(async () => {
    const [info, status] = await Promise.all([getPersonalAccountInfo(), getDeletionStatus()]);
    setSignedIn(info.mode === 'personal');
    setDeletion(status);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pendingDeletion =
    deletion.status === 'pending'
      ? {
          due: isDeletionDue(deletion),
          hours: graceHoursRemaining(deletion),
          kind: deletion.kind,
        }
      : null;

  async function createBackup() {
    if (busy) return;
    setBusy('backup');
    try {
      await performFinanceHaptic('selection');
      const result = await exportAndShare('full_backup', {
        transactions: [],
        budgets: [],
        goals: [],
        categories: [],
        accounts: [],
        recurringItems: [],
        recurringSeries: [],
      });
      if (result === 'unavailable') {
        setDialog({ title: 'Teilen nicht verfügbar', message: 'Das System-Teilen-Menü steht auf diesem Gerät nicht bereit.', confirmLabel: 'Verstanden' });
      } else if (result === 'error') {
        setDialog({ title: 'Backup fehlgeschlagen', message: 'Bitte erneut versuchen. Es wurde nichts hochgeladen.', confirmLabel: 'Verstanden' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function startLocalReset() {
    setBusy('scan');
    try {
      const pending = await countUnsyncedChanges();
      const bullets = [
        'Alle Finanzdaten auf DIESEM Gerät werden entfernt.',
        pending.syncConfigured
          ? 'Die Cloud-Kopie bleibt erhalten und wird beim nächsten Login neu geladen.'
          : 'Es ist keine Cloud-Synchronisierung eingerichtet – die Daten sind danach weg.',
        'Cloud-Konto, App-Sperre und Biometrie bleiben unberührt.',
      ];
      const footnote =
        pending.total > 0
          ? `Achtung: ${pending.total} Änderung${pending.total === 1 ? '' : 'en'} ${pending.total === 1 ? 'wurde' : 'wurden'} noch nicht synchronisiert und ${pending.total === 1 ? 'geht' : 'gehen'} dabei verloren.`
          : pending.syncConfigured
            ? 'Alle lokalen Änderungen sind synchronisiert.'
            : undefined;
      setTyped({ title: 'Lokale Daten zurücksetzen', bullets, confirmWord: 'ZURÜCKSETZEN', confirmLabel: 'Zurücksetzen', footnote });
      setFlow('local_reset');
    } finally {
      setBusy(null);
    }
  }

  function startCloudDelete() {
    setTyped({
      title: 'Cloud-Finanzdaten löschen',
      bullets: [
        'Alle synchronisierten Finanzdaten werden vom Server entfernt.',
        'Dein Konto bleibt bestehen – du kannst weiter neue Daten anlegen.',
        'Nach Ablauf ist eine Wiederherstellung aus der Cloud nicht mehr möglich.',
      ],
      confirmWord: 'LÖSCHEN',
      confirmLabel: 'Löschung beantragen',
      footnote: 'Es gibt ein Kulanzfenster von 3 Tagen. Bis dahin kannst du den Antrag jederzeit stornieren.',
    });
    setFlow('cloud_delete');
  }

  function startAccountDelete() {
    setTyped({
      title: 'Konto löschen',
      bullets: [
        'Alle Cloud-Finanzdaten und dein Premium-Status werden gelöscht.',
        'Dein Anmeldekonto wird endgültig entfernt.',
        'Lokale Daten auf diesem Gerät bleiben, bis du sie separat zurücksetzt.',
      ],
      confirmWord: 'LÖSCHEN',
      confirmLabel: 'Löschung beantragen',
      footnote: 'Kulanzfenster von 3 Tagen. Der Antrag ist bis dahin stornierbar; danach ist die Löschung endgültig.',
    });
    setFlow('account_delete');
  }

  async function confirmFlow() {
    if (!flow) return;
    setTyped((prev) => (prev ? { ...prev, busy: true } : prev));
    try {
      if (flow === 'local_reset') {
        const result = await wipeLocalFinanceData();
        setFlow(null);
        setTyped(null);
        if (result.ok) {
          await refreshFinanceData();
          setDialog({ title: 'Zurückgesetzt', message: 'Die lokalen Finanzdaten wurden entfernt.', confirmLabel: 'OK' });
        } else {
          setDialog({ title: 'Fehlgeschlagen', message: 'Der Reset konnte nicht abgeschlossen werden.', confirmLabel: 'OK' });
        }
        return;
      }
      const kind = flow === 'account_delete' ? 'account' : 'finance_data';
      const result = await requestDataDeletion(kind);
      setFlow(null);
      setTyped(null);
      if (result.ok) {
        await reload();
        setDialog({
          title: 'Antrag gestellt',
          message: 'Die Löschung wird nach 3 Tagen wirksam. Bis dahin kannst du sie hier stornieren.',
          confirmLabel: 'OK',
        });
      } else {
        setDialog({ title: 'Nicht möglich', message: result.message, confirmLabel: 'OK' });
      }
    } finally {
      setTyped((prev) => (prev ? { ...prev, busy: false } : prev));
    }
  }

  async function cancelDeletion() {
    setBusy('cancel');
    try {
      const result = await cancelDataDeletion();
      await reload();
      if (!result.ok) setDialog({ title: 'Nicht möglich', message: result.message, confirmLabel: 'OK' });
    } finally {
      setBusy(null);
    }
  }

  async function finishAccountDeletion() {
    setBusy('finalize');
    try {
      const result = await finalizeAccountDeletion();
      await reload();
      setDialog(
        result.ok
          ? { title: 'Konto gelöscht', message: 'Dein Konto und die Cloud-Daten wurden entfernt.', confirmLabel: 'OK' }
          : { title: 'Nicht abgeschlossen', message: result.message, confirmLabel: 'OK' },
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingHorizontal: spacing.md, paddingVertical: spacing.md }]}>
        <FinancePressable
          accessibilityRole="button"
          accessibilityLabel="Zurück"
          onPress={() => router.back()}
          intent="navigation"
          style={[styles.back, { backgroundColor: colors.surface, borderRadius: 23 }]}
          contentStyle={styles.backContent}
        >
          <Text style={[styles.backIcon, { color: colors.text }]}>‹</Text>
        </FinancePressable>
        <Text style={[typography.bodyMedium, { color: colors.text }]}>Daten & Datenschutz</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge }}>
        <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
          Deine Finanzdaten gehören dir. Hier sicherst, überträgst oder löschst du sie – jede Aktion ist bewusst getrennt und klar erklärt.
        </Text>

        <Text style={[typography.caption, styles.label, { color: colors.textMuted }]}>FINANZ-BACKUP</Text>
        <FinanceCard padded={false}>
          <SettingsRow
            title="Backup erstellen"
            description="Eine Datei mit deinen Finanzdaten – ohne Passwörter oder Bankzugänge"
            icon={<Text style={[styles.glyph, { color: colors.primary }]}>⇪</Text>}
            onPress={() => void createBackup()}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow
            title="Backup importieren"
            description="Datei prüfen, Vorschau ansehen, dann sicher zusammenführen"
            icon={<Text style={[styles.glyph, { color: colors.primary }]}>⇩</Text>}
            onPress={() => router.push('/backup-import' as Href)}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow
            title="Einzelne Daten exportieren"
            description="Umsätze als CSV · Budgets, Sparziele und Abos mit Premium"
            icon={<Text style={[styles.glyph, { color: colors.primary }]}>≡</Text>}
            onPress={() => router.push('/export' as Href)}
          />
        </FinanceCard>

        <Text style={[typography.caption, styles.label, { color: colors.textMuted, marginTop: spacing.xxl }]}>SYNCHRONISIERUNG</Text>
        <FinanceCard padded={false}>
          <SettingsRow
            title="Cloud-Sync"
            description={cloudSync.isBusy ? 'Synchronisiere…' : cloudSync.message}
            icon={<Text style={[styles.glyph, { color: cloudSync.status === 'synced' ? colors.positive : colors.info }]}>◇</Text>}
            onPress={() => void cloudSync.refreshCloudSync()}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <SettingsRow
            title="Cloud-Konto"
            description={signedIn ? 'Angemeldet · Ende-zu-Ende dir zugeordnet' : 'Kein Konto verbunden'}
            icon={<Text style={[styles.glyph, { color: colors.primary }]}>●</Text>}
            onPress={() => router.push('/cloud-account' as Href)}
          />
        </FinanceCard>

        <Text style={[typography.caption, styles.label, { color: colors.textMuted, marginTop: spacing.xxl }]}>LÖSCHEN</Text>

        {pendingDeletion ? (
          <FinanceCard style={{ borderColor: colors.warning, borderWidth: StyleSheet.hairlineWidth }}>
            <Text style={[typography.bodyMedium, { color: colors.text }]}>
              {pendingDeletion.kind === 'account' ? 'Konto-Löschung beantragt' : 'Cloud-Löschung beantragt'}
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              {pendingDeletion.due
                ? 'Das Kulanzfenster ist abgelaufen. Die Löschung wird bei der nächsten Synchronisierung ausgeführt.'
                : `Wird wirksam in ~${pendingDeletion.hours} Stunden. Du kannst den Antrag bis dahin stornieren.`}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
              <FinanceButton label="Antrag stornieren" variant="secondary" size="small" loading={busy === 'cancel'} onPress={() => void cancelDeletion()} />
              {pendingDeletion.due && pendingDeletion.kind === 'account' ? (
                <FinanceButton label="Jetzt abschließen" variant="danger" size="small" loading={busy === 'finalize'} onPress={() => void finishAccountDeletion()} />
              ) : null}
            </View>
          </FinanceCard>
        ) : (
          <FinanceCard padded={false}>
            <SettingsRow
              title="Lokale Daten zurücksetzen"
              description="Nur dieses Gerät – Cloud-Kopie bleibt erhalten"
              icon={<Text style={[styles.glyph, { color: colors.warning }]}>↺</Text>}
              onPress={() => void startLocalReset()}
            />
            {signedIn ? (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <SettingsRow
                  title="Cloud-Finanzdaten löschen"
                  description="Synchronisierte Daten vom Server entfernen · Konto bleibt"
                  icon={<Text style={[styles.glyph, { color: colors.negative }]}>⌫</Text>}
                  onPress={startCloudDelete}
                />
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <SettingsRow
                  title="Konto löschen"
                  description="Anmeldekonto und alle Cloud-Daten endgültig entfernen"
                  icon={<Text style={[styles.glyph, { color: colors.negative }]}>✕</Text>}
                  onPress={startAccountDelete}
                />
              </>
            ) : null}
          </FinanceCard>
        )}

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.lg }]}>
          Abmelden, lokal zurücksetzen, Cloud-Daten löschen und Konto löschen sind vier verschiedene Dinge. Die App lädt Backups nie automatisch hoch.
        </Text>
      </ScrollView>

      <TypedConfirmSheet
        visible={flow !== null}
        config={typed}
        onCancel={() => {
          setFlow(null);
          setTyped(null);
        }}
        onConfirm={() => void confirmFlow()}
      />
      <FinanceDialog visible={dialog !== null} config={dialog} onClose={() => setDialog(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 46, height: 46 },
  backContent: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 28, fontWeight: '600', marginTop: -2 },
  label: { letterSpacing: 1.2, marginBottom: 8, paddingHorizontal: 3 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 20 },
  glyph: { fontSize: 18, fontWeight: '600' },
});
