// Offline test for the update-check version-compare logic. No network, no git — exercises the pure
// parseHead() parser against representative `git ls-remote` output. Wired into `npm test`.
import { parseHead } from '../orchestration/lib/update-check.mjs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

ok(parseHead('3a60d1d8f1c0a2b4e5d6f7a8b9c0d1e2f3a4b5c6\tHEAD\n') === '3a60d1d8f1c0a2b4e5d6f7a8b9c0d1e2f3a4b5c6', 'parses HEAD sha from ls-remote output');
ok(parseHead('') === '', 'empty input -> empty (fail-open)');
ok(parseHead('not a sha line') === '', 'non-sha input -> empty');
ok(parseHead('xyz\nabc') === '', 'no 40-hex line -> empty');
// realistic multi-line ls-remote (HEAD line first)
ok(parseHead('0123456789abcdef0123456789abcdef01234567\tHEAD\n0123456789abcdef0123456789abcdef01234567\trefs/heads/main\n') === '0123456789abcdef0123456789abcdef01234567', 'multi-line ls-remote -> HEAD sha');
// update-available semantics are a plain sha inequality
const installed = '0123456789abcdef0123456789abcdef01234567';
ok((installed !== parseHead('1111111111111111111111111111111111111111\tHEAD')) === true, 'different remote sha => update available');
ok((installed !== parseHead(installed + '\tHEAD')) === false, 'same sha => no update');

console.log(`update-check-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
