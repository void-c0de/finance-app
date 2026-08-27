import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinanceTextField } from '@/components/forms/FinanceTextField';
import { useFinanceTheme } from '@/hooks/use-finance-theme';

/**
 * Bestätigungs-Sheet für stark destruktive Aktionen.
 *
 * Sicherheits-Reibung, keine manipulative Reibung: klare Erklärung, was
 * gelöscht wird und was bleibt, plus getippte Bestätigung. Kein Confirm-Shaming,
 * die Abbrechen-Aktion ist gleichwertig und neutral formuliert.
 */

export type TypedConfirmConfig = {
  title: string;
  /** Punkte: was passiert / was bleibt. */
  bullets: readonly string[];
  /** Exaktes Wort, das der Nutzer tippen muss (z. B. „LÖSCHEN"). */
  confirmWord: string;
  confirmLabel: string;
  /** Optionaler Hinweis unter den Punkten (z. B. Kulanzfenster / Warnung). */
  footnote?: string;
  busy?: boolean;
};

export function TypedConfirmSheet({
  visible,
  config,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  config: TypedConfirmConfig | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors, spacing, radius, typography } = useFinanceTheme();
  const [entry, setEntry] = useState('');

  useEffect(() => {
    if (!visible) setEntry('');
  }, [visible]);

  if (!config) return null;
  const matches = entry.trim().toUpperCase() === config.confirmWord.toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderRadius: radius.lg, padding: spacing.xl }]}>
          <Text style={[typography.sectionTitle, { color: colors.text }]}>{config.title}</Text>

          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {config.bullets.map((bullet) => (
              <View key={bullet} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Text style={[typography.body, { color: colors.textMuted }]}>·</Text>
                <Text style={[typography.body, { color: colors.textSecondary, flex: 1 }]}>{bullet}</Text>
              </View>
            ))}
          </View>

          {config.footnote ? (
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md }]}>{config.footnote}</Text>
          ) : null}

          <FinanceTextField
            label={`Zum Bestätigen „${config.confirmWord}" eingeben`}
            value={entry}
            onChangeText={setEntry}
            autoCapitalize="characters"
            autoCorrect={false}
            containerStyle={{ marginTop: spacing.lg }}
          />

          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
            <FinanceButton label="Abbrechen" variant="ghost" size="small" onPress={onCancel} style={{ flex: 1 }} />
            <FinanceButton
              label={config.confirmLabel}
              variant="danger"
              size="small"
              disabled={!matches || config.busy}
              loading={config.busy}
              onPress={onConfirm}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 420 },
});
