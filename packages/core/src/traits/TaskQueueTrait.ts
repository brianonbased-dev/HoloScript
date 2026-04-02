/**
 * TaskQueueTrait — v5.1
 *
 * Work queue with priority, retries, and dead-letter support for
 * HoloScript compositions. Processes tasks concurrently up to a
 * configurable limit.
 *
 * Events:
 *  queue:enqueue      { taskId, priority, data }
 *  queue:dequeue      { taskId }
 *  queue:complete     { taskId, result }
 *  queue:failed       { taskId, error, retryCount }
 *  queue:retry        { taskId, retryCount, nextRetryMs }
 *  queue:dead_letter  { taskId, error, totalRetries }
 *  queue:drain        { processed }
 *  queue:add          (command) Add a task
 *  queue:task_done    (inbound) Report task completion
 *  queue:task_failed  (inbound) Report task failure
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface QueueTask {
  id: string;
  priority: number;
  data: unknown;
  retryCount: number;
  enqueuedAt: number;
  startedAt: number;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'dead';
}

export interface TaskQueueConfig {
  /** Max concurrent tasks being processed */
  max_concurrent: number;
  /** Max retries before sending to dead-letter */
  max_retries: number;
  /** Base delay between retries in ms */
  retry_delay_ms: number;
  /** Number of priority levels (1 = FIFO, higher = priority queue) */
  priority_levels: number;
  /** Max dead-letter queue size */
  dead_letter_max: number;
  /** Action event to emit when processing a task */
  process_action: string;
}

export interface TaskQueueState {
  queue: QueueTask[];
  active: QueueTask[];
  completed: QueueTask[];
  deadLetter: QueueTask[];
  taskCounter: number;
  totalProcessed: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateTaskId(state: TaskQueueState): string {
  return `task_${Date.now()}_${state.taskCounter++}`;
}

function sortByPriority(queue: QueueTask[]): void {
  queue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt);
}

// =============================================================================
// HANDLER
// =============================================================================

export const taskQueueHandler: TraitHandler<TaskQueueConfig> = {
  name: 'task_queue',

  defaultConfig: {
    max_concurrent: 1,
    max_retries: 3,
    retry_delay_ms: 1000,
    priority_levels: 1,
    dead_letter_max: 50,
    process_action: 'queue:process',
  },

  onAttach(node: HSPlusNode, _config: TaskQueueConfig, _context: TraitContext): void {
    const state: TaskQueueState = {
      queue: [],
      active: [],
      completed: [],
      deadLetter: [],
      taskCounter: 0,
      totalProcessed: 0,
    };
    node.__taskQueueState = state;
  },

  onDetach(node: HSPlusNode, _config: TaskQueueConfig, _context: TraitContext): void {
    delete node.__taskQueueState;
  },

  onUpdate(_node: HSPlusNode, _config: TaskQueueConfig, _context: TraitContext, _delta: number): void {
    // Queue is event-driven
  },

  onEvent(node: HSPlusNode, config: TaskQueueConfig, context: TraitContext, event: TraitEvent): void {
    const state: TaskQueueState | undefined = node.__taskQueueState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      case 'queue:add': {
        const task: QueueTask = {
          id: payload.taskId ?? generateTaskId(state),
          priority: Math.max(
            0,
            Math.min(config.priority_levels - 1, Number(payload.priority) || 0)
          ),
          data: payload.data ?? {},
          retryCount: 0,
          enqueuedAt: Date.now(),
          startedAt: 0,
          status: 'pending',
        };

        state.queue.push(task);
        sortByPriority(state.queue);

        context.emit?.('queue:enqueue', {
          taskId: task.id,
          priority: task.priority,
          data: task.data,
        });

        // Try to process immediately
        processNext(state, config, context);
        break;
      }

      case 'queue:task_done': {
        const taskId = payload.taskId as string;
        const idx = state.active.findIndex((t) => t.id === taskId);
        if (idx === -1) break;

        const task = state.active.splice(idx, 1)[0];
        task.status = 'completed';
        state.completed.push(task);
        state.totalProcessed++;

        // Cap completed history
        if (state.completed.length > 100) {
          state.completed = state.completed.slice(-100);
        }

        context.emit?.('queue:complete', {
          taskId: task.id,
          result: payload.result,
        });

        processNext(state, config, context);
        break;
      }

      case 'queue:task_failed': {
        const taskId = payload.taskId as string;
        const error = (payload.error as string) ?? 'unknown error';
        const idx = state.active.findIndex((t) => t.id === taskId);
        if (idx === -1) break;

        const task = state.active.splice(idx, 1)[0];
        task.retryCount++;

        if (task.retryCount > config.max_retries) {
          // Send to dead-letter
          task.status = 'dead';
          state.deadLetter.push(task);
          if (state.deadLetter.length > config.dead_letter_max) {
            state.deadLetter.shift();
          }
          context.emit?.('queue:dead_letter', {
            taskId: task.id,
            error,
            totalRetries: task.retryCount,
          });
        } else {
          // Re-enqueue with delay
          task.status = 'pending';
          const delay = config.retry_delay_ms * Math.pow(2, task.retryCount - 1);

          context.emit?.('queue:retry', {
            taskId: task.id,
            retryCount: task.retryCount,
            nextRetryMs: delay,
          });

          context.emit?.('queue:failed', {
            taskId: task.id,
            error,
            retryCount: task.retryCount,
          });

          // Re-add after delay (using setTimeout for headless compat)
          setTimeout(() => {
            if (node.__taskQueueState) {
              state.queue.push(task);
              sortByPriority(state.queue);
              processNext(state, config, context);
            }
          }, delay);
        }

        processNext(state, config, context);
        break;
      }

      case 'queue:get_status': {
        context.emit?.('queue:status', {
          pending: state.queue.length,
          active: state.active.length,
          completed: state.totalProcessed,
          deadLetter: state.deadLetter.length,
        });
        break;
      }

      case 'queue:clear_dead_letter': {
        state.deadLetter = [];
        break;
      }
    }
  },
};

function processNext(state: TaskQueueState, config: TaskQueueConfig, context: TraitContext): void {
  while (state.active.length < config.max_concurrent && state.queue.length > 0) {
    const task = state.queue.shift()!;
    task.status = 'active';
    task.startedAt = Date.now();
    state.active.push(task);

    context.emit?.('queue:dequeue', { taskId: task.id });
    context.emit?.(config.process_action, {
      taskId: task.id,
      data: task.data,
      retryCount: task.retryCount,
    });
  }

  if (state.queue.length === 0 && state.active.length === 0) {
    context.emit?.('queue:drain', { processed: state.totalProcessed });
  }
}

export default taskQueueHandler;
