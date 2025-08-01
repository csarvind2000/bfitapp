from django.db import models
from .dicomweb import Study, Series
from .user import User

# Create your models here.


class Analysis(models.Model):
    class Queue(models.TextChoices):
        ABDOMEN = "abd", "ABD"
        THIGH   = "thigh", "THIGH"
        MMAP    = "mmap", "MMAP"

    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        FAILED = "failed", "Failed"
        COMPLETED = "completed", "Completed"
        CANCELED = "canceled", "Canceled"

    id = models.CharField(max_length=36, primary_key=True)
    queue = models.CharField(max_length=20, choices=Queue.choices)
    series = models.ForeignKey(Series, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=Status.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, related_name="analysis", on_delete=models.CASCADE)

    class Meta:
        get_latest_by = "ended_at"
        db_table = "Analysis"
        constraints = [
            models.UniqueConstraint(fields=["id", "owner"], name="analysis_owner_uniq")
        ]


class PredictionResult(models.Model):
    analysis = models.ForeignKey(
        Analysis, related_name="prediction_result", on_delete=models.CASCADE
    )
    prediction = models.JSONField(editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "Prediction"


def get_analysis_result_instance_upload_path(instance, filename):
    """

    Args:
        instance : Model instance where the function is called
        filename : Filename of object

    Returns:
        str: Relative path where object is stored
    """
    return (
        f"{instance.analysis.owner.username}/analysis/"
        f"{instance.analysis.id}/{filename}"
    )


class SegmentationResult(models.Model):
    analysis = models.ForeignKey(
        Analysis, related_name="segmentation_result", on_delete=models.CASCADE
    )
    segmentation_mask = models.FileField(
        max_length=255,
        upload_to=get_analysis_result_instance_upload_path
    )
    mask_type = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def delete(self, *args, **kwargs):
        if self.segmentation_mask.storage.exists(self.segmentation_mask.name):
            self.segmentation_mask.delete(save=False)
        super().delete(*args, **kwargs)

    class Meta:
        db_table = "Segmentation"


class AnalysisArtifact(models.Model):
    analysis = models.ForeignKey(
        Analysis, related_name="analysis_artifact", on_delete=models.CASCADE
    )
    artifact = models.FileField(
        max_length=255,
        upload_to=get_analysis_result_instance_upload_path,
        editable=False,
    )
    artifact_type = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def delete(self, *args, **kwargs):
        if self.artifact.storage.exists(self.artifact.name):
            self.artifact.delete(save=False)
        super().delete(*args, **kwargs)

    class Meta:
        db_table = "Artifacts"


class Comment(models.Model):
    id = models.AutoField(primary_key=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    analysis = models.OneToOneField(Analysis, on_delete=models.CASCADE)

    class Meta:
        get_latest_by = "modified_at"
        db_table = "Comment"


class Summary(models.Model):
    id = models.AutoField(primary_key=True)
    summary = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    modified_at = models.DateTimeField(auto_now=True)
    analysis = models.OneToOneField(Analysis, on_delete=models.CASCADE)

    class Meta:
        get_latest_by = "modified_at"
        db_table = "Summary"


def get_report_instance_upload_path(instance, filename):
    """

    Args:
        instance : Model instance where the function is called
        filename : Filename of object

    Returns:
        str: Relative path where object is stored
    """
    return f"{instance.owner.username}/reports/" f"{instance.id}/{filename}"


class Report(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        FAILED = "failed", "Failed"
        COMPLETED = "completed", "Completed"
        CANCELED = "canceled", "Canceled"

    id = models.CharField(max_length=36, primary_key=True)
    study = models.CharField(max_length=64, default="", blank=True)
    patient_id = models.CharField(max_length=255, default="", blank=True)
    patient_name = models.CharField(max_length=255, default="", blank=True)
    series = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices)
    file = models.FileField(
        max_length=255, upload_to=get_report_instance_upload_path, blank=True
    )
    created_at = models.DateTimeField(auto_now=True)
    owner = models.ForeignKey(User, related_name="reports", on_delete=models.CASCADE)

    def delete(self, *args, **kwargs):
        if self.file.storage.exists(self.file.name):
            self.file.delete(save=False)
        super().delete(*args, **kwargs)

    class Meta:
        db_table = "Report"
