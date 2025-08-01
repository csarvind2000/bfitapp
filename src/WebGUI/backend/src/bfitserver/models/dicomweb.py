from django.db import models
from .user import User

# Models for Dicomweb implementation


# class Case(models.Model):
#     patient_id = models.TextField(db_column='Patient ID', blank=True, null=True)
#     patient_name = models.TextField(db_column='Patient Name', blank=True, null=True)
#     name = models.TextField(db_column='Name', blank=True, null=True)
#     created_at = models.DateTimeField(auto_now_add=True)

#     class Meta:
#         db_table = 'Case'


class Study(models.Model):
    study_id = models.CharField(max_length=64, db_column="Study Instance UID")
    # case = models.ForeignKey(Case, on_delete=models.CASCADE)
    patient_id = models.TextField(db_column="Patient ID", blank=True, null=True)
    patient_name = models.TextField(db_column="Patient Name", blank=True, null=True)
    study_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    owner = models.ForeignKey(User, related_name="study", on_delete=models.CASCADE)

    class Meta:
        db_table = "Study"
        constraints = [
            models.UniqueConstraint(
                fields=["study_id", "owner"], name="study_id_owner_uniq"
            )
        ]


class Series(models.Model):
    class Modality(models.TextChoices):
        CT = "ct", "CT"
        MR = "mr", "MR"

    class Anatomy(models.TextChoices):
        ABD = "abd", "ABD"
        THIGH = "thigh", "THIGH"

    series_id = models.CharField(max_length=64, db_column="Series Instance UID")
    study = models.ForeignKey(Study, on_delete=models.CASCADE)
    modality = models.CharField(max_length=10, choices=Modality.choices)
    anatomy = models.CharField(max_length=10, choices=Anatomy.choices)
    num_frames = models.IntegerField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    owner = models.ForeignKey(User, related_name="series", on_delete=models.CASCADE)

    class Meta:
        db_table = "Series"
        constraints = [
            models.UniqueConstraint(
                fields=["series_id", "owner"], name="series_id_owner_uniq"
            )
        ]


def get_dicomweb_instance_upload_path(instance, filename):
    """

    Args:
        instance : Instance model object
        filename : Filename of uploaded Dicom file object

    Returns:
        str: Relative path where uploaded Dicom file is stored
    """
    return (
        f"{instance.owner.username}/studies/"
        f"{instance.series.study.study_id}/series/"
        f"{instance.series.series_id}/instances/{filename}"
    )


class Instance(models.Model):
    instance_id = models.CharField(max_length=64, db_column="SOP Instancce UID")
    series = models.ForeignKey(Series, on_delete=models.CASCADE)
    metadata = models.JSONField(default=dict)
    frame_number = models.IntegerField(null=True)
    file = models.FileField(max_length=255, upload_to=get_dicomweb_instance_upload_path)
    owner = models.ForeignKey(User, related_name="instance", on_delete=models.CASCADE)

    def delete(self, *args, **kwargs):
        if self.file.storage.exists(self.file.name):
            self.file.delete(save=False)
        super().delete(*args, **kwargs)

    class Meta:
        db_table = "Instance"
        constraints = [
            models.UniqueConstraint(
                fields=["instance_id", "owner"], name="instance_id_owner_uniq"
            )
        ]


class PACSStudy(models.Model):
    study_id = models.CharField(primary_key=True, max_length=64, db_column="Study Instance UID")
    patient_id = models.TextField(db_column="Patient ID", blank=True, null=True)
    patient_name = models.TextField(db_column="Patient Name", blank=True, null=True)
    study_date = models.DateField(null=True, blank=True)


class PACSSeries(models.Model):
    class Modality(models.TextChoices):
        CT = "ct", "CT"
        MR = "mr", "MR"

    class Anatomy(models.TextChoices):
        ABD = "abd", "ABD"
        THIGH = "thigh", "THIGH"

    series_id = models.CharField(primary_key=True, max_length=64, db_column="Series Instance UID")
    study = models.ForeignKey(PACSStudy, on_delete=models.CASCADE)
    modality = models.CharField(max_length=10, choices=Modality.choices)
    anatomy = models.CharField(max_length=10, choices=Anatomy.choices)
    num_frames = models.IntegerField(null=True)


class PACSInstance(models.Model):
    instance_id = models.CharField(primary_key=True, max_length=64, db_column="SOP Instancce UID")
    series = models.ForeignKey(PACSSeries, on_delete=models.CASCADE)
    location = models.FilePathField(path="/pacs-dicom", max_length=255)
