struct Packet {
  values: [i32]
  other: [i32]
}

function element_leaf<'a>(packet: &'a Packet, index: i32): &'a i32 {
  return &packet.values[index]
}

function element_relay<'a>(packet: &'a Packet, index: i32): &'a i32 {
  return element_leaf(packet, index)
}

function element_mut_leaf<'a>(packet: &'a mut Packet, index: i32): &'a mut i32 {
  return &mut packet.values[index]
}

function element_mut_relay<'a>(packet: &'a mut Packet, index: i32): &'a mut i32 {
  return element_mut_leaf(packet, index)
}

function main(): i32 {
  slot packet: Packet = Packet(buffer(3, 1), buffer(3, 9))
  scope {
    let view: &mut i32 = element_mut_relay(&mut packet, 1)
    *view = 5
  }
  let result: &i32 = element_relay(&packet, 1)
  return *result
}
