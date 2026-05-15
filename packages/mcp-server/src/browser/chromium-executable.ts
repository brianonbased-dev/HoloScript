import { existsSync } from 'node:fs';

import { chromium } from 'playwright';

const EXECUTABLE_ENV_KEYS = [
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
  'CHROMIUM_BIN',
  'CHROME_BIN',
  'PUPPETEER_EXECUTABLE_PATH',
] as const;

const SYSTEM_CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/lib/chromium/chrome',
  '/opt/google/chrome/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
];

export interface ChromiumExecutableResolution {
  executablePath?: string;
  source: 'env' | 'system' | 'playwright' | 'missing';
  sourceName?: string;
  checkedPaths: string[];
  missingEnvPaths: string[];
  playwrightExecutablePath?: string;
}

function cleanPath(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^["']|["']$/g, '');
}

function getPlaywrightExecutablePath(): string | undefined {
  if (typeof chromium.executablePath !== 'function') return undefined;

  try {
    return cleanPath(chromium.executablePath());
  } catch {
    return undefined;
  }
}

export function resolveChromiumExecutable(): ChromiumExecutableResolution {
  const checkedPaths: string[] = [];
  const missingEnvPaths: string[] = [];

  for (const key of EXECUTABLE_ENV_KEYS) {
    const executablePath = cleanPath(process.env[key]);
    if (!executablePath) continue;

    checkedPaths.push(`${key}=${executablePath}`);
    if (existsSync(executablePath)) {
      return {
        executablePath,
        source: 'env',
        sourceName: key,
        checkedPaths,
        missingEnvPaths,
      };
    }

    missingEnvPaths.push(`${key}=${executablePath}`);
  }

  for (const executablePath of SYSTEM_CHROMIUM_CANDIDATES) {
    checkedPaths.push(executablePath);
    if (existsSync(executablePath)) {
      return {
        executablePath,
        source: 'system',
        sourceName: executablePath,
        checkedPaths,
        missingEnvPaths,
      };
    }
  }

  const playwrightExecutablePath = getPlaywrightExecutablePath();
  if (playwrightExecutablePath) {
    checkedPaths.push(`playwright=${playwrightExecutablePath}`);
    if (existsSync(playwrightExecutablePath)) {
      return {
        source: 'playwright',
        sourceName: playwrightExecutablePath,
        checkedPaths,
        missingEnvPaths,
        playwrightExecutablePath,
      };
    }
  }

  return {
    source: 'missing',
    checkedPaths,
    missingEnvPaths,
    playwrightExecutablePath,
  };
}

export function resolveChromiumExecutablePath(): string | undefined {
  return resolveChromiumExecutable().executablePath;
}

export function isMissingChromiumExecutableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|browser executable|playwright install|chromium_headless_shell|chrome-headless-shell/i.test(message);
}

export function createChromiumLaunchError(
  error: unknown,
  resolution: ChromiumExecutableResolution
): Error {
  const original = error instanceof Error ? error.message : String(error);
  const checked = resolution.checkedPaths.length
    ? ` Checked paths: ${resolution.checkedPaths.join(', ')}.`
    : '';
  const missingEnv = resolution.missingEnvPaths.length
    ? ` Invalid executable env values: ${resolution.missingEnvPaths.join(', ')}.`
    : '';

  return new Error(
    `Playwright Chromium executable is unavailable for HoloScript browser tools. ` +
      `Install system Chromium and set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, ` +
      `or run "pnpm exec playwright install chromium" during deployment. ` +
      `Original error: ${original}.${missingEnv}${checked}`
  );
}
