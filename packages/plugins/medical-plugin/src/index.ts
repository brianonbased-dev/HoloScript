/**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/**
 * @holoscript/medical-plugin
 * DICOM medical imaging and surgical simulation for HoloScript. THIN: DICOM viewer and surgical interfaces are type-only stubs with no rendering implementation; only BMI/GFR/PK/NEWS2/Framingham solvers are implemented.
 */

export * from './medicalsolver';

// ============================================================================
// DICOM Viewer (@dicom_viewer trait)
// ============================================================================

export interface DICOMViewerConfig {
  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** DICOM file path or URL */
  source: string;

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Viewer mode */
  mode: 'slice' | '3d_volume' | 'mpr' | 'vr';

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Window/Level presets for visualization */
  windowLevel?: {
    center: number; // Window center (Hounsfield units)
    width: number; // Window width
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Slice navigation (for slice mode) */
  slice?: {
    axis: 'axial' | 'sagittal' | 'coronal';
    index: number;
    total: number;
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Color map for visualization */
  colorMap?: 'grayscale' | 'bone' | 'hot' | 'cool' | 'pet';

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Annotations enabled */
  annotations?: boolean;

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** VR interaction mode */
  interaction?: 'windowing' | 'slice_scroll' | 'rotation' | 'measurement';
}

// ============================================================================
// Surgical Planning (@surgical_plan trait)
// ============================================================================

export interface SurgicalPlanConfig {
  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Patient anatomy (DICOM, OBJ, STL) */
  anatomy: string;

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Surgical procedure type */
  procedure: 'craniotomy' | 'arthroplasty' | 'tumor_resection' | 'orthopedic' | 'custom';

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Pre-operative planning tools */
  tools: {
    /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Measurement tools enabled */
    measure?: boolean;

    /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Virtual scalpel for cutting planes */
    cutting?: boolean;

    /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Implant positioning */
    implant?: {
      model: string;
      position: [number, number, number];
      rotation: [number, number, number];
    };

    /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Collision detection with critical structures */
    safetyMargin?: number; // mm
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Collaborative planning (multi-user) */
  collaborative?: boolean;

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
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
  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Anatomy type */
  anatomy: 'heart' | 'brain' | 'skeleton' | 'organs' | 'vascular' | 'nervous_system' | 'custom';

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Model detail level */
  detail: 'simplified' | 'standard' | 'high_detail' | 'scientific';

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Interactive labels */
  labels?: {
    enabled: boolean;
    language?: 'en' | 'es' | 'fr' | 'de' | 'ja';
    detail?: 'basic' | 'medical_terms' | 'full_description';
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Layer visibility (for cross-section views) */
  layers?: {
    skin?: boolean;
    muscle?: boolean;
    bones?: boolean;
    organs?: boolean;
    vascular?: boolean;
    nervous?: boolean;
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Animation support */
  animation?: {
    type: 'heartbeat' | 'breathing' | 'blood_flow' | 'muscle_contraction';
    speed: number;
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
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
  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Simulation type */
  type: 'cpr' | 'intubation' | 'suturing' | 'iv_insertion' | 'laparoscopy' | 'custom';

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Haptic feedback */
  haptics?: {
    enabled: boolean;
    resistance?: number; // 0-1
    vibration?: boolean;
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Scoring/Assessment */
  assessment?: {
    enabled: boolean;
    criteria: string[]; // e.g., ["technique", "speed", "accuracy"]
    realtime_feedback?: boolean;
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Patient vitals simulation */
  vitals?: {
    heartRate?: number;
    bloodPressure?: [number, number]; // systolic/diastolic
    oxygenSaturation?: number;
    respiration?: number;
  };

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
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
  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Load DICOM file and return metadata */
  loadDICOM(filePath: string): Promise<DICOMMetadata>;

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Apply window/level to DICOM data */
  applyWindowLevel(config: { center: number; width: number }): Promise<Uint8Array>;

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** Extract 3D volume from DICOM series */
  extract3DVolume(seriesPath: string): Promise<Volume3D>;

  /**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
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

/**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** @patient_record trait â€” structured patient data for simulation context */
export interface PatientRecordTrait {
  trait: 'patient_record';
  patientId: string;
  name?: string;
  age?: number;
  conditions: string[];
  medications?: string[];
  allergies?: string[];
}

/**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** @diagnosis_assist trait â€” AI-driven differential diagnosis overlay */
export interface DiagnosisAssistTrait {
  trait: 'diagnosis_assist';
  symptoms: string[];
  imaging_modality?: 'CT' | 'MRI' | 'PET' | 'X-ray' | 'ultrasound';
  region: string;
  differentials?: Array<{ condition: string; probability: number }>;
}

/**
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/** @vitals_monitor trait â€” real-time patient vitals display */
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
 * THIN (ratchet P5): DICOM viewer, surgical planning, and medical simulation
 * interfaces are TYPE DEFINITIONS ONLY — no runtime loads DICOM files, renders volumes,
 * drives haptic hardware, or integrates with FHIR/HL7 servers. compile() produces
 * JSON/HL7 text output from in-memory structs but does not connect to any real system.
 */
/**
 * Compile medical traits into a target representation.
 *
 * - `fhir_json`    â€” FHIR R4 Bundle JSON (default)
 * - `hl7_segment`  â€” HL7v2 pipe-delimited segments
 * - `holo`         â€” HoloScript .holo composition
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
