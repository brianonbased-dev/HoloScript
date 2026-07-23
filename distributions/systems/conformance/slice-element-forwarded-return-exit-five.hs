function element<'a>(index: i32, values: &'a [i32]): &'a i32 {
  return &values[index]
}

function relay<'a>(values: &'a [i32], index: i32): &'a i32 {
  return element(index, values)
}

function element_mut<'a>(values: &'a mut [i32], index: i32): &'a mut i32 {
  return &mut values[index]
}

function relay_mut<'a>(index: i32, values: &'a mut [i32]): &'a mut i32 {
  return element_mut(values, index)
}

function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  scope {
    let writer: &mut i32 = relay_mut(2, &mut values[0..4])
    *writer = 5
  }
  let view: &i32 = relay(&values[0..4], 2)
  return *view
}
