/**
 * Load key=value pairs from the first readable .env file (same precedence idea as
 * ai-ecosystem hooks/lib/holomesh-env.mjs): repo root .env, then ~/.ai-ecosystem/.env.
 * Does not override variables already set in process.env.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed;
  const eq = normalized.indexOf('=');
  if (eq === -1) return null;
  const key = normalized.slice(0, eq).trim();
  const value = stripWrappingQuotes(normalized.slice(eq + 1).trim());
  if (!key) return null;
  return { key, value };
}

/**
 * @param {{ workspaceRoot?: string }} [options] — defaults to HoloScript repo root (parent of scripts/)
 * @returns {{ loadedFrom: string | null }}
 */
export function loadDotenv(options = {}) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = options.workspaceRoot || resolve(__dirname, '..');
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const paths = [resolve(workspaceRoot, '.env'), resolve(homeDir, '.ai-ecosystem', '.env')];

  for (const envPath of [...new Set(paths)]) {
    try {
      if (!existsSync(envPath)) continue;
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/u)) {
        const parsed = parseEnvLine(line);
        if (!parsed) continue;
        if (!process.env[parsed.key]) process.env[parsed.key] = parsed.value;
      }
      return { loadedFrom: envPath };
    } catch {
      /* try next */
    }
  }
  return { loadedFrom: null };
}
