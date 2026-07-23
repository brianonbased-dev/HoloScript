struct Packet {
  values: [i32]
}

function view_leaf<'a>(packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  return &packet.values[start..end]
}

function view_left<'a>(packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  return view_leaf(packet, start, end)
}

function view_right<'a>(packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  return view_leaf(packet, start, end)
}

function view_join<'a>(choose_left: bool, packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  if (choose_left) {
    return view_left(packet, start, end)
  } else {
    return view_right(packet, start, end)
  }
}

function view_tip<'a>(packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  return view_join(false, packet, start, end)
}

function view_mut_leaf<'a>(packet: &'a mut Packet, start: i32, end: i32): &'a mut [i32] {
  return &mut packet.values[start..end]
}

function view_mut_left<'a>(packet: &'a mut Packet, start: i32, end: i32): &'a mut [i32] {
  return view_mut_leaf(packet, start, end)
}

function view_mut_right<'a>(packet: &'a mut Packet, start: i32, end: i32): &'a mut [i32] {
  return view_mut_leaf(packet, start, end)
}

function view_mut_join<'a>(choose_left: bool, packet: &'a mut Packet, start: i32, end: i32): &'a mut [i32] {
  if (choose_left) {
    return view_mut_left(packet, start, end)
  } else {
    return view_mut_right(packet, start, end)
  }
}

function view_mut_tip<'a>(packet: &'a mut Packet, start: i32, end: i32): &'a mut [i32] {
  return view_mut_join(true, packet, start, end)
}

function main(): i32 {
  slot packet: Packet = Packet(buffer(2, 1))
  scope {
    let writer: &mut [i32] = view_mut_tip(&mut packet, 1, 2)
    store(writer[0], 5)
  }
  let view: &[i32] = view_tip(&packet, 1, 2)
  return load(view[0])
}
