struct Counters { current: i32, limit: i32 }
struct Packet { counters: Counters, enabled: bool }

function read(packet: &Packet): i32 {
    return load(packet.counters.current)
}

function write(packet: &mut Packet, value: i32): i32 {
    store(packet.counters.current, value)
    return load(packet.counters.current)
}

function observe_reborrows(packet: &Packet): i32 {
    scope {
        let view: &Packet = &packet
        let field: &i32 = &packet.counters.limit
        let forwarded: i32 = read(view)
        let original_forwarded: i32 = read(packet)
        let observed: i32 = *field + forwarded
    }
    return load(packet.counters.limit)
}

function bump(packet: &mut Packet): i32 {
    scope {
        let writer: &mut Packet = &mut packet
        let updated: i32 = write(writer, load(writer.counters.current) + 1)
    }
    scope {
        let field: &mut i32 = &mut packet.counters.current
        *field = *field + 1
    }
    return load(packet.counters.current)
}

function main(): i32 {
    slot packet: Packet = Packet(Counters(1, 5), true)
    let observed: i32 = observe_reborrows(&packet)
    let first: i32 = bump(&mut packet)
    let second: i32 = bump(&mut packet)
    return read(&packet)
}
