import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  createOpsApplicationModule
} from '../src/application/ops/use-cases.js';
import type {
  GitmoduleProjectsSourcePort,
  ManualProjectsStorePort
} from '../src/application/ops/ports.js';
import type { ManualProjectInput, Project } from '../src/domain/ops/projects.js';

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

test('listProjects merges gitmodule/manual projects and filters by source', async () => {
  const gitmodules: GitmoduleProjectsSourcePort = {
    async loadProjects() {
      return [project()];
    }
  };

  const manualStore: ManualProjectsStorePort = {
    async loadProjects() {
      return [project({
        id: 'services/svc-auth',
        source: 'MANUAL',
        jenkinsJob: 'job-1'
      })];
    },
    async addProject() {
      throw new Error('not used');
    }
  };

  const ops = createOpsApplicationModule({ gitmodules, manualStore });
  const projects = await ops.queries.listProjects.execute({ source: 'GITMODULE' });

  assert.equal(projects.length, 1);
  assert.equal(projects[0]?.source, 'GITMODULE');
  assert.equal(projects[0]?.jenkinsJob, 'job-1');
});

test('addProject delegates to manual store', async () => {
  let received: ManualProjectInput | null = null;
  const expected = project({ source: 'MANUAL' });

  const ops = createOpsApplicationModule({
    gitmodules: {
      async loadProjects() {
        return [];
      }
    },
    manualStore: {
      async loadProjects() {
        return [];
      },
      async addProject(input) {
        received = input;
        return expected;
      }
    }
  });

  const created = await ops.commands.addProject.execute({
    name: 'svc-auth',
    repoUrl: 'https://github.com/example/svc-auth.git'
  });

  assert.deepEqual(received, {
    name: 'svc-auth',
    repoUrl: 'https://github.com/example/svc-auth.git'
  });
  assert.equal(created.source, 'MANUAL');
});
