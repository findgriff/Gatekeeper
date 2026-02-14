import { execSync } from 'node:child_process';

const port = process.env.GATEKEEPER_DEV_PORT ?? '5173';

try {
  const pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);

  if (pids.length === 0) {
    process.exit(0);
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
      console.log(`[predev] stopped process ${pid} on port ${port}`);
    } catch {
      // ignore
    }
  }
} catch {
  // lsof unavailable or no listener
}
