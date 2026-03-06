/**
 * HSM Integration Trait
 *
 * Hardware Security Module integration for secure key storage and cryptographic operations.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type HSMProvider = 'aws_cloudhsm' | 'azure_keyvault' | 'google_cloud_hsm' | 'pkcs11' | 'tpm' | 'secure_enclave';
export type KeyType = 'aes' | 'rsa' | 'ecdsa' | 'ed25519';
export type ComplianceLevel = 'fips_140_2_level_2' | 'fips_140_2_level_3' | 'fips_140_3_level_4' | 'common_criteria_eal4plus';

export interface HSMIntegrationConfig {
  hsm_provider: HSMProvider;
  compliance_level?: ComplianceLevel;
  key_type: KeyType;
  key_size?: number;
  enable_key_rotation?: boolean;
  rotation_period_days?: number;
  backup_enabled?: boolean;
  multi_region?: boolean;
  audit_logging?: boolean;
  endpoint_url?: string;
  credentials?: {
    access_key?: string;
    secret_key?: string;
    tenant_id?: string;
  };
}

export interface HSMKeyInfo {
  key_id: string;
  key_type: KeyType;
  created_at: number;
  last_used?: number;
  rotation_due?: number;
  compliance_level: string;
  region?: string;
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

export const HSMIntegrationTrait: TraitHandler<HSMIntegrationConfig> = {
  name: 'hsm_integration',

  validate(config: HSMIntegrationConfig): boolean {
    // Enforce FIPS compliance for production
    if (!config.compliance_level) {
      console.warn('No compliance level specified - FIPS 140-2 Level 3+ recommended for production');
    }

    // Key rotation is strongly recommended
    if (!config.enable_key_rotation) {
      console.warn('Key rotation disabled - highly recommended for security');
    }

    // Audit logging for compliance
    if (!config.audit_logging) {
      console.warn('Audit logging disabled - may be required for compliance');
    }

    // TPM and Secure Enclave are device-specific
    if ((config.hsm_provider === 'tpm' || config.hsm_provider === 'secure_enclave') && config.multi_region) {
      throw new Error(`${config.hsm_provider} does not support multi-region deployment`);
    }

    return true;
  },

  compile(config: HSMIntegrationConfig, target: string): string {
    switch (config.hsm_provider) {
      case 'aws_cloudhsm':
        return this.compileAWSCloudHSM(config);
      case 'azure_keyvault':
        return this.compileAzureKeyVault(config);
      case 'google_cloud_hsm':
        return this.compileGoogleCloudHSM(config);
      case 'secure_enclave':
        return this.compileSecureEnclave(config);
      case 'tpm':
        return this.compileTPM(config);
      default:
        return this.compileGeneric(config);
    }
  },

  compileAWSCloudHSM(config: HSMIntegrationConfig): string {
    return `
// AWS CloudHSM Integration
const { CloudHSMV2Client, DescribeClustersCommand } = require('@aws-sdk/client-cloudhsmv2');
const { KMSClient, CreateKeyCommand, EncryptCommand, DecryptCommand } = require('@aws-sdk/client-kms');

class AWSCloudHSMIntegration {
  constructor() {
    this.kmsClient = new KMSClient({
      region: '${config.multi_region ? 'us-east-1' : 'us-west-2'}',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    this.keyType = '${config.key_type}'.toUpperCase();
    this.complianceLevel = '${config.compliance_level || 'fips_140_2_level_3'}';
    ${config.enable_key_rotation ? `
    this.rotationPeriodDays = ${config.rotation_period_days || 90};
    ` : ''}
  }

  async createKey(keyAlias) {
    const command = new CreateKeyCommand({
      Description: \`HoloScript HSM Key - \${keyAlias}\`,
      KeyUsage: 'ENCRYPT_DECRYPT',
      ${config.key_type === 'aes' ? `
      KeySpec: 'AES_${config.key_size || 256}',
      ` : config.key_type === 'rsa' ? `
      KeySpec: 'RSA_${config.key_size || 2048}',
      ` : `
      KeySpec: 'ECC_NIST_P256',
      `}
      Origin: 'AWS_CLOUDHSM',
      ${config.enable_key_rotation ? `
      EnableAutomaticRotation: true,
      RotationPeriodInDays: this.rotationPeriodDays,
      ` : ''}
      ${config.multi_region ? `
      MultiRegion: true,
      ` : ''}
      Tags: [
        { TagKey: 'compliance', TagValue: this.complianceLevel },
        { TagKey: 'project', TagValue: 'holoscript' }
      ]
    });

    const response = await this.kmsClient.send(command);

    return {
      keyId: response.KeyMetadata.KeyId,
      keyType: '${config.key_type}',
      createdAt: Date.now(),
      complianceLevel: this.complianceLevel,
      ${config.multi_region ? `multiRegion: true` : ''}
    };
  }

  async encrypt(plaintext, keyId) {
    const command = new EncryptCommand({
      KeyId: keyId,
      Plaintext: Buffer.from(plaintext)
    });

    const response = await this.kmsClient.send(command);
    return {
      ciphertext: response.CiphertextBlob,
      keyId: response.KeyId
    };
  }

  async decrypt(ciphertext, keyId) {
    const command = new DecryptCommand({
      KeyId: keyId,
      CiphertextBlob: ciphertext
    });

    const response = await this.kmsClient.send(command);
    return Buffer.from(response.Plaintext);
  }

  ${config.audit_logging ? `
  async auditLog(operation, keyId, success, error) {
    // AWS CloudTrail automatically logs KMS operations
    console.log(\`[AUDIT] \${operation} on key \${keyId}: \${success ? 'SUCCESS' : 'FAILURE'}\`, error);
  }
  ` : ''}
}

module.exports = new AWSCloudHSMIntegration();`;
  },

  compileAzureKeyVault(config: HSMIntegrationConfig): string {
    return `
// Azure Key Vault HSM Integration
const { KeyClient, CryptographyClient } = require('@azure/keyvault-keys');
const { DefaultAzureCredential } = require('@azure/identity');

class AzureKeyVaultIntegration {
  constructor() {
    const credential = new DefaultAzureCredential();
    const vaultUrl = process.env.AZURE_KEYVAULT_URL || '${config.endpoint_url || 'https://your-vault.vault.azure.net'}';

    this.keyClient = new KeyClient(vaultUrl, credential);
    this.complianceLevel = '${config.compliance_level || 'fips_140_2_level_3'}';
  }

  async createKey(keyName) {
    const keyOptions = {
      keyType: '${config.key_type}'.toUpperCase(),
      ${config.key_type === 'rsa' ? `
      keySize: ${config.key_size || 2048},
      ` : ''}
      ${config.enable_key_rotation ? `
      rotationPolicy: {
        lifetimeActions: [{
          action: { type: 'rotate' },
          trigger: { timeAfterCreate: 'P${config.rotation_period_days || 90}D' }
        }],
        attributes: { expiryTime: null }
      },
      ` : ''}
      hsm: true, // Use HSM-backed key
      tags: {
        compliance: this.complianceLevel,
        project: 'holoscript'
      }
    };

    const key = await this.keyClient.createKey(keyName, '${config.key_type}', keyOptions);

    return {
      keyId: key.id,
      keyType: '${config.key_type}',
      createdAt: Date.now(),
      complianceLevel: this.complianceLevel
    };
  }

  async encrypt(plaintext, keyName) {
    const key = await this.keyClient.getKey(keyName);
    const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());

    const result = await cryptoClient.encrypt({
      algorithm: '${config.key_type === 'aes' ? 'A256GCM' : 'RSA-OAEP-256'}',
      plaintext: Buffer.from(plaintext)
    });

    return {
      ciphertext: result.result,
      keyId: key.id
    };
  }

  async decrypt(ciphertext, keyName) {
    const key = await this.keyClient.getKey(keyName);
    const cryptoClient = new CryptographyClient(key, new DefaultAzureCredential());

    const result = await cryptoClient.decrypt({
      algorithm: '${config.key_type === 'aes' ? 'A256GCM' : 'RSA-OAEP-256'}',
      ciphertext
    });

    return result.result;
  }
}

module.exports = new AzureKeyVaultIntegration();`;
  },

  compileGoogleCloudHSM(config: HSMIntegrationConfig): string {
    return `
// Google Cloud HSM Integration
const { KeyManagementServiceClient } = require('@google-cloud/kms');

class GoogleCloudHSMIntegration {
  constructor() {
    this.client = new KeyManagementServiceClient();
    this.projectId = process.env.GCP_PROJECT_ID;
    this.locationId = '${config.multi_region ? 'global' : 'us-central1'}';
    this.keyRingId = 'holoscript-keyring';
  }

  async createKey(keyId) {
    const parent = this.client.keyRingPath(this.projectId, this.locationId, this.keyRingId);

    const [key] = await this.client.createCryptoKey({
      parent,
      cryptoKeyId: keyId,
      cryptoKey: {
        purpose: 'ENCRYPT_DECRYPT',
        versionTemplate: {
          protectionLevel: 'HSM',
          algorithm: '${config.key_type === 'aes' ? 'GOOGLE_SYMMETRIC_ENCRYPTION' : 'RSA_DECRYPT_OAEP_2048_SHA256'}'
        },
        ${config.enable_key_rotation ? `
        rotationPeriod: { seconds: ${(config.rotation_period_days || 90) * 86400} },
        nextRotationTime: { seconds: Date.now() / 1000 + ${(config.rotation_period_days || 90) * 86400} },
        ` : ''}
        labels: {
          compliance: '${config.compliance_level || 'fips_140_2'}',
          project: 'holoscript'
        }
      }
    });

    return {
      keyId: key.name,
      keyType: '${config.key_type}',
      createdAt: Date.now(),
      complianceLevel: '${config.compliance_level || 'fips_140_2_level_3'}'
    };
  }

  async encrypt(plaintext, keyName) {
    const [result] = await this.client.encrypt({
      name: keyName,
      plaintext: Buffer.from(plaintext)
    });

    return {
      ciphertext: result.ciphertext,
      keyId: keyName
    };
  }

  async decrypt(ciphertext, keyName) {
    const [result] = await this.client.decrypt({
      name: keyName,
      ciphertext
    });

    return result.plaintext;
  }
}

module.exports = new GoogleCloudHSMIntegration();`;
  },

  compileSecureEnclave(config: HSMIntegrationConfig): string {
    return `
// iOS/macOS Secure Enclave Integration (Swift)
import CryptoKit
import LocalAuthentication

class SecureEnclaveIntegration {
    private let complianceLevel = "${config.compliance_level || 'common_criteria_eal4plus'}"

    func createKey(keyAlias: String) throws -> SecureEnclaveKeyInfo {
        let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .privateKeyUsage,
            nil
        )!

        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecAttrTokenID as String: kSecAttrTokenIDSecureEnclave,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: keyAlias.data(using: .utf8)!,
                kSecAttrAccessControl as String: access
            ]
        ]

        var error: Unmanaged<CFError>?
        guard let privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            throw error!.takeRetainedValue() as Error
        }

        return SecureEnclaveKeyInfo(
            keyId: keyAlias,
            keyType: "ecdsa",
            createdAt: Date().timeIntervalSince1970,
            complianceLevel: self.complianceLevel
        )
    }

    func sign(data: Data, keyAlias: String) throws -> Data {
        // Retrieve key from Secure Enclave
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: keyAlias.data(using: .utf8)!,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess else {
            throw NSError(domain: "SecureEnclave", code: Int(status))
        }

        let privateKey = item as! SecKey
        var error: Unmanaged<CFError>?

        // Sign with Secure Enclave
        guard let signature = SecKeyCreateSignature(
            privateKey,
            .ecdsaSignatureMessageX962SHA256,
            data as CFData,
            &error
        ) else {
            throw error!.takeRetainedValue() as Error
        }

        return signature as Data
    }

    ${config.audit_logging ? `
    func auditLog(operation: String, keyAlias: String, success: Bool) {
        // Log to system audit trail
        os_log("[AUDIT] %@ on key %@: %@", operation, keyAlias, success ? "SUCCESS" : "FAILURE")
    }
    ` : ''}
}

struct SecureEnclaveKeyInfo {
    let keyId: String
    let keyType: String
    let createdAt: TimeInterval
    let complianceLevel: String
}`;
  },

  compileTPM(config: HSMIntegrationConfig): string {
    return `
// TPM (Trusted Platform Module) Integration
#include <tss2/tss2_esys.h>
#include <tss2/tss2_mu.h>

class TPMIntegration {
private:
    ESYS_CONTEXT* esysContext;
    std::string complianceLevel = "${config.compliance_level || 'fips_140_2_level_2'}";

public:
    TPMIntegration() {
        // Initialize ESAPI context
        TSS2_RC rc = Esys_Initialize(&esysContext, nullptr, nullptr);
        if (rc != TSS2_RC_SUCCESS) {
            throw std::runtime_error("Failed to initialize TPM");
        }
    }

    ~TPMIntegration() {
        Esys_Finalize(&esysContext);
    }

    struct KeyInfo createKey(const std::string& keyAlias) {
        TPM2B_PUBLIC inPublic = {
            .publicArea = {
                .type = TPM2_ALG_${config.key_type === 'rsa' ? 'RSA' : 'ECC'},
                .nameAlg = TPM2_ALG_SHA256,
                .objectAttributes = (TPMA_OBJECT_USERWITHAUTH |
                                    TPMA_OBJECT_SIGN_ENCRYPT |
                                    TPMA_OBJECT_FIXEDTPM |
                                    TPMA_OBJECT_FIXEDPARENT |
                                    TPMA_OBJECT_SENSITIVEDATAORIGIN),
                ${config.key_type === 'rsa' ? `
                .parameters.rsaDetail = {
                    .symmetric = {.algorithm = TPM2_ALG_NULL},
                    .scheme = {.scheme = TPM2_ALG_RSASSA},
                    .keyBits = ${config.key_size || 2048},
                    .exponent = 0
                },
                ` : `
                .parameters.eccDetail = {
                    .symmetric = {.algorithm = TPM2_ALG_NULL},
                    .scheme = {.scheme = TPM2_ALG_ECDSA},
                    .curveID = TPM2_ECC_NIST_P256,
                    .kdf = {.scheme = TPM2_ALG_NULL}
                },
                `}
            }
        };

        TPM2B_PUBLIC* outPublic;
        TPM2B_PRIVATE* outPrivate;
        ESYS_TR keyHandle;

        TSS2_RC rc = Esys_CreatePrimary(
            esysContext,
            ESYS_TR_RH_OWNER,
            ESYS_TR_PASSWORD, ESYS_TR_NONE, ESYS_TR_NONE,
            nullptr, &inPublic, nullptr, nullptr,
            &keyHandle, &outPublic, nullptr, nullptr, nullptr
        );

        if (rc != TSS2_RC_SUCCESS) {
            throw std::runtime_error("Failed to create TPM key");
        }

        return {
            .keyId = keyAlias,
            .keyType = "${config.key_type}",
            .createdAt = std::time(nullptr),
            .complianceLevel = complianceLevel,
            .handle = keyHandle
        };
    }

    struct KeyInfo {
        std::string keyId;
        std::string keyType;
        std::time_t createdAt;
        std::string complianceLevel;
        ESYS_TR handle;
    };
};`;
  },

  compileGeneric(config: HSMIntegrationConfig): string {
    return JSON.stringify(config, null, 2);
  }
};

export default HSMIntegrationTrait;
