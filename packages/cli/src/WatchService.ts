import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';

export interface WatchOptions {
  input: string;
  onChanged: () => Promise<void>;
  onChangedIncremental?: (filePath: string) => Promise<void>;
  verbose?: boolean;
  useIncremental?: boolean;
  debounceMs?: number;
}

export class WatchService {
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs: number;
  private fileContentCache: Map<string, string> = new Map();

  constructor(private options: WatchOptions) {
    this.debounceMs = options.debounceMs || 200;
  }

  /**
   * Starts watching the input file or directory
   */
  public async start(): Promise<void> {
    const inputPath = path.resolve(this.options.input);

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Watch input path not found: ${inputPath}`);
    }

    console.log(`\n\x1b[36mWatching for changes in ${this.options.input}...\x1b[0m`);
    console.log('\x1b[2mPress Ctrl+C to stop\x1b[0m\n');

    this.watcher = chokidar.watch(inputPath, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('all', (event, filePath) => {
      if (this.options.verbose) {
        console.log(`\x1b[2m[WATCH] ${event}: ${path.relative(process.cwd(), filePath)}\x1b[0m`);
      }
      this.triggerRebuild(filePath);
    });

    // Handle initial run if needed (constructor or manual start)
    await this.options.onChanged();
  }

  /**
   * Stops the watcher
   */
  public async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private triggerRebuild(changedFile: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`\x1b[2m[${timestamp}]\x1b[0m File changed, rebuilding...`);

      try {
        // Try incremental build if available
        if (this.options.useIncremental && this.options.onChangedIncremental) {
          try {
            await this.options.onChangedIncremental(changedFile);
            console.log(
              `\x1b[2m[${timestamp}]\x1b[0m \x1b[32mBuild successful (incremental)\x1b[0m`
            );
            return;
          } catch (_error) {
            // Fall back to full rebuild on incremental error
            if (this.options.verbose) {
              console.warn(`\x1b[33mIncremental build failed, falling back to full rebuild\x1b[0m`);
            }
          }
        }

        // Fall back to full rebuild
        await this.options.onChanged();
        console.log(`\x1b[2m[${timestamp}]\x1b[0m \x1b[32mBuild successful\x1b[0m`);
      } catch (error) {
        console.error(`\x1b[31m[${timestamp}] Build failed: ${(error as Error).message}\x1b[0m`);
      }
    }, this.debounceMs);
  }
}
