/**
 * Receipt provenance namespaces.
 *
 * This package published as `@holoscript/hololand-platform` through 6.1.1 and
 * stamped that name into the `generatedBy` field of every receipt it produced —
 * including evidence checked into `docs/public/evidence/` and cited by the
 * paper program.
 *
 * Renaming the package to `@hololand/platform-services` does not make those
 * receipts wrong. They are true records of what generated them, and rewriting
 * them to match a rename would falsify provenance rather than update it. So:
 * new receipts carry the current namespace, validators accept both, and already
 * published evidence keeps verifying.
 *
 * Only add to LEGACY_RECEIPT_NAMESPACES — never remove. Each entry is a name
 * under which real receipts exist in the world.
 */

export const RECEIPT_NAMESPACE = '@hololand/platform-services';

export const LEGACY_RECEIPT_NAMESPACES = ['@holoscript/hololand-platform'] as const;

/**
 * True when `value` names this package's `module` receipt generator under either
 * the current namespace or any namespace it has previously published under.
 */
export function isKnownReceiptSource(value: unknown, module: string): boolean {
  if (typeof value !== 'string') return false;
  if (value === `${RECEIPT_NAMESPACE}/${module}`) return true;
  return LEGACY_RECEIPT_NAMESPACES.some((ns) => value === `${ns}/${module}`);
}

/** Every accepted spelling of `module`'s generator, for error messages. */
export function knownReceiptSources(module: string): string[] {
  return [
    `${RECEIPT_NAMESPACE}/${module}`,
    ...LEGACY_RECEIPT_NAMESPACES.map((ns) => `${ns}/${module}`),
  ];
}
