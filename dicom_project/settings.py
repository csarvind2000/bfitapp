import os
from pathlib import Path
import logging

# ----------------------
# Base Directory
# ----------------------
BASE_DIR = Path(__file__).resolve().parent.parent
# Set the environment log level
LOG_LEVEL = os.environ.get("LOG_LEVEL", logging.DEBUG)

# ----------------------
# Security Settings
# ----------------------
SECRET_KEY = 'django-insecure-=^zod*0&kig#!97j^2&%v%b=7*1fsz=de0q8^@$zz0-dj8m1k@'
DEBUG = True
ALLOWED_HOSTS = []

# ----------------------
# Installed Applications
# ----------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'bfitserver',  # ✅ Renamed app
]

# Logging
# https://docs.djangoproject.com/en/4.2/topics/logging/
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    # Define a base log message formatter
    "formatters": {
        "base": {
            "format": "{name} at {asctime} ({levelname}) :: {message}",
            "style": "{",
        }
    },
    # Custom handler config that gets log messages and outputs them to console or file
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "base",
            "level": LOG_LEVEL,
        },
        "rq_console": {
            "class": "logging.StreamHandler",
            "level": LOG_LEVEL,
            "stream": "ext://sys.stdout",
        },
        "file": {
            "level": LOG_LEVEL,
            "class": "logging.FileHandler",
            "filename": "app.log",
        },
    },
    "loggers": {
        "bfitserver": {
            "handlers": ["console", "file"],
            "level": LOG_LEVEL,
            "propagate": True,
        },
        "rq.worker": {
            "handlers": ["rq_console"],
            "level": "ERROR",
            "propagate": True,
        },
    },
}

# ----------------------
# Middleware Configuration
# ----------------------
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# ----------------------
# URL Dispatcher
# ----------------------
ROOT_URLCONF = 'dicom_project.urls'

# ----------------------
# Template Settings
# ----------------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [os.path.join(BASE_DIR, 'templates')],  # Optional: if you move templates out of the app
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# ----------------------
# WSGI
# ----------------------
WSGI_APPLICATION = 'dicom_project.wsgi.application'

# ----------------------
# PostgreSQL Database
# ----------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'dicomdb',
        'USER': 'dicomuser',
        'PASSWORD': 'your_secure_password',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}

# ----------------------
# Custom User Model
# ----------------------
AUTH_USER_MODEL = 'bfitserver.User'

# ----------------------
# Password Validation
# ----------------------
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# ----------------------
# Internationalization
# ----------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ----------------------
# Static and Media Files
# ----------------------
STATIC_URL = '/static/'

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# ----------------------
# Default Primary Key Field
# ----------------------
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ----------------------
# File Upload Configuration (e.g., DICOM)
# ----------------------
DATA_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024 * 1024  # 2 GB
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024 * 1024  # 2 GB
DATA_UPLOAD_MAX_NUMBER_FILES = 20000  # Optional: increase if you upload many files
