/**
 * A word that names an Object.prototype member is an ordinary name in `.holo`.
 *
 * The lexer typed every word through `KEYWORDS[word.toLowerCase()]`, and KEYWORDS
 * is a plain object, so `constructor` (in any case) and `__proto__` came back as an
 * Object.prototype member instead of undefined. That member became the token's type.
 * An object with a `constructor:` property then lost its whole property list, with
 * no error and no warning. Found while reviewing #478.
 */
import { describe, expect, it } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';

function crane(property: string) {
  const result = parseHolo(
    `composition "Site" {\n  object "Crane" {\n    ${property}: "Acme Builders"\n    height: 40\n  }\n}`
  );
  const props = result.ast?.objects?.[0]?.properties ?? [];
  return { errors: result.errors, props: props.map((p) => [p.key, p.value]) };
}

describe('.holo names that Object.prototype also uses', () => {
  it.each(['constructor', 'Constructor'])('keeps an object property named %s', (name) => {
    expect(crane(name)).toEqual({
      errors: [],
      props: [
        [name, 'Acme Builders'],
        ['height', 40],
      ],
    });
  });

  it('reads keywords as before', () => {
    const result = parseHolo(`composition "Site" {\n  object "Crane" { height: 40 }\n}`);
    expect(result.errors).toEqual([]);
    expect(result.ast?.objects?.[0]?.name).toBe('Crane');
  });
});
