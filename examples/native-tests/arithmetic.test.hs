export function add(left: i32, right: i32): i32 {
  return left + right
}

export function test_adds_positive_integers(): bool {
  return add(2, 3) == 5
}

export function test_adds_negative_integers(): bool {
  return add(-2, 3) == 1
}
