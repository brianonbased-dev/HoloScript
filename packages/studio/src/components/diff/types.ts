export interface HoloProp {
  key: string;
  value: string;
  line: number;
}

export interface HoloTrait {
  name: string;
  line: number;
}

export interface HoloObject {
  name: string;
  traits: HoloTrait[];
  properties: HoloProp[];
  startLine: number;
  endLine: number;
}

export interface HoloComposition {
  name: string;
  objects: HoloObject[];
  raw: string;
  lines: string[];
}

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface ObjectDiff {
  name: string;
  status: DiffStatus;
  objectA?: HoloObject;
  objectB?: HoloObject;
  traitDiffs: { name: string; status: DiffStatus }[];
  propDiffs: { key: string; status: DiffStatus; valueA?: string; valueB?: string }[];
}

export interface TextDiffLine {
  type: 'added' | 'removed' | 'same';
  text: string;
  lineA?: number;
  lineB?: number;
}

export type ViewMode = 'text' | 'visual';
