import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const solutionDir = process.argv[2];
assert.ok(solutionDir, 'solution directory argument is required');

const moduleUrl = pathToFileURL(
  path.join(path.resolve(solutionDir), 'token-bucket.mjs'),
).href;
const { TokenBucket } = await import(moduleUrl);
assert.equal(typeof TokenBucket, 'function');

const capped = new TokenBucket({ capacity: 3, refillPerSec: 10 });
assert.equal(capped.tryRemove(20, 3), true);
assert.equal(
  capped.tryRemove(120, 4),
  false,
  'a long idle period must not overflow the bucket',
);
assert.equal(capped.tryRemove(120, 3), true);
assert.equal(capped.tryRemove(120, 0.01), false);

const fractional = new TokenBucket({ capacity: 2, refillPerSec: 0.5 });
assert.equal(fractional.tryRemove(0, 2), true);
assert.equal(fractional.tryRemove(1, 1), false, 'only half a token has refilled');
assert.equal(
  fractional.tryRemove(1, 0.5),
  true,
  'fractional tokens are available and failed removals do not create debt',
);
assert.equal(fractional.tryRemove(1, 0.01), false, 'the balance never goes negative');
assert.equal(fractional.tryRemove(2, 0.5), true);

console.log('ok');
