#!/usr/bin/env bash
python manage.py makemigrations bfitserver
python manage.py migrate bfitserver
python manage.py migrate 
python manage.py collectstatic --noinput
python manage.py runserver 0.0.0.0:8000