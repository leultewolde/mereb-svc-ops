export type ProjectKind =
  | 'SERVICE'
  | 'PACKAGE'
  | 'MFE'
  | 'INFRA'
  | 'CHART'
  | 'TERRAFORM'
  | 'MISC';

export type ProjectSource = 'GITMODULE' | 'MANUAL';

export type DeployStatus = 'UNKNOWN' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface ProjectEnvironment {
  name: string;
  url?: string;
  deployTarget?: string;
  lastVersion?: string;
  lastStatus: DeployStatus;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  repoUrl: string;
  branch?: string;
  kind: ProjectKind;
  source: ProjectSource;
  jenkinsJob?: string;
  environments: ProjectEnvironment[];
  tags: string[];
}

export interface ManualProjectInput {
  name: string;
  path?: string;
  repoUrl: string;
  branch?: string;
  kind?: ProjectKind;
  jenkinsJob?: string;
  environments?: Array<Pick<ProjectEnvironment, 'name' | 'url' | 'deployTarget'>>;
  tags?: string[];
}
