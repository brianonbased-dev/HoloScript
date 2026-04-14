import { describe, expect, it } from 'vitest';
import { moltbookTools } from './tools.js';

describe('moltbookTools', () => {
  it('exposes expected core tools with unique names', () => {
    const names = moltbookTools.map((t) => t.name);
    const unique = new Set(names);

    expect(unique.size).toBe(names.length);
    expect(names).toContain('moltbook_feed');
    expect(names).toContain('moltbook_post_create');
    expect(names).toContain('moltbook_notifications');
  });
});
