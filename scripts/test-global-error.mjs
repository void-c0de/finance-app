import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Pure description of an uncaught error / rejection → debugLog tuple. */

const m = await import('../src/core/uncaughtError.ts');

// --- Error instance -----------------------------------------------------
{
  const err = new TypeError('Cannot read properties of undefined (reading "x")');
  const { message, details } = m.describeUncaught(err, { fatal: true, kind: 'error' });
  assert.match(message, /^UncaughtError \(fatal\): TypeError$/);
  assert.equal(details.name, 'TypeError');
  assert.equal(details.fatal, true);
  assert.match(String(details.reason), /Cannot read properties/);
  assert.ok(message.split('\n').length === 1, 'message is a single line');
}

// --- rejection with a string reason -----------------------------------
{
  const { message, details } = m.describeUncaught('network down', { kind: 'rejection' });
  assert.match(message, /^UnhandledRejection: Error$/);
  assert.equal(details.reason, 'network down');
  assert.equal(details.fatal, false);
}

// --- non-serializable / circular ------------------------------------
{
  const circular = {};
  circular.self = circular;
  const { details } = m.describeUncaught(circular, { kind: 'rejection' });
  assert.ok(typeof details.reason === 'string', 'circular reason is stringified, not thrown');
}

// --- long reason is truncated -------------------------------------
{
  const { details } = m.describeUncaught(new Error('x'.repeat(5000)), { kind: 'error' });
  assert.ok(String(details.reason).length <= 300, 'reason capped at 300 chars');
  assert.ok(String(details.stack ?? '').length <= 600, 'stack capped at 600 chars');
}

// --- rejection (non-fatal) kind -------------------------------------
{
  const { message } = m.describeUncaught(new RangeError('bad index'), { kind: 'rejection' });
  assert.equal(message, 'UnhandledRejection: RangeError');
}

// --- the install glue (globalErrorHandler.ts) preserves the previous handler --
// (RN-only: assert by source that it calls previous(...) after logging and never swallows)
const src = readFileSync('src/core/globalErrorHandler.ts', 'utf8');
assert.match(src, /const previous = eu\.getGlobalHandler\(\)/);
assert.match(src, /previous\?\.\(error, isFatal\)/, 'previous RN handler is still called after logging');
assert.match(src, /if \(installed\) return;/, 'install is idempotent');
assert.match(src, /rejection-tracking/, 'unhandled promise rejections are tracked');
assert.ok(!/console\.(log|warn|error)/.test(src), 'no raw console use — goes through debugLog (redacted)');

console.log('Global error handler: describeUncaught (single-line, capped, circular-safe) + install preserves the previous handler, no swallow — verified');
