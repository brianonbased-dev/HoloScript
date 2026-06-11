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

/**
 * Native2DCompiler via dynamic import + interop unwrap: the static named
 * import from '@holoscript/core/compiler' arrives as a non-constructible
 * binding under studio's webpack server bundle (CJS/ESM interop wrapping —
 * observed 2026-06-10: this route 500'd ".Native2DCompiler is not a
 * constructor" while node resolved the same dist exports as functions).
 * Same fix as gold-game/receipts/route.ts.
 */
async function loadNative2DCompiler(): Promise<new () => {
  compile(ast: never, a: string, b: undefined, opts: { format: string }): unknown;
}> {
  const mod = (await import('@holoscript/core/compiler')) as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const ctor = (mod.Native2DCompiler ?? mod.default?.Native2DCompiler) as
    | (new () => { compile(ast: never, a: string, b: undefined, opts: { format: string }): unknown })
    | undefined;
  if (typeof ctor !== 'function') {
    throw new Error(
      `Native2DCompiler not constructible (typeof named=${typeof mod.Native2DCompiler}, default=${typeof mod.default})`
    );
  }
  return ctor;
}

export const dynamic = 'force-dynamic';

function loadHoloSource(): string {
  // Authored .holo lives beside this route. Read at request time (dev/proof env);
  // fail LOUD if missing rather than silently serving a stale fallback.
  return readFileSync(
    join(process.cwd(), 'src/app/quest-proof/native/founder-console.holo'),
    'utf8'
  );
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
    const Native2D = await loadNative2DCompiler();
    html = new Native2D().compile(parsed.ast as never, '', undefined, {
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
