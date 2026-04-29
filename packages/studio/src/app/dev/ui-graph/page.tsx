/**
 * /dev/ui-graph — Studio UI Graph Viewer
 *
 * Renders the .holo artifact emitted by @holoscript/studio-ui-graph as a
 * sortable summary of every page in this Studio: route, source path, Zustand
 * stores consumed, API endpoints called, and component-tree size.
 *
 * Server component — reads packages/studio/.holo/studio.ui.holo at request
 * time. No client-side bundle weight. Gated under /dev/ so casual visitors
 * don't stumble into it.
 *
 * Regenerate the underlying graph with:
 *   node packages/studio-ui-graph/dist/cli.js
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

interface PageRow {
  id: string;
  route: string;
  file: string;
  stores: string[];
  apis: string[];
  componentCount: number;
}

interface Summary {
  pages: PageRow[];
  sharedCount: number;
  apiTotal: number;
  storeTotal: number;
  generatedAt: string | null;
}

const HOLO_PATH = join(process.cwd(), '.holo', 'studio.ui.holo');

function parseHolo(text: string): Summary {
  const pages: PageRow[] = [];
  let sharedCount = 0;
  let apiTotal = 0;
  let storeTotal = 0;
  let generatedAt: string | null = null;

  const generatedMatch = /\/\/ generated: (.*)/.exec(text);
  if (generatedMatch) generatedAt = generatedMatch[1];

  const pageBlockRegex = /^ {2}page (\w+) \{([^\n]*)\n([\s\S]*?)^ {2}\}/gm;
  let m: RegExpExecArray | null;
  while ((m = pageBlockRegex.exec(text)) !== null) {
    const [, id, headerTraits, body] = m;
    const route = /@route\("([^"]*)"\)/.exec(headerTraits)?.[1] ?? '/';
    const file = /@file\("([^"]*)"\)/.exec(headerTraits)?.[1] ?? '';
    const stores = parseListTrait(headerTraits, 'uses_stores');
    const apis = parseListTrait(headerTraits, 'calls_apis');
    const componentCount = (body.match(/\{ @file\(/g) ?? []).length;
    pages.push({ id, route, file, stores, apis, componentCount });
  }
  pages.sort((a, b) => a.route.localeCompare(b.route));

  sharedCount = (text.match(/^ {2}shared_component /gm) ?? []).length;
  apiTotal = (text.match(/^ {2}api_endpoint /gm) ?? []).length;
  storeTotal = (text.match(/^ {2}store /gm) ?? []).length;
  return { pages, sharedCount, apiTotal, storeTotal, generatedAt };
}

function parseListTrait(headerTraits: string, name: string): string[] {
  const re = new RegExp(`@${name}\\(\\[([^\\]]*)\\]\\)`);
  const match = re.exec(headerTraits);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^"/, '').replace(/"$/, ''))
    .filter(Boolean);
}

function fileMTime(path: string): string | null {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return null;
  }
}

export default function UiGraphPage() {
  let text: string | null = null;
  let mtime: string | null = null;
  try {
    text = readFileSync(HOLO_PATH, 'utf8');
    mtime = fileMTime(HOLO_PATH);
  } catch {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 p-8 font-mono">
        <h1 className="text-2xl font-semibold mb-4">UI Graph not generated</h1>
        <p className="text-neutral-400">No file at <code>{HOLO_PATH}</code>.</p>
        <pre className="mt-4 p-4 bg-neutral-900 rounded text-sm overflow-auto">
          {`# generate the graph
node packages/studio-ui-graph/dist/cli.js`}
        </pre>
      </main>
    );
  }

  const summary = parseHolo(text);
  const totalComponents = summary.pages.reduce((s, p) => s + p.componentCount, 0);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 lg:p-8 font-mono text-sm">
      <header className="mb-6 border-b border-neutral-800 pb-4">
        <h1 className="text-2xl font-semibold mb-2">Studio UI Graph</h1>
        <p className="text-neutral-400 text-xs">
          Server-rendered from <code className="text-cyan-400">{HOLO_PATH.replace(process.cwd(), '.')}</code>
          {summary.generatedAt && (
            <> · graph generated <time className="text-neutral-300">{summary.generatedAt}</time></>
          )}
          {mtime && <> · file mtime <time className="text-neutral-500">{mtime}</time></>}
        </p>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <Stat label="pages" value={summary.pages.length} />
        <Stat label="components (incl. dups)" value={totalComponents} />
        <Stat label="shared (≥2 pages)" value={summary.sharedCount} />
        <Stat label="zustand stores" value={summary.storeTotal} />
        <Stat label="api endpoints" value={summary.apiTotal} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3 text-neutral-200">Pages</h2>
        <div className="overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-xs">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="text-left px-3 py-2">route</th>
                <th className="text-left px-3 py-2">id</th>
                <th className="text-right px-3 py-2">components</th>
                <th className="text-right px-3 py-2">stores</th>
                <th className="text-right px-3 py-2">apis</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">file</th>
              </tr>
            </thead>
            <tbody>
              {summary.pages.map((p) => (
                <tr key={p.id} className="border-t border-neutral-900 hover:bg-neutral-900/40">
                  <td className="px-3 py-2 text-cyan-300">{p.route}</td>
                  <td className="px-3 py-2 text-neutral-300">{p.id}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Bar value={p.componentCount} max={Math.max(...summary.pages.map((q) => q.componentCount), 1)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Bar value={p.stores.length} max={Math.max(...summary.pages.map((q) => q.stores.length), 1)} accent="amber" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Bar value={p.apis.length} max={Math.max(...summary.pages.map((q) => q.apis.length), 1)} accent="violet" />
                  </td>
                  <td className="px-3 py-2 text-neutral-500 hidden lg:table-cell">{p.file}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold mb-3 text-neutral-200">Per-page rollups</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Pages are sorted by total backend surface (stores + APIs). Highest-surface pages at the top
          are the primary candidates for decomposition.
        </p>
        <div className="space-y-3">
          {[...summary.pages]
            .sort((a, b) => b.stores.length + b.apis.length - (a.stores.length + a.apis.length))
            .filter((p) => p.stores.length + p.apis.length > 0)
            .slice(0, 12)
            .map((p) => (
              <details key={p.id} className="rounded border border-neutral-800 bg-neutral-950">
                <summary className="cursor-pointer px-3 py-2 hover:bg-neutral-900/50 flex items-center justify-between">
                  <span>
                    <span className="text-cyan-300">{p.route}</span>
                    <span className="text-neutral-500 ml-2">{p.id}</span>
                  </span>
                  <span className="text-xs text-neutral-400">
                    {p.componentCount} comp · {p.stores.length} stores · {p.apis.length} apis
                  </span>
                </summary>
                <div className="px-4 py-3 grid lg:grid-cols-2 gap-4 border-t border-neutral-800 text-xs">
                  <div>
                    <div className="text-amber-400 mb-1">stores ({p.stores.length})</div>
                    <ul className="space-y-1 text-neutral-300">
                      {p.stores.map((s) => <li key={s}>· {s}</li>)}
                      {p.stores.length === 0 && <li className="text-neutral-600">— none —</li>}
                    </ul>
                  </div>
                  <div>
                    <div className="text-violet-400 mb-1">apis ({p.apis.length})</div>
                    <ul className="space-y-1 text-neutral-300">
                      {p.apis.map((a) => <li key={a}>· <code>{a}</code></li>)}
                      {p.apis.length === 0 && <li className="text-neutral-600">— none —</li>}
                    </ul>
                  </div>
                </div>
              </details>
            ))}
        </div>
      </section>

      <footer className="mt-12 pt-4 border-t border-neutral-900 text-xs text-neutral-600">
        graph format: <a className="underline" href="https://github.com/brianonbased-dev/HoloScript/tree/main/packages/studio-ui-graph">@holoscript/studio-ui-graph</a>
        {' '}· regenerate: <code className="text-neutral-400">node packages/studio-ui-graph/dist/cli.js</code>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-neutral-800 px-4 py-3 bg-neutral-950/50">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">{label}</div>
    </div>
  );
}

function Bar({ value, max, accent }: { value: number; max: number; accent?: 'amber' | 'violet' }) {
  const pct = Math.max(2, Math.round((value / Math.max(max, 1)) * 100));
  const color = accent === 'amber' ? 'bg-amber-500/40' : accent === 'violet' ? 'bg-violet-500/40' : 'bg-cyan-500/40';
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded bg-neutral-900 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right">{value}</span>
    </div>
  );
}
