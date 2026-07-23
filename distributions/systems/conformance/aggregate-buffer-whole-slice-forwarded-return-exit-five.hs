struct Packet {
  values: [i32]
  other: [i32]
}

function view_leaf<'a>(packet: &'a Packet): &'a [i32] {
  return &packet.values
}

function view_relay<'a>(packet: &'a Packet): &'a [i32] {
  return view_leaf(packet)
}

function view_mut_leaf<'a>(packet: &'a mut Packet): &'a mut [i32] {
  return &mut packet.values
}

function view_mut_relay<'a>(packet: &'a mut Packet): &'a mut [i32] {
  return view_mut_leaf(packet)
}

function main(): i32 {
  slot packet: Packet = Packet(buffer(3, 1), buffer(3, 9))
  slot proof: i32 = 0
  scope {
    let direct: &[i32] = view_leaf(&packet)
    store(proof, load(direct[0]))
  }
  scope {
    let direct_writer: &mut [i32] = view_mut_leaf(&mut packet)
    store(direct_writer[0], 2)
  }
  scope {
    let writer: &mut [i32] = view_mut_relay(&mut packet)
    store(writer[1], 5)
  }
  let view: &[i32] = view_relay(&packet)
  return load(view[1]) + load(proof) - 1
}
