import { generateSceneForMCP } from "../src/generators.ts";

const result = await generateSceneForMCP('a minimal room with one cube', { features: ['logic'] });
console.log(JSON.stringify(result, null, 2));
