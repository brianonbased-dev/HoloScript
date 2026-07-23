struct Header { code: i32 }
struct Packet { enabled: bool, first: Header, second: Header }

function relay<'a>(marker: i32, packet: &'a Packet): &'a Header {
  return header(packet, marker)
}

function relay_mut<'a>(packet: &'a mut Packet, marker: i32): &'a mut Header {
  return header_mut(marker, packet)
}

function header<'a>(packet: &'a Packet, marker: i32): &'a Header {
  return &packet.second
}

function header_mut<'a>(marker: i32, packet: &'a mut Packet): &'a mut Header {
  return &mut packet.second
}

function main(): i32 {
  slot packet: Packet = Packet(true, Header(1), Header(2))
  scope {
    let writer: &mut Header = relay_mut(&mut packet, 0)
    store(writer.code, 5)
  }
  let view: &Header = relay(0, &packet)
  return load(view.code)
}
