import { describe, expect, it } from 'vitest';
import { lookalikeOf, nameSkeleton } from '../lookalikeName';

describe('lookalike client names', () => {
  it('flags plain and decorated uses of protected names', () => {
    expect(lookalikeOf('HoloScript Official')).toBe('HoloScript');
    expect(lookalikeOf('holoscript-studio helper')).toBe('HoloScript Studio');
    expect(lookalikeOf('My Claude Bridge')).toBe('Claude');
  });

  it('folds Unicode compatibility forms, diacritics and confusables', () => {
    expect(lookalikeOf('ＨｏｌｏＳｃｒｉｐｔ')).toBe('HoloScript'); // fullwidth (NFKC)
    expect(lookalikeOf('HoIoScript')).toBe('HoloScript'); // capital i for l
    expect(lookalikeOf('Hоlоscript')).toBe('HoloScript'); // Cyrillic o
    expect(lookalikeOf('H0l0Scr1pt')).toBe('HoloScript'); // digits
    expect(lookalikeOf('Hólòscrípt')).toBe('HoloScript'); // diacritics
    expect(lookalikeOf('Holo Script')).toBe('HoloScript'); // spacing
    expect(lookalikeOf('Open AI')).toBe('OpenAI');
    expect(lookalikeOf('Curs0r')).toBe('Cursor');
    expect(lookalikeOf('Gооgle')).toBe('Google');
    expect(nameSkeleton('cornet')).toBe('comet'); // rn -> m
  });

  it('leaves unrelated names alone', () => {
    expect(lookalikeOf('Weather Agent')).toBeNull();
    expect(lookalikeOf('Dana\'s research bot')).toBeNull();
    expect(lookalikeOf('')).toBeNull();
    expect(lookalikeOf(null)).toBeNull();
  });
});
