import { configuration } from '../core.mjs';
import { authAdapter } from '../auth.mjs';

try {
  const result = await authAdapter(configuration()).probe();
  console.log(JSON.stringify({ verified: Number(result.code) === 200, code: result.code, clockDeltaSeconds: Math.round(Date.now() / 1000 - result.time) }));
  if (Number(result.code) !== 200) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ verified: false, code: error.code || 'CONFIGURATION_ERROR' }));
  process.exitCode = 1;
}
