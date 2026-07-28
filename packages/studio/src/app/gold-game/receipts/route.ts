/**
 * GET /gold-game/receipts — provenance ledger for the gold-game's GATE
 * receipts, served HS-NATIVE per the render-surface freeze: the page is a
 * .holo composition generated from the receipt manifest at request time and
 * compiled by Native2DCompiler {format:'html'} (quest-proof/native
 * precedent). No React root, no hydration, no hand-authored render .tsx.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHolo } from '@holoscript/core';

/**
 * Native2DCompiler via dynamic import + interop unwrap: the static named
 * import arrives as a non-constructible binding under studio's webpack
 * server bundle (CJS/ESM interop wrapping — observed 2026-06-10 on BOTH this
 * route and the quest-proof/native precedent: ".Native2DCompiler is not a
 * constructor" while node resolves the same dist exports as functions).
 */
async function loadNative2DCompiler(): Promise<
  new () => {
    compile(ast: never, a: string, b: undefined, opts: { format: string }): unknown;
  }
> {
  const mod = (await import('@holoscript/core/compiler')) as Record<string, unknown> & {
    default?: Record<string, unknown>;
  };
  const ctor = (mod.Native2DCompiler ?? mod.default?.Native2DCompiler) as
    | (new () => {
        compile(ast: never, a: string, b: undefined, opts: { format: string }): unknown;
      })
    | undefined;
  if (typeof ctor !== 'function') {
    throw new Error(
      `Native2DCompiler not constructible (typeof named=${typeof mod.Native2DCompiler}, default=${typeof mod.default})`
    );
  }
  return ctor;
}

export const dynamic = 'force-dynamic';

interface ReceiptRow {
  name: string;
  bytes: number;
  sha256: string;
}

function loadManifest(): { count: number; generatedAt: string; receipts: ReceiptRow[] } | null {
  try {
    return JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'gold-game', 'receipts', 'manifest.json'), 'utf8')
    );
  } catch {
    return null;
  }
}

/** Receipt filenames are [A-Za-z0-9._-]; reject anything else from the page. */
function safeName(name: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(name);
}

function buildHoloSource(manifest: {
  count: number;
  generatedAt: string;
  receipts: ReceiptRow[];
}): string {
  const rows = manifest.receipts
    .filter((r) => safeName(r.name))
    .map(
      (r, i) => `
      object "Row${i}" {
        @panel { tag: "article" }
        @theme { style: "display:flex; gap:16px; align-items:baseline; border-bottom:1px solid #e5e7eb; padding:8px 0; font-size:13px" }
        object "Name${i}" {
          @button { content: "${r.name}", onClick: "window.open('/gold-game/receipts/${r.name}')" }
          @theme { style: "background:none; border:none; color:#2563eb; cursor:pointer; padding:0; font-family:inherit; font-size:13px; text-decoration:underline" }
        }
        object "Bytes${i}" { @text { content: "${r.bytes.toLocaleString('en-US')} B" } @theme { style: "color:#6b7280; min-width:90px" } }
        object "Sha${i}" { @text { content: "${r.sha256.slice(0, 16)}…" } @theme { style: "color:#9ca3af; font-size:11px" } }
      }`
    )
    .join('\n');

  return `composition "GoldGameReceipts" {
  object "Root" {
    @panel { tag: "main" }
    @theme { style: "padding:24px; max-width:760px; margin:0 auto; font-family:ui-monospace,monospace" }
    object "Title" { @text { variant: "h1", content: "GOLD Quest — GATE receipts" } }
    object "Sub" { @text { content: "${manifest.count} receipts · synced ${manifest.generatedAt} · sha256 fixed at sync. Authoritative ledger: examples/gold-game/GATES.md" } @theme { style: "color:#6b7280; font-size:13px; display:block; margin:8px 0 16px" } }
    object "Play" {
      @button { content: "▶ play the game", onClick: "window.location.href='/gold-game'" }
      @theme { style: "background:#d97706; color:#fff; border:none; border-radius:8px; padding:8px 18px; cursor:pointer; margin-bottom:16px" }
    }
    object "Ledger" {
      @panel { tag: "section" }
${rows}
    }
  }
}`;
}

export async function GET() {
  const manifest = loadManifest();
  if (!manifest) {
    return new Response('No receipt manifest — run `pnpm sync:gold-game` in packages/studio.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  let html: string;
  try {
    const source = buildHoloSource(manifest);
    const parsed = parseHolo(source) as {
      success?: boolean;
      ast?: unknown;
      errors?: Array<{ message?: string }>;
    };
    if (!parsed?.success || !parsed.ast) {
      const why = parsed?.errors?.map((e) => e.message).join('; ') || 'no AST produced';
      return new Response(`receipts composition failed to parse: ${why}`, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    const Native2D = await loadNative2DCompiler();
    html = new Native2D().compile(parsed.ast as never, '', undefined, {
      format: 'html',
    }) as string;
  } catch (err) {
    return new Response(`receipts native render failed: ${(err as Error)?.message ?? err}`, {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
