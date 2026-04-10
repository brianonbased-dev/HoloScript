import { HoloCompositionParser } from './packages/core/src/parser/HoloCompositionParser';

const parser = new HoloCompositionParser();
const input = `
  composition "PhoenixTwin" {
    zone#downtown @vrr_twin {
      geo_coords: { lat: 33.4484, lng: -112.0740 }
    }
  }
`;
const ast = parser.parse(input);
console.log(JSON.stringify(ast, null, 2));
