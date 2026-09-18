import { configuration } from './core.mjs';
import { createApp } from './app.mjs';

const config = configuration();
const app = await createApp(config);
await app.listen({ host: config.host, port: config.port });
console.log(`Hermes workbench: ${config.origin}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
