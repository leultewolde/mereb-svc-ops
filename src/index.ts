import { buildServer } from './server.js';

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 4009);
  const host = process.env.HOST ?? '0.0.0.0';
  const server = await buildServer();

  try {
    await server.listen({ port, host });
    server.log.info({ port, host }, 'svc-ops ready');
  } catch (error) {
    server.log.error({ err: error }, 'Failed to start svc-ops');
    process.exit(1);
  }
}

void main();
