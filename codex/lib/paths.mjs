// codex/lib/paths.mjs — resolve every path the Codex-native fablever install touches.
//
// Codex CLI has no Claude-Code output-style surface; its equivalents are AGENTS.md (instruction layer),
// hooks.json (lifecycle hooks), and config.toml (MCP servers). This module is the SINGLE source of truth
// for where those live, for both user scope (CODEX_HOME, default ~/.codex) and project scope (cwd/.codex).
//
// Pure: no side effects, no fs writes. Zero dependencies (Node built-ins only). Importable by install.mjs
// (ESM) and reused by the Codex install/uninstall/status/dry-run logic.
import os from 'node:os';
import path from 'node:path';

// CODEX_HOME, exactly as the Codex CLI resolves it: the env var if set, else ~/.codex.
export function codexHome(env = process.env) {
  const h = (env.CODEX_HOME || '').trim();
  return h ? path.resolve(h) : path.join(os.homedir(), '.codex');
}

// The user's home directory. Codex discovers personal Agent Skills from $HOME/.agents/skills — NOT under
// CODEX_HOME — so the skills dir keys off HOME, not CODEX_HOME. We honor $HOME/$USERPROFILE if set (this is
// also what lets the test harness sandbox it) and fall back to os.homedir().
export function homeDir(env = process.env) {
  const h = (env.HOME || env.USERPROFILE || '').trim();
  return h ? path.resolve(h) : os.homedir();
}

// User-scope paths (global Codex config under CODEX_HOME).
export function userPaths(env = process.env) {
  const HOME = codexHome(env);
  const PROFILE_HOME = path.join(HOME, 'fable-profile');
  const RUNTIME = path.join(PROFILE_HOME, 'runtime');
  return {
    scope: 'user',
    CODEX_HOME: HOME,
    agents: path.join(HOME, 'AGENTS.md'),
    agentsOverride: path.join(HOME, 'AGENTS.override.md'),
    configToml: path.join(HOME, 'config.toml'),
    hooksJson: path.join(HOME, 'hooks.json'),
    hooksDir: path.join(HOME, 'hooks'),
    profileHome: PROFILE_HOME,
    runtime: RUNTIME,
    tasteFile: path.join(PROFILE_HOME, 'taste.json'),
    installedVersion: path.join(PROFILE_HOME, 'installed-version.json'),
    mcpServer: path.join(RUNTIME, 'mcp', 'src', 'server.js'),
    // Codex discovers PERSONAL skills from $HOME/.agents/skills (not CODEX_HOME) — see Codex Agent Skills docs.
    agentsSkillsDir: path.join(homeDir(env), '.agents', 'skills'),
  };
}

// Project-scope paths (a repo's own .codex/ plus a project-root AGENTS.md). Project config only loads in a
// trusted project, and we never install project hooks unless explicitly asked — see codex-install.mjs.
export function projectPaths(cwd = process.cwd()) {
  const ROOT = path.resolve(cwd);
  const DOT = path.join(ROOT, '.codex');
  const PROFILE_HOME = path.join(DOT, 'fable-profile');
  const RUNTIME = path.join(PROFILE_HOME, 'runtime');
  return {
    scope: 'project',
    CODEX_HOME: DOT,                       // project config root (not the global ~/.codex)
    projectRoot: ROOT,
    agents: path.join(ROOT, 'AGENTS.md'),  // project instruction marker lives at the repo root
    agentsOverride: path.join(ROOT, 'AGENTS.override.md'),
    configToml: path.join(DOT, 'config.toml'),
    hooksJson: path.join(DOT, 'hooks.json'),
    hooksDir: path.join(DOT, 'hooks'),
    profileHome: PROFILE_HOME,
    runtime: RUNTIME,
    tasteFile: path.join(PROFILE_HOME, 'taste.json'),
    installedVersion: path.join(PROFILE_HOME, 'installed-version.json'),
    mcpServer: path.join(RUNTIME, 'mcp', 'src', 'server.js'),
    // Codex discovers PROJECT skills from $REPO_ROOT/.agents/skills — install them at the project root.
    agentsSkillsDir: path.join(ROOT, '.agents', 'skills'),
  };
}

// Pick the path set for a scope ('user' | 'project'). Default user, matching --codex-scope default.
export function resolvePaths(scope = 'user', { env = process.env, cwd = process.cwd() } = {}) {
  return scope === 'project' ? projectPaths(cwd) : userPaths(env);
}
