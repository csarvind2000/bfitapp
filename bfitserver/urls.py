from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import home, upload_dicom_folder, AnalysisViewSet

router = DefaultRouter()
router.register(r"analysis", AnalysisViewSet, basename="analysis")

urlpatterns = [
    path("",          home,                  name="home"),     #  GET /
    path("upload/",   upload_dicom_folder,   name="upload"),   #  GET+POST /upload/
    path("api/",      include(router.urls)),                  #  /api/analysis/...
]
