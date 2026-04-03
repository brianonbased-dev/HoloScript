/**
 * StructuredLoggerTrait — v5.1
 *
 * Structured logging sink for HoloScript compositions. Captures log
 * events with levels, timestamps, metadata, and structured fields.
 * Supports log rotation by count, optional console output, and
 * event-driven log retrieval.
 *
 * Events:
 *  logger:entry           { level, message, fields, timestamp }
 *  logger:rotated         { discarded, remaining, maxEntries }
 *  logger:log             (command) Add a log entry
 *  logger:debug           (command) Add debug-level entry
 *  logger:info            (command) Add info-level entry
 *  logger:warn            (command) Add warn-level entry
 *  logger:error           (command) Add error-level entry
 *  logger:get_logs        (command) Retrieve log entries
 *  logger:clear           (command) Clear all log entries
 *  logger:get_status      (command) Get logger status
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface StructuredLoggerConfig {
  /** Minimum log level to capture */
  min_level: LogLevel;
  /** Maximum log entries before rotation */
  max_entries: number;
  /** Number of entries to discard on rotation (oldest first) */
  rotation_count: number;
  /** Whether to emit logger:entry events for each log */
  emit_events: boolean;
  /** Whether to also write to console */
  console_output: boolean;
  /** Default metadata fields added to every entry */
  default_fields: Record<string, unknown>;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  fields: Record<string, unknown>;
  timestamp: number;
  iso: string;
}

export interface StructuredLoggerState {
  entries: LogEntry[];
  counts: Record<LogLevel, number>;
  totalLogged: number;
  totalRotated: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const structuredLoggerHandler: TraitHandler<StructuredLoggerConfig> = {
  name: 'structured_logger',

  defaultConfig: {
    min_level: 'info',
    max_entries: 1000,
    rotation_count: 200,
    emit_events: true,
    console_output: false,
    default_fields: {},
  },

  onAttach(node: HSPlusNode, _config: StructuredLoggerConfig, _context: TraitContext): void {
    const state: StructuredLoggerState = {
      entries: [],
      counts: { debug: 0, info: 0, warn: 0, error: 0 },
      totalLogged: 0,
      totalRotated: 0,
    };
    node.__structuredLoggerState = state;
  },

  onDetach(node: HSPlusNode, _config: StructuredLoggerConfig, _context: TraitContext): void {
    delete node.__structuredLoggerState;
  },

  onUpdate(_node: HSPlusNode, _config: StructuredLoggerConfig, _context: TraitContext, _delta: number): void {
    // Event-driven
  },

  onEvent(node: HSPlusNode, config: StructuredLoggerConfig, context: TraitContext, event: TraitEvent): void {
    const state: StructuredLoggerState | undefined = node.__structuredLoggerState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      case 'logger:debug':
        addEntry(state, config, context, 'debug', payload);
        break;

      case 'logger:info':
        addEntry(state, config, context, 'info', payload);
        break;

      case 'logger:warn':
        addEntry(state, config, context, 'warn', payload);
        break;

      case 'logger:error':
        addEntry(state, config, context, 'error', payload);
        break;

      case 'logger:log': {
        const level = (payload.level as LogLevel) ?? 'info';
        addEntry(state, config, context, level, payload);
        break;
      }

      case 'logger:get_logs': {
        const level = payload.level as LogLevel | undefined;
        const limit = (payload.limit as number) ?? 50;
        const offset = (payload.offset as number) ?? 0;

        let filtered = state.entries;
        if (level) {
          filtered = filtered.filter((e) => e.level === level);
        }

        const page = filtered.slice(offset, offset + limit);
        context.emit?.('logger:logs', {
          entries: page,
          total: filtered.length,
          offset,
          limit,
        });
        break;
      }

      case 'logger:clear': {
        state.entries = [];
        state.counts = { debug: 0, info: 0, warn: 0, error: 0 };
        break;
      }

      case 'logger:get_status': {
        context.emit?.('logger:status', {
          entryCount: state.entries.length,
          maxEntries: config.max_entries,
          counts: { ...state.counts },
          totalLogged: state.totalLogged,
          totalRotated: state.totalRotated,
          minLevel: config.min_level,
        });
        break;
      }
    }
  },
};

function addEntry(
  state: StructuredLoggerState,
  config: StructuredLoggerConfig,
  context: TraitContext,
  level: LogLevel,
  payload: Record<string, unknown>
): void {
  // Check minimum level
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.min_level]) return;

  const message =
    typeof payload === 'string' ? payload : ((payload.message as string) ?? String(payload));

  const fields = {
    ...config.default_fields,
    ...(typeof payload === 'object' && payload !== null ? (payload.fields ?? {}) : {}),
  };

  // Remove internal tracking fields
  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  delete fields.message;
  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  delete fields.level;

  const now = Date.now();
  const entry: LogEntry = {
    level,
    message,
    fields,
    timestamp: now,
    iso: new Date(now).toISOString(),
  };

  state.entries.push(entry);
  state.counts[level]++;
  state.totalLogged++;

  // Rotation
  if (state.entries.length > config.max_entries) {
    const discarded = state.entries.splice(0, config.rotation_count);
    state.totalRotated += discarded.length;
    context.emit?.('logger:rotated', {
      discarded: discarded.length,
      remaining: state.entries.length,
      maxEntries: config.max_entries,
    });
  }

  // Console output
  if (config.console_output) {
    const prefix = `[${entry.iso}] [${level.toUpperCase()}]`;
    const fieldsStr = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
    switch (level) {
      case 'debug':
        console.debug(`${prefix} ${message}${fieldsStr}`);
        break;
      case 'info':
        console.info(`${prefix} ${message}${fieldsStr}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}${fieldsStr}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}${fieldsStr}`);
        break;
    }
  }

  // Emit event
  if (config.emit_events) {
    context.emit?.('logger:entry', entry);
  }
}

export default structuredLoggerHandler;
