/**
 * ZeroKnowledgeProofTrait Unit Tests
 *
 * Tests for zk-SNARKs, zk-STARKs, PLONK, and Groth16 zero-knowledge proofs
 */

import { describe, it, expect, vi } from 'vitest';
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

    it('should throw when Groth16 has trusted_setup_required set to false', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        trusted_setup_required: false,
      };

      expect(() => ZeroKnowledgeProofTrait.validate(config)).toThrow(
        'groth16 requires trusted setup'
      );
    });

    it('should warn when zk-STARKs have trusted_setup_required set to true', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'zk_stark',
        trusted_setup_required: true,
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ZeroKnowledgeProofTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith('zk-STARKs do not require trusted setup');
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

      expect(result).toContain("import { groth16, plonk } from 'snarkjs'");
      expect(result).toContain('class ZKProofSystem');
      expect(result).toContain('generateProof');
      expect(result).toContain('verifyProof');
    });

    it('should include trusted setup flag in constructor', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        trusted_setup_required: true,
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('this.trustedSetup = true');
      expect(result).toContain('provingKey.wasm');
      expect(result).toContain('provingKey.zkey');
    });

    it('should include groth16.fullProve for witness proving', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('groth16.fullProve');
      expect(result).toContain('witness');
    });
  });

  describe('compile() - Web target (PLONK)', () => {
    it('should generate PLONK proof system', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('plonk.fullProve');
      expect(result).toContain('plonk.verify');
    });

    it('should include PLONK proof generation comment', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('PLONK proof generation');
    });
  });

  describe('compile() - Web target (zk-STARKs)', () => {
    it('should generate zk-STARK proof system', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'zk_stark',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'web');

      expect(result).toContain('zk-STARK');
      expect(result).toContain("import { stark } from 'starkware'");
      expect(result).toContain('stark.prove');
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
      expect(result).toContain('contract ZKVerifier');
      expect(result).toContain('function verifyProof');
    });

    it('should include pairing operations', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('pairing');
      expect(result).toContain('scalarMul');
    });

    it('should support public input validation', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('uint[] memory input');
      expect(result).toContain('require(input.length');
    });
  });

  describe('compile() - Solidity target (PLONK)', () => {
    it('should generate PLONK verifier in ZKVerifier contract', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('contract ZKVerifier');
      expect(result).toContain('verifyPlonk');
    });

    it('should include polynomial commitments for PLONK', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
        commitment_scheme: 'poseidon',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'solidity');

      expect(result).toContain('polyCommitments');
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

      expect(result).toContain('Recursive');
      expect(result).toContain('combineProofs');
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

      expect(result).toContain('Batch');
      expect(result).toContain('batchVerify');
    });
  });

  describe('compile() - commitment schemes', () => {
    it('should support Pedersen commitments in generic output', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'bulletproofs',
        curve: 'ed25519',
        commitment_scheme: 'pedersen',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'generic');

      expect(result).toContain('pedersen');
    });

    it('should support Poseidon hash in generic output', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'plonk',
        curve: 'bn254',
        commitment_scheme: 'poseidon',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'generic');

      expect(result).toContain('poseidon');
    });

    it('should support SHA-256 commitments in generic output', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        commitment_scheme: 'sha256',
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'generic');

      expect(result).toContain('sha256');
    });
  });

  describe('compile() - circuit size optimization', () => {
    it('should handle circuit size parameter in generic output', () => {
      const config: ZeroKnowledgeProofConfig = {
        proof_system: 'groth16',
        curve: 'bn254',
        circuit_size: 1024,
      };

      const result = ZeroKnowledgeProofTrait.compile(config, 'generic');

      expect(result).toContain('1024');
    });
  });
});
