import { ARCompiler } from './packages/core/src/compiler/ARCompiler';
import { HoloCompositionParser } from './packages/core/src/parser/HoloCompositionParser';

const parser = new HoloCompositionParser();
const input = `
  composition "QuestHub" {
    spatial_group "store_front" {
      object "scan_target" @ar_beacon(type: "qr", id: "quest_123") {
        mesh: "cube"
      }
    }
  }
`;

const ast = parser.parse(input);
if (!ast.success) {
  console.log('AST Parsing Failed:', JSON.stringify(ast, null, 2));
} else {
  const compiler = new ARCompiler({
    target: 'webxr',
    minify: false,
    source_maps: false,
    features: { hit_test: false, image_tracking: true },
  });

  const result = compiler.compile(ast.ast!);
  console.log('Compilation Success:', result.success);
  // We can hack to call the private method via any
  const extract = (compiler as any).extractNodesWithTrait.bind(compiler);
  const arNodes = extract(ast.ast, '@ar_beacon');
  console.log('arNodes length:', arNodes.length);
  if (arNodes.length > 0) {
    console.log('First arNode name:', arNodes[0].name);
    console.log('Trait config:', arNodes[0].traits);
  } else {
    console.log(
      'AST Tree Traits:',
      JSON.stringify(ast.ast?.spatialGroups![0].objects[0].traits, null, 2)
    );
  }
  console.log('Generated code:');
  console.log(result.code);
}
