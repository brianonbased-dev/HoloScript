/**
 * Skill Resource Tests — verify SKILL.md discovery and reading.
 */

import { describe, it, expect } from 'vitest';
import { listSkillResources, readSkillResource } from '../skill-resources';

describe('skill-resources', () => {
  it('lists local skills with stable ordering', () => {
    const resources = listSkillResources();
    // At minimum the 'room' skill should exist on this machine
    expect(resources.length).toBeGreaterThan(0);
    // Alphabetically sorted
    for (let i = 1; i < resources.length; i++) {
      expect(resources[i].name >= resources[i - 1].name).toBe(true);
    }
    // Every entry has required fields
    for (const r of resources) {
      expect(r.uri).toMatch(/^skill:\/\//);
      expect(r.name).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(r.mimeType).toBe('text/markdown');
    }
  });

  it('reads an existing skill resource', () => {
    const resources = listSkillResources();
    expect(resources.length).toBeGreaterThan(0);
    const first = resources[0];
    const result = readSkillResource(first.uri);
    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe('text/markdown');
    expect(result!.text.length).toBeGreaterThan(0);
    expect(result!.text).toContain('#');
  });

  it('returns null for unknown resource URIs', () => {
    expect(readSkillResource('skill://nonexistent-skill-12345')).toBeNull();
    expect(readSkillResource('file:///etc/passwd')).toBeNull();
    expect(readSkillResource('')).toBeNull();
  });

  it('rejects traversal attempts', () => {
    expect(readSkillResource('skill://../etc/passwd')).toBeNull();
    expect(readSkillResource('skill://foo/../bar')).toBeNull();
  });
});
