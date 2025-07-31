#!/usr/bin/env python3

import os
import subprocess

def get_all_nifti_files(directory):
    return sorted([
        os.path.join(directory, f)
        for f in os.listdir(directory)
        if f.endswith(".nii") or f.endswith(".nii.gz")
    ])

def main():
    print("=== MuscleMap Batch Inference ===")

    input_dir = input("Enter path to the input folder containing NIfTI images: ").strip()
    while not os.path.isdir(input_dir):
        input_dir = input("Invalid path. Please enter a valid input folder: ").strip()

    output_dir = input("Enter path to the output folder (will be created if it doesn't exist): ").strip()
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    region = input("Enter region to segment (abdomen / pelvis / thigh / leg): ").strip().lower()
    while region not in ["abdomen", "pelvis", "thigh", "leg"]:
        region = input("Invalid region. Choose from: abdomen / pelvis / thigh / leg: ").strip().lower()

    use_gpu = input("Use GPU? (Y/N): ").strip().upper()
    while use_gpu not in ["Y", "N"]:
        use_gpu = input("Invalid input. Enter Y for GPU or N for CPU: ").strip().upper()

    image_paths = get_all_nifti_files(input_dir)
    if not image_paths:
        print(f"[ERROR] No NIfTI images found in {input_dir}")
        return

    image_list_str = ",".join(image_paths)

    cmd = [
        "/media/tct-bii/DataHDD/saisriya/venv/bin/python",  # or "python" if run from venv
        "/media/tct-bii/DataHDD/saisriya/MuscleMap/scripts/mm_segment.py",
        "-i", image_list_str,
        "-r", region,
        "-o", output_dir,
        "-g", use_gpu
    ]

    print("\n[INFO] Running mm_segment with the selected images...")
    subprocess.run(cmd)

if __name__ == "__main__":
    main()

