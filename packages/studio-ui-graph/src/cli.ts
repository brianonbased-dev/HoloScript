import { mkdirSync, writeFileSync, readFileSync, existsSync, watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPages } from './routes.js';
import { TreeBuilder } from './tree.js';
import { emitHolo, type PageGraph } from './emit.js';
import { emitMermaid } from './mermaid.js';
import { publishHolo } from './publish.js';

type Format = 'holo' | 'mermaid';
type Subcommand = 'generate' | 'publish';

interface ParsedArgs {
  subcommand?: Subcommand;
  studioRoot?: string;
  output?: string;
  format?: Format;
  watch?: boolean;
  publishEndpoint?: string;
  publishWorkspace?: string;
  publishApiKey?: string;
  publishDryRun?: boolean;
  showHelp?: boolean;
  showVersion?: boolean;
  quiet?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!out.subcommand && (a === 'generate' || a === 'publish')) out.subcommand = a;
    else if (a === '--root' || a === '-r') out.studioRoot = argv[++i];
    else if (a === '--output' || a === '-o') out.output = argv[++i];
    else if (a === '--format' || a === '-f') {
      const v = argv[++i];
      if (v !== 'holo' && v !== 'mermaid') {
        process.stderr.write(`error: --format must be 'holo' or 'mermaid' (got ${v})\n`);
        process.exit(2);
      }
      out.format = v;
    }
    else if (a === '--watch' || a === '-w') out.watch = true;
    else if (a === '--endpoint') out.publishEndpoint = argv[++i];
    else if (a === '--workspace') out.publishWorkspace = argv[++i];
    else if (a === '--api-key') out.publishApiKey = argv[++i];
    else if (a === '--dry-run') out.publishDryRun = true;
    else if (a === '--quiet' || a === '-q') out.quiet = true;
    else if (a === '--version' || a === '-v') out.showVersion = true;
    else if (a === '--help' || a === '-h') out.showHelp = true;
  }
  return out;
}

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function findRepoRoot(start: string): string {
  let dir = resolve(start);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = dirname(dir);
  }
  return resolve(start);
}

function printHelp(): void {
  process.stdout.write(`@holoscript/studio-ui-graph v${readVersion()}

Walk a Studio src tree, follow JSX imports rooted at every page.tsx, and emit
an agent-readable scene representation of the UI page/component graph.
Detects component trees, Zustand stores, and API/SSE endpoints. Follows
dynamic() and React.lazy() code-split boundaries.

usage:
  holoscript-studio-ui-graph                                          # alias for 'generate'
  holoscript-studio-ui-graph generate --root packages/studio
  holoscript-studio-ui-graph generate --format mermaid
  holoscript-studio-ui-graph generate --watch
  holoscript-studio-ui-graph publish                                  # POST .holo to mesh knowledge store
  holoscript-studio-ui-graph publish --dry-run

generate flags:
  -r, --root <path>      Studio package root (default: packages/studio)
  -o, --output <path>    output path (default: <root>/.holo/studio.ui.<ext>)
  -f, --format <fmt>     'holo' (default) or 'mermaid'
  -w, --watch            regenerate on src/** change (debounced 300ms)

publish flags (v1.0 — POST to MCP orchestrator's /knowledge/sync):
      --endpoint <url>   knowledge-store sync URL (default: production orchestrator)
      --workspace <id>   workspace id (default: 'ai-ecosystem')
      --api-key <key>    auth (default: \$HOLOSCRIPT_API_KEY or \$MCP_API_KEY)
      --dry-run          show payload that would be sent, don't POST

common flags:
  -q, --quiet            suppress progress output
  -v, --version
  -h, --help
`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.showVersion) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (args.showHelp) {
    printHelp();
    return 0;
  }

  const repoRoot = findRepoRoot(process.cwd());
  const studioRoot = resolve(repoRoot, args.studioRoot ?? 'packages/studio');

  // v1.0: 'publish' subcommand — POST current .holo to mesh knowledge store
  if (args.subcommand === 'publish') {
    const log = (msg: string) => { if (!args.quiet) process.stderr.write(msg); };
    const holoPath = resolve(repoRoot, args.output ?? join(studioRoot, '.holo', 'studio.ui.holo'));
    if (!existsSync(holoPath)) {
      process.stderr.write(`error: ${holoPath} not found — run 'generate' first\n`);
      return 2;
    }
    log(`publishing ${holoPath}\n`);
    try {
      const result = await publishHolo({
        holoPath,
        endpoint: args.publishEndpoint,
        workspaceId: args.publishWorkspace,
        apiKey: args.publishApiKey,
        dryRun: args.publishDryRun,
      });
      log(`  endpoint: ${result.endpoint}\n`);
      log(`  entry id: ${result.entryId}\n`);
      log(`  content:  ${result.contentBytes} bytes (sha256:${result.contentSha256})\n`);
      if (args.publishDryRun) {
        log(`  ${result.responseBody}\n`);
        return 0;
      }
      log(`  status:   HTTP ${result.status} ${result.ok ? 'OK' : 'FAILED'}\n`);
      log(`  response: ${result.responseBody.slice(0, 400)}\n`);
      return result.ok ? 0 : 1;
    } catch (err) {
      process.stderr.write(`publish error: ${(err as Error).message}\n`);
      return 1;
    }
  }

  const appRoot = join(studioRoot, 'src', 'app');
  if (!existsSync(appRoot)) {
    process.stderr.write(`error: ${appRoot} not found — pass --root to point at a Studio package\n`);
    return 2;
  }
  const format: Format = args.format ?? 'holo';
  const defaultOutput = join(studioRoot, '.holo', format === 'mermaid' ? 'studio.ui.mmd' : 'studio.ui.holo');
  const output = resolve(repoRoot, args.output ?? defaultOutput);
  const log = (msg: string) => { if (!args.quiet) process.stderr.write(msg); };

  const generate = () => generateOnce({ appRoot, studioRoot, repoRoot, output, format, log, quiet: args.quiet });

  generate();
  if (!args.watch) return 0;

  // v0.5: --watch mode. fs.watch with recursive on src/, debounced so a single
  // editor save doesn't trigger a regeneration storm. Only fires on .ts/.tsx
  // changes — ignores everything else (.holo output, .next cache, etc.)
  const srcDir = join(studioRoot, 'src');
  log(`watching ${srcDir} for .ts/.tsx changes (Ctrl+C to stop)\n`);
  let timer: NodeJS.Timeout | null = null;
  const debounce = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      log(`change detected — regenerating...\n`);
      generate();
    }, 300);
  };
  watch(srcDir, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const f = filename.toString();
    if (f.endsWith('.ts') || f.endsWith('.tsx')) debounce();
  });
  return new Promise<number>(() => { /* run forever */ });
}

interface GenerateContext {
  appRoot: string;
  studioRoot: string;
  repoRoot: string;
  output: string;
  format: Format;
  log: (msg: string) => void;
  quiet: boolean | undefined;
}

function generateOnce(ctx: GenerateContext): void {
  const { appRoot, studioRoot, repoRoot, output, format, log, quiet } = ctx;
  log(`studio-ui-graph: scanning ${appRoot}\n`);
  const pages = findPages(appRoot, repoRoot);
  log(`  found ${pages.length} pages\n`);

  const builder = new TreeBuilder({
    repoRoot,
    aliases: { '@/': join(studioRoot, 'src') + '/' },
    maxDepth: 6,
  });

  const graphs: PageGraph[] = [];
  let i = 0;
  for (const page of pages) {
    i++;
    if (!quiet && (i === 1 || i % 10 === 0 || i === pages.length)) {
      log(`  [${i}/${pages.length}] ${page.route}\n`);
    }
    const tree = builder.buildPageTree(page.abs);
    graphs.push({ page, tree });
  }

  const uniqueComponents = countUnique(graphs);
  const content = format === 'mermaid'
    ? emitMermaid(graphs)
    : emitHolo(graphs, {
        generatedAt: new Date().toISOString(),
        studioRoot: 'packages/studio',
        pageCount: pages.length,
        uniqueComponentCount: uniqueComponents,
        source: 'studio-ui-graph v0.6',
      });

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, content);
  log(`  wrote ${output} (${content.length} bytes, ${uniqueComponents} unique components, format=${format})\n`);
}

function countUnique(graphs: PageGraph[]): number {
  const set = new Set<string>();
  function walk(node: { name: string; children: { name: string; children: unknown[] }[] }): void {
    set.add(node.name);
    for (const c of node.children) walk(c as { name: string; children: { name: string; children: unknown[] }[] });
  }
  for (const g of graphs) walk(g.tree);
  return set.size;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`fatal: ${(err as Error).stack ?? String(err)}\n`);
    process.exit(1);
  },
);
