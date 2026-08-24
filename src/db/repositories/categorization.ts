import {
    getDatabase,
} from '@/db/database';

export async function setTransactionCategory(
  transactionId:
    string,

  categoryId:
    string
): Promise<void> {
  const db =
    await getDatabase();

  await db.runAsync(
    `
      UPDATE transactions
      SET category_id = ?
      WHERE id = ?;
    `,

    categoryId,

    transactionId
  );
}