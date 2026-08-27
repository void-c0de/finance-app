import assert from 'node:assert/strict';

import { buildAttentionItems, highestAttentionPriority } from '../src/services/attentionCore.ts';

const empty = buildAttentionItems({
  uncategorizedExpenseCount: 0,
  uncertainRecurringCount: 0,
  overBudgetCount: 0,
  bankConnections: [],
  cloudSyncFailed: false,
});
assert.deepEqual(empty, [], 'Nichts zu tun => leere Liste');
assert.equal(highestAttentionPriority(empty), null);

const full = buildAttentionItems({
  uncategorizedExpenseCount: 4,
  uncertainRecurringCount: 2,
  overBudgetCount: 1,
  bankConnections: [
    { id: 'c1', institutionName: 'Sparkasse', status: 'revoked' },
    { id: 'c2', institutionName: 'DKB', status: 'temporarily_unavailable' },
    { id: 'c3', institutionName: 'ING', status: 'active' },
  ],
  cloudSyncFailed: true,
});

// critical first, informational last
assert.equal(full[0].priority, 'critical');
assert.equal(full[0].id, 'bank:c1');
assert.equal(full[full.length - 1].priority, 'informational');
assert.equal(full[full.length - 1].id, 'bank:c2');
assert.equal(highestAttentionPriority(full), 'critical');

// active connection produces nothing
assert.equal(full.some((item) => item.id === 'bank:c3'), false);

// deterministic ordering by priority then count
const priorities = full.map((item) => item.priority);
const order = { critical: 0, action_required: 1, review: 2, informational: 3 };
for (let i = 1; i < priorities.length; i += 1) {
  assert.ok(order[priorities[i - 1]] <= order[priorities[i]], 'nach Priorität sortiert');
}

// missed recurring becomes a review item that deep-links to analytics
const withMissed = buildAttentionItems({
  uncategorizedExpenseCount: 0,
  uncertainRecurringCount: 0,
  overBudgetCount: 0,
  bankConnections: [],
  cloudSyncFailed: false,
  missedRecurring: [{ seriesKey: 'k1', title: 'Spotify' }],
});
assert.equal(withMissed.length, 1);
assert.equal(withMissed[0].priority, 'review');
assert.equal(withMissed[0].route, '/analytics');
assert.ok(withMissed[0].title.includes('Spotify'));
assert.ok(withMissed[0].detail.toLowerCase().includes('kündigung'));

// transient state never escalates
const transientOnly = buildAttentionItems({
  uncategorizedExpenseCount: 0,
  uncertainRecurringCount: 0,
  overBudgetCount: 0,
  bankConnections: [{ id: 'c', institutionName: 'X', status: 'temporarily_unavailable' }],
  cloudSyncFailed: false,
});
assert.equal(transientOnly.length, 1);
assert.equal(transientOnly[0].priority, 'informational');

console.log('Attention center: all tests passed');
