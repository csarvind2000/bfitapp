import os
import shutil
import subprocess
import pydicom
import tempfile
import SimpleITK as sitk
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

        reader = sitk.ImageSeriesReader()

        # Get sorted DICOM filenames
        dicom_names = reader.GetGDCMSeriesFileNames(dicom_input)
        reader.SetFileNames(dicom_names)

        image = reader.Execute()
        sitk.WriteImage(image, os.path.join(temp_output_dir, "input.nii.gz"))


        # Collect NIfTI files created by dcm2niix
        nii_files = glob(os.path.join(temp_output_dir, '*.nii.gz'))
        print(f"Converted NIfTI files: {nii_files}")
        renamed_files = [os.path.join(temp_output_dir, "input.nii.gz")]

        return renamed_files, f"{len(renamed_files)} NIfTI file(s) created and renamed."

    except Exception as e:
        print(f"Error during conversion: {e}")
        return None, str(e)
