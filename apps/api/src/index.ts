import { createServer } from './server.js';
import { config } from './config/env.js';

async function main(): Promise<void> {
  const server = await createServer();
  await server.listen({ port: config.PORT, host: config.HOST });
  server.log.info(`Comparison API on ${config.HOST}:${config.PORT}`);

  // Graceful shutdown — finish in-flight requests before exiting
  const shutdown = async (signal: string) => {
    server.log.info({ signal }, 'Received shutdown signal, closing server...');
    try {
      await server.close();
      server.log.info('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, 'Error during graceful shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => { console.error(e); process.exit(1); });
