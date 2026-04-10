/**
 * HoloScript LSP - Prompt Builder
 *
 * Builds prompts for AI completion queries.
 */

import type { CompletionContext, ErrorContext } from './ContextGatherer';

/**
 * Prompt builder for AI completions
 */
export class PromptBuilder {
  /**
   * System prompt for HoloScript AI
   */
  private readonly systemPrompt = `You are a HoloScript expert assistant. HoloScript is a domain-specific language for creating VR/XR experiences.

Key concepts:
- Objects are declared with: orb, world, object, template, composition
- Traits are annotations like @grabbable, @physics, @networked
- Event handlers: onGrab, onRelease, onClick, onHoverEnter, etc.
- Properties: position, rotation, scale, color, geometry, physics, etc.

Be concise. Provide code snippets without explanation unless asked.`;

  /**
   * Build prompt for trait suggestions
   */
  public buildTraitPrompt(context: CompletionContext): string {
    const existingTraits = context.existingTraits?.join(', ') || 'none';
    const objectType = context.objectType || 'object';
    const objectName = context.objectName || 'unnamed';

    return `${this.systemPrompt}

Context:
- Object type: ${objectType}
- Object name: "${objectName}"
- Existing traits: ${existingTraits}
- File: ${context.filePath}

The user is typing a trait annotation (@). Based on the object type and existing traits, suggest the most appropriate traits to add.

Rules:
- Don't suggest traits that already exist
- Prioritize traits that complement existing ones
- For interactive objects, consider: @grabbable, @pointable, @collidable
- For visual objects, consider: @animated, @glowing, @emissive
- For networked objects, consider: @networked, @synced, @persistent

Surrounding code:
${context.surroundingLines.join('\n')}

Respond with a comma-separated list of trait names (without @):`;
  }

  /**
   * Build prompt for code generation from comment
   */
  public buildCodeGenPrompt(context: CompletionContext): string {
    return `${this.systemPrompt}

The user wrote this comment:
"${context.comment}"

Context:
- Object: ${context.objectType || 'unknown'} ${context.objectName || ''}
- Existing traits: ${context.existingTraits?.join(', ') || 'none'}
- File: ${context.filePath}

Surrounding code:
${context.surroundingLines.join('\n')}

Generate HoloScript code that implements what the comment describes. Use .hsplus syntax.
Respond with ONLY the code in a code block, no explanation:`;
  }

  /**
   * Build prompt for property suggestions
   */
  public buildPropertyPrompt(context: CompletionContext): string {
    const existingProperties = context.existingProperties?.join(', ') || 'none';

    return `${this.systemPrompt}

Context:
- Object: ${context.objectType || 'unknown'} ${context.objectName || ''}
- Existing properties: ${existingProperties}
- Traits: ${context.existingTraits?.join(', ') || 'none'}
- Line prefix: "${context.linePrefix}"

Surrounding code:
${context.surroundingLines.join('\n')}

Suggest the most likely property name and value based on:
1. Common HoloScript properties: position, rotation, scale, color, geometry, physics
2. What's missing from the object
3. What makes sense for the object type

Respond with property suggestions in format "propertyName: value", one per line:`;
  }

  /**
   * Build prompt for event handler suggestions
   */
  public buildEventPrompt(context: CompletionContext): string {
    const traits = context.existingTraits?.join(', ') || 'none';

    return `${this.systemPrompt}

Context:
- Object: ${context.objectType || 'unknown'} ${context.objectName || ''}
- Traits: ${traits}
- Current input: "${context.linePrefix}"

Based on the traits, suggest appropriate event handlers:
- @grabbable → onGrab, onRelease, onSwing
- @pointable → onPoint, onClick
- @collidable → onTriggerEnter, onTriggerExit, onCollision
- @hoverable → onHoverEnter, onHoverExit

Respond with event handler names, one per line:`;
  }

  /**
   * Build prompt for error fix suggestions
   */
  public buildErrorFixPrompt(
    context: ErrorContext,
    error: { message: string; line: number; column: number }
  ): string {
    return `${this.systemPrompt}

Error occurred:
"${error.message}"
At line ${error.line + 1}, column ${error.column + 1}

Context:
- File: ${context.filePath}
- Object: ${context.objectType || 'unknown'} ${context.objectName || ''}

Problematic code:
${context.surroundingLines.join('\n')}

Analyze the error and provide a corrected version of the code.
Common fixes:
- Typos in trait names (@grabaable → @grabbable)
- Missing colons after property names
- Unclosed braces or brackets
- Invalid property values

Respond with the corrected code in a code block:`;
  }

  /**
   * Build prompt for general completions
   */
  public buildGeneralPrompt(context: CompletionContext): string {
    return `${this.systemPrompt}

Context:
- Line prefix: "${context.linePrefix}"
- Object: ${context.objectType || 'unknown'} ${context.objectName || ''}
- Traits: ${context.existingTraits?.join(', ') || 'none'}

Surrounding code:
${context.surroundingLines.join('\n')}

What is the user most likely trying to type? Consider:
1. Common HoloScript patterns
2. What would logically follow from the context
3. Best practices for VR development

Respond with the most likely completion (just the code, no explanation):`;
  }

  /**
   * Build prompt for trait recommendations (proactive)
   */
  public buildTraitRecommendationPrompt(context: CompletionContext): string {
    return `${this.systemPrompt}

Analyze this HoloScript object and suggest traits that would improve it:

Object: ${context.objectType || 'unknown'} ${context.objectName || ''}
Current traits: ${context.existingTraits?.join(', ') || 'none'}
Properties: ${context.existingProperties?.join(', ') || 'none'}

Code:
${context.surroundingLines.join('\n')}

Based on the object's purpose (inferred from name and properties), suggest traits that would:
1. Enable common interactions
2. Add visual polish
3. Support multiplayer (if relevant)

Format your response as:
@traitname - reason

List up to 5 recommendations:`;
  }
}
