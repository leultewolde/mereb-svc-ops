import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import underPressure from '@fastify/under-pressure';
import mercurius from 'mercurius';
import type { MercuriusOptions } from 'mercurius';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFastifyLoggerOptions,
  extractJwtRoles,
  loadEnv,
  parseAuthHeader,
  verifyJwt
} from '@mereb/shared-packages';
import type { GraphQLContext } from '../context.js';
import { createResolvers } from '../adapters/inbound/graphql/resolvers.js';
import { createContainer } from './container.js';
import type { OpsApplicationModule } from '../application/ops/use-cases.js';

loadEnv();

const typeDefsPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'schema.graphql');
const typeDefs = readFileSync(typeDefsPath, 'utf8');

type BuildServerOptions = {
  ops?: OpsApplicationModule;
};

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: createFastifyLoggerOptions('svc-ops')
  });

  await app.register(helmet);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(sensible);
  await app.register(underPressure);

  const issuer = process.env.OIDC_ISSUER;
  const audience = process.env.OIDC_AUDIENCE;
  if (!issuer) {
    throw new Error('OIDC_ISSUER env var required');
  }
  if (!audience) {
    throw new Error('OIDC_AUDIENCE env var required');
  }

  app.addHook('onRequest', async (request) => {
    const token = parseAuthHeader(request.headers);
    if (!token) {
      request.userId = undefined;
      request.roles = [];
      return;
    }
    try {
      const payload = await verifyJwt(token, { issuer, audience });
      request.userId = payload.sub;
      request.roles = extractJwtRoles(payload);
    } catch (error) {
      request.log.debug({ err: error }, 'JWT verification failed');
      request.userId = undefined;
      request.roles = [];
    }
  });

  const container = options.ops ? { ops: options.ops } : await createContainer();
  const schema = makeExecutableSchema<GraphQLContext>({
    typeDefs,
    resolvers: createResolvers(container.ops)
  });

  const mercuriusOptions: MercuriusOptions & { federationMetadata?: boolean } = {
    schema,
    graphiql: process.env.NODE_ENV !== 'production',
    federationMetadata: true,
    context: (request): GraphQLContext => ({ userId: request.userId, roles: request.roles ?? [] })
  };

  await app.register(mercurius, mercuriusOptions);

  app.addHook('onRequest', (request, _, done) => {
    (request.log as unknown as { setBindings?: (bindings: Record<string, unknown>) => void }).setBindings?.({
      userId: request.userId,
      roles: request.roles ?? []
    });
    done();
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async () => ({ status: 'ready' }));
  app.get('/flags', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return container.ops.queries.publicFlags.execute();
  });

  app.post<{ Body: { code?: string; email?: string; displayName?: string; password?: string } }>(
    '/invite/redeem',
    async (request, reply) => {
      const code = request.body?.code?.trim();
      const email = request.body?.email?.trim().toLowerCase();
      const displayName = request.body?.displayName?.trim();
      const password = request.body?.password;

      if (!code || !email || !displayName || !password) {
        return reply.status(400).send({ error: 'code, email, displayName, and password are required' });
      }

      try {
        const result = await container.ops.commands.redeemInvite.execute({
          code,
          email,
          displayName,
          password
        });
        return reply.send({ userId: result.userId });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invite redemption failed';
        const statusCode =
          message.includes('not enabled')
            ? 404
            : message.includes('already exists')
              ? 409
              : message.includes('invalid') || message.includes('expired') || message.includes('disabled') || message.includes('different email')
                ? 400
                : 500;
        return reply.status(statusCode).send({ error: message });
      }
    }
  );

  return app;
}
