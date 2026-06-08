import { parseHolo } from '@holoscript/core';
import { NextJSCompiler } from '@holoscript/core/compiler/index';

export default async function holoLoader(source) {
  const callback = this.async();

  try {
    const parsed = parseHolo(source);
    if (!parsed.success) {
      return callback(
        new Error(`HoloScript Parse Error: ${parsed.errors[0]?.message || 'Unknown error'}`)
      );
    }

    // We instantiate NextJSCompiler to generate page TSX. Build-time compilation of a trusted,
    // in-repo .holo file needs no agent token — passing none takes CompilerBase's RBAC
    // skip-with-warning path (validateASTAccess). Passing the bogus literal 'build-time-token'
    // (not a valid JWT) instead routed into RBAC verifyToken -> UnauthorizedCompilerAccessError
    // ("Invalid signature or malformed token"), which broke studio's `next build` as soon as the
    // dts steps started passing (2026-06-07; previously masked by earlier deploy failures).
    const compiler = new NextJSCompiler();
    const result = await compiler.compile(parsed.ast);

    // The resulting TSX string gets returned to the pipeline stream
    callback(null, result.code);
  } catch (error) {
    callback(error);
  }
}
