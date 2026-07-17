function make_values(fill: i32): [i32] {
  let values: [i32] = buffer(2, fill)
  return move(values)
}

function consume(values: [i32]): i32 {
  let view: &[i32] = &values
  return load(view[0])
}

function relay(values: [i32]): [i32] {
  return move(values)
}

function main(): i32 {
  let initial: [i32] = make_values(5)
  let values: [i32] = relay(move(initial))
  return consume(move(values))
}
