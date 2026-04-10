# @holoscript/fs

File system library for HoloScript Plus.

## Installation

```bash
npm install @holoscript/fs
```

## Entry Points

| Import                 | Description       |
| ---------------------- | ----------------- |
| `@holoscript/fs`       | All utilities     |
| `@holoscript/fs/path`  | Path manipulation |
| `@holoscript/fs/watch` | File watching     |

## File Operations

```typescript
import {
  readText,
  writeText,
  readJson,
  writeJson,
  exists,
  mkdir,
  copy,
  move,
  remove,
} from '@holoscript/fs';

// Read & write
const code = await readText('scene.holo');
await writeText('output.js', compiled);

// JSON
const config = await readJson<Config>('holoscript.config.json');
await writeJson('stats.json', metrics, { pretty: true });

// Lines
const lines = await readLines('scene.holo');
await appendLine('log.txt', 'build complete');

// File operations
await ensureDir('dist/');
await copy('src/', 'backup/', { recursive: true });
await move('old.holo', 'new.holo');
await remove('temp/', true);
```

All read/write functions have sync variants (`readTextSync`, `writeTextSync`, etc.).

### Directory Traversal

```typescript
import { walk, glob, listFiles, listDirs, readDir } from '@holoscript/fs';

// Glob matching
const holoFiles = await glob('src/**/*.holo');

// Recursive walk (async generator)
for await (const entry of walk('src/')) {
  console.log(entry.name, entry.isFile);
}

// List contents
const files = await listFiles('src/');
const dirs = await listDirs('packages/');
```

### Temporary Files

```typescript
import { createTempFile, createTempDir } from '@holoscript/fs';

const { path, cleanup } = await createTempFile('hs-', '.holo');
await writeText(path, code);
// ... use temp file ...
cleanup();
```

### Size Utilities

```typescript
import { fileSize, dirSize, formatSize } from '@holoscript/fs';

const bytes = await fileSize('scene.holo');
const total = await dirSize('dist/');
console.log(formatSize(total)); // "1.5 MB"
```

## Path Utilities

```typescript
import {
  join,
  resolve,
  relative,
  dirname,
  basename,
  extname,
  normalize,
} from '@holoscript/fs/path';

join('src', 'scenes', 'lobby.holo');
dirname('/project/src/scene.holo'); // '/project/src'
extname('scene.holo'); // '.holo'
```

### PathBuilder

Fluent API for path construction:

```typescript
import { path } from '@holoscript/fs/path';

const out = path('src').join('scenes', 'lobby.holo').withExtension('.js').toString();
// 'src/scenes/lobby.js'

path.cwd().join('dist').sibling('build').value;
```

### Additional Path Functions

```typescript
import {
  toPosix,
  toWindows,
  hasExtension,
  changeExtension,
  segments,
  isChildOf,
  commonBase,
  expandHome,
  sanitize,
} from '@holoscript/fs/path';

toPosix('src\\scenes\\file.holo'); // 'src/scenes/file.holo'
hasExtension('scene.holo', '.holo'); // true
changeExtension('scene.holo', '.js'); // 'scene.js'
segments('src/scenes/lobby.holo'); // ['src', 'scenes', 'lobby.holo']
commonBase('src/a.holo', 'src/b.holo'); // 'src'
sanitize('my:file?.holo'); // 'myfile.holo'
```

## File Watching

Built on [chokidar](https://github.com/paulmillr/chokidar):

```typescript
import {
  watch,
  watchCallback,
  watchFile,
  watchFileTypes,
  watchDebounced,
} from '@holoscript/fs/watch';

// Basic watcher
const watcher = watch('src/', { ignored: ['**/node_modules/**'] });
watcher.on('change', (event) => console.log('changed:', event.path));
watcher.on('ready', () => console.log('watching...'));

// Callback-based
watchCallback('src/**/*.holo', (event) => {
  if (event.type === 'change') rebuild(event.path);
});

// Watch specific file types
watchFileTypes('src/', ['.holo', '.hsplus'], (event) => {
  console.log(`${event.type}: ${event.path}`);
});

// Debounced (batch rapid changes)
watchDebounced('src/', (event) => rebuild(), 300);

// One-shot (wait for first change)
const event = await watchOnce('config.json');
```

### FileWatcher Class

```typescript
import { FileWatcher } from '@holoscript/fs/watch';

const watcher = new FileWatcher(['src/', 'examples/'], {
  depth: 3,
  usePolling: false,
  debounce: 100,
});

watcher.start();
watcher.on('all', (event) => console.log(event.type, event.path));
watcher.add('tests/');
await watcher.stop();
```

## Platform Utilities

```typescript
import { cwd, homeDir, isWindows, isMacOS, isLinux } from '@holoscript/fs';
```

## License

MIT
