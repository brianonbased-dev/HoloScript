function make_values(fill: i32): [i32] {
  let values: [i32] = buffer(2, fill)
  return move(values)
}

function read(view: &[i32], index: i32): i32 {
  return load(view[index])
}

function relay(values: [i32]): [i32] {
  return move(values)
}

function main(): i32 {
  let initial: [i32] = make_values(5)
  let values: [i32] = relay(move(initial))
  let first: i32 = read(&values, 0)
  let second: i32 = read(&values, 1)
  drop(values)
  return first
}
