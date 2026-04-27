/**
 * @holoscript/medical-plugin
 * DICOM medical imaging and surgical simulation for HoloScript
 */

// ============================================================================
// DICOM Viewer (@dicom_viewer trait)
// ============================================================================

export interface DICOMViewerConfig {
  /** DICOM file path or URL */
  source: string;

  /** Viewer mode */
  mode: 'slice' | '3d_volume' | 'mpr' | 'vr';

  /** Window/Level presets for visualization */
  windowLevel?: {
    center: number; // Window center (Hounsfield units)
    width: number; // Window width
  };

  /** Slice navigation (for slice mode) */
  slice?: {
    axis: 'axial' | 'sagittal' | 'coronal';
    index: number;
    total: number;
  };

  /** Color map for visualization */
  colorMap?: 'grayscale' | 'bone' | 'hot' | 'cool' | 'pet';

  /** Annotations enabled */
  annotations?: boolean;

  /** VR interaction mode */
  interaction?: 'windowing' | 'slice_scroll' | 'rotation' | 'measurement';
}

// ============================================================================
// Surgical Planning (@surgical_plan trait)
// ============================================================================

export interface SurgicalPlanConfig {
  /** Patient anatomy (DICOM, OBJ, STL) */
  anatomy: string;

  /** Surgical procedure type */
  procedure: 'craniotomy' | 'arthroplasty' | 'tumor_resection' | 'orthopedic' | 'custom';

  /** Pre-operative planning tools */
  tools: {
    /** Measurement tools enabled */
    measure?: boolean;

    /** Virtual scalpel for cutting planes */
    cutting?: boolean;

    /** Implant positioning */
    implant?: {
      model: string;
      position: [number, number, number];
      rotation: [number, number, number];
    };

    /** Collision detection with critical structures */
    safetyMargin?: number; // mm
  };

  /** Collaborative planning (multi-user) */
  collaborative?: boolean;

  /** Export plan to surgical navigation system */
  export?: {
    format: 'stealthstation' | 'brainlab' | 'dicom_sr' | 'json';
    path: string;
  };
}

// ============================================================================
// Anatomical Model (@anatomical_model trait)
// ============================================================================

export interface AnatomicalModelConfig {
  /** Anatomy type */
  anatomy: 'heart' | 'brain' | 'skeleton' | 'organs' | 'vascular' | 'nervous_system' | 'custom';

  /** Model detail level */
  detail: 'simplified' | 'standard' | 'high_detail' | 'scientific';

  /** Interactive labels */
  labels?: {
    enabled: boolean;
    language?: 'en' | 'es' | 'fr' | 'de' | 'ja';
    detail?: 'basic' | 'medical_terms' | 'full_description';
  };

  /** Layer visibility (for cross-section views) */
  layers?: {
    skin?: boolean;
    muscle?: boolean;
    bones?: boolean;
    organs?: boolean;
    vascular?: boolean;
    nervous?: boolean;
  };

  /** Animation support */
  animation?: {
    type: 'heartbeat' | 'breathing' | 'blood_flow' | 'muscle_contraction';
    speed: number;
  };

  /** Educational mode */
  educational?: {
    quiz?: boolean;
    highlights?: string[]; // Highlight specific structures
    voiceNarration?: boolean;
  };
}

// ============================================================================
// Medical Simulation (@medical_simulation trait)
// ============================================================================

export interface MedicalSimulationConfig {
  /** Simulation type */
  type: 'cpr' | 'intubation' | 'suturing' | 'iv_insertion' | 'laparoscopy' | 'custom';

  /** Haptic feedback */
  haptics?: {
    enabled: boolean;
    resistance?: number; // 0-1
    vibration?: boolean;
  };

  /** Scoring/Assessment */
  assessment?: {
    enabled: boolean;
    criteria: string[]; // e.g., ["technique", "speed", "accuracy"]
    realtime_feedback?: boolean;
  };

  /** Patient vitals simulation */
  vitals?: {
    heartRate?: number;
    bloodPressure?: [number, number]; // systolic/diastolic
    oxygenSaturation?: number;
    respiration?: number;
  };

  /** Recording for playback */
  recording?: {
    enabled: boolean;
    path?: string;
  };
}

// ============================================================================
// Python Bridge Integration
// ============================================================================

export interface MedicalPythonBridge {
  /** Load DICOM file and return metadata */
  loadDICOM(filePath: string): Promise<DICOMMetadata>;

  /** Apply window/level to DICOM data */
  applyWindowLevel(config: { center: number; width: number }): Promise<Uint8Array>;

  /** Extract 3D volume from DICOM series */
  extract3DVolume(seriesPath: string): Promise<Volume3D>;

  /** Convert DICOM to mesh (for surgical planning) */
  dicomToMesh(config: { threshold: number; smoothing?: boolean }): Promise<MeshData>;
}

export interface DICOMMetadata {
  patientName?: string;
  patientID?: string;
  studyDate?: string;
  modality: string; // CT, MRI, PET, etc.
  sliceThickness: number;
  pixelSpacing: [number, number];
  rows: number;
  columns: number;
  numberOfFrames?: number;
  windowCenter?: number;
  windowWidth?: number;
}

export interface Volume3D {
  data: Uint16Array;
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
}

export interface MeshData {
  vertices: Float32Array;
  faces: Uint32Array;
  normals?: Float32Array;
}

// ============================================================================
// Domain traits
// ============================================================================

/** @patient_record trait — structured patient data for simulation context */
export interface PatientRecordTrait {
  trait: 'patient_record';
  patientId: string;
  name?: string;
  age?: number;
  conditions: string[];
  medications?: string[];
  allergies?: string[];
}

/** @diagnosis_assist trait — AI-driven differential diagnosis overlay */
export interface DiagnosisAssistTrait {
  trait: 'diagnosis_assist';
  symptoms: string[];
  imaging_modality?: 'CT' | 'MRI' | 'PET' | 'X-ray' | 'ultrasound';
  region: string;
  differentials?: Array<{ condition: string; probability: number }>;
}

/** @vitals_monitor trait — real-time patient vitals display */
export interface VitalsMonitorTrait {
  trait: 'vitals_monitor';
  heartRate: number;
  bloodPressure: [number, number];
  oxygenSaturation: number;
  respirationRate: number;
  temperature?: number;
  alertThresholds?: {
    heartRate?: [number, number];
    oxygenSaturation?: number;
  };
}

export type MedicalTrait = PatientRecordTrait | DiagnosisAssistTrait | VitalsMonitorTrait;

// ============================================================================
// Compile
// ============================================================================

export interface MedicalCompileOptions {
  format?: 'fhir_json' | 'hl7_segment' | 'holo';
}

/**
 * Compile medical traits into a target representation.
 *
 * - `fhir_json`    — FHIR R4 Bundle JSON (default)
 * - `hl7_segment`  — HL7v2 pipe-delimited segments
 * - `holo`         — HoloScript .holo composition
 */
export function compile(traits: MedicalTrait[], opts: MedicalCompileOptions = {}): string {
  const format = opts.format ?? 'fhir_json';

  switch (format) {
    case 'fhir_json':
      return compileToFhir(traits);
    case 'hl7_segment':
      return compileToHl7(traits);
    case 'holo':
      return compileToHolo(traits);
    default:
      throw new Error(`Unsupported medical format: ${format as string}`);
  }
}

function compileToFhir(traits: MedicalTrait[]): string {
  const resources: unknown[] = [];

  for (const t of traits) {
    if (t.trait === 'patient_record') {
      resources.push({
        resourceType: 'Patient',
        id: t.patientId,
        name: t.name ? [{ text: t.name }] : undefined,
        extension: t.conditions.map((c) => ({
          url: 'http://hl7.org/fhir/StructureDefinition/condition',
          valueString: c,
        })),
      });
    } else if (t.trait === 'diagnosis_assist') {
      resources.push({
        resourceType: 'DiagnosticReport',
        code: { text: `Differential for ${t.region}` },
        conclusion: t.differentials
          ?.map((d) => `${d.condition} (${(d.probability * 100).toFixed(0)}%)`)
          .join('; '),
      });
    } else if (t.trait === 'vitals_monitor') {
      resources.push({
        resourceType: 'Observation',
        code: { text: 'Vital Signs' },
        component: [
          { code: { text: 'Heart Rate' }, valueQuantity: { value: t.heartRate, unit: 'bpm' } },
          { code: { text: 'SpO2' }, valueQuantity: { value: t.oxygenSaturation, unit: '%' } },
          {
            code: { text: 'Blood Pressure' },
            valueQuantity: { value: t.bloodPressure[0], unit: 'mmHg' },
          },
        ],
      });
    }
  }

  const bundle = {
    resourceType: 'Bundle',
    type: 'collection',
    entry: resources.map((r) => ({ resource: r })),
  };

  return JSON.stringify(bundle, null, 2);
}

function compileToHl7(traits: MedicalTrait[]): string {
  const segments: string[] = ['MSH|^~\\&|HOLOSCRIPT|MEDICAL_PLUGIN|||'];

  for (const t of traits) {
    if (t.trait === 'patient_record') {
      segments.push(`PID|1||${t.patientId}||${t.name ?? ''}|||`);
      for (const cond of t.conditions) {
        segments.push(`DG1|||${cond}||`);
      }
    } else if (t.trait === 'vitals_monitor') {
      segments.push(`OBX|1|NM|HR||${t.heartRate}|bpm|||`);
      segments.push(`OBX|2|NM|SPO2||${t.oxygenSaturation}|%|||`);
      segments.push(`OBX|3|NM|BP||${t.bloodPressure[0]}/${t.bloodPressure[1]}|mmHg|||`);
    } else if (t.trait === 'diagnosis_assist') {
      for (const d of t.differentials ?? []) {
        segments.push(`DG1|||${d.condition}|${(d.probability * 100).toFixed(0)}%|`);
      }
    }
  }

  return segments.join('\r\n');
}

function compileToHolo(traits: MedicalTrait[]): string {
  const lines: string[] = ['composition "MedicalScene" {'];

  for (const t of traits) {
    if (t.trait === 'patient_record') {
      lines.push(`  object "Patient_${t.patientId}" @patient_record {`);
      if (t.name) lines.push(`    name: "${t.name}"`);
      lines.push(`    conditions: [${t.conditions.map((c) => `"${c}"`).join(', ')}]`);
      lines.push('  }');
    } else if (t.trait === 'vitals_monitor') {
      lines.push('  object "VitalsPanel" @vitals_monitor {');
      lines.push(`    heartRate: ${t.heartRate}`);
      lines.push(`    oxygenSaturation: ${t.oxygenSaturation}`);
      lines.push(`    bloodPressure: [${t.bloodPressure.join(', ')}]`);
      lines.push('  }');
    } else if (t.trait === 'diagnosis_assist') {
      lines.push('  object "DiagnosisOverlay" @diagnosis_assist {');
      lines.push(`    region: "${t.region}"`);
      lines.push(`    symptoms: [${t.symptoms.map((s) => `"${s}"`).join(', ')}]`);
      lines.push('  }');
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

// All interfaces and compile() are exported inline above
