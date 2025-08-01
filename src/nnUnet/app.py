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

DEBUG = bool(os.environ.get("DEBUG_MODE", True))

NNUNET_BASE = "."
os.environ["nnUNet_raw"] = os.path.join(NNUNET_BASE, "nnunet_raw")
os.environ["nnUNet_preprocessed"] = os.path.join(NNUNET_BASE, "nnunet_preprocessed")
os.environ["nnUNet_results"] = os.path.join(NNUNET_BASE, "nnunet_results")


app = Flask(__name__)

def upload_files(region: str, modality: str):
    tmp_root = "/app/tmp"
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

def process_request(upload_result, region: str, modality: str):
    key = f"{region}_{modality}"
    output_dir = upload_result['temp_output_dir']
    dynamic_results_dir = os.path.join(output_dir, "results")
    os.makedirs(dynamic_results_dir, exist_ok=True)

    segmented_nifti_files, segmented_dcm_files, original_nifti_files = [], [], []
    prediction_csv_b64 = None
    prediction_csv_name = "volume_stats.csv"

    if region.lower() == "abdomen":
        label_map = DEFAULT_ABDOMEN_LABEL_MAP
    elif region.lower() == "thigh":
        label_map = DEFAULT_THIGH_LABEL_MAP
    else:
        return jsonify({'error': f'Invalid region: {region}'}), 400

    if upload_result['has_nifti']:
        nii_files = [os.path.join(upload_result['original_folder'], f)
                     for f in os.listdir(upload_result['original_folder'])
                     if f.endswith(('.nii', '.nii.gz'))]
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

    for nii_path in nii_files:
        try:
            seg_output_path = process_scan(nii_path, region, modality, {}, segmentation_commands, {key: dynamic_results_dir}, [])

            print(f"[DEBUG] Running volume analysis for: {seg_output_path}")
            print(f"[DEBUG] seg_output_path: {seg_output_path}")

            genericVolumeAnalysis(seg_output_path, region, dynamic_results_dir)
            print(f"[DEBUG] Volume analysis complete.")

            csv_path = os.path.join(dynamic_results_dir, "volume_stats.csv")
            if os.path.exists(csv_path):
                with open(csv_path, "rb") as f:
                    prediction_csv_b64 = base64.b64encode(f.read()).decode("utf-8")

            dicom_seg_dir = os.path.join(dynamic_results_dir, 'dicom_seg')
            os.makedirs(dicom_seg_dir, exist_ok=True)
            converter = DicomSegConverter(
                input_dir=dynamic_results_dir,
                dicom_ref=upload_result['dicom_folder'],
                output_dir=dicom_seg_dir,
                label_map=label_map,
                rotate_180=(modality == "CT" and region.lower() == "abdomen")
            )
            converter.batch_convert()
        except Exception as e:
            return jsonify({'error': f'Segmentation failed for {nii_path}: {str(e)}'}), 500

    for file in os.listdir(dynamic_results_dir):
        full_path = os.path.join(dynamic_results_dir, file)
        if file.endswith(('.nii', '.nii.gz')):
            with open(full_path, "rb") as f:
                segmented_nifti_files.append({
                    'filename': file,
                    'b64_data': base64.b64encode(f.read()).decode('utf-8')
                })

    volume_plots = {}
    expected_labels = {
        "abdomen": ["SSAT", "DSAT", "VAT"],
        "thigh": ["SSAT", "IMAT", "Muscle"]
    }
    for label in expected_labels.get(region.lower(), []):
        plot_file = os.path.join(dynamic_results_dir, f"{label}.png")
        if os.path.exists(plot_file):
            with open(plot_file, "rb") as f:
                volume_plots[label] = {
                    'filename': f"{label}.png",
                    'b64_data': base64.b64encode(f.read()).decode("utf-8")
                }

    dicom_seg_dir = os.path.join(dynamic_results_dir, 'dicom_seg')
    if os.path.exists(dicom_seg_dir):
        for seg_file in os.listdir(dicom_seg_dir):
            full_path = os.path.join(dicom_seg_dir, seg_file)
            with open(full_path, "rb") as f:
                segmented_dcm_files.append({
                    'filename': seg_file,
                    'b64_data': base64.b64encode(f.read()).decode('utf-8')
                })

    return jsonify({
        'segmented_nifti_files': segmented_nifti_files,
        'segmented_dcm_files': segmented_dcm_files,
        'original_nifti_files': original_nifti_files,
        'volume_plots': volume_plots,
        'volume_csv': {
            'filename': prediction_csv_name,
            'b64_data': prediction_csv_b64
        } if prediction_csv_b64 else None
    })

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
    print(upload_result)
    return process_request(upload_result, "Thigh", "MRI")

if __name__ == '__main__':
    app.run(host="0.0.0", port=5000, debug=True)