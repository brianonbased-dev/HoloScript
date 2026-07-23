function read(values: &[i32], index: i32): i32 {
    return load(values[index])
}

function add_two(values: &mut [i32], index: i32): i32 {
    store(values[index], load(values[index]) + 2)
    return load(values[index])
}

function read_window(values: &[i32], start: i32, end: i32): i32 {
    return read(&values[start + 1..end], 1)
}

function write_window(values: &mut [i32], start: i32, end: i32): i32 {
    return add_two(&mut values[start..end], 0)
}

function main(): i32 {
    slot values: [i32; 4] = [1, 2, 3, 4]
    let observed: i32 = read_window(&values[0..4], 0, 4)
    let updated: i32 = write_window(&mut values[0..4], 1, 4)
    return observed + updated - 2
}
