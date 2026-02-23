import { loadGitmodulesProjects } from '../../../gitmodules.js';
import type { GitmoduleProjectsSourcePort } from '../../../application/ops/ports.js';

export class GitmodulesProjectsSourceAdapter implements GitmoduleProjectsSourcePort {
  async loadProjects() {
    return loadGitmodulesProjects();
  }
}

