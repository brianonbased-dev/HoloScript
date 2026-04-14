"""
DICOM Medical Imaging Bridge for HoloScript
Provides DICOM loading, windowing, and 3D volume extraction via JSON-RPC
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any, List, Tuple

try:
    import pydicom
    import numpy as np
except ImportError:
    print("ERROR: Missing dependencies. Install: pip install pydicom numpy", file=sys.stderr)
    sys.exit(1)


class DICOMBridge:
    """Python bridge for DICOM medical imaging operations"""

    def __init__(self):
        self.current_dataset = None

    def load_dicom(self, file_path: str) -> Dict[str, Any]:
        """
        Load DICOM file and return metadata

        Args:
            file_path: Path to DICOM file (.dcm)

        Returns:
            DICOM metadata dictionary
        """
        try:
            self.current_dataset = pydicom.dcmread(file_path)
            ds = self.current_dataset

            metadata = {
                'success': True,
                'patientName': str(ds.get('PatientName', 'Unknown')),
                'patientID': str(ds.get('PatientID', 'Unknown')),
                'studyDate': str(ds.get('StudyDate', '')),
                'modality': str(ds.get('Modality', 'Unknown')),
                'sliceThickness': float(ds.get('SliceThickness', 1.0)),
                'pixelSpacing': [
                    float(ds.PixelSpacing[0]) if hasattr(ds, 'PixelSpacing') else 1.0,
                    float(ds.PixelSpacing[1]) if hasattr(ds, 'PixelSpacing') else 1.0,
                ],
                'rows': int(ds.Rows),
                'columns': int(ds.Columns),
                'windowCenter': float(ds.get('WindowCenter', 40)) if hasattr(ds, 'WindowCenter') else None,
                'windowWidth': float(ds.get('WindowWidth', 400)) if hasattr(ds, 'WindowWidth') else None,
            }

            if hasattr(ds, 'NumberOfFrames'):
                metadata['numberOfFrames'] = int(ds.NumberOfFrames)

            return metadata

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def apply_window_level(self, center: float, width: float) -> Dict[str, Any]:
        """
        Apply window/level to current DICOM dataset

        Args:
            center: Window center (Hounsfield units)
            width: Window width

        Returns:
            Windowed image data as base64-encoded PNG
        """
        if self.current_dataset is None:
            return {'success': False, 'error': 'No DICOM loaded'}

        try:
            # Get pixel array
            pixels = self.current_dataset.pixel_array

            # Prevent division by zero for extreme contrast
            width = max(1.0, float(width))

            # Apply window/level transformation
            lower = center - (width / 2)
            upper = center + (width / 2)
            windowed = np.clip(pixels, lower, upper)

            # Normalize to 0-255 safely
            window_range = upper - lower
            windowed = ((windowed - lower) / window_range * 255.0)
            
            # Ensure it is properly clipped before casting to uint8
            windowed = np.clip(windowed, 0, 255).astype(np.uint8)

            # Convert to list for JSON serialization
            return {
                'success': True,
                'width': int(self.current_dataset.Columns),
                'height': int(self.current_dataset.Rows),
                'data': windowed.flatten().tolist(),  # 1D array
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def extract_3d_volume(self, series_path: str) -> Dict[str, Any]:
        """
        Extract 3D volume from DICOM series (multiple slice files)

        Args:
            series_path: Directory containing DICOM series

        Returns:
            3D volume data with dimensions and spacing
        """
        try:
            series_dir = Path(series_path)
            if not series_dir.is_dir():
                return {'success': False, 'error': f'Not a directory: {series_path}'}

            # Load all DICOM files in directory
            dicom_files = sorted(series_dir.glob('*.dcm'))
            if not dicom_files:
                return {'success': False, 'error': 'No DICOM files found'}

            # Read first file for metadata
            first_ds = pydicom.dcmread(dicom_files[0])
            rows = first_ds.Rows
            columns = first_ds.Columns
            num_slices = len(dicom_files)

            # Get spacing
            pixel_spacing = [float(x) for x in first_ds.PixelSpacing]
            slice_thickness = float(first_ds.get('SliceThickness', 1.0))

            # Allocate volume
            volume = np.zeros((num_slices, rows, columns), dtype=np.int16)

            # Load all slices
            for i, file_path in enumerate(dicom_files):
                ds = pydicom.dcmread(file_path)
                volume[i] = ds.pixel_array

            return {
                'success': True,
                'dimensions': [num_slices, rows, columns],
                'spacing': [slice_thickness, pixel_spacing[0], pixel_spacing[1]],
                'origin': [0, 0, 0],  # Can extract from ImagePositionPatient if available
                'min': int(volume.min()),
                'max': int(volume.max()),
                # Note: Returning full volume data would be too large for JSON
                # In production, save to file or stream binary data
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def dicom_to_mesh(self, threshold: float, smoothing: bool = True) -> Dict[str, Any]:
        """
        Convert current DICOM to 3D mesh using marching cubes

        Args:
            threshold: Hounsfield threshold for surface extraction
            smoothing: Apply mesh smoothing

        Returns:
            Mesh vertices and faces

        Note: Requires scikit-image for marching cubes algorithm
        """
        try:
            from skimage import measure
        except ImportError:
            return {
                'success': False,
                'error': 'scikit-image required: pip install scikit-image'
            }

        if self.current_dataset is None:
            return {'success': False, 'error': 'No DICOM loaded'}

        try:
            # For single-slice DICOM, this would need 3D volume
            # Simplified example for demo
            pixels = self.current_dataset.pixel_array

            # Marching cubes requires 3D volume
            # In practice, use extract_3d_volume first
            return {
                'success': False,
                'error': 'Mesh extraction requires 3D volume (DICOM series)'
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}


# JSON-RPC server (simple stdin/stdout protocol)
def main():
    bridge = DICOMBridge()

    print("DICOM Bridge Ready", file=sys.stderr)

    for line in sys.stdin:
        try:
            request = json.loads(line.strip())
            method = request.get('method')
            params = request.get('params', {})

            if method == 'loadDICOM':
                result = bridge.load_dicom(params['filePath'])
            elif method == 'applyWindowLevel':
                result = bridge.apply_window_level(params['center'], params['width'])
            elif method == 'extract3DVolume':
                result = bridge.extract3d_volume(params['seriesPath'])
            elif method == 'dicomToMesh':
                result = bridge.dicom_to_mesh(
                    params['threshold'],
                    params.get('smoothing', True)
                )
            else:
                result = {'success': False, 'error': f'Unknown method: {method}'}

            print(json.dumps(result))
            sys.stdout.flush()

        except Exception as e:
            error_result = {'success': False, 'error': str(e)}
            print(json.dumps(error_result))
            sys.stdout.flush()


if __name__ == '__main__':
    main()
