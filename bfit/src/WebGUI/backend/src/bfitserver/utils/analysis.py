import os
import time
import logging
import requests
import io
import csv
import base64
from django_rq import job
from django.core.files.base import ContentFile
from ..models.analysis import (
    Analysis,
    PredictionResult,
    SegmentationResult,
    AnalysisArtifact,
)
from ..models.dicomweb import Series
from .log_filter import TruncateLogFilter

NNUNET_ABD_MR_ENDPOINT = os.environ.get("NNUNET_ABD_MR_ENDPOINT")
NNUNET_ABD_CT_ENDPOINT = os.environ.get("NNUNET_ABD_CT_ENDPOINT")
NNUNET_THIGH_MR_ENDPOINT = os.environ.get("NNUNET_THIGH_MR_ENDPOINT")
NNUNET_THIGH_CT_ENDPOINT = os.environ.get("NNUNET_THIGH_CT_ENDPOINT")
MMAP_ENDPOINT = os.environ.get("MMAP_ENDPOINT")

logger = logging.getLogger("rq.worker")
logger.addFilter(TruncateLogFilter(max_length=500))

NNUNET_RESPONSE_KEYS = [
    "original_nifti_files",
    "segmented_dcm_files",
    "segmented_nifti_files",
    "volume_csv",
    "volume_plots",
]

# ── Canonical key mapping ─────────────────────────────────────────────────────
# Maps whatever key Flask emits → the canonical key the frontend expects.
# Must stay in sync with VARIANT_CONFIG in maskVariantUtils.js.
ABDOMEN_CANONICAL_KEY = "abd_mr"

FLASK_TO_CANONICAL = {
    "abd_mr":    ABDOMEN_CANONICAL_KEY,
    "abdomen":   ABDOMEN_CANONICAL_KEY,
    "abdominal": ABDOMEN_CANONICAL_KEY,
    "abd":       ABDOMEN_CANONICAL_KEY,
    "5class":    "5class",
    "47class":   "47class",
    "48class":   "47class",
}


def _canonical(variant: str, anatomy: str) -> str:
    """
    Return the canonical variant key for storage.
    For abdomen, always returns abd_mr regardless of what Flask used.
    For thigh, passes through the class key unchanged.
    """
    if anatomy.lower() == "abdomen":
        return ABDOMEN_CANONICAL_KEY
    return FLASK_TO_CANONICAL.get(variant.lower(), variant.lower())


def report_success(job, connection, result, *args, **kwargs):
    try:
        analysis = Analysis.objects.get(id=job.id)
        analysis.status = Analysis.Status.COMPLETED

        prediction_data = result.get("prediction", {})
        if prediction_data:
            PredictionResult.objects.create(
                analysis=analysis, prediction=prediction_data
            )

        if "segmentation" in result:
            for tp, (name, data) in result["segmentation"].items():
                f = ContentFile(content=base64.b64decode(data), name=name)
                SegmentationResult.objects.create(
                    analysis=analysis, segmentation_mask=f, mask_type=tp
                )

        if "artifact" in result:
            for tp, (name, data) in result["artifact"].items():
                f = ContentFile(content=base64.b64decode(data), name=name)
                AnalysisArtifact.objects.create(
                    analysis=analysis, artifact=f, artifact_type=tp
                )

        analysis.save()
        logger.info(f"Analysis {analysis.id} processed successfully")

    except Analysis.DoesNotExist:
        logger.error(f"Analysis with job id {job.id} not found")
    except Exception as e:
        logger.error(f"report_success failed for {job.id}: {e}", exc_info=True)


def report_failure(job, connection, type, value, traceback):
    logger.error(f"Analysis {job.id} failed with error {type}: {str(value)}")
    Analysis.objects.filter(id=job.id).update(status=Analysis.Status.FAILED)


@job("nnunet", timeout=3600, result_ttl=0, on_success=report_success, on_failure=report_failure)
def abdomen(dicoms, modality):
    encoded_images = []
    for dicom in dicoms:
        fp = dicom.file.path
        with open(fp, "rb") as f:
            encoded_f = base64.b64encode(f.read()).decode("utf-8")
        logger.info(f"base64 encoded {fp}")
        encoded_images.append(encoded_f)

    payload = {"b64_encoded_dicoms": encoded_images}
    endpoint = NNUNET_ABD_MR_ENDPOINT if modality == Series.Modality.MR else NNUNET_ABD_CT_ENDPOINT

    start = time.perf_counter()
    response = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload)
    response.raise_for_status()
    end = time.perf_counter()

    logger.info(f"Abdomen analysis completed in {end-start:.2f} seconds")
    response = response.json()

    volume_plots = response.get("volume_plots", {})

    result = {}

    result['artifact'] = {
        f"ORIGINAL {modality.upper()}": (
            response["original_nifti_files"][0]["filename"],
            response["original_nifti_files"][0]["b64_data"]
        ),
    }

    for plot_key, plot_data in volume_plots.items():
        artifact_key = f"ABD {plot_key.upper()} VOLUME PLOT"
        result['artifact'][artifact_key] = (plot_data["filename"], plot_data["b64_data"])

    result['segmentation'] = {
        f"{modality.upper()} ABD MASK": (
            response["segmented_nifti_files"][0]["filename"],
            response["segmented_nifti_files"][0]["b64_data"]
        )
    }

    # ── CSV parsing ───────────────────────────────────────────────────────────
    # Normalise abdomen CSV keys to "abd_mr" so the frontend always finds them.
    csv_source = response.get("volume_csv", {})

    result["prediction"] = {}
    result["volume_csv"] = {}

    for flask_variant, csv_info in csv_source.items():
        try:
            if not isinstance(csv_info, dict):
                continue

            # Always store abdomen data under the canonical key
            canonical = _canonical(flask_variant, "abdomen")

            summary = csv_info.get("summary", {})
            if "b64_data" in summary:
                decoded = base64.b64decode(summary["b64_data"]).decode()
                reader = csv.DictReader(io.StringIO(decoded))
                result["prediction"][canonical] = list(reader)

            per_slice = csv_info.get("per_slice", {})

            result["volume_csv"][canonical] = {
                "summary": summary,
                "per_slice": per_slice,
            }

            logger.info(f"[ABD CSV] Flask key '{flask_variant}' → canonical '{canonical}'")

        except Exception as e:
            logger.error(f"[ABD CSV ERROR] {flask_variant}: {e}")

    # Piggyback volume_csv into prediction for DB storage (frontend reads it from here)
    result["prediction"]["volume_csv"] = result["volume_csv"]

    logger.info(f"[ABD FINAL] prediction keys: {list(result['prediction'].keys())}")
    logger.info(f"[ABD FINAL] volume_csv keys: {list(result['volume_csv'].keys())}")
    logger.info(f"[ABD FINAL] segmentation keys: {list(result['segmentation'].keys())}")

    return result


@job("nnunet", timeout=3600, result_ttl=0, on_success=report_success, on_failure=report_failure)
def thigh(dicoms, modality, channel_dicoms=None):
    def encode_dicoms(dicom_queryset):
        encoded_images = []
        for dicom in dicom_queryset:
            fp = dicom.file.path
            with open(fp, "rb") as f:
                encoded_f = base64.b64encode(f.read()).decode("utf-8")
            logger.info(f"base64 encoded {fp}")
            encoded_images.append(encoded_f)
        return encoded_images

    encoded_images = encode_dicoms(dicoms)

    encoded_channels = {}
    if channel_dicoms:
        for channel, channel_queryset in channel_dicoms.items():
            encoded_channels[channel] = encode_dicoms(channel_queryset)

    payload = (
        {"b64_encoded_dicoms_by_channel": encoded_channels}
        if encoded_channels
        else {"b64_encoded_dicoms": encoded_images}
    )

    endpoint = NNUNET_THIGH_MR_ENDPOINT if modality == Series.Modality.MR else NNUNET_THIGH_CT_ENDPOINT
    logger.info(f"[THIGH] Using endpoint: {endpoint}")

    start = time.perf_counter()
    response = requests.post(
        endpoint,
        headers={"Content-Type": "application/json"},
        json=payload
    )
    if not response.ok:
        logger.error(f"nnUNet thigh returned {response.status_code}: {response.text[:4000]}")
    response.raise_for_status()
    end = time.perf_counter()

    logger.info(f"Thigh analysis completed in {end-start:.2f} seconds")
    response = response.json()
    if response.get("error"):
        raise Exception(f"nnUNet thigh failed: {response['error']}")
    logger.info(f"[DEBUG] Full response keys: {list(response.keys())}")

    volume_plots = response.get("volume_plots", {})
    segmented_files = response.get("segmented_nifti_files", [])

    result = {
        "prediction": {},
        "segmentation": {},
        "artifact": {},
        "volume_csv": {},
    }

    # ── Original/source files ─────────────────────────────────────────────────
    if response.get("original_nifti_files"):
        default_original = None
        for original in response["original_nifti_files"]:
            if "b64_data" not in original:
                continue
            channel = str(original.get("channel", "")).strip().upper()
            filename = original.get("filename", "original.nii.gz")
            data = original["b64_data"]

            if channel:
                result["artifact"][f"ORIGINAL {modality.upper()} {channel}"] = (
                    filename,
                    data,
                )
                if channel == "INPHASE":
                    default_original = (filename, data)
            elif default_original is None:
                default_original = (filename, data)

        if default_original is None:
            first_original = response["original_nifti_files"][0]
            default_original = (
                first_original.get("filename", "original.nii.gz"),
                first_original["b64_data"],
            )

        result["artifact"][f"ORIGINAL {modality.upper()}"] = default_original

    # ── Volume plots ──────────────────────────────────────────────────────────
    for plot_key, plot_data in volume_plots.items():
        if not isinstance(plot_data, dict):
            continue
        artifact_key = f"THIGH {plot_key.upper()} VOLUME PLOT"
        result['artifact'][artifact_key] = (
            plot_data.get("filename"),
            plot_data.get("b64_data")
        )

    # ── Segmentation files ────────────────────────────────────────────────────
    for i, mask in enumerate(segmented_files):
        if "b64_data" not in mask:
            continue
        variant = _canonical(mask.get("variant", "").strip().lower(), "thigh")
        if variant == "4class":
            logger.info("[THIGH] Skipping deprecated 4-class segmentation output")
            continue
        filename = mask.get("filename", f"mask_{i}.nii.gz")
        key = f"{modality.upper()} THIGH MASK {variant.upper() if variant else str(i)}"
        if key in result['segmentation']:
            key = f"{key}_{i}"
        result['segmentation'][key] = (filename, mask["b64_data"])

    # ── CSV parsing ───────────────────────────────────────────────────────────
    csv_source = response.get("volume_csv", {})
    logger.info(f"[THIGH DEBUG] volume_csv keys from Flask: {list(csv_source.keys())}")

    for flask_variant, csv_info in csv_source.items():
        try:
            if not isinstance(csv_info, dict):
                continue
            if flask_variant.lower() == "4class":
                logger.info("[THIGH] Skipping deprecated 4-class volume output")
                continue

            # Thigh keys pass through as canonical class variants.
            canonical = _canonical(flask_variant, "thigh")

            summary = csv_info.get("summary", {})
            if "b64_data" in summary:
                decoded = base64.b64decode(summary["b64_data"]).decode()
                reader = csv.DictReader(io.StringIO(decoded))
                result['prediction'][canonical] = list(reader)

            per_slice = csv_info.get("per_slice", {})

            result["volume_csv"][canonical] = {
                "summary": summary,
                "per_slice": per_slice,
            }

        except Exception as e:
            logger.error(f"[THIGH CSV ERROR] {flask_variant}: {e}")

    logger.info(f"[THIGH FINAL] prediction keys: {list(result['prediction'].keys())}")
    logger.info(f"[THIGH FINAL] volume_csv keys: {list(result['volume_csv'].keys())}")
    logger.info(f"[THIGH FINAL] segmentation keys: {list(result['segmentation'].keys())}")
    logger.info(f"[THIGH FINAL] artifact keys: {list(result['artifact'].keys())}")

    # Piggyback volume_csv into prediction for DB storage
    result['prediction']['volume_csv'] = result['volume_csv']

    return result


@job("mmap", timeout=3600, result_ttl=0, on_success=report_success, on_failure=report_failure)
def mmap(dicoms, modality):
    encoded_images = []
    for dicom in dicoms:
        fp = dicom.file.path
        with open(fp, "rb") as f:
            encoded_f = base64.b64encode(f.read()).decode("utf-8")
        encoded_images.append(encoded_f)

    payload = {"data": encoded_images}
    response = requests.post(MMAP_ENDPOINT, headers={"Content-Type": "application/json"}, json=payload)
    response.raise_for_status()
    response = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload)
    if not response.ok:
        logger.error(f"nnunet returned {response.status_code}: {response.text[:2000]}")
    response.raise_for_status()

    return response.json()
