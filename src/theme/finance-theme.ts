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
} as const;

export type FinanceThemeName =
  | 'system'
  | 'light'
  | 'dark'
  | 'amoled';

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
