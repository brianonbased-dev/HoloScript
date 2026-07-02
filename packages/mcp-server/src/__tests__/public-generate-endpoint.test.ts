/**
 * Tests for POST /api/public/generate — WS-1 anonymous consumer generation tier.
 *
 * Mirrors the production handler in `http-server.ts`. Unlike
 * public-tool-endpoint.test.ts's PUBLIC_ANON_TOOLS (which bypasses the real
 * gate via _handleSingleToolLogic), this endpoint routes through the REAL
 * handleTool() -> runForkSandboxGate() chokepoint — mocked here at that
 * boundary so the test proves the ROUTING contract (rate/quota/bypass/policy/
 * structural-validation ordering + denial passthrough), not the gate's own
 * internal decision logic (covered by fork-sandbox-gate.test.ts).
 *
 * Pattern follows public-tool-endpoint.test.ts — re-implement the handler as
 * a pure async function so the whole MCP server doesn't need to boot.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const CONSUMER_GENERATION_TOOLS: ReadonlySet<string> = new Set([
  'generate_scene',
  'generate_world_from_prompt',
]);
const CONSUMER_GEN_RATE_LIMIT = 5;
const CONSUMER_GEN_DAILY_QUOTA = 20;

const handleToolMock = vi.fn();
const storeSceneMock = vi.fn();
const evaluateContentPolicySyncMock = vi.fn();
const parseHoloMock = vi.fn();
const checkRateLimitBypassMock = vi.fn();

type Bucket = { count: number; resetAt: number };
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, Bucket>();
function getRateLimit(ip: string, limit: number) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return { remaining: Math.max(0, limit - bucket.count), limit, resetAt: bucket.resetAt };
}

const dailyBuckets = new Map<string, { count: number; resetAt: number }>();
function checkConsumerGenDailyQuota(ip: string) {
  const now = Date.now();
  let bucket = dailyBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + 24 * 60 * 60 * 1000 };
    dailyBuckets.set(ip, bucket);
  }
  const allowed = bucket.count < CONSUMER_GEN_DAILY_QUOTA;
  if (allowed) bucket.count++;
  return { allowed, remaining: Math.max(0, CONSUMER_GEN_DAILY_QUOTA - bucket.count), resetAt: bucket.resetAt };
}

type Response = { status: number; body: Record<string, unknown> };

async function publicGenerateHandler(
  body: Record<string, unknown> | null,
  clientIP = '127.0.0.1'
): Promise<Response> {
  const rl = getRateLimit(`consumer-gen:${clientIP}`, CONSUMER_GEN_RATE_LIMIT);
  if (rl.remaining === 0) {
    return {
      status: 429,
      body: {
        error: 'rate_limit_exceeded',
        message: `Consumer generation tier limited to ${CONSUMER_GEN_RATE_LIMIT} requests/minute per IP.`,
      },
    };
  }

  const quota = checkConsumerGenDailyQuota(clientIP);
  if (!quota.allowed) {
    return {
      status: 429,
      body: { error: 'daily_quota_exceeded' },
    };
  }

  try {
    const bypass = await checkRateLimitBypassMock({
      toolName: 'generate_scene_or_world',
      directIp: clientIP,
    });
    if (!bypass.allowed) {
      return { status: 429, body: { error: 'bypass_denied', code: bypass.reason || 'bypass_denied' } };
    }
  } catch {
    // fail-open on detector's own error only
  }

  const tool = body?.tool as string | undefined;
  const args = (body?.arguments as Record<string, unknown> | undefined) || {};

  if (!tool || typeof tool !== 'string' || !CONSUMER_GENERATION_TOOLS.has(tool)) {
    return {
      status: 400,
      body: {
        error: 'invalid_request',
        message: `tool must be one of: ${Array.from(CONSUMER_GENERATION_TOOLS).join(', ')}`,
      },
    };
  }

  const promptText = typeof args.description === 'string' ? args.description : '';
  if (promptText) {
    const inputDecision = evaluateContentPolicySyncMock(
      { text: promptText, surface: 'consumer-generation', direction: 'input' },
      {}
    );
    if (!inputDecision.allowed) {
      return {
        status: 200,
        body: { success: false, error: 'Input blocked by content policy.', action: inputDecision.action },
      };
    }
  }

  const gated = await handleToolMock(tool, args, undefined, 'consumer');
  if (gated?.success === false) {
    return { status: 200, body: gated };
  }

  const rawText = gated?.content?.[0]?.text ?? '';
  let generatedCode = '';
  try {
    const parsed = JSON.parse(rawText);
    generatedCode = typeof parsed?.code === 'string' ? parsed.code : '';
  } catch {
    generatedCode = typeof rawText === 'string' ? rawText : '';
  }

  if (!generatedCode) {
    return { status: 502, body: { success: false, error: 'generation_produced_no_code' } };
  }

  const outputDecision = evaluateContentPolicySyncMock(
    { text: generatedCode, surface: 'consumer-generation', direction: 'output' },
    {}
  );
  if (!outputDecision.allowed) {
    return {
      status: 200,
      body: { success: false, error: 'Output blocked by content policy.', action: outputDecision.action },
    };
  }

  const parsedHolo = parseHoloMock(generatedCode, { tolerant: false, strict: true });
  if (!parsedHolo.success || !parsedHolo.ast) {
    return {
      status: 502,
      body: { success: false, error: 'generated_output_failed_structural_validation', details: parsedHolo.errors },
    };
  }

  const stored = storeSceneMock(generatedCode, { title: 'Consumer-generated scene', description: promptText });

  return {
    status: 200,
    body: { success: true, sceneId: stored.id, previewUrl: `/scene/${stored.id}`, code: generatedCode },
  };
}

describe('POST /api/public/generate — WS-1 consumer generation tier', () => {
  beforeEach(() => {
    handleToolMock.mockReset();
    storeSceneMock.mockReset();
    evaluateContentPolicySyncMock.mockReset();
    parseHoloMock.mockReset();
    checkRateLimitBypassMock.mockReset();
    rateBuckets.clear();
    dailyBuckets.clear();
    checkRateLimitBypassMock.mockResolvedValue({ allowed: true });
    evaluateContentPolicySyncMock.mockReturnValue({ allowed: true, action: 'allow' });
  });

  describe('gate denial passthrough (default-off proof)', () => {
    it('passes through a ForkSandboxGate denial unchanged when the flag is unset', async () => {
      handleToolMock.mockResolvedValue({
        success: false,
        error: 'ForkSandboxGate denied: consumer tier not enabled',
      });

      const res = await publicGenerateHandler({
        tool: 'generate_scene',
        arguments: { description: 'a cube' },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: false, error: expect.stringContaining('ForkSandboxGate') });
      expect(storeSceneMock).not.toHaveBeenCalled();
    });
  });

  describe('rate limit', () => {
    it('blocks once the per-minute bucket is exhausted', async () => {
      handleToolMock.mockResolvedValue({ success: false, error: 'denied' });
      for (let i = 0; i < CONSUMER_GEN_RATE_LIMIT - 1; i++) {
        const res = await publicGenerateHandler(
          { tool: 'generate_scene', arguments: {} },
          '10.1.0.1'
        );
        expect(res.status).toBe(200);
      }
      const blocked = await publicGenerateHandler(
        { tool: 'generate_scene', arguments: {} },
        '10.1.0.1'
      );
      expect(blocked.status).toBe(429);
      expect(blocked.body.error).toBe('rate_limit_exceeded');
    });
  });

  describe('daily quota (pure function — isolated from the per-minute rate limiter,', () => {
    // which caps at 5/min and would fire long before a 20/day quota could be
    // exhausted within a single test tick if driven through the full handler).
    it('allows exactly CONSUMER_GEN_DAILY_QUOTA calls then blocks the next one', () => {
      let lastResult;
      for (let i = 0; i < CONSUMER_GEN_DAILY_QUOTA; i++) {
        lastResult = checkConsumerGenDailyQuota('10.3.0.1');
        expect(lastResult.allowed).toBe(true);
      }
      const exhausted = checkConsumerGenDailyQuota('10.3.0.1');
      expect(exhausted.allowed).toBe(false);
      expect(exhausted.remaining).toBe(0);
    });

    it('isolates the daily quota per client IP', () => {
      for (let i = 0; i < CONSUMER_GEN_DAILY_QUOTA; i++) {
        checkConsumerGenDailyQuota('10.3.0.2');
      }
      expect(checkConsumerGenDailyQuota('10.3.0.2').allowed).toBe(false);
      expect(checkConsumerGenDailyQuota('10.3.0.3').allowed).toBe(true);
    });

    it('the full handler surfaces daily_quota_exceeded once both checks would fire, with quota checked after rate limit', async () => {
      handleToolMock.mockResolvedValue({ success: false, error: 'denied' });
      // Pre-exhaust the daily bucket directly, then issue one request against a
      // fresh per-minute bucket so the rate limiter allows it through to the
      // quota check.
      for (let i = 0; i < CONSUMER_GEN_DAILY_QUOTA; i++) {
        checkConsumerGenDailyQuota('10.3.0.4');
      }
      const res = await publicGenerateHandler({ tool: 'generate_scene', arguments: {} }, '10.3.0.4');
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('daily_quota_exceeded');
      expect(handleToolMock).not.toHaveBeenCalled();
    });
  });

  describe('input validation', () => {
    it('rejects a tool outside the fixed allowlist with 400', async () => {
      const res = await publicGenerateHandler({
        tool: 'create_world',
        arguments: {},
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_request');
      expect(handleToolMock).not.toHaveBeenCalled();
    });

    it('rejects a missing tool field with 400', async () => {
      const res = await publicGenerateHandler({ arguments: {} });
      expect(res.status).toBe(400);
      expect(handleToolMock).not.toHaveBeenCalled();
    });
  });

  describe('content policy', () => {
    it('blocks on input policy violation WITHOUT calling handleTool (no spend)', async () => {
      evaluateContentPolicySyncMock.mockReturnValueOnce({ allowed: false, action: 'block' });

      const res = await publicGenerateHandler({
        tool: 'generate_scene',
        arguments: { description: 'disallowed content' },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: false, error: expect.stringContaining('Input blocked') });
      expect(handleToolMock).not.toHaveBeenCalled();
    });

    it('blocks on output policy violation AFTER generation, never returning the code', async () => {
      handleToolMock.mockResolvedValue({
        success: true,
        content: [{ type: 'text', text: JSON.stringify({ code: 'composition "X" {}' }) }],
      });
      evaluateContentPolicySyncMock
        .mockReturnValueOnce({ allowed: true, action: 'allow' }) // input
        .mockReturnValueOnce({ allowed: false, action: 'block' }); // output

      const res = await publicGenerateHandler({
        tool: 'generate_scene',
        arguments: { description: 'benign prompt' },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: false, error: expect.stringContaining('Output blocked') });
      expect(res.body.code).toBeUndefined();
      expect(storeSceneMock).not.toHaveBeenCalled();
    });
  });

  describe('structural validation', () => {
    it('rejects malformed generated output that fails parseHolo strict mode', async () => {
      handleToolMock.mockResolvedValue({
        success: true,
        content: [{ type: 'text', text: JSON.stringify({ code: 'not valid holo {{{' }) }],
      });
      parseHoloMock.mockReturnValue({ success: false, errors: [{ message: 'unexpected token' }] });

      const res = await publicGenerateHandler({
        tool: 'generate_scene',
        arguments: { description: 'benign prompt' },
      });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('generated_output_failed_structural_validation');
      expect(storeSceneMock).not.toHaveBeenCalled();
    });

    it('rejects a response with no extractable code', async () => {
      handleToolMock.mockResolvedValue({ success: true, content: [{ type: 'text', text: '' }] });

      const res = await publicGenerateHandler({
        tool: 'generate_scene',
        arguments: { description: 'benign prompt' },
      });

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('generation_produced_no_code');
    });
  });

  describe('happy path', () => {
    it('returns a stored preview scene, never touching create_world', async () => {
      handleToolMock.mockResolvedValue({
        success: true,
        content: [{ type: 'text', text: JSON.stringify({ code: 'composition "Cube" { object "Box" {} }' }) }],
      });
      parseHoloMock.mockReturnValue({ success: true, ast: { type: 'HoloComposition' }, errors: [] });
      storeSceneMock.mockReturnValue({ id: 'scene_abc123' });

      const res = await publicGenerateHandler({
        tool: 'generate_scene',
        arguments: { description: 'a red cube' },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        sceneId: 'scene_abc123',
        previewUrl: '/scene/scene_abc123',
      });
      expect(handleToolMock).toHaveBeenCalledWith(
        'generate_scene',
        { description: 'a red cube' },
        undefined,
        'consumer'
      );
      expect(storeSceneMock).toHaveBeenCalledWith(
        'composition "Cube" { object "Box" {} }',
        expect.objectContaining({ title: 'Consumer-generated scene' })
      );
    });

    it('accepts generate_world_from_prompt as the second allowlisted tool', async () => {
      handleToolMock.mockResolvedValue({
        success: true,
        content: [{ type: 'text', text: JSON.stringify({ code: 'composition "World" {}' }) }],
      });
      parseHoloMock.mockReturnValue({ success: true, ast: {}, errors: [] });
      storeSceneMock.mockReturnValue({ id: 'scene_def456' });

      const res = await publicGenerateHandler({
        tool: 'generate_world_from_prompt',
        arguments: { description: 'a small forest' },
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, sceneId: 'scene_def456' });
    });
  });

  describe('bypass detection', () => {
    it('denies when the bypass detector flags the request', async () => {
      checkRateLimitBypassMock.mockResolvedValue({ allowed: false, reason: 'subnet_fanout' });

      const res = await publicGenerateHandler({
        tool: 'generate_scene',
        arguments: {},
      });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('bypass_denied');
      expect(handleToolMock).not.toHaveBeenCalled();
    });
  });

  describe('allowlist contract', () => {
    it('contains exactly the two generation tools, nothing sensitive', () => {
      expect(CONSUMER_GENERATION_TOOLS.size).toBe(2);
      expect(CONSUMER_GENERATION_TOOLS.has('create_world')).toBe(false);
      expect(CONSUMER_GENERATION_TOOLS.has('twin_earth_robot_actuate')).toBe(false);
      expect(CONSUMER_GENERATION_TOOLS.has('hololand_provision_agent')).toBe(false);
    });
  });
});
