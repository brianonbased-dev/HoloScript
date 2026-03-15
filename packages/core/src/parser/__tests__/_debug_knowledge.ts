import { parseKnowledge } from '../HSKnowledgeParser';

const sample = `
meta {
  id: "holoscript-kb"
  name: "HoloScript Knowledge"
  version: "1.0.0"
}

chunk materials {
  category: "rendering"
  keywords: ["pbr", "material", "shader"]
  description: "Material system overview"
  example: \`\`\`
    @material {
      roughness: 0.5
    }
  \`\`\`
}
`;

const result = parseKnowledge(sample);
console.log('chunks:', result.chunks.length);
console.log('content repr:', JSON.stringify(result.chunks[0]?.content));
console.log('has @material:', result.chunks[0]?.content?.includes('@material'));
