import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.js';

describe('marketplace server startup', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('constructs the Express app with paid marketplace routes mounted', () => {
    vi.useFakeTimers();

    expect(() => createApp(undefined, undefined, { corsOrigins: ['http://localhost:3000'] }))
      .not.toThrow();
  });
});
