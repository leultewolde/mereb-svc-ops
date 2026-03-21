import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, test } from 'vitest';
import { createOpsApplicationModule } from '../src/application/ops/use-cases.js';
import { GitmodulesProjectsSourceAdapter } from '../src/adapters/outbound/projects/gitmodules-project-source.js';
import { ManualProjectsStoreAdapter } from '../src/adapters/outbound/projects/manual-projects-store.js';
import type {
  InviteCodesStorePort,
  InviteEmailSenderPort,
  InviteProvisionerPort,
  RuntimeFlagsStorePort
} from '../src/application/ops/ports.js';
import type {
  InviteCode,
  InviteEmailDelivery,
  RedeemInviteInput,
  RuntimeFlag
} from '../src/domain/ops/runtime-config.js';

let previousGitmodulesPath: string | undefined;
let previousManualProjectsPath: string | undefined;
let previousIssuer: string | undefined;
let previousAudience: string | undefined;
let gitmodulesPath = '';
let manualProjectsPath = '';

function createRuntimeFlagStore(initialFlags: RuntimeFlag[] = []): RuntimeFlagsStorePort {
  const flags = [...initialFlags];

  return {
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

function createInviteCodeStore(initialInvites: InviteCode[] = []): InviteCodesStorePort {
  const invites = [...initialInvites];

  return {
    async listInviteCodes() {
      return [...invites];
    },
    async getInviteCode(code) {
      return invites.find((invite) => invite.code === code) ?? null;
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

function createInviteEmailSenderStub(): InviteEmailSenderPort {
  return {
    async sendInviteCodeEmail(invite): Promise<InviteEmailDelivery> {
      return {
        delivered: true,
        recipient: invite.email,
        attemptedAt: '2026-03-15T00:05:00.000Z',
        error: null
      };
    }
  };
}

function createInviteProvisionerStub(): InviteProvisionerPort {
  return {
    async createUser(input: RedeemInviteInput) {
      return { userId: `usr-${input.code.toLowerCase()}` };
    }
  };
}

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svc-ops-it-'));
  gitmodulesPath = join(dir, '.gitmodules');
  manualProjectsPath = join(dir, 'projects.json');

  await writeFile(
    gitmodulesPath,
    [
      '[submodule "services/svc-auth"]',
      '\tpath = services/svc-auth',
      '\turl = git@github.com:leultewolde/mereb-svc-auth.git',
      '\tbranch = main'
    ].join('\n'),
    'utf8'
  );
  await writeFile(manualProjectsPath, '[]', 'utf8');

  previousGitmodulesPath = process.env.GITMODULES_PATH;
  previousManualProjectsPath = process.env.MANUAL_PROJECTS_PATH;
  previousIssuer = process.env.OIDC_ISSUER;
  previousAudience = process.env.OIDC_AUDIENCE;

  process.env.GITMODULES_PATH = gitmodulesPath;
  process.env.MANUAL_PROJECTS_PATH = manualProjectsPath;
  process.env.OIDC_ISSUER = 'http://example.test/issuer';
  process.env.OIDC_AUDIENCE = 'svc-ops';
});

afterAll(() => {
  if (previousGitmodulesPath === undefined) {
    delete process.env.GITMODULES_PATH;
  } else {
    process.env.GITMODULES_PATH = previousGitmodulesPath;
  }

  if (previousManualProjectsPath === undefined) {
    delete process.env.MANUAL_PROJECTS_PATH;
  } else {
    process.env.MANUAL_PROJECTS_PATH = previousManualProjectsPath;
  }

  if (previousIssuer === undefined) {
    delete process.env.OIDC_ISSUER;
  } else {
    process.env.OIDC_ISSUER = previousIssuer;
  }

  if (previousAudience === undefined) {
    delete process.env.OIDC_AUDIENCE;
  } else {
    process.env.OIDC_AUDIENCE = previousAudience;
  }
});

test('buildServer exposes project query and mutation flows with file-backed project storage', async () => {
  const { buildServer } = await import('../src/server.js');
  const ops = createOpsApplicationModule({
    gitmodules: new GitmodulesProjectsSourceAdapter(),
    manualStore: new ManualProjectsStoreAdapter(),
    runtimeFlags: createRuntimeFlagStore(),
    inviteCodes: createInviteCodeStore(),
    inviteProvisioner: createInviteProvisionerStub(),
    inviteEmailSender: createInviteEmailSenderStub()
  });
  const app = await buildServer({ ops });

  try {
    const projectsResponse = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: '{ projects { name source path } }'
      }
    });
    assert.equal(projectsResponse.statusCode, 200);
    assert.deepEqual(projectsResponse.json(), {
      data: {
        projects: [
          {
            name: 'services/svc-auth',
            source: 'GITMODULE',
            path: 'services/svc-auth'
          }
        ]
      }
    });

    const addProjectResponse = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: `
          mutation AddProject($input: AddProjectInput!) {
            addProject(input: $input) {
              name
              source
              path
            }
          }
        `,
        variables: {
          input: {
            name: 'svc-profile',
            path: 'services/svc-profile',
            repoUrl: 'https://github.com/example/svc-profile.git'
          }
        }
      }
    });
    assert.equal(addProjectResponse.statusCode, 200);
    assert.deepEqual(addProjectResponse.json(), {
      data: {
        addProject: {
          name: 'svc-profile',
          source: 'MANUAL',
          path: 'services/svc-profile'
        }
      }
    });

    const persisted = JSON.parse(await readFile(manualProjectsPath, 'utf8')) as Array<Record<string, unknown>>;
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0]?.name, 'svc-profile');

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: 'mutation { refreshProjects { name source path } }'
      }
    });
    assert.equal(refreshResponse.statusCode, 200);
    assert.deepEqual(refreshResponse.json(), {
      data: {
        refreshProjects: [
          {
            name: 'services/svc-auth',
            source: 'GITMODULE',
            path: 'services/svc-auth'
          },
          {
            name: 'svc-profile',
            source: 'MANUAL',
            path: 'services/svc-profile'
          }
        ]
      }
    });
  } finally {
    await app.close();
  }
});
