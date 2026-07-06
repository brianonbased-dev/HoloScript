import fs from 'fs';
import path from 'path';
import { HoloScriptPlusParser } from '../packages/core/src/parser/HoloScriptPlusParser';

// Configuration
const API_URL = process.env.LLM_API_URL || 'http://localhost:11434/v1/chat/completions';
const API_KEY = process.env.LLM_API_KEY || 'ollama'; // Default for local models
const MODEL = process.env.LLM_MODEL || 'llama3'; // User can override
const GOLD_DATA_PATH = path.join(__dirname, '../data/golden.jsonl');
const PROMPTS_PATH = path.join(__dirname, 'data/synthetic_prompts.json');
const OUTPUT_PATH = path.join(__dirname, '../data/futuristic-holoscript-synthetic.jsonl');

// Initialize parser
const parser = new HoloScriptPlusParser({ enableVRTraits: true, enableTypeScriptImports: true });

async function main() {
  console.log('🚀 Starting Synthetic Data Generation...');
  console.log(`Target Model: ${MODEL}`);
  console.log(`API URL: ${API_URL}`);

  // 1. Load Gold Data (Few-Shot Context)
  if (!fs.existsSync(GOLD_DATA_PATH)) {
    console.error('❌ Gold data file not found!');
    process.exit(1);
  }
  const goldLines = fs
    .readFileSync(GOLD_DATA_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const goldExamples = goldLines
    .slice(0, 4)
    .map((line) => {
      const json = JSON.parse(line);
      return `PROMPT: ${json.prompt}\nCOMPLETION:\n${json.completion}\n---\n`;
    })
    .join('\n');

  console.log(`✅ Loaded ${goldLines.length} Gold Examples for context.`);

  // 2. Load Prompts
  if (!fs.existsSync(PROMPTS_PATH)) {
    console.error('❌ Prompts file not found!');
    process.exit(1);
  }
  const prompts: string[] = JSON.parse(fs.readFileSync(PROMPTS_PATH, 'utf8'));
  console.log(`✅ Loaded ${prompts.length} new prompts.`);

  // 3. Generate Loop
  let validCount = 0;

  // Clear or append? Let's append to avoid data loss on crash, but clear on start for now
  fs.writeFileSync(OUTPUT_PATH, '', 'utf8');

  for (const [i, prompt] of prompts.entries()) {
    console.log(`\n[${i + 1}/${prompts.length}] Generative Task: "${prompt}"`);

    try {
      const generatedCode = await generateCode(prompt, goldExamples);

      // 4. Validate
      const validation = parser.parse(generatedCode);

      if (validation.success) {
        console.log('  ✅ VALID: Syntax Check Passed');

        const entry = {
          prompt: prompt,
          completion: generatedCode,
        };

        fs.appendFileSync(OUTPUT_PATH, JSON.stringify(entry) + '\n', 'utf8');
        validCount++;
        console.log(`  💾 Saved to ${path.basename(OUTPUT_PATH)}`);
      } else {
        console.warn('  ❌ INVALID: Syntax Errors found');
        validation.errors.forEach((e) => console.log(`     - Line ${e.line}: ${e.message}`));
        // Optional: specific retry logic could go here
      }
    } catch (e: any) {
      console.error(`  🔥 GENERATION FAILED: ${e.message}`);
    }
  }

  console.log(`\n✨ Generation Complete. Valid Entries: ${validCount}/${prompts.length}`);
}

async function generateCode(prompt: string, context: string): Promise<string> {
  const systemPrompt = `You are an expert HoloScript programmer. 
Your task is to write valid HoloScript code based on the user's prompt.
Use the provided examples as the absolute source of truth for syntax and style.
Do not output markdown backticks or explanations. Output ONLY the raw HoloScript code.
HoloScript syntax features:
- 'system "Name" { ... }' at top level
- Properties: 'key: value' (no trailing comma needed usually, but allowed)
- Directives: '@directive { ... }' or '@directive "Name" { ... }'
- Logic blocks: 'logic { ... }' for variable declarations (var, let), loops (for, while), and function definitions.
- DO NOT put function definitions (fn, action) outside of 'logic' blocks.
- Use 'function name() { ... }' syntax inside logic blocks.
  `;

  const userMessage = `
Context Examples:
${context}

Task:
PROMPT: ${prompt}
COMPLETION:
`;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    // Strip markdown code blocks if present
    content = content
      .replace(/^```(holoscript|javascript|typescript)?\n/, '')
      .replace(/\n```$/, '');

    return content.trim();
  } catch (err: any) {
    // Fallback for different API shapes if needed, but assuming OpenAI compatible
    throw err;
  }
}

main().catch(console.error);
