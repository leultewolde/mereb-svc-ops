import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createResolvers } from '../src/adapters/inbound/graphql/resolvers.js';
import type { OpsApplicationModule } from '../src/application/ops/use-cases.js';
import type { GraphQLContext } from '../src/context.js';

function createOpsModuleStub(): OpsApplicationModule {
  return {
    queries: {
      listProjects: {
        async execute() {
          return [{ id: '1', name: 'svc-auth' }];
        }
      },
      refreshProjects: {
        async execute() {
          return [{ id: '2', name: 'svc-feed' }];
        }
      },
      listRuntimeFlags: {
        async execute(principal: { userId?: string; roles?: string[] }) {
          return [
            {
              key: 'inviteOnlyRegistration',
              description: principal.userId ?? null,
              enabled: principal.roles?.includes('admin:full') ?? false,
              updatedAt: '2026-03-15T10:00:00.000Z',
              updatedBy: principal.userId ?? null
            }
          ];
        }
      },
      listInviteCodes: {
        async execute(principal: { userId?: string; roles?: string[] }) {
          return [
            {
              code: 'ABCD-EFGH-IJKL',
              email: null,
              label: principal.userId ?? null,
              note: null,
              enabled: true,
              expiresAt: null,
              createdAt: '2026-03-15T10:00:00.000Z',
              createdBy: principal.userId ?? null,
              redeemedAt: null,
              redeemedByUserId: null,
              redeemedEmail: null,
              redeemedDisplayName: null
            }
          ];
        }
      }
    },
    commands: {
      addProject: {
        async execute(input: { name: string }) {
          return { id: '3', ...input };
        }
      },
      createRuntimeFlag: {
        async execute(
          input: { key: string; enabled?: boolean; description?: string | null },
          principal: { userId?: string; roles?: string[] }
        ) {
          return {
            key: input.key,
            description: input.description ?? null,
            enabled: input.enabled ?? false,
            updatedAt: '2026-03-15T10:00:00.000Z',
            updatedBy: principal.userId ?? null
          };
        }
      },
      updateRuntimeFlag: {
        async execute(
          key: string,
          input: { enabled?: boolean; description?: string | null },
          principal: { userId?: string; roles?: string[] }
        ) {
          return {
            key,
            description: input.description ?? null,
            enabled: input.enabled ?? false,
            updatedAt: '2026-03-15T10:00:00.000Z',
            updatedBy: principal.userId ?? null
          };
        }
      },
      deleteRuntimeFlag: {
        async execute() {
          return true;
        }
      },
      ensureDefaultFlags: {
        async execute() {
          return;
        }
      },
      createInviteCode: {
        async execute(
          input: { code?: string | null; email?: string | null },
          principal: { userId?: string; roles?: string[] }
        ) {
          return {
            code: input.code ?? 'ABCD-EFGH-IJKL',
            email: input.email ?? null,
            label: null,
            note: null,
            enabled: true,
            expiresAt: null,
            createdAt: '2026-03-15T10:00:00.000Z',
            createdBy: principal.userId ?? null,
            redeemedAt: null,
            redeemedByUserId: null,
            redeemedEmail: null,
            redeemedDisplayName: null
          };
        }
      },
      disableInviteCode: {
        async execute(code: string) {
          return {
            code,
            email: null,
            label: null,
            note: null,
            enabled: false,
            expiresAt: null,
            createdAt: '2026-03-15T10:00:00.000Z',
            createdBy: 'admin-1',
            redeemedAt: null,
            redeemedByUserId: null,
            redeemedEmail: null,
            redeemedDisplayName: null
          };
        }
      },
      deleteInviteCode: {
        async execute() {
          return true;
        }
      },
      redeemInvite: {
        async execute() {
          return { userId: 'usr_new' };
        }
      }
    }
  } as unknown as OpsApplicationModule;
}

test('resolvers delegate query/mutation calls to application module', async () => {
  const resolvers = createResolvers(createOpsModuleStub());
  const query = resolvers.Query as Record<string, unknown>;
  const mutation = resolvers.Mutation as Record<string, unknown>;
  const ctx: GraphQLContext = {
    requestId: 'req-1',
    userId: 'admin-1',
    roles: ['admin:full']
  };

  const projects = await (query.projects as (
    src: unknown,
    args: Record<string, unknown>
  ) => Promise<unknown>)({}, {});
  assert.deepEqual(projects, [{ id: '1', name: 'svc-auth' }]);

  const flags = await (query.runtimeFlags as (
    src: unknown,
    args: Record<string, unknown>,
    ctx: GraphQLContext
  ) => Promise<unknown>)({}, {}, ctx);
  assert.deepEqual(flags, [
    {
      key: 'inviteOnlyRegistration',
      description: 'admin-1',
      enabled: true,
      updatedAt: '2026-03-15T10:00:00.000Z',
      updatedBy: 'admin-1'
    }
  ]);

  const invites = await (query.inviteCodes as (
    src: unknown,
    args: Record<string, unknown>,
    ctx: GraphQLContext
  ) => Promise<unknown>)({}, {}, ctx);
  assert.deepEqual(invites, [
    {
      code: 'ABCD-EFGH-IJKL',
      email: null,
      label: 'admin-1',
      note: null,
      enabled: true,
      expiresAt: null,
      createdAt: '2026-03-15T10:00:00.000Z',
      createdBy: 'admin-1',
      redeemedAt: null,
      redeemedByUserId: null,
      redeemedEmail: null,
      redeemedDisplayName: null
    }
  ]);

  const created = await (mutation.addProject as (
    src: unknown,
    args: { input: { name: string } }
  ) => Promise<unknown>)({}, { input: { name: 'svc-profile' } });
  assert.deepEqual(created, { id: '3', name: 'svc-profile' });

  const createdFlag = await (mutation.createRuntimeFlag as (
    src: unknown,
    args: { input: { key: string; enabled: boolean; description: string } },
    ctx: GraphQLContext
  ) => Promise<unknown>)({}, { input: { key: 'inviteOnlyRegistration', enabled: true, description: 'Pilot gate' } }, ctx);
  assert.deepEqual(createdFlag, {
    key: 'inviteOnlyRegistration',
    description: 'Pilot gate',
    enabled: true,
    updatedAt: '2026-03-15T10:00:00.000Z',
    updatedBy: 'admin-1'
  });

  const updatedFlag = await (mutation.updateRuntimeFlag as (
    src: unknown,
    args: { key: string; input: { enabled: boolean; description: string } },
    ctx: GraphQLContext
  ) => Promise<unknown>)(
    {},
    { key: 'inviteOnlyRegistration', input: { enabled: false, description: 'Paused' } },
    ctx
  );
  assert.deepEqual(updatedFlag, {
    key: 'inviteOnlyRegistration',
    description: 'Paused',
    enabled: false,
    updatedAt: '2026-03-15T10:00:00.000Z',
    updatedBy: 'admin-1'
  });

  const deletedFlag = await (mutation.deleteRuntimeFlag as (
    src: unknown,
    args: { key: string },
    ctx: GraphQLContext
  ) => Promise<unknown>)({}, { key: 'inviteOnlyRegistration' }, ctx);
  assert.equal(deletedFlag, true);

  const createdInvite = await (mutation.createInviteCode as (
    src: unknown,
    args: { input: { code: string; email: string } },
    ctx: GraphQLContext
  ) => Promise<unknown>)({}, { input: { code: 'WXYZ-1234-ABCD', email: 'pilot@example.com' } }, ctx);
  assert.deepEqual(createdInvite, {
    code: 'WXYZ-1234-ABCD',
    email: 'pilot@example.com',
    label: null,
    note: null,
    enabled: true,
    expiresAt: null,
    createdAt: '2026-03-15T10:00:00.000Z',
    createdBy: 'admin-1',
    redeemedAt: null,
    redeemedByUserId: null,
    redeemedEmail: null,
    redeemedDisplayName: null
  });

  const disabledInvite = await (mutation.disableInviteCode as (
    src: unknown,
    args: { code: string },
    ctx: GraphQLContext
  ) => Promise<unknown>)({}, { code: 'WXYZ-1234-ABCD' }, ctx);
  assert.deepEqual(disabledInvite, {
    code: 'WXYZ-1234-ABCD',
    email: null,
    label: null,
    note: null,
    enabled: false,
    expiresAt: null,
    createdAt: '2026-03-15T10:00:00.000Z',
    createdBy: 'admin-1',
    redeemedAt: null,
    redeemedByUserId: null,
    redeemedEmail: null,
    redeemedDisplayName: null
  });

  const deletedInvite = await (mutation.deleteInviteCode as (
    src: unknown,
    args: { code: string },
    ctx: GraphQLContext
  ) => Promise<unknown>)({}, { code: 'WXYZ-1234-ABCD' }, ctx);
  assert.equal(deletedInvite, true);

  const refreshed = await (mutation.refreshProjects as () => Promise<unknown>)();
  assert.deepEqual(refreshed, [{ id: '2', name: 'svc-feed' }]);
});
