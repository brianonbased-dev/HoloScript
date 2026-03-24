/**
 * Tests for generate_service_contract and explain_service_contract MCP tools
 *
 * Validates OpenAPI → .holo and TypeScript → .holo contract generation,
 * format detection, and contract explanation.
 */
import { describe, it, expect } from 'vitest';
import {
  handleGenerateServiceContract,
  handleExplainServiceContract,
} from '../service-contract-tools';

// =============================================================================
// FIXTURES
// =============================================================================

const OPENAPI_JSON = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Pet Store', version: '1.0.0' },
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        summary: 'List all pets',
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'A list of pets',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
              },
            },
          },
        },
      },
      post: {
        operationId: 'createPet',
        summary: 'Create a pet',
        requestBody: {
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Pet' },
            },
          },
        },
        responses: {
          '201': { description: 'Pet created' },
        },
      },
    },
    '/pets/{petId}': {
      get: {
        operationId: 'getPet',
        summary: 'Get a specific pet',
        parameters: [
          { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'A pet',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Pet' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'integer', description: 'Unique identifier' },
          name: { type: 'string', description: 'Pet name' },
          tag: { type: 'string' },
          status: { type: 'string', enum: ['available', 'adopted'] },
        },
      },
    },
  },
});

const OPENAPI_YAML = `openapi: "3.0.0"
info:
  title: "User Service"
  version: "2.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      summary: List all users
    post:
      operationId: createUser
      summary: Create a user
  /users/{id}:
    get:
      operationId: getUser
      summary: Get user by ID
    delete:
      operationId: deleteUser
      summary: Delete a user
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
      required:
        - id
        - name`;

const TS_INTERFACES = `
interface User {
  id: string;
  name: string;
  email?: string;
  age: number;
  isActive: boolean;
}

interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  tags?: string[];
  createdAt: Date;
}

type Comment = {
  id: string;
  postId: string;
  body: string;
  author?: string;
};
`;

// =============================================================================
// OPENAPI GENERATION TESTS
// =============================================================================

describe('generate_service_contract (OpenAPI)', () => {
  it('should generate .holo from OpenAPI JSON', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.success).toBe(true);
    expect(result.detectedFormat).toBe('openapi');
    expect(result.holoCode).toBeDefined();
    expect(result.stats).toBeDefined();
  });

  it('should include correct endpoint count', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    // 3 endpoints: GET /pets, POST /pets, GET /pets/{petId}
    expect(result.stats!.endpoints).toBe(3);
  });

  it('should include schema definitions', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.stats!.schemas).toBe(1); // Pet schema
    expect(result.holoCode).toContain('schema "Pet"');
    expect(result.holoCode).toContain('@schema');
    expect(result.holoCode).toContain('@contract');
  });

  it('should map schema fields with types', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('id: number');
    expect(result.holoCode).toContain('name: string');
  });

  it('should mark optional fields', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    // tag is not in required array
    expect(result.holoCode).toContain('tag?: string');
    // id IS required
    expect(result.holoCode).toMatch(/\bid: number/); // no ?
  });

  it('should include field descriptions as comments', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('// Unique identifier');
    expect(result.holoCode).toContain('// Pet name');
  });

  it('should generate endpoint blocks with methods and paths', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('endpoint "listPets"');
    expect(result.holoCode).toContain('method: "GET"');
    expect(result.holoCode).toContain('path: "/pets"');
    expect(result.holoCode).toContain('endpoint "createPet"');
    expect(result.holoCode).toContain('method: "POST"');
  });

  it('should include @endpoint and @handler traits on endpoints', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('@endpoint');
    expect(result.holoCode).toContain('@handler');
  });

  it('should include query parameters', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('limit?: number');
    expect(result.holoCode).toContain('// in: query');
  });

  it('should include request body reference', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('request_body: Pet');
  });

  it('should include response type reference', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('response_200');
  });

  it('should generate service metadata block', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('service "PetStore"');
    expect(result.holoCode).toContain('@service');
    expect(result.holoCode).toContain('version: "1.0.0"');
  });

  it('should wrap in composition block', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toContain('composition "PetStore"');
    expect(result.holoCode!.trim().endsWith('}')).toBe(true);
  });

  it('should generate from YAML input', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_YAML });

    expect(result.success).toBe(true);
    expect(result.detectedFormat).toBe('openapi');
    expect(result.holoCode).toContain('endpoint "listUsers"');
    expect(result.holoCode).toContain('endpoint "createUser"');
    expect(result.stats!.endpoints).toBe(4);
  });

  it('should parse YAML schemas', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_YAML });

    expect(result.holoCode).toContain('schema "User"');
    expect(result.stats!.schemas).toBe(1);
  });

  it('should accept format hint override', async () => {
    const result = await handleGenerateServiceContract({
      input: OPENAPI_JSON,
      format: 'openapi',
    });

    expect(result.success).toBe(true);
    expect(result.detectedFormat).toBe('openapi');
  });

  it('should have non-zero trait count', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.stats!.traits).toBeGreaterThan(0);
  });
});

// =============================================================================
// TYPESCRIPT GENERATION TESTS
// =============================================================================

describe('generate_service_contract (TypeScript)', () => {
  it('should generate .holo from TypeScript interfaces', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    expect(result.success).toBe(true);
    expect(result.detectedFormat).toBe('typescript');
    expect(result.holoCode).toBeDefined();
  });

  it('should detect all interfaces and type aliases', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    expect(result.stats!.schemas).toBe(3); // User, Post, Comment
    expect(result.holoCode).toContain('schema "User"');
    expect(result.holoCode).toContain('schema "Post"');
    expect(result.holoCode).toContain('schema "Comment"');
  });

  it('should map TypeScript types correctly', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    expect(result.holoCode).toContain('id: string');
    expect(result.holoCode).toContain('age: number');
    expect(result.holoCode).toContain('isActive: boolean');
    expect(result.holoCode).toContain('createdAt: datetime');
  });

  it('should handle optional fields', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    expect(result.holoCode).toContain('email?: string');
    expect(result.holoCode).toContain('tags?: array');
    expect(result.holoCode).toContain('author?: string');
  });

  it('should apply @schema, @contract, @validator traits', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    expect(result.holoCode).toContain('@schema');
    expect(result.holoCode).toContain('@contract');
    expect(result.holoCode).toContain('@validator');
  });

  it('should wrap in composition block', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    expect(result.holoCode).toContain('composition "TypeScriptContract"');
  });

  it('should handle type aliases', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    expect(result.holoCode).toContain('schema "Comment"');
    expect(result.holoCode).toContain('postId: string');
    expect(result.holoCode).toContain('body: string');
  });

  it('should handle array types', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    // string[] -> array
    expect(result.holoCode).toContain('tags?: array');
  });

  it('should have zero endpoints for TypeScript input', async () => {
    const result = await handleGenerateServiceContract({ input: TS_INTERFACES });

    expect(result.stats!.endpoints).toBe(0);
  });
});

// =============================================================================
// FORMAT DETECTION TESTS
// =============================================================================

describe('format detection', () => {
  it('should detect OpenAPI JSON', async () => {
    const result = await handleGenerateServiceContract({
      input: '{"openapi":"3.0.0","info":{"title":"Test","version":"1.0"},"paths":{}}',
    });

    expect(result.detectedFormat).toBe('openapi');
  });

  it('should detect OpenAPI YAML', async () => {
    const result = await handleGenerateServiceContract({
      input: 'openapi: "3.0.0"\ninfo:\n  title: Test\n  version: "1.0"\npaths:\n',
    });

    expect(result.detectedFormat).toBe('openapi');
  });

  it('should detect TypeScript interfaces', async () => {
    const result = await handleGenerateServiceContract({
      input: 'interface Foo { bar: string; }',
    });

    expect(result.detectedFormat).toBe('typescript');
  });

  it('should return error for unknown format', async () => {
    const result = await handleGenerateServiceContract({
      input: 'this is just plain text with no structure',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not detect');
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('error handling', () => {
  it('should error when input is missing', async () => {
    const result = await handleGenerateServiceContract({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('input is required');
  });

  it('should error for malformed JSON', async () => {
    const result = await handleGenerateServiceContract({
      input: '{invalid json',
      format: 'openapi',
    });

    expect(result.success).toBe(false);
  });

  it('should error for no TypeScript interfaces found', async () => {
    const result = await handleGenerateServiceContract({
      input: 'const x = 42;',
      format: 'typescript',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No TypeScript interfaces');
  });

  it('should handle OpenAPI with no paths gracefully', async () => {
    const result = await handleGenerateServiceContract({
      input: JSON.stringify({ openapi: '3.0.0', info: { title: 'Empty', version: '1.0' } }),
    });

    expect(result.success).toBe(true);
    expect(result.stats!.endpoints).toBe(0);
  });

  it('should handle OpenAPI with no schemas gracefully', async () => {
    const result = await handleGenerateServiceContract({
      input: JSON.stringify({
        openapi: '3.0.0',
        info: { title: 'NoSchema', version: '1.0' },
        paths: { '/test': { get: { operationId: 'test', summary: 'Test' } } },
      }),
    });

    expect(result.success).toBe(true);
    expect(result.stats!.schemas).toBe(0);
    expect(result.stats!.endpoints).toBe(1);
  });
});

// =============================================================================
// EXPLAIN SERVICE CONTRACT TESTS
// =============================================================================

describe('explain_service_contract', () => {
  it('should explain a service composition', async () => {
    // First generate a composition
    const generated = await handleGenerateServiceContract({ input: OPENAPI_JSON });
    expect(generated.success).toBe(true);

    const result = await handleExplainServiceContract({ code: generated.holoCode! });

    expect(result.success).toBe(true);
    expect(result.explanation).toContain('Service Contract Summary');
    expect(result.explanation).toContain('endpoint(s)');
    expect(result.explanation).toContain('schema(s)');
  });

  it('should list endpoint details', async () => {
    const generated = await handleGenerateServiceContract({ input: OPENAPI_JSON });
    const result = await handleExplainServiceContract({ code: generated.holoCode! });

    expect(result.explanation).toContain('GET /pets');
    expect(result.explanation).toContain('POST /pets');
  });

  it('should list schema names', async () => {
    const generated = await handleGenerateServiceContract({ input: OPENAPI_JSON });
    const result = await handleExplainServiceContract({ code: generated.holoCode! });

    expect(result.explanation).toContain('Pet');
  });

  it('should error when code is missing', async () => {
    const result = await handleExplainServiceContract({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('code is required');
  });

  it('should handle code with no service traits', async () => {
    const result = await handleExplainServiceContract({
      code: 'composition "Empty" { }',
    });

    expect(result.success).toBe(true);
    expect(result.explanation).toContain('0');
  });
});

// =============================================================================
// OPENAPI → .HOLO ROUNDTRIP QUALITY TESTS
// =============================================================================

describe('generated .holo quality', () => {
  it('should produce balanced braces', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });
    const code = result.holoCode!;

    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    expect(openBraces).toBe(closeBraces);
  });

  it('should have valid composition root', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).toMatch(/^\/\/ Generated/);
    expect(result.holoCode).toMatch(/composition "[^"]+"\s*\{/);
  });

  it('should not contain undefined or null values', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.holoCode).not.toContain('undefined');
    expect(result.holoCode).not.toContain(': null');
  });

  it('should produce consistent output for same input', async () => {
    const result1 = await handleGenerateServiceContract({ input: OPENAPI_JSON });
    const result2 = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result1.holoCode).toBe(result2.holoCode);
  });

  it('should include line count in stats', async () => {
    const result = await handleGenerateServiceContract({ input: OPENAPI_JSON });

    expect(result.stats!.lines).toBe(result.holoCode!.split('\n').length);
  });
});
