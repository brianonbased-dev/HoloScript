/**
 * todoReporter.ts — Vitest Custom Reporter for TODO Generation
 *
 * Automatically generates TODO markdown files after test execution
 * Collects all it.todo() items and test failures
 *
 * Setup in vitest.config.ts:
 * ```typescript
 * export default defineConfig({
 *   test: {
 *     reporters: ['default', './src/__tests__/helpers/todoReporter.ts'],
 *   },
 * });
 * ```
 */

import type { Reporter, Task } from 'vitest';
import { todoRegistry, generateTodoBacklog } from './todoGenerator';
import { logger } from '@/lib/logger';

export class TodoReporter implements Reporter {
  private todoItems: Array<{
    id: string;
    title: string;
    file: string;
    status: 'todo' | 'failed' | 'skipped';
  }> = [];

  /**
   * Called when all tests complete
   */
  onFinished(files?: any[], errors?: any[]): void {
    logger.debug('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.debug('📝 TODO Backlog Generator');
    logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Count todo items
    const todoCount = this.todoItems.filter((t) => t.status === 'todo').length;
    const failedCount = this.todoItems.filter((t) => t.status === 'failed').length;
    const skippedCount = this.todoItems.filter((t) => t.status === 'skipped').length;

    logger.debug(`\n📊 Test Summary:`);
    logger.debug(`   ⊡ TODO items: ${todoCount}`);
    logger.debug(`   ✗ Failed tests: ${failedCount}`);
    logger.debug(`   ⊙ Skipped tests: ${skippedCount}`);

    // Generate TODO markdown
    if (this.todoItems.length > 0) {
      logger.debug(`\n✅ Generating TODO backlog...`);
      generateTodoBacklog('MEME_CHARACTER_TODOS.md');
      logger.debug(`\n✨ TODO backlog generated successfully!`);
      logger.debug(`   📄 Location: TODO_BACKLOG/MEME_CHARACTER_TODOS.md`);
    } else {
      logger.debug(`\n🎉 No TODOs found! All features implemented.`);
    }

    logger.debug('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  /**
   * Called for each test task
   */
  onTaskUpdate(tasks: Task[]): void {
    tasks.forEach((task) => {
      // Collect todo items
      if (task.mode === 'todo' && task.name.includes('TODO(')) {
        const todoMatch = task.name.match(/TODO\(['"](.+?)['"]/);
        if (todoMatch) {
          this.todoItems.push({
            id: todoMatch[1],
            title: task.name
              .split(',')[0]
              .replace(/TODO\(.+?\)/, '')
              .trim(),
            file: task.file?.name || 'unknown',
            status: 'todo',
          });
        }
      }

      // Collect failed tests
      if (task.result?.state === 'fail') {
        this.todoItems.push({
          id: `FAIL-${Date.now()}`,
          title: task.name,
          file: task.file?.name || 'unknown',
          status: 'failed',
        });
      }

      // Collect skipped tests
      if (task.mode === 'skip') {
        this.todoItems.push({
          id: `SKIP-${Date.now()}`,
          title: task.name,
          file: task.file?.name || 'unknown',
          status: 'skipped',
        });
      }
    });
  }
}

export default TodoReporter;
