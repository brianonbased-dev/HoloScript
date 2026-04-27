/**
 * Abstract Syntax Tree (AST) node types for HoloScript robotics
 */

export type PropertyValue = string | number | boolean | number[] | PropertyValue[];

export interface ObjectNode {
  type: 'object';
  name: string;
  traits: string[];
  properties: Record<string, PropertyValue>;
  template?: string;
  line?: number;
  column?: number;
}

export interface CompositionNode {
  type: 'composition';
  name: string;
  objects: ObjectNode[];
  line?: number;
  column?: number;
}

export type ASTNode = CompositionNode | ObjectNode;
