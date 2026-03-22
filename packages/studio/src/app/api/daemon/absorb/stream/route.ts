/**
 * /api/daemon/absorb/stream — SSE Progress Streaming Endpoint
 *
 * Server-Sent Events endpoint for real-time absorb progress updates.
 * Streams progress events as the absorb scan runs, providing:
 *   - Current phase (scanning, analyzing, indexing, complete)
 *   - Progress percentage (0-100)
 *   - Files processed / total files
 *   - Current file being parsed
 *
 * POST { projectPath: string, depth?: 'shallow' | 'medium' | 'deep', force?: boolean }
 * Returns: text/event-stream with JSON events
 *
 * Event types:
 *   - start: { type: 'start', jobId, projectPath }
 *   - progress: { type: 'progress', jobId, phase, filesProcessed, totalFiles, currentFile, progress }
 *   - complete: { type: 'complete', jobId, stats, progress: 100 }
 *   - error: { type: 'error', jobId, error }
 */

import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  let body: { projectPath?: string; depth?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const projectPath = body.projectPath ?? process.cwd();
  const depth = (['shallow', 'medium', 'deep'].includes(body.depth ?? '')
    ? body.depth
    : 'shallow') as 'shallow' | 'medium' | 'deep';
  const force = body.force === true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Enqueue initial start event
        const jobId = `absorb-stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'start',
              jobId,
              projectPath,
              depth,
            })}\n\n`
          )
        );

        // Run absorb with progress callbacks
        const coreCb = await import(/* webpackIgnore: true */ '@holoscript/core/codebase');
        const { CodebaseScanner, CodebaseGraph, GitChangeDetector } = coreCb;

        // Phase 1: Discovering files
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'progress',
              jobId,
              phase: 'discovering',
              progress: 5,
            })}\n\n`
          )
        );

        const scanner = new CodebaseScanner();

        // Phase 2: Scanning files
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'progress',
              jobId,
              phase: 'scanning',
              progress: 10,
            })}\n\n`
          )
        );

        const scanResult = await scanner.scan({
          rootDir: projectPath,
          depth,
          onProgress: (processed: number, total: number, file: string) => {
            const scanPercent = Math.floor((processed / total) * 50) + 10; // 10-60%
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'progress',
                  jobId,
                  phase: 'scanning',
                  filesProcessed: processed,
                  totalFiles: total,
                  currentFile: file,
                  progress: scanPercent,
                })}\n\n`
              )
            );
          },
        });

        // Phase 3: Building graph
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'progress',
              jobId,
              phase: 'analyzing',
              progress: 65,
            })}\n\n`
          )
        );

        const graph = new CodebaseGraph();
        graph.buildFromScanResult(scanResult);

        // Capture git metadata
        try {
          const detector = new GitChangeDetector(projectPath);
          if (detector.isGitRepo()) {
            const headCommit = detector.getHeadCommit();
            if (headCommit) {
              graph.gitCommitHash = headCommit;
              const filePaths = scanResult.files.map((f: any) => f.path);
              const hashes = detector.computeFileHashes(filePaths);
              graph.fileHashes = Object.fromEntries(hashes.map((h: any) => [h.filePath, h.hash]));
            }
          }
        } catch {
          // Git metadata is optional
        }

        // Phase 4: Creating embeddings
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'progress',
              jobId,
              phase: 'indexing',
              progress: 80,
            })}\n\n`
          )
        );

        const stats = graph.getStats();

        // Phase 5: Complete
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'complete',
              jobId,
              stats,
              progress: 100,
            })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'error',
              jobId: 'unknown',
              error: error instanceof Error ? error.message : String(error),
            })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
