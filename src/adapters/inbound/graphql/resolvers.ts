import type { IResolvers } from '@graphql-tools/utils';
import type { GraphQLContext } from '../../../context.js';
import type {
  ManualProjectInput,
  ProjectKind,
  ProjectSource
} from '../../../domain/ops/projects.js';
import type {
  CreateInviteCodeInput,
  CreateRuntimeFlagInput,
  UpdateRuntimeFlagInput
} from '../../../domain/ops/runtime-config.js';
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
        }),
      runtimeFlags: (_source: unknown, _args: unknown, ctx: GraphQLContext) =>
        ops.queries.listRuntimeFlags.execute({ userId: ctx.userId, roles: ctx.roles }),
      inviteCodes: (_source: unknown, _args: unknown, ctx: GraphQLContext) =>
        ops.queries.listInviteCodes.execute({ userId: ctx.userId, roles: ctx.roles })
    },
    Mutation: {
      addProject: (_source: unknown, { input }: { input: ManualProjectInput }) =>
        ops.commands.addProject.execute(input),
      refreshProjects: () => ops.queries.refreshProjects.execute(),
      createRuntimeFlag: (_source: unknown, { input }: { input: CreateRuntimeFlagInput }, ctx: GraphQLContext) =>
        ops.commands.createRuntimeFlag.execute(input, { userId: ctx.userId, roles: ctx.roles }),
      updateRuntimeFlag: (_source: unknown, { key, input }: { key: string; input: UpdateRuntimeFlagInput }, ctx: GraphQLContext) =>
        ops.commands.updateRuntimeFlag.execute(key, input, { userId: ctx.userId, roles: ctx.roles }),
      deleteRuntimeFlag: (_source: unknown, { key }: { key: string }, ctx: GraphQLContext) =>
        ops.commands.deleteRuntimeFlag.execute(key, { userId: ctx.userId, roles: ctx.roles }),
      createInviteCode: (_source: unknown, { input }: { input: CreateInviteCodeInput }, ctx: GraphQLContext) =>
        ops.commands.createInviteCode.execute(input, { userId: ctx.userId, roles: ctx.roles }),
      disableInviteCode: (_source: unknown, { code }: { code: string }, ctx: GraphQLContext) =>
        ops.commands.disableInviteCode.execute(code, { userId: ctx.userId, roles: ctx.roles }),
      deleteInviteCode: (_source: unknown, { code }: { code: string }, ctx: GraphQLContext) =>
        ops.commands.deleteInviteCode.execute(code, { userId: ctx.userId, roles: ctx.roles })
    }
  } as IResolvers<unknown, GraphQLContext>;
}
