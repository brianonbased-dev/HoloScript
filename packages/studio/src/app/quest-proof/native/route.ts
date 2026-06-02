/**
 * GET /quest-proof/native — the Founder Console, authored in HoloScript and served
 * as a HYDRATION-FREE HTML document (founder 2026-06-02: "HoloScript format, not .tsx").
 *
 * This route compiles founder-console.holo via @holoscript/core's Native2DCompiler
 * {format:'html'} and returns the result as raw text/html. There is NO React root and
 * NO Next.js app-router client on this response — the browser just runs the page's
 * vanilla @fetch runtime, which calls the same-origin /api/quest-proof/inbox. That is
 * the whole point: it structurally cannot hit the Next/React app-router hydration bug
 * that broke the tunneled .tsx console (research/2026-05-20-quest-proof-holotunnel).
 *
 * This route is the FLAG: the React console stays at /quest-proof; this HoloScript-native
 * one lives at /quest-proof/native, side-by-side, until a /journalist-verified live
 * headset receipt clears the cut-over (N3). Design:
 * research/2026-06-02_founder-prevetted-approval-gate-and-native-console.md (N2)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHolo } from '@holoscript/core';
// Native2DCompiler is a runtime export of the /compiler subpath (not the main barrel).
import { Native2DCompiler } from '@holoscript/core/compiler';

export const dynamic = 'force-dynamic';

function loadHoloSource(): string {
  // Authored .holo lives beside this route. Read at request time (dev/proof env);
  // fail LOUD if missing rather than silently serving a stale fallback.
  return readFileSync(join(process.cwd(), 'src/app/quest-proof/native/founder-console.holo'), 'utf8');
}

export async function GET() {
  let html: string;
  try {
    const source = loadHoloSource();
    // HoloParseResult exposes the composition as `.ast` (see parseHoloStrict).
    const parsed = parseHolo(source) as {
      success?: boolean;
      ast?: unknown;
      errors?: Array<{ message?: string }>;
    };
    if (!parsed?.success || !parsed.ast) {
      const why = parsed?.errors?.map((e) => e.message).join('; ') || 'no AST produced';
      return new Response(`founder-console.holo failed to parse: ${why}`, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    html = new Native2DCompiler().compile(parsed.ast as never, '', undefined, {
      format: 'html',
    }) as string;
  } catch (err) {
    return new Response(`founder-console native render failed: ${(err as Error)?.message ?? err}`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
