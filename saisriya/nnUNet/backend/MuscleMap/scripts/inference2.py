import os
import glob
import subprocess

# 🔧 Set your paths here
input_folder = "/media/tct-bii/DataHDD/saisriya/Upper_Thigh"
output_folder = "/media/tct-bii/DataHDD/saisriya/Upper_Thigh_Results"
region = "pelvis"  # Options: thigh, abdomen, pelvis, leg
use_gpu = "N"     # Use "N" if you want CPU

# Create output folder if it doesn't exist
os.makedirs(output_folder, exist_ok=True)

# Find all *_wateronly.nii.gz files
nii_files = sorted(glob.glob(os.path.join(input_folder, "*_wateronly.nii.gz")))

if not nii_files:
    print("No *_wateronly.nii.gz files found in the specified folder.")
else:
    for nii_file in nii_files:
        print(f"Processing {nii_file}...")
        cmd = [
            "/media/tct-bii/DataHDD/saisriya/venv/bin/python",
            "/media/tct-bii/DataHDD/saisriya/MuscleMap/scripts/mm_segment.py",
            "-i", nii_file,
            "-r", region,
            "-o", output_folder,
            "-g", use_gpu
        ]
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as e:
            print(f"[ERROR] Failed to process {nii_file}: {e}")
