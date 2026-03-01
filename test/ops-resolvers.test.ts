import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createResolvers } from '../src/adapters/inbound/graphql/resolvers.js';
import type { OpsApplicationModule } from '../src/application/ops/use-cases.js';

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
      }
    },
    commands: {
      addProject: {
        async execute(input: { name: string }) {
          return { id: '3', ...input };
        }
      }
    }
  } as unknown as OpsApplicationModule;
}

test('resolvers delegate query/mutation calls to application module', async () => {
  const resolvers = createResolvers(createOpsModuleStub());
  const query = resolvers.Query as Record<string, unknown>;
  const mutation = resolvers.Mutation as Record<string, unknown>;

  const projects = await (query.projects as (
    src: unknown,
    args: Record<string, unknown>
  ) => Promise<unknown>)({}, {});
  assert.deepEqual(projects, [{ id: '1', name: 'svc-auth' }]);

  const created = await (mutation.addProject as (
    src: unknown,
    args: { input: { name: string } }
  ) => Promise<unknown>)({}, { input: { name: 'svc-profile' } });
  assert.deepEqual(created, { id: '3', name: 'svc-profile' });

  const refreshed = await (mutation.refreshProjects as () => Promise<unknown>)();
  assert.deepEqual(refreshed, [{ id: '2', name: 'svc-feed' }]);
});
