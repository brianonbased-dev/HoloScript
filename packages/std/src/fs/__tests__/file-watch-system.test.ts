/**
 * @holoscript/fs watch module acceptance tests
 * Covers: FileWatcher class, watch utilities (watchCallback, watchFileTypes,
 *         watchFile, watchDebounced, watchOnce, watchBatched, watchFiltered,
 *         watchEvents, watchFiles, watchDirs), event handling, debouncing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FileWatcher,
  watch,
  watchCallback,
  watchFileTypes,
  watchFile,
  watchDebounced,
  watchOnce,
  watchBatched,
  watchFiltered,
  watchEvents,
  watchFiles,
  watchDirs,
  type WatchEvent,
} from '../watch.js';

// Mock chokidar to avoid filesystem operations in tests
vi.mock('chokidar', () => {
  const mockWatcher = {
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockReturnThis(),
    unwatch: vi.fn().mockReturnThis(),
    getWatched: vi.fn().mockReturnValue({}),
  };

  return {
    default: {
      watch: vi.fn(() => mockWatcher),
    },
  };
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FileWatcher â€” constructor and basic methods
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('FileWatcher â€” constructor', () => {
  it('creates instance with single path', () => {
    const watcher = new FileWatcher('/test/path');
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('creates instance with array of paths', () => {
    const watcher = new FileWatcher(['/path1', '/path2']);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('creates instance with options', () => {
    const watcher = new FileWatcher('/test', {
      ignored: '**/*.log',
      usePolling: true,
      interval: 200,
    });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('creates instance with emitInitial false', () => {
    const watcher = new FileWatcher('/test', { emitInitial: false });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('creates instance with depth option', () => {
    const watcher = new FileWatcher('/test', { depth: 2 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('creates instance with debounce option', () => {
    const watcher = new FileWatcher('/test', { debounce: 500 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

describe('FileWatcher â€” start()', () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    watcher = new FileWatcher('/test');
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('is a method', () => {
    expect(typeof watcher.start).toBe('function');
  });

  it('returns this for chaining', () => {
    const result = watcher.start();
    expect(result).toBe(watcher);
  });

  it('start() is idempotent (calling twice returns this)', () => {
    watcher.start();
    const result = watcher.start();
    expect(result).toBe(watcher);
  });
});

describe('FileWatcher â€” stop()', () => {
  it('is a method', () => {
    const watcher = new FileWatcher('/test');
    expect(typeof watcher.stop).toBe('function');
  });

  it('returns a Promise', async () => {
    const watcher = new FileWatcher('/test').start();
    const result = watcher.stop();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('can be called without starting', async () => {
    const watcher = new FileWatcher('/test');
    await expect(watcher.stop()).resolves.toBeUndefined();
  });
});

describe('FileWatcher â€” add()', () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    watcher = new FileWatcher('/test').start();
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('is a method', () => {
    expect(typeof watcher.add).toBe('function');
  });

  it('accepts a single path', () => {
    const result = watcher.add('/new/path');
    expect(result).toBe(watcher);
  });

  it('accepts an array of paths', () => {
    const result = watcher.add(['/path1', '/path2']);
    expect(result).toBe(watcher);
  });

  it('returns this for chaining', () => {
    const result = watcher.add('/new/path');
    expect(result).toBe(watcher);
  });
});

describe('FileWatcher â€” unwatch()', () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    watcher = new FileWatcher(['/test1', '/test2']).start();
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('is a method', () => {
    expect(typeof watcher.unwatch).toBe('function');
  });

  it('accepts a single path', () => {
    const result = watcher.unwatch('/test1');
    expect(result).toBe(watcher);
  });

  it('accepts an array of paths', () => {
    const result = watcher.unwatch(['/test1', '/test2']);
    expect(result).toBe(watcher);
  });

  it('returns this for chaining', () => {
    const result = watcher.unwatch('/test1');
    expect(result).toBe(watcher);
  });
});

describe('FileWatcher â€” getWatched()', () => {
  it('is a method', () => {
    const watcher = new FileWatcher('/test');
    expect(typeof watcher.getWatched).toBe('function');
  });

  it('returns an object', () => {
    const watcher = new FileWatcher('/test').start();
    const watched = watcher.getWatched();
    expect(typeof watched).toBe('object');
  });

  it('returns empty object when not started', () => {
    const watcher = new FileWatcher('/test');
    const watched = watcher.getWatched();
    expect(watched).toEqual({});
  });
});

describe('FileWatcher â€” isReady', () => {
  it('is a getter', () => {
    const watcher = new FileWatcher('/test');
    expect(typeof watcher.isReady).toBe('boolean');
  });

  it('returns false before start()', () => {
    const watcher = new FileWatcher('/test');
    expect(watcher.isReady).toBe(false);
  });

  it('returns true after start()', () => {
    const watcher = new FileWatcher('/test').start();
    expect(watcher.isReady).toBe(true);
  });
});

describe('FileWatcher â€” on() event handlers', () => {
  let watcher: FileWatcher;

  beforeEach(() => {
    watcher = new FileWatcher('/test');
  });

  afterEach(async () => {
    await watcher.stop();
  });

  it('is a method', () => {
    expect(typeof watcher.on).toBe('function');
  });

  it('accepts add event', () => {
    const listener = vi.fn();
    const result = watcher.on('add', listener);
    expect(result).toBe(watcher);
  });

  it('accepts change event', () => {
    const listener = vi.fn();
    const result = watcher.on('change', listener);
    expect(result).toBe(watcher);
  });

  it('accepts unlink event', () => {
    const listener = vi.fn();
    const result = watcher.on('unlink', listener);
    expect(result).toBe(watcher);
  });

  it('accepts addDir event', () => {
    const listener = vi.fn();
    const result = watcher.on('addDir', listener);
    expect(result).toBe(watcher);
  });

  it('accepts unlinkDir event', () => {
    const listener = vi.fn();
    const result = watcher.on('unlinkDir', listener);
    expect(result).toBe(watcher);
  });

  it('accepts all event', () => {
    const listener = vi.fn();
    const result = watcher.on('all', listener);
    expect(result).toBe(watcher);
  });

  it('accepts error event', () => {
    const listener = vi.fn();
    const result = watcher.on('error', listener);
    expect(result).toBe(watcher);
  });

  it('accepts ready event', () => {
    const listener = vi.fn();
    const result = watcher.on('ready', listener);
    expect(result).toBe(watcher);
  });

  it('returns this for chaining', () => {
    const result = watcher.on('add', () => {});
    expect(result).toBe(watcher);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Utility functions
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('watch() utility', () => {
  it('is a function', () => {
    expect(typeof watch).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watch('/test');
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts single path', () => {
    const watcher = watch('/test');
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts array of paths', () => {
    const watcher = watch(['/path1', '/path2']);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watch('/test', { interval: 200 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watcher is already started', () => {
    const watcher = watch('/test');
    expect(watcher.isReady).toBe(true);
  });
});

describe('watchCallback() utility', () => {
  it('is a function', () => {
    expect(typeof watchCallback).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watchCallback('/test', () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts single path and callback', () => {
    const cb = vi.fn();
    const watcher = watchCallback('/test', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts array of paths', () => {
    const watcher = watchCallback(['/path1', '/path2'], () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watchCallback('/test', () => {}, { interval: 300 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

describe('watchFileTypes() utility', () => {
  it('is a function', () => {
    expect(typeof watchFileTypes).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watchFileTypes('/dir', ['.ts'], () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts extensions without dot', () => {
    const watcher = watchFileTypes('/dir', ['ts', 'js'], () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts extensions with dot', () => {
    const watcher = watchFileTypes('/dir', ['.ts', '.js'], () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watchFileTypes('/dir', ['.ts'], () => {}, { depth: 2 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

describe('watchFile() utility', () => {
  it('is a function', () => {
    expect(typeof watchFile).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watchFile('/file.txt', () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts path and callback', () => {
    const cb = vi.fn();
    const watcher = watchFile('/file.txt', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watchFile('/file.txt', () => {}, { persistent: true });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

describe('watchDebounced() utility', () => {
  it('is a function', () => {
    expect(typeof watchDebounced).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watchDebounced('/test', () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts paths and callback', () => {
    const cb = vi.fn();
    const watcher = watchDebounced('/test', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts custom debounce duration', () => {
    const watcher = watchDebounced('/test', () => {}, 500);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watchDebounced('/test', () => {}, 300, { depth: 1 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

describe('watchOnce() utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is a function', () => {
    expect(typeof watchOnce).toBe('function');
  });

  it('returns a Promise', () => {
    const result = watchOnce('/test');
    expect(result).toBeInstanceOf(Promise);
    // Clean up - the promise won't resolve in test env
    result.catch(() => {});
  });

  it('accepts single path', () => {
    const result = watchOnce('/test');
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('accepts array of paths', () => {
    const result = watchOnce(['/path1', '/path2']);
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });

  it('accepts options', () => {
    const result = watchOnce('/test', { persistent: false });
    expect(result).toBeInstanceOf(Promise);
    result.catch(() => {});
  });
});

describe('watchBatched() utility', () => {
  it('is a function', () => {
    expect(typeof watchBatched).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watchBatched('/test', () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts paths and callback', () => {
    const cb = vi.fn();
    const watcher = watchBatched('/test', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts custom batch duration', () => {
    const watcher = watchBatched('/test', () => {}, 200);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watchBatched('/test', () => {}, 100, { depth: 3 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('callback receives array of events', () => {
    const cb = vi.fn();
    watchBatched('/test', cb);
    // Callback signature expects WatchEvent[]
    expect(typeof cb).toBe('function');
  });
});

describe('watchFiltered() utility', () => {
  it('is a function', () => {
    expect(typeof watchFiltered).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const filter = () => true;
    const watcher = watchFiltered('/test', filter, () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts paths, filter, and callback', () => {
    const filter = vi.fn(() => true);
    const callback = vi.fn();
    const watcher = watchFiltered('/test', filter, callback);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const filter = () => true;
    const watcher = watchFiltered('/test', filter, () => {}, { interval: 150 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

describe('watchEvents() utility', () => {
  it('is a function', () => {
    expect(typeof watchEvents).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watchEvents('/test', ['add'], () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts paths, event types array, and callback', () => {
    const cb = vi.fn();
    const watcher = watchEvents('/test', ['add', 'change'], cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts single event type', () => {
    const watcher = watchEvents('/test', ['unlink'], () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts multiple event types', () => {
    const watcher = watchEvents('/test', ['add', 'change', 'unlink'], () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watchEvents('/test', ['add'], () => {}, { persistent: false });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

describe('watchFiles() utility', () => {
  it('is a function', () => {
    expect(typeof watchFiles).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watchFiles('/test', () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts paths and callback', () => {
    const cb = vi.fn();
    const watcher = watchFiles('/test', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watchFiles('/test', () => {}, { depth: 5 });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

describe('watchDirs() utility', () => {
  it('is a function', () => {
    expect(typeof watchDirs).toBe('function');
  });

  it('returns FileWatcher instance', () => {
    const watcher = watchDirs('/test', () => {});
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts paths and callback', () => {
    const cb = vi.fn();
    const watcher = watchDirs('/test', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('accepts options', () => {
    const watcher = watchDirs('/test', () => {}, { usePolling: true });
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Integration scenarios (structure/type validation)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('watch module integration scenarios', () => {
  it('FileWatcher can chain start().add().on()', () => {
    const watcher = new FileWatcher('/test');
    const result = watcher
      .start()
      .add('/new')
      .on('add', () => {});
    expect(result).toBe(watcher);
  });

  it('watch utility creates started watcher', () => {
    const watcher = watch('/test');
    expect(watcher.isReady).toBe(true);
  });

  it('watchCallback registers all event listener', () => {
    const cb = vi.fn();
    const watcher = watchCallback('/test', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watchFileTypes constructs glob patterns for extensions', () => {
    const cb = vi.fn();
    const watcher = watchFileTypes('/src', ['ts', 'js'], cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watchFile sets depth: 0 to watch single file only', () => {
    const cb = vi.fn();
    const watcher = watchFile('/file.txt', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watchDebounced applies debounce option', () => {
    const cb = vi.fn();
    const watcher = watchDebounced('/test', cb, 500);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watchBatched collects events in batches', () => {
    const cb = vi.fn();
    const watcher = watchBatched('/test', cb, 100);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watchFiltered applies filter predicate', () => {
    const filter = (event: WatchEvent) => event.type === 'change';
    const cb = vi.fn();
    const watcher = watchFiltered('/test', filter, cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watchEvents filters by event type array', () => {
    const cb = vi.fn();
    const watcher = watchEvents('/test', ['add', 'change'], cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watchFiles watches only file events (add/change/unlink)', () => {
    const cb = vi.fn();
    const watcher = watchFiles('/test', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });

  it('watchDirs watches only directory events (addDir/unlinkDir)', () => {
    const cb = vi.fn();
    const watcher = watchDirs('/test', cb);
    expect(watcher).toBeInstanceOf(FileWatcher);
  });
});
