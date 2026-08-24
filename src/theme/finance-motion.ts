export const financeMotion = {
  duration: {
    instant: 80,
    fast: 150,
    normal: 240,
    slow: 360,
    expressive: 420,
    pulseHalf: 900,
  },

  press: {
    /**
     * Standard-Press für wichtige Aktionen.
     */
    scale: 0.975,

    /**
     * Subtiler Press für reine Navigation.
     */
    subtleScale: 0.988,

    springSpeed: 28,
    releaseSpeed: 24,
  },

  enter: {
    offset: 24,
    scale: 0.985,
  },

  search: {
    entranceTranslateY: 28,
    entranceScale: 0.985,
    springSpeed: 18,
  },
} as const;

export type FinanceMotion = typeof financeMotion;
