function read(values: &[i32], index: i32): i32 {
  return load(values[index])
}

function main(): i32 {
  let values: [i32] = buffer(4, 1)
  scope {
    let writer: &mut [i32] = &mut values
    store(writer[2], 5)
  }
  let moved: [i32] = move(values)
  if (true) {
    let view: &[i32] = &moved
    return read(view, 2)
  } else {
    return 1
  }
}
