import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { InviteProvisionerPort } from '../../../application/ops/ports.js';
import type { RedeemInviteInput } from '../../../domain/ops/runtime-config.js';

type KeycloakTokenResponse = {
  access_token?: string;
};

type KeycloakUserResponse = {
  id?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} env var required`);
  }
  return value;
}

function basicAuthHeader(user: string, pass: string) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

export class KeycloakInviteProvisionerAdapter implements InviteProvisionerPort {
  async createUser(input: RedeemInviteInput): Promise<{ userId: string }> {
    const keycloakUrl = requireEnv('KEYCLOAK_URL');
    const realm = requireEnv('KEYCLOAK_REALM');
    const clientId = requireEnv('KEYCLOAK_INVITE_CLIENT_ID');
    const clientSecret = requireEnv('KEYCLOAK_INVITE_CLIENT_SECRET');
    const bootstrapUrl = requireEnv('PROFILE_BOOTSTRAP_URL');
    const bootstrapSecret = process.env.PROFILE_BOOTSTRAP_SHARED_SECRET?.trim();
    const bootstrapBasicUser = process.env.PROFILE_BOOTSTRAP_BASIC_USER?.trim();
    const bootstrapBasicPass = process.env.PROFILE_BOOTSTRAP_BASIC_PASS?.trim();

    const tokenResponse = await fetch(
      `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret
        })
      }
    );

    if (!tokenResponse.ok) {
      throw new Error(`Keycloak token request failed (${tokenResponse.status})`);
    }

    const tokenPayload = (await tokenResponse.json()) as KeycloakTokenResponse;
    const accessToken = tokenPayload.access_token;
    if (!accessToken) {
      throw new Error('Keycloak token response did not contain an access token');
    }

    const username = input.email.trim().toLowerCase();
    const userId = randomUUID();
    const createUserResponse = await fetch(
      `${keycloakUrl.replace(/\/$/, '')}/admin/realms/${realm}/users`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          id: userId,
          username,
          email: username,
          enabled: true,
          emailVerified: false,
          firstName: input.displayName.trim(),
          credentials: [
            {
              type: 'password',
              value: input.password,
              temporary: false
            }
          ]
        })
      }
    );

    if (createUserResponse.status === 409) {
      throw new Error('A user with that email already exists');
    }
    if (!createUserResponse.ok) {
      throw new Error(`Keycloak user creation failed (${createUserResponse.status})`);
    }

    const bootstrapHeaders: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (bootstrapSecret) {
      bootstrapHeaders['x-keycloak-webhook-secret'] = bootstrapSecret;
    } else if (bootstrapBasicUser && bootstrapBasicPass) {
      bootstrapHeaders.authorization = basicAuthHeader(bootstrapBasicUser, bootstrapBasicPass);
    } else {
      throw new Error('Profile bootstrap authentication is not configured');
    }

    const bootstrapResponse = await fetch(bootstrapUrl, {
      method: 'POST',
      headers: bootstrapHeaders,
      body: JSON.stringify({
        userId,
        preferred_username: username,
        email: username,
        name: input.displayName.trim(),
        clientId
      })
    });

    if (!bootstrapResponse.ok) {
      throw new Error(`Profile bootstrap failed (${bootstrapResponse.status})`);
    }

    const bootstrapPayload = (await bootstrapResponse.json()) as KeycloakUserResponse;
    return {
      userId: bootstrapPayload.id ?? userId
    };
  }
}
