#!/usr/bin/env node
// fablever first-run onboarding — SessionStart hook.
//
// CLAUDE CODE LIMITATION: a SessionStart hook CANNOT make the assistant speak first. `additionalContext`
// is injected as a HIDDEN system reminder (model only) — nothing is shown to the user, and the assistant
// emits no chat message until the user sends a first prompt. So we do two complementary things:
//   (1) a VISIBLE one-line cue via the `systemMessage` field (shown to the user at session start, in their
//       OS-locale language) telling them to send any message to begin setup; and
//   (2) the HIDDEN `additionalContext` instruction so that the moment the user sends ANY first message, the
//       agent runs the short setup before their task.
// It shows on each fresh start until the user completes OR skips setup (the agent writes the 'onboarded'
// flag at the end), with a hard cap (MAX_SHOWS) so it can never nag forever.
// FAIL-OPEN, NON-BLOCKING. Disable with FABLE_ONBOARD=off or FABLE_PROFILE=off.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_SHOWS = 5; // backstop: after this many fresh starts, self-silence (defaults already work — safe)

// Locale detection for the VISIBLE cue only — we can't know the user's CHAT language before they type, so
// the banner uses the OS locale; the in-chat setup itself adapts to whatever language the user writes in.
function detectLang() {
  const env = (process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '').split('.')[0].split('_')[0].toLowerCase();
  if (env) return env;
  try { return (Intl.DateTimeFormat().resolvedOptions().locale || '').split('-')[0].toLowerCase(); } catch { return ''; }
}
const CUE = {
  ko: '👋 fablever 설치됨 — 아무 메시지나(예: "설정") 보내면 당신의 언어로 2가지(비용 모드 · 교차검증 리뷰어)만 여쭤보고 제가 설정해 드립니다. 그냥 바로 일하셔도 되고, "skip"이면 안전한 기본값($0, 키 불필요)으로 시작합니다.',
  ja: '👋 fablever をインストールしました — 何かメッセージを送れば、あなたの言語で2つ（コストモード・クロスチェックのレビュアー）だけ尋ねて設定します。そのまま作業を始めてもOK。「skip」で安全な初期設定（$0・APIキー不要）。',
  zh: '👋 已安装 fablever — 发送任意消息，我会用你的语言只问2个问题（成本模式 · 交叉验证审阅器）并替你设置。也可直接开始工作；回复 “skip” 使用安全默认值（$0，无需密钥）。',
  es: '👋 fablever instalado — envía cualquier mensaje y, en tu idioma, te haré solo 2 preguntas (modo de coste · revisor de verificación cruzada) y lo configuro por ti. O empieza a trabajar; "skip" para los valores por defecto ($0, sin clave).',
  fr: '👋 fablever installé — envoie un message et, dans ta langue, je poserai seulement 2 questions (mode de coût · relecteur de vérification croisée) et je configure pour toi. Ou commence à travailler ; « skip » pour les réglages par défaut ($0, sans clé).',
  de: '👋 fablever installiert — sende eine Nachricht und ich stelle in deiner Sprache nur 2 Fragen (Kostenmodus · Cross-Check-Reviewer) und richte alles ein. Oder leg direkt los; "skip" für sichere Standardwerte ($0, kein Schlüssel).',
  pt: '👋 fablever instalado — envie qualquer mensagem e, no seu idioma, farei apenas 2 perguntas (modo de custo · revisor de verificação cruzada) e configuro para você. Ou comece a trabalhar; "skip" para os padrões seguros ($0, sem chave).',
  en: '👋 fablever installed — send any message and I\'ll ask just 2 questions (cost mode · cross-model reviewer) in your language and set it up for you. Or just start working; say "skip" for safe defaults ($0, no key).',
};

try {
  if ((process.env.FABLE_PROFILE || '').toLowerCase() === 'off') process.exit(0);
  if ((process.env.FABLE_ONBOARD || '').toLowerCase() === 'off') process.exit(0);

  const dir = path.join(os.homedir(), '.claude', 'fable-profile');
  const flag = path.join(dir, 'onboarded');
  if (fs.existsSync(flag)) process.exit(0); // configured OR skipped OR auto-silenced -> say nothing, ever

  // SessionStart fires on startup / resume / clear / compact. Run first-run setup only on a real start —
  // never interrupt mid-work on a resume/compact. Fail-open: unknown/missing source -> treat as startup.
  let src = 'startup';
  try {
    const input = fs.readFileSync(0, 'utf8');
    if (input) src = (JSON.parse(input).source || 'startup').toLowerCase();
  } catch (_) { /* no stdin / parse fail -> proceed as startup */ }
  if (src === 'resume' || src === 'compact') process.exit(0);

  // Backstop: count fresh shows; after MAX_SHOWS, write the flag and go quiet for good. This guarantees the
  // cue can never nag forever even if the agent never writes the flag (e.g., the user keeps ignoring it).
  const countPath = path.join(dir, 'onboard-shown-count');
  let shown = 0;
  try { shown = parseInt(fs.readFileSync(countPath, 'utf8'), 10) || 0; } catch (_) {}
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(countPath, String(shown + 1)); } catch (_) {}
  if (shown + 1 > MAX_SHOWS) { try { fs.writeFileSync(flag, `auto-silenced after ${MAX_SHOWS} shows\n`); } catch (_) {} process.exit(0); }

  // Resolve the ABSOLUTE path to the installed orchestration libs, so the commands the agent runs work from
  // ANY cwd after the user restarts (they will NOT be in the repo clone dir). install copies orchestration/
  // into the immutable runtime and writes a 'fable-home' pointer to it.
  const exists = p => { try { return !!p && fs.existsSync(p); } catch { return false; } };
  let homePtr = '';
  try { homePtr = fs.readFileSync(path.join(dir, 'fable-home'), 'utf8').trim(); } catch (_) {}
  const bases = [
    process.env.FABLE_HOME,
    homePtr,
    path.join(dir, 'runtime'),
    path.join(__dirname, '..', '..'), // dev: hook running from inside the repo
  ].filter(Boolean);
  let preset = '';
  for (const b of bases) {
    const c = path.join(b, 'orchestration', 'lib', 'xverify-preset.mjs');
    if (exists(c)) { preset = c; break; }
  }
  const q = p => `'${p.replace(/'/g, `'\\''`)}'`;
  const cmd = sub => preset ? `node ${q(preset)} ${sub}` : `(orchestration tools not found — claude-only is already your default; skip cross-model setup)`;
  const modeJson = path.join(dir, 'mode.json');

  const ctx =
    '[fablever first-run setup — not yet configured]\n' +
    'fablever was just installed and the user has NOT confirmed their defaults. The moment the user sends ' +
    'ANY first message (even a greeting or an unrelated task), run this short, friendly setup FIRST, then ' +
    'continue with whatever they asked. This note shows only until setup is done. PRINCIPLE: do ALL the ' +
    'configuration yourself; ask the user ONLY for decisions and the irreducible human steps (issuing an ' +
    'API key, or signing in). Assume they may be new to AI/keys.\n\n' +
    'LANGUAGE — speak the user\'s language. Detect the language the user writes in and deliver this ENTIRE ' +
    'setup (questions, the preset explanations, key/login guidance, confirmations) in THAT language, ' +
    'translated naturally — do not dump English at a non-English user. Keep commands, file paths, env-var ' +
    'names, and preset IDs (claude-only / gpt-oauth / …) verbatim; translate the prose around them. If you ' +
    'run a fablever CLI (e.g. xverify-preset show/doctor), TRANSLATE its output — never paste raw English ' +
    'preset lists or raw JSON into a non-English chat; summarize it in their language.\n\n' +
    'STEP 0 — respect the user\'s intent; setup is OPTIONAL. The install already wrote working defaults ' +
    '(cost mode "auto", reviewer "claude-only" — no key, $0, fully functional), and this prompt will NOT ' +
    'appear again. So if the user signals they just want to work — says "skip"/"later"/"not now" — STOP ' +
    'setup, keep the defaults, do their request, and then SILENCE this prompt (see FINISH). Do NOT insist.\n\n' +
    'STEP 1 — cost mode. The installer seeded ' + modeJson + ' as {"ultra":"auto"} (cheap by default, ' +
    'spends only on high-stakes reviews). Ask if they want "auto" (recommended), "on" (always max quality), ' +
    'or "off" (always cheapest). ONLY if they change it, rewrite ' + modeJson + ' as {"ultra":"<choice>"}. ' +
    'If they keep the default, leave it — this step is already done.\n\n' +
    'STEP 2 — cross-model verification (GPT / Gemini double-checking Claude). EXPLAIN this properly in the ' +
    'user\'s language, then ASK them to DECIDE — do not silently default past it. Explain, briefly and ' +
    'concretely:\n' +
    '  • WHAT it is: an optional layer where, on deep/high-stakes reviews, a DIFFERENT-lab model (GPT and/or ' +
    'Gemini) independently re-checks Claude\'s own review findings.\n' +
    '  • WHY it helps: when Claude reviews its own work it shares blind spots with itself — a same-family ' +
    'panel can be confidently wrong together. A model from another lab catches a CLASS of misses that ' +
    'Claude-checking-Claude structurally cannot. This decorrelation is the main credibility lever of the ' +
    'deep-review pipeline.\n' +
    '  • WHEN / COST: it runs ONLY on high-stakes "ULTRA" reviews (the verify loop), never on everyday ' +
    'edits — so in practice it is used rarely and stays cheap. With nothing enabled (claude-only) ' +
    'EVERYTHING still works at $0; you just rely on Claude reviewing itself. Each provider you add needs ' +
    'either an API key (small per-use cost) or a login.\n' +
    '  • THE 4 PRESETS (run ' + cmd('show') + ' to display them; the chosen one persists as the new ' +
    'default):\n' +
    '      1) claude-only          — no key, no login, $0. Claude reviews itself. (current default; fine for ' +
    'most users.)\n' +
    '      2) gpt-oauth            — adds a GPT reviewer via their ChatGPT LOGIN (codex MCP), NO API key and ' +
    'no per-call key cost. Best value if they already pay for ChatGPT.\n' +
    '      3) gpt-oauth+gemini-api — GPT via ChatGPT login + Gemini via a Gemini API key (Gemini has a free ' +
    'tier).\n' +
    '      4) gpt-api+gemini-api   — both via API keys (one OpenRouter key covers both); simplest "set and ' +
    'forget" if they prefer keys over logins.\n' +
    '  • DECISION: ask which of the four they want and WAIT for their answer. If they pick something other ' +
    'than claude-only, apply it FOR them: ' + cmd('set <preset>') + '. If they decline or are unsure, keep ' +
    'claude-only — and say plainly that $0/no-key is a perfectly good choice they can upgrade anytime with ' +
    'the same command.\n\n' +
    'SECURITY — handling API keys (only relevant if they chose a key preset):\n' +
    '- NEVER ask the user to paste an API key into this chat, and never put a key in a file you write or ' +
    'commit. Keys belong ONLY in their shell env.\n' +
    '- For a key preset, tell them to add it themselves in their terminal — use the rc file their shell ' +
    'actually reads (zsh: ~/.zshrc, bash: ~/.bashrc), e.g. ' +
    '`echo \'export OPENROUTER_API_KEY=...\' >> ~/.zshrc && source ~/.zshrc` (or GEMINI_API_KEY), then open ' +
    'a new session. Point them to where to GET the key (openrouter.ai/keys or aistudio.google.com).\n' +
    '- For gpt-oauth there is NO API key — the human step is installing the codex CLI and signing into ' +
    'ChatGPT. Relay these EXACT three terminal commands (do not improvise): (1) `npm install -g @openai/codex`  ' +
    '(2) `codex login`  (3) `claude mcp add --transport stdio codex --scope user -- codex mcp-server` — then ' +
    '`claude mcp list` should show `codex ✔ Connected`. Confirm each succeeded before the next; if codex is ' +
    'already set up, skip.\n' +
    '- Verify the chosen preset with ' + cmd('doctor') + ' — it reports whether the needed key is PRESENT ' +
    '(true/false) and, for gpt-oauth, whether codex is registered AND signed in. It NEVER prints a key value; ' +
    'do not echo key values yourself either. If doctor says "registered but NOT signed in", tell them to run ' +
    '`codex login`.\n\n' +
    'FINISH — (1) tell the user what was set, what (if anything) they still must do (issue key / sign in), ' +
    'and how to change later (re-run the set command, or export FABLE_ULTRA=...). (2) Point them to the ' +
    'guide IN THEIR LANGUAGE: https://github.com/elon-choo/fablever/blob/main/whitepaper/09-running-it.md ' +
    '(Korean: .../whitepaper/ko/09-running-it.md). (3) IMPORTANT — once setup is concluded (whether they ' +
    'configured presets OR skipped), CREATE the file ' + flag + ' (write any short text like "done") using ' +
    'your file tools, so this first-run setup never shows again. Do this exactly once, at the end.';

  process.stdout.write(JSON.stringify({
    systemMessage: CUE[detectLang()] || CUE.en,
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
  }));
  process.exit(0);
} catch (_) {
  process.exit(0); // fail-open
}
