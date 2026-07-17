function main(): i32 {
  slot value: i32 = 2
  store(value, 5)
  return load(value)
}
