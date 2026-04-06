export function handleError(context: string, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  // Do not swallow - log for observability
  console.error(`[${context}] Error:`, msg);
  return msg;
}
