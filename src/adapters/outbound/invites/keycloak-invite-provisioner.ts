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

type KeycloakInviteConfig = {
  keycloakUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
  bootstrapUrl: string;
  bootstrapSecret?: string;
  bootstrapBasicUser?: string;
  bootstrapBasicPass?: string;
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

function loadConfig(): KeycloakInviteConfig {
  return {
    keycloakUrl: requireEnv('KEYCLOAK_URL'),
    realm: requireEnv('KEYCLOAK_REALM'),
    clientId: requireEnv('KEYCLOAK_INVITE_CLIENT_ID'),
    clientSecret: requireEnv('KEYCLOAK_INVITE_CLIENT_SECRET'),
    bootstrapUrl: requireEnv('PROFILE_BOOTSTRAP_URL'),
    bootstrapSecret: process.env.PROFILE_BOOTSTRAP_SHARED_SECRET?.trim(),
    bootstrapBasicUser: process.env.PROFILE_BOOTSTRAP_BASIC_USER?.trim(),
    bootstrapBasicPass: process.env.PROFILE_BOOTSTRAP_BASIC_PASS?.trim()
  };
}

export class KeycloakInviteProvisionerAdapter implements InviteProvisionerPort {
  async createUser(input: RedeemInviteInput): Promise<{ userId: string }> {
    const config = loadConfig();
    const accessToken = await this.getAccessToken(config);
    const username = input.email.trim().toLowerCase();
    const userId = randomUUID();

    const createUserResponse = await fetch(
      `${config.keycloakUrl.replace(/\/$/, '')}/admin/realms/${config.realm}/users`,
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

    try {
      const bootstrapPayload = await this.bootstrapProfile(config, input, userId, username);
      return {
        userId: bootstrapPayload.id ?? userId
      };
    } catch (error) {
      await this.deleteUser(config, accessToken, userId);
      throw error;
    }
  }

  private async getAccessToken(config: KeycloakInviteConfig): Promise<string> {
    const tokenResponse = await fetch(
      `${config.keycloakUrl.replace(/\/$/, '')}/realms/${config.realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: config.clientId,
          client_secret: config.clientSecret
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

    return accessToken;
  }

  private async bootstrapProfile(
    config: KeycloakInviteConfig,
    input: RedeemInviteInput,
    userId: string,
    username: string
  ): Promise<KeycloakUserResponse> {
    const bootstrapHeaders: Record<string, string> = {
      'content-type': 'application/json'
    };
    if (config.bootstrapSecret) {
      bootstrapHeaders['x-keycloak-webhook-secret'] = config.bootstrapSecret;
    } else if (config.bootstrapBasicUser && config.bootstrapBasicPass) {
      bootstrapHeaders.authorization = basicAuthHeader(
        config.bootstrapBasicUser,
        config.bootstrapBasicPass
      );
    } else {
      throw new Error('Profile bootstrap authentication is not configured');
    }

    let bootstrapResponse: Response;
    try {
      bootstrapResponse = await fetch(config.bootstrapUrl, {
        method: 'POST',
        headers: bootstrapHeaders,
        body: JSON.stringify({
          userId,
          preferred_username: username,
          email: username,
          name: input.displayName.trim(),
          clientId: config.clientId
        })
      });
    } catch (error) {
      throw new Error(`Profile bootstrap request failed: ${(error as Error).message}`);
    }

    if (!bootstrapResponse.ok) {
      throw new Error(`Profile bootstrap failed (${bootstrapResponse.status})`);
    }

    return (await bootstrapResponse.json()) as KeycloakUserResponse;
  }

  private async deleteUser(
    config: KeycloakInviteConfig,
    accessToken: string,
    userId: string
  ): Promise<void> {
    try {
      await fetch(
        `${config.keycloakUrl.replace(/\/$/, '')}/admin/realms/${config.realm}/users/${userId}`,
        {
          method: 'DELETE',
          headers: {
            authorization: `Bearer ${accessToken}`
          }
        }
      );
    } catch {
      // Best effort cleanup. The original bootstrap error is more actionable than a secondary delete failure.
    }
  }
}
