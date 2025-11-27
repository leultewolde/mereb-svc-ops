import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Project, ProjectKind } from './types.js';

export function inferKindFromPath(path: string): ProjectKind {
  if (path.startsWith('services/')) return 'SERVICE';
  if (path.startsWith('web/mfe')) return 'MFE';
  if (path.startsWith('web/')) return 'MFE';
  if (path.startsWith('infra/charts')) return 'CHART';
  if (path.startsWith('infra/')) return 'INFRA';
  if (path.startsWith('packages/')) return 'PACKAGE';
  if (path.startsWith('apps/')) return 'MISC';
  return 'MISC';
}

interface GitmoduleEntry {
  name?: string;
  path?: string;
  url?: string;
  branch?: string;
}

function findGitmodulesPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../..', '.gitmodules');
}

export async function loadGitmodulesProjects(): Promise<Project[]> {
  const gitmodulesPath = findGitmodulesPath();
  let content: string;
  try {
    content = await readFile(gitmodulesPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const entries: GitmoduleEntry[] = [];
  let current: GitmoduleEntry | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('[submodule')) {
      if (current) entries.push(current);
      const nameMatch = line.match(/"(.+?)"/);
      current = { name: nameMatch?.[1] };
      continue;
    }
    if (!current) continue;
    const [key, value] = line.split('=').map((part) => part.trim());
    if (!key || !value) continue;
    if (key === 'path') current.path = value;
    if (key === 'url') current.url = value;
    if (key === 'branch') current.branch = value;
  }
  if (current) entries.push(current);

  return entries
    .filter(
      (entry): entry is GitmoduleEntry & { path: string; url: string } =>
        Boolean(entry.path && entry.url)
    )
    .map((entry) => {
      const name = entry.name ?? entry.path ?? entry.url;
      return {
        id: entry.path ?? name,
        name,
        path: entry.path ?? name,
        repoUrl: entry.url!,
        branch: entry.branch,
        kind: inferKindFromPath(entry.path ?? ''),
        source: 'GITMODULE' as const,
        jenkinsJob: undefined,
        environments: [],
        tags: []
      } satisfies Project;
    });
}
