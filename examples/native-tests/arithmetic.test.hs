export function add(left: i32, right: i32): i32 {
  return left + right
}

export function test_adds_positive_integers(): i32 {
  if (add(2, 3) == 5) {
    return 0
  }
  return 1
}

export function test_adds_negative_integers(): i32 {
  if (add(-2, 3) == 1) {
    return 0
  }
  return 1
}
