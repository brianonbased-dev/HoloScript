struct Packet {
  code: i32
}

function borrow<'a>(packet: &'a Packet): &'a Packet {
  return packet
}

function relay<'a>(packet: &'a Packet): &'a Packet {
  return borrow(packet)
}

function borrow_mut<'a>(packet: &'a mut Packet): &'a mut Packet {
  return packet
}

function relay_mut<'a>(packet: &'a mut Packet): &'a mut Packet {
  return borrow_mut(packet)
}

function main(): i32 {
  slot packet: Packet = Packet(1)
  slot proof: i32 = 0
  scope {
    let view: &Packet = relay(&packet)
    store(proof, load(view.code))
  }
  scope {
    let writer: &mut Packet = relay_mut(&mut packet)
    store(writer.code, 5)
  }
  return load(packet.code) + load(proof) - 1
}
