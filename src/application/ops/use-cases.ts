import type {
  ManualProjectInput,
  Project,
  ProjectsFilter
} from '../../domain/ops/projects.js';
import { listProjectsFromSnapshot } from '../../domain/ops/projects.js';
import type {
  CreateInviteCodeInput,
  CreateRuntimeFlagInput,
  DefaultRuntimeFlag,
  InviteCode,
  RedeemInviteInput,
  RuntimeFlag,
  RuntimeFlagsPayload,
  UpdateRuntimeFlagInput
} from '../../domain/ops/runtime-config.js';
import type {
  GitmoduleProjectsSourcePort,
  InviteCodesStorePort,
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
  constructor(private readonly inviteCodes: InviteCodesStorePort) {}

  async execute(input: CreateInviteCodeInput, principal: Principal | undefined): Promise<InviteCode> {
    const actorId = requireFullAccess(principal);
    return this.inviteCodes.createInviteCode(input, actorId);
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
      createInviteCode: new CreateInviteCodeUseCase(deps.inviteCodes),
      disableInviteCode: new DisableInviteCodeUseCase(deps.inviteCodes),
      deleteInviteCode: new DeleteInviteCodeUseCase(deps.inviteCodes),
      redeemInvite: new RedeemInviteUseCase(deps.runtimeFlags, deps.inviteCodes, deps.inviteProvisioner)
    }
  };
}
