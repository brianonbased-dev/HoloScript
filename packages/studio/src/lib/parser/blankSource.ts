/**
 * Blank source (whitespace and comments only) is an empty scene in an editor.
 *
 * Since #563 the .holo parser refuses blank source with HS1001 ("Source is
 * empty") instead of returning an empty composition with no errors. That is the
 * right verdict for a file being validated or published, and the wrong one for
 * an editor buffer a user just cleared or a new scene that only has a comment:
 * those must render an empty scene, not an error. Callers that render editor
 * buffers use this to tell the two apart. The parser still returns the empty
 * implicit composition as `ast`, so editors keep a shape.
 */
export const BLANK_SOURCE_CODE = 'HS1001';

export function isOnlyBlankSourceError(errors: unknown): boolean {
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.every(
    (e) => typeof e === 'object' && e !== null && (e as { code?: unknown }).code === BLANK_SOURCE_CODE
  );
}
