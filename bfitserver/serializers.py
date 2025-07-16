import logging
import gzip
import base64
import numpy as np
from pathlib import Path
from rest_framework import serializers
from .models.user import User
from .models.dicomweb import Study, Series, Instance, PACSSeries
from .models.analysis import (
    Analysis,
    PredictionResult,
    SegmentationResult,
    AnalysisArtifact,
    Comment,
    Report,
)
from nibabel import Nifti1Image

logger = logging.getLogger("apolloserver")


# User
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        user = User(username=validated_data["username"])
        user.set_password(validated_data["password"])
        user.save()
        return user


class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField()


# Dicomweb
class StudySerializer(serializers.ModelSerializer):
    class Meta:
        model = Study
        fields = "__all__"


class SeriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = Series
        fields = ["series_id", "modality", "num_frames", "created_at"]


class InstanceSerializer(serializers.ModelSerializer):
    base64_string = serializers.SerializerMethodField()

    class Meta:
        model = Instance
        fields = ["instance_id", "metadata", "frame_number", "file", "base64_string"]

    def get_base64_string(self, obj):
        if self.context.get("exclude_base64"):
            return None
        with open(obj.file.path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")


class PACSSeriesSerializer(serializers.ModelSerializer):
    study_id = serializers.ReadOnlyField(source="study.study_id")
    patient_id = serializers.ReadOnlyField(source="study.patient_id")
    patient_name = serializers.ReadOnlyField(source="study.patient_name")

    class Meta:
        model = PACSSeries
        fields = "__all__"


# Analysis
class AnalysisSerializer(serializers.ModelSerializer):
    series = serializers.ReadOnlyField(source="series.series_id")
    study = serializers.ReadOnlyField(source="series.study.study_id")
    patient_name = serializers.ReadOnlyField(source="series.study.patient_name")
    patient_id = serializers.ReadOnlyField(source="series.study.patient_id")

    class Meta:
        model = Analysis
        fields = [
            "id",
            "series",
            "study",
            "patient_name",
            "patient_id",
            "queue",
            "status",
            "created_at",
            "ended_at",
        ]


class PredictionResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = PredictionResult
        fields = ["prediction", "created_at", "updated_at"]


class SegmentationResultSerializer(serializers.ModelSerializer):
    base64_string = serializers.SerializerMethodField()

    class Meta:
        model = SegmentationResult
        fields = [
            "segmentation_mask",
            "mask_type",
            "created_at",
            "updated_at",
            "is_custom",
            "prediction_overrides",
            "base64_string",
        ]

    def get_base64_string(self, obj):
        fp = obj.segmentation_mask.path
        ext = Path(fp).suffix
        if ext == ".gz":
            with gzip.open(fp, "rb") as f:
                decompressed_bytes = f.read()
            nii = Nifti1Image.from_bytes(decompressed_bytes)
            return base64.b64encode(nii.to_bytes()).decode()

        with open(fp, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")


class AnalysisArtifactSerializer(serializers.ModelSerializer):
    artifact = serializers.SerializerMethodField()

    class Meta:
        model = AnalysisArtifact
        fields = ["artifact", "artifact_type", "created_at", "updated_at"]

    def get_artifact(self, obj):
        with open(obj.artifact.path, "rb") as f:
            ext = Path(f.name).suffix
            if ext == ".txt":
                # return numpy arrays as JSON serializable lists
                return np.loadtxt(f).tolist()
            if ext == ".png":
                # return base64 encoded image with data header
                return f"data:image/png;base64,{base64.b64encode(f.read()).decode('utf-8')}"
            if ext == ".gz":
                logger.info(f"Decompressing {f.name}")
                decompressed_bytes = gzip.decompress(f.read())
                nii = Nifti1Image.from_bytes(decompressed_bytes)
                return base64.b64encode(nii.to_bytes()).decode()

            return base64.b64encode(f.read()).decode("utf-8")


class ReportSerializer(serializers.ModelSerializer):
    study = serializers.ReadOnlyField(source="study.study_id")
    patient_id = serializers.ReadOnlyField(source="study.patient_id")
    patient_name = serializers.ReadOnlyField(source="study.patient_name")

    class Meta:
        model = Report
        fields = [
            "id",
            "status",
            "file",
            "created_at",
            "study",
            "patient_id",
            "patient_name",
            "series", 
        ]
