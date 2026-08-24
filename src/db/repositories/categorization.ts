import {
    getDatabase,
} from '@/db/database';

export type CategoryAssignmentSource =
  | 'manual'
  | 'rule'
  | 'auto';

/**
 * Setzt Kategorie + Herkunft einer
 * Transaktion.
 *
 * Kanonische Funktion für ALLE Schreib-
 * pfade (manuell, Regel, automatisch),
 * damit category_source nie auseinander-
 * läuft. updated_at pflegt der DB-Trigger,
 * wodurch der Cloud-Sync die Änderung
 * automatisch propagiert.
 */
export async function setTransactionCategory(
  transactionId:
    string,

  categoryId:
    | string
    | null,

  source: CategoryAssignmentSource = 'manual',
): Promise<void> {
  const db =
    await getDatabase();

  const result =
    await db.runAsync(
      `
        UPDATE transactions
        SET category_id = ?,
            category_source = ?
        WHERE id = ?;
      `,

      categoryId,

      categoryId === null
        ? 'none'

        : source,

      transactionId,
    );

  if (
    result.changes ===
    0
  ) {
    throw new Error(
      `Transaktion nicht gefunden: ${transactionId}`,
    );
  }
}
