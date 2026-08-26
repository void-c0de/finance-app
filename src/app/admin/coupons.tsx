import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FinanceDialog, type FinanceDialogConfig } from '@/components/feedback/FinanceDialog';
import { FinanceCard } from '@/components/finance/FinanceCard';
import { FinanceTextField } from '@/components/forms/FinanceTextField';
import { FinanceButton } from '@/components/interaction/FinanceButton';
import { FinanceKeyboardScreen } from '@/components/layout/FinanceKeyboardScreen';
import { useFinanceTheme } from '@/hooks/use-finance-theme';
import { createPremiumCoupon, listPremiumCoupons, setPremiumCouponActive, type PremiumCoupon } from '@/services/adminProduct';
import { useProductAccessStore } from '@/stores/useProductAccessStore';

const durations = [7, 30, 90, 365];

export default function CouponAdminScreen() {
  const { colors, spacing, typography } = useFinanceTheme();
  const { access, isLoading, refresh } = useProductAccessStore();
  const [coupons, setCoupons] = useState<PremiumCoupon[]>([]);
  const [code, setCode] = useState('');
  const [duration, setDuration] = useState(30);
  const [maxUses, setMaxUses] = useState('');
  const [note, setNote] = useState('');
  const [permanent, setPermanent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<FinanceDialogConfig | null>(null);

  const load = useCallback(async () => {
    try { setCoupons(await listPremiumCoupons()); }
    catch { setMessage('Coupons konnten nicht geladen werden.'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (access.isSuperuser) void load(); }, [access.isSuperuser, load]);

  if (!isLoading && !access.isSuperuser) return <Redirect href="/(tabs)/more" />;

  async function create() {
    if (busy) return;
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(normalized)) {
      setMessage('4–32 Zeichen: A–Z, 0–9, _ oder -.'); return;
    }
    const parsedUses = maxUses.trim() ? Number(maxUses) : null;
    if (parsedUses !== null && (!Number.isInteger(parsedUses) || parsedUses < 1)) {
      setMessage('Maximale Nutzungen muss leer oder mindestens 1 sein.'); return;
    }
    setBusy(true); setMessage(null);
    try {
      await createPremiumCoupon({ code: normalized, durationDays: duration, maxUses: parsedUses, note: note.trim() || null, permanent });
      setCode(''); setMaxUses(''); setNote(''); setPermanent(false); setDuration(30);
      setMessage('Coupon wurde erstellt.'); await load();
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes('duplicate') ? 'Dieser Coupon-Code existiert bereits.' : 'Coupon konnte nicht erstellt werden.');
    } finally { setBusy(false); }
  }

  function confirmToggle(coupon: PremiumCoupon) {
    setDialog({
      title: coupon.active ? 'Coupon deaktivieren?' : 'Coupon aktivieren?',
      message: `${coupon.code} wird ${coupon.active ? 'für neue Einlösungen gesperrt' : 'wieder freigegeben'}. Bestehendes Premium bleibt erhalten.`,
      tone: coupon.active ? 'danger' : 'default',
      confirmLabel: coupon.active ? 'Deaktivieren' : 'Aktivieren',
      cancelLabel: 'Abbrechen',
      onConfirm: () => { void (async () => { try { await setPremiumCouponActive(coupon.id, !coupon.active); await load(); } catch { setMessage('Status konnte nicht geändert werden.'); } })(); },
    });
  }

  return (
    <>
      <FinanceKeyboardScreen backgroundColor={colors.background} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxxl }}>
        <View style={styles.header}><FinanceButton label="‹" variant="ghost" size="small" onPress={() => router.back()} /><Text style={[typography.title, { color: colors.text }]}>Premium-Coupons</Text><View style={styles.spacer} /></View>
        <FinanceCard style={{ marginTop: spacing.xl }}>
          <FinanceTextField label="Coupon-Code" value={code} placeholder="WELCOME30" autoCapitalize="characters" autoCorrect={false} maxLength={32} onChangeText={(value) => setCode(value.toUpperCase().replace(/\s/g, ''))} />
          <Text style={[typography.label, { color: colors.textSecondary, marginTop: spacing.lg }]}>Premium-Dauer</Text>
          <View style={[styles.wrap, { gap: spacing.sm, marginTop: spacing.sm }]}>
            {durations.map((days) => <FinanceButton key={days} label={`${days} Tage`} size="small" variant={!permanent && duration === days ? 'primary' : 'secondary'} onPress={() => { setPermanent(false); setDuration(days); }} />)}
            <FinanceButton label="Permanent" size="small" variant={permanent ? 'primary' : 'secondary'} onPress={() => setPermanent(true)} />
          </View>
          <FinanceTextField label="Maximale Nutzungen" value={maxUses} keyboardType="number-pad" placeholder="Leer = unbegrenzt" onChangeText={setMaxUses} containerStyle={{ marginTop: spacing.lg }} />
          <FinanceTextField label="Interne Notiz" value={note} placeholder="Optional" maxLength={160} onChangeText={setNote} containerStyle={{ marginTop: spacing.lg }} />
          {message ? <Text style={[typography.small, { color: message.includes('erstellt') ? colors.positive : colors.negative, marginTop: spacing.sm }]}>{message}</Text> : null}
          <FinanceButton label="Coupon erstellen" loading={busy} disabled={code.length < 4} onPress={() => { void create(); }} style={{ marginTop: spacing.lg }} />
        </FinanceCard>

        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xxxl, marginBottom: spacing.sm }]}>BESTEHENDE COUPONS</Text>
        {coupons.length === 0 ? <FinanceCard><Text style={[typography.body, { color: colors.textSecondary }]}>Noch keine Coupons.</Text></FinanceCard> : coupons.map((coupon) => {
          const uses = coupon.coupon_redemptions?.[0]?.count ?? 0;
          return <FinanceCard key={coupon.id} style={{ marginBottom: spacing.md }}>
            <View style={styles.row}><View style={styles.flex}><Text style={[typography.cardTitle, { color: colors.text }]}>{coupon.code}</Text><Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>{coupon.permanent ? 'Permanent' : `${coupon.duration_days} Tage`} · {uses}{coupon.max_uses ? `/${coupon.max_uses}` : ''} eingelöst · {coupon.active ? 'Aktiv' : 'Deaktiviert'}</Text></View><FinanceButton label={coupon.active ? 'Deaktivieren' : 'Aktivieren'} size="small" variant={coupon.active ? 'danger' : 'secondary'} onPress={() => confirmToggle(coupon)} /></View>
          </FinanceCard>;
        })}
      </FinanceKeyboardScreen>
      <FinanceDialog visible={dialog !== null} config={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

const styles = StyleSheet.create({ header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, spacer: { width: 44 }, wrap: { flexDirection: 'row', flexWrap: 'wrap' }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, flex: { flex: 1 } });
