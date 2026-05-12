import { describe, it, expect, beforeEach } from 'vitest';
import { speechAwareEncounterHandler } from '../SpeechAwareEncounterTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

describe('SpeechAwareEncounterTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('sae-1');
    ctx = createMockContext();
  });

  it('initializes in voice mode when voice_enabled=true', () => {
    attachTrait(speechAwareEncounterHandler, node, { voice_enabled: true }, ctx);
    const ev = getLastEvent(ctx, 'speech_aware_encounter_ready');
    expect(ev.channel).toBe('voice');
    expect(ev.voiceEnabled).toBe(true);
  });

  it('falls back to text on low-confidence ReID', () => {
    attachTrait(speechAwareEncounterHandler, node, {
      voice_enabled: true,
      reid_confidence_threshold: 0.8,
      fallback_to_text: true,
    }, ctx);
    sendEvent(speechAwareEncounterHandler, node, {
      voice_enabled: true,
      reid_confidence_threshold: 0.8,
      fallback_to_text: true,
    }, ctx, {
      type: 'speech_detected',
      text: 'Hello there',
      speakerId: 'player_1',
      reidEmbeddingId: 'emb_1',
      confidence: 0.5,
    });
    expect(getEventCount(ctx, 'speech_channel_switched')).toBe(1);
    const turn = getLastEvent(ctx, 'encounter_turn_recorded');
    expect(turn.channel).toBe('text');
  });

  it('retains high-confidence voice attribution', () => {
    attachTrait(speechAwareEncounterHandler, node, {
      voice_enabled: true,
      reid_confidence_threshold: 0.75,
    }, ctx);
    sendEvent(speechAwareEncounterHandler, node, {
      voice_enabled: true,
      reid_confidence_threshold: 0.75,
    }, ctx, {
      type: 'speech_detected',
      text: 'Greetings',
      speakerId: 'npc_alpha',
      reidEmbeddingId: 'emb_alpha',
      confidence: 0.92,
    });
    expect(getEventCount(ctx, 'encounter_turn_recorded')).toBe(1);
    const turn = getLastEvent(ctx, 'encounter_turn_recorded');
    expect(turn.channel).toBe('voice');
    expect(turn.confidence).toBe(0.92);
  });

  it('obeys explicit channel request', () => {
    attachTrait(speechAwareEncounterHandler, node, { voice_enabled: true }, ctx);
    sendEvent(speechAwareEncounterHandler, node, { voice_enabled: true }, ctx, {
      type: 'speech_channel_request',
      channel: 'text',
    });
    expect(getEventCount(ctx, 'speech_channel_switched')).toBe(1);
    const ev = getLastEvent(ctx, 'speech_channel_switched');
    expect(ev.to).toBe('text');
    expect(ev.reason).toBe('explicit_request');
  });

  it('denies voice request when voice_disabled', () => {
    attachTrait(speechAwareEncounterHandler, node, { voice_enabled: false }, ctx);
    sendEvent(speechAwareEncounterHandler, node, { voice_enabled: false }, ctx, {
      type: 'speech_channel_request',
      channel: 'voice',
    });
    expect(getEventCount(ctx, 'speech_channel_request_denied')).toBe(1);
  });

  it('sliding window caps turn count', () => {
    attachTrait(speechAwareEncounterHandler, node, { max_turns: 3 }, ctx);
    for (let i = 0; i < 5; i++) {
      sendEvent(speechAwareEncounterHandler, node, { max_turns: 3 }, ctx, {
        type: 'speech_detected',
        text: `turn ${i}`,
        speakerId: `spk_${i}`,
      });
    }
    sendEvent(speechAwareEncounterHandler, node, { max_turns: 3 }, ctx, {
      type: 'speech_aware_query',
      queryId: 'q1',
    });
    const state = getLastEvent(ctx, 'speech_aware_encounter_state');
    expect(state.turns).toHaveLength(3);
  });
});
