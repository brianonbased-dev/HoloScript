function view<'a>(values: &'a [i32], start: i32, end: i32): &'a [i32] {
  return &values[start..end]
}

function relay<'a>(values: &'a [i32], start: i32, end: i32): &'a [i32] {
  return view(values, start, end)
}

function view_mut<'a>(values: &'a mut [i32], start: i32, end: i32): &'a mut [i32] {
  return &mut values[start..end]
}

function relay_mut<'a>(values: &'a mut [i32], start: i32, end: i32): &'a mut [i32] {
  return view_mut(values, start, end)
}

function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  slot proof: i32 = 0
  scope {
    let observed: &[i32] = relay(&values[0..4], 1, 3)
    store(proof, load(observed[0]))
  }
  scope {
    let writer: &mut [i32] = relay_mut(&mut values[0..4], 2, 4)
    store(writer[0], 5)
  }
  return load(values[2]) + load(proof) - 2
}
