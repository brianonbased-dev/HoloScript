struct Packet {
  values: [i32]
}

function view_leaf<'a>(packet: &'a Packet): &'a [i32] {
  return &packet.values
}

function view_relay<'a>(packet: &'a Packet): &'a [i32] {
  return view_leaf(packet)
}

function view_chain<'a>(packet: &'a Packet): &'a [i32] {
  return view_relay(packet)
}

function view_tip<'a>(packet: &'a Packet): &'a [i32] {
  return view_chain(packet)
}

function view_mut_leaf<'a>(packet: &'a mut Packet): &'a mut [i32] {
  return &mut packet.values
}

function view_mut_relay<'a>(packet: &'a mut Packet): &'a mut [i32] {
  return view_mut_leaf(packet)
}

function view_mut_chain<'a>(packet: &'a mut Packet): &'a mut [i32] {
  return view_mut_relay(packet)
}

function view_mut_tip<'a>(packet: &'a mut Packet): &'a mut [i32] {
  return view_mut_chain(packet)
}

function main(): i32 {
  slot packet: Packet = Packet(buffer(2, 1))
  scope {
    let writer: &mut [i32] = view_mut_tip(&mut packet)
    store(writer[1], 5)
  }
  let view: &[i32] = view_tip(&packet)
  return load(view[1])
}
