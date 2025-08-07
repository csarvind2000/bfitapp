import os
import base64
import logging
import gzip
import json
import tempfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from io import BytesIO
from django_rq.jobs import Job
from rq.command import send_stop_job_command
from rq.exceptions import InvalidJobOperation, NoSuchJobError
from django_rq import get_connection
from django.core.files import File
from django.http import Http404, FileResponse
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
from .utils.dicom_helpers import is_dicom_image_series, parse_protocol_data
from .utils.analysis import abdomen, thigh, mmap

logger = logging.getLogger("bfitserver")


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
            {"user": serializer.data["username"], "token": token.key},
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
            Token.objects.get(key=token)
            return Response(status=status.HTTP_200_OK)
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

        def is_matched_series(protocol_name, scan_options, pixel_bw):
            if protocol_name is None or isinstance(scan_options, list):
                return False, None

            if (
                protocol_name
                == "t1+AF8-vibe+AF8-tra+AF8-p2+AF8-bh+AF8-320+AF8-DIXON Thigh"
            ):
                if scan_options == "SAT2" and float(pixel_bw) == float(504):
                    return True, "thigh"

            if protocol_name == "t1+AF8-vibe+AF8-tra+AF8-p2+AF8-bh+AF8-dixon abd":
                if scan_options == "DIXF" and float(pixel_bw) == float(849):
                    return True, "abd"

            return False, None

        with tempfile.TemporaryDirectory() as tmpdir:
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
                    protocol_name = None
                    csa_dict = csareader.get_csa_header(ds, csa_type="series")
                    mrphoenixprotocol = csa_dict["tags"].get("MrPhoenixProtocol")

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
                is_matched, anatomy = is_matched_series(
                    protocol_name, scan_options, pixel_bw
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

        return Response(
            sorted_result,
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
        """
        Delete a given Study Instance UID from DELETE request
        """
        try:
            study = self.get_object()
            series = Series.objects.filter(study=study, owner=self.request.user)
            processing_analysis = Analysis.objects.filter(
                status=Analysis.Status.PROCESSING, series__in=series
            )
            if processing_analysis.exists():
                return Response(
                    {
                        "error": f"Study {study_id} has analysis jobs in processing status"
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
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

        serializer = AnalysisSerializer(queryset, many=True)
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

            # Enqueue analysis job to RQ queue
            if serie.anatomy == Series.Anatomy.ABD:
                # TODO
                job = abdomen.delay(dicoms=dicoms, modality=serie.modality)
                abd_analysis = Analysis.objects.create(
                    pk=job.id,
                    queue=Analysis.Queue.ABDOMEN,
                    series=serie,
                    status=Analysis.Status.PROCESSING,
                    owner=request.user,
                )
                logger.info(f"Enqueued abdomen analysis job id {job.id}")
                jobs.append(abd_analysis)
            elif serie.anatomy == Series.Anatomy.THIGH:
                # TODO
                job = thigh.delay(dicoms=dicoms, modality=serie.modality)
                thigh_analysis = Analysis.objects.create(
                    pk=job.id,
                    queue=Analysis.Queue.THIGH,
                    series=serie,
                    status=Analysis.Status.PROCESSING,
                    owner=request.user,
                )
                logger.info(f"Enqueued thigh analysis job id {job.id}")
                jobs.append(thigh_analysis)
            else:
                # TODO
                job = mmap.delay(dicoms=dicoms)
                mmap_analysis = Analysis.objects.create(
                    pk=job.id,
                    queue=Analysis.Queue.MMAP,
                    series=serie,
                    status=Analysis.Status.PROCESSING,
                    owner=request.user,
                )
                logger.info(f"Enqueued mmap analysis job id {job.id}")
                jobs.append(mmap_analysis)

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
                f'attachment; filename="{report.file.name}"'
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
