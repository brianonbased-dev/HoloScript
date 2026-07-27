# @holoscript/std

HoloScript Standard Library - Core types and utilities.

## Installation

```bash
npm install @holoscript/std
```

## Entry Points

| Import                                    | Description                            |
| ----------------------------------------- | -------------------------------------- |
| `@holoscript/std`                         | All utilities                          |
| `@holoscript/std/math`                    | Math & vector operations               |
| `@holoscript/std/collections`             | Immutable collections                  |
| `@holoscript/std/string`                  | String manipulation                    |
| `@holoscript/std/time`                    | Timers & scheduling                    |
| `@holoscript/std/native/abi/scalar-v1.hs` | Executable cross-target i32 scalar ABI |
| `@holoscript/std/native/abi/vector-v1.hs` | Executable cross-target i32 Vec3 ABI   |

## Core Types

Spatial and graphical primitives used throughout HoloScript:

```typescript
import { vec3, quat, rgb, transform, aabb, ray } from '@holoscript/std';

const position = vec3(0, 1, -2);
const rotation = quat(0, 0, 0, 1);
const color = rgb(0.2, 0.5, 1.0);
const t = transform(position, rotation, vec3(1, 1, 1));
const bounds = aabb(vec3(-1, -1, -1), vec3(1, 1, 1));
```

**Type definitions:** `Vec2`, `Vec3`, `Vec4`, `Quat`, `Transform`, `EulerAngles`, `ColorRGB`, `ColorRGBA`, `ColorHSL`, `AABB`, `BoundingSphere`, `Ray`, `RaycastHit`

**Utility types:** `Nullable<T>`, `Optional<T>`, `DeepPartial<T>`

## Math

```typescript
import {
  lerp,
  clamp,
  remap,
  smoothstep,
  vec3Math,
  quatMath,
  noise,
  random,
} from '@holoscript/std/math';

// Interpolation
lerp(0, 100, 0.5); // 50
remap(0.5, 0, 1, -10, 10); // 0
smoothstep(0, 1, 0.3);

// Vector math
const forward = vec3Math.forward(); // { x: 0, y: 0, z: 1 }
const dir = vec3Math.normalize(vec3Math.sub(target, origin));
const d = vec3Math.distance(a, b);

// Quaternion math
const q = quatMath.fromEuler({ pitch: 0, yaw: 90, roll: 0 });
const rotated = quatMath.rotateVec3(q, forward);

// Noise
noise.perlin2d(x, y);
noise.fbm(x, y, z, 4, 2.0, 0.5);
noise.worley(x, y, z);

// Random
random.range(1, 10);
random.insideUnitSphere();
const rng = random.seeded(42);
```

**Constants:** `PI`, `TAU`, `HALF_PI`, `DEG_TO_RAD`, `RAD_TO_DEG`, `EPSILON`

**Additional:** `vec2Math`, `aabbMath` (contains/intersects/merge)

## Collections

Immutable, functional collection classes:

```typescript
import { List, HoloMap, HoloSet, SpatialGrid, PriorityQueue } from '@holoscript/std/collections';

// List - immutable array with rich API
const items = List.of(3, 1, 4, 1, 5);
items
  .sort()
  .unique()
  .map((x) => x * 2)
  .filter((x) => x > 4);
items.groupBy((x) => (x % 2 === 0 ? 'even' : 'odd'));
List.range(0, 100, 5); // [0, 5, 10, ..., 95]

// HoloMap - immutable key-value store
const scores = HoloMap.of(['alice', 100], ['bob', 85]);
scores.set('carol', 92).filter((k, v) => v > 90);

// HoloSet - immutable set with set operations
const a = HoloSet.of(1, 2, 3);
const b = HoloSet.of(2, 3, 4);
a.union(b); // {1, 2, 3, 4}
a.intersection(b); // {2, 3}

// SpatialGrid - spatial partitioning
const grid = new SpatialGrid(10);
grid.insert(vec3(5, 0, 5), entity);
const nearby = grid.query(vec3(6, 0, 6), 15);

// PriorityQueue
const pq = PriorityQueue.minHeap();
pq.enqueue('urgent', 1);
pq.enqueue('later', 10);
pq.dequeue(); // 'urgent'
```

## String

80+ string utilities:

```typescript
import { camelCase, slugify, truncate, levenshtein, format, uuid } from '@holoscript/std/string';

camelCase('hello-world'); // 'helloWorld'
slugify('Hello World!'); // 'hello-world'
truncate('long text...', 8); // 'long ...'
levenshtein('kitten', 'sitting'); // 3
format('{name} has {n} items', { name: 'Alice', n: 5 });
uuid(); // 'a1b2c3d4-...'
```

**Categories:** case conversion, padding/truncation, validation (`isBlank`, `isNumeric`), encoding (`escapeHtml`, `escapeRegex`), formatting (`formatBytes`, `formatDuration`), splitting (`lines`, `words`)

## Time

Timers, scheduling, and async control:

```typescript
import {
  sleep,
  debounce,
  throttle,
  measure,
  retry,
  Stopwatch,
  CountdownTimer,
  FrameTimer,
  dateTime,
} from '@holoscript/std/time';

await sleep(1000);
const elapsed = await measure(async () => {
  /* work */
});

const sw = new Stopwatch();
sw.start();
// ... work ...
sw.lap();
console.log(sw.elapsed);

const countdown = new CountdownTimer(60000, {
  onTick: (remaining) => updateUI(remaining),
  onComplete: () => console.log('done!'),
});
countdown.start();

const frame = new FrameTimer();
function loop() {
  frame.update();
  console.log(frame.delta, frame.currentFps);
  requestAnimationFrame(loop);
}

await retry(fetchData, { maxRetries: 3, baseDelay: 1000 });

dateTime.format(new Date(), 'YYYY-MM-DD HH:mm');
```

## General Utilities

```typescript
import { assert, clone, equals, pipe, compose } from '@holoscript/std';

assert(x > 0, 'x must be positive');
const copy = clone(deepObject);
equals({ a: 1 }, { a: 1 }); // true
pipe(5, double, addOne, toString); // '11'
```

## Package boundary & release posture

`@holoscript/std` is a **v0-preview** standard library for external, public, and agent-framework consumers building HoloScript-adjacent tooling — it is a pure utility library, not a service. Every function is caller-owned: you pass in your own vectors, collections, strings, and timers, and the library holds no ambient state, network calls, or credentials of its own.

`@holoscript/std/fs` is the one boundary-sensitive entry point: filesystem helpers pass through to the host filesystem by default and do not ship any sandboxing unless the caller opts in. Path-boundary enforcement is disabled by default (a no-op, matching pre-existing call sites) and only activates when the operator sets the `HOLOSCRIPT_FS_SANDBOX_ROOT` environment variable — this package does not ship a default sandbox root, and it is not the package default to restrict paths.

### Native executable ABI

`@holoscript/std/native/abi/scalar-v1.hs` is the first executable cross-target standard-library ABI. Its contract ID is `hs.std.scalar.i32.v1`, and it exports `std_math_clamp_i32`, `std_math_sign_i32`, and `std_math_step_i32`.

`@holoscript/std/native/abi/vector-v1.hs` now carries both `hs.std.vector.i32.v1` compatibility entrypoints and the `hs.std.vector.aggregate.i32.v1` value contract. `StdVec3I32{x:i32,y:i32,z:i32}` crosses calls and returns as one affine flat-POD value under `hs.aggregate.value.v1`; the compatibility functions construct, move, and project those values internally. Nested records, owned buffers, and mutable or borrowed aggregate transfer are deliberately rejected by this first contract.

`@holoscript/std/uaal-abi` is the packaged UAAL host adapter for the numeric binary contracts and `hs.aggregate.value.v1`. Aggregate construction produces frozen record envelopes, while projection verifies the semantic layout, field index, and scalar type before pushing a value.

`@holoscript/std/native/abi/scalar-f32-v1.hs` adds the `hs.std.scalar.f32.v1` contract for finite IEEE-754 binary32 inputs. It exports scalar clamp, lerp, inverse-lerp, and remap, with literals, parameters, intermediate arithmetic results, and returns rounded to binary32. Inverse-lerp and remap require a non-zero input span; NaN, infinity, signed-zero preservation, and division-by-zero behavior remain outside the first proof.

`@holoscript/std/native/abi/scalar-f64-v1.hs` adds the `hs.std.scalar.f64.v1` contract for finite IEEE-754 binary64 inputs. It exports scalar clamp, lerp, inverse-lerp, and remap. Inverse-lerp and remap require a non-zero input span; NaN, infinity, signed-zero preservation, and division-by-zero behavior remain outside the first proof.

The conformance gate executes the existing JavaScript implementation on Node, loads the committed browser WebAssembly compiler in headless Chromium and executes its UAAL bytecode in that browser, then compiles the same HoloScript source with `holoscriptc` and runs the generated host executable:

```bash
pnpm --filter @holoscript/std run test:abi
```

This proves the declared i32 scalar subset, affine aggregate-valued flat-POD Vec3 subset, finite f32 scalar subset with operation-by-operation binary32 rounding, and finite f64 scalar subset. Nested or owned aggregates, mutable or borrowed aggregate transfer, non-finite floating-point edge semantics, quaternions, noise, collections, OS-level air-gap behavior, and a general stable systems ABI remain outside the proof.

**Known limitations:** `@holoscript/std/fs` assumes a Node.js-like filesystem (`fs`/`path`) and is not usable in a browser bundle; import the browser-safe entry points (`math`, `collections`, `string`, `time`) instead if you need this library client-side. The browser ABI gate enables UAAL derivation logging and verifies its universal SHA-256 receipt plus hermetic replay without a Node `crypto` compatibility shim. Interfaces may change before a v1 release.

## License

MIT
