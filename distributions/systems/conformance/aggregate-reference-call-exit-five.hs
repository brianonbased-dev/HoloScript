struct Counters { current: i32, limit: i32 }
struct Packet { counters: Counters, enabled: bool }

function read(packet: &Packet): i32 {
    return load(packet.counters.current)
}

function write(packet: &mut Packet, value: i32): i32 {
    store(packet.counters.current, value)
    return load(packet.counters.current)
}

function relay_read(packet: &Packet): i32 {
    return read(packet)
}

function relay_write(packet: &mut Packet): i32 {
    return write(packet, load(packet.counters.current) + 1)
}

function main(): i32 {
    slot packet: Packet = Packet(Counters(1, 5), true)
    let observed: i32 = read(&packet)
    let staged: i32 = write(&mut packet, 4)
    scope {
        let view: &Packet = &packet
        let forwarded: i32 = read(view)
    }
    let relayed: i32 = relay_read(&packet)
    scope {
        let writer: &mut Packet = &mut packet
        let downgraded: i32 = read(writer)
    }
    let bumped: i32 = relay_write(&mut packet)
    return read(&packet)
}
