import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import {
  isFinanceThemeName,
  isPremiumTheme,
  type FinanceThemeName,
} from '@/theme/finance-theme';

const THEME_STORAGE_KEY = 'finance_theme';
const LAST_FREE_THEME_KEY = 'finance_theme_last_free';

const DEFAULT_THEME: FinanceThemeName = 'amoled';

interface ThemeState {
  /** Die tatsächliche Nutzerpräferenz – kann ein Premium-Theme sein, auch ohne Premium. */
  themeName: FinanceThemeName;
  /** Zuletzt gewähltes kostenloses Theme – visueller Fallback, wenn Premium inaktiv ist. */
  lastFreeTheme: FinanceThemeName;
  hasHydrated: boolean;

  setThemeName: (themeName: FinanceThemeName) => Promise<void>;
  hydrateTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeName: DEFAULT_THEME,
  lastFreeTheme: DEFAULT_THEME,
  hasHydrated: false,

  setThemeName: async (themeName) => {
    if (!isFinanceThemeName(themeName)) return;

    const patch: Partial<ThemeState> = { themeName };
    if (!isPremiumTheme(themeName)) {
      patch.lastFreeTheme = themeName;
    }
    set(patch);

    try {
      await SecureStore.setItemAsync(THEME_STORAGE_KEY, themeName);
      if (patch.lastFreeTheme) {
        await SecureStore.setItemAsync(LAST_FREE_THEME_KEY, patch.lastFreeTheme);
      }
    } catch (error) {
      console.error('Theme preference could not be saved:', error);
    }
  },

  hydrateTheme: async () => {
    if (get().hasHydrated) return;

    try {
      const [saved, savedFree] = await Promise.all([
        SecureStore.getItemAsync(THEME_STORAGE_KEY),
        SecureStore.getItemAsync(LAST_FREE_THEME_KEY),
      ]);
      const themeName = isFinanceThemeName(saved) ? saved : DEFAULT_THEME;
      const lastFreeTheme =
        isFinanceThemeName(savedFree) && !isPremiumTheme(savedFree)
          ? savedFree
          : isPremiumTheme(themeName)
            ? DEFAULT_THEME
            : themeName;
      set({ themeName, lastFreeTheme, hasHydrated: true });
    } catch (error) {
      console.error('Theme preference could not be loaded:', error);
      set({ themeName: DEFAULT_THEME, lastFreeTheme: DEFAULT_THEME, hasHydrated: true });
    }
  },
}));
