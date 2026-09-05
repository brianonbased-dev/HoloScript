/**
 * Fold one browser_session observe extract into the existing holo_absorb_repo
 * sourceFiles path. Kept outside codebase-tools.ts so the caller can be tested
 * without loading the full absorb scan pipeline.
 */

import {
  hasObservedPageExtractInput,
  ingestObservedPage,
  type IngestObservedPageResult,
  type ObservedPageExtractInput,
} from '../ingest/ingestObservedPage';
import { setKnowledgeExtractionGraph } from './knowledge-extraction-tools';

export interface AbsorbPageExtractReceipt {
  kind: IngestObservedPageResult['kind'];
  url: string;
  title: string;
  charCount: number;
  sha256: string;
  source: IngestObservedPageResult['extract']['source'];
  fetched: boolean;
  sourceFiles: string[];
  formatId: string;
  holoPartial: boolean;
}

export function absorbArgsHavePageExtract(args: Record<string, unknown>): boolean {
  return hasObservedPageExtractInput(pageExtractInputFromAbsorbArgs(args));
}

export async function foldObservedPageIntoAbsorbArgs(
  args: Record<string, unknown>
): Promise<
  | { ok: true; args: Record<string, unknown>; pageExtract?: AbsorbPageExtractReceipt }
  | { ok: false; error: string; message: string }
> {
  const pageExtractInput = pageExtractInputFromAbsorbArgs(args);
  if (!hasObservedPageExtractInput(pageExtractInput)) {
    return { ok: true, args };
  }

  const hasRepoInput =
    (typeof args.rootDir === 'string' && args.rootDir.trim().length > 0) ||
    (Array.isArray(args.rootDirs) && args.rootDirs.length > 0) ||
    (Array.isArray(args.sourceFiles) && args.sourceFiles.length > 0) ||
    args.localCodebaseSnapshotReceipt != null ||
    args.snapshotReceipt != null;
  if (hasRepoInput) {
    return {
      ok: false,
      error: 'page_extract_exclusive',
      message:
        'Page extract (observe/markdown/bodyText/url) is exclusive with rootDir, sourceFiles, and snapshot receipts. Absorb one observed page or one repo, not both.',
    };
  }

  try {
    const ingested = await ingestObservedPage(pageExtractInput);
    setKnowledgeExtractionGraph(ingested.graph);
    return {
      ok: true,
      args: {
        ...args,
        sourceFiles: ingested.sourceFiles,
      },
      pageExtract: {
        kind: ingested.kind,
        url: ingested.extract.url,
        title: ingested.extract.title,
        charCount: ingested.extract.charCount,
        sha256: ingested.extract.sha256,
        source: ingested.extract.source,
        fetched: ingested.extract.fetched,
        sourceFiles: ingested.sourceFiles.map((file) => file.path),
        formatId: ingested.document.formatId,
        holoPartial: ingested.holo.partial,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: 'page_extract_failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function pageExtractInputFromAbsorbArgs(args: Record<string, unknown>): ObservedPageExtractInput {
  return {
    observe: args.observe,
    pageExtract: args.pageExtract,
    markdown: typeof args.markdown === 'string' ? args.markdown : undefined,
    bodyText: typeof args.bodyText === 'string' ? args.bodyText : undefined,
    url: typeof args.url === 'string' ? args.url : undefined,
    title: typeof args.title === 'string' ? args.title : undefined,
  };
}
