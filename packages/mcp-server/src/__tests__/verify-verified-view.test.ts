/**
 * verify_verified_view MCP tool — the @verified_view provenance check as a production,
 * agent-callable oracle (wired into compiler-tools alongside verify_cross_perceiver).
 *
 * Tests the handler directly plus the registration/dispatch surface. The value over simply
 * compiling the surface: compiling throws on the FIRST VIEW-UNGROUNDED violation, this returns
 * EVERY violation at once, and unverifiable input is a hard error (never a false "clean").
 */
import { describe, it, expect } from 'vitest';
import {
  compilerTools,
  handleCompilerTool,
  handleVerifyVerifiedView,
  type VerifiedViewCheckResult,
} from '../compiler-tools';

/** A fully honest verified surface: bound stat readouts, each with its matching receipt. */
const HONEST_SURFACE = `composition "SemanticApp" {
  @verified_view
  state { metrics: { sessions: 42, errors: 3 } }
  object "Root" {
    object "Sessions" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "sessions" }
      @projects { node: "metrics.sessions" }
    }
    object "Errors" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "errors" }
      @projects { node: "metrics.errors" }
    }
  }
}`;

/** Multiple distinct violations that compiling would only surface one-at-a-time. */
const MESSY_SURFACE = `composition "Messy" {
  state { metrics: { sessions: 42, errors: 3 } }
  object "Root" {
    object "A" { @bind { state: "metrics", path: "sessions" } @projects { node: "metrics.errors" } }
    object "B" { @bind { state: "metrics", path: "errors" } }
  }
}`;

describe('verify_verified_view — registration', () => {
  it('is registered with code required and complete:false marked load-bearing', () => {
    const tool = compilerTools.find((t) => t.name === 'verify_verified_view');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toEqual(['code']);
    expect(tool!.description).toMatch(/LOAD-BEARING/i);
    expect(tool!.description).toMatch(/hard failure/i);
    expect(tool!.description).toMatch(/never demoted to a warning/i);
  });

  it('dispatches through handleCompilerTool', async () => {
    const result = (await handleCompilerTool('verify_verified_view', {
      code: HONEST_SURFACE,
    })) as VerifiedViewCheckResult;
    expect(result.success).toBe(true);
    expect(result.complete).toBe(true);
  });
});

describe('verify_verified_view — provenance verdicts', () => {
  it('a fully honest verified surface is complete with zero violations', async () => {
    const result = await handleVerifyVerifiedView({ code: HONEST_SURFACE });
    expect(result.complete).toBe(true);
    expect(result.hasBindings).toBe(true);
    expect(result.verifiedViewOn).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.sourceSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('returns EVERY violation at once (compiling would throw on the first)', async () => {
    const result = await handleVerifyVerifiedView({ code: MESSY_SURFACE });
    expect(result.complete).toBe(false);
    const reasons = result.violations.map((v) => v.reason).sort();
    // mismatched (A), missing (B), and the surface-level no-verified-view — all in one pass.
    expect(reasons).toContain('mismatched-node');
    expect(reasons).toContain('missing-projects');
    expect(reasons).toContain('no-verified-view');
  });

  it('a binding-free surface is trivially complete (nothing to prove)', async () => {
    const staticUi = `composition "Static" { object "Root" { object "T" { @text { content: "hi" } } } }`;
    const result = await handleVerifyVerifiedView({ code: staticUi });
    expect(result.complete).toBe(true);
    expect(result.hasBindings).toBe(false);
  });

  it('unverifiable input is a HARD ERROR — never a false clean (W.776)', async () => {
    await expect(handleVerifyVerifiedView({ code: 'garbage {{{' })).rejects.toThrow(
      /not a verifiable HoloScript surface|fail loud/
    );
  });

  it('missing code is rejected', async () => {
    await expect(handleVerifyVerifiedView({})).rejects.toThrow(/code is required/);
  });
});
