import assert from 'node:assert/strict';

import {
  redactSensitiveLogText,
} from '../src/core/debugLog.ts';

const jwt =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0LXVzZXIifQ.signature123456';

const redacted = redactSensitiveLogText(
  `Authorization: Bearer provider-token-123 access_token=abc123 refresh_token: "refresh456" client_secret=secret789 password=hunter2 jwt=${jwt} code=BNK-TINK-002 id=123e4567-e89b-12d3-a456-426614174000`,
);

assert.equal(redacted.includes('provider-token-123'), false);
assert.equal(redacted.includes('abc123'), false);
assert.equal(redacted.includes('refresh456'), false);
assert.equal(redacted.includes('secret789'), false);
assert.equal(redacted.includes('hunter2'), false);
assert.equal(redacted.includes(jwt), false);
assert.equal(redacted.includes('BNK-TINK-002'), true);
assert.equal(redacted.includes('123e4567-e89b-12d3-a456-426614174000'), true);

console.log('Debug log redaction: OK');
