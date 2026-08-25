import os
import base64
import tempfile
import contextlib
import glob
import importlib
import nibabel as nib
import numpy as np
from flask import Flask, request, jsonify
from nibabel.processing import resample_from_to
from utils.dicom_converter import convert_dicom_to_nii as convert_dicom_to_nifti
from utils.segmentation import process_scan, segmentation_commands
from utils.converter1 import DicomSegConverter
from utils.fatPlotTest import genericVolumeAnalysis
from utils.remove_small_islands import remove_small_foreground_islands
from utils.converter1 import (
    DEFAULT_ABDOMEN_LABEL_MAP,
    DEFAULT_THIGH_5CLASS_LABEL_MAP,
    DEFAULT_THIGH_47CLASS_LABEL_MAP,
)

DEBUG = os.environ.get("DEBUG_MODE", "True") == "True"

NNUNET_BASE = "."
os.environ["nnUNet_raw"] = os.path.join(NNUNET_BASE, "nnunet_raw")
os.environ["nnUNet_preprocessed"] = os.path.join(NNUNET_BASE, "nnunet_preprocessed")
os.environ["nnUNet_results"] = os.path.join(NNUNET_BASE, "nnunet_results")


def install_custom_nnunet_trainers() -> None:
    """Make local custom trainers discoverable by nnUNetv2_predict."""
    try:
        import nnunetv2.training.nnUNetTrainer as trainer_package
    except Exception as e:
        print(f"[WARN] Could not import nnUNet trainer package: {e}")
        return

    trainer_sources = glob.glob(
        os.path.join(os.path.dirname(__file__), "utils", "nnUNetTrainer*.py")
    )

    if not trainer_sources:
        print("[WARN] No custom nnUNet trainer files found in /app/utils")
        return

    local_trainer_dir = os.path.dirname(trainer_sources[0])
    if local_trainer_dir not in trainer_package.__path__:
        trainer_package.__path__.append(local_trainer_dir)

    print(f"[INFO] Registered local nnUNet trainer path: {local_trainer_dir}")

    importlib.invalidate_caches()


install_custom_nnunet_trainers()

app = Flask(__name__)

# ── Canonical variant keys per anatomy/modality ───────────────────────────────
# These keys flow all the way through to the frontend's perSliceData lookup.
# Keep them in sync with VARIANT_CONFIG in maskVariantUtils.js.
VARIANT_MAP = {
    ("Abdomen", "MRI"): ["abd_mr"],
    ("Abdomen", "CT"):  ["abd_mr"],   # same label map; add a separate key if CT differs
    ("Thigh",   "MRI"): ["5class", "47class"],
    ("Thigh",   "CT"):  ["5class"],
}

THIGH_47CLASS_INPUT_CHANNELS = ("fat", "water", "inphase")
FAT_FRACTION_EPS = 1e-8


def align_nifti_to_reference(input_path: str, reference_path: str, output_dir: str) -> str:
    input_nii = nib.load(input_path)
    reference_nii = nib.load(reference_path)

    if (
        input_nii.shape == reference_nii.shape
        and np.allclose(input_nii.affine, reference_nii.affine)
    ):
        return input_path

    os.makedirs(output_dir, exist_ok=True)
    aligned_nii = resample_from_to(
        input_nii,
        (reference_nii.shape, reference_nii.affine),
        order=1,
    )

    output_path = os.path.join(output_dir, "input.nii.gz")
    header = reference_nii.header.copy()
    header.set_data_dtype(np.float32)
    nib.save(
        nib.Nifti1Image(
            aligned_nii.get_fdata(dtype=np.float32),
            reference_nii.affine,
            header,
        ),
        output_path,
    )

    print(
        "[INFO] Aligned NIfTI to inphase grid "
        f"{input_nii.shape} -> {reference_nii.shape}: {output_path}"
    )
    return output_path


def compute_fat_fraction_nifti(fat_path: str, water_path: str, output_dir: str) -> str:
    os.makedirs(output_dir, exist_ok=True)

    fat_nii = nib.load(fat_path)
    water_nii = nib.load(water_path)
    fat = fat_nii.get_fdata().astype(np.float32)
    water = water_nii.get_fdata().astype(np.float32)

    if fat.shape != water.shape:
        raise ValueError(f"Fat/water shape mismatch: fat={fat.shape}, water={water.shape}")

    fat_fraction = fat / (fat + water + FAT_FRACTION_EPS)
    fat_fraction = np.clip(fat_fraction, 0.0, 1.0).astype(np.float32)

    output_path = os.path.join(output_dir, "input.nii.gz")
    nib.save(
        nib.Nifti1Image(fat_fraction, fat_nii.affine, fat_nii.header),
        output_path,
    )

    print(
        "[INFO] Computed fatfraction "
        f"mean={float(np.mean(fat_fraction)):.4f} "
        f"min={float(np.min(fat_fraction)):.4f} "
        f"max={float(np.max(fat_fraction)):.4f}"
    )
    return output_path

# ============================================================
# FILE UPLOAD HANDLER
# ============================================================
def upload_files(region: str, modality: str):
    tmp_root = "/app/tmp"
    os.makedirs(tmp_root, exist_ok=True)

    with (
        contextlib.nullcontext(tempfile.mkdtemp(dir=tmp_root)) if DEBUG
        else tempfile.TemporaryDirectory(dir=tmp_root)
    ) as tempdir:

        raw_dicom_dir = os.path.join(tempdir, "original_dicom")
        output_dir = os.path.join(tempdir, "outputs")

        os.makedirs(raw_dicom_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        saved_dicoms, saved_niis = [], []
        saved_channel_dicoms = {}

        if request.is_json and 'b64_encoded_dicoms_by_channel' in request.json:
            for channel, dicom_data in request.json['b64_encoded_dicoms_by_channel'].items():
                channel_dir = os.path.join(raw_dicom_dir, channel)
                os.makedirs(channel_dir, exist_ok=True)
                saved_channel_dicoms[channel] = []
                for idx, data in enumerate(dicom_data):
                    dicom_path = os.path.join(channel_dir, f"I{idx}.dcm")
                    with open(dicom_path, "wb") as f:
                        f.write(base64.b64decode(data))
                    saved_channel_dicoms[channel].append(dicom_path)

        elif request.is_json and 'b64_encoded_dicoms' in request.json:
            for idx, data in enumerate(request.json['b64_encoded_dicoms']):
                dicom_path = os.path.join(raw_dicom_dir, f"I{idx}.dcm")
                with open(dicom_path, "wb") as f:
                    f.write(base64.b64decode(data))
                saved_dicoms.append(dicom_path)

        elif 'file' in request.files:
            for f in request.files.getlist('file'):
                if f and f.filename:
                    filename = f.filename.lower()
                    if filename.endswith(('.nii', '.nii.gz')):
                        nii_path = os.path.join(output_dir, f.filename)
                        f.save(nii_path)
                        saved_niis.append(nii_path)
                    else:
                        dicom_path = os.path.join(raw_dicom_dir, f.filename)
                        f.save(dicom_path)
                        saved_dicoms.append(dicom_path)
        else:
            return None

        return {
            'dicom_folder': (
                raw_dicom_dir if saved_dicoms
                else os.path.join(raw_dicom_dir, "inphase")
                if saved_channel_dicoms.get("inphase")
                else None
            ),
            'dicom_channel_folders': {
                channel: os.path.join(raw_dicom_dir, channel)
                for channel, files in saved_channel_dicoms.items()
                if files
            },
            'original_folder': output_dir if saved_niis else None,
            'has_dicoms': bool(saved_dicoms),
            'has_channel_dicoms': bool(saved_channel_dicoms),
            'has_nifti': bool(saved_niis),
            'temp_input_dir': tempdir,
            'temp_output_dir': output_dir
        }


# ============================================================
# MAIN PROCESS FUNCTION
# ============================================================
def process_request(upload_result, region: str, modality: str):

    output_dir = upload_result['temp_output_dir']
    dynamic_results_dir = os.path.join(output_dir, "results")
    os.makedirs(dynamic_results_dir, exist_ok=True)

    segmented_nifti_files, segmented_dcm_files, original_nifti_files = [], [], []
    prediction_csvs = {}

    if region.lower() not in {"abdomen", "thigh"}:
        return jsonify({'error': f'Invalid region: {region}'}), 400

    # ============================================================
    # LOAD INPUT FILES
    # ============================================================
    channel_nii_files = {}

    if upload_result.get('has_channel_dicoms'):
        try:
            missing_channels = [
                channel for channel in THIGH_47CLASS_INPUT_CHANNELS
                if channel not in upload_result.get('dicom_channel_folders', {})
            ]
            if missing_channels:
                return jsonify({
                    'error': (
                        'Missing required thigh 47-class input channels: '
                        + ', '.join(missing_channels)
                    )
                }), 400

            for channel in THIGH_47CLASS_INPUT_CHANNELS:
                nii_files_for_channel, _ = convert_dicom_to_nifti(
                    upload_result['dicom_channel_folders'][channel],
                    os.path.join(upload_result['temp_input_dir'], "original", channel),
                    modality
                )
                if not nii_files_for_channel or not all(os.path.exists(f) for f in nii_files_for_channel):
                    return jsonify({'error': f'DICOM to NIfTI conversion failed for {channel}'}), 500
                channel_nii_files[channel] = nii_files_for_channel[0]

            reference_nii_path = channel_nii_files["inphase"]
            for channel in ("fat", "water"):
                channel_nii_files[channel] = align_nifti_to_reference(
                    channel_nii_files[channel],
                    reference_nii_path,
                    os.path.join(upload_result['temp_input_dir'], "original", f"{channel}_aligned"),
                )

            channel_nii_files["fatfraction"] = compute_fat_fraction_nifti(
                channel_nii_files["fat"],
                channel_nii_files["water"],
                os.path.join(upload_result['temp_input_dir'], "original", "fatfraction"),
            )

            channel_shapes = {
                channel: nib.load(path).shape
                for channel, path in channel_nii_files.items()
            }
            if len(set(channel_shapes.values())) != 1:
                return jsonify({
                    'error': 'Prepared thigh 47-class channels have mismatched shapes',
                    'detail': channel_shapes,
                }), 500
            print(f"[INFO] Prepared thigh 47-class channel shapes: {channel_shapes}")
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({
                'error': f'Preparing thigh 47-class channels failed: {str(e)}',
                'detail': traceback.format_exc(),
            }), 500

        nii_files = [channel_nii_files["inphase"]]
        for channel in ("inphase", "water", "fat", "fatfraction"):
            nii_path = channel_nii_files.get(channel)
            if not nii_path:
                continue
            with open(nii_path, "rb") as f:
                original_nifti_files.append({
                    'filename': f"{channel}_{os.path.basename(nii_path)}",
                    'channel': channel,
                    'b64_data': base64.b64encode(f.read()).decode('utf-8')
                })

    elif upload_result['has_nifti']:
        nii_files = [
            os.path.join(upload_result['original_folder'], f)
            for f in os.listdir(upload_result['original_folder'])
            if f.endswith(('.nii', '.nii.gz'))
        ]
        for nii_path in nii_files:
            with open(nii_path, "rb") as f:
                original_nifti_files.append({
                    'filename': os.path.basename(nii_path),
                    'b64_data': base64.b64encode(f.read()).decode('utf-8')
                })

    elif upload_result['has_dicoms']:
        nii_files, _ = convert_dicom_to_nifti(
            upload_result['dicom_folder'],
            os.path.join(upload_result['temp_input_dir'], "original"),
            modality
        )
        for nii_path in nii_files:
            with open(nii_path, "rb") as f:
                original_nifti_files.append({
                    'filename': os.path.basename(nii_path),
                    'b64_data': base64.b64encode(f.read()).decode('utf-8')
                })
        if not nii_files or not all(os.path.exists(f) for f in nii_files):
            return jsonify({'error': 'DICOM to NIfTI conversion failed'}), 500

    else:
        return jsonify({'error': 'No files available for segmentation'}), 400

    # ============================================================
    # DECIDE VARIANTS — use canonical keys from VARIANT_MAP
    # ============================================================
    variants = VARIANT_MAP.get((region, modality), VARIANT_MAP.get((region.capitalize(), modality), ["abd_mr"]))

    # ============================================================
    # SEGMENTATION LOOP
    # ============================================================
    for nii_path in nii_files:
        try:
            for variant in variants:

                variant_output_dir = os.path.join(dynamic_results_dir, variant)
                os.makedirs(variant_output_dir, exist_ok=True)

                model_input = (
                    channel_nii_files
                    if variant == "47class" and channel_nii_files
                    else nii_path
                )

                seg_output_path = process_scan(
                    model_input,
                    region,
                    modality,
                    variant,
                    segmentation_commands,
                    {f"{region}_{modality}_{variant}": variant_output_dir}
                )

                if region.lower() == "thigh":
                    seg_output_path = remove_small_foreground_islands(
                        seg_output_path,
                        min_component_voxels=1000,
                        min_relative_to_largest=0.01,
                    )

                print(f"[DEBUG] Running volume analysis for: {seg_output_path}")
                genericVolumeAnalysis(seg_output_path, region, variant_output_dir)

                prediction_csvs[variant] = {}

                # ---- summary CSV ----
                csv_path = os.path.join(variant_output_dir, "volume_stats.csv")
                if os.path.exists(csv_path):
                    with open(csv_path, "rb") as f:
                        prediction_csvs[variant]["summary"] = {
                            'filename': f"{variant}_volume_stats.csv",
                            'b64_data': base64.b64encode(f.read()).decode("utf-8")
                        }

                # ---- per-slice CSV ----
                for file in os.listdir(variant_output_dir):
                    if file.endswith("_per_slice.csv"):
                        slice_csv_path = os.path.join(variant_output_dir, file)
                        with open(slice_csv_path, "rb") as f:
                            prediction_csvs[variant]["per_slice"] = {
                                'filename': f"{variant}_{file}",
                                'b64_data': base64.b64encode(f.read()).decode("utf-8")
                            }

                # DICOM SEG
                if upload_result['dicom_folder'] is not None:
                    if region.lower() == "abdomen":
                        label_map = DEFAULT_ABDOMEN_LABEL_MAP
                    elif variant == "47class":
                        label_map = DEFAULT_THIGH_47CLASS_LABEL_MAP
                    else:
                        label_map = DEFAULT_THIGH_5CLASS_LABEL_MAP

                    dicom_seg_dir = os.path.join(variant_output_dir, 'dicom_seg')
                    os.makedirs(dicom_seg_dir, exist_ok=True)
                    converter = DicomSegConverter(
                        input_dir=variant_output_dir,
                        dicom_ref=upload_result['dicom_folder'],
                        output_dir=dicom_seg_dir,
                        label_map=label_map,
                        rotate_180=(modality == "CT" and region.lower() == "abdomen")
                    )
                    converter.batch_convert()

        except Exception as e:
            import traceback
            traceback.print_exc()   # prints full stack to nnunet container stdout
            return jsonify({'error': f'Segmentation failed for {nii_path}: {str(e)}', 'detail': traceback.format_exc()}), 500
        

    # ============================================================
    # COLLECT SEGMENTATION NIFTI OUTPUTS
    # ============================================================
    for root, dirs, files in os.walk(dynamic_results_dir):
        for file in files:
            full_path = os.path.join(root, file)
            if file.endswith(('.nii', '.nii.gz')):
                variant_name = os.path.basename(root)
                with open(full_path, "rb") as f:
                    segmented_nifti_files.append({
                        'filename': f"{variant_name}_{file}",
                        'variant': variant_name,
                        'b64_data': base64.b64encode(f.read()).decode('utf-8')
                    })

    # ============================================================
    # VOLUME PLOTS
    # ============================================================
    volume_plots = {}
    expected_labels = {
        "abdomen": ["SSAT", "DSAT", "VAT"],
        "thigh": ["SSAT", "IMAT", "Muscle"]
    }
    for root, _, _ in os.walk(dynamic_results_dir):
        for label in expected_labels.get(region.lower(), []):
            plot_file = os.path.join(root, f"{label}.png")
            if os.path.exists(plot_file):
                with open(plot_file, "rb") as f:
                    volume_plots[f"{os.path.basename(root)}_{label}"] = {
                        'filename': f"{label}.png",
                        'b64_data': base64.b64encode(f.read()).decode("utf-8")
                    }

    # ============================================================
    # DICOM SEG OUTPUTS
    # ============================================================
    for root, _, files in os.walk(dynamic_results_dir):
        if "dicom_seg" in root:
            for file in files:
                full_path = os.path.join(root, file)
                with open(full_path, "rb") as f:
                    segmented_dcm_files.append({
                        'filename': file,
                        'b64_data': base64.b64encode(f.read()).decode('utf-8')
                    })

    return jsonify({
        'segmented_nifti_files': segmented_nifti_files,
        'segmented_dcm_files': segmented_dcm_files,
        'original_nifti_files': original_nifti_files,
        'volume_plots': volume_plots,
        'volume_csv': prediction_csvs if prediction_csvs else None,
    })


# ============================================================
# ROUTES
# ============================================================
@app.route('/segment/abdomen-ct', methods=['POST'])
def segment_abdomen_ct():
    upload_result = upload_files("Abdomen", "CT")
    if upload_result is None:
        return jsonify({'error': 'No valid files uploaded'}), 400
    return process_request(upload_result, "Abdomen", "CT")


@app.route('/segment/abdomen-mr', methods=['POST'])
def segment_abdomen_mr():
    upload_result = upload_files("Abdomen", "MRI")
    if upload_result is None:
        return jsonify({'error': 'No valid files uploaded'}), 400
    return process_request(upload_result, "Abdomen", "MRI")


@app.route('/segment/thigh-ct', methods=['POST'])
def segment_thigh_ct():
    upload_result = upload_files("Thigh", "CT")
    if upload_result is None:
        return jsonify({'error': 'No valid files uploaded'}), 400
    return process_request(upload_result, "Thigh", "CT")


@app.route('/segment/thigh-mr', methods=['POST'])
def segment_thigh_mr():
    upload_result = upload_files("Thigh", "MRI")
    if upload_result is None:
        return jsonify({'error': 'No valid files uploaded'}), 400
    return process_request(upload_result, "Thigh", "MRI")


if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=False)
