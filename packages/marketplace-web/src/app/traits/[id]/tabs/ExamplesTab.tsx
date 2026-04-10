'use client';

import { useState } from 'react';
import type { TraitPackage } from '@/types';
import { Code, Copy, Check, ChevronDown, ChevronUp, FileCode, Play } from 'lucide-react';

interface ExamplesTabProps {
  trait: TraitPackage;
}

interface Example {
  title: string;
  description?: string;
  code: string;
  language: string;
}

export function ExamplesTab({ trait }: ExamplesTabProps) {
  // In a real implementation, examples would come from the trait package
  // For now, we'll generate some based on the trait's content
  const examples = generateExamples(trait);

  if (examples.length === 0) {
    return (
      <div className="text-center py-16">
        <Code className="h-16 w-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No examples available</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
          This trait doesn&apos;t have any usage examples yet.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
          Usage Examples ({examples.length})
        </h2>
      </div>

      <div className="space-y-6">
        {examples.map((example, index) => (
          <ExampleBlock key={index} example={example} index={index} />
        ))}
      </div>

      {/* Quick Reference */}
      <div className="mt-8 p-6 bg-gradient-to-r from-holoscript-50 to-purple-50 dark:from-holoscript-900/20 dark:to-purple-900/20 rounded-lg border border-holoscript-200 dark:border-holoscript-800">
        <h3 className="font-semibold text-holoscript-900 dark:text-holoscript-100 mb-3">
          Quick Start
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-holoscript-700 dark:text-holoscript-300">
          <li>
            Install the trait:{' '}
            <code className="px-1 bg-holoscript-100 dark:bg-holoscript-900/40 rounded">
              holo trait add {trait.name}
            </code>
          </li>
          <li>
            Import in your HoloScript:{' '}
            <code className="px-1 bg-holoscript-100 dark:bg-holoscript-900/40 rounded">
              use {trait.name}::*;
            </code>
          </li>
          <li>Use the exported traits and functions in your code</li>
        </ol>
      </div>
    </div>
  );
}

interface ExampleBlockProps {
  example: Example;
  index: number;
}

function ExampleBlock({ example, index }: ExampleBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(index === 0);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(example.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = example.code.split('\n');
  const previewLines = lines.slice(0, 5).join('\n');
  const hasMore = lines.length > 5;

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      {/* Example Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <FileCode className="h-4 w-4 text-holoscript-500" />
          <span className="font-medium text-zinc-900 dark:text-white">{example.title}</span>
          <span className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs rounded">
            {example.language}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Example Description */}
      {example.description && (
        <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-900/30 border-b border-zinc-200 dark:border-zinc-700">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{example.description}</p>
        </div>
      )}

      {/* Code Block */}
      <div className="relative">
        <pre className="p-4 overflow-x-auto">
          <code className="text-sm font-mono">
            {expanded ? (
              <HighlightedCode code={example.code} language={example.language} />
            ) : (
              <HighlightedCode code={previewLines} language={example.language} />
            )}
          </code>
        </pre>

        {hasMore && !expanded && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-zinc-800 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Expand/Collapse */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 text-sm text-holoscript-600 dark:text-holoscript-400 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 border-t border-zinc-200 dark:border-zinc-700 flex items-center justify-center gap-1"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" /> Show {lines.length - 5} more lines
            </>
          )}
        </button>
      )}
    </div>
  );
}

interface HighlightedCodeProps {
  code: string;
  language: string;
}

function HighlightedCode({ code, language }: HighlightedCodeProps) {
  // Simple syntax highlighting - in production, you'd use a proper highlighter
  const highlightLine = (line: string) => {
    // HoloScript keywords
    const keywords =
      /\b(trait|fn|let|const|if|else|for|while|loop|match|use|pub|impl|struct|enum|type|return|await|async|spawn|entity|component|world)\b/g;
    const strings = /(["'`])(.*?)\1/g;
    const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
    const numbers = /\b(\d+\.?\d*)\b/g;
    const functions = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;

    let result = line;

    // Comments
    result = result.replace(comments, '<span class="text-zinc-400 dark:text-zinc-500">$1</span>');

    // Strings
    result = result.replace(
      strings,
      '<span class="text-amber-600 dark:text-amber-400">$1$2$1</span>'
    );

    // Keywords
    result = result.replace(
      keywords,
      '<span class="text-purple-600 dark:text-purple-400 font-semibold">$1</span>'
    );

    // Numbers
    result = result.replace(numbers, '<span class="text-cyan-600 dark:text-cyan-400">$1</span>');

    // Functions (simple detection)
    result = result.replace(functions, '<span class="text-blue-600 dark:text-blue-400">$1</span>(');

    return result;
  };

  const lines = code.split('\n');

  return (
    <div className="space-y-0">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="w-8 text-right pr-4 text-zinc-400 dark:text-zinc-600 select-none text-xs">
            {i + 1}
          </span>
          <span
            dangerouslySetInnerHTML={{ __html: highlightLine(line) || '&nbsp;' }}
            className="flex-1 text-zinc-800 dark:text-zinc-200"
          />
        </div>
      ))}
    </div>
  );
}

function generateExamples(trait: TraitPackage): Example[] {
  const examples: Example[] = [];

  // Basic usage example
  examples.push({
    title: 'Basic Usage',
    description: `Import and use the ${trait.name} trait in your HoloScript project.`,
    code: `// Import the trait
use ${trait.name}::*;

// Create an entity with the trait
entity MyEntity {
    component ${toPascalCase(trait.name)} {
        // Configure the component
    }
}`,
    language: 'holoscript',
  });

  // If it has dependencies, show integration example
  if (trait.dependencies && Object.keys(trait.dependencies).length > 0) {
    const deps = Object.keys(trait.dependencies).slice(0, 2);
    examples.push({
      title: 'With Dependencies',
      description: 'Example showing integration with required dependencies.',
      code: `// Import all required traits
use ${trait.name}::*;
${deps.map((d) => `use ${d}::*;`).join('\n')}

// Create a world with integrated components
world IntegratedWorld {
    entity MainEntity {
        component ${toPascalCase(trait.name)} {
            // Primary configuration
        }
        ${deps.map((d) => `component ${toPascalCase(d)} { }`).join('\n        ')}
    }
}`,
      language: 'holoscript',
    });
  }

  // Advanced usage
  examples.push({
    title: 'Advanced Configuration',
    description: 'More complex usage patterns and configuration options.',
    code: `use ${trait.name}::*;

// Define a custom implementation
trait Custom${toPascalCase(trait.name)} : ${toPascalCase(trait.name)} {
    fn on_init() {
        // Custom initialization logic
        println!("Initializing custom ${trait.name}");
    }
    
    fn on_update(dt: f32) {
        // Custom update logic
        let state = self.get_state();
        if state.is_active {
            self.process(dt);
        }
    }
}

// Use the custom trait
entity CustomEntity {
    component Custom${toPascalCase(trait.name)} {
        active: true,
        config: {
            debug: false,
            performance: "high"
        }
    }
}`,
    language: 'holoscript',
  });

  return examples;
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_@/]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
