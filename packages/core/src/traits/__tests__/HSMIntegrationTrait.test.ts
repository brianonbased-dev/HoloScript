/**
 * HSMIntegrationTrait Unit Tests
 *
 * Tests for AWS CloudHSM, Azure Key Vault, Google Cloud HSM, TPM, and Secure Enclave
 */

import { describe, it, expect } from 'vitest';
import { HSMIntegrationTrait } from '../HSMIntegrationTrait';
import type { HSMIntegrationConfig } from '../HSMIntegrationTrait';

describe('HSMIntegrationTrait', () => {
  describe('handler definition', () => {
    it('should have name "hsm_integration"', () => {
      expect(HSMIntegrationTrait.name).toBe('hsm_integration');
    });

    it('should have validate and compile methods', () => {
      expect(typeof HSMIntegrationTrait.validate).toBe('function');
      expect(typeof HSMIntegrationTrait.compile).toBe('function');
    });
  });

  describe('validate()', () => {
    it('should pass validation for AWS CloudHSM', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
        fips_compliance: 'fips_140_2_level_3',
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
      expect(HSMIntegrationTrait.validate(config)).toBe(true);
    });

    it('should pass validation for Azure Key Vault', () => {
      const config: HSMIntegrationConfig = {
        provider: 'azure_key_vault',
        key_type: 'rsa_2048',
        fips_compliance: 'fips_140_2_level_2',
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for Google Cloud HSM', () => {
      const config: HSMIntegrationConfig = {
        provider: 'google_cloud_hsm',
        key_type: 'ec_p256',
        fips_compliance: 'fips_140_2_level_3',
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for TPM', () => {
      const config: HSMIntegrationConfig = {
        provider: 'tpm',
        key_type: 'rsa_2048',
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for iOS/macOS Secure Enclave', () => {
      const config: HSMIntegrationConfig = {
        provider: 'secure_enclave',
        key_type: 'ec_p256',
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
    });

    it('should recommend FIPS 140-2 Level 3 for production', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      HSMIntegrationTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('FIPS 140-2 Level 3 recommended for production'));
      consoleSpy.mockRestore();
    });

    it('should recommend multi-region replication', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
        multi_region_replication: false,
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      HSMIntegrationTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Multi-region replication recommended'));
      consoleSpy.mockRestore();
    });
  });

  describe('compile() - AWS CloudHSM', () => {
    it('should generate AWS SDK KMS integration', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('@aws-sdk/client-kms');
      expect(result).toContain('KMSClient');
      expect(result).toContain('class HSMIntegration');
    });

    it('should support key creation', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'rsa_2048',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('CreateKeyCommand');
      expect(result).toContain('KeyUsage');
    });

    it('should support encryption/decryption', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('EncryptCommand');
      expect(result).toContain('DecryptCommand');
    });

    it('should support automatic key rotation', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
        auto_rotation: true,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('EnableKeyRotationCommand');
      expect(result).toContain('rotation_period_days');
    });

    it('should support multi-region replication', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
        multi_region_replication: true,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('MultiRegion: true');
    });
  });

  describe('compile() - Azure Key Vault', () => {
    it('should generate Azure Key Vault integration', () => {
      const config: HSMIntegrationConfig = {
        provider: 'azure_key_vault',
        key_type: 'rsa_2048',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('@azure/keyvault-keys');
      expect(result).toContain('KeyClient');
      expect(result).toContain('DefaultAzureCredential');
    });

    it('should support key creation and management', () => {
      const config: HSMIntegrationConfig = {
        provider: 'azure_key_vault',
        key_type: 'ec_p256',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('createKey');
      expect(result).toContain('encrypt');
      expect(result).toContain('decrypt');
    });

    it('should support managed HSM', () => {
      const config: HSMIntegrationConfig = {
        provider: 'azure_key_vault',
        key_type: 'rsa_4096',
        fips_compliance: 'fips_140_2_level_3',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('hsm');
    });
  });

  describe('compile() - Google Cloud HSM', () => {
    it('should generate Google Cloud KMS integration', () => {
      const config: HSMIntegrationConfig = {
        provider: 'google_cloud_hsm',
        key_type: 'aes_256',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('@google-cloud/kms');
      expect(result).toContain('KeyManagementServiceClient');
    });

    it('should support key creation', () => {
      const config: HSMIntegrationConfig = {
        provider: 'google_cloud_hsm',
        key_type: 'rsa_2048',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('createCryptoKey');
      expect(result).toContain('purpose');
    });

    it('should support HSM protection level', () => {
      const config: HSMIntegrationConfig = {
        provider: 'google_cloud_hsm',
        key_type: 'ec_p256',
        fips_compliance: 'fips_140_2_level_3',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('HSM');
      expect(result).toContain('protectionLevel');
    });
  });

  describe('compile() - TPM (Trusted Platform Module)', () => {
    it('should generate TPM integration with TSS2 ESAPI', () => {
      const config: HSMIntegrationConfig = {
        provider: 'tpm',
        key_type: 'rsa_2048',
      };

      const result = HSMIntegrationTrait.compile(config, 'cpp');

      expect(result).toContain('#include <tss2/tss2_esys.h>');
      expect(result).toContain('class TPMIntegration');
      expect(result).toContain('ESYS_CONTEXT');
    });

    it('should support key creation in TPM', () => {
      const config: HSMIntegrationConfig = {
        provider: 'tpm',
        key_type: 'ec_p256',
      };

      const result = HSMIntegrationTrait.compile(config, 'cpp');

      expect(result).toContain('Esys_CreatePrimary');
      expect(result).toContain('Esys_Create');
    });

    it('should support TPM sealing', () => {
      const config: HSMIntegrationConfig = {
        provider: 'tpm',
        key_type: 'aes_256',
      };

      const result = HSMIntegrationTrait.compile(config, 'cpp');

      expect(result).toContain('seal');
      expect(result).toContain('unseal');
    });
  });

  describe('compile() - iOS/macOS Secure Enclave', () => {
    it('should generate Swift CryptoKit with Secure Enclave', () => {
      const config: HSMIntegrationConfig = {
        provider: 'secure_enclave',
        key_type: 'ec_p256',
      };

      const result = HSMIntegrationTrait.compile(config, 'swift');

      expect(result).toContain('import CryptoKit');
      expect(result).toContain('class SecureEnclaveIntegration');
      expect(result).toContain('SecureEnclave');
    });

    it('should support key generation in Secure Enclave', () => {
      const config: HSMIntegrationConfig = {
        provider: 'secure_enclave',
        key_type: 'ec_p256',
      };

      const result = HSMIntegrationTrait.compile(config, 'swift');

      expect(result).toContain('SecureEnclave.P256.Signing.PrivateKey');
      expect(result).toContain('generatePrivateKey');
    });

    it('should support signing with Secure Enclave keys', () => {
      const config: HSMIntegrationConfig = {
        provider: 'secure_enclave',
        key_type: 'ec_p256',
      };

      const result = HSMIntegrationTrait.compile(config, 'swift');

      expect(result).toContain('signature');
      expect(result).toContain('dataRepresentation');
    });

    it('should require authentication for key access', () => {
      const config: HSMIntegrationConfig = {
        provider: 'secure_enclave',
        key_type: 'ec_p256',
      };

      const result = HSMIntegrationTrait.compile(config, 'swift');

      expect(result).toContain('authenticationContext');
    });
  });

  describe('compile() - key types', () => {
    it('should support AES-256', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('AES_256');
    });

    it('should support RSA-2048', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'rsa_2048',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('RSA_2048');
    });

    it('should support RSA-4096', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'rsa_4096',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('RSA_4096');
    });

    it('should support EC P-256', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'ec_p256',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('ECC_NIST_P256');
    });

    it('should support EC P-384', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'ec_p384',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('ECC_NIST_P384');
    });
  });

  describe('compile() - audit logging', () => {
    it('should enable audit logging', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
        audit_logging: true,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('CloudTrail');
      expect(result).toContain('audit');
    });
  });

  describe('compile() - backup and recovery', () => {
    it('should support backup configuration', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
        backup_enabled: true,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('backup');
    });
  });

  describe('compile() - FIPS compliance', () => {
    it('should specify FIPS 140-2 Level 2', () => {
      const config: HSMIntegrationConfig = {
        provider: 'azure_key_vault',
        key_type: 'rsa_2048',
        fips_compliance: 'fips_140_2_level_2',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('FIPS');
    });

    it('should specify FIPS 140-2 Level 3', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
        fips_compliance: 'fips_140_2_level_3',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('FIPS');
    });

    it('should specify Common Criteria EAL4+', () => {
      const config: HSMIntegrationConfig = {
        provider: 'aws_cloudhsm',
        key_type: 'aes_256',
        fips_compliance: 'common_criteria_eal4_plus',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('EAL4');
    });
  });
});
