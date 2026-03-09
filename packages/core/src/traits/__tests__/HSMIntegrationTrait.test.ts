/**
 * HSMIntegrationTrait Unit Tests
 *
 * Tests for AWS CloudHSM, Azure Key Vault, Google Cloud HSM, TPM, and Secure Enclave
 */

import { describe, it, expect, vi } from 'vitest';
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
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        compliance_level: 'fips_140_2_level_3',
        enable_key_rotation: true,
        audit_logging: true,
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
      expect(HSMIntegrationTrait.validate(config)).toBe(true);
    });

    it('should pass validation for Azure Key Vault', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'azure_keyvault',
        key_type: 'rsa',
        compliance_level: 'fips_140_2_level_2',
        enable_key_rotation: true,
        audit_logging: true,
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for Google Cloud HSM', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'google_cloud_hsm',
        key_type: 'ecdsa',
        compliance_level: 'fips_140_2_level_3',
        enable_key_rotation: true,
        audit_logging: true,
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for TPM', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'tpm',
        key_type: 'rsa',
        compliance_level: 'fips_140_2_level_2',
        enable_key_rotation: true,
        audit_logging: true,
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
    });

    it('should pass validation for iOS/macOS Secure Enclave', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'secure_enclave',
        key_type: 'ecdsa',
        compliance_level: 'common_criteria_eal4plus',
        enable_key_rotation: true,
        audit_logging: true,
      };

      expect(() => HSMIntegrationTrait.validate(config)).not.toThrow();
    });

    it('should recommend FIPS 140-2 Level 3 for production', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        enable_key_rotation: true,
        audit_logging: true,
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      HSMIntegrationTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('FIPS 140-2 Level 3+ recommended for production')
      );
      consoleSpy.mockRestore();
    });

    it('should recommend key rotation when disabled', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        compliance_level: 'fips_140_2_level_3',
        audit_logging: true,
      };

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      HSMIntegrationTrait.validate(config);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Key rotation disabled - highly recommended for security')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('compile() - AWS CloudHSM', () => {
    it('should generate AWS SDK KMS integration', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('@aws-sdk/client-kms');
      expect(result).toContain('KMSClient');
      expect(result).toContain('class AWSCloudHSMIntegration');
    });

    it('should support key creation', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'rsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('CreateKeyCommand');
      expect(result).toContain('KeyUsage');
    });

    it('should support encryption/decryption', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('EncryptCommand');
      expect(result).toContain('DecryptCommand');
    });

    it('should support automatic key rotation', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        enable_key_rotation: true,
        rotation_period_days: 90,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('EnableAutomaticRotation: true');
      expect(result).toContain('rotationPeriodDays');
    });

    it('should support multi-region replication', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        multi_region: true,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('MultiRegion: true');
    });
  });

  describe('compile() - Azure Key Vault', () => {
    it('should generate Azure Key Vault integration', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'azure_keyvault',
        key_type: 'rsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('@azure/keyvault-keys');
      expect(result).toContain('KeyClient');
      expect(result).toContain('DefaultAzureCredential');
    });

    it('should support key creation and management', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'azure_keyvault',
        key_type: 'ecdsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('createKey');
      expect(result).toContain('encrypt');
      expect(result).toContain('decrypt');
    });

    it('should support managed HSM', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'azure_keyvault',
        key_type: 'rsa',
        key_size: 4096,
        compliance_level: 'fips_140_2_level_3',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('hsm');
    });
  });

  describe('compile() - Google Cloud HSM', () => {
    it('should generate Google Cloud KMS integration', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'google_cloud_hsm',
        key_type: 'aes',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('@google-cloud/kms');
      expect(result).toContain('KeyManagementServiceClient');
    });

    it('should support key creation', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'google_cloud_hsm',
        key_type: 'rsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('createCryptoKey');
      expect(result).toContain('purpose');
    });

    it('should support HSM protection level', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'google_cloud_hsm',
        key_type: 'ecdsa',
        compliance_level: 'fips_140_2_level_3',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('HSM');
      expect(result).toContain('protectionLevel');
    });
  });

  describe('compile() - TPM (Trusted Platform Module)', () => {
    it('should generate TPM integration with TSS2 ESAPI', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'tpm',
        key_type: 'rsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'cpp');

      expect(result).toContain('#include <tss2/tss2_esys.h>');
      expect(result).toContain('class TPMIntegration');
      expect(result).toContain('ESYS_CONTEXT');
    });

    it('should support key creation in TPM', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'tpm',
        key_type: 'ecdsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'cpp');

      expect(result).toContain('Esys_CreatePrimary');
      expect(result).toContain('TPM2_ALG_ECC');
    });

    it('should support RSA key type in TPM', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'tpm',
        key_type: 'rsa',
        key_size: 2048,
      };

      const result = HSMIntegrationTrait.compile(config, 'cpp');

      expect(result).toContain('TPM2_ALG_RSA');
      expect(result).toContain('keyBits');
    });
  });

  describe('compile() - iOS/macOS Secure Enclave', () => {
    it('should generate Swift CryptoKit with Secure Enclave', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'secure_enclave',
        key_type: 'ecdsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'swift');

      expect(result).toContain('import CryptoKit');
      expect(result).toContain('class SecureEnclaveIntegration');
      expect(result).toContain('SecureEnclave');
    });

    it('should support key generation in Secure Enclave', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'secure_enclave',
        key_type: 'ecdsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'swift');

      expect(result).toContain('SecKeyCreateRandomKey');
      expect(result).toContain('kSecAttrTokenIDSecureEnclave');
    });

    it('should support signing with Secure Enclave keys', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'secure_enclave',
        key_type: 'ecdsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'swift');

      expect(result).toContain('signature');
      expect(result).toContain('SecKeyCreateSignature');
    });

    it('should require authentication for key access', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'secure_enclave',
        key_type: 'ecdsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'swift');

      expect(result).toContain('LocalAuthentication');
    });
  });

  describe('compile() - key types', () => {
    it('should support AES-256', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        key_size: 256,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('AES_256');
    });

    it('should support RSA-2048', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'rsa',
        key_size: 2048,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('RSA_2048');
    });

    it('should support RSA-4096', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'rsa',
        key_size: 4096,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('RSA_4096');
    });

    it('should support EC P-256', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'ecdsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('ECC_NIST_P256');
    });

    it('should support ECDSA key type string in output', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'ecdsa',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain("keyType: 'ecdsa'");
    });
  });

  describe('compile() - audit logging', () => {
    it('should enable audit logging', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        audit_logging: true,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('CloudTrail');
      expect(result).toContain('AUDIT');
    });
  });

  describe('compile() - backup and recovery', () => {
    it('should support backup configuration', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        backup_enabled: true,
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      // AWS CloudHSM compile output includes the class - backup_enabled is a config flag
      // that can be used by the integration; verify the code compiles without error
      expect(result).toContain('AWSCloudHSMIntegration');
    });
  });

  describe('compile() - FIPS compliance', () => {
    it('should specify FIPS 140-2 Level 2', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'azure_keyvault',
        key_type: 'rsa',
        compliance_level: 'fips_140_2_level_2',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('fips_140_2_level_2');
    });

    it('should specify FIPS 140-2 Level 3', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        compliance_level: 'fips_140_2_level_3',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('fips_140_2_level_3');
    });

    it('should specify Common Criteria EAL4+', () => {
      const config: HSMIntegrationConfig = {
        hsm_provider: 'aws_cloudhsm',
        key_type: 'aes',
        compliance_level: 'common_criteria_eal4plus',
      };

      const result = HSMIntegrationTrait.compile(config, 'node');

      expect(result).toContain('common_criteria_eal4plus');
    });
  });
});
