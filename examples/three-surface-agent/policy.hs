export function decide(signal: i32): i32 {
  if (signal > 0) {
    return 1
  }
  return 0
}

function main(): i32 {
  // The project binding replaces this adapter literal with on_task.plan.state.signal.
  return decide(1)
}
