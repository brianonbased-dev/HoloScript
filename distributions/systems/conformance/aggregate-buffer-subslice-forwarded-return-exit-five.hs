struct Packet {
  values: [i32]
  other: [i32]
}

function view_leaf<'a>(packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  return &packet.values[start..end]
}

function view_relay<'a>(packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  return view_leaf(packet, start, end)
}

function view_mut_leaf<'a>(packet: &'a mut Packet, start: i32, end: i32): &'a mut [i32] {
  return &mut packet.values[start..end]
}

function view_mut_relay<'a>(packet: &'a mut Packet, start: i32, end: i32): &'a mut [i32] {
  return view_mut_leaf(packet, start, end)
}

function main(): i32 {
  slot packet: Packet = Packet(buffer(3, 1), buffer(3, 9))
  slot proof: i32 = 0
  scope {
    let direct: &[i32] = view_leaf(&packet, 0, 1)
    store(proof, load(direct[0]))
  }
  scope {
    let direct_writer: &mut [i32] = view_mut_leaf(&mut packet, 0, 1)
    store(direct_writer[0], 2)
  }
  scope {
    let writer: &mut [i32] = view_mut_relay(&mut packet, 1, 3)
    store(writer[0], 5)
  }
  let view: &[i32] = view_relay(&packet, 1, 2)
  return load(view[0]) + load(proof) - 1
}
