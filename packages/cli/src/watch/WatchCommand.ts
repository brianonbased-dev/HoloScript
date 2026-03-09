/**
 * HoloScript --watch Command
 *
 * Integrates FileWatcher + WatchReporter with the incremental parser.
 * Used by `holoscript build --watch` / `holoscript build -w`.
 */

import { FileWatcher, type ChangeEvent } from './Watcher';
import { WatchReporter } from './Reporter';
import { ChunkBasedIncrementalParser } from '../../core/src/parser/IncrementalParser';

export interface WatchOptions {
  /** Source files/globs to watch */
  include: string[];
  /** Output directory */
  outDir?: string;
  /** Debounce delay ms */
  debounceMs?: number;
  /** Whether to disable ANSI color */
  noColor?: boolean;
  /** Current working directory */
  cwd?: string;
}

/**
 * Run the watch-mode build loop.
 * Returns a stop function.
 */
export async function runWatchMode(options: WatchOptions): Promise<() => Promise<void>> {
  const reporter = new WatchReporter(!options.noColor);
  const parser = new ChunkBasedIncrementalParser();

  const patterns = [...options.include, 'holoscript.config.json', 'holoscript.config.js'];

  const watcher = new FileWatcher({
    patterns,
    ignored: ['**/node_modules/**', '**/.git/**', `**/${options.outDir ?? 'dist'}/**`],
    debounceMs: options.debounceMs ?? 100,
    cwd: options.cwd ?? process.cwd(),
  });

  reporter.watching(patterns);

  watcher.on('change', async (changes: ChangeEvent[]) => {
    for (const change of changes) {
      reporter.changed(change.filePath);

      if (change.type === 'unlink') continue;

      const start = Date.now();
      try {
        const { readFile } = await import('fs/promises');
        const source = await readFile(change.filePath, 'utf-8');
        const result = parser.parse(source);
        const durationMs = Date.now() - start;

        reporter.built({
          file: change.filePath,
          durationMs,
          incremental: result.cached > 0,
        });
      } catch (err: unknown) {
        const durationMs = Date.now() - start;
        reporter.errors({
          file: change.filePath,
          durationMs,
          incremental: false,
          errors: [err instanceof Error ? err.message : String(err)],
        });
      }
    }
  });

  watcher.on('stopped', () => reporter.stopped());
  watcher.on('error', (err: Error) =>
    reporter.errors({ file: '', durationMs: 0, incremental: false, errors: [err.message] })
  );

  await watcher.start();

  return () => watcher.stop();
}
