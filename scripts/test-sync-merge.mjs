import assert from 'node:assert/strict';

import {
  advanceCursor,
  isRowPendingPush,
  normalizeSyncTimestamp,
  shouldApplyIncomingRow,
  SYNC_EPOCH_CURSOR,
} from '../src/services/cloud/syncMergeCore.ts';

// --- normalizeSyncTimestamp ------------------------------------------------
assert.equal(normalizeSyncTimestamp('2026-08-27T10:00:00.000+00:00'), '2026-08-27T10:00:00.000Z');
assert.equal(normalizeSyncTimestamp('2026-08-27T10:00:00.000Z'), '2026-08-27T10:00:00.000Z');
assert.equal(normalizeSyncTimestamp(''), null);
assert.equal(normalizeSyncTimestamp(null), null);
assert.equal(normalizeSyncTimestamp(42), null);

// --- LWW: apply incoming unless strictly older ---------------------------
const older = '2026-08-01T00:00:00.000Z';
const newer = '2026-08-27T00:00:00.000Z';
assert.equal(shouldApplyIncomingRow(older, newer), true, 'newer remote wins');
assert.equal(shouldApplyIncomingRow(newer, older), false, 'older remote is ignored');
assert.equal(shouldApplyIncomingRow(newer, newer), true, 'tie goes to incoming (idempotent re-pull)');
assert.equal(shouldApplyIncomingRow(null, older), true, 'no local timestamp -> apply');
assert.equal(
  shouldApplyIncomingRow('2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000+00:00'),
  true,
  'offset and Z forms compare equal',
);

// --- push selection: tombstones always, otherwise after cursor ----------
const cursor = '2026-08-10T00:00:00.000Z';
assert.equal(isRowPendingPush({ updated_at: newer, deleted_at: null }, cursor), true);
assert.equal(isRowPendingPush({ updated_at: older, deleted_at: null }, cursor), false);
assert.equal(
  isRowPendingPush({ updated_at: older, deleted_at: '2026-08-05T00:00:00.000Z' }, cursor),
  true,
  'a tombstone must propagate even when updated_at is behind the cursor',
);
assert.equal(isRowPendingPush({ updated_at: null, deleted_at: null }, cursor), false);

// --- cursor only moves forward -----------------------------------------
assert.equal(advanceCursor(cursor, newer), newer);
assert.equal(advanceCursor(newer, older), newer, 'cursor never goes backwards');
assert.equal(advanceCursor(cursor, 'not-a-date-but-lexically-large'), 'not-a-date-but-lexically-large');
assert.equal(advanceCursor(cursor, null), cursor);
assert.equal(SYNC_EPOCH_CURSOR, '1970-01-01T00:00:00.000Z');

console.log('Sync merge semantics: all tests passed');
