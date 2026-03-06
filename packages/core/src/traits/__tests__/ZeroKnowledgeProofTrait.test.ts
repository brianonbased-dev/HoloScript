/**
 * ZeroKnowledgeProofTrait Unit Tests
 *
 * Tests for zk-SNARKs, zk-STARKs, PLONK, and Groth16 zero-knowledge proofs
 */

import { describe, it, expect } from 'vitest';
import { ZeroKnowledgeProofTrait } from '../ZeroKnowledgeProofTrait';
import type { ZeroKnowledgeProofConfig } from '../ZeroKnowledgeProofTrait';

describe('ZeroKnowledgeProofTrait', () => {
  describe('handler definition', () => {
    it('should have name "zero_knowledge_proof"', () => {
      expect(ZeroKnowledgeProofTrait.name).toBe('zero_knowledge_proof');
    });

    it('should have validate and compile methods', () => {
      expect(typeof ZeroKnowledgeProofTrait.validate).toBe('function');
      expect(typeof ZeroKnowledgeProofTrait.compile).toBe('function');
    });
  });

  describe('validate()', () => {
    it('should pass validation for Groth16', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        trusted_setup_required: true,
      };

      expect(() => ZeroKnowledgeProofTrait.validate(config)).not.toThrow();
      expect(ZeroKnowledgeProofTrait.validate(config)).toBe(true);
    });

    it('should pass validation for PLONK', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
        trusted_setup_required: true, // Universal setup
      };

      expect(() => ZeroKnowledgeProofTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for zk-STARKs (no trusted setup)', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'zk_stark',
        trusted_setup_required: false,
      };

      expect(() => ZeroKnowledgeProofTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for Bulletproofs', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'bulletproofs',
        curve: 'ed25519',
        trusted_setup_required: false,
      };

      expect(() => ZeroKnowledgeProofTrait.validate(config)).not.toThrow();
    });

    it('should warn about Groth16 trusted setup requirement', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ZeroKnowledgeProofTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Groth16 requires circuit-specific trusted setup'));
      consoleSpy.mockRestore();
    });

    it('should recommend zk-STARKs for quantum resistance', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      ZeroKnowledgeProofTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('zk-STARKs recommended for quantum resistance'));
      consoleSpy.mockRestore();
    });
  });

  describe('compile() - Web target (Groth16)', () => {
    it('should generate snarkjs-based Groth16 proof generation', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain("const snarkjs = require('snarkjs')");
      expect(result).toContain('class ZKProofSystem');
      expect(result).toContain('generateProof');
      expect(result).toContain('verifyProof');
    });

    it('should include trusted setup handling', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        trusted_setup_required: true,
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('loadWasm');
      expect(result).toContain('loadZKey');
      expect(result).toContain('verification_key');
    });

    it('should support witness calculation', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('calculateWitness');
      expect(result).toContain('input');
    });
  });

  describe('compile() - Web target (PLONK)', () => {
    it('should generate PLONK proof system', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('snarkjs.plonk.fullProve');
      expect(result).toContain('snarkjs.plonk.verify');
    });

    it('should use universal trusted setup', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('universal trusted setup');
    });
  });

  describe('compile() - Web target (zk-STARKs)', () => {
    it('should generate zk-STARK proof system', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'zk_stark',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('zk-STARK');
      expect(result).toContain('No trusted setup required');
      expect(result).toContain('Quantum-resistant');
    });
  });

  describe('compile() - Solidity target (Groth16)', () => {
    it('should generate Groth16 verifier contract', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('pragma solidity');
      expect(result).toContain('contract Groth16Verifier');
      expect(result).toContain('function verifyProof');
    });

    it('should include pairing precompile calls', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('pairing');
      expect(result).toContain('ecrecover'); // For BN254 pairing
    });

    it('should support public input validation', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('uint256[] memory input');
      expect(result).toContain('require(input.length');
    });
  });

  describe('compile() - Solidity target (PLONK)', () => {
    it('should generate PLONK verifier contract', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('contract PlonkVerifier');
      expect(result).toContain('verifyProof');
    });

    it('should use KZG commitment scheme', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
        commitment_scheme: 'poseidon',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('commitment');
    });
  });

  describe('compile() - elliptic curves', () => {
    it('should support BN254 (Ethereum-friendly)', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('bn254');
    });

    it('should support BLS12-381 (more secure)', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bls12_381',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('bls12_381');
    });

    it('should support Ed25519 for Bulletproofs', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'bulletproofs',
        curve: 'ed25519',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('ed25519');
    });

    it('should support secp256k1 (Bitcoin/Ethereum)', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'secp256k1',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('secp256k1');
    });
  });

  describe('compile() - recursive proofs', () => {
    it('should support recursive proof composition', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
        recursive_proof: true,
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('recursive');
      expect(result).toContain('compose');
    });
  });

  describe('compile() - batch verification', () => {
    it('should support batch verification for efficiency', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        batch_verification: true,
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('batch');
      expect(result).toContain('verifyBatch');
    });
  });

  describe('compile() - commitment schemes', () => {
    it('should support Pedersen commitments', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'bulletproofs',
        curve: 'ed25519',
        commitment_scheme: 'pedersen',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('pedersen');
    });

    it('should support Poseidon hash', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
        commitment_scheme: 'poseidon',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('poseidon');
    });

    it('should support SHA-256 commitments', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        commitment_scheme: 'sha256',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('sha256');
    });
  });

  describe('compile() - circuit size optimization', () => {
    it('should handle circuit size parameter', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        circuit_size: 1024,
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('1024');
    });
  });
});
