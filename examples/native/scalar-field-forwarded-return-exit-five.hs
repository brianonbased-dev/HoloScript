struct Header { code: i32 }
struct Packet { enabled: bool, header: Header }

function relay<'a>(marker: i32, packet: &'a Packet): &'a i32 {
  return code(packet, marker)
}

function relay_mut<'a>(packet: &'a mut Packet, marker: i32): &'a mut i32 {
  return code_mut(marker, packet)
}

function code<'a>(packet: &'a Packet, marker: i32): &'a i32 {
  return &packet.header.code
}

function code_mut<'a>(marker: i32, packet: &'a mut Packet): &'a mut i32 {
  return &mut packet.header.code
}

function main(): i32 {
  slot packet: Packet = Packet(true, Header(2))
  scope {
    let writer: &mut i32 = relay_mut(&mut packet, 0)
    *writer = 5
  }
  let view: &i32 = relay(0, &packet)
  return *view
}
