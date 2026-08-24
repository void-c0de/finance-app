import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { FinanceThemeName } from '@/theme/finance-theme';

const THEME_STORAGE_KEY = 'finance_theme';

const validThemes: FinanceThemeName[] = [
  'system',
  'light',
  'dark',
  'amoled',
];

function isFinanceThemeName(
  value: string | null
): value is FinanceThemeName {
  return (
    value !== null &&
    validThemes.includes(value as FinanceThemeName)
  );
}

interface ThemeState {
  themeName: FinanceThemeName;
  hasHydrated: boolean;

  setThemeName: (
    themeName: FinanceThemeName
  ) => Promise<void>;

  hydrateTheme: () => Promise<void>;
}

export const useThemeStore =
  create<ThemeState>((set, get) => ({
    themeName: 'amoled',
    hasHydrated: false,

    setThemeName: async (themeName) => {
      set({
        themeName,
      });

      try {
        await SecureStore.setItemAsync(
          THEME_STORAGE_KEY,
          themeName
        );
      } catch (error) {
        console.error(
          'Theme preference could not be saved:',
          error
        );
      }
    },

    hydrateTheme: async () => {
      if (get().hasHydrated) {
        return;
      }

      try {
        const savedTheme =
          await SecureStore.getItemAsync(
            THEME_STORAGE_KEY
          );

        set({
          themeName: isFinanceThemeName(
            savedTheme
          )
            ? savedTheme
            : 'amoled',
          hasHydrated: true,
        });
      } catch (error) {
        console.error(
          'Theme preference could not be loaded:',
          error
        );

        set({
          themeName: 'amoled',
          hasHydrated: true,
        });
      }
    },
  }));