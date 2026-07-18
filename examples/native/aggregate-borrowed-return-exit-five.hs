struct Packet { code: i32 }

function borrow<'a>(packet: &'a Packet): &'a Packet {
  return packet
}

function main(): i32 {
  slot packet: Packet = Packet(5)
  let view: &Packet = borrow(&packet)
  return load(view.code)
}
