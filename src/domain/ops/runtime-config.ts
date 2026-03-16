import { randomBytes } from 'node:crypto';

export type RuntimeFlag = {
  key: string;
  description: string | null;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

export type InviteCode = {
  code: string;
  email: string | null;
  label: string | null;
  note: string | null;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string | null;
  redeemedAt: string | null;
  redeemedByUserId: string | null;
  redeemedEmail: string | null;
  redeemedDisplayName: string | null;
};

export type DefaultRuntimeFlag = {
  key: string;
  description?: string | null;
  enabled?: boolean;
};

export type RuntimeFlagsPayload = Record<string, boolean>;

export type CreateRuntimeFlagInput = {
  key: string;
  description?: string | null;
  enabled?: boolean;
};

export type UpdateRuntimeFlagInput = {
  description?: string | null;
  enabled?: boolean;
};

export type CreateInviteCodeInput = {
  code?: string | null;
  email?: string | null;
  label?: string | null;
  note?: string | null;
  expiresAt?: string | null;
};

export type RedeemInviteInput = {
  code: string;
  email: string;
  displayName: string;
  password: string;
};

export function normalizeFlagKey(value: string): string {
  return value.trim();
}

export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

export function generateInviteCode(): string {
  const raw = randomBytes(6).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const compact = raw.slice(0, 12).padEnd(12, '7');
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

export function isInviteActive(invite: Pick<InviteCode, 'enabled' | 'expiresAt' | 'redeemedAt'>): boolean {
  if (!invite.enabled || invite.redeemedAt) {
    return false;
  }
  if (!invite.expiresAt) {
    return true;
  }
  return new Date(invite.expiresAt).getTime() > Date.now();
}
