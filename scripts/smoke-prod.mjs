#!/usr/bin/env node

const DEFAULT_ENDPOINTS = [
  'https://studio.holoscript.net/api/health',
  'https://mcp.holoscript.net/health',
  'https://absorb.holoscript.net/health',
  'https://marketplace-api.holoscript.net/health',
];

const endpoints = (process.env.SMOKE_ENDPOINTS || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const targets = endpoints.length > 0 ? endpoints : DEFAULT_ENDPOINTS;

async function check(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const duration = Date.now() - started;
    if (!response.ok) {
      return { url, ok: false, status: response.status, duration };
    }
    return { url, ok: true, status: response.status, duration };
  } catch (error) {
    const duration = Date.now() - started;
    return { url, ok: false, status: 'ERR', duration, error: String(error) };
  }
}

(async () => {
  console.log('[smoke-prod] Starting production smoke checks...');
  const results = [];

  for (const url of targets) {
    const result = await check(url);
    results.push(result);
    const icon = result.ok ? '✅' : '❌';
    console.log(`${icon} ${url} -> ${result.status} (${result.duration}ms)`);
    if (result.error) {
      console.log(`   ↳ ${result.error}`);
    }
  }

  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error(`\n[smoke-prod] Failed checks: ${failures.length}/${results.length}`);
    process.exit(1);
  }

  console.log(`\n[smoke-prod] All checks passed (${results.length}/${results.length}).`);
})();
