function borrow<'a>(values: &'a [i32]): &'a [i32] {
  return values
}

function borrow_mut<'a>(values: &'a mut [i32]): &'a mut [i32] {
  return values
}

function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  scope {
    let view: &[i32] = borrow(&values[1..4])
    let observed: i32 = load(view[1])
  }
  scope {
    let writer: &mut [i32] = borrow_mut(&mut values[1..4])
    store(writer[1], load(writer[1]) + 2)
  }
  return load(values[2])
}
