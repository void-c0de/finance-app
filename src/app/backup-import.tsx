import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinancePressable } from '@/components/interaction/FinancePressable';
import { FinanceDialog, type FinanceDialogConfig } from '@/components/feedback/FinanceDialog';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { performFinanceHaptic } from '@/services/haptics';
import { BACKUP_LIMITS, inspectBackup, summarizeCounts, type BackupInspection } from '@/services/backupImportCore';
import { applyRestore } from '@/services/backupRestoreService';
import { useFinanceStore } from '@/stores/useFinanceStore';

type Phase =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'preview'; inspection: Extract<BackupInspection, { ok: true }> }
  | { step: 'restoring' }
  | { step: 'done'; written: number };

export default function BackupImportScreen() {
  const { colors, spacing, typography, radius } = useFinanceTheme();
  const refreshFinanceData = useFinanceStore((state) => state.refreshFinanceData);
  const [phase, setPhase] = useState<Phase>({ step: 'idle' });
  const [dialog, setDialog] = useState<FinanceDialogConfig | null>(null);

  async function pickFile() {
    try {
      await performFinanceHaptic('selection');
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.[0]) return;

      const asset = picked.assets[0];
      if (typeof asset.size === 'number' && asset.size > BACKUP_LIMITS.maxBytes) {
        setDialog({ title: 'Datei zu groß', message: 'Diese Datei ist größer als ein gültiges Finanz-Backup.', confirmLabel: 'OK' });
        return;
      }

      setPhase({ step: 'reading' });
      const text = await new File(asset.uri).text();
      const inspection = inspectBackup(text);

      if (!inspection.ok) {
        setPhase({ step: 'idle' });
        setDialog({
          title: 'Backup nicht gültig',
          message: inspection.issues.slice(0, 3).map((issue) => `• ${issue.detail}`).join('\n'),
          confirmLabel: 'Verstanden',
        });
        return;
      }
      setPhase({ step: 'preview', inspection });
    } catch {
      setPhase({ step: 'idle' });
      setDialog({ title: 'Datei konnte nicht gelesen werden', message: 'Bitte eine andere Datei wählen.', confirmLabel: 'OK' });
    }
  }

  async function runRestore() {
    if (phase.step !== 'preview') return;
    setPhase({ step: 'restoring' });
    const result = await applyRestore(phase.inspection.backup);
    if (!result.ok) {
      setPhase({ step: 'idle' });
      setDialog({
        title: 'Import abgebrochen',
        message: 'Beim Zusammenführen ist ein Fehler aufgetreten. Es wurde nichts verändert.',
        confirmLabel: 'OK',
      });
      return;
    }
    await refreshFinanceData();
    setPhase({ step: 'done', written: result.written });
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
        <Text style={[typography.bodyMedium, { color: colors.text }]}>Backup importieren</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge }}>
        {phase.step === 'idle' || phase.step === 'reading' ? (
          <>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.lg }]}>
              Wähle eine zuvor erstellte Backup-Datei. Sie wird zuerst streng geprüft, dann siehst du eine Vorschau – erst danach wird etwas geschrieben.
            </Text>
            <FinanceCard>
              <Text style={[typography.bodyMedium, { color: colors.text }]}>So läuft der Import ab</Text>
              {[
                'Datei prüfen: Format, Version, Beträge, Verknüpfungen',
                'Vorschau: was neu ist, was aktualisiert wird, was übersprungen wird',
                'Zusammenführen in einer Transaktion – bei Fehler bleibt alles unverändert',
                'Bereits neuere Daten (auch aus der Cloud) werden nie überschrieben',
              ].map((line) => (
                <View key={line} style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <Text style={[typography.body, { color: colors.textMuted }]}>{'·'}</Text>
                  <Text style={[typography.body, { color: colors.textSecondary, flex: 1 }]}>{line}</Text>
                </View>
              ))}
            </FinanceCard>
            <FinanceButton
              label={phase.step === 'reading' ? 'Datei wird gelesen…' : 'Backup-Datei wählen'}
              loading={phase.step === 'reading'}
              onPress={() => void pickFile()}
              style={{ marginTop: spacing.xl }}
            />
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.lg }]}>
              Eine Bank-Autorisierung wird durch einen Import nie wiederhergestellt – Bankverbindungen erscheinen als „muss neu verbunden werden“.
            </Text>
          </>
        ) : null}

        {phase.step === 'preview' ? (
          <>
            <FinanceCard>
              <Text style={[typography.sectionTitle, { color: colors.text }]}>Backup erkannt</Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxs }]}>
                Version {phase.inspection.backup.formatVersion}
                {phase.inspection.backup.createdAt ? ` · erstellt ${phase.inspection.backup.createdAt.slice(0, 10)}` : ''}
                {phase.inspection.backup.appVersion ? ` · App ${phase.inspection.backup.appVersion}` : ''}
              </Text>
              <View style={{ marginTop: spacing.md }}>
                {summarizeCounts(phase.inspection.counts).map((entry) => (
                  <View key={entry.domain} style={styles.countRow}>
                    <Text style={[typography.body, { color: colors.textSecondary }]}>{entry.label}</Text>
                    <Text style={[typography.bodyMedium, { color: colors.text }]}>{entry.count.toLocaleString('de-DE')}</Text>
                  </View>
                ))}
              </View>
            </FinanceCard>

            {phase.inspection.notes.length > 0 ? (
              <FinanceCard style={{ marginTop: spacing.md }}>
                <Text style={[typography.caption, { color: colors.textMuted }]}>Hinweise</Text>
                {phase.inspection.notes.map((note) => (
                  <Text key={note.detail} style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xxs }]}>
                    • {note.detail}
                  </Text>
                ))}
              </FinanceCard>
            ) : null}

            <View
              style={[
                styles.infoBox,
                { backgroundColor: colors.surfaceInteractive, borderRadius: radius.md, marginTop: spacing.md, padding: spacing.md },
              ]}
            >
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                Der Import fügt zusammen (Merge). Vorhandene Einträge bleiben, sofern sie neuer sind; bewusst gelöschte Einträge werden nicht wiederhergestellt.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
              <FinanceButton label="Abbrechen" variant="ghost" size="small" onPress={() => setPhase({ step: 'idle' })} style={{ flex: 1 }} />
              <FinanceButton label="Jetzt zusammenführen" size="small" onPress={() => void runRestore()} style={{ flex: 1 }} />
            </View>
          </>
        ) : null}

        {phase.step === 'restoring' ? (
          <FinanceCard>
            <Text style={[typography.bodyMedium, { color: colors.text }]}>Wird zusammengeführt…</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              Läuft in einer Transaktion. Bei einem Fehler bleibt alles unverändert.
            </Text>
          </FinanceCard>
        ) : null}

        {phase.step === 'done' ? (
          <FinanceCard>
            <Text style={[typography.sectionTitle, { color: colors.positive }]}>Import abgeschlossen</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              {phase.written.toLocaleString('de-DE')} Einträge wurden zusammengeführt. Neuere lokale Daten blieben unverändert.
            </Text>
            <FinanceButton label="Fertig" size="small" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
          </FinanceCard>
        ) : null}
      </ScrollView>

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
  countRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoBox: {},
});
