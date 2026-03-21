import { PrismaClient, InviteCodeStatus } from '../../../../generated/client/index.js';
import type {
  CreateInviteCodeInput,
  CreateRuntimeFlagInput,
  DefaultRuntimeFlag,
  InviteCode,
  RedeemInviteInput,
  RuntimeFlag,
  RuntimeFlagsPayload,
  UpdateRuntimeFlagInput
} from '../../../domain/ops/runtime-config.js';
import {
  generateInviteCode,
  normalizeFlagKey,
  normalizeInviteCode
} from '../../../domain/ops/runtime-config.js';
import type {
  InviteCodesStorePort,
  RuntimeFlagsStorePort
} from '../../../application/ops/ports.js';

function toRuntimeFlag(flag: {
  key: string;
  description: string | null;
  enabled: boolean;
  updatedAt: Date;
  updatedBy: string | null;
}): RuntimeFlag {
  return {
    key: flag.key,
    description: flag.description,
    enabled: flag.enabled,
    updatedAt: flag.updatedAt.toISOString(),
    updatedBy: flag.updatedBy
  };
}

function toInviteCode(invite: {
  code: string;
  email: string | null;
  label: string | null;
  note: string | null;
  status: InviteCodeStatus;
  expiresAt: Date | null;
  createdAt: Date;
  createdBy: string | null;
  redeemedAt: Date | null;
  redeemedByUserId: string | null;
  redeemedEmail: string | null;
  redeemedDisplayName: string | null;
}): InviteCode {
  return {
    code: invite.code,
    email: invite.email,
    label: invite.label,
    note: invite.note,
    enabled: invite.status === InviteCodeStatus.ACTIVE,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
    createdBy: invite.createdBy,
    redeemedAt: invite.redeemedAt?.toISOString() ?? null,
    redeemedByUserId: invite.redeemedByUserId,
    redeemedEmail: invite.redeemedEmail,
    redeemedDisplayName: invite.redeemedDisplayName
  };
}

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('expiresAt must be a valid ISO date');
  }
  return parsed;
}

export class PrismaRuntimeConfigStoreAdapter implements RuntimeFlagsStorePort, InviteCodesStorePort {
  constructor(private readonly db: PrismaClient) {}

  async listRuntimeFlags(): Promise<RuntimeFlag[]> {
    const flags = await this.db.runtimeFlag.findMany({ orderBy: { key: 'asc' } });
    return flags.map(toRuntimeFlag);
  }

  async getPublicFlags(): Promise<RuntimeFlagsPayload> {
    const flags = await this.db.runtimeFlag.findMany({ select: { key: true, enabled: true } });
    return Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled]));
  }

  async createRuntimeFlag(input: CreateRuntimeFlagInput, actorId: string): Promise<RuntimeFlag> {
    const key = normalizeFlagKey(input.key);
    if (!key) {
      throw new Error('Flag key is required');
    }

    const created = await this.db.runtimeFlag.create({
      data: {
        key,
        description: input.description?.trim() || null,
        enabled: input.enabled ?? false,
        updatedBy: actorId
      }
    });

    return toRuntimeFlag(created);
  }

  async updateRuntimeFlag(key: string, input: UpdateRuntimeFlagInput, actorId: string): Promise<RuntimeFlag> {
    const normalizedKey = normalizeFlagKey(key);
    const updated = await this.db.runtimeFlag.update({
      where: { key: normalizedKey },
      data: {
        description: input.description === undefined ? undefined : (input.description?.trim() || null),
        enabled: input.enabled,
        updatedBy: actorId
      }
    });
    return toRuntimeFlag(updated);
  }

  async deleteRuntimeFlag(key: string): Promise<boolean> {
    const normalizedKey = normalizeFlagKey(key);
    const result = await this.db.runtimeFlag.deleteMany({ where: { key: normalizedKey } });
    return result.count > 0;
  }

  async ensureRuntimeFlags(flags: DefaultRuntimeFlag[]): Promise<void> {
    for (const flag of flags) {
      const key = normalizeFlagKey(flag.key);
      if (!key) continue;
      await this.db.runtimeFlag.upsert({
        where: { key },
        update: {},
        create: {
          key,
          description: flag.description?.trim() || null,
          enabled: flag.enabled ?? false,
          updatedBy: 'seed'
        }
      });
    }
  }

  async listInviteCodes(): Promise<InviteCode[]> {
    const invites = await this.db.inviteCode.findMany({ orderBy: [{ createdAt: 'desc' }, { code: 'asc' }] });
    return invites.map(toInviteCode);
  }

  async getInviteCode(code: string): Promise<InviteCode | null> {
    const invite = await this.db.inviteCode.findUnique({
      where: { code: normalizeInviteCode(code) }
    });
    return invite ? toInviteCode(invite) : null;
  }

  async createInviteCode(input: CreateInviteCodeInput, actorId: string): Promise<InviteCode> {
    const attemptCode = input.code?.trim() ? normalizeInviteCode(input.code) : generateInviteCode();
    const created = await this.db.inviteCode.create({
      data: {
        code: attemptCode,
        email: input.email?.trim().toLowerCase() || null,
        label: input.label?.trim() || null,
        note: input.note?.trim() || null,
        expiresAt: parseOptionalDate(input.expiresAt),
        createdBy: actorId,
        status: InviteCodeStatus.ACTIVE
      }
    });

    return toInviteCode(created);
  }

  async disableInviteCode(code: string): Promise<InviteCode> {
    const updated = await this.db.inviteCode.update({
      where: { code: normalizeInviteCode(code) },
      data: {
        status: InviteCodeStatus.DISABLED
      }
    });
    return toInviteCode(updated);
  }

  async deleteInviteCode(code: string): Promise<boolean> {
    const normalizedCode = normalizeInviteCode(code);
    const existing = await this.db.inviteCode.findUnique({ where: { code: normalizedCode } });
    if (!existing) return false;
    if (existing.status === InviteCodeStatus.REDEEMED || existing.status === InviteCodeStatus.REDEEMING) {
      throw new Error('Redeemed invite codes cannot be deleted');
    }
    await this.db.inviteCode.delete({ where: { code: normalizedCode } });
    return true;
  }

  async beginRedeemInvite(input: RedeemInviteInput): Promise<InviteCode> {
    const normalizedCode = normalizeInviteCode(input.code);
    const invite = await this.db.inviteCode.findUnique({ where: { code: normalizedCode } });
    if (!invite) {
      throw new Error('Invite code is invalid');
    }
    if (invite.status === InviteCodeStatus.REDEEMED) {
      throw new Error('Invite code has already been redeemed');
    }
    if (invite.status === InviteCodeStatus.REDEEMING) {
      throw new Error('Invite code is currently being redeemed');
    }
    if (invite.status === InviteCodeStatus.DISABLED) {
      throw new Error('Invite code is disabled');
    }
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
      throw new Error('Invite code has expired');
    }
    if (invite.email && invite.email.toLowerCase() !== input.email.trim().toLowerCase()) {
      throw new Error('Invite code is restricted to a different email address');
    }

    const updated = await this.db.inviteCode.update({
      where: {
        code: normalizedCode
      },
      data: {
        status: InviteCodeStatus.REDEEMING,
        redeemedEmail: input.email.trim().toLowerCase(),
        redeemedDisplayName: input.displayName.trim()
      }
    });
    return toInviteCode(updated);
  }

  async completeRedeemInvite(code: string, result: { userId: string; email: string; displayName: string }): Promise<void> {
    await this.db.inviteCode.update({
      where: { code: normalizeInviteCode(code) },
      data: {
        status: InviteCodeStatus.REDEEMED,
        redeemedAt: new Date(),
        redeemedByUserId: result.userId,
        redeemedEmail: result.email.trim().toLowerCase(),
        redeemedDisplayName: result.displayName.trim()
      }
    });
  }

  async cancelRedeemInvite(code: string): Promise<void> {
    await this.db.inviteCode.updateMany({
      where: {
        code: normalizeInviteCode(code),
        status: InviteCodeStatus.REDEEMING
      },
      data: {
        status: InviteCodeStatus.ACTIVE,
        redeemedEmail: null,
        redeemedDisplayName: null
      }
    });
  }
}
