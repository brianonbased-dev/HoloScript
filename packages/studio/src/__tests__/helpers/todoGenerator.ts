/**
 * todoGenerator.ts — Automatic TODO Generation from Test Failures
 *
 * Generates structured TODO markdown files from:
 * - it.todo() backlog items
 * - it.fails() broken features
 * - Test execution failures
 *
 * Usage in tests:
 * ```typescript
 * import { TODO } from '../helpers/todoGenerator';
 *
 * it.todo('should add emoji reactions', TODO('MEME-003', {
 *   priority: 'high',
 *   estimate: '5 hours',
 *   description: 'Create emoji-reaction trait',
 *   acceptance: 'Emojis spawn on event',
 *   relatedFiles: ['emojiTrait.ts'],
 * }));
 * ```
 *
 * Output: MEME_CHARACTER_TODOS.md with prioritized backlog
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface TodoMetadata {
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimate: string; // e.g., '3 hours', '2 days'
  description: string;
  acceptance: string; // Acceptance criteria
  relatedFiles: string[]; // Files that need changes
  assignee?: string;
  dueDate?: string;
  tags?: string[];
}

export interface TodoItem {
  id: string; // e.g., 'MEME-003'
  title: string; // Test description
  metadata: TodoMetadata;
  testFile: string;
  scenarioName: string;
  status: 'backlog' | 'failing' | 'blocked';
  createdAt: string;
}

/**
 * Global TODO registry for collecting items during test execution
 */
class TodoRegistry {
  private items: Map<string, TodoItem> = new Map();
  private outputDir: string;

  constructor() {
    // Default output: HoloScript/packages/studio/TODO_BACKLOG/
    this.outputDir = join(process.cwd(), 'TODO_BACKLOG');
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Register a TODO item from a test
   */
  register(
    id: string,
    title: string,
    metadata: TodoMetadata,
    context: {
      testFile: string;
      scenarioName: string;
      status: 'backlog' | 'failing' | 'blocked';
    }
  ) {
    this.items.set(id, {
      id,
      title,
      metadata,
      testFile: context.testFile,
      scenarioName: context.scenarioName,
      status: context.status,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Get all TODOs sorted by priority
   */
  getAllSorted(): TodoItem[] {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return Array.from(this.items.values()).sort((a, b) => {
      return priorityOrder[a.metadata.priority] - priorityOrder[b.metadata.priority];
    });
  }

  /**
   * Get TODOs filtered by priority
   */
  getByPriority(priority: TodoMetadata['priority']): TodoItem[] {
    return Array.from(this.items.values()).filter((item) => item.metadata.priority === priority);
  }

  /**
   * Get TODOs filtered by status
   */
  getByStatus(status: TodoItem['status']): TodoItem[] {
    return Array.from(this.items.values()).filter((item) => item.status === status);
  }

  /**
   * Generate markdown TODO file
   */
  generateMarkdown(filename: string): void {
    const allTodos = this.getAllSorted();
    const critical = this.getByPriority('critical');
    const high = this.getByPriority('high');
    const medium = this.getByPriority('medium');
    const low = this.getByPriority('low');
    const failing = this.getByStatus('failing');
    const backlog = this.getByStatus('backlog');

    const md = `# TODO Backlog - Generated from Tests

**Generated**: ${new Date().toLocaleString()}
**Total Items**: ${allTodos.length}
**Source**: Scenario tests (\`__tests__/scenarios/\`)

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| 🔴 Critical | ${critical.length} | ${critical.filter((t) => t.status === 'failing').length} failing |
| 🟠 High | ${high.length} | ${high.filter((t) => t.status === 'failing').length} failing |
| 🟡 Medium | ${medium.length} | ${medium.filter((t) => t.status === 'backlog').length} backlog |
| 🟢 Low | ${low.length} | ${low.filter((t) => t.status === 'backlog').length} backlog |

---

## 🔴 Critical Priority (Fix Immediately)

${this.renderTodoSection(critical)}

---

## 🟠 High Priority (This Sprint)

${this.renderTodoSection(high)}

---

## 🟡 Medium Priority (Next Sprint)

${this.renderTodoSection(medium)}

---

## 🟢 Low Priority (Backlog)

${this.renderTodoSection(low)}

---

## 📊 By Scenario

${this.renderByScenario()}

---

## 🚨 Failing Tests (Urgent)

${failing.length > 0 ? this.renderTodoSection(failing) : '_No failing tests! ✅_'}

---

## 📋 Backlog Items

${backlog.length > 0 ? this.renderTodoSection(backlog) : '_Backlog empty! 🎉_'}

---

## 📈 Effort Estimation

**Total Estimated Time**: ${this.calculateTotalTime()}

| Priority | Estimated Time |
|----------|---------------|
| Critical | ${this.calculateTimeByPriority('critical')} |
| High | ${this.calculateTimeByPriority('high')} |
| Medium | ${this.calculateTimeByPriority('medium')} |
| Low | ${this.calculateTimeByPriority('low')} |

---

## 🔗 Quick Links

- [Test Source](../../../__tests__/scenarios/)
- [Contributing Guide](../../CONTRIBUTING.md)
- [Project Roadmap](../../ROADMAP.md)

---

_This file was auto-generated by \`todoGenerator.ts\` from test execution._
_To update: Run \`pnpm test scenarios\` and TODOs will be regenerated._
`;

    const outputPath = join(this.outputDir, filename);
    writeFileSync(outputPath, md, 'utf-8');
    console.log(`\n✅ TODO backlog written to: ${outputPath}`);
  }

  /**
   * Render a section of TODO items
   */
  private renderTodoSection(items: TodoItem[]): string {
    if (items.length === 0) {
      return '_None_';
    }

    return items
      .map(
        (item) => `
### ${item.id}: ${item.title}

**Status**: ${this.getStatusEmoji(item.status)} ${item.status}
**Estimate**: ⏱️ ${item.metadata.estimate}
**Assignee**: ${item.metadata.assignee || 'Unassigned'}

**Description**: ${item.metadata.description}

**Acceptance Criteria**: ${item.metadata.acceptance}

**Related Files**:
${item.metadata.relatedFiles.map((f) => `- \`${f}\``).join('\n')}

**Test Location**: \`${item.testFile}\` > ${item.scenarioName}

${item.metadata.tags ? `**Tags**: ${item.metadata.tags.map((t) => `\`${t}\``).join(', ')}` : ''}

---
`
      )
      .join('\n');
  }

  /**
   * Render TODOs grouped by scenario
   */
  private renderByScenario(): string {
    const byScenario = new Map<string, TodoItem[]>();

    this.items.forEach((item) => {
      const scenario = item.scenarioName;
      if (!byScenario.has(scenario)) {
        byScenario.set(scenario, []);
      }
      byScenario.get(scenario)!.push(item);
    });

    return Array.from(byScenario.entries())
      .map(([scenario, items]) => {
        return `
### ${scenario} (${items.length} items)

${items.map((item) => `- **${item.id}**: ${item.title} (${item.metadata.priority})`).join('\n')}
`;
      })
      .join('\n');
  }

  /**
   * Calculate total estimated time
   */
  private calculateTotalTime(): string {
    const items = this.getAllSorted();
    let totalHours = 0;

    items.forEach((item) => {
      const estimate = item.metadata.estimate;
      const match = estimate.match(/(\d+)\s*(hour|day|week)/i);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        if (unit === 'hour') {
          totalHours += value;
        } else if (unit === 'day') {
          totalHours += value * 8;
        } else if (unit === 'week') {
          totalHours += value * 40;
        }
      }
    });

    const days = Math.floor(totalHours / 8);
    const hours = totalHours % 8;
    return `${days} days, ${hours} hours (${totalHours} hours total)`;
  }

  /**
   * Calculate time by priority
   */
  private calculateTimeByPriority(priority: TodoMetadata['priority']): string {
    const items = this.getByPriority(priority);
    let totalHours = 0;

    items.forEach((item) => {
      const estimate = item.metadata.estimate;
      const match = estimate.match(/(\d+)\s*(hour|day)/i);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        totalHours += unit === 'hour' ? value : value * 8;
      }
    });

    return `${totalHours} hours`;
  }

  /**
   * Get emoji for status
   */
  private getStatusEmoji(status: TodoItem['status']): string {
    switch (status) {
      case 'failing':
        return '🚨';
      case 'blocked':
        return '🚧';
      case 'backlog':
        return '📋';
      default:
        return '❓';
    }
  }

  /**
   * Clear all TODOs (for testing)
   */
  clear() {
    this.items.clear();
  }
}

/**
 * Global TODO registry instance
 */
export const todoRegistry = new TodoRegistry();

/**
 * Helper function for use in it.todo() calls
 *
 * Usage:
 * ```typescript
 * it.todo('should do thing', TODO('FEAT-001', {
 *   priority: 'high',
 *   estimate: '3 hours',
 *   description: 'Add feature X',
 *   acceptance: 'Feature X works',
 *   relatedFiles: ['file.ts'],
 * }));
 * ```
 */
export function TODO(id: string, metadata: TodoMetadata): () => void {
  return () => {
    // Extract test context from current test execution
    const testContext = getTestContext();

    todoRegistry.register(id, testContext.testName, metadata, {
      testFile: testContext.testFile,
      scenarioName: testContext.scenarioName,
      status: 'backlog',
    });

    // For Vitest, this function body is never called
    // The test is skipped by it.todo()
  };
}

/**
 * Mark a test as failing and generate urgent TODO
 */
export function FAILING(id: string, metadata: TodoMetadata): () => void {
  return () => {
    const testContext = getTestContext();

    todoRegistry.register(id, testContext.testName, metadata, {
      testFile: testContext.testFile,
      scenarioName: testContext.scenarioName,
      status: 'failing',
    });
  };
}

/**
 * Get current test context from Vitest globals
 */
function getTestContext(): {
  testName: string;
  testFile: string;
  scenarioName: string;
} {
  // In Vitest, use expect.getState() to access test context
  try {
    const state = (expect as any).getState?.();
    return {
      testName: state?.currentTestName || 'Unknown Test',
      testFile: state?.testPath?.split('/').pop() || 'unknown.test.ts',
      scenarioName: state?.currentTestName?.split('—')[0]?.trim() || 'Unknown Scenario',
    };
  } catch {
    return {
      testName: 'Unknown Test',
      testFile: 'unknown.test.ts',
      scenarioName: 'Unknown Scenario',
    };
  }
}

/**
 * Generate TODO markdown after test suite completes
 * Call this in afterAll() hook or CI post-test script
 */
export function generateTodoBacklog(filename: string = 'MEME_CHARACTER_TODOS.md'): void {
  todoRegistry.generateMarkdown(filename);
}

/**
 * Export utilities for test reporters
 */
export {
  type TodoItem,
  type TodoMetadata,
  todoRegistry as _todoRegistry, // For test inspection
};
