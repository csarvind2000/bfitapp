import os
import base64
import tempfile
import contextlib
from flask import Flask, request, jsonify
from utils.dicom_converter import convert_dicom_to_nii as convert_dicom_to_nifti
from utils.segmentation import process_scan, segmentation_commands
from utils.converter1 import DicomSegConverter
from utils.fatPlotTest import genericVolumeAnalysis
from utils.converter1 import DEFAULT_ABDOMEN_LABEL_MAP, DEFAULT_THIGH_LABEL_MAP

DEBUG = os.environ.get("DEBUG_MODE", "True") == "True"

NNUNET_BASE = "."
os.environ["nnUNet_raw"] = os.path.join(NNUNET_BASE, "nnunet_raw")
os.environ["nnUNet_preprocessed"] = os.path.join(NNUNET_BASE, "nnunet_preprocessed")
os.environ["nnUNet_results"] = os.path.join(NNUNET_BASE, "nnunet_results")

app = Flask(__name__)

# ── Canonical variant keys per anatomy/modality ───────────────────────────────
# These keys flow all the way through to the frontend's perSliceData lookup.
# Keep them in sync with VARIANT_CONFIG in maskVariantUtils.js.
VARIANT_MAP = {
    ("Abdomen", "MRI"): ["abd_mr"],
    ("Abdomen", "CT"):  ["abd_mr"],   # same label map; add a separate key if CT differs
    ("Thigh",   "MRI"): ["5class", "48class"],
    ("Thigh",   "CT"):  ["5class", "48class"],
}

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

        if request.is_json and 'b64_encoded_dicoms' in request.json:
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
            'dicom_folder': raw_dicom_dir if saved_dicoms else None,
            'original_folder': output_dir if saved_niis else None,
            'has_dicoms': bool(saved_dicoms),
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

    if region.lower() == "abdomen":
        label_map = DEFAULT_ABDOMEN_LABEL_MAP
    elif region.lower() == "thigh":
        label_map = DEFAULT_THIGH_LABEL_MAP
    else:
        return jsonify({'error': f'Invalid region: {region}'}), 400

    # ============================================================
    # LOAD INPUT FILES
    # ============================================================
    if upload_result['has_nifti']:
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

                seg_output_path = process_scan(
                    nii_path,
                    region,
                    modality,
                    variant,
                    segmentation_commands,
                    {f"{region}_{modality}_{variant}": variant_output_dir}
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
