import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createOpsApplicationModule } from '../src/application/ops/use-cases.js';
import type {
  GitmoduleProjectsSourcePort,
  InviteCodesStorePort,
  InviteProvisionerPort,
  ManualProjectsStorePort,
  RuntimeFlagsStorePort
} from '../src/application/ops/ports.js';
import type { ManualProjectInput, Project } from '../src/domain/ops/projects.js';
import type { InviteCode, RedeemInviteInput, RuntimeFlag } from '../src/domain/ops/runtime-config.js';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'services/svc-auth',
    name: 'svc-auth',
    path: 'services/svc-auth',
    repoUrl: 'https://github.com/example/svc-auth.git',
    kind: 'SERVICE',
    source: 'GITMODULE',
    environments: [],
    tags: [],
    ...overrides
  };
}

function createRuntimeFlagStore(initialFlags: RuntimeFlag[] = []): RuntimeFlagsStorePort & { flags: RuntimeFlag[] } {
  const flags = [...initialFlags];

  return {
    flags,
    async listRuntimeFlags() {
      return [...flags];
    },
    async getPublicFlags() {
      return Object.fromEntries(flags.map((flag) => [flag.key, flag.enabled]));
    },
    async createRuntimeFlag(input, actorId) {
      const created: RuntimeFlag = {
        key: input.key,
        description: input.description?.trim() || null,
        enabled: input.enabled ?? false,
        updatedAt: new Date('2026-03-15T00:00:00.000Z').toISOString(),
        updatedBy: actorId
      };
      flags.push(created);
      return created;
    },
    async updateRuntimeFlag(key, input, actorId) {
      const existing = flags.find((flag) => flag.key === key);
      assert.ok(existing, `expected runtime flag ${key} to exist`);
      existing.description = input.description === undefined ? existing.description : (input.description?.trim() || null);
      existing.enabled = input.enabled ?? existing.enabled;
      existing.updatedBy = actorId;
      return existing;
    },
    async deleteRuntimeFlag(key) {
      const index = flags.findIndex((flag) => flag.key === key);
      if (index === -1) return false;
      flags.splice(index, 1);
      return true;
    },
    async ensureRuntimeFlags(defaults) {
      for (const entry of defaults) {
        if (!flags.some((flag) => flag.key === entry.key)) {
          flags.push({
            key: entry.key,
            description: entry.description ?? null,
            enabled: entry.enabled ?? false,
            updatedAt: new Date('2026-03-15T00:00:00.000Z').toISOString(),
            updatedBy: 'seed'
          });
        }
      }
    }
  };
}

function createInviteCodeStore(initialInvites: InviteCode[] = []): InviteCodesStorePort & { invites: InviteCode[] } {
  const invites = [...initialInvites];

  return {
    invites,
    async listInviteCodes() {
      return [...invites];
    },
    async createInviteCode(input, actorId) {
      const created: InviteCode = {
        code: input.code?.trim() || 'AUTO-CODE-0001',
        email: input.email?.trim() || null,
        label: input.label?.trim() || null,
        note: input.note?.trim() || null,
        enabled: true,
        expiresAt: input.expiresAt ?? null,
        createdAt: new Date('2026-03-15T00:00:00.000Z').toISOString(),
        createdBy: actorId,
        redeemedAt: null,
        redeemedByUserId: null,
        redeemedEmail: null,
        redeemedDisplayName: null
      };
      invites.push(created);
      return created;
    },
    async disableInviteCode(code) {
      const existing = invites.find((invite) => invite.code === code);
      assert.ok(existing, `expected invite code ${code} to exist`);
      existing.enabled = false;
      return existing;
    },
    async deleteInviteCode(code) {
      const index = invites.findIndex((invite) => invite.code === code);
      if (index === -1) return false;
      if (invites[index]?.redeemedAt) {
        throw new Error('Redeemed invite codes cannot be deleted');
      }
      invites.splice(index, 1);
      return true;
    },
    async beginRedeemInvite(input) {
      const existing = invites.find((invite) => invite.code === input.code);
      if (!existing) {
        throw new Error('Invite code is invalid');
      }
      if (!existing.enabled) {
        throw new Error('Invite code is disabled');
      }
      if (existing.redeemedAt) {
        throw new Error('Invite code has already been redeemed');
      }
      return existing;
    },
    async completeRedeemInvite(code, result) {
      const existing = invites.find((invite) => invite.code === code);
      assert.ok(existing, `expected invite code ${code} to exist`);
      existing.redeemedAt = new Date('2026-03-15T01:00:00.000Z').toISOString();
      existing.redeemedByUserId = result.userId;
      existing.redeemedEmail = result.email;
      existing.redeemedDisplayName = result.displayName;
    },
    async cancelRedeemInvite(code) {
      const existing = invites.find((invite) => invite.code === code);
      assert.ok(existing, `expected invite code ${code} to exist`);
      existing.redeemedAt = null;
      existing.redeemedByUserId = null;
      existing.redeemedEmail = null;
      existing.redeemedDisplayName = null;
    }
  };
}

function createInviteProvisionerStub(
  implementation?: (input: RedeemInviteInput) => Promise<{ userId: string }>
): InviteProvisionerPort {
  return {
    async createUser(input) {
      if (implementation) {
        return implementation(input);
      }
      return { userId: `usr-${input.code.toLowerCase()}` };
    }
  };
}

function createGitmoduleSource(projects: Project[]): GitmoduleProjectsSourcePort {
  return {
    async loadProjects() {
      return projects;
    }
  };
}

function createManualStore(projects: Project[]): ManualProjectsStorePort {
  const manualProjects = [...projects];
  return {
    async loadProjects() {
      return manualProjects;
    },
    async addProject(input: ManualProjectInput) {
      const created = project({
        id: input.path ?? input.name,
        name: input.name,
        path: input.path ?? input.name,
        repoUrl: input.repoUrl,
        source: 'MANUAL'
      });
      manualProjects.push(created);
      return created;
    }
  };
}

test('listProjects merges gitmodule/manual projects and filters by source', async () => {
  const runtimeFlags = createRuntimeFlagStore();
  const inviteCodes = createInviteCodeStore();
  const ops = createOpsApplicationModule({
    gitmodules: createGitmoduleSource([project()]),
    manualStore: createManualStore([
      project({
        id: 'services/svc-auth',
        source: 'MANUAL',
        jenkinsJob: 'job-1'
      })
    ]),
    runtimeFlags,
    inviteCodes,
    inviteProvisioner: createInviteProvisionerStub()
  });

  const projects = await ops.queries.listProjects.execute({ source: 'GITMODULE' });
  assert.equal(projects.length, 1);
  assert.equal(projects[0]?.source, 'GITMODULE');
  assert.equal(projects[0]?.jenkinsJob, 'job-1');

  const created = await ops.commands.addProject.execute({
    name: 'svc-profile',
    repoUrl: 'https://github.com/example/svc-profile.git'
  });
  assert.equal(created.source, 'MANUAL');
});

test('runtime flags support read access for limited admins and write access for full admins only', async () => {
  const runtimeFlags = createRuntimeFlagStore([
    {
      key: 'inviteOnlyRegistration',
      description: 'Pilot access gate',
      enabled: false,
      updatedAt: new Date('2026-03-15T00:00:00.000Z').toISOString(),
      updatedBy: 'seed'
    }
  ]);
  const ops = createOpsApplicationModule({
    gitmodules: createGitmoduleSource([]),
    manualStore: createManualStore([]),
    runtimeFlags,
    inviteCodes: createInviteCodeStore(),
    inviteProvisioner: createInviteProvisionerStub()
  });

  const readOnlyFlags = await ops.queries.listRuntimeFlags.execute({
    userId: 'moderator-1',
    roles: ['moderator']
  });
  assert.equal(readOnlyFlags.length, 1);

  await assert.rejects(
    () =>
      ops.commands.createRuntimeFlag.execute(
        { key: 'betaFeature', enabled: true },
        { userId: 'moderator-1', roles: ['moderator'] }
      ),
    /Full admin access required/
  );

  const created = await ops.commands.createRuntimeFlag.execute(
    { key: 'betaFeature', description: 'Pilot beta feature', enabled: true },
    { userId: 'admin-1', roles: ['admin'] }
  );
  assert.equal(created.key, 'betaFeature');
  assert.equal(created.enabled, true);

  const publicFlags = await ops.queries.publicFlags.execute();
  assert.equal(publicFlags.inviteOnlyRegistration, false);
  assert.equal(publicFlags.betaFeature, true);
});

test('invite redemption provisions a user and completes redemption when the flag is enabled', async () => {
  const runtimeFlags = createRuntimeFlagStore([
    {
      key: 'inviteOnlyRegistration',
      description: 'Pilot access gate',
      enabled: true,
      updatedAt: new Date('2026-03-15T00:00:00.000Z').toISOString(),
      updatedBy: 'seed'
    }
  ]);
  const inviteCodes = createInviteCodeStore([
    {
      code: 'PILOT-0001-AAAA',
      email: 'pilot@example.com',
      label: 'Pilot',
      note: null,
      enabled: true,
      expiresAt: null,
      createdAt: new Date('2026-03-15T00:00:00.000Z').toISOString(),
      createdBy: 'admin-1',
      redeemedAt: null,
      redeemedByUserId: null,
      redeemedEmail: null,
      redeemedDisplayName: null
    }
  ]);

  const ops = createOpsApplicationModule({
    gitmodules: createGitmoduleSource([]),
    manualStore: createManualStore([]),
    runtimeFlags,
    inviteCodes,
    inviteProvisioner: createInviteProvisionerStub()
  });

  const result = await ops.commands.redeemInvite.execute({
    code: 'PILOT-0001-AAAA',
    email: 'pilot@example.com',
    displayName: 'Pilot User',
    password: 'supersecret'
  });

  assert.equal(result.userId, 'usr-pilot-0001-aaaa');
  assert.equal(inviteCodes.invites[0]?.redeemedByUserId, 'usr-pilot-0001-aaaa');
  assert.equal(inviteCodes.invites[0]?.redeemedDisplayName, 'Pilot User');
});

test('invite redemption cancels the invite when provisioning fails', async () => {
  const runtimeFlags = createRuntimeFlagStore([
    {
      key: 'inviteOnlyRegistration',
      description: 'Pilot access gate',
      enabled: true,
      updatedAt: new Date('2026-03-15T00:00:00.000Z').toISOString(),
      updatedBy: 'seed'
    }
  ]);
  const inviteCodes = createInviteCodeStore([
    {
      code: 'PILOT-0002-BBBB',
      email: null,
      label: null,
      note: null,
      enabled: true,
      expiresAt: null,
      createdAt: new Date('2026-03-15T00:00:00.000Z').toISOString(),
      createdBy: 'admin-1',
      redeemedAt: null,
      redeemedByUserId: null,
      redeemedEmail: null,
      redeemedDisplayName: null
    }
  ]);

  const ops = createOpsApplicationModule({
    gitmodules: createGitmoduleSource([]),
    manualStore: createManualStore([]),
    runtimeFlags,
    inviteCodes,
    inviteProvisioner: createInviteProvisionerStub(async () => {
      throw new Error('Keycloak user creation failed (409)');
    })
  });

  await assert.rejects(
    () =>
      ops.commands.redeemInvite.execute({
        code: 'PILOT-0002-BBBB',
        email: 'pilot@example.com',
        displayName: 'Pilot User',
        password: 'supersecret'
      }),
    /Keycloak user creation failed/
  );
  assert.equal(inviteCodes.invites[0]?.redeemedByUserId, null);
  assert.equal(inviteCodes.invites[0]?.redeemedEmail, null);
});
