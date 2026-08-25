import os
import base64
import logging
import gzip
import json
import tempfile
import uuid
import re
import requests
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from io import BytesIO
from django_rq.jobs import Job
from rq.command import send_stop_job_command
from rq.exceptions import InvalidJobOperation, NoSuchJobError
from django_rq import get_connection
from django.core.files import File
from django.core.files.base import ContentFile
from django.http import Http404, FileResponse
from django.utils.text import get_valid_filename
from django.db import transaction
from django.db.models import OuterRef, Subquery, Q
from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate
from rest_framework import status, permissions
from rest_framework.authentication import TokenAuthentication
from rest_framework.viewsets import ModelViewSet
from rest_framework.response import Response
from rest_framework.decorators import (
    action,
    api_view,
    authentication_classes,
    permission_classes,
)
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import ValidationError

from .models.user import User
from .models.dicomweb import Study, Series, Instance
from .models.analysis import (
    Analysis,
    PredictionResult,
    SegmentationResult,
    AnalysisArtifact,
    Comment,
    Summary,
    Report,
)
from .serializers import (
    UserSerializer,
    UserLoginSerializer,
    StudySerializer,
    SeriesSerializer,
    InstanceSerializer,
    AnalysisSerializer,
    PredictionResultSerializer,
    SegmentationResultSerializer,
    AnalysisArtifactSerializer,
    PACSSeriesSerializer,
    ReportSerializer,
)
from .paginations import ResultsSetPagination

from pydicom import dcmread
from pydicom.errors import InvalidDicomError
import SimpleITK as sitk
from nibabel.nicom import csareader
from nibabel import Nifti1Image
from numpy import uint8, all, unique
import numpy as np
from .utils.dicom_helpers import (
    infer_dixon_channel,
    is_dicom_image_series,
    is_display_dixon_channel,
    parse_protocol_data,
)
from .utils.analysis import abdomen, thigh, mmap
from .utils.computations import genericVolumeAnalysis
from .utils.report_generation import build_body_analysis_pdf
from .utils.llm_summary import (
    LOCAL_LLM_BASE_URL,
    LOCAL_LLM_MODEL,
    LOCAL_LLM_TIMEOUT,
    build_overall_risk_score_prompt,
    build_fallback_volumetric_summary,
    build_volumetric_summary_prompt,
    extract_llm_volume_metrics,
    has_overall_risk_score,
    postprocess_llm_summary_text,
    sanitize_llm_summary_text,
)

logger = logging.getLogger("bfitserver")

THIGH_47CLASS_INPUT_CHANNELS = ("fat", "water", "inphase")


def get_series_dixon_channel(series):
    instance = (
        Instance.objects.filter(series=series, owner=series.owner)
        .order_by("frame_number")
        .first()
    )
    return infer_dixon_channel(instance.metadata if instance else None)


# Create your views here.
class UserViewSet(ModelViewSet):
    serializer_class = UserSerializer
    queryset = User.objects.all().order_by("-date_joined")
    authentication_classes = [TokenAuthentication]

    def get_permissions(self):
        """
        Overrides the class method to set separate permissions per action
        """
        if self.action in ["list", "retrieve", "update", "partial_update", "destroy"]:
            # permit admin to manage users
            permission_classes = [permissions.IsAdminUser]
        elif self.action in ["create", "login", "verify"]:
            # permit registering and logging in without authentication
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def create(self, request):
        """
        Register a new user from POST request
        """
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"])
    def login(self, request):
        """
        Authenticates a user from POST request
        """
        serializer = UserLoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(
            username=serializer.data["username"], password=serializer.data["password"]
        )
        if not user:
            return Response(
                {"error": "Invalid credentials provided"},
                status=status.HTTP_404_NOT_FOUND,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                "user": user.username,
                "token": token.key,
                "date_joined": user.date_joined.isoformat(),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"])
    def logout(self, request):
        """
        Deregisters the authentication token for the authenticated user from POST request
        """
        if request.user:
            logger.info(f"Logging out user {request.user}")
            request.user.auth_token.delete()
        return Response(status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"])
    def verify(self, request):
        """
        Verify the validity of the authentication token
        """
        token = request.data.get("token")
        try:
            token_obj = Token.objects.select_related("user").get(key=token)
            return Response(
                {
                    "user": token_obj.user.username,
                    "date_joined": token_obj.user.date_joined.isoformat(),
                },
                status=status.HTTP_200_OK,
            )
        except Token.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)


class StudyViewSet(ModelViewSet):
    queryset = Study.objects.all()
    serializer_class = StudySerializer
    lookup_field = "study_id"
    lookup_value_regex = "[^/]+"
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.queryset.all().filter(owner=self.request.user)

    def list(self, request):
        """
        List all studies and associated series from authenticated user
        """
        related_series = Series.objects.filter(owner=request.user).select_related(
            "study"
        )
        series_by_study = defaultdict(dict)
        for serie in related_series:
            scan_role = get_series_dixon_channel(serie)
            if (
                serie.anatomy == Series.Anatomy.THIGH
                and serie.modality == Series.Modality.MR
                and not is_display_dixon_channel(scan_role)
            ):
                continue
            if "series" in series_by_study[serie.study.study_id]:
                series_by_study[serie.study.study_id]["series"].append(
                    (SeriesSerializer(serie)).data
                )
            else:
                series_by_study[serie.study.study_id]["series"] = [
                    (SeriesSerializer(serie)).data
                ]
                series_by_study[serie.study.study_id][
                    "patient_id"
                ] = serie.study.patient_id
                series_by_study[serie.study.study_id][
                    "patient_name"
                ] = serie.study.patient_name
                series_by_study[serie.study.study_id][
                    "study_date"
                ] = serie.study.study_date
                series_by_study[serie.study.study_id][
                    "created_at"
                ] = serie.study.created_at

        result = []
        for study_id, details in series_by_study.items():
            result.append({"study_id": study_id, **details})

        return Response(result, status=status.HTTP_200_OK)

    @transaction.atomic
    def create(self, request):
        """
        Create or update a study with associated series and instances from form data in POST request
        """
        files = request.FILES.getlist("files")
        sorted_result = {}
        # cache study-level and series-level metadata for model creation
        metas = {
            "study": defaultdict(),
            "series": defaultdict(),
        }
        user = request.user
        if not files:
            return Response({"error": "No files uploaded."}, status=400)

        def is_matched_series(protocol_name, scan_options, pixel_bw, first_metadata=None):
            first_metadata = first_metadata or {}
            dixon_channel = infer_dixon_channel(first_metadata)
            if dixon_channel and "thigh" in str(protocol_name or first_metadata.get("Series Description", "")).lower():
                return True, "thigh"

            if protocol_name is None:
                return False, None
            
            # Only reject if scan_options is a non-empty list (ambiguous multi-value)
            if isinstance(scan_options, list) and len(scan_options) > 0:
                return False, None

            # Abdomen Dixon scan family:
            #   DIXF = abdomen fat series
            if protocol_name == "t1+AF8-vibe+AF8-tra+AF8-p2+AF8-bh+AF8-dixon abd":
                if scan_options == "DIXF" and float(pixel_bw) == float(849):
                    return True, "abd"

            # Siemens t1-vibe 320 Dixon thigh scan family:
            #   SAT2 = inphase, DIXW = water, DIXF = fat
            if protocol_name == "t1+AF8-vibe+AF8-tra+AF8-p2+AF8-bh+AF8-320+AF8-DIXON Thigh":
                if scan_options in {"SAT2", "DIXW", "DIXF"} and float(pixel_bw) == float(504):
                    return True, "thigh"

            # Named Dixon thigh scan family:
            #   dixon_thigh_inphase + DIXIN
            #   dixon_thigh_fat     + DIXF
            #   dixon_thigh_water   + DIXW
            named_thigh_dixon_scan_options = {
                "dixon_thigh_inphase": "DIXIN",
                "dixon_thigh_fat": "DIXF",
                "dixon_thigh_water": "DIXW",
            }
            if protocol_name in named_thigh_dixon_scan_options:
                if scan_options == named_thigh_dixon_scan_options[protocol_name]:
                    return True, "thigh"

            if dixon_channel and "dixon" in str(protocol_name).lower() and "thigh" in str(protocol_name).lower():
                return True, "thigh"

            if protocol_name == "t1_vibe_tra_p2_bh_320_dixon Thigh":
                return True, "thigh"

            return False, None
        
        tmpdir = tempfile.mkdtemp()
        print(f"🔥 TMP DIR: {tmpdir}")
        # Write InMemoryUploadedFile to disk
        for file in files:
            p = os.path.join(tmpdir, file.name)
            with open(p, "wb+") as f:
                for chunk in file.chunks():
                    f.write(chunk)
            logger.debug(f"Saved file to {p}")

        reader = sitk.ImageSeriesReader()
        # Iterate over each DICOM series, parsing the required metadata
        for serie in reader.GetGDCMSeriesIDs(tmpdir):
            logger.debug(f"Got DICOM series {serie}")
            dicoms = reader.GetGDCMSeriesFileNames(
                tmpdir, serie
            )  # List[str] of DICOM filepath

            if not (is_dicom_image_series(dicoms)):
                # Not a DICOM Image series, skip processing
                continue

            # Extract tag ProtocolName embedded in Siemens CSA Series Header Info data element (0029,1020)
            with dcmread(dicoms[0]) as ds:
                scan_options = ds.get("ScanOptions", [])  # str or List[str]
                pixel_bw = ds.get("PixelBandwidth")  # pydicom Decimal String
                series_description = ds.get("SeriesDescription", "")
                image_type = [str(v) for v in ds.get("ImageType", [])]
                sequence_name = ds.get("SequenceName", "")
                image_comments = ds.get("ImageComments", "")
                protocol_name = None
                protocol_name = None
                mrphoenixprotocol = None

                # Try extracting CSA safely
                try:
                    csa_dict = csareader.get_csa_header(ds, csa_type="series")
                except Exception as e:
                    logger.debug(f"CSA extraction failed: {e}")
                    csa_dict = None

                # Safely access CSA fields
                if csa_dict and isinstance(csa_dict, dict):
                    tags = csa_dict.get("tags", {})
                    mrphoenixprotocol = tags.get("MrPhoenixProtocol")

                # Parse if exists
                if mrphoenixprotocol:
                    try:
                        protocol_name = parse_protocol_data(
                            mrphoenixprotocol["items"][0]
                        ).get("tProtocolName")

                        protocol_name = (
                            protocol_name.strip('""') if protocol_name else None
                        )
                    except Exception as e:
                        logger.debug(f"Failed parsing MrPhoenixProtocol: {e}")

                # 🔥 FALLBACK (VERY IMPORTANT)
                if not protocol_name:
                    protocol_name = getattr(ds, "ProtocolName", None)

                # Optional debug
                logger.debug(f"Final protocol_name: {protocol_name}")

            if mrphoenixprotocol:
                logger.debug(f"Got MrPhoenixProtocol tag data, parsing data")
                protocol_name = parse_protocol_data(
                    mrphoenixprotocol["items"][0]
                ).get("tProtocolName")
                protocol_name = (
                    protocol_name.strip('""') if protocol_name else None
                )  # text values are doubly quoted

            logger.debug(
                f"Checking match to ProtocolName {protocol_name}, ScanOptions {scan_options}, PixelBandwidth {pixel_bw}"
            )
            first_metadata = {
                "Series Description": series_description,
                "Protocol Name": protocol_name,
                "Scan Options": scan_options,
                "Pixel Bandwidth": pixel_bw,
                "Image Type": image_type,
                "Sequence Name": sequence_name,
                "Image Comments": image_comments,
            }
            is_matched, anatomy = is_matched_series(
                protocol_name, scan_options, pixel_bw, first_metadata
            )

            if is_matched:
                logger.debug(f"Matched series {serie}")
                # Series is matched, process DICOMs for insertion
                for dicom in dicoms:
                    metadata = {}
                    try:
                        with dcmread(dicom) as ds:
                            metadata["Patient ID"] = ds.get("PatientID", "")
                            metadata["Patient Name"] = str(
                                ds.get("PatientName", "")
                            )
                            metadata["Study Instance UID"] = ds.get(
                                "StudyInstanceUID"
                            )
                            metadata["Study Date"] = ds.get("StudyDate")
                            metadata["Series Instance UID"] = ds.get(
                                "SeriesInstanceUID"
                            )
                            metadata["SOP Instance UID"] = ds.get("SOPInstanceUID")
                            metadata["Number of Frames"] = ds.get("NumberOfFrames")
                            metadata["Frame Number"] = ds.get("InstanceNumber", 1)
                            metadata["Modality"] = ds.get("Modality")
                            metadata["Series Description"] = ds.get(
                                "SeriesDescription", ""
                            )
                            metadata["Protocol Name"] = protocol_name or ds.get("ProtocolName", "")
                            metadata["Scan Options"] = ds.get("ScanOptions", "")
                            metadata["Pixel Bandwidth"] = ds.get("PixelBandwidth", "")
                            metadata["Image Type"] = [str(v) for v in ds.get("ImageType", [])]
                            metadata["Sequence Name"] = ds.get("SequenceName", "")
                            metadata["Image Comments"] = ds.get("ImageComments", "")

                        if not (metadata["Study Instance UID"]) or not (
                            metadata["Series Instance UID"]
                        ):
                            # ignore DICOMs without Study or Series Instance UID tags
                            logger.info(
                                f"Instance {dicom} is missing Study or Series Instance UID and will not be processed"
                            )
                            continue

                        if metadata["Study Instance UID"] not in sorted_result:
                            # new study
                            sorted_result[metadata["Study Instance UID"]] = {}
                            metas["study"][metadata["Study Instance UID"]] = {
                                "patient_id": metadata["Patient ID"],
                                "patient_name": metadata["Patient Name"],
                                "study_date": metadata["Study Date"],
                            }

                        if (
                            metadata["Series Instance UID"]
                            not in sorted_result[metadata["Study Instance UID"]]
                        ):
                            # existing study, new series
                            with open(dicom, "rb") as f:
                                buf = BytesIO(f.read())
                                sorted_result[metadata["Study Instance UID"]][
                                    metadata["Series Instance UID"]
                                ] = [
                                    (
                                        metadata,
                                        File(buf, name=os.path.basename(dicom)),
                                    )
                                ]
                                metas["series"][metadata["Series Instance UID"]] = {
                                    "modality": metadata["Modality"],
                                    "anatomy": anatomy,
                                    "scan_role": infer_dixon_channel(metadata),
                                }
                        else:
                            # existing study and series
                            with open(dicom, "rb") as f:
                                buf = BytesIO(f.read())
                                sorted_result[metadata["Study Instance UID"]][
                                    metadata["Series Instance UID"]
                                ].append(
                                    (
                                        metadata,
                                        File(buf, name=os.path.basename(dicom)),
                                    )
                                )

                    except InvalidDicomError:
                        # invalid Dicom file was uploaded
                        logger.error(f"Invalid Dicom file {dicom}")

        # Update Dicomweb database
        for study_id, series_detail in sorted_result.items():
            patient_id = metas["study"][study_id]["patient_id"]
            patient_name = metas["study"][study_id]["patient_name"]
            study_date = metas["study"][study_id]["study_date"]

            study, _ = self.queryset.select_for_update().get_or_create(
                study_id=study_id,
                owner=user,
                defaults={
                    "patient_id": patient_id,
                    "patient_name": patient_name,
                    "study_date": (
                        datetime.strptime(study_date, "%Y%m%d").date()
                        if study_date
                        else None
                    ),
                },
            )
            for series_id, instances in series_detail.items():
                modality = metas["series"][series_id]["modality"].lower()
                anatomy = metas["series"][series_id]["anatomy"]

                series, _ = Series.objects.select_for_update().get_or_create(
                    series_id=series_id,
                    study=study,
                    owner=user,
                    defaults={
                        "modality": Series.Modality(modality),
                        "anatomy": Series.Anatomy(anatomy),
                        "num_frames": len(instances),
                    },
                )
                # create model instances to insert to db
                instances_to_insert = list(
                    map(
                        lambda obj: Instance(
                            instance_id=obj[0]["SOP Instance UID"],
                            series=series,
                            metadata=obj[0],
                            frame_number=obj[0]["Frame Number"],
                            file=obj[1],
                            owner=user,
                        ),
                        instances,
                    )
                )
                # perform a bulk upsert operation
                instances = Instance.objects.select_for_update().bulk_create(
                    instances_to_insert,
                    update_conflicts=True,
                    update_fields=[
                        "instance_id",
                        "file",
                        "metadata",
                        "frame_number",
                    ],
                    unique_fields=["instance_id", "owner"],
                )
                sorted_result[study_id][series_id] = (
                    InstanceSerializer(
                        instances, many=True, context={"exclude_base64": True}
                    )
                ).data

        visible_result = {}
        for study_id, series_detail in sorted_result.items():
            visible_series = {
                series_id: instances
                for series_id, instances in series_detail.items()
                if (
                    metas["series"][series_id].get("anatomy") != "thigh"
                    or metas["series"][series_id].get("modality", "").lower() != "mr"
                    or is_display_dixon_channel(metas["series"][series_id].get("scan_role"))
                )
            }
            if visible_series:
                visible_result[study_id] = visible_series

        return Response(
            visible_result,
            status=(
                status.HTTP_201_CREATED if len(sorted_result) else status.HTTP_200_OK
            ),
        )

    def perform_destroy(self, instance):
        # remove associated Dicom instances from filestorage
        dicoms = Instance.objects.filter(
            series__study=instance, owner=self.request.user
        )
        for dicom in dicoms:
            if dicom.file.storage.exists(dicom.file.name):
                logger.debug(f"Deleting {dicom.file.name}")
                dicom.file.delete(save=False)
        # remove associated analysis
        analyses = Analysis.objects.filter(
            series__study=instance, owner=self.request.user
        )
        for analysis in analyses:
            segmentation_results = analysis.segmentation_result.all()
            artifacts = analysis.analysis_artifact.all()
            for seg in segmentation_results:
                if seg.segmentation_mask.storage.exists(seg.segmentation_mask.name):
                    logger.debug(f"Deleting {seg.segmentation_mask.name}")
                    seg.segmentation_mask.delete(save=False)

            for arti in artifacts:
                if arti.artifact.storage.exists(arti.artifact.name):
                    logger.debug(f"Deleting {arti.artifact.name}")
                    arti.artifact.delete(save=False)

        instance.delete()

    def destroy(self, request, study_id=None, *args, **kwargs):
        try:
            study = self.get_object()
            series = Series.objects.filter(study=study, owner=self.request.user)

            processing_analysis = Analysis.objects.filter(
                status=Analysis.Status.PROCESSING,
                series__in=series
            )

            # 🔥 NEW: cancel all running jobs instead of blocking
            for analysis in processing_analysis:
                try:
                    conn = get_connection(analysis.queue)
                    job = Job.fetch(analysis.id, connection=conn)
                    job_status = job.get_status()

                    if job_status == "started":
                        send_stop_job_command(conn, job.id)
                    elif job_status in ["queued", "deferred", "scheduled"]:
                        job.cancel()

                    analysis.status = Analysis.Status.CANCELED
                    analysis.save()

                except Exception as e:
                    logger.warning(f"Failed to cancel job {analysis.id}: {e}")
                    analysis.status = Analysis.Status.FAILED
                    analysis.save()

            # ✅ Now safely delete
            self.perform_destroy(study)

            logger.info(f"Deleted study {study_id}")
            return Response(status=status.HTTP_204_NO_CONTENT)

        except Http404:
            logger.error(f"Study {study_id} not found")
            return Response(
                {"error": f"Study {study_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )


class SeriesViewSet(ModelViewSet):
    queryset = Series.objects.all()
    serializer_class = SeriesSerializer
    lookup_field = "series_id"
    lookup_value_regex = "[^/]+"
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return self.queryset.all().filter(
            owner=self.request.user,
            study__study_id=self.kwargs["study_id"],
            study__owner=self.request.user,
        )

    def perform_destroy(self, instance):
        # remove associated Dicom instances from filestorage
        dicoms = Instance.objects.filter(series=instance, owner=self.request.user)
        for dicom in dicoms:
            if dicom.file.storage.exists(dicom.file.name):
                logger.debug(f"Deleting {dicom.file.name}")
                dicom.file.delete(save=False)
        # remove associated analysis
        analyses = Analysis.objects.filter(series=instance, owner=self.request.user)
        for analysis in analyses:
            segmentation_results = analysis.segmentation_result.all()
            artifacts = analysis.analysis_artifact.all()
            for seg in segmentation_results:
                if seg.segmentation_mask.storage.exists(seg.segmentation_mask.name):
                    logger.debug(f"Deleting {seg.segmentation_mask.name}")
                    seg.segmentation_mask.delete(save=False)

            for arti in artifacts:
                if arti.artifact.storage.exists(arti.artifact.name):
                    logger.debug(f"Deleting {arti.artifact.name}")
                    arti.artifact.delete(save=False)

        instance.delete()

    def destroy(self, request, series_id=None, *args, **kwargs):
        """
        Delete a given Series Instance UID from DELETE request
        """
        try:
            serie = self.get_object()
            self.perform_destroy(serie)
            logger.info(f"Deleted serie {series_id}")
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Http404:
            logger.error(f"Serie {series_id} not found")
            return Response(
                {"error": f"Serie {series_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )


class InstanceViewSet(ModelViewSet):
    queryset = Instance.objects.all()
    serializer_class = InstanceSerializer
    lookup_value_regex = "[^/]+"
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = ResultsSetPagination

    def get_queryset(self):
        return (
            self.queryset.all()
            .filter(
                owner=self.request.user,
                series__series_id=self.kwargs["series_id"],
                series__owner=self.request.user,
            )
            .order_by("frame_number")
        )


class AnalysisViewSet(ModelViewSet):
    queryset = Analysis.objects.all()
    serializer_class = AnalysisSerializer
    lookup_value_regex = "[^/]+"
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    SOURCE_SCAN_ARTIFACT_TYPES = {
        "inphase": "ORIGINAL MR INPHASE",
        "water": "ORIGINAL MR WATER",
        "fat": "ORIGINAL MR FAT",
        "fatfraction": "ORIGINAL MR FATFRACTION",
    }

    def get_queryset(self):
        return self.queryset.all().filter(owner=self.request.user).order_by("-ended_at")

    def perform_destroy(self, instance):
        # Remove associated SegmentationResult and AnalysisArtifact instances from filestorage
        segmentation_results = instance.segmentation_result.all()
        artifacts = instance.analysis_artifact.all()
        for seg in segmentation_results:
            if seg.segmentation_mask.storage.exists(seg.segmentation_mask.name):
                logger.debug(f"Deleting {seg.segmentation_mask.name}")
                seg.segmentation_mask.delete(save=False)

        for arti in artifacts:
            if arti.artifact.storage.exists(arti.artifact.name):
                logger.debug(f"Deleting {arti.artifact.name}")
                arti.artifact.delete(save=False)
        instance.delete()

    def replace_existing_analysis(self, serie, queue, owner):
        existing_analyses = Analysis.objects.filter(
            series=serie,
            queue=queue,
            owner=owner,
        )

        for analysis in existing_analyses:
            try:
                conn = get_connection(analysis.queue)
                job = Job.fetch(analysis.id, connection=conn)
                job_status = job.get_status()

                if job_status == "started":
                    send_stop_job_command(conn, job.id)
                elif job_status in ["queued", "deferred", "scheduled"]:
                    job.cancel()
            except NoSuchJobError:
                pass
            except Exception as error:
                logger.warning(f"Failed to cancel old analysis job {analysis.id}: {error}")

            for report in Report.objects.filter(id=analysis.id, owner=owner):
                report.delete()
            self.perform_destroy(analysis)
            logger.info(
                f"Replaced old analysis {analysis.id} for series {serie.series_id} queue {queue}"
            )

    def _serialize_artifact(self, artifact):
        return AnalysisArtifactSerializer(
            artifact,
            context={"request": self.request},
        ).data

    def _find_dixon_series(self, analysis, channel):
        if channel == "inphase":
            current_channel = get_series_dixon_channel(analysis.series)
            if current_channel in (None, "", "inphase"):
                return analysis.series

        sibling_series = Series.objects.filter(
            study=analysis.series.study,
            owner=analysis.owner,
            anatomy=Series.Anatomy.THIGH,
            modality=Series.Modality.MR,
        )
        for sibling in sibling_series:
            if get_series_dixon_channel(sibling) == channel:
                return sibling
        return None

    def _resample_nifti_file_to_reference(self, input_path, reference_path):
        import nibabel as nib
        from nibabel.processing import resample_from_to

        input_nii = nib.load(input_path)
        reference_nii = nib.load(reference_path)
        if (
            input_nii.shape == reference_nii.shape
            and np.allclose(input_nii.affine, reference_nii.affine)
        ):
            with open(input_path, "rb") as f:
                return f.read()

        aligned_nii = resample_from_to(
            input_nii,
            (reference_nii.shape, reference_nii.affine),
            order=1,
        )
        header = reference_nii.header.copy()
        header.set_data_dtype(np.float32)

        with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
            aligned_path = tmp.name
        try:
            nib.save(
                nib.Nifti1Image(
                    aligned_nii.get_fdata(dtype=np.float32),
                    reference_nii.affine,
                    header,
                ),
                aligned_path,
            )
            with open(aligned_path, "rb") as f:
                return f.read()
        finally:
            try:
                os.unlink(aligned_path)
            except OSError:
                pass

    def _convert_series_to_nifti_bytes(self, series, channel, reference_artifact=None):
        instances = (
            Instance.objects.filter(series=series, owner=series.owner)
            .exclude(file="")
            .order_by("frame_number", "instance_id")
        )
        dicom_paths = [instance.file.path for instance in instances if instance.file]
        if not dicom_paths:
            raise ValueError(f"No DICOM files found for {channel} series")

        reader = sitk.ImageSeriesReader()
        series_dir = os.path.dirname(dicom_paths[0])
        gdcm_sorted_paths = reader.GetGDCMSeriesFileNames(series_dir)
        reader.SetFileNames(gdcm_sorted_paths or dicom_paths)
        image = reader.Execute()

        with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
            output_path = tmp.name
        try:
            sitk.WriteImage(image, output_path, True)
            if reference_artifact is not None:
                return self._resample_nifti_file_to_reference(
                    output_path,
                    reference_artifact.artifact.path,
                )
            with open(output_path, "rb") as f:
                return f.read()
        finally:
            try:
                os.unlink(output_path)
            except OSError:
                pass

    def _create_fatfraction_nifti_bytes(self, fat_artifact, water_artifact):
        import nibabel as nib
        from nibabel.processing import resample_from_to

        fat_nii = nib.load(fat_artifact.artifact.path)
        water_nii = nib.load(water_artifact.artifact.path)
        if (
            fat_nii.shape != water_nii.shape
            or not np.allclose(fat_nii.affine, water_nii.affine)
        ):
            water_nii = resample_from_to(
                water_nii,
                (fat_nii.shape, fat_nii.affine),
                order=1,
            )

        fat = fat_nii.get_fdata(dtype=np.float32)
        water = water_nii.get_fdata(dtype=np.float32)

        fat_fraction = fat / (fat + water + 1e-8)
        fat_fraction = np.clip(fat_fraction, 0.0, 1.0).astype(np.float32)

        with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
            output_path = tmp.name
        try:
            nib.save(
                nib.Nifti1Image(fat_fraction, fat_nii.affine, fat_nii.header),
                output_path,
            )
            with open(output_path, "rb") as f:
                return f.read()
        finally:
            try:
                os.unlink(output_path)
            except OSError:
                pass

    def _get_or_create_source_scan_artifact(self, analysis, channel):
        artifact_type = self.SOURCE_SCAN_ARTIFACT_TYPES[channel]
        existing_qs = AnalysisArtifact.objects.filter(
            analysis=analysis,
            artifact_type=artifact_type,
        )
        existing = existing_qs.first()
        if existing:
            if channel in {"fat", "water", "fatfraction"}:
                for artifact in existing_qs:
                    artifact.delete()
            else:
                return existing

        if channel == "fatfraction":
            stale_fatfraction = AnalysisArtifact.objects.filter(
                analysis=analysis,
                artifact_type=artifact_type,
            )
            for artifact in stale_fatfraction:
                artifact.delete()

        existing = AnalysisArtifact.objects.filter(
            analysis=analysis,
            artifact_type=artifact_type,
        ).first()
        if existing:
            return existing

        if channel == "inphase":
            existing_original = AnalysisArtifact.objects.filter(
                analysis=analysis,
                artifact_type="ORIGINAL MR",
            ).first()
            if existing_original:
                return existing_original

        if channel == "fatfraction":
            fat_artifact = self._get_or_create_source_scan_artifact(analysis, "fat")
            water_artifact = self._get_or_create_source_scan_artifact(analysis, "water")
            nifti_bytes = self._create_fatfraction_nifti_bytes(
                fat_artifact,
                water_artifact,
            )
        else:
            source_series = self._find_dixon_series(analysis, channel)
            if source_series is None:
                raise ValueError(f"No {channel} Dixon series found for this analysis")
            reference_artifact = self._get_or_create_source_scan_artifact(
                analysis,
                "inphase",
            )
            nifti_bytes = self._convert_series_to_nifti_bytes(
                source_series,
                channel,
                reference_artifact=reference_artifact,
            )

        return AnalysisArtifact.objects.create(
            analysis=analysis,
            artifact=ContentFile(nifti_bytes, name=f"{channel}.nii.gz"),
            artifact_type=artifact_type,
        )

    @action(detail=True, methods=["post"], url_path="source-scan")
    def source_scan(self, request, pk=None):
        analysis = get_object_or_404(self.get_queryset(), id=pk)
        channel = str(request.data.get("channel", "")).strip().lower()
        if channel not in self.SOURCE_SCAN_ARTIFACT_TYPES:
            return Response(
                {"error": f"Invalid source scan channel: {channel}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            artifact = self._get_or_create_source_scan_artifact(analysis, channel)
            return Response(
                {"artifact": self._serialize_artifact(artifact)},
                status=status.HTTP_200_OK,
            )
        except Exception as error:
            logger.exception("Failed to prepare source scan artifact")
            return Response(
                {"error": str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    def retrieve(self, request, pk=None, *args, **kwargs):
        """
        Retrieve detail of analysis job from GET request
        """
        try:
            analysis = get_object_or_404(self.get_queryset(), id=pk)
            get_predictions = request.query_params.get("predictions")
            get_segmentations = request.query_params.get("segmentations")
            get_artifacts = request.query_params.getlist("artifacts")

            logger.debug(
                f"Got query params predictions {get_predictions}, segmentations {get_segmentations}, artifacts {get_artifacts}"
            )

            # retrieve related predictions, segmentations and artifacts
            prediction_results = analysis.prediction_result.all()
            segmentation_results = analysis.segmentation_result.all()
            artifacts = analysis.analysis_artifact.all()

            response = {}
            response["analysis"] = (self.get_serializer(analysis)).data
            if get_predictions:
                response["predictions"] = (
                    PredictionResultSerializer(prediction_results, many=True)
                ).data
            if get_segmentations:
                response["segmentations"] = (
                    SegmentationResultSerializer(
                        segmentation_results,
                        context={"request": self.request},
                        many=True,
                    )
                ).data
            if get_artifacts:
                qexp = Q()
                for exp in get_artifacts:
                    qexp |= Q(artifact_type__icontains=exp)
                artifacts = artifacts.filter(qexp)

                response["artifacts"] = (
                    AnalysisArtifactSerializer(
                        artifacts, context={"request": self.request}, many=True
                    )
                ).data

            return Response(response, status=status.HTTP_200_OK)
        except Http404:
            logger.error(f"Analysis {pk} not found")
            return Response(
                {"error": f"Analysis {pk} not found"}, status=status.HTTP_404_NOT_FOUND
            )

    def list(self, request):
        """
        List current analysis jobs from GET request
        """
        series_id = request.query_params.get("series_id")
        queue = request.query_params.get("queue")

        queryset = self.get_queryset().select_related("series", "series__study")

        if series_id:
            queryset = queryset.filter(series__series_id=series_id)

        if queue:
            queryset = queryset.filter(queue=queue)

        latest_analyses = (
            queryset.filter(series=OuterRef("series"), queue=OuterRef("queue"))
            .order_by("-ended_at")
            .values("id")[:1]
        )

        serializer = AnalysisSerializer(
            queryset.filter(id__in=Subquery(latest_analyses)), many=True
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"])
    def completed(self, request):
        """
        List completed analysis jobs from GET request
        """
        study_id = request.query_params.get("study_id")
        series_id = request.query_params.get("series_id")
        queryset = (
            self.get_queryset()
            .filter(status=Analysis.Status.COMPLETED)
            .select_related("series", "series__study")
        )

        if study_id:
            queryset = queryset.filter(series__study__study_id=study_id)

        if series_id:
            queryset = queryset.filter(series__series_id=series_id)

        latest_completed_analyses = (
            queryset.filter(series=OuterRef("series"), queue=OuterRef("queue"))
            .order_by("-ended_at", "-created_at")
            .values("id")[:1]
        )

        serializer = AnalysisSerializer(
            queryset.filter(id__in=Subquery(latest_completed_analyses)), many=True
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request):
        """
        Create an analysis on a given Series Instance UID from POST request
        """
        series_id = request.query_params.get("series_id")
        jobs = []
        try:
            serie = get_object_or_404(
                Series.objects.all(), series_id=series_id, owner=request.user
            )
            dicoms = Instance.objects.filter(series=serie, owner=request.user)

            if serie.anatomy == Series.Anatomy.ABD:
                queue = Analysis.Queue.NNUNET
                analysis_task = abdomen
                task_kwargs = {"dicoms": dicoms, "modality": serie.modality}
            elif serie.anatomy == Series.Anatomy.THIGH:
                queue = Analysis.Queue.NNUNET
                analysis_task = thigh
                task_kwargs = {"dicoms": dicoms, "modality": serie.modality}
                if serie.modality == Series.Modality.MR:
                    sibling_series = Series.objects.filter(
                        study=serie.study,
                        owner=request.user,
                        anatomy=Series.Anatomy.THIGH,
                        modality=Series.Modality.MR,
                    )
                    channel_series = {}
                    for sibling in sibling_series:
                        channel = get_series_dixon_channel(sibling)
                        if channel in THIGH_47CLASS_INPUT_CHANNELS and channel not in channel_series:
                            channel_series[channel] = sibling

                    current_channel = get_series_dixon_channel(serie)
                    if current_channel != "inphase" and "inphase" in channel_series:
                        serie = channel_series["inphase"]
                        dicoms = Instance.objects.filter(series=serie, owner=request.user)
                        task_kwargs["dicoms"] = dicoms

                    missing_channels = [
                        channel for channel in THIGH_47CLASS_INPUT_CHANNELS if channel not in channel_series
                    ]
                    if missing_channels:
                        self.replace_existing_analysis(serie, queue, request.user)
                        failed_analysis = Analysis.objects.create(
                            pk=str(uuid.uuid4()),
                            queue=queue,
                            series=serie,
                            status=Analysis.Status.FAILED,
                            owner=request.user,
                        )
                        return Response(
                            {
                                "jobs": [AnalysisSerializer(failed_analysis).data],
                                "error": (
                                    "Thigh 47-class analysis requires fat, water, "
                                    f"and inphase series. Missing: {', '.join(missing_channels)}"
                                )
                            },
                            status=status.HTTP_200_OK,
                        )

                    task_kwargs["channel_dicoms"] = {
                        channel: Instance.objects.filter(
                            series=channel_series[channel],
                            owner=request.user,
                        ).order_by("frame_number")
                        for channel in THIGH_47CLASS_INPUT_CHANNELS
                    }
            else:
                queue = Analysis.Queue.MMAP
                analysis_task = mmap
                task_kwargs = {"dicoms": dicoms}

            self.replace_existing_analysis(serie, queue, request.user)

            job = analysis_task.delay(**task_kwargs)
            analysis = Analysis.objects.create(
                pk=job.id,
                queue=queue,
                series=serie,
                status=Analysis.Status.PROCESSING,
                owner=request.user,
            )
            logger.info(f"Enqueued {queue} analysis job id {job.id}")
            jobs.append(analysis)

            return Response(
                {"jobs": [(AnalysisSerializer(job)).data for job in jobs]},
                status=status.HTTP_200_OK,
            )

        except Http404:
            logger.error(f"Serie {series_id} not found")
            return Response(
                {"error": "Invalid Series Instance UID {series_id}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as err:
            import traceback

            logger.error(traceback.format_exc())
            return Response(
                {"error": str(err)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """
        Cancel a given analysis job from POST request
        """
        try:
            analysis = self.get_object()
            conn = get_connection(analysis.queue)
            # fetch job details from RQ
            job = Job.fetch(analysis.id, connection=conn)
            job_status = job.get_status()
            logger.info(f"Got RQ job {job.id} with status {job_status}")
            if job_status == "started":
                # cancel currently executing job
                send_stop_job_command(conn, job.id)
            elif job_status in ["queued", "deferred", "scheduled"]:
                # cancel pending job
                job.cancel()

            analysis.status = Analysis.Status.CANCELED
            analysis.save()
            logger.info(f"Canceled analysis job {analysis.id}")
            return Response(status=status.HTTP_200_OK)
        except (NoSuchJobError, InvalidJobOperation) as e:
            logger.error(
                e,
                stack_info=True,
                exc_info=True,
            )
            analysis.status = Analysis.Status.FAILED
            analysis.save()
            return Response(
                {
                    "message": f"Job id {analysis.id} not found or cannot be canceled and marked as failed"
                },
                status=status.HTTP_200_OK,
            )
        except Http404:
            logger.error(f"Analysis job {pk} not found")
            return Response(
                {"error": f"Analysis {pk} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=["get"], url_path="load_comment")
    def load_comment(self, request):
        """
        Load saved user comments for an analysis.
        """
        analysis_id = request.query_params.get("analysis_id")
        if not analysis_id:
            return Response(
                {"error": "Analysis id was not provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = get_object_or_404(self.get_queryset(), id=analysis_id)
        comment = Comment.objects.filter(analysis=analysis).first()
        comments = self.parse_comment_thread(comment.comment if comment else "")
        return Response(
            {
                "analysis_id": analysis.id,
                "comment": comments[0]["text"] if comments else "",
                "comments": comments,
                "comment_count": len(comments),
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="save_comment")
    def save_comment(self, request):
        """
        Add a user comment for an analysis.
        """
        analysis_id = request.data.get("analysis_id")
        contents = (request.data.get("contents", "") or "").strip()

        if not analysis_id:
            return Response(
                {"error": "Analysis id was not provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not contents:
            return Response(
                {"error": "Comment was empty"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = get_object_or_404(self.get_queryset(), id=analysis_id)
        existing = Comment.objects.filter(analysis=analysis).first()
        comments = self.parse_comment_thread(existing.comment if existing else "")
        comments.append(
            {
                "text": contents,
                "created_at": datetime.now().isoformat(timespec="seconds"),
            }
        )
        comment, _ = Comment.objects.update_or_create(
            analysis=analysis,
            defaults={"comment": json.dumps(comments)},
        )
        return Response(
            {
                "analysis_id": analysis.id,
                "comment": contents,
                "comments": comments,
                "comment_count": len(comments),
                "message": "Comment added",
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["delete"], url_path="delete_comment")
    def delete_comment(self, request):
        """
        Delete the saved user comment for an analysis.
        """
        analysis_id = request.query_params.get("analysis_id")
        index = request.query_params.get("index")
        if not analysis_id:
            return Response(
                {"error": "Analysis id was not provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = get_object_or_404(self.get_queryset(), id=analysis_id)
        comment = Comment.objects.filter(analysis=analysis).first()
        if not comment:
            return Response(
                {"analysis_id": analysis.id, "comments": [], "comment_count": 0},
                status=status.HTTP_200_OK,
            )

        comments = self.parse_comment_thread(comment.comment)
        if index is None:
            comments = []
        else:
            try:
                comment_index = int(index)
                if 0 <= comment_index < len(comments):
                    comments.pop(comment_index)
            except ValueError:
                return Response(
                    {"error": "Comment index was invalid"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if comments:
            comment.comment = json.dumps(comments)
            comment.save()
        else:
            comment.delete()

        return Response(
            {
                "analysis_id": analysis.id,
                "comments": comments,
                "comment_count": len(comments),
            },
            status=status.HTTP_200_OK,
        )

    @staticmethod
    def parse_comment_thread(raw_comment):
        """
        Return comment thread entries. Supports old plain-text comments.
        """
        if not raw_comment:
            return []

        try:
            parsed = json.loads(raw_comment)
            if isinstance(parsed, list):
                comments = []
                for item in parsed:
                    if isinstance(item, dict):
                        text = str(item.get("text", "")).strip()
                        if text:
                            comments.append(
                                {
                                    "text": text,
                                    "created_at": item.get("created_at", ""),
                                }
                            )
                    elif str(item).strip():
                        comments.append({"text": str(item).strip(), "created_at": ""})
                return comments
        except (TypeError, ValueError):
            pass

        text = str(raw_comment).strip()
        return [{"text": text, "created_at": ""}] if text else []

    @action(detail=False, methods=["get"], url_path="load_summary")
    def load_summary(self, request):
        """
        Load a saved volumetric summary for an analysis.
        """
        analysis_id = request.query_params.get("analysis_id")
        if not analysis_id:
            return Response(
                {"error": "Analysis id was not provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = get_object_or_404(self.get_queryset(), id=analysis_id)
        summary = Summary.objects.filter(analysis=analysis).first()
        summary_text = postprocess_llm_summary_text(summary.summary, analysis) if summary else ""
        if summary and summary_text != summary.summary:
            summary.summary = summary_text
            summary.save(update_fields=["summary"])
        return Response(
            {
                "analysis_id": analysis.id,
                "summary": summary_text,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path="save_summary")
    def save_summary(self, request):
        """
        Save or replace a user-edited volumetric summary.
        """
        analysis_id = request.data.get("analysis_id")
        contents = request.data.get("contents", "")

        if not analysis_id:
            return Response(
                {"error": "Analysis id was not provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = get_object_or_404(self.get_queryset(), id=analysis_id)
        summary_text = postprocess_llm_summary_text(contents, analysis)
        summary, _ = Summary.objects.update_or_create(
            analysis=analysis,
            defaults={"summary": summary_text},
        )
        return Response(
            {
                "analysis_id": analysis.id,
                "summary": summary.summary,
                "message": "Summary saved",
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="generate_summary")
    def generate_summary(self, request):
        """
        Generate a local-LLM volumetric summary from stored prediction volumes.
        """
        analysis_id = request.query_params.get("analysis_id")
        if not analysis_id:
            return Response(
                {"error": "Analysis id was not provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analysis = get_object_or_404(self.get_queryset(), id=analysis_id)
        prediction_result = (
            PredictionResult.objects.filter(analysis=analysis)
            .order_by("-created_at")
            .first()
        )
        if not prediction_result:
            return Response(
                {"error": "No prediction result was found for this analysis"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source, metrics = extract_llm_volume_metrics(prediction_result.prediction)
        if not metrics:
            return Response(
                {"error": "No relevant volumetric metrics were found for this analysis"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        prompt = build_volumetric_summary_prompt(analysis, source, metrics)
        llm_used = False
        llm_error = None
        summary_text = ""
        try:
            response = requests.post(
                f"{LOCAL_LLM_BASE_URL}/api/generate",
                json={
                    "model": LOCAL_LLM_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.2,
                        "num_predict": 2200,
                    },
                },
                timeout=LOCAL_LLM_TIMEOUT,
            )
            response.raise_for_status()
            data = response.json()
            summary_text = str(data.get("response", "")).strip()
            if not summary_text:
                raise ValueError("Local LLM returned an empty response")
            llm_used = True
            if not has_overall_risk_score(summary_text):
                try:
                    score_response = requests.post(
                        f"{LOCAL_LLM_BASE_URL}/api/generate",
                        json={
                            "model": LOCAL_LLM_MODEL,
                            "prompt": build_overall_risk_score_prompt(analysis, source, metrics),
                            "stream": False,
                            "options": {
                                "temperature": 0.1,
                                "num_predict": 350,
                            },
                        },
                        timeout=LOCAL_LLM_TIMEOUT,
                    )
                    score_response.raise_for_status()
                    score_data = score_response.json()
                    score_text = sanitize_llm_summary_text(
                        str(score_data.get("response", "")).strip()
                    )
                    if score_text:
                        summary_text = "\n\n".join([summary_text.rstrip(), score_text])
                except Exception as score_error:
                    logger.warning(
                        f"Local LLM overall risk score generation failed: {score_error}"
                    )
        except Exception as error:
            llm_error = str(error)
            logger.warning(f"Local LLM summary generation failed: {llm_error}")
            summary_text = build_fallback_volumetric_summary(source, metrics, llm_error, analysis)

        summary_text = postprocess_llm_summary_text(summary_text, analysis, source)

        summary, _ = Summary.objects.update_or_create(
            analysis=analysis,
            defaults={"summary": summary_text},
        )
        return Response(
            {
                "analysis_id": analysis.id,
                "summary": summary.summary,
                "message": "Summary generated",
                "llm_used": llm_used,
                "llm_model": LOCAL_LLM_MODEL,
                "llm_error": llm_error,
                "metric_source": source,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"], url_path="update-segmentation-result")
    def update_segmentation_result(self, request, pk=None):
        """
        Recompute volume analysis from the currently saved segmentation
        """
        try:
            analysis = self.get_object()
            mask_type = request.query_params.get("mask_type")
            logger.info(f"Got query params mask_type {mask_type}")

            if not mask_type:
                return Response(
                    {"error": "Mask type was not provided"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            seg_res = get_object_or_404(
                SegmentationResult.objects.all(),
                analysis=analysis,
                mask_type=mask_type,
            )

            if analysis.series.anatomy == Series.Anatomy.ABD:
                data = genericVolumeAnalysis(seg_res.segmentation_mask.path, "abdomen")
                logger.info(f"Updated abdomen data from segmentation {data}")
                return Response(data, status=status.HTTP_200_OK)

            elif analysis.series.anatomy == Series.Anatomy.THIGH:
                data = genericVolumeAnalysis(seg_res.segmentation_mask.path, "thigh")
                logger.info(f"Updated thigh data from segmentation {data}")
                return Response(data, status=status.HTTP_200_OK)

            return Response(
                {"error": "Unsupported anatomy type"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        except Http404 as err:
            logger.error(err)
            return Response(
                {"error": str(err)},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as err:
            import traceback

            logger.error(traceback.format_exc())
            return Response(
                {"error": str(err)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        

    @action(detail=True, methods=["post", "delete"], url_path="update-segmentation")
    def update_segmentation(self, request, pk=None):
        try:
            analysis = self.get_object()
            mask_type = request.query_params.get("mask_type")

            if not mask_type:
                return Response(
                    {"error": "Mask type was not provided"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if request.method == "POST":
                file = request.FILES.get("file")

                if not file:
                    return Response(
                        {"error": "No file was uploaded"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                seg_res = SegmentationResult.objects.filter(
                    analysis=analysis,
                    mask_type=mask_type,
                ).first()

                if not seg_res:
                    logger.info(f"Creating new segmentation for {mask_type}")
                    seg_res = SegmentationResult.objects.create(
                        analysis=analysis,
                        mask_type=mask_type,
                    )

                # Delete the old file if possible, but do not block the save
                # if the generated source mask is protected on disk.
                if seg_res.segmentation_mask:
                    try:
                        if seg_res.segmentation_mask.storage.exists(seg_res.segmentation_mask.name):
                            seg_res.segmentation_mask.delete(save=False)
                    except Exception as e:
                        logger.warning(f"Could not delete old segmentation file: {e}")

                # Save the new mask and point this SegmentationResult at it.
                # This is the app-level overwrite: the previous segmentation
                # is replaced even if old file cleanup failed.
                mask_stem = get_valid_filename(mask_type)
                save_filename = f"{mask_stem}_{uuid.uuid4().hex}.nii"
                try:
                    seg_res.segmentation_mask.save(save_filename, file, save=True)
                except PermissionError as err:
                    logger.error(f"Could not save segmentation file {save_filename}: {err}")
                    return Response(
                        {
                            "error": (
                                "Could not save segmentation mask. "
                                "The media directory is not writable by the backend."
                            )
                        },
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    )

                logger.info(f"Updated segmentation {seg_res.mask_type} for analysis {pk}")

                # 🔥🔥🔥 DIRECT VOLUME COMPUTATION (FIXED) 🔥🔥🔥
                # 🔥🔥🔥 FINAL FIXED VOLUME COMPUTATION 🔥🔥🔥
                import nibabel as nib
                import numpy as np

                parsed_summary = {}

                try:
                    nii = nib.load(seg_res.segmentation_mask.path)
                    data = nii.get_fdata().astype(np.int32)

                    voxel_dims = nii.header.get_zooms()
                    vol_per_voxel = voxel_dims[0] * voxel_dims[1] * voxel_dims[2] * 1e-3  # mm³ → cc

                    unique_labels = np.unique(data)
                    unique_labels = unique_labels[unique_labels != 0]

                    logger.info(f"🔥 UNIQUE LABELS: {unique_labels}")

                    mask_type_upper = mask_type.upper()

                    if "47CLASS" in mask_type_upper or "48CLASS" in mask_type_upper:
                        variant_key = "47class"
                        label_map = {
                            0: "background",
                            1: "bone",
                            2: "IMAT",
                            3: "SAT",
                            4: "gluteus_maximus_left",
                            5: "gluteus_maximus_right",
                            6: "tensor_fascia_latae_left",
                            7: "tensor_fascia_latae_right",
                            8: "iliacus_left",
                            9: "iliacus_right",
                            10: "ilium_left",
                            11: "ilium_right",
                            12: "pectineus_left",
                            13: "pectineus_right",
                            14: "obturator_internus_left",
                            15: "obturator_internus_right",
                            16: "obturator_externus_left",
                            17: "obturator_externus_right",
                            18: "gemelli_quadratus_femoris_left",
                            19: "gemelli_quadratus_femoris_right",
                            20: "vastus_lateralis_left",
                            21: "vastus_lateralis_right",
                            22: "vastus_intermedius_left",
                            23: "vastus_intermedius_right",
                            24: "vastus_medialis_left",
                            25: "vastus_medialis_right",
                            26: "rectus_femoris_left",
                            27: "rectus_femoris_right",
                            28: "sartorius_left",
                            29: "sartorius_right",
                            30: "gracilis_left",
                            31: "gracilis_right",
                            32: "semimembranosus_left",
                            33: "semimembranosus_right",
                            34: "semitendinosus_left",
                            35: "semitendinosus_right",
                            36: "biceps_femoris_long_head_left",
                            37: "biceps_femoris_long_head_right",
                            38: "biceps_femoris_short_head_left",
                            39: "biceps_femoris_short_head_right",
                            40: "adductor_magnus_left",
                            41: "adductor_magnus_right",
                            42: "adductor_longus_left",
                            43: "adductor_longus_right",
                            44: "adductor_brevis_left",
                            45: "adductor_brevis_right",
                            46: "groin_region",
                            47: "IMF",
                        }
                    elif "5CLASS" in mask_type_upper:
                        variant_key = "5class"
                        label_map = {
                            0: "background",
                            1: "bone",
                            2: "IMAT",
                            3: "SSAT",
                            4: "muscle",
                            5: "organ",
                        }
                    elif (
                        analysis.series.anatomy == Series.Anatomy.ABD
                        or "ABD" in mask_type_upper
                        or "ABDOMEN" in mask_type_upper
                    ):
                        variant_key = "abd_mr"
                        label_map = {
                            0: "background",
                            1: "SSAT",
                            2: "DSAT",
                            3: "VAT",
                        }
                    elif "4CLASS" in mask_type_upper:
                        return Response(
                            {"error": "4-class masks are no longer supported"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    else:
                        variant_key = None
                        label_map = {}

                    tissue_totals = {}

                    # 🔥 MAIN TABLE GROUPING
                    grouped = {
                        "IMAT": 0,
                        "Bone": 0,
                    }
                    if variant_key == "47class":
                        grouped.update({"SAT": 0, "Organ": 0})
                    elif variant_key == "5class":
                        grouped.update({"SSAT": 0, "Muscle": 0, "Organ": 0})
                    elif variant_key == "abd_mr":
                        grouped = {"SSAT": 0, "DSAT": 0, "VAT": 0}
                    else:
                        grouped.update({"SSAT": 0, "Muscle": 0})

                    for label in unique_labels:
                        label = int(label)

                        voxel_count = np.sum(data == label)
                        volume = float(voxel_count * vol_per_voxel)

                        raw_name = label_map.get(label, f"Tissue_{label}")

                        # 🔥 FORMAT NAME FOR FRONTEND
                        if raw_name.upper() in ["SAT", "SSAT", "DSAT", "VAT", "IMAT"]:
                            name = raw_name.upper()
                        elif raw_name.lower() == "organ":
                            name = "Organ"
                        elif raw_name.lower() == "muscle":
                            name = "Muscle"
                        else:
                            name = raw_name.replace("_", " ").title()

                        # 🔥 GROUP MAIN TABLE
                        if raw_name in ["SAT", "SSAT", "DSAT", "VAT"]:
                            grouped[raw_name] += volume
                        elif raw_name == "IMAT":
                            grouped["IMAT"] += volume
                        elif raw_name == "muscle":
                            grouped["Muscle"] += volume
                        elif raw_name == "organ":
                            if "Organ" in grouped:
                                grouped["Organ"] += volume
                        elif (
                            "bone" in raw_name
                            or "femur" in raw_name
                            or "ilium" in raw_name
                        ):
                            grouped["Bone"] += volume

                        # 🔥 STORE ALL (for muscle table)
                        tissue_totals[name] = tissue_totals.get(name, 0) + volume

                    # 🔥 ADD GROUPED RESULTS (MAIN TABLE)
                    tissue_totals.update(grouped)

                    total_volume = sum(tissue_totals.values())

                    tissue_percents = {
                        f"{k}_%": (v / total_volume * 100) if total_volume > 0 else 0
                        for k, v in tissue_totals.items()
                    }

                    parsed_summary = {
                        **{f"{k}_Volume": round(v, 2) for k, v in tissue_totals.items()},
                        **{k: round(v, 2) for k, v in tissue_percents.items()},
                        "Total_Volume": round(total_volume, 2),
                    }

                    logger.info(f"✅ FINAL SUMMARY: {parsed_summary}")

                except Exception as e:
                    logger.error(f"Volume computation failed: {e}")

                # 🔥 PER-SLICE COMPUTATION
                per_slice_data = []

                try:
                    nii_for_slices = nib.load(seg_res.segmentation_mask.path)
                    data_for_slices = nii_for_slices.get_fdata().astype(np.int32)
                    voxel_dims = nii_for_slices.header.get_zooms()
                    pixel_area = voxel_dims[0] * voxel_dims[1]           # mm²
                    vol_per_voxel = pixel_area * voxel_dims[2] * 1e-3    # mm³ → cc

                    num_slices = data_for_slices.shape[2]

                    for i in range(num_slices):
                        slice_2D = data_for_slices[:, :, i]
                        unique_in_slice, counts = np.unique(slice_2D, return_counts=True)

                        for label, count in zip(unique_in_slice, counts):
                            label = int(label)
                            if label == 0:
                                continue  # skip background

                            raw_name = label_map.get(label, f"Tissue_{label}")

                            if raw_name.upper() in ["SAT", "SSAT", "DSAT", "VAT", "IMAT"]:
                                name = raw_name.upper()
                            elif raw_name.lower() == "organ":
                                name = "Organ"
                            elif raw_name.lower() == "muscle":
                                name = "Muscle"
                            else:
                                name = raw_name.replace("_", " ").title()

                            per_slice_data.append({
                                "Slice": i + 1,
                                "Label": name,
                                "Area_mm2": round(float(count * pixel_area), 2),
                                "Volume_cc": round(float(count * vol_per_voxel), 3),
                            })

                    logger.info(f"✅ Per-slice computation done: {len(per_slice_data)} rows")

                except Exception as e:
                    logger.error(f"Per-slice computation failed: {e}")

                # 🔥 UPDATE PREDICTIONS
                try:
                    prediction_obj = PredictionResult.objects.filter(
                        analysis=analysis
                    ).first()

                    if prediction_obj:
                        prediction = prediction_obj.prediction or {}
                        if variant_key:
                            # Store both summary AND per_slice so frontend can read it back
                            if "volume_csv" not in prediction:
                                prediction["volume_csv"] = {}

                            prediction["volume_csv"][variant_key] = {
                                "summary": parsed_summary,
                                "per_slice": per_slice_data,
                            }
                            # Keep legacy top-level key for backwards compat
                            prediction[variant_key] = [parsed_summary]

                        prediction_obj.prediction = prediction
                        prediction_obj.save()

                        logger.info("✅ Prediction updated with direct computation")

                except Exception as e:
                    logger.error(f"Prediction update failed: {e}")

                return Response(
                    {
                        "segmentation": SegmentationResultSerializer(
                            seg_res,
                            context={"request": self.request},
                        ).data,
                        "volume_csv": {
                            mask_type: {
                                "summary": parsed_summary,
                                "per_slice": per_slice_data,   # ← was {}, now populated
                            }
                        },
                    },
                    status=status.HTTP_200_OK,
                )

            if request.method == "DELETE":
                seg_res = get_object_or_404(
                    SegmentationResult.objects.all(),
                    analysis=analysis,
                    mask_type=mask_type,
                )
                seg_res.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)

        except Http404:
            return Response(
                {"error": f"Analysis {pk} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    @action(detail=False, methods=["post"])
    def bound_mask(self, request):
        """
        Bound the current mask by a given upper and lower bound
        """
        try:
            lower = request.data.get("lower", None)
            upper = request.data.get("upper", None)
            mask = request.FILES.get("mask")

            lower = int(lower) - 1
            upper = int(upper)

            f = b""

            for chunk in mask.chunks():
                f += chunk
            decompressed_bytes = gzip.decompress(f)

            mask_nii = Nifti1Image.from_bytes(decompressed_bytes)
            mask = mask_nii.get_fdata()
            mask[:, :, :lower] = 0
            mask[:, :, upper:] = 0
            mask = mask.astype(uint8)

            bound_mask = Nifti1Image(mask, mask_nii.affine)

            file_data = bound_mask.to_bytes()
            file_data = base64.b64encode(file_data).decode()

            return Response({"file_data": file_data}, status=status.HTTP_200_OK)
        except Http404 as err:
            logger.error(err)
            return Response({"error": str(err)}, status=status.HTTP_404_NOT_FOUND)





class ReportViewSet(ModelViewSet):
    queryset = Report.objects.all()
    serializer_class = ReportSerializer
    lookup_value_regex = "[^/]+"
    authentication_classes = [TokenAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            self.queryset.all().filter(owner=self.request.user).order_by("-created_at")
        )

    def list(self, request):
        """
        List all generated reports from GET request
        """
        queryset = self.get_queryset()
        study_id = request.query_params.get("study_id")

        if study_id:
            queryset = queryset.filter(study=study_id)

        serializer = ReportSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None, *args, **kwargs):
        """
        Retrieve detail of report from GET request
        """
        try:
            report = get_object_or_404(self.get_queryset(), pk=pk)
            return Response(
                (self.get_serializer(report)).data, status=status.HTTP_200_OK
            )
        except Http404:
            logger.error(f"Report {pk} not found")
            return Response(
                {"error": f"Report {pk} not found"}, status=status.HTTP_404_NOT_FOUND
            )

    def destroy(self, request, pk=None, *args, **kwargs):
        """
        Delete a given report from DELETE request
        """
        try:
            report = get_object_or_404(self.get_queryset(), pk=pk)
            report.delete()
            logger.info(f"Deleted report {pk}")
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Http404:
            logger.error(f"Report {pk} not found")
            return Response(
                {"error": f"Report {pk} not found"}, status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=False, methods=["post"], url_path="body-analysis")
    def body_analysis(self, request, *args, **kwargs):
        """
        Create and store a body-analysis PDF report from frontend-captured views.
        """
        payload = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        patient_info = payload.get("patient_info") or []
        sections = payload.get("sections") or []

        if not patient_info or not sections:
            return Response(
                {"error": "patient_info and sections are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload["generated_by"] = request.user.get_username()

            if not payload.get("comments") and payload.get("analysis_id"):
                analysis = Analysis.objects.filter(
                    id=payload.get("analysis_id"),
                    owner=request.user,
                ).first()
                if analysis:
                    comment = Comment.objects.filter(analysis=analysis).first()
                    payload["comments"] = AnalysisViewSet.parse_comment_thread(
                        comment.comment if comment else ""
                    )

            if not payload.get("summary") and payload.get("analysis_id"):
                analysis = Analysis.objects.filter(
                    id=payload.get("analysis_id"),
                    owner=request.user,
                ).first()
                if analysis:
                    summary = Summary.objects.filter(analysis=analysis).first()
                    payload["summary"] = summary.summary if summary else ""

            pdf_bytes = build_body_analysis_pdf(payload)
            report_id = payload.get("analysis_id") or str(uuid.uuid4())
            patient_id = payload.get("patient_id", "")
            patient_name = payload.get("patient_name", "")
            study = payload.get("study", "")
            series = payload.get("series") or []
            series_key = json.dumps(series)
            filename = f"body-analysis-report-{datetime.now().strftime('%Y%m%d-%H%M%S')}.pdf"

            for existing_report in Report.objects.filter(
                owner=request.user,
                id=report_id,
            ):
                existing_report.delete()

            report = Report(
                id=report_id,
                status=Report.Status.COMPLETED,
                study=study,
                patient_id=patient_id,
                patient_name=patient_name,
                series=series_key,
                owner=request.user,
            )
            report.file.save(filename, ContentFile(pdf_bytes), save=False)
            report.save()
            return Response(
                ReportSerializer(report, context={"request": request}).data,
                status=status.HTTP_201_CREATED,
            )
        except Exception as error:
            logger.exception("Failed to create body-analysis report")
            return Response(
                {"error": str(error)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None, *args, **kwargs):
        """
        Serve a given report as a FileResponse from GET request
        """
        try:
            report = self.get_object()
            stream = open(report.file.path, "rb")
            response = FileResponse(stream, content_type="application/pdf")
            response["Content-Disposition"] = (
                f'inline; filename="{os.path.basename(report.file.name)}"'
            )
            return response
        except Http404:
            logger.error(f"Report {pk} not found")
            return Response(
                {"error": f"Report {pk} not found"}, status=status.HTTP_404_NOT_FOUND
            )


@api_view(["GET"])
@authentication_classes([TokenAuthentication])
@permission_classes([permissions.IsAuthenticated])
def get_job_status(request):
    """
    Retrieve the status of a background job in the default queue from RQ
    """
    try:
        job_id = request.query_params.get("job_id")
        if not (job_id):
            return Response(
                {"error": "Job id was not provided"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        conn = get_connection("default")
        job = Job.fetch(job_id, connection=conn)
        job_status = job.get_status()
        return Response(
            {
                "id": job.id,
                "status": job_status,
                "meta": job.meta,
                "result": job.result,
            }
        )
    except NoSuchJobError as e:
        logger.error(
            f"Error fetching job {job_id}: {e}",
            stack_info=True,
            exc_info=True,
        )
        return Response(
            {"error": f"Job id {job_id} not found"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
