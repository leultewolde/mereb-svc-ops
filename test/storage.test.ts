import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, test } from 'vitest';

const previousGitmodulesPath = process.env.GITMODULES_PATH;
const previousManualProjectsPath = process.env.MANUAL_PROJECTS_PATH;

afterEach(() => {
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
});

test('loadGitmodulesProjects reads project definitions from GITMODULES_PATH', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svc-ops-gitmodules-'));
  const gitmodulesPath = join(dir, '.gitmodules');
  process.env.GITMODULES_PATH = gitmodulesPath;

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

  const { loadGitmodulesProjects } = await import('../src/gitmodules.js');
  const projects = await loadGitmodulesProjects();

  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0], {
    id: 'services/svc-auth',
    name: 'services/svc-auth',
    path: 'services/svc-auth',
    repoUrl: 'git@github.com:leultewolde/mereb-svc-auth.git',
    branch: 'main',
    kind: 'SERVICE',
    source: 'GITMODULE',
    jenkinsJob: undefined,
    environments: [],
    tags: []
  });
});

test('loadGitmodulesProjects returns an empty list when the gitmodules file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svc-ops-gitmodules-missing-'));
  process.env.GITMODULES_PATH = join(dir, '.missing-gitmodules');

  const { loadGitmodulesProjects } = await import('../src/gitmodules.js');
  const projects = await loadGitmodulesProjects();

  assert.deepEqual(projects, []);
});

test('loadGitmodulesProjects rethrows unexpected read errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svc-ops-gitmodules-error-'));
  process.env.GITMODULES_PATH = dir;

  const { loadGitmodulesProjects } = await import('../src/gitmodules.js');
  await assert.rejects(
    () => loadGitmodulesProjects(),
    (error) => error instanceof Error
  );
});

test('inferKindFromPath maps common repository paths', async () => {
  const { inferKindFromPath } = await import('../src/gitmodules.js');

  assert.equal(inferKindFromPath('packages/ui-shared'), 'PACKAGE');
  assert.equal(inferKindFromPath('web/mfe-profile'), 'MFE');
  assert.equal(inferKindFromPath('infra/charts/app-chart'), 'CHART');
  assert.equal(inferKindFromPath('apps/mobile'), 'MISC');
});

test('addManualProject persists through the MANUAL_PROJECTS_PATH override', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svc-ops-manual-store-'));
  const manualStorePath = join(dir, 'projects.json');
  process.env.MANUAL_PROJECTS_PATH = manualStorePath;

  await writeFile(manualStorePath, '[]', 'utf8');

  const { addManualProject, loadManualProjects } = await import('../src/storage.js');
  const before = await loadManualProjects();
  assert.deepEqual(before, []);

  const created = await addManualProject({
    name: 'svc-profile',
    path: 'services/svc-profile',
    repoUrl: 'https://github.com/example/svc-profile.git',
    tags: ['backend']
  });

  assert.equal(created.source, 'MANUAL');
  assert.equal(created.path, 'services/svc-profile');

  const raw = JSON.parse(await readFile(manualStorePath, 'utf8')) as Array<Record<string, unknown>>;
  assert.equal(raw.length, 1);
  assert.equal(raw[0]?.name, 'svc-profile');

  const loaded = await loadManualProjects();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.source, 'MANUAL');
  assert.deepEqual(loaded[0]?.tags, ['backend']);
});

test('loadManualProjects throws on invalid json and addManualProject rejects duplicates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svc-ops-manual-errors-'));
  const manualStorePath = join(dir, 'projects.json');
  process.env.MANUAL_PROJECTS_PATH = manualStorePath;

  await writeFile(manualStorePath, '{invalid', 'utf8');
  const { addManualProject, loadManualProjects } = await import('../src/storage.js');

  await assert.rejects(
    () => loadManualProjects(),
    (error) =>
      error instanceof Error &&
      error.message.startsWith('Failed to parse manual project store:')
  );

  await writeFile(manualStorePath, '[]', 'utf8');
  await addManualProject({
    name: 'svc-auth',
    path: 'services/svc-auth',
    repoUrl: 'https://github.com/example/svc-auth.git'
  });

  await assert.rejects(
    () =>
      addManualProject({
        name: 'svc-auth',
        path: 'services/svc-auth',
        repoUrl: 'https://github.com/example/svc-auth.git'
      }),
    (error) => error instanceof Error && error.message === 'Project already exists in manual store'
  );
});

test('loadManualProjects rethrows unexpected filesystem errors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'svc-ops-manual-fs-error-'));
  process.env.MANUAL_PROJECTS_PATH = dir;

  const { loadManualProjects } = await import('../src/storage.js');
  await assert.rejects(
    () => loadManualProjects(),
    (error) => error instanceof Error
  );
});
