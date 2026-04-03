/**
 * BufferTrait — v5.1
 *
 * Batch events by count or time window for HoloScript compositions.
 * Collects incoming events and flushes them as a single batch event
 * when a count threshold or time window is reached.
 *
 * Events:
 *  buffer:flush          { bufferId, items, count, elapsed }
 *  buffer:overflow       { bufferId, dropped, maxSize }
 *  buffer:add_channel    (command) Add a buffer channel
 *  buffer:remove_channel (command) Remove a buffer channel
 *  buffer:force_flush    (command) Force flush a specific channel
 *  buffer:get_status     (command) Get buffer status
 *  [source events]       (inbound) Events matching channel sources are buffered
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface BufferChannel {
  /** Unique channel identifier */
  id: string;
  /** Source event to buffer */
  source_event: string;
  /** Output event to emit on flush */
  output_event: string;
  /** Flush when this many items are buffered */
  max_count: number;
  /** Flush after this many ms (0 = count-only) */
  max_wait_ms: number;
  /** Maximum buffer size before dropping oldest */
  max_size: number;
  /** Whether this channel is active */
  enabled: boolean;
}

export interface BufferConfig {
  /** Pre-configured buffer channels */
  channels: BufferChannel[];
}

interface ChannelState {
  channel: BufferChannel;
  items: unknown[];
  firstItemAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  totalFlushed: number;
  totalDropped: number;
}

export interface BufferState {
  channels: Map<string, ChannelState>;
  totalFlushed: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const bufferHandler: TraitHandler<BufferConfig> = {
  name: 'buffer',

  defaultConfig: {
    channels: [],
  },

  onAttach(node: HSPlusNode, config: BufferConfig, _context: TraitContext): void {
    const state: BufferState = {
      channels: new Map(),
      totalFlushed: 0,
    };

    for (const channel of config.channels) {
      state.channels.set(channel.id, {
        channel,
        items: [],
        firstItemAt: 0,
        timer: null,
        totalFlushed: 0,
        totalDropped: 0,
      });
    }

    node.__bufferState = state;
  },

  onDetach(node: HSPlusNode, _config: BufferConfig, _context: TraitContext): void {
    const state: BufferState | undefined = node.__bufferState;
    if (state) {
      for (const [, cs] of state.channels) {
        if (cs.timer) clearTimeout(cs.timer);
      }
      state.channels.clear();
    }
    delete node.__bufferState;
  },

  onUpdate(_node: HSPlusNode, _config: BufferConfig, _context: TraitContext, _delta: number): void {
    // Timer-driven, no per-frame work
  },

  onEvent(node: HSPlusNode, _config: BufferConfig, context: TraitContext, event: TraitEvent): void {
    const state: BufferState | undefined = node.__bufferState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = extractPayload(event);

    // Management commands
    switch (eventType) {
      case 'buffer:add_channel': {
        const channel = payload as BufferChannel;
        if (channel.id && channel.source_event && channel.output_event) {
          state.channels.set(channel.id, {
            channel,
            items: [],
            firstItemAt: 0,
            timer: null,
            totalFlushed: 0,
            totalDropped: 0,
          });
        }
        return;
      }

      case 'buffer:remove_channel': {
        const cs = state.channels.get(payload.id as string);
        if (cs) {
          if (cs.timer) clearTimeout(cs.timer);
          state.channels.delete(payload.id as string);
        }
        return;
      }

      case 'buffer:force_flush': {
        const channelId = (payload.id as string) ?? (payload.channelId as string);
        if (channelId) {
          const cs = state.channels.get(channelId);
          if (cs && cs.items.length > 0) {
            flushChannel(cs, state, context);
          }
        } else {
          // Flush all channels
          for (const [, cs] of state.channels) {
            if (cs.items.length > 0) {
              flushChannel(cs, state, context);
            }
          }
        }
        return;
      }

      case 'buffer:get_status': {
        context.emit?.('buffer:status', {
          channelCount: state.channels.size,
          totalFlushed: state.totalFlushed,
          channels: Array.from(state.channels.values()).map((cs) => ({
            id: cs.channel.id,
            source: cs.channel.source_event,
            buffered: cs.items.length,
            totalFlushed: cs.totalFlushed,
            totalDropped: cs.totalDropped,
            enabled: cs.channel.enabled,
          })),
        });
        return;
      }
    }

    // Check if this event matches any buffer channel
    for (const [, cs] of state.channels) {
      if (!cs.channel.enabled || cs.channel.source_event !== eventType) continue;

      // Add item to buffer
      if (cs.items.length >= cs.channel.max_size) {
        // Drop oldest
        cs.items.shift();
        cs.totalDropped++;
        context.emit?.('buffer:overflow', {
          bufferId: cs.channel.id,
          dropped: 1,
          maxSize: cs.channel.max_size,
        });
      }

      cs.items.push(payload);

      // Record first item time
      if (cs.items.length === 1) {
        cs.firstItemAt = Date.now();

        // Start time-based flush timer
        if (cs.channel.max_wait_ms > 0 && !cs.timer) {
          cs.timer = setTimeout(() => {
            cs.timer = null;
            if (cs.items.length > 0) {
              flushChannel(cs, state, context);
            }
          }, cs.channel.max_wait_ms);
        }
      }

      // Check count-based flush
      if (cs.items.length >= cs.channel.max_count) {
        flushChannel(cs, state, context);
      }
    }
  },
};

function flushChannel(cs: ChannelState, state: BufferState, context: TraitContext): void {
  const items = cs.items.splice(0);
  const elapsed = cs.firstItemAt > 0 ? Date.now() - cs.firstItemAt : 0;

  if (cs.timer) {
    clearTimeout(cs.timer);
    cs.timer = null;
  }

  cs.totalFlushed++;
  state.totalFlushed++;
  cs.firstItemAt = 0;

  context.emit?.(cs.channel.output_event, {
    items,
    count: items.length,
  });

  context.emit?.('buffer:flush', {
    bufferId: cs.channel.id,
    items,
    count: items.length,
    elapsed,
  });
}

export default bufferHandler;
