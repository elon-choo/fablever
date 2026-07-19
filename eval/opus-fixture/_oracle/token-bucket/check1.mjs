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

const bucket = new TokenBucket({ capacity: 5, refillPerSec: 2 });
assert.equal(bucket.tryRemove(0, 3), true, 'a new bucket starts full');
assert.equal(bucket.tryRemove(0, 3), false, 'an unavailable amount is rejected');
assert.equal(bucket.tryRemove(0, 2), true, 'a rejected attempt preserves the balance');
assert.equal(bucket.tryRemove(1.5, 3), true, 'elapsed time restores tokens');

const capped = new TokenBucket({ capacity: 4, refillPerSec: 1 });
assert.equal(capped.tryRemove(10, 4), true);
assert.equal(
  capped.tryRemove(110, 5),
  false,
  'an idle bucket cannot serve more than its capacity',
);
assert.equal(capped.tryRemove(110, 4), true, 'a failed large request removes nothing');

console.log('ok');
