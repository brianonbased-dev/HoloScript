/**
 * Scientific Computing & Molecular Dynamics Traits
 *
 * Phase 1 scientific traits for VR-based drug discovery, molecular dynamics,
 * and computational chemistry using Narupa integration.
 *
 * @category Scientific
 * @packageDocumentation
 * @version 1.0.0
 */

export const SCIENTIFIC_COMPUTING_TRAITS = [
  // Integration & Simulation (5 traits)
  'narupa_integration', // Connect to Narupa MD server
  'molecular_dynamics', // Run molecular dynamics simulation
  'energy_minimization', // Minimize molecular energy
  'force_field', // Apply force field to simulation
  'auto_dock', // Automated molecular docking (AutoDock Vina)

  // Visualization (6 traits)
  'protein_visualization', // Render protein structure
  'ligand_visualization', // Render ligand molecules
  'chemical_bond', // Display chemical bonds
  'hydrogen_bonds', // Show hydrogen bond interactions
  'hydrophobic_surface', // Render hydrophobic surface
  'electrostatic_surface', // Render electrostatic potential surface

  // Data & Analysis (6 traits)
  'pdb_loader', // Load PDB (Protein Data Bank) files
  'mol_loader', // Load MOL molecule files
  'database_query', // Fetch structures from PDB/AlphaFold databases
  'trajectory_analysis', // Analyze MD trajectory data
  'trajectory_playback', // Play back simulation trajectory
  'binding_affinity', // Calculate binding affinity metrics

  // Interaction & Annotation (4 traits)
  'interactive_forces', // Apply VR controller forces to atoms
  'atom_selection', // Select atoms interactively
  'atom_labels', // Display atom labels
  'residue_labels', // Display residue labels

  // AI/ML Prediction (4 traits)
  'alphafold_predict', // AlphaFold structure prediction from sequence
  'structure_confidence', // pLDDT confidence score visualization
  'multimer_predict', // AlphaFold-Multimer (protein complexes)
  'pae_visualization', // Predicted Aligned Error heatmap

  // Legacy/Extended (3 traits - for backward compatibility)
  'protein_structure', // General protein structure trait
  'simulation_control', // Control simulation parameters
  'collaborative_science', // Multi-user scientific collaboration
] as const;

/**
 * Scientific Computing trait name type
 */
export type ScientificComputingTraitName = (typeof SCIENTIFIC_COMPUTING_TRAITS)[number];

/**
 * Total count: 28 traits
 * Integration: @holoscript/narupa-plugin v1.0.0+, @holoscript/alphafold-plugin v1.0.0+
 * Phase: 1 of 5 (scientific traits expansion)
 * v1.1.0: Added database_query trait for PDB/AlphaFold fetching
 * v1.2.0: Added auto_dock trait for AutoDock Vina integration
 * v1.3.0: Added AlphaFold prediction traits (alphafold_predict, structure_confidence, multimer_predict, pae_visualization)
 */
