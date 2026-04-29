/**
 * Tests for absorb_typescript MCP tool
 *
 * Validates Express route detection, Prisma model detection,
 * @imperative region generation, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { handleAbsorbTypescriptTool } from '@holoscript/absorb-service/mcp';

// =============================================================================
// HELPERS
// =============================================================================

async function absorb(code: string, name?: string) {
  return handleAbsorbTypescriptTool('absorb_typescript', { code, name }) as Promise<{
    success: boolean;
    holo: string;
    detections: {
      endpoints: number;
      models: number;
      queues: number;
      resiliencePatterns: string[];
      containerPatterns: string[];
    };
    error?: string;
  }>;
}

// =============================================================================
// FIXTURES
// =============================================================================

const EXPRESS_APP = `
import express from 'express';
const app = express();

app.get('/users', async (req, res) => {
  const users = await db.users.findMany();
  res.json(users);
});

app.post('/users', async (req, res) => {
  const user = await db.users.create(req.body);
  res.status(201).json(user);
});
`;

const PRISMA_SCHEMA = `
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
}
`;

const RESILIENT_SERVICE = `
import { CircuitBreaker } from 'opossum';

const breaker = new CircuitBreaker(fetchData, {
  timeout: 3000,
  errorThresholdPercentage: 50,
});

app.get('/data', async (req, res) => {
  const result = await breaker.fire();
  res.json(result);
});
`;

const QUEUE_WORKER = `
import { Queue, Worker } from 'bullmq';

const emailQueue = new Queue('email-notifications');
const worker = new Worker('email-notifications', async (job) => {
  await sendEmail(job.data);
});
`;

// =============================================================================
// TESTS
// =============================================================================

describe('absorb_typescript', () => {
  describe('Express route detection', () => {
    it('detects GET and POST routes', async () => {
      const result = await absorb(EXPRESS_APP);
      expect(result.success).toBe(true);
      expect(result.detections.endpoints).toBe(2);
      expect(result.holo).toContain('@endpoint');
      expect(result.holo).toContain('/users');
    });

    it('generates service block for routes', async () => {
      const result = await absorb(EXPRESS_APP);
      expect(result.holo).toContain('@service');
    });

    it('includes @imperative regions for inline handlers', async () => {
      const result = await absorb(EXPRESS_APP);
      expect(result.holo).toContain('@imperative');
    });
  });

  describe('Prisma model detection', () => {
    it('detects Prisma models', async () => {
      const result = await absorb(PRISMA_SCHEMA);
      expect(result.success).toBe(true);
      expect(result.detections.models).toBe(2);
      expect(result.holo).toContain('@model("User")');
      expect(result.holo).toContain('@model("Post")');
    });

    it('generates data block for models', async () => {
      const result = await absorb(PRISMA_SCHEMA);
      expect(result.holo).toContain('@db');
    });
  });

  describe('resilience pattern detection', () => {
    it('detects circuit breaker pattern', async () => {
      const result = await absorb(RESILIENT_SERVICE);
      expect(result.detections.resiliencePatterns).toContain('circuit_breaker');
      expect(result.holo).toContain('@circuit_breaker');
    });

    it('detects timeout pattern from explicit usage', async () => {
      const code = `
import { withTimeout } from 'resilience';
const result = withTimeout(fetchData, 3000);
`;
      const result = await absorb(code);
      expect(result.detections.resiliencePatterns).toContain('timeout');
    });
  });

  describe('queue detection', () => {
    it('detects BullMQ queues', async () => {
      const result = await absorb(QUEUE_WORKER);
      expect(result.detections.queues).toBeGreaterThanOrEqual(1);
      expect(result.holo).toContain('@pipeline');
      expect(result.holo).toContain('@queue');
    });
  });

  describe('custom service name', () => {
    it('uses provided name', async () => {
      const result = await absorb(EXPRESS_APP, 'UserAPI');
      expect(result.holo).toContain('"UserAPI"');
    });

    it('auto-detects name from express app', async () => {
      const result = await absorb(EXPRESS_APP);
      expect(result.holo).toContain('appService');
    });
  });

  describe('skeleton for unrecognized input', () => {
    it('produces skeleton for empty/unrecognized TS', async () => {
      const result = await absorb('const x = 42;');
      expect(result.success).toBe(true);
      expect(result.holo).toContain('@service');
      expect(result.detections.endpoints).toBe(0);
      expect(result.detections.models).toBe(0);
    });
  });

  describe('missing input', () => {
    it('returns error when code is missing', async () => {
      const result = (await handleAbsorbTypescriptTool('absorb_typescript', {})) as {
        success: boolean;
        error: string;
      };
      expect(result.success).toBe(false);
      expect(result.error).toContain('code');
    });
  });

  describe('handler routing', () => {
    it('returns null for unknown tool names', async () => {
      const result = await handleAbsorbTypescriptTool('unknown', { code: 'test' });
      expect(result).toBeNull();
    });
  });

  describe('composition structure', () => {
    it('produces valid composition wrapper', async () => {
      const result = await absorb(EXPRESS_APP);
      expect(result.holo).toMatch(/^composition ".*" \{/m);
      expect(result.holo).toMatch(/\}$/);
    });
  });
});
