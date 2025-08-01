import os
import shutil
import subprocess
import tempfile
import gzip
from typing import Dict, Tuple
import nibabel as nib

# === CT Windowing ===
def run_windowing_script(input_file: str, wc: str, ww: str, target_min: str, target_max: str):
    script_path = os.path.join(os.path.dirname(__file__), "window_ct_images.py")
    try:
        print(f"[DEBUG] Windowing command: python {script_path} {input_file} {wc} {ww} {target_min} {target_max}")
        result = subprocess.run(
            ["python", script_path, input_file, wc, ww, target_min, target_max],
            capture_output=True,
            text=True,
            check=True
        )
        print(f"[STDOUT] {result.stdout}")
        print(f"[STDERR] {result.stderr}")
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Windowing failed:\nSTDOUT: {e.stdout}\nSTDERR: {e.stderr}")
        raise RuntimeError("CT windowing failed")

# === Compress .nii to .nii.gz if needed ===
def compress_nii_to_nii_gz(input_path: str) -> str:
    if input_path.endswith(".nii.gz"):
        return input_path

    compressed_path = input_path + ".gz"
    if os.path.exists(compressed_path):
        print(f"[INFO] Using existing compressed file: {compressed_path}")
        return compressed_path

    print(f"[INFO] Compressing .nii to .nii.gz: {input_path} → {compressed_path}")
    img = nib.load(input_path)
    print(img.header)
    nib.save(img, compressed_path)
    return compressed_path

# === Segmentation Command Executor ===
def run_segmentation_command(file_path: str, region: str, modality: str,
                             segmentation_commands: Dict[Tuple[str, str], str],
                             output_folders: Dict[str, str]) -> str:
    key = f"{region}_{modality}"
    command_template = segmentation_commands.get((region, modality))
    output_folder = output_folders.get(key)

    if not command_template or not output_folder:
        raise ValueError(f"Missing command or output folder for {region}, {modality}")

    # Ensure nnUNet input is .nii.gz
    nii_gz_path = compress_nii_to_nii_gz(file_path)
    case_id = os.path.basename(nii_gz_path).replace(".nii.gz", "").replace(".", "_")
    print(f"[DEBUG] Final case name used: {case_id}")
    input_dir = tempfile.mkdtemp()
    case_dir = os.path.join(input_dir, case_id)
    os.makedirs(case_dir, exist_ok=True)
    final_input_path = os.path.join(case_dir, f"{case_id}_0000.nii.gz")
    shutil.copyfile(nii_gz_path, final_input_path)

    # Run nnUNet command
    command = command_template.format(input_file=case_dir, output_dir=output_folder)
    print(f"[DEBUG] Final case name used: {case_id}")
    print(f"[DEBUG] Input dir for nnUNet: {input_dir}")
    print(f"[DEBUG] Case dir: {case_dir}")
    print(f"[DEBUG] Case file: {final_input_path}")
    print(f"[DEBUG] Running segmentation command: {command}")

    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    print("stdout:", result.stdout)
    print("stderr:", result.stderr)

    # Corrected output path
    predicted_gz = os.path.join(output_folder, f"{case_id}.nii.gz")
    predicted_nii = os.path.join(output_folder, f"{case_id}.nii")

    if os.path.exists(predicted_gz):
        print(f"[DEBUG] predicted_gz: {predicted_gz}")
        return predicted_gz
    elif os.path.exists(predicted_nii):
        print(f"[DEBUG] predicted_nii: {predicted_nii}")
        return predicted_nii
    else:
        raise FileNotFoundError(f"Segmentation output not found: {predicted_gz} or {predicted_nii}")


# === Process a Single NIfTI Scan ===
def process_scan(file_path: str, region: str, modality: str, directories: Dict[str, str],
                 segmentation_commands: Dict[Tuple[str, str], str],
                 output_folders: Dict[str, str],
                 summary_rows: list) -> str:

    print(f"🔍 Processing: {file_path}")

    if modality.upper() == "CT":
        wc = "0"
        ww = "400"
        target_min = "-200"
        target_max = "200"

        run_windowing_script(file_path, wc, ww, target_min, target_max)

        patient_dir = os.path.dirname(os.path.dirname(file_path))
        windowed_file = os.path.join(patient_dir, "window", os.path.basename(file_path))
        file_path = windowed_file

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Windowed file not found: {file_path}")

    return run_segmentation_command(file_path, region, modality, segmentation_commands, output_folders)

# === Segmentation Commands Mapping ===
segmentation_commands = {
    ("Abdomen", "CT"): "nnUNetv2_predict -i {input_file} -o {output_dir} -d 696 -c 2d -tr nnUNetTrainer -p nnUNetPlans",
    ("Abdomen", "MRI"): "nnUNetv2_predict -i {input_file} -o {output_dir} -d 699 -c 3d_fullres -tr nnUNetTrainer -p nnUNetPlans -f 0",
    ("Thigh", "CT"): "nnUNetv2_predict -i {input_file} -o {output_dir} -d 698 -c 3d_fullres -tr nnUNetTrainer -p nnUNetPlans",
    ("Thigh", "MRI"): "nnUNetv2_predict -i {input_file} -o {output_dir} -d 697 -c 3d_fullres -tr nnUNetTrainer -p nnUNetPlans -f 0",
}