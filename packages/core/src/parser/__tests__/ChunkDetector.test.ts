import { describe, it, expect } from 'vitest';
import { ChunkDetector } from '../ChunkDetector';

describe('ChunkDetector', () => {
  it('detects an orb block', () => {
    const source = `orb MyCube {
  position: [0, 1, 0]
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('orb');
    expect(chunks[0].name).toBe('MyCube');
    expect(chunks[0].id).toBe('orb:MyCube');
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(3);
  });

  it('detects a template block', () => {
    const source = `template "Enemy" {
  health: 100
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('template');
    expect(chunks[0].name).toBe('Enemy');
    expect(chunks[0].id).toBe('template:Enemy');
  });

  it('detects environment block', () => {
    const source = `environment {
  skybox: "sky_day"
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('environment');
  });

  it('detects logic block', () => {
    const source = `logic {
  on_event { doSomething() }
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('logic');
  });

  it('detects single-line directive', () => {
    const source = `@import "other.holo"`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('directive');
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(1);
  });

  it('detects multiple chunks in sequence', () => {
    const source = `orb A {
  x: 1
}

template "B" {
  y: 2
}

environment {
  z: 3
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(3);
    expect(chunks[0].type).toBe('orb');
    expect(chunks[1].type).toBe('template');
    expect(chunks[2].type).toBe('environment');
  });

  it('skips comments and empty lines', () => {
    const source = `// This is a comment

orb Test {
  value: 1
}`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].name).toBe('Test');
  });

  it('handles unclosed chunk at EOF', () => {
    const source = `orb Broken {
  missing_close: true`;
    const chunks = ChunkDetector.detect(source);
    expect(chunks.length).toBe(1);
    expect(chunks[0].endLine).toBe(2);
  });

  it('returns empty array for empty source', () => {
    expect(ChunkDetector.detect('')).toEqual([]);
    expect(ChunkDetector.detect('// just comments')).toEqual([]);
  });
});
