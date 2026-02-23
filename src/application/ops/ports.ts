import type { ManualProjectInput, Project } from '../../domain/ops/projects.js';

export interface GitmoduleProjectsSourcePort {
  loadProjects(): Promise<Project[]>;
}

export interface ManualProjectsStorePort {
  loadProjects(): Promise<Project[]>;
  addProject(input: ManualProjectInput): Promise<Project>;
}

