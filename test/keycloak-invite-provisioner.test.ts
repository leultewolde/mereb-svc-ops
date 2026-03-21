import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';
import { KeycloakInviteProvisionerAdapter } from '../src/adapters/outbound/invites/keycloak-invite-provisioner.js';

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

function inviteInput() {
  return {
    code: 'TEST2026',
    email: 'pilot@example.com',
    username: 'pilot-user',
    firstName: 'Pilot',
    lastName: 'User',
    displayName: 'Pilot User',
    password: 'supersecret'
  };
}

beforeEach(() => {
  process.env.KEYCLOAK_URL = 'https://auth.example.test';
  process.env.KEYCLOAK_REALM = 'mereb-dev';
  process.env.KEYCLOAK_INVITE_CLIENT_ID = 'invite-onboarding-dev';
  process.env.KEYCLOAK_INVITE_CLIENT_SECRET = 'client-secret';
  process.env.PROFILE_BOOTSTRAP_URL =
    'http://svc-profile-dev.apps-dev.svc.cluster.local/internal/users/bootstrap';
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

test('bootstraps the profile with the actual Keycloak user id returned in the Location header', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    .mockResolvedValueOnce(
      new Response(null, {
        status: 201,
        headers: { location: 'https://auth.example.test/admin/realms/mereb-dev/users/usr-real-1234' }
      })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'usr-real-1234' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

  vi.stubGlobal('fetch', fetchMock);

  const adapter = new KeycloakInviteProvisionerAdapter();
  const created = await adapter.createUser(inviteInput());

  assert.equal(created.userId, 'usr-real-1234');
  assert.equal(fetchMock.mock.calls.length, 3);

  const createUserRequest = fetchMock.mock.calls[1];
  assert.equal(
    createUserRequest?.[0],
    'https://auth.example.test/admin/realms/mereb-dev/users'
  );
  assert.deepEqual(JSON.parse(String(createUserRequest?.[1]?.body)), {
    username: 'pilot-user',
    email: 'pilot@example.com',
    enabled: true,
    emailVerified: false,
    firstName: 'Pilot',
    lastName: 'User',
    credentials: [
      {
        type: 'password',
        value: 'supersecret',
        temporary: false
      }
    ]
  });

  const bootstrapRequest = fetchMock.mock.calls[2];
  assert.equal(
    bootstrapRequest?.[0],
    'http://svc-profile-dev.apps-dev.svc.cluster.local/internal/users/bootstrap'
  );
  assert.deepEqual(JSON.parse(String(bootstrapRequest?.[1]?.body)), {
    userId: 'usr-real-1234',
    preferred_username: 'pilot-user',
    email: 'pilot@example.com',
    name: 'Pilot User',
    clientId: 'invite-onboarding-dev'
  });
});

test('falls back to an exact Keycloak lookup and deletes the resolved user when bootstrap fails', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 'usr-real-5678',
            username: 'pilot-user',
            email: 'pilot@example.com'
          }
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    )
    .mockRejectedValueOnce(new TypeError('fetch failed'))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));

  vi.stubGlobal('fetch', fetchMock);

  const adapter = new KeycloakInviteProvisionerAdapter();

  await assert.rejects(() => adapter.createUser(inviteInput()), /Profile bootstrap request failed: fetch failed/);

  assert.equal(fetchMock.mock.calls.length, 5);
  assert.equal(
    fetchMock.mock.calls[2]?.[0],
    'https://auth.example.test/admin/realms/mereb-dev/users?username=pilot-user&exact=true'
  );
  assert.equal(
    fetchMock.mock.calls[4]?.[0],
    'https://auth.example.test/admin/realms/mereb-dev/users/usr-real-5678'
  );
  assert.deepEqual(fetchMock.mock.calls[4]?.[1], {
    method: 'DELETE',
    headers: {
      authorization: 'Bearer access-token'
    }
  });
});
