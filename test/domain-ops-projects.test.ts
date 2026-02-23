import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterProjects,
  listProjectsFromSnapshot,
  mergeProjects,
  type Project
} from '../src/domain/ops/projects.js';

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

test('mergeProjects decorates gitmodule project with manual metadata', () => {
  const gitProjects = [project()];
  const manualProjects = [
    project({
      source: 'MANUAL',
      jenkinsJob: 'job-1',
      tags: ['ops', 'backend'],
      environments: [{ name: 'dev', lastStatus: 'UNKNOWN' }]
    })
  ];

  const merged = mergeProjects(gitProjects, manualProjects);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.source, 'GITMODULE');
  assert.equal(merged[0]?.jenkinsJob, 'job-1');
  assert.deepEqual(merged[0]?.tags, ['ops', 'backend']);
});

test('filterProjects and listProjectsFromSnapshot apply sorting and filters', () => {
  const projects = [
    project({ id: 'b', name: 'zzz', source: 'MANUAL' }),
    project({ id: 'a', name: 'aaa', source: 'GITMODULE' })
  ];

  const filtered = filterProjects(projects, { source: 'GITMODULE' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.name, 'aaa');

  const listed = listProjectsFromSnapshot(
    {
      gitProjects: [projects[0]!],
      manualProjects: [
        project({
          id: 'services/svc-feed',
          name: 'aaa',
          path: 'services/svc-feed',
          repoUrl: 'https://github.com/example/svc-feed.git',
          source: 'MANUAL'
        })
      ]
    },
    {}
  );
  assert.deepEqual(listed.map((p) => p.name), ['aaa', 'zzz']);
});
