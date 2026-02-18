import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { TitleCard } from "../components/TitleCard";
import { CodeStep } from "../components/CodeStep";

const STEPS = [
  {
    title: "Install & Import",
    description: "Install the unified LLM provider package and create your first provider instance.",
    lines: [
      { content: "# Install the SDK", dim: true },
      { content: "npm install @holoscript/llm-provider", highlight: true, annotation: "unified interface" },
      { content: "" },
      { content: 'import { createProvider } from "@holoscript/llm-provider"', highlight: true },
      { content: 'import type { LLMProvider, GenerateOptions } from "@holoscript/llm-provider"' },
      { content: "" },
      { content: "// Supported providers", dim: true },
      { content: "// 'anthropic' | 'openai' | 'gemini' | 'mock'" },
      { content: "" },
      { content: "const provider: LLMProvider = createProvider('anthropic', {", highlight: true },
      { content: "  apiKey: process.env.ANTHROPIC_API_KEY!", annotation: "from env" },
      { content: "})" },
    ],
  },
  {
    title: "Anthropic Provider",
    description: "Use the Anthropic provider to call Claude models with the standard generateText interface.",
    lines: [
      { content: 'import { createProvider } from "@holoscript/llm-provider"', highlight: true },
      { content: "" },
      { content: "const anthropic = createProvider('anthropic', {", highlight: true },
      { content: "  apiKey: process.env.ANTHROPIC_API_KEY!," },
      { content: "  model: 'claude-opus-4-6',", annotation: "latest frontier model" },
      { content: "})" },
      { content: "" },
      { content: "const result = await anthropic.generateText({", highlight: true },
      { content: "  prompt: 'Generate a HoloScript scene with a bouncing sphere'," },
      { content: "  maxTokens: 1024," },
      { content: "  temperature: 0.7," },
      { content: "})" },
      { content: "" },
      { content: "console.log(result.text)   // the generated .holo scene", type: "added" as const, annotation: "→ string" },
      { content: "console.log(result.usage)  // { inputTokens, outputTokens }", type: "added" as const },
    ],
  },
  {
    title: "OpenAI Provider",
    description: "Swap to GPT-4o with a single line change — the interface is identical across all providers.",
    lines: [
      { content: 'import { createProvider } from "@holoscript/llm-provider"', highlight: true },
      { content: "" },
      { content: "const openai = createProvider('openai', {", highlight: true },
      { content: "  apiKey: process.env.OPENAI_API_KEY!," },
      { content: "  model: 'gpt-4o',", annotation: "same interface, different model" },
      { content: "})" },
      { content: "" },
      { content: "// Identical call signature to Anthropic provider", dim: true },
      { content: "const result = await openai.generateText({", highlight: true },
      { content: "  prompt: 'Generate a HoloScript scene with a bouncing sphere'," },
      { content: "  maxTokens: 1024," },
      { content: "  temperature: 0.7," },
      { content: "})" },
      { content: "" },
      { content: "// Drop-in replacement — no other code changes needed", type: "added" as const, highlight: true },
    ],
  },
  {
    title: "Scene Generation with LLM",
    description: "Use prompt engineering to reliably generate valid .holo scene code from natural language.",
    lines: [
      { content: 'import { createProvider } from "@holoscript/llm-provider"', highlight: true },
      { content: 'import { parse } from "@holoscript/core"' },
      { content: "" },
      { content: "const SYSTEM_PROMPT = `", highlight: true, annotation: "system prompt" },
      { content: "You are a HoloScript scene generator." },
      { content: "Always respond with valid .holo syntax only." },
      { content: "Use scene { } as the root block.`" },
      { content: "" },
      { content: "const result = await provider.generateText({", highlight: true },
      { content: "  system: SYSTEM_PROMPT," },
      { content: "  prompt: 'A tropical island with palm trees and waves'," },
      { content: "})" },
      { content: "" },
      { content: "// Validate the generated scene parses correctly", dim: true },
      { content: "const parseResult = parse(result.text)", type: "added" as const },
      { content: "if (!parseResult.ok) throw new Error('LLM generated invalid .holo')", type: "added" as const },
    ],
  },
  {
    title: "Streaming & Batch",
    description: "Use streamText for real-time output and batchGenerate to compile multiple targets simultaneously.",
    lines: [
      { content: "// Streaming — tokens arrive incrementally", highlight: true },
      { content: "const stream = await provider.streamText({", highlight: true },
      { content: "  prompt: 'Generate a space station scene'," },
      { content: "})" },
      { content: "" },
      { content: "for await (const chunk of stream) {", type: "added" as const },
      { content: "  process.stdout.write(chunk.delta)  // print as it arrives", type: "added" as const },
      { content: "}", type: "added" as const },
      { content: "" },
      { content: "// Batch — generate for multiple targets in parallel", highlight: true },
      { content: "const results = await provider.batchGenerate([", highlight: true },
      { content: "  { prompt: 'Generate scene for Unity target' }," },
      { content: "  { prompt: 'Generate scene for Godot target' }," },
      { content: "  { prompt: 'Generate scene for Babylon target' }," },
      { content: "], { concurrency: 3 })", annotation: "parallel requests" },
    ],
  },
];

export const LLMProviderSDK: React.FC = () => {
  const { fps } = useVideoConfig();
  const titleDuration = 3 * fps;
  const stepDuration = 5 * fps;

  return (
    <AbsoluteFill style={{ background: "#0f1117" }}>
      <Sequence from={0} durationInFrames={titleDuration}>
        <TitleCard
          title="LLM Provider SDK"
          subtitle="Unified interface for OpenAI, Anthropic, and Gemini in the HoloScript ecosystem"
          tag="Advanced"
        />
      </Sequence>

      {STEPS.map((step, i) => (
        <Sequence
          key={i}
          from={titleDuration + i * stepDuration}
          durationInFrames={stepDuration}
        >
          <CodeStep
            stepNumber={i + 1}
            title={step.title}
            description={step.description}
            lines={step.lines}
            language="typescript"
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
