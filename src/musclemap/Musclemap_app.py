from flask import Flask, request, jsonify
import subprocess
import sys
import os
import base64

app = Flask(__name__)

# Supported regions
SUPPORTED_REGIONS = ['thigh', 'abdomen', 'pelvis']

@app.route('/musclemap/<region>', methods=['POST'])
def run_musclemap(region):
    region = region.lower()

    if region not in SUPPORTED_REGIONS:
        return jsonify({'error': f'Invalid region: {region}. Supported regions: {SUPPORTED_REGIONS}'}), 400

    # Get patient ID from either form or JSON
    patient_id = request.form.get('patient_id') or (request.json.get('patient_id') if request.is_json else None) or 'test_case'

    # Prepare output directory
    output_folder = os.path.join("/media/tct-bii/DataHDD/saisriya/nnUNet/nnunet_results/musclemap", region, patient_id)
    os.makedirs(output_folder, exist_ok=True)

    processed_files = []
    errors = []

    # Prepare upload folder
    upload_folder = os.path.join("uploads", region, patient_id)
    os.makedirs(upload_folder, exist_ok=True)

    # === Handle base64 encoded dicoms ===
    if request.is_json and 'b64_encoded_dicoms' in request.json:
        b64_encoded_dicoms = request.json['b64_encoded_dicoms']

        for idx, data in enumerate(b64_encoded_dicoms):
            dcm_path = os.path.join(upload_folder, f"I{idx}.dcm")
            try:
                with open(dcm_path, "wb") as f:
                    f.write(base64.b64decode(data))
                print(f"Decoded and saved: {dcm_path}")

                run_musclemap_on_file(dcm_path, region, output_folder, processed_files, errors)
            except Exception as e:
                errors.append({'file': f'I{idx}.dcm', 'error': str(e)})

    # === Handle raw file uploads ===
    elif 'file' in request.files:
        files = request.files.getlist('file')
        for file in files:
            if not file or file.filename == '':
                continue

            input_path = os.path.join(upload_folder, file.filename)
            file.save(input_path)
            print(f"File uploaded and saved: {input_path}")

            run_musclemap_on_file(input_path, region, output_folder, processed_files, errors)

    else:
        return jsonify({'error': 'No files or base64 data provided'}), 400

    # If any errors during processing
    if errors:
        return jsonify({
            'message': 'Some files failed to process',
            'processed_files': processed_files,
            'errors': errors,
            'output_folder': output_folder
        }), 500

    # === Convert segmented output files to base64 ===
    encoded_outputs = []
    for output_file in os.listdir(output_folder):
        full_path = os.path.join(output_folder, output_file)
        try:
            with open(full_path, "rb") as f:
                encoded_data = base64.b64encode(f.read()).decode('utf-8')
                encoded_outputs.append({
                    'filename': output_file,
                    'b64_data': encoded_data
                })
        except Exception as e:
            errors.append({'file': output_file, 'error': str(e)})

    # Return final output
    return jsonify({
        'message': f'MuscleMap {region} segmentation completed',
        'processed_files': processed_files,
        'encoded_outputs': encoded_outputs
    })

# === Helper function to call MuscleMap ===
def run_musclemap_on_file(input_path, region, output_folder, processed_files, errors):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    musclemap_script = os.path.join(base_dir, "MuscleMap", "scripts", "mm_segment.py")

    cmd = [
        sys.executable,
        musclemap_script,
        '-i', input_path,
        '-r', region,
        '-o', output_folder,
        '-g', 'N'
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        errors.append({'file': os.path.basename(input_path), 'error': result.stderr})
    else:
        processed_files.append(os.path.basename(input_path))

if __name__ == '__main__':
    app.run(debug=True, port=5001)
