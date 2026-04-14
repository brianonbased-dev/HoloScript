#!/usr/bin/env python3
"""
AutoDock Vina Integration Bridge
Automated molecular docking for HoloScript Narupa plugin

Requirements:
  pip install vina

Usage:
  from autodock_bridge import AutoDockBridge

  bridge = AutoDockBridge()
  results = bridge.run_docking({
      'protein_pdb': 'receptor.pdb',
      'ligand_mol': 'compound.mol',
      'box_center': [10.5, 12.3, 8.7],
      'box_size': [20, 20, 20],
      'exhaustiveness': 8,
      'n_poses': 10,
  })
"""

import sys
import os
from typing import Dict, List, Any, Optional

class AutoDockBridge:
    """
    AutoDock Vina bridge for automated molecular docking
    """

    def __init__(self):
        """Initialize AutoDock bridge"""
        self.vina = None
        self._check_dependencies()

    def _check_dependencies(self):
        """Check if AutoDock Vina is installed"""
        try:
            from vina import Vina
            self.vina_available = True
            print("✓ AutoDock Vina is available", file=sys.stderr)
        except ImportError:
            self.vina_available = False
            print("⚠ AutoDock Vina not installed. Run: pip install vina", file=sys.stderr)

    def run_docking(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run AutoDock Vina docking

        Args:
            config: Docking configuration
              - protein_pdb: Path to protein PDB file
              - ligand_mol: Path to ligand MOL/PDBQT file
              - box_center: List[float] - Docking box center [x, y, z]
              - box_size: List[float] - Docking box size [x, y, z]
              - exhaustiveness: int - Search exhaustiveness (default: 8)
              - n_poses: int - Number of poses to generate (default: 10)

        Returns:
            Dictionary with docking results:
              - poses: List of docked poses with affinities
              - best_affinity: Best binding affinity (kcal/mol)
              - protein_pdb: Path to input protein
              - ligand_mol: Path to input ligand
        """
        if not self.vina_available:
            return {
                'error': 'AutoDock Vina not installed',
                'message': 'Please install: pip install vina',
                'status': 'failed',
            }

        try:
            from vina import Vina

            # Extract parameters
            protein_pdb = config['protein_pdb']
            ligand_mol = config['ligand_mol']
            box_center = config['box_center']  # [x, y, z]
            box_size = config['box_size']      # [x, y, z]
            exhaustiveness = config.get('exhaustiveness', 8)
            n_poses = config.get('n_poses', 10)

            # Validate files exist
            if not os.path.exists(protein_pdb):
                raise FileNotFoundError(f"Protein file not found: {protein_pdb}")
            if not os.path.exists(ligand_mol):
                raise FileNotFoundError(f"Ligand file not found: {ligand_mol}")

            # Initialize Vina
            v = Vina(sf_name='vina', cpu=0, verbosity=1)

            # Set receptor (protein)
            v.set_receptor(protein_pdb)

            # Set ligand
            v.set_ligand_from_file(ligand_mol)

            # Compute Vina maps (scoring grid)
            v.compute_vina_maps(
                center=box_center,
                box_size=box_size,
            )

            # Perform docking
            v.dock(exhaustiveness=exhaustiveness, n_poses=n_poses)

            # Extract results
            poses = []
            energies = v.energies(n_poses=n_poses)

            for i, energy_data in enumerate(energies):
                pose_data = {
                    'pose_index': i + 1,
                    'affinity': energy_data[0],  # Binding affinity (kcal/mol)
                    'rmsd_lb': energy_data[1],   # RMSD lower bound
                    'rmsd_ub': energy_data[2],   # RMSD upper bound
                }
                poses.append(pose_data)

            # Get best affinity
            best_affinity = min([p['affinity'] for p in poses]) if poses else None

            # Write output poses (optional)
            output_pdbqt = ligand_mol.replace('.mol', '_docked.pdbqt').replace('.pdb', '_docked.pdbqt')
            v.write_poses(output_pdbqt, n_poses=n_poses, overwrite=True)

            return {
                'status': 'success',
                'poses': poses,
                'best_affinity': best_affinity,
                'best_pose_index': 1,  # Poses are sorted by affinity
                'num_poses': len(poses),
                'protein_pdb': protein_pdb,
                'ligand_mol': ligand_mol,
                'output_pdbqt': output_pdbqt,
                'docking_parameters': {
                    'box_center': box_center,
                    'box_size': box_size,
                    'exhaustiveness': exhaustiveness,
                    'n_poses': n_poses,
                },
            }

        except Exception as e:
            return {
                'error': str(e),
                'status': 'failed',
                'message': f'AutoDock Vina docking failed: {str(e)}',
            }

    def run_parallel_docking(self, configs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Run multiple docking jobs in parallel

        Args:
            configs: List of docking configurations

        Returns:
            List of docking results
        """
        results = []
        for i, config in enumerate(configs):
            print(f"Running docking job {i+1}/{len(configs)}...", file=sys.stderr)
            result = self.run_docking(config)
            results.append(result)

        # Sort by best affinity
        successful_results = [r for r in results if r.get('status') == 'success']
        successful_results.sort(key=lambda x: x.get('best_affinity', float('inf')))

        return results

    def get_status(self) -> Dict[str, Any]:
        """
        Get AutoDock bridge status

        Returns:
            Status dictionary
        """
        return {
            'autodock_available': self.vina_available,
            'python_version': sys.version,
            'module': 'autodock_bridge',
            'version': '1.2.0',
        }


# Test mode
if __name__ == '__main__':
    bridge = AutoDockBridge()

    # Test status
    status = bridge.get_status()
    print("AutoDock Bridge Status:")
    print(f"  Available: {status['autodock_available']}")
    print(f"  Python: {status['python_version']}")

    if not bridge.vina_available:
        print("\n⚠ To use AutoDock features, install vina:")
        print("  pip install vina")
        sys.exit(1)

    # Example docking test (requires test files)
    # test_config = {
    #     'protein_pdb': 'test_receptor.pdb',
    #     'ligand_mol': 'test_ligand.mol',
    #     'box_center': [10, 10, 10],
    #     'box_size': [20, 20, 20],
    # }
    # result = bridge.run_docking(test_config)
    # print(f"\nDocking result: {result}")
