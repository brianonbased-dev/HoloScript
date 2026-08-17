/**
 * Registry truth — is every advertised language id one the runtime can produce?
 *
 * This exists because the previous drift gate compared source text to source
 * text: the `SupportedLanguage` union parsed out of `types.ts` against the
 * `registerAdapter(new X(` calls parsed out of `index.ts`. Those agreed while
 * the registry still advertised seven ids no scan could ever return
 * (`java`, `cpp`, `csharp`, `php`, `swift`, `kotlin`, `javascript`). A scan
 * requesting one of them selected zero files, and because completeness was
 * `graphFileCount >= expectedGraphFileCount`, zero candidates made it
 * *vacuously* true at ratio 1 — an empty graph published as authoritative.
 *
 * The only statement that catches that is a comparison against
 * `getSupportedLanguages()`, which reports what `registerAdapter` actually did.
 *
 * The comparison lives here rather than inside the gate script so the gate and
 * its regression test share ONE implementation. A check whose semantics are
 * copied into its own test proves only that the copy agrees with itself.
 */

/** The one id allowed to exist with no adapter behind it. */
export const FALLBACK_LANGUAGE = 'plaintext';

/** The subset of a language-registry.json row this comparison needs. */
export interface RegistryLanguageRow {
  id: string;
  status: string;
  adapter?: string | null;
}

/** A row is a real capability claim only when an adapter backs it. */
export function isAdapterBacked(row: RegistryLanguageRow): boolean {
  return row.status === 'implemented' || row.status === 'native';
}

/**
 * Compare the registry against the live adapter registry.
 *
 * Returns one human-readable finding per divergence, empty when they agree.
 * Both directions are checked, and the single fallback exemption is stated
 * explicitly rather than left as an unexplained gap in the comparison.
 */
export function findRegistryRuntimeDrift(
  rows: readonly RegistryLanguageRow[],
  runtimeLanguages: readonly string[]
): string[] {
  const findings: string[] = [];
  const runtime = new Set(runtimeLanguages);
  const adapterBacked = new Set(rows.filter(isAdapterBacked).map((row) => row.id));

  for (const id of adapterBacked) {
    if (!runtime.has(id)) {
      findings.push(
        `Registry advertises "${id}" as implemented/native, but getSupportedLanguages() does not `
          + 'return it. A scan requesting that id selects zero files and reports complete coverage '
          + 'over an empty graph. Ship an adapter that registers it, or remove the id.'
      );
    }
  }

  for (const id of runtime) {
    if (!adapterBacked.has(id)) {
      // The fallback gaining an adapter is one fault, and the clause below names
      // it precisely. Reporting it here too would print two findings for one
      // problem and send the reader looking for a second, non-existent cause.
      if (id === FALLBACK_LANGUAGE) continue;
      findings.push(
        `getSupportedLanguages() returns "${id}", but the registry does not carry it as `
          + 'implemented/native. Regenerate the registry so it reports what the runtime can do.'
      );
    }
  }

  for (const row of rows) {
    if (adapterBacked.has(row.id)) continue;
    if (row.id !== FALLBACK_LANGUAGE) {
      findings.push(
        `Registry id "${row.id}" has no registered adapter (status "${row.status}"). `
          + `"${FALLBACK_LANGUAGE}" is the only id permitted without one. Ship the adapter or `
          + 'remove the id from SupportedLanguage.'
      );
      continue;
    }
    if (runtime.has(row.id)) {
      findings.push(
        `"${FALLBACK_LANGUAGE}" is the no-adapter fallback, but getSupportedLanguages() returns `
          + 'it. If it now has an adapter it is no longer the fallback; pick one.'
      );
    }
  }

  return findings;
}
