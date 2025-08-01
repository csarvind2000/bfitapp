import os
import time
import logging
import requests
import json
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


def report_success(job, connection, result, *args, **kwargs):
    """
    Specifies the on success callback function to be called
    when RQ job is executed successfully. Callbacks are limited
    to 60s runtime.
    """
    try:
        logger.info(f"Executing success callback")
        analysis = Analysis.objects.get(id=job.id)
        analysis.status = Analysis.Status.COMPLETED
        if "prediction" in result:
            PredictionResult.objects.create(
                analysis=analysis, prediction=result["prediction"]
            )
        if "segmentation" in result:
            # handle decoding and storing of base64 encoded segmentation masks
            for tp, (name, data) in result["segmentation"].items():
                # decode base64 string into binary and save to filefield
                f = ContentFile(content=base64.b64decode(data), name=name)
                SegmentationResult.objects.create(
                    analysis=analysis, segmentation_mask=f, mask_type=tp
                )
        if "artifact" in result:
            # handle decoding and storing of intermediate model artifacts
            for tp, (name, data) in result["artifact"].items():
                f = ContentFile(content=base64.b64decode(data), name=name)
                AnalysisArtifact.objects.create(
                    analysis=analysis, artifact=f, artifact_type=tp
                )
        analysis.save()
        logger.info(f"Analysis {analysis.id} processed successfully")
    except Analysis.DoesNotExist:
        logger.error(f"Analysis with job id {job.id} not found")


def report_failure(job, connection, type, value, traceback):
    """
    Specifies the on failure callback function to be called
    when RQ job execution fails. Callbacks are limited to 60s
    runtime.
    """
    logger.error(f"Analysis {job.id} failed with error {type}: {str(value)}")
    Analysis.objects.filter(id=job.id).update(status=Analysis.Status.FAILED)


@job(
    "abd",
    timeout=3600,
    result_ttl=0,
    on_success=report_success,
    on_failure=report_failure,
)
def abdomen(dicoms, modality):
    encoded_images = []
    # base64 encode all Dicom instances for inference
    for dicom in dicoms:
        fp = dicom.file.path
        with open(fp, "rb") as f:
            encoded_f = base64.b64encode(f.read()).decode("utf-8")
        logger.info(f"base64 encoded {fp}")
        encoded_images.append(encoded_f)

    payload = {"data": encoded_images}
    endpoint = NNUNET_ABD_MR_ENDPOINT if modality == Series.Modality.MR else NNUNET_ABD_CT_ENDPOINT
    start = time.perf_counter()
    response = requests.post(
        endpoint,
        headers={
            "Content-Type": "application/json",
        },
        json=payload,
    )
    response.raise_for_status()
    end = time.perf_counter()
    logger.info(f"Abdomen analysis completed in {end-start:.2f} seconds")

    result = {}
    result['artifacts'] = {
        f"ORIGINAL {modality.upper()}": ()
    }
    
    return response.json()


@job(
    "thigh",
    timeout=3600,
    result_ttl=0,
    on_success=report_success,
    on_failure=report_failure,
)
def thigh(dicoms, modality):
    encoded_images = []
    # base64 encode all Dicom instances for inference
    for dicom in dicoms:
        fp = dicom.file.path
        with open(fp, "rb") as f:
            encoded_f = base64.b64encode(f.read()).decode("utf-8")
        logger.info(f"base64 encoded {fp}")
        encoded_images.append(encoded_f)

    payload = {"data": encoded_images}
    endpoint = NNUNET_THIGH_MR_ENDPOINT if modality == Series.Modality.MR else NNUNET_THIGH_CT_ENDPOINT
    start = time.perf_counter()
    response = requests.post(
        endpoint,
        headers={
            "Content-Type": "application/json",
        },
        json=payload,
    )
    response.raise_for_status()
    end = time.perf_counter()
    logger.info(f"Thigh analysis completed in {end-start:.2f} seconds")

    return response.json()


@job(
    "mmap",
    timeout=3600,
    result_ttl=0,
    on_success=report_success,
    on_failure=report_failure,
)
def mmap(dicoms, modality):
    encoded_images = []
    # base64 encode all Dicom instances for inference
    for dicom in dicoms:
        fp = dicom.file.path
        with open(fp, "rb") as f:
            encoded_f = base64.b64encode(f.read()).decode("utf-8")
        logger.info(f"base64 encoded {fp}")
        encoded_images.append(encoded_f)

    payload = {"data": encoded_images}
    start = time.perf_counter()
    response = requests.post(
        MMAP_ENDPOINT,
        headers={
            "Content-Type": "application/json",
        },
        json=payload,
    )
    response.raise_for_status()
    end = time.perf_counter()
    logger.info(f"mmap analysis completed in {end-start:.2f} seconds")

    return response.json()
