import fs from 'fs';
import path from 'path';
import { parseHolo } from '@holoscript/core';
import { registerAgentProfile, TeamAgentProfile, AgentRole, AIProvider } from '@holoscript/framework';

export function loadNativeAgentCompositions() {
  const rootDir = path.join(__dirname, '..', 'src', 'holomesh');
  const galleryDir = path.join(rootDir, 'gallery');
  
  const filesToScan = [
    path.join(rootDir, 'plaza.hsplus'),
    path.join(galleryDir, 'glass-cathedral.hsplus'),
    path.join(galleryDir, 'mycelium-network.hsplus'),
    path.join(galleryDir, 'orbital-loom.hsplus'),
  ];

  for (const filePath of filesToScan) {
    try {
      if (!fs.existsSync(filePath)) continue;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const parseResult = parseHolo(content);
      const ast = parseResult.ast;
      
      if (!ast) continue;

      // Traverse AST to find objects of type "team_agent"
      for (const obj of ast.objects || []) {
        if (obj.type === 'team_agent') {
          const profile = extractAgentProfile(obj);
          if (profile) {
            registerAgentProfile(profile);
            console.log(`[HoloMesh] Registered native agent composition: ${profile.name} (from ${path.basename(filePath)})`);
          }
        }
      }
    } catch (err) {
      console.warn(`[HoloMesh] Failed to parse agent compositions from ${filePath}:`, err);
    }
  }
}

function extractAgentProfile(obj: any): TeamAgentProfile | null {
  try {
    // Look for traits in directives or traits
    const allTraits = [...(obj.traits || []), ...(obj.directives || [])];
    
    const agentTrait = allTraits.find((t: any) => t.name === 'agent');
    const capabilitiesTrait = allTraits.find((t: any) => t.name === 'capabilities');
    const claimFilterTrait = allTraits.find((t: any) => t.name === 'claimFilter');
    const systemPromptTrait = allTraits.find((t: any) => t.name === 'systemPrompt');
    const knowledgeTrait = allTraits.find((t: any) => t.name === 'knowledge');

    if (!agentTrait) return null;

    const getArg = (trait: any, key: string, defaultValue?: any) => {
      if (!trait || !trait.config) return defaultValue;
      const config = trait.config;
      // Search the config properties for the key
      for (let i = 0; i < 20; i += 3) {
        if (config[`_arg${i}`] === key) {
          return config[`_arg${i + 2}`];
        }
      }
      return defaultValue;
    };

    return {
      id: getArg(agentTrait, 'id'),
      name: getArg(agentTrait, 'name', obj.name || obj.id?.replace('agent_', '')),
      role: getArg(agentTrait, 'role') as AgentRole,
      model: getArg(agentTrait, 'model'),
      provider: getArg(agentTrait, 'provider') as AIProvider,
      capabilities: getArg(capabilitiesTrait, 'skills') || [],
      claimFilter: {
        roles: getArg(claimFilterTrait, 'roles') || [],
        maxPriority: getArg(claimFilterTrait, 'maxPriority') || 5,
      },
      systemPrompt: getArg(systemPromptTrait, 'text') || '',
      knowledgeDomains: getArg(knowledgeTrait, 'domains') || [],
    };
  } catch (err) {
    console.error(`[HoloMesh] Error extracting agent profile from object: ${obj.name}`, err);
    return null;
  }
}
