struct Header { code: i32 }
struct Packet { enabled: bool, header: Header }

function code<'a>(packet: &'a Packet): &'a i32 {
  return &packet.header.code
}

function code_mut<'a>(packet: &'a mut Packet): &'a mut i32 {
  return &mut packet.header.code
}

function main(): i32 {
  slot packet: Packet = Packet(true, Header(2))
  scope {
    let writer: &mut i32 = code_mut(&mut packet)
    *writer = 5
  }
  let view: &i32 = code(&packet)
  return *view
}
