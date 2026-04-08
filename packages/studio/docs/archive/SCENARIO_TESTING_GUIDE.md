### # Scenario Testing Guide - HoloScript Studio

**Version**: 1.0.0
**Last Updated**: 2026-02-26

## Overview

Scenario tests in HoloScript Studio follow the **"Living Specification"** pattern - tests that serve as both validation and documentation. Each scenario represents a real user persona accomplishing a specific workflow.

## Why Scenario Tests?

- **User-Centric**: Tests written from user perspective, not implementation details
- **Documentation**: Tests double as feature documentation
- **Backlog Management**: `it.todo()` items auto-generate prioritized TODO lists
- **Failure Tracking**: Test failures automatically create actionable TODO items
- **Persona-Driven**: Each scenario has a persona (Alex the world builder, Marco the animator, etc.)

## Quick Start

### 1. Run Scenario Tests

```bash
# Run all scenario tests
pnpm test scenarios

# Run specific scenario
pnpm test degen-meme-creator.scenario

# Watch mode
pnpm test scenarios --watch

# Generate TODO backlog
pnpm test scenarios && cat TODO_BACKLOG/MEME_CHARACTER_TODOS.md
```

### 2. Create a New Scenario

```typescript
/**
 * my-scenario.scenario.ts — LIVING-SPEC: Feature Name
 *
 * Persona: Alice — UX designer creating accessible VR experiences
 *
 * ✓ it(...)      = PASSING — feature works
 * ⊡ it.todo(...) = BACKLOG — missing feature
 * ✗ it.fails(...) = FAILING — broken feature
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TODO } from '../helpers/todoGenerator';

describe('Scenario: My Feature — Core Functionality', () => {
  beforeEach(() => {
    // Reset to known state
  });

  it('should perform basic action', () => {
    // Act
    const result = performAction();

    // Assert
    expect(result).toBe(expected);
  });

  it.todo(
    'should add advanced feature',
    TODO('FEAT-001', {
      priority: 'high',
      estimate: '3 hours',
      description: 'Add advanced feature X',
      acceptance: 'Users can do Y with feature X',
      relatedFiles: ['feature.ts', 'FeatureComponent.tsx'],
      tags: ['enhancement', 'ux'],
    })
  );
});
```

### 3. Automatic TODO Generation

When tests complete, a markdown file is auto-generated:

**Output**: `TODO_BACKLOG/MEME_CHARACTER_TODOS.md`

```markdown
# TODO Backlog - Generated from Tests

**Total Items**: 17
**Critical**: 2 | **High**: 5 | **Medium**: 7 | **Low**: 3

## 🔴 Critical Priority (Fix Immediately)

### MEME-012: Load character in <500ms

**Estimate**: ⏱️ 4 hours
**Description**: Optimize GLB loading with compression

### MEME-008: Export clip as MP4

**Estimate**: ⏱️ 6 hours
**Description**: Render animation to MP4 format
```

## Scenario Structure

### File Naming

```
packages/studio/src/__tests__/scenarios/
├── animator.scenario.ts          # Character animation
├── degen-meme-creator.scenario.ts # Meme character creation
├── scene-composer.scenario.ts     # World building
└── project-manager.scenario.ts    # Project management
```

### Test Organization

```typescript
describe('Scenario: [Feature] — [Aspect]', () => {
  beforeEach(() => {
    // Reset stores to known state
    useCharacterStore.getState().reset();
  });

  describe('Sub-feature A', () => {
    it('should handle case 1', () => { /* ... */ });
    it('should handle case 2', () => { /* ... */ });
  });

  describe('Sub-feature B', () => {
    it.todo('should add missing feature', TODO(...));
  });
});
```

## TODO Metadata

### Priority Levels

| Priority     | When to Use                          | Response Time    |
| ------------ | ------------------------------------ | ---------------- |
| **Critical** | Broken core features, blocking users | Fix immediately  |
| **High**     | Missing key features, current Sprint | Within 1 week    |
| **Medium**   | Enhancement requests, next Sprint    | Within 2-4 weeks |
| **Low**      | Nice-to-haves, backlog               | Future sprints   |

### Metadata Fields

```typescript
interface TodoMetadata {
  priority: 'critical' | 'high' | 'medium' | 'low';
  estimate: string; // '3 hours', '2 days', '1 week'
  description: string; // What needs to be done
  acceptance: string; // How to verify it's done
  relatedFiles: string[]; // Files that need changes
  assignee?: string; // Who should do it
  dueDate?: string; // When it's needed
  tags?: string[]; // For categorization
}
```

## Best Practices

### 1. Write Persona-Driven Tests

❌ **Bad**: Technical implementation focus

```typescript
it('should update CharacterStore.boneNames array', () => {
  // Too technical, not user-focused
});
```

✅ **Good**: User-focused language

```typescript
it('should extract skeleton bones from uploaded character', () => {
  // Describes what the USER accomplishes
});
```

### 2. Use Descriptive TODO IDs

❌ **Bad**: Generic IDs

```typescript
TODO('001', {
  /* ... */
}); // What is 001?
```

✅ **Good**: Semantic IDs

```typescript
TODO('MEME-003', {
  /* ... */
}); // Clearly meme character feature
TODO('ANIM-042', {
  /* ... */
}); // Animation system feature
```

### 3. Realistic Estimates

```typescript
// Simple UI change
estimate: '2 hours';

// New feature with UI + logic
estimate: '1 day';

// Complex integration
estimate: '1 week';
```

### 4. Actionable Acceptance Criteria

❌ **Bad**: Vague criteria

```typescript
acceptance: 'It should work';
```

✅ **Good**: Specific, testable criteria

```typescript
acceptance: 'User can drag-and-drop GLB file, see skeleton in <500ms';
```

## Existing Scenarios

### 1. Animator Scenario (`animator.scenario.ts`)

**Persona**: Marco - Professional character animator

**Features Tested**:

- Character Store (GLB loading, bone extraction)
- Clip Recording (60fps frame capture)
- Animation Builder (THREE.AnimationClip generation)
- Keyframe Timeline (linear interpolation)
- Easing Curves (cubic, sine, bounce, elastic)

### 2. Degen Meme Creator (`degen-meme-creator.scenario.ts`)

**Persona**: 0xDegen - Web3 meme lord

**Features Tested**:

- Quick character import (drag-and-drop)
- Meme-specific traits (wiggle physics, emoji reactions)
- Viral animation recording (dances, poses)
- Social media export (MP4 for TikTok/Twitter)
- Meme templates (Pepe, Wojak, Chad)

### 3. Scene Composer (`scene-composer.scenario.ts`)

**Persona**: Alex - World builder

**Features Tested**:

- Scene Graph CRUD operations
- Trait System (add/remove traits, properties)
- Scene Serialization (JSON round-trip)
- Template Library (built-in templates, search)

### 4. Project Manager (`project-manager.scenario.ts`)

**Persona**: River - Indie game developer

**Features Tested**:

- Multi-scene projects (add/remove/rename scenes)
- Dirty state tracking
- Scene navigation & switching
- Scene duplication & reordering

## Advanced Features

### Custom TODO Reporters

Create domain-specific TODO files:

```typescript
import { todoRegistry } from '../helpers/todoGenerator';

afterAll(() => {
  // Generate separate TODO files by category
  const animTodos = todoRegistry.getByPriority('high').filter((t) => t.id.startsWith('ANIM-'));

  todoRegistry.generateMarkdown('ANIMATION_TODOS.md', animTodos);
});
```

### Integration with CI/CD

```yaml
# .github/workflows/test.yml
- name: Run Scenario Tests
  run: pnpm test scenarios

- name: Upload TODO Backlog
  uses: actions/upload-artifact@v3
  with:
    name: todo-backlog
    path: packages/studio/TODO_BACKLOG/*.md

- name: Comment on PR
  if: github.event_name == 'pull_request'
  run: |
    # Post TODO summary as PR comment
    gh pr comment ${{ github.event.number }} \
      --body-file TODO_BACKLOG/MEME_CHARACTER_TODOS.md
```

### GitHub Issue Generation

```typescript
// scripts/generateGitHubIssues.ts
import { todoRegistry } from '../src/__tests__/helpers/todoGenerator';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

todoRegistry.getAllSorted().forEach(async (todo) => {
  if (todo.metadata.priority === 'critical') {
    await octokit.issues.create({
      owner: 'brianonbased-dev',
      repo: 'HoloScript',
      title: `${todo.id}: ${todo.title}`,
      body: `
**Priority**: ${todo.metadata.priority}
**Estimate**: ${todo.metadata.estimate}

${todo.metadata.description}

**Acceptance Criteria**: ${todo.metadata.acceptance}

**Related Files**:
${todo.metadata.relatedFiles.map((f) => `- \`${f}\``).join('\n')}
      `,
      labels: ['todo', 'from-tests', todo.metadata.priority],
    });
  }
});
```

## FAQ

### Q: Why not use regular unit tests?

**A**: Scenario tests focus on **user workflows**, not implementation details. They're more resilient to refactoring and serve as living documentation.

### Q: Should I test every edge case in scenarios?

**A**: No. Scenarios cover **happy paths** and **critical workflows**. Use unit tests for edge cases.

### Q: How do I handle async operations?

```typescript
it('should load character asynchronously', async () => {
  const url = await uploadGLB();
  useCharacterStore.getState().setGlbUrl(url);

  await waitFor(() => {
    expect(useCharacterStore.getState().boneNames.length).toBeGreaterThan(0);
  });
});
```

### Q: Can I skip TODO generation?

```typescript
// Set environment variable to disable
GENERATE_TODOS=false pnpm test scenarios
```

### Q: How do I update existing TODOs?

Just modify the `TODO()` call in the test file. The markdown will regenerate on next test run.

## Related Files

- **Test Helpers**: `src/__tests__/helpers/todoGenerator.ts`
- **Reporter**: `src/__tests__/helpers/todoReporter.ts`
- **Scenarios**: `src/__tests__/scenarios/*.scenario.ts`
- **Character Store**: `src/lib/store.ts` (CharacterState)
- **Animation Builder**: `src/lib/animationBuilder.ts`

## Contributing

When adding new features:

1. Write scenario test FIRST (TDD)
2. Use `it.todo()` for planned features
3. Run tests to generate TODO backlog
4. Implement feature
5. Update test to passing `it()`
6. Run tests again to update backlog

---

**Questions?** See `CONTRIBUTING.md` or open a GitHub Discussion.
