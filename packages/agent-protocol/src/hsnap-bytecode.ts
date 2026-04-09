import { HoloScriptPlusParser } from '../../core/src/parser/HoloScriptPlusParser';
import { UAALCompiler } from '../../uaal/src/index';
import { UAALOpCode } from '../../uaal/src/opcodes';
import type { UAALBytecode, UAALInstruction } from '../../uaal/src/opcodes';

import {
  parseHSNAPPayload,
  type HSNAPAgentMetadata,
  type HSNAPResultMetadata,
  type HSNAPTaskMetadata,
} from './hsnap-router';

export interface HSNAPStateTransition {
  event: string;
  from: string;
  to: string;
  guard?: string;
}

export interface HSNAPStateMachineSummary {
  initial?: string;
  states: string[];
  transitions: HSNAPStateTransition[];
}

export interface HSNAPCallSite {
  name: string;
  argsSource?: string;
}

export interface HSNAPEmitSite {
  event: string;
  payloadSource?: string;
}

export interface HSNAPCompileArtifacts {
  task: HSNAPTaskMetadata;
  result?: HSNAPResultMetadata;
  agent?: HSNAPAgentMetadata;
  stateMachine?: HSNAPStateMachineSummary;
  llmCalls: HSNAPCallSite[];
  toolCalls: HSNAPCallSite[];
  emits: HSNAPEmitSite[];
}

export interface HSNAPCompileOptions {
  includeFullCycle?: boolean;
  taskDescription?: string;
}

export interface HSNAPCompileResult {
  bytecode: UAALBytecode;
  artifacts: HSNAPCompileArtifacts;
}

export function compileHSNAPToUAAL(
  source: string,
  options: HSNAPCompileOptions = {}
): UAALBytecode {
  return compileHSNAPToUAALDetailed(source, options).bytecode;
}

export function compileHSNAPToUAALDetailed(
  source: string,
  options: HSNAPCompileOptions = {}
): HSNAPCompileResult {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });
  const parseResult = parser.parse(source);

  const parsed = parseHSNAPPayload(source);
  const stateMachine = extractStateMachineSummary(source);
  const llmCalls = extractCallSites(source, 'llm_call');
  const toolCalls = extractCallSites(source, 'tool_call');
  const emits = extractEmitSites(source);

  if (
    !parseResult.success &&
    !parsed.task.id &&
    !parsed.task.intent &&
    !parsed.agent?.name &&
    !parsed.result?.task_id &&
    !stateMachine &&
    llmCalls.length === 0 &&
    toolCalls.length === 0 &&
    emits.length === 0
  ) {
    const message = parseResult.errors?.[0]?.message ?? 'Unknown .hsplus parse error';
    throw new Error(`Unable to compile HSNAP source: ${message}`);
  }

  const instructions: UAALInstruction[] = [];

  compileTaskMetadata(instructions, parsed.task);
  compileResultMetadata(instructions, parsed.result);
  compileAgentMetadata(instructions, parsed.agent);
  compileRoutingMetadata(instructions, parsed.task);
  compileStateMachine(instructions, stateMachine);
  compileCallSites(instructions, llmCalls, UAALOpCode.OP_INVOKE_LLM);
  compileCallSites(instructions, toolCalls, UAALOpCode.OP_OFFLOAD);
  compileEmitSites(instructions, emits);

  if (options.includeFullCycle ?? true) {
    const compiler = new UAALCompiler();
    const cycleTask =
      options.taskDescription ??
      parsed.task.intent ??
      parsed.task.id ??
      parsed.agent?.name ??
      'hsnap-task';
    instructions.push(...compiler.buildFullCycle(cycleTask).instructions.slice(0, -1));
  }

  instructions.push({ opCode: UAALOpCode.HALT });

  return {
    bytecode: {
      version: 2,
      instructions,
    },
    artifacts: {
      task: parsed.task,
      result: parsed.result,
      agent: parsed.agent,
      stateMachine,
      llmCalls,
      toolCalls,
      emits,
    },
  };
}

function compileTaskMetadata(instructions: UAALInstruction[], task: HSNAPTaskMetadata): void {
  setStateIfDefined(instructions, 'task.id', task.id);
  setStateIfDefined(instructions, 'task.from', task.from);
  setStateIfDefined(instructions, 'task.to', task.to);
  setStateIfDefined(instructions, 'task.intent', task.intent);
  setStateIfDefined(instructions, 'task.priority', task.priority);
  setStateIfDefined(instructions, 'task.timeout', task.timeout);
  setStateIfDefined(instructions, 'task.skillId', task.skillId);
  setStateIfDefined(instructions, 'task.input', task.input);
  setStateIfDefined(instructions, 'task.idempotency_key', task.idempotency_key);
}

function compileResultMetadata(
  instructions: UAALInstruction[],
  result: HSNAPResultMetadata | undefined
): void {
  if (!result) {
    return;
  }

  setStateIfDefined(instructions, 'result.task_id', result.task_id);
  setStateIfDefined(instructions, 'result.status', result.status);
  setStateIfDefined(instructions, 'result.duration', result.duration);
}

function compileAgentMetadata(
  instructions: UAALInstruction[],
  agent: HSNAPAgentMetadata | undefined
): void {
  if (!agent) {
    return;
  }

  setStateIfDefined(instructions, 'agent.name', agent.name);
  setStateIfDefined(instructions, 'agent.timeout', agent.timeout);
  setStateIfDefined(instructions, 'agent.max_concurrent', agent.max_concurrent);
  if (agent.accepts.length > 0) {
    setStateIfDefined(instructions, 'agent.accepts', agent.accepts);
  }
  if (agent.emits.length > 0) {
    setStateIfDefined(instructions, 'agent.emits', agent.emits);
  }
  if (agent.tools.length > 0) {
    setStateIfDefined(instructions, 'agent.tools', agent.tools);
  }
}

function compileRoutingMetadata(instructions: UAALInstruction[], task: HSNAPTaskMetadata): void {
  if (task.to) {
    instructions.push({ opCode: UAALOpCode.OP_ROUTE_MATCH, operands: [task.to] });
  }
  if (task.intent) {
    instructions.push({ opCode: UAALOpCode.OP_ROUTE_SCORE, operands: [task.intent] });
  }
}

function compileStateMachine(
  instructions: UAALInstruction[],
  stateMachine: HSNAPStateMachineSummary | undefined
): void {
  if (!stateMachine) {
    return;
  }

  instructions.push({ opCode: UAALOpCode.OP_GRAPH_START, operands: ['state_machine'] });
  setStateIfDefined(instructions, 'state_machine.initial', stateMachine.initial);
  if (stateMachine.states.length > 0) {
    setStateIfDefined(instructions, 'state_machine.states', stateMachine.states);
  }
  if (stateMachine.transitions.length > 0) {
    setStateIfDefined(instructions, 'state_machine.transitions', stateMachine.transitions);
  }

  for (const state of stateMachine.states) {
    instructions.push({ opCode: UAALOpCode.OP_NODE_ENTER, operands: [state] });
    instructions.push({ opCode: UAALOpCode.OP_NODE_EXIT, operands: [state] });
  }

  instructions.push({ opCode: UAALOpCode.OP_GRAPH_END, operands: ['state_machine'] });
}

function compileCallSites(
  instructions: UAALInstruction[],
  calls: HSNAPCallSite[],
  opCode: UAALOpCode
): void {
  for (const call of calls) {
    instructions.push({
      opCode,
      operands: [
        call.name,
        call.argsSource
          ? {
              source: call.argsSource,
            }
          : null,
      ],
    });
  }
}

function compileEmitSites(instructions: UAALInstruction[], emits: HSNAPEmitSite[]): void {
  for (const emission of emits) {
    instructions.push({
      opCode: UAALOpCode.OP_EMIT_SIGNAL,
      operands: [
        emission.event,
        emission.payloadSource
          ? {
              source: emission.payloadSource,
            }
          : null,
      ],
    });
  }
}

function setStateIfDefined(
  instructions: UAALInstruction[],
  key: string,
  value: unknown
): void {
  if (value === undefined) {
    return;
  }

  instructions.push({
    opCode: UAALOpCode.OP_STATE_SET,
    operands: [key, value as string | number | boolean | Record<string, unknown> | null | Array<unknown>],
  });
}

function extractStateMachineSummary(source: string): HSNAPStateMachineSummary | undefined {
  const block = extractBalancedDirectiveBlock(source, '@state_machine');
  if (!block) {
    return undefined;
  }

  const initialMatch = block.match(/initial\s*:\s*["']([^"']+)["']/);
  const stateMatches = [...block.matchAll(/state\s+["']([^"']+)["']/g)].map((match) => match[1]);

  const transitions: HSNAPStateTransition[] = [];
  for (const match of block.matchAll(
    /state\s+["']([^"']+)["']\s*\{([\s\S]*?)\n\s*\}/g
  )) {
    const from = match[1];
    const body = match[2];
    for (const transitionMatch of body.matchAll(
      /transition\s+["']([^"']+)["']\s*->\s*["']([^"']+)["']\s*\{([\s\S]*?)\}/g
    )) {
      const [, event, to, transitionBody] = transitionMatch;
      const guard = transitionBody.match(/guard\s*:\s*([^\n}]+)/)?.[1]?.trim();
      transitions.push({ event, from, to, guard });
    }
  }

  return {
    initial: initialMatch?.[1],
    states: stateMatches,
    transitions,
  };
}

function extractCallSites(source: string, functionName: 'llm_call' | 'tool_call'): HSNAPCallSite[] {
  const sites: HSNAPCallSite[] = [];
  const pattern = new RegExp(`${functionName}\\(\\s*["']([^"']+)["']\\s*(?:,\\s*([\\s\\S]*?))?\\)`, 'g');

  for (const match of source.matchAll(pattern)) {
    sites.push({
      name: match[1],
      argsSource: cleanTrailingCallFragment(match[2]),
    });
  }

  return sites;
}

function extractEmitSites(source: string): HSNAPEmitSite[] {
  const emits: HSNAPEmitSite[] = [];
  const pattern = /emit\(\s*["']([^"']+)["']\s*(?:,\s*([\s\S]*?))?\)/g;

  for (const match of source.matchAll(pattern)) {
    emits.push({
      event: match[1],
      payloadSource: cleanTrailingCallFragment(match[2]),
    });
  }

  return emits;
}

function cleanTrailingCallFragment(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function extractBalancedDirectiveBlock(source: string, directive: string): string | undefined {
  const startIndex = source.indexOf(directive);
  if (startIndex === -1) {
    return undefined;
  }

  const braceIndex = source.indexOf('{', startIndex);
  if (braceIndex === -1) {
    return undefined;
  }

  let depth = 0;
  for (let index = braceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceIndex + 1, index);
      }
    }
  }

  return undefined;
}