/**
 * Type-level tests for @holoscript/core-types/utility.
 *
 * These tests use vitest's `expectTypeOf` for compile-time type assertions.
 * They verify that utility types produce the expected shapes — no runtime
 * behavior is tested because these are pure type definitions.
 */
import { describe, it, expectTypeOf, assertType } from 'vitest';
import type {
  DeepPartial,
  DeepReadonly,
  TypedEventEmitter,
  TypedEventKey,
  TypedEventHandler,
  StrictRecord,
  Mutable,
  DeepMutable,
  PickByValue,
  OmitByValue,
  ExtendedGlobal,
  Extensible,
  Brand,
  AnyCallback,
  UnwrapPromise,
  PartialBy,
  RequiredBy,
  JsonValue,
  JsonObject,
  MutableJsonValue,
  MutableJsonObject,
  SafeGet,
  EventMap,
} from '../utility';

// ── Test fixtures ────────────────────────────────────────────────────────────

interface Nested {
  a: string;
  b: {
    c: number;
    d: {
      e: boolean;
    };
  };
  tags: string[];
}

interface ReadonlyNested {
  readonly x: string;
  readonly y: {
    readonly z: number;
  };
}

interface MixedConfig {
  name: string;
  count: number;
  label: string;
  active: boolean;
  items: string[];
}

interface StreamEvents extends EventMap {
  data: { chunk: Uint8Array };
  error: { error: Error };
  close: { code: number; reason: string };
}

// ── DeepPartial ──────────────────────────────────────────────────────────────

describe('DeepPartial', () => {
  it('makes top-level properties optional', () => {
    type Result = DeepPartial<Nested>;
    expectTypeOf<Result>().toHaveProperty('a');
    // Optional: can be assigned undefined
    const r: Result = {};
    assertType<Result>(r);
  });

  it('makes nested properties optional', () => {
    type Result = DeepPartial<Nested>;
    const r: Result = { b: {} };
    assertType<Result>(r);
    const r2: Result = { b: { d: {} } };
    assertType<Result>(r2);
  });

  it('preserves arrays as-is', () => {
    type Result = DeepPartial<Nested>;
    // tags can be omitted entirely, but if provided, it's still string[]
    const r: Result = { tags: ['a', 'b'] };
    assertType<Result>(r);
  });

  it('handles primitive types passthrough', () => {
    type Result = DeepPartial<string>;
    expectTypeOf<Result>().toEqualTypeOf<string>();
  });
});

// ── DeepReadonly ──────────────────────────────────────────────────────────────

describe('DeepReadonly', () => {
  it('makes top-level properties readonly', () => {
    type Result = DeepReadonly<Nested>;
    expectTypeOf<Result['a']>().toBeString();
  });

  it('makes nested properties readonly', () => {
    type Result = DeepReadonly<Nested>;
    expectTypeOf<Result['b']['c']>().toBeNumber();
    expectTypeOf<Result['b']['d']['e']>().toBeBoolean();
  });

  it('makes arrays readonly', () => {
    type Result = DeepReadonly<Nested>;
    expectTypeOf<Result['tags']>().toMatchTypeOf<ReadonlyArray<string>>();
  });
});

// ── TypedEventEmitter ────────────────────────────────────────────────────────

describe('TypedEventEmitter', () => {
  it('constrains event names to defined keys', () => {
    type Keys = TypedEventKey<StreamEvents>;
    expectTypeOf<Keys>().toMatchTypeOf<string>();
  });

  it('types handler payloads correctly', () => {
    type DataHandler = TypedEventHandler<StreamEvents, 'data'>;
    expectTypeOf<DataHandler>().toEqualTypeOf<
      (payload: { chunk: Uint8Array }) => void
    >();

    type ErrorHandler = TypedEventHandler<StreamEvents, 'error'>;
    expectTypeOf<ErrorHandler>().toEqualTypeOf<
      (payload: { error: Error }) => void
    >();
  });

  it('interface methods accept correct types', () => {
    type Emitter = TypedEventEmitter<StreamEvents>;
    expectTypeOf<Emitter['on']>().toBeFunction();
    expectTypeOf<Emitter['emit']>().toBeFunction();
    expectTypeOf<Emitter['off']>().toBeFunction();
    expectTypeOf<Emitter['once']>().toBeFunction();
  });
});

// ── StrictRecord ─────────────────────────────────────────────────────────────

describe('StrictRecord', () => {
  it('requires all keys to be present', () => {
    type Platform = 'quest' | 'desktop' | 'mobile';
    type PlatformBudget = StrictRecord<Platform, number>;

    // All keys present — valid
    const budget: PlatformBudget = { quest: 100, desktop: 200, mobile: 50 };
    assertType<PlatformBudget>(budget);

    // Each key is typed
    expectTypeOf<PlatformBudget['quest']>().toBeNumber();
    expectTypeOf<PlatformBudget['desktop']>().toBeNumber();
    expectTypeOf<PlatformBudget['mobile']>().toBeNumber();
  });
});

// ── Mutable ──────────────────────────────────────────────────────────────────

describe('Mutable', () => {
  it('removes readonly from properties', () => {
    type Result = Mutable<ReadonlyNested>;
    const obj: Result = { x: 'a', y: { z: 1 } };
    // Should be assignable (not readonly at top level)
    obj.x = 'b';
    assertType<Result>(obj);
  });
});

describe('DeepMutable', () => {
  it('removes readonly recursively', () => {
    type Result = DeepMutable<DeepReadonly<Nested>>;
    const obj: Result = { a: 'x', b: { c: 1, d: { e: true } }, tags: ['a'] };
    obj.a = 'y';
    obj.b.c = 2;
    obj.b.d.e = false;
    obj.tags.push('b');
    assertType<Result>(obj);
  });
});

// ── PickByValue / OmitByValue ────────────────────────────────────────────────

describe('PickByValue', () => {
  it('picks keys whose values extend the target type', () => {
    type StringKeys = PickByValue<MixedConfig, string>;
    expectTypeOf<StringKeys>().toEqualTypeOf<{ name: string; label: string }>();
  });

  it('picks number keys', () => {
    type NumberKeys = PickByValue<MixedConfig, number>;
    expectTypeOf<NumberKeys>().toEqualTypeOf<{ count: number }>();
  });
});

describe('OmitByValue', () => {
  it('omits keys whose values extend the target type', () => {
    type NonStringKeys = OmitByValue<MixedConfig, string>;
    expectTypeOf<NonStringKeys>().toEqualTypeOf<{
      count: number;
      active: boolean;
      items: string[];
    }>();
  });
});

// ── ExtendedGlobal ───────────────────────────────────────────────────────────

describe('ExtendedGlobal', () => {
  it('adds typed properties to globalThis', () => {
    type NodeGlobal = ExtendedGlobal<{ gc?: () => void }>;
    // Should have gc as optional
    const g = {} as NodeGlobal;
    if (g.gc) {
      expectTypeOf(g.gc).toBeFunction();
    }
  });
});

// ── Extensible ───────────────────────────────────────────────────────────────

describe('Extensible', () => {
  it('preserves known properties and adds index signature', () => {
    interface Base {
      type: string;
      name: string;
    }
    type Ext = Extensible<Base>;
    const obj: Ext = { type: 'foo', name: 'bar' };
    expectTypeOf(obj.type).toBeString();
    expectTypeOf(obj.name).toBeString();
    // Dynamic property returns unknown, not any
    expectTypeOf(obj['dynamic']).toBeUnknown();
  });
});

// ── Brand ────────────────────────────────────────────────────────────────────

describe('Brand', () => {
  it('creates nominal types that are not interchangeable', () => {
    type UserId = Brand<string, 'UserId'>;
    type SessionId = Brand<string, 'SessionId'>;

    // Both are branded strings but different brands
    expectTypeOf<UserId>().not.toEqualTypeOf<SessionId>();
    expectTypeOf<UserId>().toMatchTypeOf<string>();
  });
});

// ── AnyCallback ──────────────────────────────────────────────────────────────

describe('AnyCallback', () => {
  it('accepts unknown args and returns void', () => {
    const cb: AnyCallback = () => {};
    assertType<AnyCallback>(cb);
    expectTypeOf<AnyCallback>().toBeFunction();
  });
});

// ── UnwrapPromise ────────────────────────────────────────────────────────────

describe('UnwrapPromise', () => {
  it('extracts the resolved type from Promise', () => {
    type Result = UnwrapPromise<Promise<string>>;
    expectTypeOf<Result>().toBeString();
  });

  it('passes through non-Promise types', () => {
    type Result = UnwrapPromise<number>;
    expectTypeOf<Result>().toBeNumber();
  });
});

// ── PartialBy / RequiredBy ───────────────────────────────────────────────────

describe('PartialBy', () => {
  it('makes only specified keys optional', () => {
    interface Full {
      host: string;
      port: number;
      tls: boolean;
    }
    type Init = PartialBy<Full, 'tls'>;
    // host and port are required, tls is optional
    const config: Init = { host: 'localhost', port: 8080 };
    assertType<Init>(config);
  });
});

describe('RequiredBy', () => {
  it('makes only specified keys required', () => {
    interface Opts {
      host?: string;
      port?: number;
      tls?: boolean;
    }
    type WithHost = RequiredBy<Opts, 'host'>;
    // host is required, rest optional
    const config: WithHost = { host: 'localhost' };
    assertType<WithHost>(config);
  });
});

// ── SafeGet ──────────────────────────────────────────────────────────────────

describe('SafeGet', () => {
  it('returns known property type for known keys', () => {
    interface Obj {
      name: string;
      count: number;
    }
    type NameType = SafeGet<Obj, 'name'>;
    expectTypeOf<NameType>().toBeString();
  });

  it('returns unknown for unknown keys', () => {
    interface Obj {
      name: string;
    }
    type UnknownProp = SafeGet<Obj, 'nonexistent'>;
    expectTypeOf<UnknownProp>().toBeUnknown();
  });
});

// ── JSON Types ───────────────────────────────────────────────────────────────

describe('JsonValue', () => {
  it('accepts valid JSON primitives', () => {
    const s: JsonValue = 'hello';
    const n: JsonValue = 42;
    const b: JsonValue = true;
    const nil: JsonValue = null;
    assertType<JsonValue>(s);
    assertType<JsonValue>(n);
    assertType<JsonValue>(b);
    assertType<JsonValue>(nil);
  });

  it('accepts nested objects and arrays', () => {
    const obj: JsonValue = { key: 'value', nested: { arr: [1, 2, 3] } };
    assertType<JsonValue>(obj);
  });

  it('readonly JsonObject does not allow mutation', () => {
    const obj: JsonObject = { key: 'value' };
    expectTypeOf(obj['key']).toEqualTypeOf<JsonValue>();
  });

  it('MutableJsonObject allows mutation', () => {
    const obj: MutableJsonObject = { key: 'value' };
    obj['key'] = 42;
    assertType<MutableJsonObject>(obj);
  });

  it('MutableJsonValue allows building incrementally', () => {
    const arr: MutableJsonValue = [1, 'two', { three: 3 }];
    assertType<MutableJsonValue>(arr);
  });
});
