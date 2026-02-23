import type { IResolvers } from '@graphql-tools/utils';
import type { GraphQLContext } from '../../../context.js';
import type {
  ManualProjectInput,
  ProjectKind,
  ProjectSource
} from '../../../domain/ops/projects.js';
import type { OpsApplicationModule } from '../../../application/ops/use-cases.js';

interface ProjectsArgs {
  kind?: ProjectKind;
  source?: ProjectSource;
}

export function createResolvers(ops: OpsApplicationModule): IResolvers<unknown, GraphQLContext> {
  return {
    Query: {
      projects: (_source: unknown, args: ProjectsArgs) =>
        ops.queries.listProjects.execute({
          kind: args.kind,
          source: args.source
        })
    },
    Mutation: {
      addProject: (_source: unknown, { input }: { input: ManualProjectInput }) =>
        ops.commands.addProject.execute(input),
      refreshProjects: () => ops.queries.refreshProjects.execute()
    }
  } as IResolvers<unknown, GraphQLContext>;
}
