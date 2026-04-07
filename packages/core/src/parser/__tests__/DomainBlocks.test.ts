import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../HoloCompositionParser';

describe('Domain Blocks and Specialized AST Nodes', () => {
  const parser = new HoloCompositionParser();

  describe('SubOrb Declarations', () => {
    it('should parse sub_orb inside an object block', () => {
      const source = `
        composition "Example" {
          object "Container" {
            sub_orb InnerModule {
              source: "inner.holo"
              scale: 0.5
            }
          }
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
      
      const obj = result.ast!.objects![0];
      expect(obj.name).toBe('Container');
      expect(obj.subOrbs).toBeDefined();
      expect(obj.subOrbs!.length).toBe(1);
      
      const subOrb = obj.subOrbs![0];
      expect(subOrb.name).toBe('InnerModule');
      expect(subOrb.source).toBe('inner.holo');
      
      const properties = subOrb.properties || [];
      const scaleProp = properties.find((p) => p.key === 'scale');
      expect(scaleProp).toBeDefined();
      expect(scaleProp?.value).toBe(0.5);
    });
  });

  describe('Terrain Block', () => {
    it('should parse a terrain block', () => {
      const source = `
        composition "Example" {
          terrain Mountains {
            scale: 1.0
            heightmap: "assets/heightmap.png"
            seed: 42
          }
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast!.terrains).toBeDefined();
      expect(result.ast!.terrains!.length).toBe(1);
      
      const terrain = result.ast!.terrains![0];
      expect(terrain.name).toBe('Mountains');
      expect(terrain.properties.scale).toBe(1.0);
      expect(terrain.properties.seed).toBe(42);
      expect(terrain.properties.heightmap).toBe('assets/heightmap.png');
    });
  });

  describe('Constraint Block', () => {
    it('should parse a constraint block', () => {
      const source = `
        composition "Example" {
          constraint HingeLimit {
            type: "hinge"
            min_angle: -90
            max_angle: 90
          }
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast!.constraints).toBeDefined();
      expect(result.ast!.constraints!.length).toBe(1);
      
      const constraint = result.ast!.constraints![0];
      expect(constraint.name).toBe('HingeLimit');
      expect(constraint.properties.type).toBe('hinge');
      expect(constraint.properties.min_angle).toBe(-90);
      expect(constraint.properties.max_angle).toBe(90);
    });
  });

  describe('Norm and Metanorm Blocks', () => {
    it('should parse a norm block with lifecycle phases', () => {
      const source = `
        composition "Example" {
          norm NoSpamming @enforceable {
            description: "No unsolicited messages."
            
            creation {
              author: "system"
            }
            
            evaluation {
              quorum: 0.6
            }
            
            compliance {
              violation_threshold: 3
            }
            
            on norm_violated(agent) {
               emit("punish", agent)
            }
          }
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast!.norms).toBeDefined();
      expect(result.ast!.norms!.length).toBe(1);
      
      const norm = result.ast!.norms![0];
      expect(norm.name).toBe('NoSpamming');
      expect(norm.traits).toContain('enforceable');
      expect(norm.properties.description).toBe('No unsolicited messages.');
      
      expect(norm.creation).toBeDefined();
      expect(norm.creation!.properties.author).toBe('system');
      
      expect(norm.evaluation).toBeDefined();
      expect(norm.evaluation!.properties.quorum).toBe(0.6);
      
      expect(norm.compliance).toBeDefined();
      expect(norm.compliance!.properties.violation_threshold).toBe(3);
      
      expect(norm.eventHandlers).toBeDefined();
      expect(norm.eventHandlers!.length).toBe(1);
      expect(norm.eventHandlers![0].event).toBe('norm_violated');
    });

    it('should parse a metanorm block', () => {
      const source = `
        composition "Example" {
          metanorm AmendmentProcess {
            description: "Rules for modifying norms"
            
            rules {
              quorum: 0.75
            }
            
            escalation {
              levels: 2
            }
          }
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast!.metanorms).toBeDefined();
      expect(result.ast!.metanorms!.length).toBe(1);
      
      const metanorm = result.ast!.metanorms![0];
      expect(metanorm.name).toBe('AmendmentProcess');
      expect(metanorm.properties.description).toBe('Rules for modifying norms');
      
      expect(metanorm.rules).toBeDefined();
      expect(metanorm.rules!.properties.quorum).toBe(0.75);
      
      expect(metanorm.escalation).toBeDefined();
      expect(metanorm.escalation!.properties.levels).toBe(2);
    });
  });

  describe('Plugin Domain Blocks', () => {
    it('should parse a generic domain block (e.g. robotics)', () => {
      const source = `
        composition "Example" {
          controller ControllerA @safety_rated {
            axis: [0, 1, 0]
            torque: 100
          }
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast!.domainBlocks).toBeDefined();
      expect(result.ast!.domainBlocks!.length).toBe(1);
      
      const domainBlock = result.ast!.domainBlocks![0];
      expect(domainBlock.domain).toBe('robotics');
      expect(domainBlock.keyword).toBe('controller');
      expect(domainBlock.name).toBe('ControllerA');
      expect(domainBlock.traits).toContain('safety_rated');
      expect(domainBlock.properties.torque).toBe(100);
      expect(domainBlock.properties.axis).toEqual([0, 1, 0]);
    });

    it('should parse multiple domain types', () => {
      const source = `
        composition "Example" {
          procedure PatientBed {
            status: "occupied"
          }
          contract DeFiProtocol {
            tvl: 5000000
          }
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast!.domainBlocks).toBeDefined();
      expect(result.ast!.domainBlocks!.length).toBe(2);
      
      expect(result.ast!.domainBlocks![0].domain).toBe('healthcare');
      expect(result.ast!.domainBlocks![0].keyword).toBe('procedure');
      expect(result.ast!.domainBlocks![0].name).toBe('PatientBed');
      
      expect(result.ast!.domainBlocks![1].domain).toBe('web3');
      expect(result.ast!.domainBlocks![1].keyword).toBe('contract');
      expect(result.ast!.domainBlocks![1].name).toBe('DeFiProtocol');
    });
  });

  describe('Spawn Group Block', () => {
    it('should parse a spawn_group block', () => {
      const source = `
        composition "Example" {
          spawn_group "Enemies" {
            count: 5
            radius: 10
          }
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast!.spawnGroups).toBeDefined();
      expect(result.ast!.spawnGroups!.length).toBe(1);
      
      const spawnGroup = result.ast!.spawnGroups![0];
      expect(spawnGroup.name).toBe('Enemies');
      expect(spawnGroup.properties.count).toBe(5);
      expect(spawnGroup.properties.radius).toBe(10);
    });
  });

  describe('Waypoints Block', () => {
    it('should parse a waypoints block', () => {
      const source = `
        composition "Example" {
          waypoints "PatrolRoute" [[0,0,0], [10,0,0], [10,0,10], [0,0,10]]
        }
      `;
      const result = parser.parse(source); if(!result.success) throw new Error(JSON.stringify(result.errors, null, 2));
      expect(result.success).toBe(true);
      expect(result.ast!.waypointSets).toBeDefined();
      expect(result.ast!.waypointSets!.length).toBe(1);
      
      const waypoints = result.ast!.waypointSets![0];
      expect(waypoints.name).toBe('PatrolRoute');
      expect(waypoints.points).toEqual([[0,0,0], [10,0,0], [10,0,10], [0,0,10]]);
    });
  });
});
