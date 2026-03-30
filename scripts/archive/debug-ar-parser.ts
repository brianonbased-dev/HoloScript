import { HoloCompositionParser } from './packages/core/src/parser/HoloCompositionParser';

const parser = new HoloCompositionParser();
const input = `
  composition "ARMenu" {
    zone "cafe_table" {
      ui "menu_panel" @overlay {
        layout: "vertical"
        text: "Today's Specials"
      }
    }
  }
`;
const ast = parser.parse(input);
if (!ast.success) {
  console.log('AST Parsing Failed:');
  console.log(JSON.stringify(ast, null, 2));
} else {
  console.log('AST Parsing Succeeded');
}
