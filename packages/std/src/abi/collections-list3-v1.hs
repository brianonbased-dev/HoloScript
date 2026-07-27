// hs.std.collections.list3.i32.v1
//
// Executable cross-target immutable collection projection for the HoloScript standard library.
//
// StdList3I32 is a fixed-size, affine POD value. Replacement and reversal construct fresh values;
// they never mutate their input. This contract does not claim dynamic indexing, variable length,
// iteration, allocation, or general List, Map, or Set parity.

struct StdList3I32 { first: i32, second: i32, third: i32 }

export function std_collections_list3_make_i32(
  first: i32,
  second: i32,
  third: i32
): StdList3I32 {
  slot value: StdList3I32 = StdList3I32(first, second, third)
  return move(value)
}

export function std_collections_list3_sum_i32(value: StdList3I32): i32 {
  return load(value.first) + load(value.second) + load(value.third)
}

export function std_collections_list3_replace_second_i32(
  value: StdList3I32,
  replacement: i32
): StdList3I32 {
  let first: i32 = load(value.first)
  let third: i32 = load(value.third)
  slot result: StdList3I32 = StdList3I32(first, replacement, third)
  return move(result)
}

export function std_collections_list3_reverse_i32(value: StdList3I32): StdList3I32 {
  let first: i32 = load(value.first)
  let second: i32 = load(value.second)
  let third: i32 = load(value.third)
  slot result: StdList3I32 = StdList3I32(third, second, first)
  return move(result)
}

export function std_collections_list3_weighted_digest_i32(value: StdList3I32): i32 {
  return load(value.first) + load(value.second) * 2 + load(value.third) * 3
}
