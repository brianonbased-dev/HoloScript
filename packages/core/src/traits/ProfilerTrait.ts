/**
 * ProfilerTrait — v5.1
 *
 * CPU / memory / timing profiler with named measurement spans.
 *
 * Events:
 *  profiler:start   { spanName }
 *  profiler:end     { spanName }
 *  profiler:result  { spanName, durationMs }
 *  profiler:report  { spans[], totalSpans }
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface ProfilerConfig {
  max_spans: number;
  auto_report_interval_ms: number;
}

interface ProfilerSpan {
  name: string;
  startedAt: number;
  durationMs: number | null;
}

export const profilerHandler: TraitHandler<ProfilerConfig> = {
  name: 'profiler',
  defaultConfig: { max_spans: 500, auto_report_interval_ms: 0 },

  onAttach(node: HSPlusNode): void {
    node.__profilerState = {
      activeSpans: new Map<string, number>(),
      completedSpans: [] as ProfilerSpan[],
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__profilerState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: ProfilerConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__profilerState as
      | {
          activeSpans: Map<string, number>;
          completedSpans: ProfilerSpan[];
        }
      | undefined;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'profiler:start': {
        const name = event.spanName as string;
        if (!name) break;
        state.activeSpans.set(name, Date.now());
        break;
      }
      case 'profiler:end': {
        const name = event.spanName as string;
        const start = state.activeSpans.get(name);
        if (start === undefined) break;
        const duration = Date.now() - start;
        state.activeSpans.delete(name);
        state.completedSpans.push({ name, startedAt: start, durationMs: duration });
        if (state.completedSpans.length > config.max_spans) {
          state.completedSpans = state.completedSpans.slice(-config.max_spans);
        }
        context.emit?.('profiler:result', { spanName: name, durationMs: duration });
        break;
      }
      case 'profiler:report': {
        context.emit?.('profiler:report', {
          spans: state.completedSpans.map((s) => ({ name: s.name, durationMs: s.durationMs })),
          totalSpans: state.completedSpans.length,
          activeCount: state.activeSpans.size,
        });
        break;
      }
    }
  },
};

export default profilerHandler;
