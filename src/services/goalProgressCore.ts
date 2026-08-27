export type GoalProgressInput = {
  trackingMode: 'manual' | 'transaction_rule' | 'account_balance';
  startingAmountMinor: number;
  contributionAmountsMinor: readonly number[];
  linkedAccountBalanceMinor?: number | null;
  lastKnownAmountMinor: number;
};

export type GoalProgressResolution = {
  amountMinor: number;
  source: 'contributions' | 'account_balance' | 'last_known';
  linkedAccountAvailable: boolean;
};

/**
 * Rohes Fortschrittsverhältnis (0 = nichts, 1 = Ziel erreicht).
 * Bewusst NICHT bei 1 gedeckelt: Werte über dem Ziel bleiben sichtbar
 * (z. B. 1,2 = 120 %). Ein Ziel ohne positiven Zielbetrag ergibt 0.
 */
export function goalProgressRatio(currentAmountMinor: number, targetAmountMinor: number): number {
  if (targetAmountMinor <= 0) return 0;
  return Math.max(0, currentAmountMinor / targetAmountMinor);
}

/** Ganzzahliger Prozentwert für die Anzeige (kann > 100 sein). */
export function goalProgressPercent(currentAmountMinor: number, targetAmountMinor: number): number {
  return Math.round(goalProgressRatio(currentAmountMinor, targetAmountMinor) * 100);
}

/**
 * Breite des Fortschrittsbalkens in Prozent: optisch immer zwischen 2 % und
 * 100 % begrenzt, während die numerische Anzeige den echten Wert behält.
 */
export function goalProgressBarPercent(currentAmountMinor: number, targetAmountMinor: number): number {
  return Math.min(100, Math.max(2, goalProgressPercent(currentAmountMinor, targetAmountMinor)));
}

export function resolveGoalProgress(input: GoalProgressInput): GoalProgressResolution {
  if (input.trackingMode === 'account_balance') {
    if (typeof input.linkedAccountBalanceMinor === 'number') {
      return {
        amountMinor: Math.max(0, input.linkedAccountBalanceMinor),
        source: 'account_balance',
        linkedAccountAvailable: true,
      };
    }

    return {
      amountMinor: input.lastKnownAmountMinor,
      source: 'last_known',
      linkedAccountAvailable: false,
    };
  }

  return {
    amountMinor:
      input.startingAmountMinor +
      input.contributionAmountsMinor.reduce((sum, amount) => sum + amount, 0),
    source: 'contributions',
    linkedAccountAvailable: true,
  };
}
