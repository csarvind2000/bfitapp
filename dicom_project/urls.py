from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("",           include("bfitserver.urls")),  # root
    path("uploader/",  include("bfitserver.urls")),  # legacy prefix kept
    path("admin/",     admin.site.urls),
]
