export type GoalProgressInput = {
  trackingMode: 'manual' | 'transaction_rule' | 'account_balance' | 'hybrid';
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
