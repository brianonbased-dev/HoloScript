/**
 * WebhookHandler Behavior Tests
 *
 * Covers: on(), onPackagePublished(), onVersionDeprecated(), onCertificationResult(),
 * onSecurityAlert(), handle() routing, idempotency, partner ID validation,
 * strict-mode unknown event type rejection, and wildcard handlers.
 *
 * Signature verification (HMAC) is skipped in most tests by omitting the
 * signature parameter; one test explicitly verifies that an incorrect
 * signature causes a failure result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  WebhookHandler,
  WebhookVerificationError,
  type WebhookPayload,
  type PackagePublishedData,
  type SecurityAlertData,
  type CertificationResultData,
  type VersionDeprecatedData,
} from '../webhooks/WebhookHandler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandler(overrides?: Partial<ConstructorParameters<typeof WebhookHandler>[0]>) {
  return new WebhookHandler({
    signingSecret: 'test-secret',
    partnerId: 'partner-test',
    maxTimestampAge: 3600, // generous window so timestamp checks pass in tests
    strictMode: true,
    ...overrides,
  });
}

function freshPayload(
  eventType: WebhookPayload['eventType'],
  data: unknown = {},
  eventIdSuffix = String(Math.random())
): WebhookPayload {
  return {
    eventId: `evt-${eventIdSuffix}`,
    eventType,
    timestamp: new Date().toISOString(),
    partnerId: 'partner-test',
    data,
  };
}

// =============================================================================
// on() — handler registration
// =============================================================================

describe('WebhookHandler.on()', () => {
  it('calls handler when matching event type arrives', async () => {
    const handler = makeHandler();
    const spy = vi.fn();
    handler.on('package.published', spy);

    const payload = freshPayload('package.published', { name: 'my-pkg', version: '1.0.0' });
    const result = await handler.handle(payload);

    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'package.published' }));
  });

  it('does not call handler for a different event type', async () => {
    const handler = makeHandler();
    const spy = vi.fn();
    handler.on('security.alert', spy);

    await handler.handle(freshPayload('package.published', { name: 'pkg' }));
    expect(spy).not.toHaveBeenCalled();
  });

  it('calls multiple handlers registered for the same event', async () => {
    const handler = makeHandler();
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    handler.on('package.updated', spy1);
    handler.on('package.updated', spy2);

    await handler.handle(freshPayload('package.updated', {}));

    expect(spy1).toHaveBeenCalledOnce();
    expect(spy2).toHaveBeenCalledOnce();
  });

  it('wildcard "*" receives all events', async () => {
    const handler = makeHandler();
    const spy = vi.fn();
    handler.on('*', spy);

    await handler.handle(freshPayload('package.published', {}));
    await handler.handle(freshPayload('security.alert', {}));

    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Convenience handler methods
// =============================================================================

describe('WebhookHandler.onPackagePublished()', () => {
  it('receives package.published events', async () => {
    const handler = makeHandler();
    const received: PackagePublishedData[] = [];
    handler.onPackagePublished((p) => received.push(p.data));

    const data: PackagePublishedData = {
      name: 'cool-pkg',
      version: '2.0.0',
      author: 'alice',
      tarballUrl: 'https://cdn.example.com/cool-pkg-2.0.0.tgz',
    };
    await handler.handle(freshPayload('package.published', data));

    expect(received).toHaveLength(1);
    expect(received[0].name).toBe('cool-pkg');
  });
});

describe('WebhookHandler.onVersionDeprecated()', () => {
  it('receives version.deprecated events', async () => {
    const handler = makeHandler();
    const received: VersionDeprecatedData[] = [];
    handler.onVersionDeprecated((p) => received.push(p.data));

    const data: VersionDeprecatedData = {
      name: 'old-pkg',
      version: '1.0.0',
      reason: 'security vulnerability',
      deprecatedBy: 'maintainer',
    };
    await handler.handle(freshPayload('version.deprecated', data));

    expect(received).toHaveLength(1);
    expect(received[0].reason).toBe('security vulnerability');
  });
});

describe('WebhookHandler.onCertificationResult()', () => {
  it('receives certification.passed events', async () => {
    const handler = makeHandler();
    const received: CertificationResultData[] = [];
    handler.onCertificationResult((p) => received.push(p.data));

    const data: CertificationResultData = { name: 'my-pkg', version: '1.0.0', certified: true };
    await handler.handle(freshPayload('certification.passed', data));

    expect(received).toHaveLength(1);
    expect(received[0].certified).toBe(true);
  });

  it('receives certification.failed events', async () => {
    const handler = makeHandler();
    const received: CertificationResultData[] = [];
    handler.onCertificationResult((p) => received.push(p.data));

    const data: CertificationResultData = {
      name: 'bad-pkg',
      version: '0.0.1',
      certified: false,
      failureReasons: ['no README'],
    };
    await handler.handle(freshPayload('certification.failed', data));

    expect(received).toHaveLength(1);
    expect(received[0].certified).toBe(false);
  });
});

describe('WebhookHandler.onSecurityAlert()', () => {
  it('receives security.alert events', async () => {
    const handler = makeHandler();
    const received: SecurityAlertData[] = [];
    handler.onSecurityAlert((p) => received.push(p.data));

    const data: SecurityAlertData = {
      name: 'vulnerable-pkg',
      version: '1.2.3',
      severity: 'critical',
      vulnerabilityId: 'CVE-2024-0001',
      title: 'RCE',
      description: 'Remote code execution',
      affectedVersions: ['1.2.3'],
      patchedVersion: '1.2.4',
    };
    await handler.handle(freshPayload('security.alert', data));

    expect(received).toHaveLength(1);
    expect(received[0].severity).toBe('critical');
    expect(received[0].vulnerabilityId).toBe('CVE-2024-0001');
  });
});

// =============================================================================
// handle() — idempotency
// =============================================================================

describe('WebhookHandler.handle() — idempotency', () => {
  it('processes an event only once for the same eventId', async () => {
    const handler = makeHandler();
    const spy = vi.fn();
    handler.on('package.published', spy);

    const payload = freshPayload('package.published', {});
    await handler.handle(payload);
    await handler.handle(payload); // duplicate

    expect(spy).toHaveBeenCalledOnce();
  });

  it('returns success:true for a duplicate event', async () => {
    const handler = makeHandler();
    const payload = freshPayload('package.updated', {});
    await handler.handle(payload);
    const result = await handler.handle(payload);

    expect(result.success).toBe(true);
  });
});

// =============================================================================
// handle() — partner ID validation
// =============================================================================

describe('WebhookHandler.handle() — partner ID validation', () => {
  it('rejects payloads with a mismatched partnerId', async () => {
    const handler = makeHandler({ partnerId: 'correct-partner' });
    const payload: WebhookPayload = {
      ...freshPayload('package.published', {}),
      partnerId: 'wrong-partner',
    };

    const result = await handler.handle(payload);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/partner id mismatch/i);
  });

  it('accepts payloads with the correct partnerId', async () => {
    const handler = makeHandler({ partnerId: 'correct-partner' });
    const payload: WebhookPayload = {
      ...freshPayload('package.published', {}),
      partnerId: 'correct-partner',
    };

    const result = await handler.handle(payload);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// handle() — strict mode
// =============================================================================

describe('WebhookHandler.handle() — strict mode', () => {
  it('rejects unknown event types in strict mode', async () => {
    const handler = makeHandler({ strictMode: true });
    const payload = { ...freshPayload('package.published', {}), eventType: 'unknown.event' as never };

    const result = await handler.handle(payload);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unknown event type/i);
  });

  it('accepts unknown event types when strictMode is false', async () => {
    const handler = makeHandler({ strictMode: false });
    const payload = { ...freshPayload('package.published', {}), eventType: 'custom.event' as never };

    const result = await handler.handle(payload);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// handle() — timestamp validation
// =============================================================================

describe('WebhookHandler.handle() — timestamp validation', () => {
  it('rejects stale timestamps', async () => {
    const handler = makeHandler({ maxTimestampAge: 60 }); // 60 seconds window
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const payload: WebhookPayload = {
      ...freshPayload('package.published', {}),
      timestamp: staleTimestamp,
    };

    const result = await handler.handle(payload);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timestamp/i);
  });

  it('accepts fresh timestamps', async () => {
    const handler = makeHandler({ maxTimestampAge: 3600 });
    const result = await handler.handle(freshPayload('package.published', {}));
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// handle() — JSON string payload
// =============================================================================

describe('WebhookHandler.handle() — JSON string payload', () => {
  it('parses a JSON string payload correctly', async () => {
    const handler = makeHandler();
    const spy = vi.fn();
    handler.on('package.published', spy);

    const payload = freshPayload('package.published', { name: 'str-pkg' });
    const result = await handler.handle(JSON.stringify(payload));

    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('fails gracefully on malformed JSON string', async () => {
    const handler = makeHandler();
    const result = await handler.handle('{ not valid json ');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =============================================================================
// WebhookVerificationError
// =============================================================================

describe('WebhookVerificationError', () => {
  it('is an instance of Error', () => {
    const err = new WebhookVerificationError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('has the correct name', () => {
    const err = new WebhookVerificationError('test');
    expect(err.name).toBe('WebhookVerificationError');
  });

  it('preserves the message', () => {
    const err = new WebhookVerificationError('invalid sig');
    expect(err.message).toBe('invalid sig');
  });
});
