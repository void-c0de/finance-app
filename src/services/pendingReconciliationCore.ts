export type PendingCandidate = {
  id: string;
  externalTransactionId?: string;
  amountMinor: number;
  currency: string;
  direction: 'income' | 'expense';
  bookingDate: string;
  description: string;
  counterpartyName?: string;
};

export type BookedCandidate = Omit<PendingCandidate, 'id'>;

function identityText(value: PendingCandidate | BookedCandidate): string {
  return (value.counterpartyName ?? value.description)
    .toLocaleLowerCase('de-DE')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/[^a-zäöüß0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findReplacedPendingId(
  booked: BookedCandidate,
  pendingRows: readonly PendingCandidate[],
): string | null {
  if (booked.externalTransactionId) {
    const sameExternalId = pendingRows.find(
      (row) => row.externalTransactionId === booked.externalTransactionId,
    );

    if (sameExternalId) {
      return null;
    }
  }

  const bookedTime = Date.parse(booked.bookingDate);

  const matches = pendingRows
    .filter((row) => {
      const distanceDays = Math.abs(
        Date.parse(row.bookingDate) - bookedTime,
      ) / (24 * 60 * 60 * 1000);

      return (
        row.amountMinor === booked.amountMinor &&
        row.currency === booked.currency &&
        row.direction === booked.direction &&
        distanceDays <= 7 &&
        identityText(row) === identityText(booked)
      );
    })
    .sort(
      (left, right) =>
        Math.abs(Date.parse(left.bookingDate) - bookedTime) -
        Math.abs(Date.parse(right.bookingDate) - bookedTime),
    );

  return matches.length === 1
    ? matches[0].id
    : null;
}
