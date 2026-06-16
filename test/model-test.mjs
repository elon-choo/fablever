// Offline tests for the model config layer: the auto/on/off mode resolver and the
// newer-model detection logic. No network, no keys — deterministic, wired into `npm test`.
import { decide } from '../orchestration/lib/mode.mjs';
import { candidatesOpenAI, candidatesGoogle } from '../orchestration/lib/model-freshness.mjs';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  FAIL:', msg); } };

// --- mode resolver (force auto so the heuristic is exercised regardless of local config) ---
process.env.FABLE_ULTRA = 'auto';
ok(decide({ text: 'fix a typo' }).heavy === false, 'auto: trivial task -> cheap');
ok(decide({ text: 'audit the auth token flow for vulnerabilities' }).heavy === true, 'auto: security task -> heavy');
ok(decide({ text: '결제 로직을 철저히 검증' }).heavy === true, 'auto: Korean stakes -> heavy');
ok(decide({ text: 'review these', artifactCount: 8 }).heavy === true, 'auto: many artifacts -> heavy');
ok(decide({ text: 'rename a var' }).heavy === false, 'auto: low-stakes -> cheap');
process.env.FABLE_ULTRA = 'on';
ok(decide({ text: 'fix a typo' }).heavy === true, 'on: forces heavy');
process.env.FABLE_ULTRA = 'off';
ok(decide({ text: 'audit security' }).heavy === false, 'off: forces cheap');
delete process.env.FABLE_ULTRA;

// --- newer-model detection (hardcoded provider id lists, no network) ---
const openai = ['gpt-5', 'gpt-5.1', 'gpt-5.2', 'gpt-5.4', 'gpt-5.5', 'gpt-5.5-pro', 'gpt-5.2-codex', 'gpt-5-mini', 'gpt-5-nano'];
const google = ['gemini-2.5-pro', 'gemini-3-pro-preview', 'gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];

const co = candidatesOpenAI(openai, 'gpt-5.2');
ok(JSON.stringify(co) === JSON.stringify(['gpt-5.5', 'gpt-5.4']), 'openai: old pin surfaces newer flagships, sorted desc');
ok(!co.includes('gpt-5.5-pro'), 'openai: excludes -pro (not a chat model)');
ok(!co.some(x => /mini|nano|codex/.test(x)), 'openai: excludes mini/nano/codex');
ok(candidatesOpenAI(openai, 'gpt-5.5').length === 0, 'openai: current pin -> no candidates');

const cg = candidatesGoogle(google, 'gemini-2.5-pro');
ok(JSON.stringify(cg) === JSON.stringify(['gemini-3.1-pro-preview', 'gemini-3-pro-preview']), 'google: old pin surfaces newer pro-tier, sorted desc');
ok(!cg.some(x => /flash|lite/.test(x)), 'google: excludes flash/lite');
ok(candidatesGoogle(google, 'gemini-3.1-pro-preview').length === 0, 'google: current pin -> no candidates');

console.log(`model-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
