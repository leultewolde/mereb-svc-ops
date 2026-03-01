import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, test } from 'vitest';

let previousGitmodulesPath: string | undefined;
let previousManualProjectsPath: string | undefined;
let previousIssuer: string | undefined;
let previousAudience: string | undefined;
let gitmodulesPath = '';
let manualProjectsPath = '';

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

test('buildServer exposes project query and mutation flows with file-backed storage', async () => {
  const { buildServer } = await import('../src/server.js');
  const app = await buildServer();

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
