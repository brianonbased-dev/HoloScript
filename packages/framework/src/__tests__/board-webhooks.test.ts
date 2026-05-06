import { describe, expect, it } from 'vitest';
import {
  BOARD_WEBHOOK_FETCH_BY_ID_BEHAVIOR,
  BOARD_WEBHOOK_ORDERING_GUARANTEE,
  buildBoardWebhookRequest,
  canonicalBoardWebhookBody,
  createBoardWebhookEnvelope,
  nextBoardWebhookRetry,
  recordBoardWebhookDeliveryFailure,
  shouldDeliverBoardWebhook,
  signBoardWebhookEnvelope,
  validateBoardWebhookSubscription,
  verifyBoardWebhookSignature,
  type BoardWebhookDelivery,
  type BoardWebhookSubscription,
} from '../board';

const subscription: BoardWebhookSubscription = {
  id: 'sub_board',
  url: 'https://hooks.example.test/holomesh',
  events: ['task.created', 'task.done', 'policy.violation'],
  secretRef: 'vault:webhooks/board',
  signing: { algorithm: 'hmac-sha256', toleranceSeconds: 300 },
  retry: { maxAttempts: 3, backoffMs: 1000, maxBackoffMs: 5000 },
  ordering: 'per-task',
  deadLetterSink: 'dead-letter://board-webhooks',
};

function makeEnvelope() {
  return createBoardWebhookEnvelope({
    id: 'evt_task_done_001',
    type: 'task.done',
    timestamp: '2026-05-06T22:00:00.000Z',
    teamId: 'team_1',
    taskId: 'task_1',
    sequence: 7,
    payload: {
      commitHash: 'abc1234',
      task: { id: 'task_1', title: 'Ship it' },
    },
    fetchById: {
      id: 'task_1',
      url: '/api/holomesh/team/team_1/board/task_1',
    },
  });
}

describe('board webhooks', () => {
  it('validates subscriptions and documents delivery semantics', () => {
    expect(validateBoardWebhookSubscription(subscription)).toEqual([]);
    expect(BOARD_WEBHOOK_ORDERING_GUARANTEE).toContain('at-least-once');
    expect(BOARD_WEBHOOK_FETCH_BY_ID_BEHAVIOR).toContain('fetch');

    const invalid: BoardWebhookSubscription = {
      id: '',
      url: '',
      events: ['not.real' as never],
      signing: { algorithm: 'plain' as never },
      retry: { maxAttempts: 0, backoffMs: -1 },
    };

    expect(validateBoardWebhookSubscription(invalid)).toEqual([
      'BoardWebhookSubscription.id is required.',
      'BoardWebhookSubscription.url is required.',
      'BoardWebhookSubscription.events contains unsupported event: not.real.',
      'BoardWebhookSubscription.signing.algorithm is unsupported: plain.',
      'BoardWebhookSubscription.retry.maxAttempts must be at least 1.',
      'BoardWebhookSubscription.retry.backoffMs cannot be negative.',
    ]);
  });

  it('filters subscribed events', () => {
    expect(shouldDeliverBoardWebhook(subscription, 'task.done')).toBe(true);
    expect(shouldDeliverBoardWebhook(subscription, 'memory.promoted')).toBe(false);
    expect(shouldDeliverBoardWebhook({ ...subscription, events: ['*'] }, 'memory.promoted')).toBe(
      true
    );
    expect(shouldDeliverBoardWebhook({ ...subscription, enabled: false }, 'task.done')).toBe(false);
  });

  it('canonicalizes and signs payloads for verification', async () => {
    const envelope = makeEnvelope();
    const canonical = canonicalBoardWebhookBody(envelope);
    const signature = await signBoardWebhookEnvelope(envelope, 'secret');

    expect(canonical).toContain('"commitHash":"abc1234"');
    expect(signature).toMatch(/^t=2026-05-06T22:00:00.000Z,v1=[a-f0-9]{64}$/);
    await expect(
      verifyBoardWebhookSignature(envelope, 'secret', signature, {
        now: '2026-05-06T22:03:00.000Z',
      })
    ).resolves.toBe(true);
    await expect(
      verifyBoardWebhookSignature(
        { ...envelope, payload: { commitHash: 'tampered' } },
        'secret',
        signature,
        { now: '2026-05-06T22:03:00.000Z' }
      )
    ).resolves.toBe(false);
    await expect(
      verifyBoardWebhookSignature(envelope, 'secret', signature, {
        now: '2026-05-06T22:10:01.000Z',
        toleranceSeconds: 300,
      })
    ).resolves.toBe(false);
  });

  it('builds idempotent signed HTTP requests', async () => {
    const request = await buildBoardWebhookRequest(subscription, makeEnvelope(), 'secret');

    expect(request.method).toBe('POST');
    expect(request.url).toBe(subscription.url);
    expect(request.idempotencyKey).toBe('sub_board:evt_task_done_001');
    expect(request.headers['idempotency-key']).toBe('sub_board:evt_task_done_001');
    expect(request.headers['x-holoscript-event-type']).toBe('task.done');
    expect(request.headers['x-holoscript-signature']).toMatch(/^t=.*?,v1=[a-f0-9]{64}$/);
  });

  it('moves exhausted deliveries to dead letter after retry attempts', () => {
    const delivery: BoardWebhookDelivery = {
      subscriptionId: 'sub_board',
      eventId: 'evt_task_done_001',
      attempt: 1,
      status: 'pending',
      idempotencyKey: 'sub_board:evt_task_done_001',
    };

    const retrying = recordBoardWebhookDeliveryFailure(
      delivery,
      subscription,
      'http 500',
      '2026-05-06T22:00:00.000Z'
    );
    const dead = nextBoardWebhookRetry(
      { ...retrying, attempt: 3 },
      subscription,
      '2026-05-06T22:00:00.000Z'
    );

    expect(retrying.status).toBe('retrying');
    expect(retrying.nextRetryAt).toBe('2026-05-06T22:00:02.000Z');
    expect(retrying.lastError).toBe('http 500');
    expect(dead.status).toBe('dead-lettered');
    expect(dead.deadLetterSink).toBe('dead-letter://board-webhooks');
  });
});
