from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models.user import User
from .models import Study, Series, Instance, PACSStudy, PACSSeries, PACSInstance
from django.contrib.admin.exceptions import AlreadyRegistered

try:
    admin.site.register(User, UserAdmin)
except AlreadyRegistered:
    pass

admin.site.register(Study)
admin.site.register(Series)
admin.site.register(Instance)
admin.site.register(PACSStudy)
admin.site.register(PACSSeries)
admin.site.register(PACSInstance)
