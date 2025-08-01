import os
import shutil
import subprocess
import pydicom
import tempfile
from glob import glob

def is_dicom(file_path):
    try:
        pydicom.dcmread(file_path, stop_before_pixels=True)
        return True
    except Exception:
        return False

def convert_dicom_to_nii(dicom_input, output_dir, modality):
    try:
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # Create a temporary directory to store NIfTI files
        temp_output_dir = tempfile.mkdtemp()

        # Print for debugging: check if the input folder contains files
        print(f"Checking input folder: {dicom_input}")
        dicom_files = [f for f in os.listdir(dicom_input) if is_dicom(os.path.join(dicom_input, f))]
        print(f"Found DICOM files: {dicom_files}")

        if not dicom_files:
            print("No valid DICOM files found.")
            return None, "No valid DICOM files found in the input folder"

        # Run dcm2niix to convert DICOM to NIfTI
        result = subprocess.run(
            ['dcm2niix', '-z', 'n', '-o', temp_output_dir, dicom_input],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False
        )
        print(f"stdout: {result.stdout.decode()}")
        print(f"stderr: {result.stderr.decode()}")

        # Collect NIfTI files created by dcm2niix
        nii_files = glob(os.path.join(temp_output_dir, '*.nii'))
        print(f"Converted NIfTI files: {nii_files}")
        renamed_files = []

        if os.path.isfile(dicom_input):
            base_name = os.path.splitext(os.path.basename(dicom_input))[0]
            target_path = os.path.join(output_dir, base_name + ".nii")
            shutil.move(nii_files[0], target_path)
            renamed_files.append(target_path)

        elif os.path.isdir(dicom_input):
            dicom_files = sorted([
                f for f in os.listdir(dicom_input)
                if is_dicom(os.path.join(dicom_input, f))
            ])
            print(f"Valid DICOM files found: {dicom_files}")
            for i, nii_file in enumerate(nii_files):
                if i < len(dicom_files):
                    base_name = os.path.splitext(dicom_files[i])[0]
                else:
                    base_name = f"converted_{i}"
                target_path = os.path.join(output_dir, base_name + ".nii")
                shutil.move(nii_file, target_path)
                renamed_files.append(target_path)

        return renamed_files, f"{len(renamed_files)} NIfTI file(s) created and renamed."

    except Exception as e:
        print(f"Error during conversion: {e}")
        return None, str(e)
