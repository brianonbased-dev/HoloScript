/**
 * Next.js instrumentation hook.
 *
 * The `@holoscript/config` import MUST stay inside the nodejs-runtime guard and MUST be
 * dynamic. A top-level static import is compiled into EVERY runtime bundle Next builds for
 * this file — including edge, which has no Node built-ins. `@holoscript/config` lazily pulls
 * `@holoscript/secrets-broker` (node:os / node:crypto / node:fs/promises / node:child_process),
 * so a static import made webpack resolve those built-ins in a bundle that cannot provide them
 * and every Studio page 500'd with `Module not found: Can't resolve 'os'`.
 *
 * The runtime `if` alone was not enough: it gates EXECUTION, while the failure was at
 * COMPILE time. Moving the import inside the branch is what keeps it out of the edge bundle.
 * `@holoscript/secrets-broker` is also listed in next.config.js `serverExternalPackages` so
 * the node runtime requires it rather than bundling it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { requireConfig, REQUIRED_VARS } = await import('@holoscript/config');
    requireConfig(REQUIRED_VARS.STUDIO as unknown as string[], 'studio');
  }
}
