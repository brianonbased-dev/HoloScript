import { parseHolo } from '../packages/core/src/parser/HoloCompositionParser.js';

const source = `
composition "Test" {
  logic {
    on_enter {
      state.visitors += 1
    }
  }
}
`;

const result = parseHolo(source);
console.log('Success:', result.success);
console.log('Errors:', JSON.stringify(result.errors, null, 2));
if (result.ast?.logic) {
  console.log('Handlers:', result.ast.logic.handlers.length);
  console.log('Handler event:', result.ast.logic.handlers[0]?.event);
}
