import React from 'react';
import type { TextDiffLine } from '../types';
import { LINE_BG, LINE_COLOR, LINE_PREFIX } from '../constants';

export function TextDiffRow({ line }: { line: TextDiffLine }) {
  return (
    <tr className={LINE_BG[line.type]}>
      <td className="select-none w-8 pr-2 text-right font-mono text-[8px] text-studio-muted/40">
        {line.type !== 'added' ? (line.lineA ?? '') : ''}
      </td>
      <td className="select-none w-8 pr-2 text-right font-mono text-[8px] text-studio-muted/40">
        {line.type !== 'removed' ? (line.lineB ?? '') : ''}
      </td>
      <td className={`select-none w-3 font-mono text-[9px] ${LINE_COLOR[line.type]}`}>
        {LINE_PREFIX[line.type]}
      </td>
      <td className={`whitespace-pre font-mono text-[9px] ${LINE_COLOR[line.type]}`}>
        {line.text}
      </td>
    </tr>
  );
}
