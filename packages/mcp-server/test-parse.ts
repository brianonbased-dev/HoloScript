import { HoloLexer } from '@holoscript/core/src/parser/lexer'; // Check where Lexer is
import { parseHolo } from '@holoscript/core';
const source = `composition "SocialScene" {
  environment {
    skybox: "gradient"
    ambient_light: 0.6
  }
}`;
console.log(JSON.stringify(parseHolo(source).errors, null, 2));
