/**
 * SEC-T12(d) — Central hook for malware scanning before bytes hit durable storage
 * or presigned-complete flows. Default is a no-op; production should register
 * ClamAV, cloud AV, or S3/Object Lambda scanning.
 */
export function virusScanHookPoint(_context: string, _bytes: Buffer | Uint8Array): void {
  /* Integrate scanner here; `_context` labels the callsite for logs/metrics. */
}
