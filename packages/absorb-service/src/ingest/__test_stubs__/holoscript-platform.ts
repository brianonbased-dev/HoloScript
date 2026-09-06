/**
 * Test-only @holoscript/platform surface.
 *
 * The core parser barrel re-exports ImportResolver, which imports
 * digestPackageSource from @holoscript/platform. Absorb ingest tests need
 * parseHolo, not the platform registry, so this stub keeps the parser loadable
 * without building the platform package.
 */
import { createHash } from 'node:crypto';

export async function digestPackageSource(source: string): Promise<string> {
  return createHash('sha256').update(source).digest('hex');
}
