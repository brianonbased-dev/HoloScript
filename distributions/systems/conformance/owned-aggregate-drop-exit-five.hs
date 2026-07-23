struct Payload { values: [i32], spare: [i32], marker: i32 }
struct Envelope { payload: Payload, backup: [i32] }

function relay(values: [i32]): [i32] {
  return move(values)
}

function consume(values: [i32]): i32 {
  let view: &[i32] = &values
  return load(view[0])
}

function main(): i32 {
  let initial: [i32] = buffer(2, 5)
  slot envelope: Envelope = Envelope(
    Payload(move(initial), buffer(1, 7), 1),
    buffer(1, 9)
  )

  scope {
    let view: &[i32] = &envelope.payload.values
    let observed: i32 = load(view[0])
  }

  store(envelope.payload.marker, 5)
  let forwarded: [i32] = relay(move(envelope.payload.values))
  drop(envelope.backup)
  let result: i32 = consume(move(forwarded))
  return result + load(envelope.payload.marker) - 5
}
