# HoloScript+ (.hsplus) behaviour files — reference card

This card is the only language reference agent B receives. It describes the
deterministic action subset that headless experiments execute. The example is
deliberately from an unrelated domain.

## Shape

```hsplus
composition "Name Of The Behaviour" {
  state {
    someNumber: 0
    someText: "hello"
  }

  logic {
    action doSomething(inputA, inputB) {
      // statements
    }

    action noInputs() {
      // statements
    }
  }
}
```

- One `composition "<name>" { ... }` wrapper per file.
- `state { key: value }` declares the starting values. One `key: value` per line,
  no commas, no `=`. Values: numbers, quoted text, `true`/`false`, lists `[...]`,
  objects `{ key: value, ... }`.
- `logic { ... }` holds the actions. Each `action name(param, ...) { ... }` is an
  entry point the host calls by name; parameters arrive by name.

## Statements allowed inside an action

- Assignment to state: `state.key = <expr>`, also `+=`, `-=`, `*=`, `/=`.
- Event announcement: `emit("event_name", { key: <expr> })`.
- `if (<expr>) { ... } else { ... }`.
- `return <expr>` — usually an object literal.
- Line comments: `// ...`.

## Expressions allowed

- Literals: numbers, `"text"`, `true`, `false`, `[]`, `[a, b]`, `{ key: value }`.
- Names: action parameters, `state.key`.
- Arithmetic `+ - * /`, comparison `== != === !== < > <= >=`, `&& || !`,
  conditional `a ? b : c`.
- Object keys are written bare: `{ resident_name: x, count: 2 }`.

Not available: `let`/`var`/`const`, loops, user functions, imports, `Math`, host
globals, string templates. Everything must be deterministic.

## Host contract for actions called as "actions" (decisions)

An action the host treats as a decision must return an object with
`allowed: true|false` and a non-empty text `outcome`. When `allowed` is false the
action must not change state and must not emit.

An action the host treats as an "observation" must not change state and must not
emit; it returns the object the observer sees.

## Example (unrelated domain)

```hsplus
composition "Greenhouse Heater" {
  state {
    temperature: 18
    heaterOn: false
  }

  logic {
    action readout(sensorName) {
      return {
        sensor: sensorName,
        degrees: state.temperature,
        warnings: ["none"]
      }
    }

    action heat(degrees) {
      if (state.temperature + degrees > 30) {
        return { allowed: false, outcome: "too_hot" }
      }
      state.temperature += degrees
      state.heaterOn = true
      emit("heated", { by: degrees, now: state.temperature })
      return { allowed: true, outcome: "heated" }
    }
  }
}
```
