function make_values(fill: i32): [i32] {
  let values: [i32] = buffer(2, fill)
  return move(values)
}

function read(view: &[i32], index: i32): i32 {
  return load(view[index])
}

function read_forwarded(view: &[i32], index: i32): i32 {
  return read(view, index)
}

function write(view: &mut [i32], index: i32, value: i32): i32 {
  store(view[index], value)
  return load(view[index])
}

function write_forwarded(view: &mut [i32], index: i32, value: i32): i32 {
  return write(view, index, value)
}

function relay(values: [i32]): [i32] {
  return move(values)
}

function main(): i32 {
  let initial: [i32] = make_values(5)
  let values: [i32] = relay(move(initial))
  let changed: i32 = write_forwarded(&mut values, 1, 9)
  let observed: i32 = read_forwarded(&values, 1)
  drop(values)
  return observed
}
