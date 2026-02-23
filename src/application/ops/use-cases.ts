import type {
  ManualProjectInput,
  Project,
  ProjectsFilter
} from '../../domain/ops/projects.js';
import { listProjectsFromSnapshot } from '../../domain/ops/projects.js';
import type {
  GitmoduleProjectsSourcePort,
  ManualProjectsStorePort
} from './ports.js';

interface OpsDeps {
  gitmodules: GitmoduleProjectsSourcePort;
  manualStore: ManualProjectsStorePort;
}

async function loadSnapshot(deps: OpsDeps) {
  const [gitProjects, manualProjects] = await Promise.all([
    deps.gitmodules.loadProjects(),
    deps.manualStore.loadProjects()
  ]);

  return {
    gitProjects,
    manualProjects
  };
}

export class ListProjectsQuery {
  constructor(private readonly deps: OpsDeps) {}

  async execute(filter: ProjectsFilter): Promise<Project[]> {
    return listProjectsFromSnapshot(await loadSnapshot(this.deps), filter);
  }
}

export class AddProjectUseCase {
  constructor(private readonly manualStore: ManualProjectsStorePort) {}

  async execute(input: ManualProjectInput): Promise<Project> {
    return this.manualStore.addProject(input);
  }
}

export class RefreshProjectsQuery {
  constructor(private readonly listProjects: ListProjectsQuery) {}

  async execute(): Promise<Project[]> {
    return this.listProjects.execute({});
  }
}

export interface OpsApplicationModule {
  queries: {
    listProjects: ListProjectsQuery;
    refreshProjects: RefreshProjectsQuery;
  };
  commands: {
    addProject: AddProjectUseCase;
  };
}

export function createOpsApplicationModule(deps: OpsDeps): OpsApplicationModule {
  const listProjects = new ListProjectsQuery(deps);
  return {
    queries: {
      listProjects,
      refreshProjects: new RefreshProjectsQuery(listProjects)
    },
    commands: {
      addProject: new AddProjectUseCase(deps.manualStore)
    }
  };
}

