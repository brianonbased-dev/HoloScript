'use client';

import type { TraitPackage } from '@/types';
import { FileText } from 'lucide-react';

interface ReadmeTabProps {
  trait: TraitPackage;
}

export function ReadmeTab({ trait }: ReadmeTabProps) {
  if (!trait.readme) {
    return (
      <div className="text-center py-16">
        <FileText className="h-16 w-16 mx-auto text-zinc-300 dark:text-zinc-600 mb-4" />
        <p className="text-lg text-zinc-600 dark:text-zinc-400">No readme available</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
          The author hasn&apos;t provided documentation for this trait yet.
        </p>
      </div>
    );
  }

  // Simple markdown-like rendering (in production, use a proper markdown library)
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLanguage = '';

    lines.forEach((line, i) => {
      // Code block start
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          // End code block
          elements.push(
            <pre
              key={i}
              className="bg-zinc-900 dark:bg-zinc-950 rounded-lg p-4 overflow-x-auto my-4"
            >
              <code className="text-sm text-zinc-100 font-mono">{codeContent.join('\n')}</code>
            </pre>
          );
          codeContent = [];
          inCodeBlock = false;
        } else {
          // Start code block
          codeLanguage = line.slice(3);
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        return;
      }

      // Headers
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={i} className="text-3xl font-bold text-zinc-900 dark:text-white mt-8 mb-4">
            {line.slice(2)}
          </h1>
        );
        return;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={i} className="text-2xl font-bold text-zinc-900 dark:text-white mt-6 mb-3">
            {line.slice(3)}
          </h2>
        );
        return;
      }
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={i} className="text-xl font-semibold text-zinc-900 dark:text-white mt-4 mb-2">
            {line.slice(4)}
          </h3>
        );
        return;
      }

      // List items
      if (line.startsWith('- ') || line.startsWith('* ')) {
        elements.push(
          <li key={i} className="text-zinc-600 dark:text-zinc-400 ml-4 list-disc">
            {renderInline(line.slice(2))}
          </li>
        );
        return;
      }

      // Empty line
      if (line.trim() === '') {
        elements.push(<div key={i} className="h-4" />);
        return;
      }

      // Paragraph
      elements.push(
        <p key={i} className="text-zinc-600 dark:text-zinc-400 mb-2">
          {renderInline(line)}
        </p>
      );
    });

    return elements;
  };

  // Render inline formatting (bold, italic, code, links)
  const renderInline = (text: string): React.ReactNode => {
    // Very simple inline code rendering
    const parts = text.split(/(`[^`]+`)/);
    return parts.map((part, i) => {
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-sm font-mono text-holoscript-600 dark:text-holoscript-400"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      // Bold
      if (part.includes('**')) {
        const boldParts = part.split(/(\*\*[^*]+\*\*)/);
        return boldParts.map((bp, j) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return (
              <strong key={`${i}-${j}`} className="font-semibold text-zinc-900 dark:text-white">
                {bp.slice(2, -2)}
              </strong>
            );
          }
          return bp;
        });
      }
      return part;
    });
  };

  return (
    <div className="max-w-4xl">
      <article className="prose prose-zinc dark:prose-invert max-w-none">
        {renderContent(trait.readme)}
      </article>
    </div>
  );
}
