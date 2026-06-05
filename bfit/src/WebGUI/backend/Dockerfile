# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables for Django
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set the working directory to /backend
WORKDIR /backend

COPY requirements.txt .

RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy the src directory contents into the container at /backend
COPY src/ ./

ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION

RUN chmod +x /backend/entrypoint.sh

ENTRYPOINT [ "/backend/entrypoint.sh" ]