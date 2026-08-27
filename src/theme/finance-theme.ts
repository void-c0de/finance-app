import type {
  TextStyle,
} from 'react-native';

export const financeColors = {
  light: {
    background: '#F4F6F8',
    surface: '#FFFFFF',
    surfaceSecondary: '#EEF1F4',
    surfaceElevated: '#FFFFFF',
    surfaceInteractive: '#F2F5F8',
    surfacePressed: '#E7EBEF',

    text: '#101318',
    textSecondary: '#737A85',
    textMuted: '#9AA1AB',
    textInverse: '#FFFFFF',

    border: '#E5E8EC',
    borderStrong: '#D2D8DF',

    primary: '#246BFD',
    primaryPressed: '#1B56CE',
    primarySoft: '#EAF1FF',

    positive: '#14945E',
    positiveSoft: '#E7F6EF',

    negative: '#D94B4B',
    negativeSoft: '#FBECEC',

    warning: '#D98B16',
    warningSoft: '#FFF4DF',

    info: '#2B7FD9',
    infoSoft: '#E7F2FC',

    overlay: 'rgba(16, 19, 24, 0.45)',
    scrim: 'rgba(16, 19, 24, 0.28)',
  },

  dark: {
    background: '#0D0F12',
    surface: '#17191D',
    surfaceSecondary: '#22252A',
    surfaceElevated: '#1B1E23',
    surfaceInteractive: '#262A30',
    surfacePressed: '#2F343B',

    text: '#F7F7F8',
    textSecondary: '#9FA4AD',
    textMuted: '#747982',
    textInverse: '#0D0F12',

    border: '#292D33',
    borderStrong: '#3B4149',

    primary: '#5B8CFF',
    primaryPressed: '#4A79E6',
    primarySoft: '#16213A',

    positive: '#43C58A',
    positiveSoft: '#123125',

    negative: '#FF7474',
    negativeSoft: '#3A1E1E',

    warning: '#F2B84B',
    warningSoft: '#382B14',

    info: '#64A8F0',
    infoSoft: '#14283C',

    overlay: 'rgba(0, 0, 0, 0.62)',
    scrim: 'rgba(0, 0, 0, 0.45)',
  },

  amoled: {
    background: '#000000',
    surface: '#0A0A0A',
    surfaceSecondary: '#121212',
    surfaceElevated: '#101010',
    surfaceInteractive: '#151515',
    surfacePressed: '#1E1E1E',

    text: '#FFFFFF',
    textSecondary: '#A7A7AD',
    textMuted: '#73737A',
    textInverse: '#000000',

    border: '#1D1D1F',
    borderStrong: '#2C2C30',

    primary: '#5B8CFF',
    primaryPressed: '#4A79E6',
    primarySoft: '#10192E',

    positive: '#45D194',
    positiveSoft: '#0A2419',

    negative: '#FF7474',
    negativeSoft: '#2A1111',

    warning: '#F6BE55',
    warningSoft: '#261A08',

    info: '#64A8F0',
    infoSoft: '#0C1B29',

    overlay: 'rgba(0, 0, 0, 0.82)',
    scrim: 'rgba(0, 0, 0, 0.60)',
  },

  /*
   * Premium-Designs. Gleiche semantischen Tokens wie die freien Themes –
   * nur Hintergründe, Flächen, Text und der Akzent (primary) ändern sich.
   * Finanz-Semantik bleibt stabil: positive bleibt grün, negative rot,
   * warning bernstein – in JEDEM Theme.
   */
  ocean: {
    background: '#07131F',
    surface: '#0E1D2D',
    surfaceSecondary: '#132738',
    surfaceElevated: '#12212F',
    surfaceInteractive: '#17303F',
    surfacePressed: '#1E3B4C',

    text: '#EAF4FB',
    textSecondary: '#9FBACE',
    textMuted: '#6C8CA1',
    textInverse: '#07131F',

    border: '#1C3547',
    borderStrong: '#2C4B60',

    primary: '#3FC6E0',
    primaryPressed: '#2FA9C2',
    primarySoft: '#0C2B37',

    positive: '#45D194',
    positiveSoft: '#0A2B22',

    negative: '#FF7C7C',
    negativeSoft: '#2C1414',

    warning: '#F3BE58',
    warningSoft: '#2C2210',

    info: '#5FB6E6',
    infoSoft: '#0C2432',

    overlay: 'rgba(3, 12, 20, 0.82)',
    scrim: 'rgba(3, 12, 20, 0.58)',
  },

  emerald: {
    background: '#0B0F0D',
    surface: '#131A16',
    surfaceSecondary: '#1B241F',
    surfaceElevated: '#161E1A',
    surfaceInteractive: '#1F2B24',
    surfacePressed: '#28362E',

    text: '#EEF5F0',
    textSecondary: '#A6BDB1',
    textMuted: '#748C80',
    textInverse: '#0B0F0D',

    border: '#243029',
    borderStrong: '#35473C',

    primary: '#34D399',
    primaryPressed: '#26B383',
    primarySoft: '#0E2A20',

    positive: '#4ADE9A',
    positiveSoft: '#0E2A20',

    negative: '#F87171',
    negativeSoft: '#2A1414',

    warning: '#F0B84B',
    warningSoft: '#2A2210',

    info: '#5CC8B4',
    infoSoft: '#0E2A26',

    overlay: 'rgba(4, 8, 6, 0.82)',
    scrim: 'rgba(4, 8, 6, 0.58)',
  },

  rose: {
    background: '#120B0E',
    surface: '#1C1216',
    surfaceSecondary: '#26191F',
    surfaceElevated: '#20151A',
    surfaceInteractive: '#2C1E25',
    surfacePressed: '#37262E',

    text: '#F7EEF1',
    textSecondary: '#C9AEB7',
    textMuted: '#9A7D87',
    textInverse: '#120B0E',

    border: '#2F2027',
    borderStrong: '#452F39',

    primary: '#F472A0',
    primaryPressed: '#D95C89',
    primarySoft: '#2E1720',

    positive: '#4ED2A0',
    positiveSoft: '#0E2A22',

    negative: '#FF8080',
    negativeSoft: '#331616',

    warning: '#F2BC5A',
    warningSoft: '#2E2412',

    info: '#E58FB4',
    infoSoft: '#2C1820',

    overlay: 'rgba(8, 4, 6, 0.82)',
    scrim: 'rgba(8, 4, 6, 0.58)',
  },

  violet: {
    background: '#0D0A16',
    surface: '#161221',
    surfaceSecondary: '#1F1930',
    surfaceElevated: '#1A1528',
    surfaceInteractive: '#251E3A',
    surfacePressed: '#2F2748',

    text: '#F1EDFA',
    textSecondary: '#B7AED0',
    textMuted: '#867CA3',
    textInverse: '#0D0A16',

    border: '#281F3D',
    borderStrong: '#3B3057',

    primary: '#A78BFA',
    primaryPressed: '#8E6FE6',
    primarySoft: '#1F1738',

    positive: '#48D19A',
    positiveSoft: '#0E2A22',

    negative: '#FB7A9E',
    negativeSoft: '#2C1520',

    warning: '#F2BE5C',
    warningSoft: '#2C2312',

    info: '#8FB6F0',
    infoSoft: '#141F33',

    overlay: 'rgba(5, 4, 10, 0.82)',
    scrim: 'rgba(5, 4, 10, 0.58)',
  },

  graphite: {
    background: '#0B0C0D',
    surface: '#141618',
    surfaceSecondary: '#1D2023',
    surfaceElevated: '#17191C',
    surfaceInteractive: '#22262A',
    surfacePressed: '#2B3035',

    text: '#F2F4F6',
    textSecondary: '#AEB4BB',
    textMuted: '#7C8288',
    textInverse: '#0B0C0D',

    border: '#252A2E',
    borderStrong: '#39404A',

    primary: '#9FB4C7',
    primaryPressed: '#889CAE',
    primarySoft: '#1B2228',

    positive: '#49CE93',
    positiveSoft: '#0D2A20',

    negative: '#F2807F',
    negativeSoft: '#2A1615',

    warning: '#EDBB5C',
    warningSoft: '#2A2212',

    info: '#8FA9BE',
    infoSoft: '#182027',

    overlay: 'rgba(3, 4, 4, 0.82)',
    scrim: 'rgba(3, 4, 4, 0.58)',
  },

  midnight: {
    background: '#050609',
    surface: '#0C0E14',
    surfaceSecondary: '#12151E',
    surfaceElevated: '#0F1219',
    surfaceInteractive: '#171B26',
    surfacePressed: '#1F2431',

    text: '#EEF1F6',
    textSecondary: '#9CA6B7',
    textMuted: '#6B7486',
    textInverse: '#050609',

    border: '#1A1F2B',
    borderStrong: '#2A3140',

    primary: '#6E8BC4',
    primaryPressed: '#5B76AC',
    primarySoft: '#121A2B',

    positive: '#46CE93',
    positiveSoft: '#0C2A20',

    negative: '#EF7C86',
    negativeSoft: '#271417',

    warning: '#E7B85E',
    warningSoft: '#282011',

    info: '#7C9AD4',
    infoSoft: '#131C2E',

    overlay: 'rgba(1, 2, 4, 0.85)',
    scrim: 'rgba(1, 2, 4, 0.6)',
  },
} as const;

/**
 * Feste Vorschau-Farben für die Theme-Auswahl.
 *
 * Diese Farben bewusst NICHT vom aktiven Theme ableiten,
 * weil sie jeweils das Ziel-Theme zeigen sollen.
 */
export const financeThemePreviewColors = {
  light: '#FFFFFF',
  dark: '#17191D',
  amoled: '#000000',
  system: null,
  ocean: '#0E1D2D',
  emerald: '#131A16',
  rose: '#1C1216',
  violet: '#161221',
  graphite: '#141618',
  midnight: '#0C0E14',
} as const;

export type FinancePaletteName =
  | 'light'
  | 'dark'
  | 'amoled'
  | 'ocean'
  | 'emerald'
  | 'rose'
  | 'violet'
  | 'graphite'
  | 'midnight';

export type FinanceThemeName = 'system' | FinancePaletteName;

export type FinanceThemeTier = 'free' | 'premium';

export const FINANCE_THEMES: readonly {
  id: FinanceThemeName;
  label: string;
  description: string;
  tier: FinanceThemeTier;
  /** Palette used for the preview swatch (null = follows the system). */
  palette: FinancePaletteName | null;
  accent: string;
}[] = [
  { id: 'system', label: 'System', description: 'Folgt der Einstellung deines Geräts', tier: 'free', palette: null, accent: '#5B8CFF' },
  { id: 'light', label: 'Hell', description: 'Heller Hintergrund für Tageslicht', tier: 'free', palette: 'light', accent: '#246BFD' },
  { id: 'dark', label: 'Dunkel', description: 'Gedämpftes Dunkelgrau, augenschonend', tier: 'free', palette: 'dark', accent: '#5B8CFF' },
  { id: 'amoled', label: 'AMOLED', description: 'Reines Schwarz, spart Akku auf OLED', tier: 'free', palette: 'amoled', accent: '#5B8CFF' },
  { id: 'ocean', label: 'Ozean', description: 'Tiefes Navy mit kühlem Cyan-Akzent', tier: 'premium', palette: 'ocean', accent: '#3FC6E0' },
  { id: 'emerald', label: 'Smaragd', description: 'Anthrazit mit sattem Smaragdgrün', tier: 'premium', palette: 'emerald', accent: '#34D399' },
  { id: 'rose', label: 'Rosé', description: 'Warmes Dunkel mit weichem Roséton', tier: 'premium', palette: 'rose', accent: '#F472A0' },
  { id: 'violet', label: 'Violett', description: 'Tiefes Violett, ruhig und elegant', tier: 'premium', palette: 'violet', accent: '#A78BFA' },
  { id: 'graphite', label: 'Graphit', description: 'Neutrales Luxus-Grau mit Metallakzent', tier: 'premium', palette: 'graphite', accent: '#9FB4C7' },
  { id: 'midnight', label: 'Mitternacht', description: 'Fast schwarz mit dezentem Stahlblau', tier: 'premium', palette: 'midnight', accent: '#6E8BC4' },
];

export const FREE_THEME_NAMES: readonly FinanceThemeName[] = FINANCE_THEMES.filter(
  (theme) => theme.tier === 'free',
).map((theme) => theme.id);

export const PREMIUM_THEME_NAMES: readonly FinanceThemeName[] = FINANCE_THEMES.filter(
  (theme) => theme.tier === 'premium',
).map((theme) => theme.id);

export function isPremiumTheme(name: FinanceThemeName): boolean {
  return PREMIUM_THEME_NAMES.includes(name);
}

export function isFinanceThemeName(value: unknown): value is FinanceThemeName {
  return typeof value === 'string' && FINANCE_THEMES.some((theme) => theme.id === value);
}

/**
 * Löst einen Theme-Namen (inkl. `system`) zu einem konkreten Palettenschlüssel.
 * Die Berechtigungsprüfung (Premium) passiert im Hook, nicht hier.
 */
export function resolvePaletteName(
  name: FinanceThemeName,
  systemPrefersDark: boolean,
): FinancePaletteName {
  if (name === 'system') return systemPrefersDark ? 'dark' : 'light';
  return name;
}

export const financeSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const financeRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  xxl: 26,
  round: 999,
} as const;

export const financeTypography = {  display: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800' as const,
    letterSpacing: -1.2,
  },

  screenTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },

  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
  },

  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700' as const,
  },

  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
  },

  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },

  bodyMedium: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
  },

  small: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },

  smallMedium: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },

  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.4,
  },

  caption: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500' as const,
  },

  /*
   * Finanzielle Beträge.
   *
   * Tabellarische Ziffern sorgen für
   * stabile Ausrichtung und ruhende
   * Zahlen in Listen und Karten.
   */
  amountXL: {
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '800' as const,
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },

  amountL: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },

  amountM: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums'],
  },

  amountS: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<
  string,
  TextStyle
>;

export type FinanceColors =
  (typeof financeColors)['light'];

export type FinanceTypography =
  typeof financeTypography;
