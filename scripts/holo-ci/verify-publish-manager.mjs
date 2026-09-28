#!/usr/bin/env node

/**
 * Block raw npm publish for workspace-protocol packages.
 *
 * npm preserves workspace:^ in the tarball, while the approved pnpm/wrapper
 * release paths rewrite internal references to public semver ranges.
 */

export function isPnpmUserAgent(userAgent) {
  return /(?:^|\s)pnpm\/\d/iu.test(String(userAgent || ''));
}

if (process.argv.includes('--self-test')) {
  const passed =
    isPnpmUserAgent('pnpm/9.15.9 npm/? node/v22.0.0 win32 x64') &&
    !isPnpmUserAgent('npm/11.4.2 node/v22.0.0 win32 x64') &&
    !isPnpmUserAgent('');
  if (!passed) {
    console.error('[verify-publish-manager] FAIL user-agent classifier');
    process.exit(1);
  }
  console.log('[verify-publish-manager] self-test passed');
  process.exit(0);
}

if (!isPnpmUserAgent(process.env.npm_config_user_agent)) {
  console.error(
    '[verify-publish-manager] FAIL raw npm publish leaves workspace dependencies in public tarballs. ' +
      'Use the guarded HoloScript release flow or scripts/holo-ci/publish-npm-package.mjs.'
  );
  process.exit(1);
}

console.log('[verify-publish-manager] pnpm workspace dependency rewriting is active.');
