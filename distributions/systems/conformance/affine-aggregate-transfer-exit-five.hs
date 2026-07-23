struct Payload { values: [i32], code: i32 }
struct Envelope { payload: Payload, spare: [i32] }

function make(): Envelope {
    slot envelope: Envelope = Envelope(
        Payload(buffer(2, 5), 5),
        buffer(1, 9)
    )
    return move(envelope)
}

function relay(envelope: Envelope): Envelope {
    return move(envelope)
}

function consume(envelope: Envelope): i32 {
    scope {
        let view: &[i32] = &envelope.payload.values
        let observed: i32 = load(view[0])
    }
    return load(envelope.payload.code)
}

function main(): i32 {
    slot initial: Envelope = make()
    slot forwarded: Envelope = relay(move(initial))
    return consume(move(forwarded))
}
