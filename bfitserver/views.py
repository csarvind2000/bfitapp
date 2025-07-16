"""
Views for BFIT demo – upload, list, and (dummy) analysis API.
Replace the dummy analysis stubs with real RQ jobs when available.
"""
from __future__ import annotations
import json, logging, shutil, threading, uuid
from pathlib import Path

from django.conf           import settings
from django.shortcuts      import render, redirect, get_object_or_404
from django.urls           import reverse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators      import method_decorator

# ─── models & serializers ───────────────────────────────────────────
from .models.user          import User
from .models.dicomweb      import Study, Series, Instance
from .models.analysis      import Analysis
from .serializers          import AnalysisSerializer

# ─── DICOM sorting helper ───────────────────────────────────────────
from dicom_sorter          import DicomToNiftiSorter   # ← your converter


# from .utils.analysis import abd, thigh, mmap

# ─── DRF & RQ bits (analysis API) ───────────────────────────────────
from rest_framework.viewsets      import ModelViewSet
from rest_framework.response      import Response
from rest_framework.decorators    import action
from rest_framework               import status

from django_rq                    import get_connection
from rq.job                       import Job
from rq.command                   import send_stop_job_command
from rq.exceptions                import NoSuchJobError, InvalidJobOperation

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
#  Import analysis *tasks* – may be real RQ tasks or local stubs
# -------------------------------------------------------------------
try:
    from .tasks import (
        segmentation_abdomen,
        segmentation_thigh,
        segmentation_mmap,
    )
except ModuleNotFoundError:
    # fallback to built-in stubs if real tasks missing
    from . import tasks as _stub_tasks
    segmentation_abdomen = _stub_tasks.segmentation_abdomen
    segmentation_thigh   = _stub_tasks.segmentation_thigh
    segmentation_mmap    = _stub_tasks.segmentation_mmap
    logger.warning("Real RQ tasks not found – using local stubs")

# ════════════════════════════════════════════════════════════════════
#  1. Landing page ---------------------------------------------------
# ════════════════════════════════════════════════════════════════════
def home(request):
    """Show every series currently stored in DB (for demo only)."""
    user = User.objects.filter(username="admin").first()
    series_qs = (
        Series.objects.filter(owner=user)
        .select_related("study")
        .order_by("-created_at")
    )
    entries = [
        dict(study_id=s.study.study_id, series_id=s.series_id, modality=s.modality)
        for s in series_qs
    ]
    return render(request, "uploader/success.html", {"entries": entries})


# ════════════════════════════════════════════════════════════════════
#  2. Upload DICOM (GET form / POST handler) -------------------------
# ════════════════════════════════════════════════════════════════════
@csrf_exempt                     # ► plain <form> POST – easy for demo
def upload_dicom_folder(request):
    if request.method != "POST":
        return render(request, "uploader/upload.html")

    upload_root = Path(settings.BASE_DIR) / "uploaded_dicom"
    upload_root.mkdir(exist_ok=True)

    # write the uploaded files to disk
    for f in request.FILES.getlist("dicom_files"):
        dst = upload_root / f.name.replace("\\", "/").replace(":", "_")
        dst.parent.mkdir(parents=True, exist_ok=True)
        with dst.open("wb+") as out:
            for chunk in f.chunks():
                out.write(chunk)

    # run the sorter
    sorter  = DicomToNiftiSorter(
        input_root=str(upload_root),
        config_path=str(Path(settings.BASE_DIR) / "dicom_config.json"),
        user="admin",
    )
    matches = sorter.run()                # list[dict]

    # store matched series in DB
    user = User.objects.get(username="admin")
    for m in matches:
        if not m.get("is_matched"):
            continue                      # skip unmatched series
        study, _  = Study.objects.get_or_create(
            study_id=m["study_id"],
            owner=user,
            defaults=dict(patient_id="P123", patient_name="Anonymous"),
        )
        series, _ = Series.objects.get_or_create(
            series_id=m["series_id"], owner=user, study=study,
            defaults=dict(modality=m["modality"]),
        )
        Instance.objects.get_or_create(
            instance_id=m["instance_id"], owner=user, series=series,
            defaults=dict(frame_number=1, metadata={}, file=m["file_path"]),
        )

    shutil.rmtree(upload_root, ignore_errors=True)
    return redirect(reverse("home"))      # back to list page


# ════════════════════════════════════════════════════════════════════
#  3. Analysis API (dummy / dev) -------------------------------------
# ════════════════════════════════════════════════════════════════════

# -- helper: run a plain function in a background thread -------------
def _run_stub(fn, *a, **kw) -> str:
    job_id = f"local-{uuid.uuid4()}"
    t = threading.Thread(target=fn, args=a, kwargs=kw, daemon=True)
    t.start()
    logger.info("Started stub %s in thread %s", job_id, t.name)
    return job_id


@method_decorator(csrf_exempt, name="dispatch")
class AnalysisViewSet(ModelViewSet):
    queryset         = Analysis.objects.all()
    serializer_class = AnalysisSerializer

    # 🔧  ADD THIS ↓  – disables SessionAuthentication (and its CSRF check)
    authentication_classes = []        # <- nothing → no CSRF enforcement
    permission_classes     = []        # keep open for demo
    # ------------------- utils -------------------
    def get_queryset(self):
        return (
            self.queryset.select_related("series", "series__study")
            .order_by("-created_at")
        )

    def _enqueue(self, series: Series, dicoms: list[str]) -> tuple[str, Analysis.Queue]:
        """Return (job_id, queue) – works with real RQ or local stub."""
        if series.modality == Series.Modality.ABD:
            task, queue = segmentation_abdomen, Analysis.Queue.ABDOMEN
        elif series.modality == Series.Modality.THIGH:
            task, queue = segmentation_thigh,  Analysis.Queue.THIGH
        elif series.modality == Series.Modality.MMAP:
            task, queue = segmentation_mmap,   Analysis.Queue.MMAP
        else:
            raise ValueError(f"Unsupported modality {series.modality}")

        # real RQ job?
        if hasattr(task, "delay"):
            job = task.delay(dicoms=dicoms)
            return job.id, queue

        # fallback → local thread
        return _run_stub(task, dicoms=dicoms), queue

    # ------------------- create ------------------
    def create(self, request, *_, **__):
        sid = request.query_params.get("series_id")
        if not sid:
            return Response({"error": "series_id missing"}, 400)

        series = get_object_or_404(Series, series_id=sid)
        dicoms = [d.file.path for d in Instance.objects.filter(series=series)]

        try:
            job_id, queue = self._enqueue(series, dicoms)
        except ValueError as e:
            return Response({"error": str(e)}, 400)

        Analysis.objects.update_or_create(
            id=job_id,
            defaults=dict(
                queue   = queue,
                status  = Analysis.Status.PROCESSING,
                series  = series,
                owner   = User.objects.get(username="admin"),
            ),
        )
        logger.info("Enqueued %s analysis – job_id=%s", queue, job_id)
        return Response(
            {"job_id": job_id, "queue": queue, "status": "started"},
            status=201,
        )

    # ------------------- cancel ------------------
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        analysis = self.get_object()
        # try real RQ first
        try:
            conn = get_connection(analysis.queue)
            job  = Job.fetch(analysis.id, connection=conn)
            if job.get_status() == "started":
                send_stop_job_command(conn, job.id)
            else:
                job.cancel()
            analysis.status = Analysis.Status.CANCELED
            analysis.save()
            return Response(status=200)
        except Exception:
            # stub or job already gone
            analysis.status = Analysis.Status.CANCELED
            analysis.save()
            return Response(status=200)
