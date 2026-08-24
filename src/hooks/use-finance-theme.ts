import { useColorScheme } from 'react-native';

import { useThemeStore } from '@/stores/useThemeStore';
import {
    financeColors,
    financeRadius,
    financeSpacing,
    financeTypography,
} from '@/theme/finance-theme';

export function useFinanceTheme() {
  const systemColorScheme = useColorScheme();

  const selectedTheme =
    useThemeStore(
      (state) => state.themeName
    );

  const resolvedTheme =
    selectedTheme === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : selectedTheme;

  const colors =
    resolvedTheme === 'amoled'
      ? financeColors.amoled
      : resolvedTheme === 'dark'
        ? financeColors.dark
        : financeColors.light;

  return {
    selectedTheme,
    themeName: resolvedTheme,

    isDark:
      resolvedTheme === 'dark' ||
      resolvedTheme === 'amoled',

    isAmoled:
      resolvedTheme === 'amoled',

    colors,
    spacing: financeSpacing,
    radius: financeRadius,
    typography: financeTypography,
  };
}