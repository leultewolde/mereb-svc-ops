import { loadGitmodulesProjects } from './gitmodules.js';
import { addManualProject, loadManualProjects } from './storage.js';
import type { ManualProjectInput, Project, ProjectKind, ProjectSource } from './types.js';

interface ProjectsArgs {
  kind?: ProjectKind;
  source?: ProjectSource;
}

function mergeProjects(gitProjects: Project[], manualProjects: Project[]): Project[] {
  const mergedByKey = new Map<string, Project>();

  for (const project of gitProjects) {
    mergedByKey.set(project.path, project);
  }

  for (const manual of manualProjects) {
    const key = manual.path ?? manual.id;
    const existing = mergedByKey.get(key) ?? [...mergedByKey.values()].find((p) => p.repoUrl === manual.repoUrl);

    if (!existing) {
      mergedByKey.set(key, manual);
      continue;
    }

    mergedByKey.set(key, {
      ...existing,
      ...manual,
      // preserve that it originated from gitmodules while allowing manual metadata to decorate it
      source: existing.source,
      branch: manual.branch ?? existing.branch,
      jenkinsJob: manual.jenkinsJob ?? existing.jenkinsJob,
      environments: manual.environments?.length ? manual.environments : existing.environments,
      tags: Array.from(new Set([...(existing.tags ?? []), ...(manual.tags ?? [])]))
    });
  }

  return Array.from(mergedByKey.values());
}

async function listProjects(args: ProjectsArgs): Promise<Project[]> {
  const [gitProjects, manualProjects] = await Promise.all([
    loadGitmodulesProjects(),
    loadManualProjects()
  ]);

  let projects = mergeProjects(gitProjects, manualProjects);

  if (args.kind) {
    projects = projects.filter((project) => project.kind === args.kind);
  }
  if (args.source) {
    projects = projects.filter((project) => project.source === args.source);
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

export const resolvers = {
  Query: {
    projects: async (_: unknown, args: ProjectsArgs): Promise<Project[]> => listProjects(args)
  },
  Mutation: {
    addProject: async (_: unknown, { input }: { input: ManualProjectInput }): Promise<Project> =>
      addManualProject(input),
    refreshProjects: async (): Promise<Project[]> => listProjects({})
  }
};

export type Resolvers = typeof resolvers;
