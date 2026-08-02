export type StdJsonPrimitive = null | boolean | number | string;

export type StdJsonValue =
  | StdJsonPrimitive
  | StdJsonValue[]
  | { [key: string]: StdJsonValue };

export type StdJsonObject = { [key: string]: StdJsonValue };

export interface StdQuaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface StdCallableDescriptor {
  schema: typeof STD_CALLABLE_SCHEMA;
  arity: number;
  body: StdJsonValue;
}

export type StdIterableDescriptor =
  | {
      schema: typeof STD_ITERABLE_SCHEMA;
      kind: 'list' | 'set';
      values: StdJsonValue[];
    }
  | {
      schema: typeof STD_ITERABLE_SCHEMA;
      kind: 'map';
      value: StdJsonObject;
    };

export type StdIterable = StdJsonValue[] | string | StdIterableDescriptor;

export interface StdMathHostBindings {
  clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, t: number): number;
  quat_slerp(a: StdQuaternion, b: StdQuaternion, t: number): StdQuaternion;
}

export interface StdListHostBindings {
  list_of(items: StdJsonValue[]): StdJsonValue[];
  list_from(iterable: StdIterable): StdJsonValue[];
  list_range(start: number, end: number, step: number): number[];
  list_repeat(value: StdJsonValue, count: number): StdJsonValue[];
  list_map(lst: StdJsonValue[], fn: StdCallableDescriptor): StdJsonValue[];
  list_flat_map(lst: StdJsonValue[], fn: StdCallableDescriptor): StdJsonValue[];
  list_filter(lst: StdJsonValue[], predicate: StdCallableDescriptor): StdJsonValue[];
  list_reduce(
    lst: StdJsonValue[],
    fn: StdCallableDescriptor,
    initial: StdJsonValue
  ): StdJsonValue;
  list_sort(lst: StdJsonValue[], comparator: StdCallableDescriptor): StdJsonValue[];
  list_reverse(lst: StdJsonValue[]): StdJsonValue[];
  list_flatten(lst: StdJsonValue[]): StdJsonValue[];
  list_unique(lst: StdJsonValue[]): StdJsonValue[];
  list_get(lst: StdJsonValue[], index: number): StdJsonValue;
  list_first(lst: StdJsonValue[]): StdJsonValue;
  list_last(lst: StdJsonValue[]): StdJsonValue;
  list_contains(lst: StdJsonValue[], item: StdJsonValue): boolean;
  list_index_of(lst: StdJsonValue[], item: StdJsonValue): number;
  list_length(lst: StdJsonValue[]): number;
  list_is_empty(lst: StdJsonValue[]): boolean;
  list_join(lst: StdJsonValue[], sep: string): string;
  list_zip(a: StdJsonValue[], b: StdJsonValue[]): [StdJsonValue, StdJsonValue][];
  list_chunk(lst: StdJsonValue[], size: number): StdJsonValue[][];
  list_to_array(lst: StdJsonValue[]): StdJsonValue[];
  list_to_set(lst: StdJsonValue[]): StdJsonValue[];
}

export interface StdMapHostBindings {
  map_set(m: StdJsonObject, key: string, value: StdJsonValue): StdJsonObject;
  map_get(m: StdJsonObject, key: string): StdJsonValue;
  map_has(m: StdJsonObject, key: string): boolean;
  map_delete(m: StdJsonObject, key: string): StdJsonObject;
  map_keys(m: StdJsonObject): string[];
  map_values(m: StdJsonObject): StdJsonValue[];
  map_entries(m: StdJsonObject): [string, StdJsonValue][];
  map_map_values(m: StdJsonObject, fn: StdCallableDescriptor): StdJsonObject;
  map_filter(m: StdJsonObject, predicate: StdCallableDescriptor): StdJsonObject;
  map_merge(a: StdJsonObject, b: StdJsonObject): StdJsonObject;
  map_size(m: StdJsonObject): number;
}

export interface StdSetHostBindings {
  set_add(s: StdJsonValue[], item: StdJsonValue): StdJsonValue[];
  set_has(s: StdJsonValue[], item: StdJsonValue): boolean;
  set_delete(s: StdJsonValue[], item: StdJsonValue): StdJsonValue[];
  set_union(a: StdJsonValue[], b: StdJsonValue[]): StdJsonValue[];
  set_intersection(a: StdJsonValue[], b: StdJsonValue[]): StdJsonValue[];
  set_difference(a: StdJsonValue[], b: StdJsonValue[]): StdJsonValue[];
  set_size(s: StdJsonValue[]): number;
  set_to_array(s: StdJsonValue[]): StdJsonValue[];
}

export interface StdHostBindings {
  math: StdMathHostBindings;
  list_lib: StdListHostBindings;
  map_lib: StdMapHostBindings;
  set_lib: StdSetHostBindings;
}

export class StdHostAbiError extends Error {
  readonly code: string;
  constructor(code: string, message: string);
}

export const STD_HOST_ABI_SCHEMA: 'holoscript.std-host-abi.v0';
export const STD_CALLABLE_SCHEMA: 'holoscript.std-callable.v0';
export const STD_ITERABLE_SCHEMA: 'holoscript.std-iterable.v0';

export function createStdHostBindings(): StdHostBindings;
