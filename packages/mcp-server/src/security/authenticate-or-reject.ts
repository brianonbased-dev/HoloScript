/**
 * Run an authentication function and treat any thrown error as an
 * inactive (unauthorized) result, so callers answer 401 instead of
 * letting the error escape the request handler.
 */
export async function authenticateOrReject<R, T>(
  fn: (req: R) => Promise<T>,
  req: R
): Promise<T | { active: false }> {
  try {
    return await fn(req);
  } catch {
    return { active: false };
  }
}
