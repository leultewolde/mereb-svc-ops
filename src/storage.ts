import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferKindFromPath } from './gitmodules.js';
import type { ManualProjectInput, Project } from './types.js';

function dataFilePath(): string {
  const envPath = process.env.MANUAL_PROJECTS_PATH?.trim();
  if (envPath) {
    return envPath;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'data', 'projects.local.json');
}

async function ensureDataFile(): Promise<void> {
  const target = dataFilePath();
  await mkdir(dirname(target), { recursive: true });
  try {
    await readFile(target, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeFile(target, '[]', 'utf8');
      return;
    }
    throw error;
  }
}

export async function loadManualProjects(): Promise<Project[]> {
  await ensureDataFile();
  const raw = await readFile(dataFilePath(), 'utf8');
  try {
    const parsed = JSON.parse(raw) as Project[];
    return parsed.map((project) => ({
      ...project,
      source: 'MANUAL',
      environments: project.environments ?? [],
      tags: project.tags ?? []
    }));
  } catch (error) {
    throw new Error(`Failed to parse manual project store: ${(error as Error).message}`);
  }
}

async function writeManualProjects(projects: Project[]): Promise<void> {
  await ensureDataFile();
  await writeFile(dataFilePath(), JSON.stringify(projects, null, 2), 'utf8');
}

export async function addManualProject(input: ManualProjectInput): Promise<Project> {
  const projects = await loadManualProjects();
  const id = input.path ?? `manual-${randomUUID()}`;
  const kind = input.kind ?? inferKindFromPath(input.path ?? '');

  const exists = projects.find((project) => project.id === id || project.repoUrl === input.repoUrl);
  if (exists) {
    throw new Error('Project already exists in manual store');
  }

  const project: Project = {
    id,
    name: input.name,
    path: input.path ?? input.name,
    repoUrl: input.repoUrl,
    branch: input.branch,
    kind,
    source: 'MANUAL',
    jenkinsJob: input.jenkinsJob,
    environments:
      input.environments?.map((env) => ({ ...env, lastStatus: 'UNKNOWN' as const })) ?? [],
    tags: input.tags ?? []
  };

  projects.push(project);
  await writeManualProjects(projects);
  return project;
}

export async function upsertManualProjects(projects: Project[]): Promise<void> {
  await writeManualProjects(projects);
}
