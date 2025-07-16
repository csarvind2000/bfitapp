# import os
# import time
# import logging
# import requests
# import json
# import base64
# from django_rq import job
# from django.core.files.base import ContentFile
# from ..models.analysis import (
#     Analysis,
#     PredictionResult,
#     SegmentationResult,
#     AnalysisArtifact,
# )
# from .log_filter import TruncateLogFilter

# AI_ABD_ENDPOINT = os.environ["AI_ABD_ENDPOINT"]
# AI_THIGH_ENDPOINT = os.environ["AI_THIGH_ENDPOINT"]
# AI_MMAP_ENDPOINT = os.environ["AI_MMAP_ENDPOINT"]

# logger = logging.getLogger("rq.worker")
# logger.addFilter(TruncateLogFilter(max_length=500))


# def report_success(job, connection, result, *args, **kwargs):
#     """
#     Specifies the on success callback function to be called
#     when RQ job is executed successfully. Callbacks are limited
#     to 60s runtime.
#     """
#     try:
#         logger.info(f"Executing success callback")
#         analysis = Analysis.objects.get(id=job.id)
#         analysis.status = Analysis.Status.COMPLETED
#         if "prediction" in result:
#             PredictionResult.objects.create(
#                 analysis=analysis, prediction=result["prediction"]
#             )
#         if "segmentation" in result:
#             # handle decoding and storing of base64 encoded segmentation masks
#             for tp, (name, data) in result["segmentation"].items():
#                 # decode base64 string into binary and save to filefield
#                 f = ContentFile(content=base64.b64decode(data), name=name)
#                 SegmentationResult.objects.create(
#                     analysis=analysis, segmentation_mask=f, mask_type=tp
#                 )
#         if "artifact" in result:
#             # handle decoding and storing of intermediate model artifacts
#             for tp, (name, data) in result["artifact"].items():
#                 f = ContentFile(content=base64.b64decode(data), name=name)
#                 AnalysisArtifact.objects.create(
#                     analysis=analysis, artifact=f, artifact_type=tp
#                 )
#         analysis.save()
#         logger.info(f"Analysis {analysis.id} processed successfully")
#     except Analysis.DoesNotExist:
#         logger.error(f"Analysis with job id {job.id} not found")


# def report_failure(job, connection, type, value, traceback):
#     """
#     Specifies the on failure callback function to be called
#     when RQ job execution fails. Callbacks are limited to 60s
#     runtime.
#     """
#     logger.error(
#         f"Analysis {job.id} failed with error {type}: {str(value)}"
#     )
#     Analysis.objects.filter(id=job.id).update(status=Analysis.Status.FAILED)


# @job(
#     "abdomen",
#     timeout=3600,
#     result_ttl=0,
#     on_success=report_success,
#     on_failure=report_failure,
# )
# def abdomen(dicoms):
#     encoded_images = []
#     # base64 encode all Dicom instances for inference
#     for dicom in dicoms:
#         fp = dicom.file.path
#         with open(fp, "rb") as f:
#             encoded_f = base64.b64encode(f.read()).decode("utf-8")
#         logger.info(f"base64 encoded {fp}")
#         encoded_images.append(encoded_f)

#     payload = {"data": encoded_images}
#     start = time.perf_counter()
#     response = requests.post(
#         AI_ABD_ENDPOINT,
#         headers={
#             "Content-Type": "application/json",
#         },
#         json=payload,
#     )
#     response.raise_for_status()
#     end = time.perf_counter()
#     logger.info(f"abd analysis completed in {end-start:.2f} seconds")

#     response_body = response.json()
#     prediction = json.loads(response_body["prediction"])
#     scaling_factor = 1
#     if "params" in response_body:
#         scaling_factor = float(response_body["params"]["scaling_factor"])
#     result = {}
#     result["prediction"] = {
#         "SSAT": {"score": None, "volume": None, "percent": None},
#         "DSAT": {"score": None, "volume": None, "percent": None},
#         "VAT": {"score": None, "volume": None, "percent": None},
#     }  # Placeholder response

#     # for artery, data in result["prediction"].items():
#     #     data["score"] = int(prediction["agatston_score"][artery] * scaling_factor)
#     #     data["volume"] = int(prediction["total_volume"][artery])
#     #     data["lesion_count"] = int(prediction["lesion_count"][artery])

#     # result["prediction"]["total"] = {
#     #     "lesion_count": sum(
#     #         [data["lesion_count"] for data in result["prediction"].values()]
#     #     ),
#     #     "volume": sum([data["volume"] for data in result["prediction"].values()]),
#     #     "score": sum([data["score"] for data in result["prediction"].values()]),
#     #}
#     result["segmentation"] = response_body["segmentation"]
#     result["artifact"] = response_body["artifact"]
#     return result


# @job(
#     "thigh",
#     timeout=3600,
#     result_ttl=0,
#     on_success=report_success,
#     on_failure=report_failure,
# )
# def thigh(dicoms):
#     encoded_images = []
#     # base64 encode all Dicom instances for inference
#     for dicom in dicoms:
#         fp = dicom.file.path
#         with open(fp, "rb") as f:
#             encoded_f = base64.b64encode(f.read()).decode("utf-8")
#         logger.info(f"base64 encoded {fp}")
#         encoded_images.append(encoded_f)

#     payload = {"data": encoded_images}
#     start = time.perf_counter()
#     response = requests.post(
#         AI_THIGH_ENDPOINT,
#         headers={
#             "Content-Type": "application/json",
#         },
#         json=payload,
#     )
#     response.raise_for_status()
#     end = time.perf_counter()
#     logger.info(f"Thigh analysis completed in {end-start:.2f} seconds")

#     response_body = response.json()
#     response_body = response.json()
#     prediction = json.loads(response_body["prediction"])
#     scaling_factor = 1
#     if "params" in response_body:
#         scaling_factor = float(response_body["params"]["scaling_factor"])
#     result = {}
#     result["prediction"] = {
#         "BONE": {"score": None, "volume": None, "percent": None},
#         "IMAT": {"score": None, "volume": None, "percent": None},
#         "VAT": {"score": None, "volume": None, "percent": None},
#         "MUSCLE": {"score": None, "volume": None, "percent": None},
#     }  # Placeholder response
#     result["segmentation"] = response_body["segmentation"]
#     result["artifact"] = response_body["artifact"]
#     return result

# @job(
#     "mmap",
#     timeout=3600,
#     result_ttl=0,
#     on_success=report_success,
#     on_failure=report_failure,
# )
# def mmap(dicoms):
#     encoded_images = []
#     # base64 encode all Dicom instances for inference
#     for dicom in dicoms:
#         fp = dicom.file.path
#         with open(fp, "rb") as f:
#             encoded_f = base64.b64encode(f.read()).decode("utf-8")
#         logger.info(f"base64 encoded {fp}")
#         encoded_images.append(encoded_f)

#     payload = {"data": encoded_images}
#     start = time.perf_counter()
#     response = requests.post(
#         AI_MMAP_ENDPOINT,
#         headers={
#             "Content-Type": "application/json",
#         },
#         json=payload,
#     )
#     response.raise_for_status()
#     end = time.perf_counter()
#     logger.info(f"MMAP analysis completed in {end-start:.2f} seconds")

#     response_body = response.json()
#     return response_body
