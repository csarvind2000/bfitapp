import os
import shutil
import subprocess
import tempfile
import gzip
from typing import Dict, Tuple, Union
import nibabel as nib
import numpy as np
from typing import Dict, Tuple, Optional
import json

MULTI_CHANNEL_VARIANTS = {
    "47class": ("fat", "water", "inphase", "fatfraction"),
}

LOCAL_NNUNET_PREDICT = (
    f"python {os.path.join(os.path.dirname(__file__), 'nnunet_predict_with_local_trainers.py')}"
)

# ============================================================
# === CT WINDOWING ===
# ============================================================
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


# ============================================================
# === COMPRESS NIFTI ===
# ============================================================
def compress_nii_to_nii_gz(input_path: str) -> str:
    if input_path.endswith(".nii.gz"):
        return input_path

    compressed_path = input_path + ".gz"
    if os.path.exists(compressed_path):
        print(f"[INFO] Using existing compressed file: {compressed_path}")
        return compressed_path

    print(f"[INFO] Compressing: {input_path} → {compressed_path}")
    img = nib.load(input_path)
    nib.save(img, compressed_path)
    return compressed_path


# ============================================================
# === SEGMENTATION COMMAND EXECUTOR ===
# ============================================================
def run_segmentation_command(file_path: Union[str, Dict[str, str]],
                             region: str,
                             modality: str,
                             variant: str,
                             segmentation_commands: Dict[Tuple[str, str, str], str],
                             output_folders: Dict[str, str]) -> str:

    key = (region, modality, variant)

    command_template = segmentation_commands.get(key)

    if not command_template:
        raise ValueError(f"❌ No command for {key}")

    output_key = f"{region}_{modality}_{variant}"
    output_folder = output_folders.get(output_key)

    if not output_folder:
        raise ValueError(f"❌ No output folder for {output_key}")

    channel_order = MULTI_CHANNEL_VARIANTS.get(variant)
    if channel_order:
        if not isinstance(file_path, dict):
            raise ValueError(f"❌ {variant} requires channel inputs: {', '.join(channel_order)}")
        missing_channels = [channel for channel in channel_order if channel not in file_path]
        if missing_channels:
            raise ValueError(f"❌ Missing {variant} channels: {', '.join(missing_channels)}")

        compressed_inputs = {
            channel: compress_nii_to_nii_gz(file_path[channel])
            for channel in channel_order
        }
        case_source = compressed_inputs["inphase"]
    else:
        if isinstance(file_path, dict):
            raise ValueError(f"❌ {variant} expects a single input image")
        compressed_inputs = {"image": compress_nii_to_nii_gz(file_path)}
        case_source = compressed_inputs["image"]

    case_id = os.path.basename(case_source).replace(".nii.gz", "")
    case_id = case_id.replace(".", "_").replace(" ", "_")

    print(f"[DEBUG] Case ID: {case_id}")

    input_dir = tempfile.mkdtemp()
    case_dir = os.path.join(input_dir, case_id)
    os.makedirs(case_dir, exist_ok=True)

    if channel_order:
        for channel_index, channel in enumerate(channel_order):
            final_input_path = os.path.join(case_dir, f"{case_id}_{channel_index:04d}.nii.gz")
            shutil.copyfile(compressed_inputs[channel], final_input_path)
            print(f"[DEBUG] Channel {channel_index} ({channel}) → {final_input_path}")
    else:
        final_input_path = os.path.join(case_dir, f"{case_id}_0000.nii.gz")
        shutil.copyfile(compressed_inputs["image"], final_input_path)

    # Run nnUNet
    command = command_template.format(input_file=case_dir, output_dir=output_folder)

    print(f"[DEBUG] Running: {command}")

    result = subprocess.run(command, shell=True, capture_output=True, text=True)

    print("stdout:", result.stdout)
    print("stderr:", result.stderr)

    if result.returncode != 0:
        raise RuntimeError(f"❌ nnUNet failed:\n{result.stderr}")

    predicted_gz = os.path.join(output_folder, f"{case_id}.nii.gz")
    predicted_nii = os.path.join(output_folder, f"{case_id}.nii")

    if os.path.exists(predicted_gz):
        return predicted_gz
    elif os.path.exists(predicted_nii):
        return predicted_nii
    else:
        raise FileNotFoundError(f"❌ Output not found: {predicted_gz}")


# ============================================================
# === MAIN PROCESS FUNCTION ===
# ============================================================
def process_scan(file_path: Union[str, Dict[str, str]],
                 region: str,
                 modality: str,
                 variant: str,
                 segmentation_commands: Dict[Tuple[str, str, str], str],
                 output_folders: Dict[str, str]) -> str:

    print(f"\n🔍 Processing: {file_path}")
    print(f"➡️ Mode: {region} | {modality} | {variant}")

    # CT Windowing
    if modality.upper() == "CT":
        if isinstance(file_path, dict):
            raise ValueError("❌ CT windowing does not support multi-channel input")
        run_windowing_script(file_path, "0", "400", "-200", "200")

        patient_dir = os.path.dirname(os.path.dirname(file_path))
        file_path = os.path.join(patient_dir, "window", os.path.basename(file_path))

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"❌ Windowed file not found: {file_path}")

    return run_segmentation_command(
        file_path,
        region,
        modality,
        variant,
        segmentation_commands,
        output_folders
    )


# ============================================================
# === SEGMENTATION COMMANDS ===
# ============================================================
segmentation_commands = {

    # -------- ABDOMEN --------
    ("Abdomen", "CT", "abd_ct"):
        "nnUNetv2_predict -i {input_file} -o {output_dir} -d 696 -c 2d -tr nnUNetTrainer -p nnUNetPlans",

    ("Abdomen", "MRI", "abd_mr"):
        "nnUNetv2_predict -i {input_file} -o {output_dir} -d 699 -c 3d_fullres -tr nnUNetTrainer -p nnUNetPlans -f 0",

    # -------- THIGH --------
    ("Thigh", "MRI", "5class"):
        f"{LOCAL_NNUNET_PREDICT} -i {{input_file}} -o {{output_dir}} -d 700 -c 3d_fullres -tr nnUNetTrainerTopK10Loss_33os_1000epochs -p nnUNetPlans -f 0",

    ("Thigh", "MRI", "47class"):
        f"{LOCAL_NNUNET_PREDICT} -i {{input_file}} -o {{output_dir}} -d 703 -c 2d -tr nnUNetTrainerDeepLabHRnetCac_nw -p nnUNetPlans -f 0",
}
