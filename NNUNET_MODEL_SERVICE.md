# nnU-Net Inference Service (Flask)

Details on the `nnunet` service: checkpoints, labels, the Flask response format, how the backend consumes it, and running it standalone. For general setup, see the main [README](README.md).

## Running Flask standalone (outside Docker)

Useful for local development/debugging without rebuilding or restarting the whole Compose stack.

### 1. Set up the environment

| Option | Steps | Notes |
|---|---|---|
| **A. Plain venv** | `cd src/nnUnet`<br>`python3 -m venv venv`<br>`source venv/bin/activate` (Windows: `venv\Scripts\activate`)<br>`pip install --upgrade pip`<br>`pip install -r requirements.txt --no-cache-dir` | ⚠️ `requirements.txt` pins `torchvision` but not `torch` — a plain install can silently get a **CPU-only** `torch`. For GPU, install the CUDA build first: `pip install torch==2.4.0 torchvision==0.19 --index-url https://download.pytorch.org/whl/cu121`, then run the requirements install. |
| **B. Docker base image** | `cd src/nnUnet`<br>`docker run --rm -it --gpus all -v "$PWD":/app -w /app -p 5000:5000 pytorch/pytorch:2.4.0-cuda12.1-cudnn9-runtime bash`<br>then inside: `pip install --upgrade pip && pip install -r requirements.txt --no-cache-dir` | Identical environment to what the real Docker build uses. |

Either way, checkpoints must already exist under `nnunet_raw/`, `nnunet_preprocessed/`, `nnunet_results/` — see [Model checkpoints](#model-checkpoints).

### 2. Run it

```bash
cd src/nnUnet   # must run from here — see note below
python app.py
```

| Detail | What to know |
|---|---|
| Working directory | ⚠️ **Do not manually `export nnUNet_raw=...`** — it has no effect. `app.py` (lines 24-27) unconditionally overwrites `nnUNet_raw`/`nnUNet_preprocessed`/`nnUNet_results` relative to `.` every time it starts, clobbering anything you exported. The only thing that matters is running `python app.py` **from inside `src/nnUnet/`**. |
| Address | `http://0.0.0.0:5000`, `debug=True`, `threaded=False` (single-threaded — GPU inference isn't meant to run concurrently). |
| Custom trainers | `utils/nnUNetTrainer*.py` are auto-registered at import time via `install_custom_nnunet_trainers()`. No manual copy into `site-packages` needed (the Docker build does that separately, but standalone doesn't require it). |
| Debug mode | Set env var `DEBUG_MODE=False` to turn it off (defaults to `True`). |

### 3. Test it

```bash
curl -X POST http://localhost:5000/segment/abdomen-mr \
  -H "Content-Type: application/json" \
  -d '{"b64_encoded_dicoms": ["<base64 dicom 1>", "<base64 dicom 2>"]}'
```

Routes: `/segment/abdomen-ct`, `/segment/abdomen-mr`, `/segment/thigh-ct`, `/segment/thigh-mr`. Response shape: [Flask inference response format](#flask-inference-response-format).

## Model checkpoints

This repo ships no `.pth` files. **You must supply your own trained abdomen and thigh checkpoints.** Each `/segment/*` endpoint runs `nnUNetv2_predict` against a fixed dataset/config/trainer/fold — there is no fallback if the checkpoint is missing.

| Endpoint | Dataset | Config | Trainer | Fold |
|---|---|---|---|---|
| `/segment/abdomen-ct` | `Dataset696_Abdomen` | `2d` | `nnUNetTrainer` | all trained |
| `/segment/abdomen-mr` | `Dataset699_Abdomen` | `3d_fullres` | `nnUNetTrainer` | `0` |
| `/segment/thigh-mr` (5-class) | `Dataset700_Thigh_5_classes` | `3d_fullres` | `nnUNetTrainerTopK10Loss_33os_1000epochs` | `0` |
| `/segment/thigh-mr` (47-class) | `Dataset703_Thigh_47_classes` | `2d` | `nnUNetTrainerDeepLabHRnetCac_nw` | `0` |
| `/segment/thigh-ct` | uses the thigh 5-class model above | | | |

These values come from `segmentation_commands` in [`utils/segmentation.py`](src/nnUnet/utils/segmentation.py). Retraining or replacing a model means updating that mapping too — a stale dataset ID fails silently as a job error, not a clear "wrong model" message.

Checkpoint path: `nnunet_results/<Dataset>/<Trainer>__nnUNetPlans__<config>/fold_<N>/checkpoint_final.pth`. Not pushed by `clean_push.sh` or committed to git — copy manually to any new machine.

**Each checkpoint folder needs, at minimum:**

| File | Purpose |
|---|---|
| `fold_<N>/checkpoint_final.pth` (and/or `checkpoint_best.pth`) | The trained weights |
| `dataset.json` | Channel/label metadata — see below |
| `plans.json` | nnU-Net's plans file, produced alongside the checkpoint during training |

Missing any of the three → `nnUNetv2_predict` fails for that endpoint.

## `dataset.json` and labels

Each checkpoint's `dataset.json` tells nnU-Net the input channels and label IDs it was trained on:

```json
{
    "channel_names": { "0": "T1w" },
    "labels": { "background": 0, "SSAT": 1, "DSAT": 2, "VAT": 3 },
    "file_ending": ".nii.gz"
}
```

(The thigh 47-class model instead has 4 channels — `fat`, `water`, `inphase`, `fatfraction` — and 47 named labels.) **This must exactly match training** — a mismatch produces garbage masks silently, since nnU-Net has no way to detect it.

Separately, the app has its own label maps in [`utils/converter1.py`](src/nnUnet/utils/converter1.py), used to build DICOM-SEG output:

| Region / variant | Label map used |
|---|---|
| Abdomen | `DEFAULT_ABDOMEN_LABEL_MAP` |
| Thigh, 47-class | `DEFAULT_THIGH_47CLASS_LABEL_MAP` |
| Thigh, 5-class (default) | `DEFAULT_THIGH_5CLASS_LABEL_MAP` |

⚠️ **Swapping in a model with different labels means updating the matching `DEFAULT_*_LABEL_MAP` to the same numeric IDs** — otherwise DICOM-SEG output mislabels or drops regions.

## Every place labels are defined (checklist)

Label names/IDs are duplicated in 8 places. None of them cross-check each other at runtime — a mismatch anywhere degrades silently (wrong colors, missing plots, mislabeled output) instead of raising an error.

| # | Location | Defines | Risk if out of sync |
|---|---|---|---|
| 1 | `nnunet_results/.../dataset.json` | Ground truth: what the checkpoint was trained on | Not hand-edited — must match training |
| 2 | [`utils/converter1.py`](src/nnUnet/utils/converter1.py) — `DEFAULT_*_LABEL_MAP` | ID → (display name, SNOMED code, short id) for DICOM-SEG | Mislabeled/dropped regions in DICOM-SEG |
| 3 | [`utils/fatPlotTest.py`](src/nnUnet/utils/fatPlotTest.py), `genericVolumeAnalysis()` (~line 71-146) | Its own inline `label_mapping` per region, used for volume plots/CSVs | ⚠️ Picks thigh 5-class vs. 47-class by a **heuristic** — assumes 5-class if every label value present is in `{1,2,3,4,5}`. A 47-class scan with only labels 1-5 present would be misread as 5-class, mislabeling every plot/CSV column |
| 4 | `app.py` — `expected_labels` (~line 437) | Which labels get a PNG volume plot at all (abdomen: SSAT/DSAT/VAT; thigh: SSAT/IMAT/Muscle) | A label not listed here never gets a plot, regardless of `dataset.json` |
| 5 | `app.py` — `VARIANT_MAP` (~line 62) | Which variant keys exist per (anatomy, modality) | New variant won't be recognized |
| 6 | [`bfitserver/utils/analysis.py`](src/WebGUI/backend/src/bfitserver/utils/analysis.py) — `FLASK_TO_CANONICAL` | Normalizes Flask's variant key to a fixed canonical set | See [backend consumption](#how-the-backend-consumes-this-response) |
| 7 | [`src/constants.js`](src/WebGUI/frontend/src/constants.js) | `LABELS_ABD_MR`, `Labels`, `LABELS_5CLASS` (ID → name, mirrors `dataset.json`), `LABEL_CMAP` (ID → color), `AnalysisResultTypes` | `AnalysisResultTypes` strings (e.g. `"ABD SSAT VOLUME PLOT"`) must exactly match the backend's artifact keys (item 4) or the frontend won't find that plot |
| 8 | [`src/utils/maskVariantUtils.js`](src/WebGUI/frontend/src/utils/maskVariantUtils.js) — `VARIANT_CONFIG` | Frontend's single source of truth for mask display: names, colors, table grouping | File's own header: to add a mask type, add its label map to `constants.js`, then one `VARIANT_CONFIG` entry — every component picks it up automatically |

## Flask inference response format

Each `/segment/*` endpoint (`app.py`, `process_request`, ~line 464) returns:

```json
{
  "segmented_nifti_files": [
    { "filename": "<variant>_<file>.nii.gz", "variant": "abd_mr", "b64_data": "<base64>" }
  ],
  "segmented_dcm_files": [
    { "filename": "<file>.dcm", "b64_data": "<base64>" }
  ],
  "original_nifti_files": [ /* same shape as segmented_nifti_files */ ],
  "volume_plots": {
    "<variant>_<label>": { "filename": "<label>.png", "b64_data": "<base64>" }
  },
  "volume_csv": {
    "<variant>": { "per_slice": { "filename": "<variant>_<file>_per_slice.csv", "b64_data": "<base64>" } }
  }
}
```

| Field | Contents |
|---|---|
| `segmented_nifti_files` / `original_nifti_files` | Every `.nii`/`.nii.gz` under the results directory, one entry per variant (`abd_mr`, `5class`, `47class`) |
| `segmented_dcm_files` | DICOM-SEG files from `DicomSegConverter`, using the label map from the table above — only if the upload included a DICOM series |
| `volume_plots` | Per-label PNGs, only for labels in `expected_labels` |
| `volume_csv` | Per-slice volume/area CSV per variant |

All payloads are base64-encoded inline — no separate download step here. The Django backend/`ai_worker` persists these into the media volume and exposes them via `/content/*`.

## How the backend consumes this response

The `ai_worker` container handles this in [`bfitserver/utils/analysis.py`](src/WebGUI/backend/src/bfitserver/utils/analysis.py) via two RQ jobs:

| Job | Calls | Payload |
|---|---|---|
| `abdomen(dicoms, modality)` | `NNUNET_ABD_MR_ENDPOINT` / `NNUNET_ABD_CT_ENDPOINT` | `{"b64_encoded_dicoms": [...]}` |
| `thigh(dicoms, modality, channel_dicoms=None)` | `NNUNET_THIGH_MR_ENDPOINT` / `NNUNET_THIGH_CT_ENDPOINT` | `{"b64_encoded_dicoms": [...]}`, or `{"b64_encoded_dicoms_by_channel": {...}}` for the multi-channel 47-class model (`fat`/`water`/`inphase`) |

Both re-key the Flask response into a `result` dict, which the `on_success` callback (`report_success`) persists:

| Flask field | Goes into `result[...]` | Persisted as |
|---|---|---|
| `original_nifti_files` | `artifact` | `AnalysisArtifact` |
| `volume_plots` | `artifact` (keys like `"ABD <LABEL> VOLUME PLOT"`) | `AnalysisArtifact` |
| `segmented_nifti_files` | `segmentation` | `SegmentationResult` |
| `volume_csv.<variant>.summary` | `prediction[<canonical variant>]` (base64-decoded, CSV-parsed) + raw copy in `prediction["volume_csv"]` | `PredictionResult` |
| `segmented_dcm_files` | *(not consumed)* | not currently wired into `result` |

`result["artifact"]` and `result["segmentation"]` entries are `(filename, base64_data)` tuples; each is base64-decoded into a `ContentFile` and saved to the media volume. On any exception during the job, `report_failure` sets `Analysis.status = FAILED` instead and nothing is persisted.

⚠️ Flask's variant keys (`abd_mr`, `abdomen`, `5class`, `48class`, etc.) are normalized by `FLASK_TO_CANONICAL`/`_canonical()` into a fixed set (`abd_mr`, `5class`, `47class`). **This must stay in sync with `VARIANT_CONFIG` in the frontend's `maskVariantUtils.js`** — a new model/variant added on the Flask side needs a matching entry here, or the frontend won't find the data even though the backend stored it.
