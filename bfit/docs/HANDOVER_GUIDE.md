# BFIT Project — Handover Guide

*Written for someone taking over the project part-time, with no prior coding background. Read this once fully before your first visit, then use it as a reference afterward.*

Last updated: 2026-08-05

---

## 1. What is BFIT?

BFIT is a web application used by clinical staff to analyze MRI and CT body scans (abdomen and thigh). A user uploads a scan (in **DICOM** format — the standard medical imaging file format), and an AI model automatically:

- Segments the scan (draws outlines around fat and muscle regions)
- Calculates volumes/areas of those regions
- Lets the user view the scan and the AI's outlines in an interactive viewer, and correct them by hand if needed
- Generates a written summary of the findings using a local AI writing model
- Produces a downloadable PDF report

None of this needs you to understand the AI or the code. Your job is to **keep the system running, keep the data safe, and know who to call when something needs actual code changes.**

---

## 2. How the pieces fit together (plain language)

BFIT isn't one program — it's several small programs ("**containers**") that each do one job and talk to each other. Docker (the software that runs all this) starts them together as a set.

| Piece (container name) | What it does, in plain terms |
|---|---|
| `frontend` | The website itself — what you see in your browser. |
| `backend` | The "brain." Handles logins, stores scan info, hands out work to the AI. |
| `postgres` | The filing cabinet — a database storing patients, scans, results, reports. |
| `redis` | A to-do list. When someone starts an analysis, the job is placed here first. |
| `ai_worker` | Picks jobs off the to-do list and runs them — talks to the AI model, saves results. |
| `nnunet` | The actual AI model that looks at a scan and draws the fat/muscle outlines. Needs the graphics card (GPU). |
| `ollama` | A second, separate AI model that writes the plain-English summary text for reports. Also needs the GPU. |
| `ai_worker_mon` | A dashboard (at port 9001/9181) showing what jobs are queued/running — for troubleshooting only. |

A full technical diagram (not necessary for you to read, but here if a developer needs it) lives at:
[`bfit/docs/system-architecture.md`](docs/system-architecture.md)

---

## 3. Where everything lives on this computer

- **Server (this machine):** `BII-SPD-M8DCPWK`, local network address `172.20.144.17`
- **Project code:** `/mnt/DATAHDD/sriya/bfitapp-clean-branch/bfit`
- **Patient scans, AI results, reports (the actual data):** `/home/tct-bii/Documents/bfit_data`
  - This is the folder that matters most for backups — it's the real patient data. The code folder above is comparatively replaceable; this data folder is not.
- **Graphics card (GPU):** NVIDIA RTX 3080 Ti — required for the AI to run. If this machine is ever replaced, the new one needs a compatible NVIDIA GPU and drivers.

⚠️ This system stores real patient scan data (PHI — Protected Health Information). Treat everything in the data folder above, and in any `*_DICOM` folders you come across, as strictly confidential, under whatever data-protection/IRB rules apply at your institution. Don't copy it to personal devices, USB drives, or cloud storage, and don't paste any of it (or `.env` file contents) into AI chat tools, email, or tickets.

---

## 4. Using BFIT day-to-day

1. Open a web browser on this computer (or another computer on the same network).
2. Go to: `http://localhost:3000` (on this machine) or `http://172.20.144.17:3000` (from another computer on the same network).
3. Log in with your account.

**If you don't have a login yet, or need to create the first one**, see §9 "Common tasks" below — you'll need a developer or IT person for this the very first time, since it involves a terminal command.

---

## 5. The terminal, and why you'll need it

Most of what you'll do is copy-pasting a handful of exact commands into a **terminal** (a text-based window for typing commands). You do not need to understand what the commands mean — treat them like a recipe: type/paste exactly, press Enter, read the result.

**To open a terminal and get to the right folder**, run:

```bash
cd /mnt/DATAHDD/sriya/bfitapp-clean-branch/bfit/src
```

Do this once at the start of every terminal session — every command below assumes you're standing in this folder.

---

## 6. Checking, starting, and stopping BFIT

**Check if everything is running:**
```bash
docker compose ps
```
You should see 8 rows, each with a status of `Up` (or `Up (healthy)`). If a row says `Exit` or is missing, that piece has stopped.

**Start everything (if it's not running):**
```bash
docker compose up -d
```

**Stop everything** (safe — no data is deleted; it just turns the app off):
```bash
docker compose down
```

**Restart just one piece** (useful if only one part is misbehaving), for example the frontend:
```bash
docker compose restart frontend
```
Replace `frontend` with any name from the table in §2 (`backend`, `postgres`, `redis`, `ai_worker`, `nnunet`, `ollama`).

**View what a piece is doing / recent errors** (press `Ctrl+C` to stop watching):
```bash
docker compose logs -f backend
```
Replace `backend` with any container name to see its logs instead.

Most containers are configured to restart automatically if this computer reboots or a program crashes, but it's worth checking `docker compose ps` after any reboot to confirm everything came back up.

---

## 7. Your weekly checklist

Since you're only here once a week, run through this each visit:

- [ ] `docker compose ps` — confirm all 8 containers say `Up`
- [ ] Open `http://localhost:3000` in a browser and confirm the site loads and you can log in
- [ ] Check free disk space: `df -h /mnt/DATAHDD` and `df -h /home` — if usage is above ~90%, flag it (see §8)
- [ ] Skim for repeated errors: `docker compose logs --since 168h backend ai_worker nnunet | grep -i error | tail -50`
- [ ] Note down anything a user reported as broken (screenshot + what they clicked + any on-screen error text) so it can be handed to a developer

---

## 8. Common problems and what to try

**The website won't load at all**
1. `docker compose ps` — is `frontend` and `backend` both `Up`?
2. If not: `docker compose up -d`, wait a minute, try again.
3. Still broken: `docker compose logs frontend` and `docker compose logs backend`, look for red/error text near the bottom.

**An analysis gets stuck "processing" and never finishes**
- The AI (`nnunet`) needs the GPU. Check it's not stuck: `docker compose logs nnunet` and `docker compose logs ai_worker`.
- Check the queue dashboard at `http://localhost:9001` (or `9181`) to see if jobs are piling up.
- Restarting the two involved pieces often clears a stuck state: `docker compose restart ai_worker nnunet`

**Running out of disk space**
- The data folder (`/home/tct-bii/Documents/bfit_data`) grows over time as scans and results accumulate. It contains subfolders like `tmpXXXXXXX/` — these are temporary working folders created during each analysis; ones from months ago that are clearly old can usually be cleaned up, but **check with a developer before deleting anything** — some may be needed for reports already generated.

**Anything else / you're not sure**
- Copy the exact error message and the output of `docker compose logs <the container involved>` and send it to whoever you escalate to (§12). Don't try to guess-fix things you don't understand — it's safer to pause and ask.

---

## 9. Common admin tasks that need a one-off terminal command

**Create a login account (first-time setup, or a new staff member needs access):**
```bash
docker compose exec backend python manage.py createsuperuser
```
It will ask for a username, email, and password — type them in when prompted.

**Reset someone's password:**
```bash
docker compose exec backend python manage.py changepassword <their-username>
```

---

## 10. Setting up BFIT on a new/different machine

*This is a developer task, not part of the weekly caretaker checklist — including it here so the steps aren't lost if it needs doing again.*

**Before starting, the new machine needs:**
- Docker + Docker Compose installed
- An NVIDIA GPU with drivers, plus the NVIDIA Container Toolkit — required by `nnunet` and `ollama` (see §3 for the GPU model used on the current machine)
- Internet access to Docker Hub — needed to pull `ollama/ollama:latest`, `redis:7.4`, `postgres:17.4`, and the base images the Dockerfiles build on top of. **If this machine's network is locked down (common on hospital/clinical networks), this step will fail — skip to the "no internet access" box below instead.**

**Steps:**

1. Get the code onto the new machine:
   ```bash
   git clone https://github.com/csarvind2000/bfitapp
   cd bfitapp/bfit/src
   ```
2. Create a real `.env` file from the template (the template has blank values on purpose — `.env` itself is never pushed to GitHub, since it holds real passwords):
   ```bash
   cp .env.example .env
   ```
   Then open `.env` and fill in:
   - `DOCKER_ROOT` — where scan data/results should live on this machine
   - `UID` / `GID` — run `id -u` and `id -g` on the new machine and use those numbers (a mismatch here causes file-permission errors later, not a build failure, but it's easy to forget)
   - The Postgres/PACS settings, matching what the previous machine used if this is a migration rather than a fresh install
3. Build the four images this repo builds itself (`backend`, `frontend`, `ai_worker`, `nnunet`):
   ```bash
   ./build_docker.sh
   ```
4. Start everything:
   ```bash
   docker compose up -d
   ```
5. Confirm it's up (`docker compose ps`), then open `http://localhost:3000`.
6. Create the first login:
   ```bash
   docker compose exec backend python manage.py createsuperuser
   ```

**If the new machine has no/restricted internet access to Docker Hub:** steps 3–4 above will fail — `build` needs to pull each Dockerfile's base image, and `up` needs to pull `ollama`, `redis`, and `postgres` directly. GitHub only carries the code, never the images, so there's no way around this without the images arriving some other way. Instead:

- On a machine that *does* have internet access (with the code and a filled-in `.env` already there), run `./build_docker.sh` then `./export_docker.sh` — this saves every image, including the pulled ones, into a `docker_dist/` folder.
- Copy `docker_dist/` to the new machine (USB drive, internal file share, etc.). Budget for it being large — mostly `nnunet`'s ~17GB of baked-in model weights.
- On the new machine, run `./import_docker.sh` to load them all into Docker, then continue from step 4 above.

---

## 11. Important things flagged during this review

**🔴 A real GitHub access token is sitting in plain text in a script.**
The file `clean_push.sh` (in `bfitapp-clean-branch/`, one level above the `bfit` folder) has a live-looking GitHub token hardcoded on line 6. Anyone with access to this file could use it to push or read code in the project's GitHub repository. This should be:
1. Revoked on GitHub (Settings → Developer settings → Personal access tokens) as soon as possible, and
2. Removed from the script (it should be typed in by hand each time it's used, never saved in the file).
This needs a developer or whoever manages the GitHub account — flag it to them immediately if it hasn't been handled already.

**🟡 The project folder isn't actually connected to git right now.**
Despite folder names suggesting otherwise, the `.git` folders here are empty — this copy of the code isn't currently tracked by version control locally. That means there's no automatic history/backup of code changes happening on this machine day to day; the only way code gets to GitHub is by manually running `clean_push.sh`. If a developer works on this again, ask them to properly connect this folder to the GitHub repository (`https://github.com/csarvind2000/bfitapp`) so changes are tracked safely. This is a code-organization issue, not something you need to fix yourself.

**🟡 The `.env` file contains real passwords/settings.**
`bfit/src/.env` holds the real database password and configuration for this installation (a template with blank values is in `.env.example` for reference). Never share this file, email it, or upload it anywhere — including to AI chat tools.

**🟢 Patient data handling** — see the callout in §3. Treat all scan data as confidential.

---

## 12. When you need real development help

You are not expected to write or edit code. When a real bug fix or new feature is needed, you'll need a developer (or an AI coding tool, used under a developer's supervision — code that touches real patient data should always be reviewed by someone technical before going live).

**To make any request effective, gather this first:**
- A screenshot of the problem
- What you clicked / did right before it happened
- Any error text shown on screen
- Relevant logs: `docker compose logs --since 1h <container> > problem.txt` (replace `<container>` with whichever piece seems involved, or list several) — this saves the recent log output to a file you can send along.

**Repository (once the token issue above is fixed):** `https://github.com/csarvind2000/bfitapp`

---

## 13. Quick reference sheet

| Item | Value |
|---|---|
| Website (this machine) | http://localhost:3000 |
| Website (other machines, same network) | http://172.20.144.17:3000 |
| Project code folder | `/mnt/DATAHDD/sriya/bfitapp-clean-branch/bfit` |
| Patient data / results folder | `/home/tct-bii/Documents/bfit_data` |
| Queue dashboard (troubleshooting) | http://localhost:9001 |
| GitHub repo | https://github.com/csarvind2000/bfitapp |
| App version | 0.1.0 |
| GPU | NVIDIA RTX 3080 Ti |

---

## 14. Glossary

- **Docker / container** — a way of packaging a program so it runs the same way every time. BFIT is split into several containers (§2), each doing one job.
- **Terminal** — a text window for typing commands (§5).
- **Frontend** — the part of the app you see and click in your browser.
- **Backend** — the part of the app running behind the scenes, handling data and logic.
- **Database (Postgres)** — where structured information (patients, scans, results) is stored, like a very organized filing cabinet.
- **Queue (Redis)** — a waiting line for background jobs, like AI analysis tasks.
- **DICOM** — the standard file format for medical scan images.
- **PACS** — a hospital system for storing/retrieving medical images; BFIT can import scans from one.
- **nnU-Net** — the specific AI method BFIT uses to find fat/muscle outlines in scans.
- **GPU** — the graphics card; the AI needs it to run at a usable speed.
- **`.env` file** — a file holding settings and passwords specific to this installation. Never share it.
- **Repository (repo) / GitHub** — where the project's code is meant to be stored and versioned online.
- **Token / secret** — a password-like code that grants access to a system (e.g., GitHub); must be kept private.

---

## 15. Contacts and escalation

*(Fill this in before handover — I don't have this information.)*

| Role | Name | Contact |
|---|---|---|
| Previous/primary developer | | |
| IT / infrastructure support | | |
| Clinical lead / project owner | | |
