/**
 * StreamTrait — v5.1
 *
 * Event stream pub/sub with backpressure and replay buffer.
 *
 * Events:
 *  stream:publish     { topic, data }
 *  stream:subscribe   { topic, subscriberId }
 *  stream:unsubscribe { topic, subscriberId }
 *  stream:message     { topic, data, sequence }
 *  stream:replay      { topic, fromSequence }
 *  stream:backpressure { topic, pending, maxBuffer }
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

export interface StreamConfig {
  max_buffer: number;
  replay_size: number;
  enable_backpressure: boolean;
}

export interface StreamState {
  topics: Map<
    string,
    {
      subscribers: Set<string>;
      buffer: Array<{ data: unknown; sequence: number }>;
      sequence: number;
    }
  >;
}

export const streamHandler: TraitHandler<StreamConfig> = {
  name: 'stream',

  defaultConfig: {
    max_buffer: 1000,
    replay_size: 100,
    enable_backpressure: true,
  },

  onAttach(node: any): void {
    node.__streamState = { topics: new Map() } as StreamState;
  },

  onDetach(node: any): void {
    delete node.__streamState;
  },

  onUpdate(): void {},

  onEvent(node: any, config: StreamConfig, context: any, event: any): void {
    const state: StreamState | undefined = node.__streamState;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'stream:publish': {
        const topic = event.topic as string;
        if (!topic) break;
        if (!state.topics.has(topic)) {
          state.topics.set(topic, { subscribers: new Set(), buffer: [], sequence: 0 });
        }
        const t = state.topics.get(topic)!;
        if (config.enable_backpressure && t.buffer.length >= config.max_buffer) {
          context.emit?.('stream:backpressure', {
            topic,
            pending: t.buffer.length,
            maxBuffer: config.max_buffer,
          });
          break;
        }
        t.sequence++;
        const msg = { data: event.data, sequence: t.sequence };
        t.buffer.push(msg);
        if (t.buffer.length > config.replay_size) {
          t.buffer = t.buffer.slice(-config.replay_size);
        }
        for (const sub of t.subscribers) {
          context.emit?.('stream:message', { topic, ...msg, subscriberId: sub });
        }
        break;
      }
      case 'stream:subscribe': {
        const topic = event.topic as string;
        if (!topic) break;
        if (!state.topics.has(topic)) {
          state.topics.set(topic, { subscribers: new Set(), buffer: [], sequence: 0 });
        }
        state.topics.get(topic)!.subscribers.add((event.subscriberId as string) ?? 'default');
        break;
      }
      case 'stream:unsubscribe': {
        const t = state.topics.get(event.topic as string);
        t?.subscribers.delete((event.subscriberId as string) ?? 'default');
        break;
      }
      case 'stream:replay': {
        const t = state.topics.get(event.topic as string);
        if (!t) break;
        const from = (event.fromSequence as number) ?? 0;
        for (const msg of t.buffer) {
          if (msg.sequence > from) {
            context.emit?.('stream:message', { topic: event.topic, ...msg });
          }
        }
        break;
      }
    }
  },
};

export default streamHandler;
