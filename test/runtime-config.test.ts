import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  generateInviteCode,
  isInviteActive,
  normalizeFlagKey,
  normalizeInviteCode
} from '../src/domain/ops/runtime-config.js';

test('runtime config helpers normalize flag and invite identifiers', () => {
  assert.equal(normalizeFlagKey('  inviteOnlyRegistration  '), 'inviteOnlyRegistration');
  assert.equal(normalizeInviteCode('  abcd-efgh-ijkl  '), 'ABCD-EFGH-IJKL');
});

test('generateInviteCode returns the expected grouped uppercase format', () => {
  const code = generateInviteCode();
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test('isInviteActive enforces enabled, expiry, and redemption state', () => {
  assert.equal(
    isInviteActive({
      enabled: true,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      redeemedAt: null
    }),
    true
  );

  assert.equal(
    isInviteActive({
      enabled: false,
      expiresAt: null,
      redeemedAt: null
    }),
    false
  );

  assert.equal(
    isInviteActive({
      enabled: true,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      redeemedAt: null
    }),
    false
  );

  assert.equal(
    isInviteActive({
      enabled: true,
      expiresAt: null,
      redeemedAt: new Date().toISOString()
    }),
    false
  );
});
