/**
 * UAA2 to HoloScript Messaging Mapping POC
 *
 * Verifies that messages from the uAA2-service (standalone files or DB)
 * can be correctly mapped to HoloScript's AgentMessaging schema.
 */

import { describe, it, expect } from 'vitest';
import { validateMessageSchema, Message, MessagePriority, generateMessageId } from '../index';

describe('UAA2 to HoloScript Mapping POC', () => {
  // Sample UAA2 message structure (from UAA2_MASTER_PORTAL_INTEGRATION_PLAN.md)
  const sampleUaa2Message = {
    id: 'uaa2-msg-123',
    from_agent: 'research-agent',
    to_agent: 'ceo-agent',
    action: 'submit-wisdom',
    message: 'New wisdom discovered regarding false positives.',
    priority: 'high',
    request_data: {
      wisdom_id: 'W.1001',
      domain: 'USER_WORLD',
    },
    status: 'pending',
    created_at: '2025-11-20T10:00:00Z',
  };

  it('should map a UAA2 message to HoloScript Message schema', () => {
    // Mapping logic
    const mappedPriority: MessagePriority =
      sampleUaa2Message.priority === 'high' ? 'high' : 'normal';

    const mappedMessage: Message = {
      id: generateMessageId(sampleUaa2Message.from_agent),
      channelId: 'ch-uaa2-bridge',
      senderId: sampleUaa2Message.from_agent,
      recipientId: sampleUaa2Message.to_agent,
      type: sampleUaa2Message.action,
      payload: {
        text: sampleUaa2Message.message,
        data: sampleUaa2Message.request_data,
        originalId: sampleUaa2Message.id,
        createdAt: sampleUaa2Message.created_at,
      },
      priority: mappedPriority,
      status: 'pending',
      timestamp: Date.now(),
    };

    expect(mappedMessage.senderId).toBe(sampleUaa2Message.from_agent);
    expect(mappedMessage.recipientId).toBe(sampleUaa2Message.to_agent);
    expect(mappedMessage.priority).toBe('high');
    expect(mappedMessage.type).toBe('submit-wisdom');
  });

  it('should pass HoloScript schema validation after mapping', () => {
    const schema = {
      type: 'object',
      properties: {
        text: { type: 'string' },
        data: { type: 'object' },
        originalId: { type: 'string' },
      },
      required: ['text', 'originalId'],
    };

    const payload = {
      text: sampleUaa2Message.message,
      data: sampleUaa2Message.request_data,
      originalId: sampleUaa2Message.id,
    };

    const result = validateMessageSchema(payload, schema);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
