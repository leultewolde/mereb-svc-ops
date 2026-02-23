import {
  createOpsApplicationModule,
  type OpsApplicationModule
} from '../application/ops/use-cases.js';
import { GitmodulesProjectsSourceAdapter } from '../adapters/outbound/projects/gitmodules-project-source.js';
import { ManualProjectsStoreAdapter } from '../adapters/outbound/projects/manual-projects-store.js';

export interface OpsContainer {
  ops: OpsApplicationModule;
}

export function createContainer(): OpsContainer {
  return {
    ops: createOpsApplicationModule({
      gitmodules: new GitmodulesProjectsSourceAdapter(),
      manualStore: new ManualProjectsStoreAdapter()
    })
  };
}

