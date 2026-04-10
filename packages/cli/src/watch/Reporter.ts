/**
 * Watch Mode Reporter
 *
 * Colored terminal output with timestamps for --watch builds.
 */

export interface BuildEvent {
  file: string;
  durationMs: number;
  incremental: boolean;
  errors?: string[];
}

/** Terminal color helpers */
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${C.gray}[${h}:${m}:${s}]${C.reset}`;
}

export class WatchReporter {
  private useColor: boolean;

  constructor(useColor = process.stdout.isTTY ?? true) {
    this.useColor = useColor;
  }

  private c(code: string, text: string): string {
    return this.useColor ? `${code}${text}${C.reset}` : text;
  }

  /** Printed once at start */
  watching(patterns: string[]): void {
    console.log(`\n${timestamp()} ${this.c(C.cyan + C.bold, 'Watching for changes...')}`);
    console.log(`${this.c(C.gray, `  Patterns: ${patterns.join(', ')}`)}\n`);
  }

  /** Printed when a file change is detected */
  changed(filePath: string): void {
    const rel = filePath.replace(process.cwd(), '.').replace(/\\/g, '/');
    console.log(`${timestamp()} ${this.c(C.yellow, `Changed: ${rel}`)}`);
  }

  /** Printed after a successful build */
  built(event: BuildEvent): void {
    const rel = event.file.replace(process.cwd(), '.').replace(/\\/g, '/');
    const inc = event.incremental ? this.c(C.gray, ' (incremental)') : '';
    const dur = this.c(C.green, `${event.durationMs}ms`);
    console.log(`${timestamp()} ${this.c(C.green, `Built ${rel}`)} in ${dur}${inc}`);
  }

  /** Printed when a build produces errors */
  errors(event: BuildEvent): void {
    const rel = event.file.replace(process.cwd(), '.').replace(/\\/g, '/');
    console.log(`${timestamp()} ${this.c(C.red, `Error in ${rel}:`)}`);
    for (const err of event.errors ?? []) {
      console.log(`  ${this.c(C.red, err)}`);
    }
    console.log(`${this.c(C.yellow, '  Watching for fixes...')}\n`);
  }

  /** Printed on Ctrl+C */
  stopped(): void {
    console.log(`\n${timestamp()} ${this.c(C.gray, 'Watcher stopped.')}\n`);
  }
}
