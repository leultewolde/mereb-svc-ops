import { addManualProject, loadManualProjects } from '../../../storage.js';
import type { ManualProjectsStorePort } from '../../../application/ops/ports.js';
import type { ManualProjectInput } from '../../../domain/ops/projects.js';

export class ManualProjectsStoreAdapter implements ManualProjectsStorePort {
  async loadProjects() {
    return loadManualProjects();
  }

  async addProject(input: ManualProjectInput) {
    return addManualProject(input);
  }
}

