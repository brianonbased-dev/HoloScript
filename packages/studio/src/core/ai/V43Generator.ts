import { HoloScriptPlusParser } from '@holoscript/core';
import { ASTNode } from "@holoscript/platform";

export class V43Generator {
  private endpoint: string;
  private model: string;

  constructor(endpoint = 'http://localhost:11435/chat', model = 'brittney-qwen-v43-q8_0') {
    this.endpoint = endpoint;
    this.model = model;
  }

  /**
   * Queries the V43 Brittney LLM with a specific architectural prompt and
   * returns raw executable HoloScript source code.
   */
  async generateHoloScript(prompt: string): Promise<string> {
    const payload = {
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an elite HoloScript architect. Output only valid HoloScript code inside ```holoscript blocks. Do not explain your code. Use valid geometric and material properties.',
        },
        { role: 'user', content: prompt },
      ],
    };

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`V43 Generator Fetch Error: ${res.statusText}`);
    }

    const data = await res.json();
    const content = data.content || data.message?.content || data.response || '';

    // Safely extract the code block
    const match = content.match(/```holoscript\n([\s\S]*?)```/);
    return match ? match[1].trim() : content.trim();
  }

  /**
   * Synthesizes prompt into dynamically parsable AST Nodes ready for WebGL injection.
   */
  async generateAST(prompt: string): Promise<ASTNode[]> {
    const code = await this.generateHoloScript(prompt);
    const parser = new HoloScriptPlusParser();
    const result = parser.parse(code);
    return result?.ast?.body || [];
  }
}
