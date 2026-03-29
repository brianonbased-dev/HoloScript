import fs from 'fs';
import path from 'path';

const AI_WORKSPACE = process.env.AI_WORKSPACE_PATH || path.join(require('os').homedir(), 'Documents', 'GitHub', 'AI_Workspace');
const INPUT_FILE = path.join(AI_WORKSPACE, 'brittney-training', 'brittney-mcp-training.jsonl');
const OUTPUT_FILE = path.join(AI_WORKSPACE, 'brittney-training', 'brittney-mcp-training-reasoning.jsonl');

// Heuristic mapping for thoughts based on tool names
const TOOL_THOUGHTS: Record<string, (args: any) => string> = {
  brittney_scan_project: () =>
    'User wants to explore the project structure.\nI need to scan the directory to identify HoloScript files and assets.',
  brittney_docs: (args) =>
    `User is asking about "${args.query}".\nI should search the documentation index for relevant entries on "${args.type || 'general'}" to provide accurate information.`,
  suggest_traits: (args) =>
    `User needs trait suggestions for "${args.description}".\nI will analyze the object's intended behavior and recommend traits that enable those features (e.g., Grabbable, physics).`,
  brittney_diagnostics: () =>
    'User provided code that may contain errors.\nI will run the diagnostics tool to check for syntax errors, type mismatches, and unknown symbols.',
  brittney_autocomplete: () =>
    'User is typing code.\nI should contextually analyze the cursor position and provide relevant autocomplete suggestions associated with the partial symbol.',
  brittney_refactor: (args) =>
    `User wants to perform a "${args.operation}" refactoring.\nI will use the refactor tool to safely modify the code structure while preserving semantics.`,
  get_examples: (args) =>
    `User asked for an example matching "${args.pattern}".\nI will search the examples library to find a relevant code snippet that demonstrates this pattern.`,
  parse_hs: () =>
    'User wants to understand the code structure.\nI will parse the HoloScript into an AST to reveal its internal hierarchy.',
  parse_holo: () =>
    'User wants to understand the composition structure.\nI will parse the .holo file to extract the node graph.',
  validate_holoscript: () =>
    'User asked for validation.\nI will run the strict validator to ensure the code adheres to the HoloScript spec.',
  generate_object: (args) =>
    `User wants to create "${args.description}".\nI will use the object generator to construct a valid HoloScript object definition with appropriate properties and traits.`,
  generate_scene: (args) =>
    `User wants to create a scene described as "${args.description}".\nI will use the scene generator to build a complete composition with spatial groups and logic.`,
  explain_code: () =>
    "User requested code explanation.\nI will analyze the code's AST and traits to generate a human-readable summary of its behavior.",
  analyze_code: () =>
    'User requested code analysis.\nI will calculate complexity metrics and structural statistics for the provided snippet.',
  get_syntax_reference: (args) =>
    `User asked for syntax help on "${args.topic}".\nI will retrieve the formal syntax specification for this construct.`,
  brittney_analyze_performance: () =>
    'User is experiencing performance issues.\nI will run the performance analyzer to identify bottlenecks in rendering or logic.',
  brittney_error_monitor: () =>
    'User suspects runtime errors.\nI will check the error monitor logs for any recent exceptions or warnings.',
  brittney_auto_fix: () =>
    'User requested an automatic fix.\nI will apply the recommended fixes for the detected errors.',
  brittney_explain_scene: () =>
    'User wants to understand the active scene.\nI will inspect the runtime scene graph and describe the hierarchy and active objects.',
  holo_visualize_flow: () =>
    'User wants to see event flow.\nI will generate a visual representation of the event-action graph to show how logic propagates.',
  holo_parse_to_graph: () =>
    'User wants a graph view.\nI will parse the code into a node-edge graph structure.',
  holo_get_node_connections: (args) =>
    `User wants to see connections for "${args.nodeName}".\nI will traverse the graph to find all incoming and outgoing edges for this node.`,
  brittney_scene_snapshot: () =>
    'User wants to save the current state.\nI will capture a snapshot of the scene graph for versioning.',
  brittney_compare_snapshots: () =>
    'User wants to see changes.\nI will calculate the diff between the two requested snapshots.',
  brittney_record_session: () =>
    'User, wants to record the session.\nI will initialize the session recorder to capture all actions.',
  brittney_accessibility_check: () =>
    'User wants to check accessibility.\nI will run the a11y auditor to verify contrast, sizing, and screen reader support.',
  brittney_test_scene: () =>
    'User wants to run tests.\nI will execute the test suite for the current scene configuration.',
  brittney_create_and_inject: (args) =>
    `User wants to inject "${args.description}".\nI will generate the code and immediately inject it into the active runtime environment.`,
  brittney_holoscript_templates: (args) =>
    `User requested templates for "${args.category}".\nI will retrieve the standard template library for this category.`,
  brittney_holoscript_diff: () =>
    'User wants to see the impact of changes.\nI will compute a diff between the current runtime state and the proposed code.',
  brittney_holoscript_playground: (args) =>
    `User wants to "${args.action}" code in the playground.\nI will execute the playground environment with the provided snippet.`,
  brittney_hover: () =>
    'User is hovering over a symbol.\nI will provide tooltip information including type, documentation, and values.',
  brittney_go_to_definition: (args) =>
    `User wants to find the definition of "${args.symbol}".\nI will resolve the symbol's location in the codebase.`,
  brittney_find_references: (args) =>
    `User wants to find references to "${args.symbol}".\nI will search the codebase for all usages of this symbol.`,
  brittney_code_action: () =>
    'User requested code actions.\nI will identify available refactorings or quick fixes for the current context.',
};

function processLine(line: string): string {
  if (!line.trim()) return line;
  try {
    const entry = JSON.parse(line);
    const messages = entry.messages;
    const assistantMsg = messages.find((m: any) => m.role === 'assistant');

    if (assistantMsg && assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      const toolCall = assistantMsg.tool_calls[0]; // Assuming primary tool
      const toolName = toolCall.name;
      const toolArgs = toolCall.arguments;

      let thought = 'Analyzing request...';
      if (TOOL_THOUGHTS[toolName]) {
        thought = TOOL_THOUGHTS[toolName](toolArgs);
      } else {
        console.warn(`No thought template for tool: ${toolName}`);
      }

      // Inject [Think] block
      const originalContent = assistantMsg.content || '';
      assistantMsg.content = `[Think]\n${thought}\n[/Think]\n\n${originalContent}`;
    }

    return JSON.stringify(entry);
  } catch (e) {
    console.error('Error processing line:', e);
    return line;
  }
}

async function main() {
  console.log(`Reading from ${INPUT_FILE}...`);
  const content = fs.readFileSync(INPUT_FILE, 'utf-8');
  const lines = content.split('\n');

  console.log(`Processing ${lines.length} lines...`);
  const newLines = lines.map(processLine);

  console.log(`Writing to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, newLines.join('\n'));
  console.log('Done.');
}

main().catch(console.error);
