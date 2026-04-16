/**
 * HoloScript Unity Exporter
 *
 * Generates Unity C# scripts from parsed .holo composition data.
 * Produces one MonoBehaviour per object, a SceneBuilder, and a package manifest.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface HoloTrait {
  name: string;
  params: Record<string, string | number | boolean>;
}

interface HoloObject {
  name: string;
  type: 'object' | 'spatial_group';
  traits: HoloTrait[];
  properties: Record<string, unknown>;
  children: HoloObject[];
}

interface HoloEnvironment {
  skybox?: string;
  ambientLight?: number;
  fog?: boolean;
  shadows?: boolean;
  gravity?: [number, number, number];
  backgroundColor?: string;
}

interface HoloComposition {
  name: string;
  environment: HoloEnvironment;
  objects: HoloObject[];
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Minimal recursive-descent parser for .holo composition format.
 * Handles the subset of syntax required by the exporter.
 */
class HoloParser {
  private pos = 0;
  private src = '';

  parse(source: string): HoloComposition {
    this.src = source;
    this.pos = 0;

    this.skipWhitespaceAndComments();

    // Look for composition keyword
    this.expect('composition');
    this.skipWhitespaceAndComments();
    const compositionName = this.parseQuotedString();
    this.skipWhitespaceAndComments();
    this.expect('{');

    const environment: HoloEnvironment = {};
    const objects: HoloObject[] = [];

    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd() || this.peek() === '}') break;

      const keyword = this.peekWord();

      if (keyword === 'environment') {
        this.advance(keyword.length);
        this.skipWhitespaceAndComments();
        this.expect('{');
        this.parseEnvironmentBlock(environment);
        this.expect('}');
      } else if (keyword === 'object') {
        objects.push(this.parseObject('object'));
      } else if (keyword === 'spatial_group') {
        objects.push(this.parseObject('spatial_group'));
      } else if (keyword === 'template') {
        // Skip template definitions for export purposes
        this.skipBlock();
      } else if (keyword === 'logic') {
        this.skipBlock();
      } else {
        // Unknown block, skip
        this.skipBlock();
      }

      this.skipWhitespaceAndComments();
    }

    if (!this.isAtEnd()) this.expect('}');

    return { name: compositionName, environment, objects };
  }

  private parseObject(type: 'object' | 'spatial_group'): HoloObject {
    this.advance(type.length);
    this.skipWhitespaceAndComments();

    const name = this.parseQuotedString();
    this.skipWhitespaceAndComments();

    // Skip optional "using" clause
    if (this.peekWord() === 'using') {
      this.advance(5);
      this.skipWhitespaceAndComments();
      this.parseQuotedString();
      this.skipWhitespaceAndComments();
    }

    this.expect('{');

    const traits: HoloTrait[] = [];
    const properties: Record<string, unknown> = {};
    const children: HoloObject[] = [];

    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd() || this.peek() === '}') break;

      if (this.peek() === '@') {
        traits.push(this.parseTrait());
      } else {
        const kw = this.peekWord();
        if (kw === 'object') {
          children.push(this.parseObject('object'));
        } else if (kw === 'spatial_group') {
          children.push(this.parseObject('spatial_group'));
        } else if (kw === 'state') {
          this.advance(5);
          this.skipWhitespaceAndComments();
          this.expect('{');
          const stateProps: Record<string, unknown> = {};
          this.parsePropertyBlock(stateProps);
          this.expect('}');
          properties['state'] = stateProps;
        } else if (kw.startsWith('on_') || kw.startsWith('//')) {
          // Skip event handlers and comments
          this.skipLine();
        } else {
          // Property
          this.parseProperty(properties);
        }
      }

      this.skipWhitespaceAndComments();
    }

    this.expect('}');

    return { name, type, traits, properties, children };
  }

  private parseTrait(): HoloTrait {
    this.expect('@');
    const name = this.readIdentifier();
    const params: Record<string, string | number | boolean> = {};

    this.skipWhitespace();
    if (!this.isAtEnd() && this.peek() === '(') {
      this.advance(1);
      while (!this.isAtEnd() && this.peek() !== ')') {
        this.skipWhitespaceAndComments();
        if (this.peek() === ')') break;

        const key = this.readIdentifier();
        this.skipWhitespace();
        this.expect(':');
        this.skipWhitespace();

        const value = this.parseValue();
        params[key] = value as string | number | boolean;

        this.skipWhitespace();
        if (this.peek() === ',') this.advance(1);
      }
      this.expect(')');
    }

    return { name, params };
  }

  private parseProperty(target: Record<string, unknown>): void {
    const key = this.readIdentifier();
    this.skipWhitespace();
    this.expect(':');
    this.skipWhitespace();
    const value = this.parseValue();
    target[key] = value;
    this.skipWhitespace();
    // Consume optional trailing comma or newline
    if (!this.isAtEnd() && this.peek() === ',') this.advance(1);
  }

  private parsePropertyBlock(target: Record<string, unknown>): void {
    while (!this.isAtEnd() && this.peek() !== '}') {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd() || this.peek() === '}') break;
      this.parseProperty(target);
      this.skipWhitespaceAndComments();
    }
  }

  private parseEnvironmentBlock(env: HoloEnvironment): void {
    const props: Record<string, unknown> = {};
    this.parsePropertyBlock(props);
    if (props['skybox'] !== undefined) env.skybox = String(props['skybox']);
    if (props['ambient_light'] !== undefined) env.ambientLight = Number(props['ambient_light']);
    if (props['fog'] !== undefined) env.fog = props['fog'] === true || props['fog'] === 'true';
    if (props['shadows'] !== undefined)
      env.shadows = props['shadows'] === true || props['shadows'] === 'true';
    if (props['background_color'] !== undefined)
      env.backgroundColor = String(props['background_color']);
    if (props['gravity'] !== undefined && Array.isArray(props['gravity'])) {
      env.gravity = props['gravity'] as [number, number, number];
    }
  }

  private parseValue(): unknown {
    this.skipWhitespace();
    const ch = this.peek();

    if (ch === '"' || ch === "'") {
      return this.parseQuotedString();
    }

    if (ch === '[') {
      return this.parseArray();
    }

    if (ch === '{') {
      this.advance(1);
      const obj: Record<string, unknown> = {};
      this.parsePropertyBlock(obj);
      this.expect('}');
      return obj;
    }

    // Boolean or number
    const word = this.readUntilDelimiter();
    if (word === 'true') return true;
    if (word === 'false') return false;
    const num = Number(word);
    if (!isNaN(num)) return num;
    return word;
  }

  private parseQuotedString(): string {
    const quote = this.peek();
    if (quote !== '"' && quote !== "'") {
      throw new Error(`Expected quote at position ${this.pos}, got '${quote}'`);
    }
    this.advance(1);
    let result = '';
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(1);
        result += this.peek();
      } else {
        result += this.peek();
      }
      this.advance(1);
    }
    this.expect(quote);
    return result;
  }

  private parseArray(): unknown[] {
    this.expect('[');
    const items: unknown[] = [];
    while (!this.isAtEnd() && this.peek() !== ']') {
      this.skipWhitespaceAndComments();
      if (this.peek() === ']') break;
      items.push(this.parseValue());
      this.skipWhitespace();
      if (this.peek() === ',') this.advance(1);
    }
    this.expect(']');
    return items;
  }

  private skipBlock(): void {
    // Advance past the keyword
    this.readUntilDelimiter();
    this.skipWhitespaceAndComments();
    // Skip optional quoted name
    if (!this.isAtEnd() && (this.peek() === '"' || this.peek() === "'")) {
      this.parseQuotedString();
      this.skipWhitespaceAndComments();
    }
    // Skip optional "using" clause
    if (this.peekWord() === 'using') {
      this.advance(5);
      this.skipWhitespaceAndComments();
      if (!this.isAtEnd() && (this.peek() === '"' || this.peek() === "'")) {
        this.parseQuotedString();
        this.skipWhitespaceAndComments();
      }
    }
    if (!this.isAtEnd() && this.peek() === '{') {
      this.advance(1);
      let depth = 1;
      while (!this.isAtEnd() && depth > 0) {
        if (this.peek() === '{') depth++;
        if (this.peek() === '}') depth--;
        this.advance(1);
      }
    } else {
      this.skipLine();
    }
  }

  private skipLine(): void {
    while (!this.isAtEnd() && this.peek() !== '\n') this.advance(1);
    if (!this.isAtEnd()) this.advance(1);
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && /\s/.test(this.peek())) this.advance(1);
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      if (/\s/.test(this.peek())) {
        this.advance(1);
      } else if (
        this.peek() === '/' &&
        this.pos + 1 < this.src.length &&
        this.src[this.pos + 1] === '/'
      ) {
        this.skipLine();
      } else if (
        this.peek() === '/' &&
        this.pos + 1 < this.src.length &&
        this.src[this.pos + 1] === '*'
      ) {
        this.advance(2);
        while (
          !this.isAtEnd() &&
          !(this.peek() === '*' && this.pos + 1 < this.src.length && this.src[this.pos + 1] === '/')
        ) {
          this.advance(1);
        }
        if (!this.isAtEnd()) this.advance(2);
      } else {
        break;
      }
    }
  }

  private peek(): string {
    return this.src[this.pos] || '';
  }

  private peekWord(): string {
    let i = this.pos;
    while (i < this.src.length && /[a-zA-Z0-9_]/.test(this.src[i])) i++;
    return this.src.substring(this.pos, i);
  }

  private advance(n: number): void {
    this.pos += n;
  }

  private expect(ch: string): void {
    this.skipWhitespace();
    for (let i = 0; i < ch.length; i++) {
      if (this.isAtEnd() || this.src[this.pos] !== ch[i]) {
        const context = this.src.substring(Math.max(0, this.pos - 20), this.pos + 20);
        throw new Error(
          `Expected '${ch}' at position ${this.pos}, got '${this.peek()}'. Context: ...${context}...`
        );
      }
      this.pos++;
    }
  }

  private readIdentifier(): string {
    let result = '';
    while (!this.isAtEnd() && /[a-zA-Z0-9_]/.test(this.peek())) {
      result += this.peek();
      this.advance(1);
    }
    return result;
  }

  private readUntilDelimiter(): string {
    let result = '';
    while (!this.isAtEnd() && !/[\s,)}\]:]/.test(this.peek())) {
      result += this.peek();
      this.advance(1);
    }
    return result;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.src.length;
  }
}

// ============================================================================
// C# code generation helpers
// ============================================================================

function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function escapeForCSharpString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatCSharpVector3(vec: unknown): string {
  if (Array.isArray(vec) && vec.length >= 3) {
    return `new Vector3(${vec[0]}f, ${vec[1]}f, ${vec[2]}f)`;
  }
  if (typeof vec === 'number') {
    return `new Vector3(${vec}f, ${vec}f, ${vec}f)`;
  }
  return 'Vector3.zero';
}

function formatCSharpColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return `new Color(${r.toFixed(3)}f, ${g.toFixed(3)}f, ${b.toFixed(3)}f, 1f)`;
  }
  return 'Color.white';
}

function hasTrait(obj: HoloObject, traitName: string): boolean {
  return obj.traits.some((t) => t.name === traitName);
}

function _getTrait(obj: HoloObject, traitName: string): HoloTrait | undefined {
  return obj.traits.find((t) => t.name === traitName);
}

// ============================================================================
// Trait-to-Unity component mapping
// ============================================================================

interface UnityComponentMapping {
  usings: string[];
  componentCode: string;
}

const BUILTIN_UNITY_TRAITS = new Set<string>([
  'grabbable',
  'physics',
  'rigidbody',
  'rigid',
  'collidable',
  'glowing',
  'emissive',
  'clickable',
  'spinning',
  'animated',
  'networked',
  'transparent',
  'kinematic',
  'trigger',
  'spatial_audio',
  'particle_emitter',
  'reflective',
  'billboard',
  'throwable',
  'destructible',
  'portal',
  'cloth',
  'soft_body',
  'particle_system',
  'joint',
  'look_at',
  'patrol',
]);

function mapTraitToUnityComponents(trait: HoloTrait, obj: HoloObject): UnityComponentMapping {
  switch (trait.name) {
    case 'grabbable':
      return {
        usings: ['UnityEngine.XR.Interaction.Toolkit'],
        componentCode: [
          '        // @grabbable -> XRGrabInteractable',
          '        var grabInteractable = gameObject.AddComponent<XRGrabInteractable>();',
          trait.params.snap_to_hand === true
            ? '        grabInteractable.movementType = XRBaseInteractable.MovementType.Instantaneous;'
            : '        grabInteractable.movementType = XRBaseInteractable.MovementType.VelocityTracking;',
          trait.params.two_handed === true
            ? '        grabInteractable.selectMode = InteractableSelectMode.Multiple;'
            : '',
          trait.params.grab_distance !== undefined
            ? `        grabInteractable.interactionLayers = InteractionLayerMask.GetMask("Default");`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'physics':
    case 'rigidbody':
    case 'rigid':
      return {
        usings: [],
        componentCode: [
          `        // @${trait.name} -> Rigidbody`,
          '        var rb = gameObject.AddComponent<Rigidbody>();',
          trait.params.mass !== undefined ? `        rb.mass = ${trait.params.mass}f;` : '',
          trait.params.friction !== undefined
            ? [
                '        var physicMaterial = new PhysicMaterial();',
                `        physicMaterial.dynamicFriction = ${trait.params.friction}f;`,
                `        physicMaterial.staticFriction = ${trait.params.friction}f;`,
                '        GetComponent<Collider>().material = physicMaterial;',
              ].join('\n')
            : '',
          trait.params.restitution !== undefined
            ? [
                trait.params.friction === undefined
                  ? '        var physicMaterial = new PhysicMaterial();'
                  : '',
                `        physicMaterial.bounciness = ${trait.params.restitution}f;`,
                trait.params.friction === undefined
                  ? '        GetComponent<Collider>().material = physicMaterial;'
                  : '',
              ]
                .filter(Boolean)
                .join('\n')
            : '',
          trait.params.angular_damping !== undefined
            ? `        rb.angularDrag = ${trait.params.angular_damping}f;`
            : '',
          trait.params.linear_damping !== undefined
            ? `        rb.drag = ${trait.params.linear_damping}f;`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'collidable':
      return {
        usings: [],
        componentCode: [
          '        // @collidable -> Collider',
          hasTrait(obj, 'physics') || hasTrait(obj, 'rigidbody') || hasTrait(obj, 'rigid')
            ? '        var collider = gameObject.AddComponent<MeshCollider>();\n        collider.convex = true;'
            : '        var collider = gameObject.AddComponent<BoxCollider>();',
          trait.params.trigger === true ? '        collider.isTrigger = true;' : '',
          trait.params.layer
            ? `        gameObject.layer = LayerMask.NameToLayer("${trait.params.layer}");`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'glowing':
    case 'emissive':
      return {
        usings: [],
        componentCode: [
          `        // @${trait.name} -> Emission on material`,
          '        var renderer = gameObject.GetComponent<Renderer>();',
          '        if (renderer != null)',
          '        {',
          '            var mat = renderer.material;',
          '            mat.EnableKeyword("_EMISSION");',
          '            mat.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;',
          trait.params.color
            ? `            mat.SetColor("_EmissionColor", ${formatCSharpColor(String(trait.params.color))} * ${trait.params.intensity ?? 1}f);`
            : `            mat.SetColor("_EmissionColor", mat.color * ${trait.params.intensity ?? 1}f);`,
          trait.params.power !== undefined
            ? `            mat.SetColor("_EmissionColor", mat.GetColor("_EmissionColor") * ${Number(trait.params.power) / 10}f);`
            : '',
          '        }',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'clickable':
      return {
        usings: ['UnityEngine.Events'],
        componentCode: [
          '        // @clickable -> HoloClickHandler',
          '        var clickHandler = gameObject.AddComponent<HoloClickHandler>();',
          trait.params.on_click
            ? `        clickHandler.ClickEventName = "${trait.params.on_click}";`
            : '',
          trait.params.highlight_on_hover !== false
            ? '        clickHandler.HighlightOnHover = true;'
            : '        clickHandler.HighlightOnHover = false;',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'spinning':
      return {
        usings: [],
        componentCode: [
          '        // @spinning -> RotateScript',
          '        var rotator = gameObject.AddComponent<RotateScript>();',
          trait.params.speed !== undefined
            ? `        rotator.Speed = ${trait.params.speed}f;`
            : '        rotator.Speed = 30f;',
          trait.params.axis
            ? `        rotator.Axis = ${formatCSharpVector3(
                trait.params.axis === 'x'
                  ? [1, 0, 0]
                  : trait.params.axis === 'y'
                    ? [0, 1, 0]
                    : [0, 0, 1]
              )};`
            : '        rotator.Axis = Vector3.up;',
        ].join('\n'),
      };

    case 'animated':
      return {
        usings: [],
        componentCode: [
          '        // @animated -> Animator setup',
          '        var animator = gameObject.AddComponent<Animator>();',
          trait.params.clip ? `        // Default animation clip: ${trait.params.clip}` : '',
          trait.params.loop === true || trait.params.loop === undefined
            ? '        // Animation set to loop'
            : '        // Animation set to play once',
          trait.params.speed !== undefined
            ? `        animator.speed = ${trait.params.speed}f;`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'networked':
      return {
        usings: ['Unity.Netcode'],
        componentCode: [
          '        // @networked -> NetworkObject (Netcode for GameObjects)',
          '        var networkObj = gameObject.AddComponent<NetworkObject>();',
          trait.params.sync_rate !== undefined
            ? `        // Sync rate: ${trait.params.sync_rate} updates/sec`
            : '',
          trait.params.interpolation !== false
            ? '        // Network interpolation enabled'
            : '        // Network interpolation disabled',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'transparent':
      return {
        usings: [],
        componentCode: [
          '        // @transparent -> Material transparency',
          '        var transparentRenderer = gameObject.GetComponent<Renderer>();',
          '        if (transparentRenderer != null)',
          '        {',
          '            var mat = transparentRenderer.material;',
          '            mat.SetFloat("_Mode", 3f); // Transparent',
          '            mat.SetInt("_SrcBlend", (int)UnityEngine.Rendering.BlendMode.SrcAlpha);',
          '            mat.SetInt("_DstBlend", (int)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);',
          '            mat.SetInt("_ZWrite", 0);',
          '            mat.DisableKeyword("_ALPHATEST_ON");',
          '            mat.EnableKeyword("_ALPHABLEND_ON");',
          '            mat.DisableKeyword("_ALPHAPREMULTIPLY_ON");',
          '            mat.renderQueue = 3000;',
          `            var c = mat.color; c.a = ${trait.params.opacity ?? 0.5}f; mat.color = c;`,
          '        }',
        ].join('\n'),
      };

    case 'kinematic':
      return {
        usings: [],
        componentCode: [
          '        // @kinematic -> Kinematic Rigidbody',
          '        var kinematicRb = gameObject.AddComponent<Rigidbody>();',
          '        kinematicRb.isKinematic = true;',
        ].join('\n'),
      };

    case 'trigger':
      return {
        usings: [],
        componentCode: [
          '        // @trigger -> Trigger Collider',
          '        var triggerCollider = gameObject.AddComponent<BoxCollider>();',
          '        triggerCollider.isTrigger = true;',
          trait.params.on_enter ? `        // On enter event: ${trait.params.on_enter}` : '',
          trait.params.on_exit ? `        // On exit event: ${trait.params.on_exit}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'spatial_audio':
      return {
        usings: [],
        componentCode: [
          '        // @spatial_audio -> AudioSource (3D)',
          '        var audioSource = gameObject.AddComponent<AudioSource>();',
          '        audioSource.spatialBlend = 1f;',
          trait.params.volume !== undefined
            ? `        audioSource.volume = ${trait.params.volume}f;`
            : '',
          trait.params.range !== undefined
            ? `        audioSource.maxDistance = ${trait.params.range}f;`
            : '',
          trait.params.loop === true ? '        audioSource.loop = true;' : '',
          trait.params.source ? `        // Audio clip to load: ${trait.params.source}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'particle_emitter':
      return {
        usings: [],
        componentCode: [
          '        // @particle_emitter -> ParticleSystem',
          '        var particleSystem = gameObject.AddComponent<ParticleSystem>();',
          '        var mainModule = particleSystem.main;',
          trait.params.lifetime !== undefined
            ? `        mainModule.startLifetime = ${trait.params.lifetime}f;`
            : '',
          trait.params.rate !== undefined
            ? [
                '        var emission = particleSystem.emission;',
                `        emission.rateOverTime = ${trait.params.rate}f;`,
              ].join('\n')
            : '',
          trait.params.type ? `        // Particle preset: ${trait.params.type}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'reflective':
      return {
        usings: [],
        componentCode: [
          '        // @reflective -> Material metallic/smoothness',
          '        var reflectiveRenderer = gameObject.GetComponent<Renderer>();',
          '        if (reflectiveRenderer != null)',
          '        {',
          '            var mat = reflectiveRenderer.material;',
          `            mat.SetFloat("_Metallic", ${trait.params.metalness ?? 0.9}f);`,
          `            mat.SetFloat("_Glossiness", ${1.0 - Number(trait.params.roughness ?? 0.1)}f);`,
          '        }',
        ].join('\n'),
      };

    case 'billboard':
      return {
        usings: [],
        componentCode: [
          '        // @billboard -> BillboardScript (always face camera)',
          '        var billboard = gameObject.AddComponent<HoloBillboard>();',
          trait.params.axis === 'y'
            ? '        billboard.LockAxis = HoloBillboard.BillboardAxis.Y;'
            : '        billboard.LockAxis = HoloBillboard.BillboardAxis.Full;',
        ].join('\n'),
      };

    case 'throwable':
      return {
        usings: ['UnityEngine.XR.Interaction.Toolkit'],
        componentCode: [
          '        // @throwable -> Physics throw support (via XR)',
          '        // Requires @grabbable - XRGrabInteractable handles throw velocity',
          '        var grab = gameObject.GetComponent<XRGrabInteractable>();',
          '        if (grab != null)',
          '        {',
          '            grab.throwOnDetach = true;',
          trait.params.velocity_multiplier !== undefined
            ? `            grab.throwVelocityScale = ${trait.params.velocity_multiplier}f;`
            : '',
          trait.params.bounce === true
            ? [
                '            var bounceMat = new PhysicMaterial();',
                '            bounceMat.bounciness = 0.8f;',
                '            bounceMat.bounceCombine = PhysicMaterialCombine.Maximum;',
                '            var col = gameObject.GetComponent<Collider>();',
                '            if (col != null) col.material = bounceMat;',
              ].join('\n')
            : '',
          '        }',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'destructible':
      return {
        usings: [],
        componentCode: [
          '        // @destructible -> HoloDestructible',
          '        var destructible = gameObject.AddComponent<HoloDestructible>();',
          trait.params.health !== undefined
            ? `        destructible.MaxHealth = ${trait.params.health}f;`
            : '        destructible.MaxHealth = 100f;',
          trait.params.debris ? `        destructible.DebrisModel = "${trait.params.debris}";` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'portal':
      return {
        usings: [],
        componentCode: [
          '        // @portal -> HoloPortal',
          '        var portal = gameObject.AddComponent<HoloPortal>();',
          trait.params.destination
            ? `        portal.Destination = "${trait.params.destination}";`
            : '',
          trait.params.preview !== false
            ? '        portal.ShowPreview = true;'
            : '        portal.ShowPreview = false;',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    // Cloth and soft body (from Blender physics mapping)
    case 'cloth':
      return {
        usings: [],
        componentCode: [
          '        // @cloth -> Unity Cloth component',
          '        var cloth = gameObject.AddComponent<Cloth>();',
          trait.params.damping !== undefined
            ? `        cloth.damping = ${trait.params.damping}f;`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'soft_body':
      return {
        usings: [],
        componentCode: [
          '        // @soft_body -> SoftBody simulation (Rigidbody + spring joints)',
          '        var softRb = gameObject.AddComponent<Rigidbody>();',
          trait.params.mass !== undefined ? `        softRb.mass = ${trait.params.mass}f;` : '',
          '        // Soft body requires additional mesh deformation setup',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'particle_system':
      return {
        usings: [],
        componentCode: [
          '        // @particle_system -> ParticleSystem',
          '        var ps = gameObject.AddComponent<ParticleSystem>();',
          '        var psMain = ps.main;',
          trait.params.count !== undefined
            ? `        psMain.maxParticles = ${trait.params.count};`
            : '',
          trait.params.lifetime !== undefined
            ? `        psMain.startLifetime = ${trait.params.lifetime}f;`
            : '',
          trait.params.velocity !== undefined
            ? `        psMain.startSpeed = ${trait.params.velocity}f;`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'joint':
      return {
        usings: [],
        componentCode: [
          '        // @joint -> FixedJoint / ConfigurableJoint',
          trait.params.type === 'hinge'
            ? '        var joint = gameObject.AddComponent<HingeJoint>();'
            : '        var joint = gameObject.AddComponent<FixedJoint>();',
          trait.params.target
            ? `        // Joint target: ${trait.params.target} (resolve at runtime)`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'look_at':
      return {
        usings: [],
        componentCode: [
          '        // @look_at -> HoloLookAt constraint',
          '        var lookAt = gameObject.AddComponent<HoloLookAt>();',
          trait.params.target ? `        lookAt.TargetName = "${trait.params.target}";` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    case 'patrol':
      return {
        usings: ['UnityEngine.AI'],
        componentCode: [
          '        // @patrol -> HoloPatrol (follows path)',
          '        var patrol = gameObject.AddComponent<HoloPatrol>();',
          trait.params.path ? `        patrol.PathName = "${trait.params.path}";` : '',
          trait.params.follow_rotation === true ? '        patrol.FollowRotation = true;' : '',
        ]
          .filter(Boolean)
          .join('\n'),
      };

    default:
      const serializedParams = escapeForCSharpString(JSON.stringify(trait.params ?? {}));
      return {
        usings: [],
        componentCode: [
          `        // @${trait.name} -> HoloTraitAdapter fallback`,
          '        var traitAdapter = gameObject.GetComponent<HoloTraitAdapter>();',
          '        if (traitAdapter == null) traitAdapter = gameObject.AddComponent<HoloTraitAdapter>();',
          `        traitAdapter.RegisterTrait("${escapeForCSharpString(trait.name)}", "${serializedParams}");`,
        ].join('\n'),
      };
  }
}

// ============================================================================
// MonoBehaviour generator
// ============================================================================

function generateMonoBehaviour(obj: HoloObject): string {
  const className = toPascalCase(obj.name);
  const usingsSet = new Set<string>(['UnityEngine']);

  const traitCodeBlocks: string[] = [];
  for (const trait of obj.traits) {
    const mapping = mapTraitToUnityComponents(trait, obj);
    for (const u of mapping.usings) usingsSet.add(u);
    traitCodeBlocks.push(mapping.componentCode);
  }

  // Build fields from properties
  const fields: string[] = [];
  const awakeAssignments: string[] = [];

  const color = obj.properties['color'];
  if (typeof color === 'string') {
    fields.push(`    [SerializeField] private Color _baseColor = ${formatCSharpColor(color)};`);
    awakeAssignments.push(
      '        var renderer = GetComponent<Renderer>();',
      '        if (renderer != null) renderer.material.color = _baseColor;'
    );
  }

  const geometry = obj.properties['geometry'];
  if (typeof geometry === 'string') {
    fields.push(`    [Header("Geometry")]`);
    fields.push(`    public string GeometryType = "${geometry}";`);
  }

  // State block
  const state = obj.properties['state'];
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    fields.push('');
    fields.push('    [Header("State")]');
    for (const [key, val] of Object.entries(state as Record<string, unknown>)) {
      const fieldName = toPascalCase(key);
      if (typeof val === 'number') {
        fields.push(`    public float ${fieldName} = ${val}f;`);
      } else if (typeof val === 'boolean') {
        fields.push(`    public bool ${fieldName} = ${val ? 'true' : 'false'};`);
      } else if (typeof val === 'string') {
        fields.push(`    public string ${fieldName} = "${val}";`);
      }
    }
  }

  // Generate position/rotation/scale setup in Start()
  const startLines: string[] = [];
  const position = obj.properties['position'];
  if (position) {
    startLines.push(`        transform.localPosition = ${formatCSharpVector3(position)};`);
  }
  const rotation = obj.properties['rotation'];
  if (rotation) {
    startLines.push(`        transform.localEulerAngles = ${formatCSharpVector3(rotation)};`);
  }
  const scale = obj.properties['scale'];
  if (scale) {
    startLines.push(`        transform.localScale = ${formatCSharpVector3(scale)};`);
  }

  // Material properties
  const metalness = obj.properties['metalness'];
  const roughness = obj.properties['roughness'];
  const opacity = obj.properties['opacity'];
  if (metalness !== undefined || roughness !== undefined || opacity !== undefined) {
    awakeAssignments.push('        var mat = GetComponent<Renderer>()?.material;');
    awakeAssignments.push('        if (mat != null)');
    awakeAssignments.push('        {');
    if (metalness !== undefined) {
      awakeAssignments.push(`            mat.SetFloat("_Metallic", ${metalness}f);`);
    }
    if (roughness !== undefined) {
      awakeAssignments.push(
        `            mat.SetFloat("_Glossiness", ${1.0 - Number(roughness)}f);`
      );
    }
    if (opacity !== undefined) {
      awakeAssignments.push(`            var c = mat.color; c.a = ${opacity}f; mat.color = c;`);
    }
    awakeAssignments.push('        }');
  }

  const usingsArray = Array.from(usingsSet).sort();
  const usingsCode = usingsArray.map((u) => `using ${u};`).join('\n');

  const fieldsCode = fields.length > 0 ? '\n' + fields.join('\n') + '\n' : '';

  const awakeCode =
    traitCodeBlocks.length > 0 || awakeAssignments.length > 0
      ? [
          '    private void Awake()',
          '    {',
          ...awakeAssignments,
          awakeAssignments.length > 0 && traitCodeBlocks.length > 0 ? '' : null,
          ...traitCodeBlocks,
          '    }',
        ]
          .filter((line) => line !== null)
          .join('\n')
      : '';

  const startCode =
    startLines.length > 0
      ? ['    private void Start()', '    {', ...startLines, '    }'].join('\n')
      : '';

  return `${usingsCode}

namespace HoloScript.Generated
{
    /// <summary>
    /// Auto-generated MonoBehaviour for HoloScript object "${obj.name}".
    /// </summary>
    public class ${className} : MonoBehaviour
    {${fieldsCode}
${awakeCode}
${awakeCode && startCode ? '\n' : ''}${startCode}
    }
}
`;
}

// ============================================================================
// SceneBuilder generator
// ============================================================================

function generateSceneBuilder(composition: HoloComposition): string {
  const className = 'SceneBuilder';
  const usingsSet = new Set<string>(['UnityEngine', 'UnityEngine.SceneManagement']);

  function generateObjectCreation(
    obj: HoloObject,
    parentVar: string | null,
    indent: string
  ): string[] {
    const lines: string[] = [];
    const varName = toCamelCase(obj.name) + 'Go';
    const className = toPascalCase(obj.name);

    // Determine geometry and create appropriate primitive
    const geometry = obj.properties['geometry'];
    let creationLine: string;
    if (geometry === 'sphere') {
      creationLine = `${indent}var ${varName} = GameObject.CreatePrimitive(PrimitiveType.Sphere);`;
    } else if (geometry === 'cube') {
      creationLine = `${indent}var ${varName} = GameObject.CreatePrimitive(PrimitiveType.Cube);`;
    } else if (geometry === 'plane') {
      creationLine = `${indent}var ${varName} = GameObject.CreatePrimitive(PrimitiveType.Plane);`;
    } else if (geometry === 'cylinder') {
      creationLine = `${indent}var ${varName} = GameObject.CreatePrimitive(PrimitiveType.Cylinder);`;
    } else if (geometry === 'capsule') {
      creationLine = `${indent}var ${varName} = GameObject.CreatePrimitive(PrimitiveType.Capsule);`;
    } else {
      creationLine = `${indent}var ${varName} = new GameObject("${obj.name}");`;
    }

    lines.push(creationLine);
    lines.push(`${indent}${varName}.name = "${obj.name}";`);

    // Parent assignment
    if (parentVar) {
      lines.push(`${indent}${varName}.transform.SetParent(${parentVar}.transform, false);`);
    }

    // Position
    const position = obj.properties['position'];
    if (position) {
      lines.push(`${indent}${varName}.transform.localPosition = ${formatCSharpVector3(position)};`);
    }

    // Rotation
    const rotation = obj.properties['rotation'];
    if (rotation) {
      lines.push(
        `${indent}${varName}.transform.localEulerAngles = ${formatCSharpVector3(rotation)};`
      );
    }

    // Scale
    const scale = obj.properties['scale'];
    if (scale) {
      lines.push(`${indent}${varName}.transform.localScale = ${formatCSharpVector3(scale)};`);
    }

    // Color
    const color = obj.properties['color'];
    if (typeof color === 'string') {
      lines.push(`${indent}var ${varName}Renderer = ${varName}.GetComponent<Renderer>();`);
      lines.push(`${indent}if (${varName}Renderer != null)`);
      lines.push(`${indent}{`);
      lines.push(`${indent}    ${varName}Renderer.material.color = ${formatCSharpColor(color)};`);
      lines.push(`${indent}}`);
    }

    // Attach the generated MonoBehaviour
    lines.push(`${indent}${varName}.AddComponent<${className}>();`);

    // Children
    for (const child of obj.children) {
      lines.push('');
      lines.push(...generateObjectCreation(child, varName, indent));
    }

    return lines;
  }

  const buildLines: string[] = [];

  // Environment setup
  const env = composition.environment;
  if (env.ambientLight !== undefined) {
    buildLines.push(`        RenderSettings.ambientIntensity = ${env.ambientLight}f;`);
  }
  if (env.fog !== undefined) {
    buildLines.push(`        RenderSettings.fog = ${env.fog ? 'true' : 'false'};`);
  }
  if (env.backgroundColor) {
    buildLines.push(
      `        Camera.main.backgroundColor = ${formatCSharpColor(env.backgroundColor)};`
    );
  }
  if (env.skybox) {
    buildLines.push(`        // Skybox: ${env.skybox} (assign via Resources or AssetBundle)`);
  }
  if (env.gravity) {
    buildLines.push(`        Physics.gravity = ${formatCSharpVector3(env.gravity)};`);
  }

  if (buildLines.length > 0) {
    buildLines.push('');
  }

  // Root container
  buildLines.push(`        var root = new GameObject("${toPascalCase(composition.name)}_Root");`);
  buildLines.push('');

  // Generate each top-level object
  for (const obj of composition.objects) {
    buildLines.push(...generateObjectCreation(obj, 'root', '        '));
    buildLines.push('');
  }

  const usingsArray = Array.from(usingsSet).sort();
  const usingsCode = usingsArray.map((u) => `using ${u};`).join('\n');

  return `${usingsCode}

namespace HoloScript.Generated
{
    /// <summary>
    /// Auto-generated SceneBuilder for HoloScript composition "${composition.name}".
    /// Attach this to an empty GameObject in the scene to build the hierarchy at runtime.
    /// </summary>
    public class ${className} : MonoBehaviour
    {
        [SerializeField] private bool _buildOnAwake = true;

        private void Awake()
        {
            if (_buildOnAwake)
            {
                BuildScene();
            }
        }

        public void BuildScene()
        {
${buildLines.join('\n')}
            Debug.Log("[HoloScript] Scene '${composition.name}' built successfully.");
        }
    }
}
`;
}

// ============================================================================
// Helper script generators
// ============================================================================

function generateHoloClickHandler(): string {
  return `using UnityEngine;
using UnityEngine.Events;

namespace HoloScript.Generated
{
    /// <summary>
    /// Click handler for HoloScript @clickable trait.
    /// Responds to pointer clicks and raycasts.
    /// </summary>
    public class HoloClickHandler : MonoBehaviour
    {
        [Header("Click Settings")]
        public string ClickEventName = "";
        public bool HighlightOnHover = true;

        [Header("Highlight")]
        [SerializeField] private Color _highlightColor = new Color(1f, 1f, 0f, 0.3f);
        [SerializeField] private Color _originalColor;

        [Header("Events")]
        public UnityEvent OnClicked = new UnityEvent();

        private Renderer _renderer;
        private bool _isHovered;

        private void Awake()
        {
            _renderer = GetComponent<Renderer>();
            if (_renderer != null)
            {
                _originalColor = _renderer.material.color;
            }
        }

        private void OnMouseEnter()
        {
            if (!HighlightOnHover || _renderer == null) return;
            _isHovered = true;
            _renderer.material.color = Color.Lerp(_originalColor, _highlightColor, 0.4f);
        }

        private void OnMouseExit()
        {
            if (!HighlightOnHover || _renderer == null) return;
            _isHovered = false;
            _renderer.material.color = _originalColor;
        }

        private void OnMouseDown()
        {
            OnClicked.Invoke();

            if (!string.IsNullOrEmpty(ClickEventName))
            {
                SendMessage(ClickEventName, SendMessageOptions.DontRequireReceiver);
            }
        }
    }
}
`;
}

function generateRotateScript(): string {
  return `using UnityEngine;

namespace HoloScript.Generated
{
    /// <summary>
    /// Rotation script for HoloScript @spinning trait.
    /// Continuously rotates the object around a given axis.
    /// </summary>
    public class RotateScript : MonoBehaviour
    {
        [Header("Rotation Settings")]
        public float Speed = 30f;
        public Vector3 Axis = Vector3.up;
        public Space RotationSpace = Space.Self;

        private void Update()
        {
            transform.Rotate(Axis, Speed * Time.deltaTime, RotationSpace);
        }
    }
}
`;
}

function generateHoloBillboard(): string {
  return `using UnityEngine;

namespace HoloScript.Generated
{
    /// <summary>
    /// Billboard script for HoloScript @billboard trait.
    /// Makes the object always face the camera.
    /// </summary>
    public class HoloBillboard : MonoBehaviour
    {
        public enum BillboardAxis
        {
            Full,
            Y
        }

        public BillboardAxis LockAxis = BillboardAxis.Full;

        private void LateUpdate()
        {
            if (Camera.main == null) return;

            var targetPosition = Camera.main.transform.position;

            if (LockAxis == BillboardAxis.Y)
            {
                targetPosition.y = transform.position.y;
            }

            transform.LookAt(targetPosition);
            transform.Rotate(0, 180, 0);
        }
    }
}
`;
}

function generateHoloDestructible(): string {
  return `using UnityEngine;
using UnityEngine.Events;

namespace HoloScript.Generated
{
    /// <summary>
    /// Destructible object for HoloScript @destructible trait.
    /// </summary>
    public class HoloDestructible : MonoBehaviour
    {
        [Header("Health")]
        public float MaxHealth = 100f;
        public float CurrentHealth;

        [Header("Debris")]
        public string DebrisModel = "";

        [Header("Events")]
        public UnityEvent OnDestroyed = new UnityEvent();

        private void Awake()
        {
            CurrentHealth = MaxHealth;
        }

        public void TakeDamage(float amount)
        {
            CurrentHealth -= amount;
            if (CurrentHealth <= 0f)
            {
                Die();
            }
        }

        private void Die()
        {
            OnDestroyed.Invoke();

            if (!string.IsNullOrEmpty(DebrisModel))
            {
                var debris = Resources.Load<GameObject>(DebrisModel);
                if (debris != null)
                {
                    Instantiate(debris, transform.position, transform.rotation);
                }
            }

            Destroy(gameObject);
        }
    }
}
`;
}

function generateHoloPortal(): string {
  return `using UnityEngine;

namespace HoloScript.Generated
{
    /// <summary>
    /// Portal for HoloScript @portal trait.
    /// Teleports the player to a destination.
    /// </summary>
    public class HoloPortal : MonoBehaviour
    {
        [Header("Portal Settings")]
        public string Destination = "";
        public bool ShowPreview = true;

        private void OnTriggerEnter(Collider other)
        {
            if (!other.CompareTag("Player")) return;

            Debug.Log($"[HoloScript] Portal triggered: teleporting to {Destination}");
            // Implement teleportation logic based on your project setup
        }
    }
}
`;
}

function generateHoloLookAt(): string {
  return `using UnityEngine;

namespace HoloScript.Generated
{
    /// <summary>
    /// Look-at constraint for HoloScript @look_at trait.
    /// </summary>
    public class HoloLookAt : MonoBehaviour
    {
        [Header("Target")]
        public string TargetName = "";

        private Transform _target;

        private void Start()
        {
            if (!string.IsNullOrEmpty(TargetName))
            {
                var targetGo = GameObject.Find(TargetName);
                if (targetGo != null) _target = targetGo.transform;
            }
        }

        private void LateUpdate()
        {
            if (_target != null)
            {
                transform.LookAt(_target);
            }
        }
    }
}
`;
}

function generateHoloPatrol(): string {
  return `using UnityEngine;
using System.Collections.Generic;

namespace HoloScript.Generated
{
    /// <summary>
    /// Patrol behaviour for HoloScript @patrol trait.
    /// Follows a named path of waypoints.
    /// </summary>
    public class HoloPatrol : MonoBehaviour
    {
        [Header("Path")]
        public string PathName = "";
        public bool FollowRotation = false;
        public float Speed = 2f;
        public bool Loop = true;

        private readonly List<Transform> _waypoints = new List<Transform>();
        private int _currentIndex;

        private void Start()
        {
            if (string.IsNullOrEmpty(PathName)) return;

            var pathGo = GameObject.Find(PathName);
            if (pathGo == null) return;

            for (int i = 0; i < pathGo.transform.childCount; i++)
            {
                _waypoints.Add(pathGo.transform.GetChild(i));
            }
        }

        private void Update()
        {
            if (_waypoints.Count == 0) return;

            var target = _waypoints[_currentIndex].position;
            transform.position = Vector3.MoveTowards(transform.position, target, Speed * Time.deltaTime);

            if (FollowRotation)
            {
                var direction = (target - transform.position).normalized;
                if (direction != Vector3.zero)
                {
                    transform.rotation = Quaternion.LookRotation(direction);
                }
            }

            if (Vector3.Distance(transform.position, target) < 0.1f)
            {
                _currentIndex++;
                if (_currentIndex >= _waypoints.Count)
                {
                    _currentIndex = Loop ? 0 : _waypoints.Count - 1;
                }
            }
        }
    }
}

function generateHoloTraitAdapter(): string {
  return `using UnityEngine;
using System;
using System.Collections.Generic;

namespace HoloScript.Generated
{
  /// <summary>
  /// Generic adapter for HoloScript traits that don't yet have a dedicated Unity component.
  /// Stores normalized trait metadata for runtime systems and future migration.
  /// </summary>
  public class HoloTraitAdapter : MonoBehaviour
  {
    [Serializable]
    public class TraitEntry
    {
      public string Name = "";
      [TextArea(1, 6)]
      public string ParamsJson = "{}";
    }

    [SerializeField] private List<TraitEntry> _traits = new List<TraitEntry>();

    public IReadOnlyList<TraitEntry> Traits => _traits;

    public void RegisterTrait(string name, string paramsJson)
    {
      if (string.IsNullOrWhiteSpace(name)) return;

      var existing = _traits.Find((t) => t.Name == name);
      if (existing != null)
      {
        existing.ParamsJson = paramsJson;
        return;
      }

      _traits.Add(new TraitEntry
      {
        Name = name,
        ParamsJson = string.IsNullOrWhiteSpace(paramsJson) ? "{}" : paramsJson,
      });
    }
  }
}
`;
}
`;
}

// ============================================================================
// Package manifest generator
// ============================================================================

function generatePackageManifest(compositionName: string): string {
  const packageName = `com.holoscript.${compositionName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')}`;

  return JSON.stringify(
    {
      name: packageName,
      version: '1.0.0',
      displayName: `HoloScript: ${compositionName}`,
      description: `Auto-generated Unity package from HoloScript composition "${compositionName}".`,
      unity: '2021.3',
      dependencies: {
        'com.unity.xr.interaction.toolkit': '2.3.0',
        'com.unity.netcode.gameobjects': '1.5.0',
      },
      keywords: ['holoscript', 'vr', 'xr', 'generated'],
      author: {
        name: 'HoloScript Exporter',
        url: 'https://holoscript.net',
      },
    },
    null,
    2
  );
}

// ============================================================================
// Assembly definition generator
// ============================================================================

function generateAssemblyDefinition(compositionName: string): string {
  const asmName = `HoloScript.Generated.${toPascalCase(compositionName)}`;
  return JSON.stringify(
    {
      name: asmName,
      rootNamespace: 'HoloScript.Generated',
      references: ['Unity.XR.Interaction.Toolkit', 'Unity.Netcode.Runtime'],
      includePlatforms: [],
      excludePlatforms: [],
      allowUnsafeCode: false,
      overrideReferences: false,
      precompiledReferences: [],
      autoReferenced: true,
      defineConstraints: [],
      versionDefines: [],
      noEngineReferences: false,
    },
    null,
    2
  );
}

// ============================================================================
// Main export function
// ============================================================================

/**
 * Export a HoloScript .holo composition string to Unity C# scripts.
 *
 * Generates:
 * - One MonoBehaviour per object in the composition
 * - Helper scripts for custom traits (HoloClickHandler, RotateScript, etc.)
 * - A SceneBuilder.cs that recreates the scene hierarchy
 * - A package.json manifest for Unity Package Manager
 * - An assembly definition file
 *
 * @param holoCode - The raw .holo composition source code
 * @param outputDir - Directory to write generated files into
 */
export function exportToUnity(holoCode: string, outputDir: string): void {
  // Parse the .holo source
  const parser = new HoloParser();
  const composition = parser.parse(holoCode);

  // Create output directories
  const scriptsDir = path.join(outputDir, 'Scripts');
  const helpersDir = path.join(scriptsDir, 'Helpers');

  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(helpersDir, { recursive: true });

  // Track which helper scripts are needed
  const neededHelpers = new Set<string>();

  // Collect all objects recursively
  function collectObjects(objects: HoloObject[]): HoloObject[] {
    const result: HoloObject[] = [];
    for (const obj of objects) {
      result.push(obj);
      result.push(...collectObjects(obj.children));
    }
    return result;
  }

  const allObjects = collectObjects(composition.objects);

  // Determine which helpers are needed based on traits used
  for (const obj of allObjects) {
    for (const trait of obj.traits) {
      switch (trait.name) {
        case 'clickable':
          neededHelpers.add('HoloClickHandler');
          break;
        case 'spinning':
          neededHelpers.add('RotateScript');
          break;
        case 'billboard':
          neededHelpers.add('HoloBillboard');
          break;
        case 'destructible':
          neededHelpers.add('HoloDestructible');
          break;
        case 'portal':
          neededHelpers.add('HoloPortal');
          break;
        case 'look_at':
          neededHelpers.add('HoloLookAt');
          break;
        case 'patrol':
          neededHelpers.add('HoloPatrol');
          break;
        default:
          if (!BUILTIN_UNITY_TRAITS.has(trait.name)) {
            neededHelpers.add('HoloTraitAdapter');
          }
          break;
      }
    }
  }

  // Generate MonoBehaviour for each object
  for (const obj of allObjects) {
    const className = toPascalCase(obj.name);
    const code = generateMonoBehaviour(obj);
    const filePath = path.join(scriptsDir, `${className}.cs`);
    fs.writeFileSync(filePath, code, 'utf-8');
  }

  // Generate needed helper scripts
  const helperGenerators: Record<string, () => string> = {
    HoloClickHandler: generateHoloClickHandler,
    RotateScript: generateRotateScript,
    HoloBillboard: generateHoloBillboard,
    HoloDestructible: generateHoloDestructible,
    HoloPortal: generateHoloPortal,
    HoloLookAt: generateHoloLookAt,
    HoloPatrol: generateHoloPatrol,
    HoloTraitAdapter: generateHoloTraitAdapter,
  };

  for (const helperName of neededHelpers) {
    const generator = helperGenerators[helperName];
    if (generator) {
      const code = generator();
      const filePath = path.join(helpersDir, `${helperName}.cs`);
      fs.writeFileSync(filePath, code, 'utf-8');
    }
  }

  // Generate SceneBuilder
  const sceneBuilderCode = generateSceneBuilder(composition);
  fs.writeFileSync(path.join(scriptsDir, 'SceneBuilder.cs'), sceneBuilderCode, 'utf-8');

  // Generate package.json
  const packageManifest = generatePackageManifest(composition.name);
  fs.writeFileSync(path.join(outputDir, 'package.json'), packageManifest, 'utf-8');

  // Generate assembly definition
  const asmDef = generateAssemblyDefinition(composition.name);
  fs.writeFileSync(
    path.join(scriptsDir, `HoloScript.Generated.${toPascalCase(composition.name)}.asmdef`),
    asmDef,
    'utf-8'
  );

  // Print summary
  const objectCount = allObjects.length;
  const helperCount = neededHelpers.size;
  const totalFiles = objectCount + helperCount + 3; // +3 for SceneBuilder, package.json, asmdef
  console.log(`[HoloScript Unity Exporter] Export complete:`);
  console.log(`  Composition: ${composition.name}`);
  console.log(`  Output directory: ${outputDir}`);
  console.log(`  MonoBehaviours: ${objectCount}`);
  console.log(`  Helper scripts: ${helperCount}`);
  console.log(`  Total files: ${totalFiles}`);
}
