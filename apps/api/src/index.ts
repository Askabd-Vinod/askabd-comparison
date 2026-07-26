import { createServer } from './server.js';
import { config } from './config/env.js';
async function main(): Promise<void> { const s = await createServer(); await s.listen({ port: config.PORT, host: config.HOST }); s.log.info(`Comparison API on ${config.HOST}:${config.PORT}`); }
main().catch((e) => { console.error(e); process.exit(1); });
