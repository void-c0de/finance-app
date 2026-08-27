import { useColorScheme } from 'react-native';

import { hasCapability } from '@/services/entitlementCore';
import { useProductAccessStore } from '@/stores/useProductAccessStore';
import { useThemeStore } from '@/stores/useThemeStore';
import {
  financeColors,
  financeRadius,
  financeSpacing,
  financeTypography,
  isPremiumTheme,
  resolvePaletteName,
  type FinanceThemeName,
} from '@/theme/finance-theme';

export function useFinanceTheme() {
  const systemColorScheme = useColorScheme();
  const selectedTheme = useThemeStore((state) => state.themeName);
  const lastFreeTheme = useThemeStore((state) => state.lastFreeTheme);
  const access = useProductAccessStore((state) => state.access);

  const premiumThemesUnlocked = hasCapability(access, 'premium_themes');

  /*
   * Die Nutzerpräferenz bleibt erhalten. Ist sie ein Premium-Theme und Premium
   * gerade nicht aktiv, wird visuell auf das zuletzt gewählte kostenlose Theme
   * zurückgefallen – die Präferenz wird NICHT gelöscht und kehrt zurück, sobald
   * Premium wieder aktiv ist.
   */
  const effectiveTheme: FinanceThemeName =
    isPremiumTheme(selectedTheme) && !premiumThemesUnlocked ? lastFreeTheme : selectedTheme;

  const palette = resolvePaletteName(effectiveTheme, systemColorScheme === 'dark');
  const colors = financeColors[palette];

  return {
    /** Rohpräferenz des Nutzers (für die Theme-Auswahl). */
    selectedTheme,
    /** Tatsächlich angewandtes Theme nach Berechtigungsprüfung. */
    themeName: palette,
    premiumThemesUnlocked,
    premiumThemeFallbackActive: isPremiumTheme(selectedTheme) && !premiumThemesUnlocked,

    isDark: palette !== 'light',
    isAmoled: palette === 'amoled',

    colors,
    spacing: financeSpacing,
    radius: financeRadius,
    typography: financeTypography,
  };
}
