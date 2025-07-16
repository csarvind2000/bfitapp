from django.db import models
from pathlib import Path

from .dicomweb import Study, Series
from .user import User


# ----------------------------------------------------------------------
# Analysis main model
# ----------------------------------------------------------------------
class Analysis(models.Model):
    class Queue(models.TextChoices):
        ABDOMEN = "abd", "ABD"
        THIGH   = "thigh", "THIGH"
        MMAP    = "mmap", "MMAP"

    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        FAILED     = "failed",     "Failed"
        COMPLETED  = "completed",  "Completed"
        CANCELED   = "canceled",   "Canceled"

    id           = models.CharField(max_length=128, primary_key=True)
    queue        = models.CharField(max_length=20, choices=Queue.choices)
    series       = models.ForeignKey(Series, on_delete=models.CASCADE)
    status       = models.CharField(max_length=20, choices=Status.choices)
    created_at   = models.DateTimeField(auto_now_add=True)
    ended_at     = models.DateTimeField(auto_now=True)
    model_params = models.JSONField(null=True, blank=True)
    owner        = models.ForeignKey(
        User, related_name="analysis", on_delete=models.CASCADE
    )

    class Meta:
        get_latest_by = "ended_at"
        constraints   = [
            models.UniqueConstraint(
                fields=["id", "owner"], name="analysis_owner_uniq"
            )
        ]


# ----------------------------------------------------------------------
# Prediction Result
# ----------------------------------------------------------------------
class PredictionResult(models.Model):
    analysis   = models.ForeignKey(
        Analysis, related_name="prediction_result", on_delete=models.CASCADE
    )
    prediction = models.JSONField(editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# ----------------------------------------------------------------------
# Helpers for upload paths
# ----------------------------------------------------------------------
def analysis_upload_path(instance, filename):
    return (
        f"{instance.analysis.owner.username}/analysis/"
        f"{instance.analysis.id}/{filename}"
    )


def report_upload_path(instance, filename):
    return f"{instance.owner.username}/reports/{instance.id}/{filename}"


# ----------------------------------------------------------------------
# Segmentation Result
# ----------------------------------------------------------------------
class SegmentationResult(models.Model):
    analysis            = models.ForeignKey(
        Analysis, related_name="segmentation_result", on_delete=models.CASCADE
    )
    segmentation_mask   = models.FileField(
        max_length=255, upload_to=analysis_upload_path
    )
    mask_type           = models.TextField()
    is_custom           = models.BooleanField(default=False)
    prediction_overrides = models.JSONField(null=True, blank=True)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    def delete(self, *args, **kwargs):
        if self.segmentation_mask.storage.exists(self.segmentation_mask.name):
            self.segmentation_mask.delete(save=False)
        super().delete(*args, **kwargs)


# ----------------------------------------------------------------------
# Analysis artefacts (PNG, CSV, etc.)
# ----------------------------------------------------------------------
class AnalysisArtifact(models.Model):
    analysis      = models.ForeignKey(
        Analysis, related_name="analysis_artifact", on_delete=models.CASCADE
    )
    artifact      = models.FileField(
        max_length=255, upload_to=analysis_upload_path, editable=False
    )
    artifact_type = models.TextField()
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    def delete(self, *args, **kwargs):
        if self.artifact.storage.exists(self.artifact.name):
            self.artifact.delete(save=False)
        super().delete(*args, **kwargs)


# ----------------------------------------------------------------------
# Free-text comment & summary
# ----------------------------------------------------------------------
class Comment(models.Model):
    analysis    = models.OneToOneField(Analysis, on_delete=models.CASCADE)
    comment     = models.TextField(blank=True)
    modified_at = models.DateTimeField(auto_now=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        get_latest_by = "modified_at"


class Summary(models.Model):
    analysis    = models.OneToOneField(Analysis, on_delete=models.CASCADE)
    summary     = models.TextField(blank=True)
    modified_at = models.DateTimeField(auto_now=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        get_latest_by = "modified_at"


# ----------------------------------------------------------------------
# PDF / doc report
# ----------------------------------------------------------------------
class Report(models.Model):
    class Status(models.TextChoices):
        PROCESSING = "processing", "Processing"
        FAILED     = "failed",     "Failed"
        COMPLETED  = "completed",  "Completed"
        CANCELED   = "canceled",   "Canceled"

    id        = models.CharField(max_length=128, primary_key=True)
    study     = models.ForeignKey(Study, on_delete=models.DO_NOTHING)
    series    = models.JSONField(default=list, blank=True)
    status    = models.CharField(max_length=20, choices=Status.choices)
    file      = models.FileField(max_length=255, upload_to=report_upload_path, blank=True)
    created_at = models.DateTimeField(auto_now=True)
    owner     = models.ForeignKey(User, related_name="reports", on_delete=models.CASCADE)

    def delete(self, *args, **kwargs):
        if self.file.storage.exists(self.file.name):
            self.file.delete(save=False)
        super().delete(*args, **kwargs)
