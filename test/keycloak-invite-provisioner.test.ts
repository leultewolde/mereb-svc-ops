import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { KeycloakInviteProvisionerAdapter } from '../src/adapters/outbound/invites/keycloak-invite-provisioner.js';

vi.mock('node:crypto', () => ({
  randomUUID: () => 'usr-fixed-0001'
}));

const envSnapshot = {
  KEYCLOAK_URL: process.env.KEYCLOAK_URL,
  KEYCLOAK_REALM: process.env.KEYCLOAK_REALM,
  KEYCLOAK_INVITE_CLIENT_ID: process.env.KEYCLOAK_INVITE_CLIENT_ID,
  KEYCLOAK_INVITE_CLIENT_SECRET: process.env.KEYCLOAK_INVITE_CLIENT_SECRET,
  PROFILE_BOOTSTRAP_URL: process.env.PROFILE_BOOTSTRAP_URL,
  PROFILE_BOOTSTRAP_SHARED_SECRET: process.env.PROFILE_BOOTSTRAP_SHARED_SECRET,
  PROFILE_BOOTSTRAP_BASIC_USER: process.env.PROFILE_BOOTSTRAP_BASIC_USER,
  PROFILE_BOOTSTRAP_BASIC_PASS: process.env.PROFILE_BOOTSTRAP_BASIC_PASS
};

beforeEach(() => {
  process.env.KEYCLOAK_URL = 'https://auth.example.test';
  process.env.KEYCLOAK_REALM = 'mereb-dev';
  process.env.KEYCLOAK_INVITE_CLIENT_ID = 'invite-onboarding-dev';
  process.env.KEYCLOAK_INVITE_CLIENT_SECRET = 'client-secret';
  process.env.PROFILE_BOOTSTRAP_URL = 'http://svc-profile-dev.apps-dev.svc.cluster.local/internal/users/bootstrap';
  process.env.PROFILE_BOOTSTRAP_SHARED_SECRET = 'bootstrap-secret';
  delete process.env.PROFILE_BOOTSTRAP_BASIC_USER;
  delete process.env.PROFILE_BOOTSTRAP_BASIC_PASS;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test('deletes the freshly created Keycloak user when profile bootstrap fails after user creation', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));

  vi.stubGlobal('fetch', fetchMock);

  const adapter = new KeycloakInviteProvisionerAdapter();

  await assert.rejects(
    () =>
      adapter.createUser({
        code: 'TEST2026',
        email: 'test2026@mereb.app',
        displayName: 'test2026',
        password: 'test2026'
      }),
    /Profile bootstrap request failed: fetch failed/
  );

  assert.equal(fetchMock.mock.calls.length, 4);
  assert.equal(
    fetchMock.mock.calls[2]?.[0],
    'http://svc-profile-dev.apps-dev.svc.cluster.local/internal/users/bootstrap'
  );
  assert.equal(
    fetchMock.mock.calls[3]?.[0],
    'https://auth.example.test/admin/realms/mereb-dev/users/usr-fixed-0001'
  );
  assert.deepEqual(fetchMock.mock.calls[3]?.[1], {
    method: 'DELETE',
    headers: {
      authorization: 'Bearer access-token'
    }
  });
});
