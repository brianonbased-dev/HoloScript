/**
 * Remove credential material from strings that may be shown to API clients.
 * Git stderr often echoes the authenticated remote URL (SEC-T04).
 */
export function sanitizeClientGitMessage(input: unknown): string {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof Error
        ? input.message
        : input != null && typeof (input as { toString?: () => string }).toString === 'function'
          ? String((input as { toString: () => string }).toString())
          : String(input);

  let s = raw.replace(/https:\/\/[^@\s/]+@/gi, 'https://');

  s = s.replace(/\bghp_[a-zA-Z0-9]{10,}\b/g, '[redacted]');
  s = s.replace(/\bgithub_pat_[a-zA-Z0-9_]+\b/gi, '[redacted]');
  s = s.replace(/\bgho_[a-zA-Z0-9]{10,}\b/g, '[redacted]');
  s = s.replace(/\bghu_[a-zA-Z0-9]{10,}\b/g, '[redacted]');
  s = s.replace(/\bghs_[a-zA-Z0-9]{10,}\b/g, '[redacted]');

  return s;
}
