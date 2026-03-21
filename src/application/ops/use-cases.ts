import type {
  ManualProjectInput,
  Project,
  ProjectsFilter
} from '../../domain/ops/projects.js';
import { listProjectsFromSnapshot } from '../../domain/ops/projects.js';
import type {
  CreateInviteCodeInput,
  CreateInviteCodeResult,
  CreateRuntimeFlagInput,
  DefaultRuntimeFlag,
  InviteCode,
  InviteEmailDelivery,
  RedeemInviteInput,
  RuntimeFlag,
  RuntimeFlagsPayload,
  UpdateRuntimeFlagInput
} from '../../domain/ops/runtime-config.js';
import { isInviteActive } from '../../domain/ops/runtime-config.js';
import type {
  GitmoduleProjectsSourcePort,
  InviteCodesStorePort,
  InviteEmailSenderPort,
  InviteProvisionerPort,
  ManualProjectsStorePort,
  RuntimeFlagsStorePort
} from './ports.js';
import { hasAdminReadAccess, hasFullAdminAccess } from '@mereb/shared-packages';

interface OpsDeps {
  gitmodules: GitmoduleProjectsSourcePort;
  manualStore: ManualProjectsStorePort;
  runtimeFlags: RuntimeFlagsStorePort;
  inviteCodes: InviteCodesStorePort;
  inviteProvisioner: InviteProvisionerPort;
  inviteEmailSender: InviteEmailSenderPort;
}

interface Principal {
  userId?: string;
  roles?: string[];
}

function requireReadAccess(principal: Principal | undefined) {
  if (!hasAdminReadAccess(principal?.roles)) {
    throw new Error('Admin read access required');
  }
}

function requireFullAccess(principal: Principal | undefined): string {
  if (!hasFullAdminAccess(principal?.roles)) {
    throw new Error('Full admin access required');
  }
  if (!principal?.userId) {
    throw new Error('Authenticated admin required');
  }
  return principal.userId;
}

async function loadSnapshot(deps: OpsDeps) {
  const [gitProjects, manualProjects] = await Promise.all([
    deps.gitmodules.loadProjects(),
    deps.manualStore.loadProjects()
  ]);

  return {
    gitProjects,
    manualProjects
  };
}

export class ListProjectsQuery {
  constructor(private readonly deps: OpsDeps) {}

  async execute(filter: ProjectsFilter): Promise<Project[]> {
    return listProjectsFromSnapshot(await loadSnapshot(this.deps), filter);
  }
}

export class AddProjectUseCase {
  constructor(private readonly manualStore: ManualProjectsStorePort) {}

  async execute(input: ManualProjectInput): Promise<Project> {
    return this.manualStore.addProject(input);
  }
}

export class RefreshProjectsQuery {
  constructor(private readonly listProjects: ListProjectsQuery) {}

  async execute(): Promise<Project[]> {
    return this.listProjects.execute({});
  }
}

export class ListRuntimeFlagsQuery {
  constructor(private readonly runtimeFlags: RuntimeFlagsStorePort) {}

  async execute(principal: Principal | undefined): Promise<RuntimeFlag[]> {
    requireReadAccess(principal);
    return this.runtimeFlags.listRuntimeFlags();
  }
}

export class PublicFlagsQuery {
  constructor(private readonly runtimeFlags: RuntimeFlagsStorePort) {}

  async execute(): Promise<RuntimeFlagsPayload> {
    return this.runtimeFlags.getPublicFlags();
  }
}

export class CreateRuntimeFlagUseCase {
  constructor(private readonly runtimeFlags: RuntimeFlagsStorePort) {}

  async execute(input: CreateRuntimeFlagInput, principal: Principal | undefined): Promise<RuntimeFlag> {
    const actorId = requireFullAccess(principal);
    return this.runtimeFlags.createRuntimeFlag(input, actorId);
  }
}

export class UpdateRuntimeFlagUseCase {
  constructor(private readonly runtimeFlags: RuntimeFlagsStorePort) {}

  async execute(key: string, input: UpdateRuntimeFlagInput, principal: Principal | undefined): Promise<RuntimeFlag> {
    const actorId = requireFullAccess(principal);
    return this.runtimeFlags.updateRuntimeFlag(key, input, actorId);
  }
}

export class DeleteRuntimeFlagUseCase {
  constructor(private readonly runtimeFlags: RuntimeFlagsStorePort) {}

  async execute(key: string, principal: Principal | undefined): Promise<boolean> {
    requireFullAccess(principal);
    return this.runtimeFlags.deleteRuntimeFlag(key);
  }
}

export class EnsureDefaultFlagsUseCase {
  constructor(private readonly runtimeFlags: RuntimeFlagsStorePort) {}

  async execute(flags: DefaultRuntimeFlag[]): Promise<void> {
    await this.runtimeFlags.ensureRuntimeFlags(flags);
  }
}

export class ListInviteCodesQuery {
  constructor(private readonly inviteCodes: InviteCodesStorePort) {}

  async execute(principal: Principal | undefined): Promise<InviteCode[]> {
    requireReadAccess(principal);
    return this.inviteCodes.listInviteCodes();
  }
}

export class CreateInviteCodeUseCase {
  constructor(
    private readonly inviteCodes: InviteCodesStorePort,
    private readonly inviteEmailSender: InviteEmailSenderPort
  ) {}

  async execute(input: CreateInviteCodeInput, principal: Principal | undefined): Promise<CreateInviteCodeResult> {
    const actorId = requireFullAccess(principal);
    const inviteCode = await this.inviteCodes.createInviteCode(input, actorId);
    if (!inviteCode.email) {
      return {
        inviteCode,
        emailDelivery: null
      };
    }
    const emailTargetedInvite = { ...inviteCode, email: inviteCode.email };

    return {
      inviteCode,
      emailDelivery: await sendInviteCodeEmail(this.inviteEmailSender, emailTargetedInvite)
    };
  }
}

export class DisableInviteCodeUseCase {
  constructor(private readonly inviteCodes: InviteCodesStorePort) {}

  async execute(code: string, principal: Principal | undefined): Promise<InviteCode> {
    requireFullAccess(principal);
    return this.inviteCodes.disableInviteCode(code, principal?.userId ?? 'admin');
  }
}

export class DeleteInviteCodeUseCase {
  constructor(private readonly inviteCodes: InviteCodesStorePort) {}

  async execute(code: string, principal: Principal | undefined): Promise<boolean> {
    requireFullAccess(principal);
    return this.inviteCodes.deleteInviteCode(code);
  }
}

export class ResendInviteCodeEmailUseCase {
  constructor(
    private readonly inviteCodes: InviteCodesStorePort,
    private readonly inviteEmailSender: InviteEmailSenderPort
  ) {}

  async execute(code: string, principal: Principal | undefined): Promise<InviteEmailDelivery> {
    requireFullAccess(principal);
    const inviteCode = await this.inviteCodes.getInviteCode(code);
    if (!inviteCode) {
      throw new Error('Invite code is invalid');
    }
    if (!inviteCode.email) {
      throw new Error('Invite code is not reserved for a specific email address');
    }
    if (inviteCode.redeemedAt) {
      throw new Error('Invite code has already been redeemed');
    }
    if (!inviteCode.enabled) {
      throw new Error('Invite code is disabled');
    }
    if (!isInviteActive(inviteCode)) {
      throw new Error('Invite code has expired');
    }
    const emailTargetedInvite = { ...inviteCode, email: inviteCode.email };

    return sendInviteCodeEmail(this.inviteEmailSender, emailTargetedInvite);
  }
}

export class RedeemInviteUseCase {
  constructor(
    private readonly runtimeFlags: RuntimeFlagsStorePort,
    private readonly inviteCodes: InviteCodesStorePort,
    private readonly inviteProvisioner: InviteProvisionerPort
  ) {}

  async execute(input: RedeemInviteInput): Promise<{ userId: string }> {
    const flags = await this.runtimeFlags.getPublicFlags();
    if (!flags.inviteOnlyRegistration) {
      throw new Error('Invite-only registration is not enabled');
    }

    await this.inviteCodes.beginRedeemInvite(input);
    try {
      const created = await this.inviteProvisioner.createUser(input);
      await this.inviteCodes.completeRedeemInvite(input.code, {
        userId: created.userId,
        email: input.email,
        displayName: input.displayName
      });
      return created;
    } catch (error) {
      await this.inviteCodes.cancelRedeemInvite(input.code);
      throw error;
    }
  }
}

async function sendInviteCodeEmail(
  inviteEmailSender: InviteEmailSenderPort,
  inviteCode: InviteCode & { email: string }
): Promise<InviteEmailDelivery> {
  try {
    return await inviteEmailSender.sendInviteCodeEmail(inviteCode);
  } catch (error) {
    return {
      delivered: false,
      recipient: inviteCode.email,
      attemptedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown invite email delivery error'
    };
  }
}

export interface OpsApplicationModule {
  queries: {
    listProjects: ListProjectsQuery;
    refreshProjects: RefreshProjectsQuery;
    listRuntimeFlags: ListRuntimeFlagsQuery;
    publicFlags: PublicFlagsQuery;
    listInviteCodes: ListInviteCodesQuery;
  };
  commands: {
    addProject: AddProjectUseCase;
    createRuntimeFlag: CreateRuntimeFlagUseCase;
    updateRuntimeFlag: UpdateRuntimeFlagUseCase;
    deleteRuntimeFlag: DeleteRuntimeFlagUseCase;
    ensureDefaultFlags: EnsureDefaultFlagsUseCase;
    createInviteCode: CreateInviteCodeUseCase;
    resendInviteCodeEmail: ResendInviteCodeEmailUseCase;
    disableInviteCode: DisableInviteCodeUseCase;
    deleteInviteCode: DeleteInviteCodeUseCase;
    redeemInvite: RedeemInviteUseCase;
  };
}

export function createOpsApplicationModule(deps: OpsDeps): OpsApplicationModule {
  const listProjects = new ListProjectsQuery(deps);
  return {
    queries: {
      listProjects,
      refreshProjects: new RefreshProjectsQuery(listProjects),
      listRuntimeFlags: new ListRuntimeFlagsQuery(deps.runtimeFlags),
      publicFlags: new PublicFlagsQuery(deps.runtimeFlags),
      listInviteCodes: new ListInviteCodesQuery(deps.inviteCodes)
    },
    commands: {
      addProject: new AddProjectUseCase(deps.manualStore),
      createRuntimeFlag: new CreateRuntimeFlagUseCase(deps.runtimeFlags),
      updateRuntimeFlag: new UpdateRuntimeFlagUseCase(deps.runtimeFlags),
      deleteRuntimeFlag: new DeleteRuntimeFlagUseCase(deps.runtimeFlags),
      ensureDefaultFlags: new EnsureDefaultFlagsUseCase(deps.runtimeFlags),
      createInviteCode: new CreateInviteCodeUseCase(deps.inviteCodes, deps.inviteEmailSender),
      resendInviteCodeEmail: new ResendInviteCodeEmailUseCase(deps.inviteCodes, deps.inviteEmailSender),
      disableInviteCode: new DisableInviteCodeUseCase(deps.inviteCodes),
      deleteInviteCode: new DeleteInviteCodeUseCase(deps.inviteCodes),
      redeemInvite: new RedeemInviteUseCase(deps.runtimeFlags, deps.inviteCodes, deps.inviteProvisioner)
    }
  };
}
