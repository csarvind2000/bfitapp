"""
URL configuration for bfitapp project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from rest_framework import routers
from django.urls import path, include
from django.conf.urls.static import static
from django.conf import settings
from bfitserver.views import (
    UserViewSet,
    StudyViewSet,
    SeriesViewSet,
    InstanceViewSet,
    AnalysisViewSet,
    ReportViewSet,
    get_job_status,
)

router = routers.DefaultRouter()
router.register(r"users", UserViewSet)
router.register(r"studies", StudyViewSet)
router.register(r"studies/(?P<study_id>[^/]+)/series", SeriesViewSet)
router.register(
    r"studies/(?P<study_id>[^/]+)/series/(?P<series_id>[^/]+)/instances",
    InstanceViewSet,
)
router.register(r"analysis", AnalysisViewSet)
router.register(r"reports", ReportViewSet)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("django-rq/", include("django_rq.urls")),
    path("api/", include(router.urls)),
    path("api/job-status/", get_job_status, name="job-status"),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.STORAGES["default"]["OPTIONS"]["base_url"],
        document_root=settings.STORAGES["default"]["OPTIONS"]["location"],
    )
