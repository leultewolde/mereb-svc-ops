import type {
  ManualProjectInput,
  Project,
  ProjectKind,
  ProjectSource
} from '../../types.js';

export interface ProjectsFilter {
  kind?: ProjectKind;
  source?: ProjectSource;
}

export type { ManualProjectInput, Project, ProjectKind, ProjectSource };

export function mergeProjects(
  gitProjects: Project[],
  manualProjects: Project[]
): Project[] {
  const mergedByKey = new Map<string, Project>();

  for (const project of gitProjects) {
    mergedByKey.set(project.path, project);
  }

  for (const manual of manualProjects) {
    const key = manual.path ?? manual.id;
    const existing =
      mergedByKey.get(key) ??
      [...mergedByKey.values()].find((p) => p.repoUrl === manual.repoUrl);

    if (!existing) {
      mergedByKey.set(key, manual);
      continue;
    }

    mergedByKey.set(key, {
      ...existing,
      ...manual,
      source: existing.source,
      branch: manual.branch ?? existing.branch,
      jenkinsJob: manual.jenkinsJob ?? existing.jenkinsJob,
      environments: manual.environments?.length
        ? manual.environments
        : existing.environments,
      tags: Array.from(new Set([...(existing.tags ?? []), ...(manual.tags ?? [])]))
    });
  }

  return Array.from(mergedByKey.values());
}

export function filterProjects(projects: Project[], filter: ProjectsFilter): Project[] {
  let result = projects;
  if (filter.kind) {
    result = result.filter((project) => project.kind === filter.kind);
  }
  if (filter.source) {
    result = result.filter((project) => project.source === filter.source);
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export interface ProjectRegistrySnapshot {
  gitProjects: Project[];
  manualProjects: Project[];
}

export function listProjectsFromSnapshot(
  snapshot: ProjectRegistrySnapshot,
  filter: ProjectsFilter
): Project[] {
  return filterProjects(mergeProjects(snapshot.gitProjects, snapshot.manualProjects), filter);
}

