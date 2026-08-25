# BFIT

BFIT is a web application for clinical staff to analyze MRI and CT body scans (abdomen and thigh). Users upload or import a DICOM study, an AI model segments fat and muscle regions and computes their volumes/areas, and the results can be reviewed, corrected, summarized (via a local LLM), and exported as a PDF report.

For a non-technical operational guide (starting/stopping the app, troubleshooting, backups), see [docs/HANDOVER_GUIDE.md](docs/HANDOVER_GUIDE.md). For detailed architecture diagrams and data flow, see [docs/system-architecture.md](docs/system-architecture.md).

## Features

- Upload DICOM studies or import them from a PACS
- Automated segmentation of abdomen/thigh MRI and CT scans using an nnU-Net model
- Interactive viewer (Niivue) for reviewing and manually correcting AI-generated masks
- Volume/area metrics computed from segmentations
- AI-generated written summaries via a local LLM (Ollama)
- Downloadable PDF body-analysis reports
- Job queue with status polling for long-running AI inference

## Architecture

BFIT runs as a set of Docker containers orchestrated with Docker Compose:

| Service | Role |
|---|---|
| `frontend` | React (Vite) + MUI/Toolpad web UI |
| `backend` | Django REST Framework API — auth, studies, analyses, reports |
| `postgres` | Relational database (users, studies, series, analyses, reports) |
| `redis` | Queue backing store for background jobs (RQ) |
| `ai_worker` | Django RQ workers that run inference jobs and persist results |
| `nnunet` | Flask API running the nnU-Net segmentation model (GPU required) |
| `ollama` | Local LLM used to generate report summary text (GPU required) |
| `ai_worker_mon` | RQ Dashboard for inspecting the job queue (dev only) |

See [docs/system-architecture.md](docs/system-architecture.md) for full sequence diagrams, the domain model, and API/frontend class diagrams.

## Prerequisites

- Docker and Docker Compose (v2, `docker compose` CLI)
- NVIDIA GPU with drivers + NVIDIA Container Toolkit (required for `nnunet` and `ollama`). Verify on the target machine before deploying:

  ```bash
  nvidia-smi          # confirms a GPU + driver are present
  nvidia-ctk --version # confirms the NVIDIA Container Toolkit is installed
  ```

  `docker-compose.yaml` requests the GPU via the CDI device syntax (`devices: - nvidia.com/gpu=all`), which additionally needs a CDI spec generated once per machine: `sudo nvidia-ctk cdi generate`. This only affects `docker compose up` (container start) — `docker compose build` succeeds regardless of GPU presence, so a missing/misconfigured GPU won't show up until you try to start `nnunet`/`ollama`.
- Linux host recommended

## Getting started

Every machine needs its own `.env` — never copy one as-is from another machine, since `DOCKER_ROOT` and `UID`/`GID` are machine-specific (see step 1). From there, pick one of the two paths below depending on whether the target machine has internet access to Docker Hub.

1. Copy the environment template and fill in real values:

   ```bash
   cd src
   cp .env.example .env
   ```

   What to set in `.env`:

   - `DOCKER_ROOT` — host path for the media/data volume. Just pick anywhere with enough disk space, e.g. `mkdir -p /home/<user>/Documents/bfit_data`; it doesn't need to match any other machine.
   - `UID` / `GID` — run `id -u` and `id -g` **on this machine**, as whichever user will run `docker compose up`, and use those numbers. This is what makes files the containers write (scans, results, reports) come out owned by a real user on this host instead of an ID that doesn't exist here — get it wrong and you'll hit permission errors on the mounted data volume.
   - `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` — database credentials
   - `BACKEND_URL` — leave blank for a normal same-machine setup
   - `AE_TITLE` / `AE_PORT` / `AE_HOST` — only needed if importing from a PACS

### Online deployment

Use this path when the machine has internet access to Docker Hub (needed to pull `redis`, `postgres`, `ollama`, and each Dockerfile's base image).

2. Build the images:

   ```bash
   docker compose build
   ```

   Or use `./build_docker.sh`, which does the same thing but also stamps the version from `.bfitapp-version` into the build (otherwise the frontend falls back to a hardcoded version label). It just wraps `docker compose build "$@"`, so any extra args (`./build_docker.sh frontend`, `./build_docker.sh --no-cache`) pass straight through.

3. Start the stack:

   ```bash
   docker compose up -d
   ```

4. Create an admin/login account:

   ```bash
   docker compose exec backend python manage.py createsuperuser
   ```

   If this fails with a container/exec error rather than a Django prompt, `backend` likely never started — check `docker compose ps`. `backend` depends on `postgres` being healthy and `redis` having started, so if either of those failed to pull, `backend` never comes up and there's nothing to exec into.

5. Open the app at `http://localhost:3000`.

#### Development mode

For live-reloading against local source (bind-mounts frontend/backend/nnUnet source and adds the RQ dashboard on port `9181`):

```bash
docker compose -f docker-compose.yaml -f docker-compose.dev.yaml up -d
```

### Offline deployment

BFIT can be built once on a machine with internet access, then shipped to and run on an air-gapped machine with no internet (typical for on-prem clinical deployments). This uses `src/export_docker.sh` and `src/import_docker.sh`, which save/load every image `docker-compose.yaml` references as `.tar.gz` files in `docker_dist/`.

**On the internet-connected build machine:**

```bash
cd src
cp .env.example .env        # fill in real values (see step 1 above)
./build_docker.sh           # builds/pulls all images defined in docker-compose.yaml
./export_docker.sh          # writes docker_dist/*.tar.gz (one per image)
```

Pass one or more image names as arguments to export only specific images, e.g. `./export_docker.sh bfit-backend bfit-frontend`.

Also pull the local LLM model while online, since the `ollama` container starts with no models installed:

```bash
docker compose up -d ollama
docker exec -it $(docker compose ps -q ollama) ollama pull llama3.2:3b
```

**Transfer to the offline machine:**

Copy the whole `bfit` project folder (needed for `docker-compose.yaml`, `.env`, and the Dockerfiles/source referenced by `build:` contexts) plus `src/docker_dist/*.tar.gz` to the target machine — USB drive, internal file transfer, etc. Budget for this being large, mainly because of `nnunet`'s ~17GB of baked-in model weights. Also copy the Ollama model data so it doesn't need to be re-pulled: the `ollama-data` volume (find its path with `docker volume inspect bfit_ollama-data`) — this is a runtime volume, not part of the image, so `docker save`/`export_docker.sh` won't include it.

**On the offline machine:**

```bash
cd src
./import_docker.sh          # docker load's every docker_dist/*.tar.gz
docker compose up -d
```

Because the images already exist locally under the same tags Compose expects (`bfit-backend`, `bfit-frontend`, `bfit-ai_worker`, `bfit-nnunet`, plus `redis`, `postgres`, `ollama`), `docker compose up -d` will run them directly instead of trying to build or pull — no internet is needed at this step. If you skipped copying the `ollama-data` volume, run `ollama pull` once while still online, or the summary-generation feature will fail until a model is available.

## Common operations

```bash
docker compose ps                       # check container status
docker compose logs -f <service>        # tail logs for a service
docker compose restart <service>        # restart one service
docker compose down                     # stop everything (data is preserved)
```

## Project layout

```
bfit/
├── docs/                    # Architecture diagrams and HANDOVER_GUIDE.md
├── src/
│   ├── docker-compose.yaml       # Production stack definition
│   ├── docker-compose.dev.yaml   # Dev overrides (bind mounts, RQ dashboard)
│   ├── .env.example              # Environment variable template
│   ├── WebGUI/
│   │   ├── frontend/        # React + Vite web application
│   │   └── backend/         # Django REST API + AI worker (RQ)
│   └── nnUnet/               # Flask inference service wrapping nnU-Net
│       ├── nnunet_raw/            # Raw training datasets per task (Dataset696_Abdomen, etc.)
│       ├── nnunet_preprocessed/   # nnU-Net preprocessed training data
│       └── nnunet_results/        # Trained model checkpoints (.pth) per dataset/fold — MUST be present, see NNUNET_MODEL_SERVICE.md
├── README.md
└── NNUNET_MODEL_SERVICE.md
```

## Model checkpoints

This repo ships no `.pth` files. **You must supply your own trained abdomen and thigh checkpoints** under `src/nnUnet/nnunet_results/` before `nnunet` can serve any `/segment/*` endpoint — there is no fallback if one is missing, and a mismatch between the checkpoint and its `dataset.json`/label map fails silently rather than erroring clearly.

See **[NNUNET_MODEL_SERVICE.md](NNUNET_MODEL_SERVICE.md)** for: which dataset/config/trainer/fold each endpoint requires, what `dataset.json` must contain and how it relates to the app's own label maps, the exact Flask JSON response format, how the Django backend consumes it, and how to run the Flask service standalone outside Docker for local development.

## Ports

| Port | Service |
|---|---|
| 3000 | Frontend |
| 8000 | Backend API |
| 9001 | AI worker / RQ dashboard |
| 9181 | RQ dashboard (dev only) |
| 5433 | Postgres (mapped from container 5432) |
| 6379 | Redis |
| 5000 | nnU-Net inference API |
| 11434 | Ollama (local LLM) |

## Data & security

- Patient scan data (DICOM, masks, reports) is stored outside the code tree, at the path configured via `DOCKER_ROOT`. Treat it as PHI (Protected Health Information) at all times.
- `.env` contains real credentials — never commit it or share it outside the team. Use `.env.example` as the template.
- Do not commit secrets (tokens, passwords) into scripts or version control.

## Requirements reference

- Backend: Django 5.1, Django REST Framework, django-rq, PostgreSQL via psycopg
- AI worker: same Django codebase running RQ workers under Supervisor
- Inference: nnU-Net v2 (PyTorch), Flask
- Frontend: React 19, Vite, MUI/Toolpad, Niivue, Zustand

See each service's `requirements.txt` / `package.json` for exact dependency versions.
