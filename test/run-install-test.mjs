// run-install-test.mjs — cross-platform wrapper for the POSIX install lifecycle test.
// On macOS/Linux it runs test/install-test.sh (the bash installer's lifecycle). On native Windows it
// SKIPS cleanly (exit 0): install-test.sh targets the bash installer install.sh, while the Windows
// installer install.mjs is covered by test/install-mjs-test.mjs. This keeps `npm test` green on
// Windows instead of aborting on a bash-only sub-test.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
if (process.platform === 'win32') {
  console.log('install-test.sh: SKIPPED on native Windows (POSIX install.sh lifecycle; Windows is covered by install-mjs-test.mjs).');
  process.exit(0);
}
const r = spawnSync('bash', [path.join(dir, 'install-test.sh')], { stdio: 'inherit' });
if (r.error && r.error.code === 'ENOENT') {
  console.log('install-test.sh: SKIPPED (bash not found on this platform; Windows uses install-mjs-test.mjs).');
  process.exit(0);
}
process.exit(typeof r.status === 'number' ? r.status : 1);
