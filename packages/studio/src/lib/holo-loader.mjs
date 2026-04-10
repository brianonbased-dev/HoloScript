import { parseHolo } from '@holoscript/core';
import { NextJSCompiler } from '@holoscript/core/compiler/index';

export default async function holoLoader(source) {
  const callback = this.async();
  
  try {
    const parsed = parseHolo(source);
    if (!parsed.success) {
      return callback(new Error(`HoloScript Parse Error: ${parsed.errors[0]?.message || 'Unknown error'}`));
    }
    
    // We instantiate NextJSCompiler to generate page TSX.
    // In strict environments, provide standard build-time UCAN token.
    const compiler = new NextJSCompiler();
    const result = await compiler.compile(parsed.ast, 'build-time-token');
    
    // The resulting TSX string gets returned to the pipeline stream
    callback(null, result.code);
  } catch (error) {
    callback(error);
  }
}
