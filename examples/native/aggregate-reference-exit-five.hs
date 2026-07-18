struct Counters { current: i32, limit: i32 }
struct Packet { counters: Counters, enabled: bool }

function main(): i32 {
    slot packet: Packet = Packet(Counters(1, 5), true)

    scope {
        let view: &Packet = &packet
        let limit_view: &i32 = &packet.counters.limit
        let observed: i32 = load(view.counters.current) + *limit_view
    }

    scope {
        let writer: &mut Packet = &mut packet
        store(writer.counters.current, load(writer.counters.limit) - 1)
    }

    scope {
        let field_writer: &mut i32 = &mut packet.counters.current
        *field_writer = *field_writer + 1
    }

    scope {
        let field: &i32 = &packet.counters.current
        let observed: i32 = *field
    }

    return load(packet.counters.current)
}
