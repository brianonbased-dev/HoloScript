/**
 * Lazy optional-peer re-export helper.
 *
 * `@holoscript/core` re-exports a handful of VALUE symbols that live in
 * OPTIONAL peer packages (`@holoscript/engine`, `@holoscript/framework`,
 * `@holoscript/mesh`, `@holoscript/platform`). A fresh `npm install
 * @holoscript/core` does NOT pull those peers, so a *static*
 * `export { X } from '@holoscript/engine/...'` makes the public barrel
 * eager-resolve a package that isn't on disk and the documented first-use
 * (README on-ramp) crashes with `ERR_MODULE_NOT_FOUND` before any user code
 * runs (board task task_1780207572551_ax8w; W.667 — internal validation green
 * != external reality).
 *
 * This helper defers the peer resolution to FIRST USE of each symbol (call,
 * `new`, or property access) instead of module-load time. Importing the barrel
 * no longer touches the optional peers, so the lean README on-ramp works.
 * Consumers who DID install the peer get the real symbol on first use;
 * consumers who did not get a clear, actionable error naming the package to
 * install — never a cryptic resolver stack trace.
 *
 * Synchronous resolution (rather than async `await import()`) is required to
 * preserve the existing public API: consumers do `new BehaviorTree()` /
 * `ChoreographyEngine.create()` / `signOperation(...)` directly, not
 * `(await ...).Symbol`. We use `module.createRequire` against this module's own
 * URL so the lookup honours the installed `@holoscript/core` package's
 * node_modules resolution. tsup emits both an ESM (`import.meta.url`) and a CJS
 * (`__filename` shim) build; `createRequire` works in both.
 *
 * The returned binding is a callable + constructable Proxy that forwards every
 * trap to the lazily-resolved real export, so it is interchangeable with the
 * real class/function for construction, calling, static-member access, and
 * `instanceof`-via-prototype lookups.
 */

import { createRequire } from 'node:module';

// esbuild rewrites `import.meta.url` to a `__filename`-based shim in the CJS
// output, so this resolves correctly from either the .js (ESM) or .cjs build.
//
// DEFER the `createRequire` call to first actual peer load — calling it at module
// top level crashes in a BROWSER bundle (`createRequire` from `node:module` is
// Node-only; bundlers shim it to undefined), which would make merely IMPORTING the
// `@holoscript/core` barrel throw client-side ("createRequire is not a function")
// before any user code runs. Optional peers are never loaded in the browser, so the
// deferred call is never reached there — the barrel stays browser-safe, and Node
// consumers get identical behaviour on first peer use.
let _requirePeer: NodeRequire | undefined;
function requirePeer(specifier: string): unknown {
  if (!_requirePeer) {
    if (typeof createRequire !== 'function') {
      throw new Error(
        '@holoscript/core: optional peer symbols require a Node.js environment ' +
          '(`createRequire` is unavailable in this bundle). The core parser and ' +
          'compiler surface work without the optional peers.'
      );
    }
    _requirePeer = createRequire(import.meta.url);
  }
  return _requirePeer(specifier);
}

// Cache resolved peer module namespaces so repeated access does not re-enter
// the require machinery.
const peerCache = new Map<string, Record<string, unknown>>();

function loadPeer(specifier: string): Record<string, unknown> {
  const cached = peerCache.get(specifier);
  if (cached) return cached;
  let mod: Record<string, unknown>;
  try {
    mod = requirePeer(specifier) as Record<string, unknown>;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    const pkg = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
    // Only translate "package missing" into the install hint; surface any
    // other failure (e.g. a real bug inside an installed peer) verbatim.
    if (e && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND')) {
      throw new Error(
        `@holoscript/core: optional peer "${pkg}" is required to use this symbol ` +
          `but is not installed. Run \`npm install ${pkg}\` (or your package ` +
          `manager's equivalent) to enable it. The core parser and compiler ` +
          `surface work without it.`
      );
    }
    throw err;
  }
  peerCache.set(specifier, mod);
  return mod;
}

function resolveSymbol(specifier: string, name: string): unknown {
  const mod = loadPeer(specifier);
  if (!(name in mod)) {
    const pkg = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
    throw new Error(
      `@holoscript/core: symbol "${name}" was not found in optional peer ` +
        `"${specifier}" (package "${pkg}"). The installed peer version may be ` +
        `incompatible with this @holoscript/core release.`
    );
  }
  return mod[name];
}

/**
 * Lazily re-export a single VALUE symbol from an optional peer.
 *
 * Returns a callable + constructable Proxy that forwards to the real symbol on
 * first use. The peer is NOT resolved until the symbol is actually called,
 * constructed, or has a property read — so merely importing `@holoscript/core`
 * stays peer-free.
 *
 * Usage at a barrel site (replaces `export { X } from '@holoscript/peer'`):
 *   export const X = lazyPeerSymbol('@holoscript/peer', 'X') as typeof import('@holoscript/peer').X;
 *
 * Typed as `any` here; call sites cast to the real type via `import('...')`
 * type-only references that are erased at build (so they never trigger eager
 * resolution).
 */
export function lazyPeerSymbol(specifier: string, name: string): any {
  // A Proxy needs a target that is itself callable+constructable so the `apply`
  // and `construct` traps are honoured. A function target provides both.
  const target = function lazyPeerProxyTarget() {} as unknown as Record<string | symbol, unknown>;

  let resolved: any;
  const real = (): any => {
    if (resolved === undefined) resolved = resolveSymbol(specifier, name);
    return resolved;
  };
  // INTROSPECTION-SAFE resolution: when the peer can't be resolved (e.g. a browser
  // bundle where `createRequire` is unavailable, or the peer isn't installed), a
  // bundler / React Fast Refresh probe of the module exports — `obj.prototype`,
  // `obj.$$typeof`, `Object.keys(obj)` — must NOT throw, or merely loading the
  // barrel client-side detonates. So the READ traps degrade to a benign default
  // when resolution fails; only an ACTUAL call/construct (apply/construct) surfaces
  // the clear "install the peer / Node-only" error, since that's a real use.
  const tryReal = (): any => {
    try {
      return real();
    } catch {
      return undefined;
    }
  };

  return new Proxy(target, {
    apply(_t, thisArg, args) {
      return Reflect.apply(real(), thisArg, args);
    },
    construct(_t, args, newTarget) {
      return Reflect.construct(real(), args, newTarget);
    },
    get(_t, prop) {
      const r = tryReal();
      // Fall back to the function TARGET when the peer can't resolve, so a probe
      // reads a benign default (`undefined` for most props) instead of throwing.
      if (r == null) return Reflect.get(_t, prop);
      // Read off the REAL object (not the proxy) so the receiver carries the
      // peer value's internal slots. Bind returned methods to the real object
      // so calls like `mapValue.values()` / `setValue.has(x)` get a valid
      // receiver — passing the function-target proxy as `this` throws
      // "Method Map.prototype.values called on incompatible receiver".
      const v = Reflect.get(r as object, prop, r);
      return typeof v === 'function' ? (v as Function).bind(r) : v;
    },
    has(_t, prop) {
      const r = tryReal();
      return Reflect.has((r ?? _t) as object, prop);
    },
    getPrototypeOf(_t) {
      const r = tryReal();
      return Reflect.getPrototypeOf((r ?? _t) as object);
    },
    // ownKeys / getOwnPropertyDescriptor MUST satisfy Proxy invariants (the
    // function target has a non-configurable `prototype` key), so on resolution
    // failure delegate to the TARGET — never return [] / undefined, which throws.
    ownKeys(_t) {
      const r = tryReal();
      return Reflect.ownKeys((r ?? _t) as object);
    },
    getOwnPropertyDescriptor(_t, prop) {
      const r = tryReal();
      return Reflect.getOwnPropertyDescriptor((r ?? _t) as object, prop);
    },
  });
}

/**
 * Lazily expose an entire optional-peer module namespace.
 *
 * Returns a Proxy whose every property getter resolves the peer on first
 * access, so `import * as ns from '@holoscript/engine/runtime'` can be replaced
 * with `const ns = definePeerNamespace('@holoscript/engine/runtime')` without
 * eager-resolving the peer at module load. Member access (`ns.ObjectPool`,
 * `ns.registerVoiceSynthesizer(...)`, `ns.stateMachineInterpreter`) all flow
 * through to the real module on first touch.
 *
 * Typed as `Record<string, unknown>`; call sites cast to
 * `typeof import('...')` via a type-only import that is erased at build.
 */
export function definePeerNamespace(specifier: string): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_t, prop: string | symbol) {
        if (typeof prop !== 'string') return undefined;
        return loadPeer(specifier)[prop];
      },
      has(_t, prop) {
        return typeof prop === 'string' && prop in loadPeer(specifier);
      },
      ownKeys() {
        return Reflect.ownKeys(loadPeer(specifier));
      },
      getOwnPropertyDescriptor(_t, prop) {
        if (typeof prop !== 'string') return undefined;
        const mod = loadPeer(specifier);
        if (!(prop in mod)) return undefined;
        // Namespace members must be reported enumerable+configurable so that
        // spreads / Object.keys over the proxy behave like the real module.
        return { enumerable: true, configurable: true, value: mod[prop] };
      },
    }
  );
}
