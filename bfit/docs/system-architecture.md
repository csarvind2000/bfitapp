# BFIT System Architecture

Editable FigJam board: [BFIT architecture and user flow](https://www.figma.com/board/GGYAmtioiklTHRdw5zDYRq)

Large export version:
[open export page](./system-architecture-export.html),
[download high-res PNG](./system-architecture-poster-2x.png),
[download PNG](./system-architecture-poster.png),
[download SVG](./system-architecture-poster.svg)

Note: the editable FigJam board contains the architecture and user interaction flow diagrams. The class diagrams are included below in Mermaid because FigJam diagram generation does not support class diagrams.

```mermaid
flowchart LR
  %% BFIT runtime architecture

  user["Clinical User<br/>Browser"]

  subgraph frontend["Frontend Container<br/>Vite + React + Toolpad/MUI"]
    pages["Pages<br/>Studies | Analysis | Reports | Settings"]
    viewers["Imaging UI<br/>Niivue viewer<br/>mask tools<br/>tables + reports"]
    apiClient["Axios API Clients<br/>token auth interceptor"]
    pages --> viewers
    pages --> apiClient
  end

  subgraph backend["Backend Container<br/>Django REST Framework"]
    auth["Auth + Users<br/>DRF token auth"]
    studyApi["Study API<br/>upload DICOM<br/>PACS import<br/>series/instances"]
    analysisApi["Analysis API<br/>create/cancel jobs<br/>retrieve predictions<br/>update masks/comments"]
    reportApi["Report API<br/>body-analysis PDF<br/>download reports"]
    jobApi["Job Status API<br/>RQ status lookup"]
    mediaApi["Media endpoint<br/>/content/* file delivery"]
    llmApi["Summary Generator<br/>local LLM prompt builder"]
  end

  subgraph worker["AI Worker Container<br/>Django RQ + Supervisor"]
    rqDefault["default queue worker"]
    rqAi["AI inference queue worker"]
    rqMmap["mmap queue worker"]
    analysisJobs["Analysis jobs<br/>encode DICOM<br/>call inference<br/>persist outputs"]
    rqAi --> analysisJobs
    rqMmap --> analysisJobs
  end

  subgraph inference["Inference Services"]
    aiModel["AI model Flask API<br/>/segment/abdomen-mr<br/>/segment/abdomen-ct<br/>/segment/thigh-mr<br/>/segment/thigh-ct<br/>GPU enabled"]
    onpremLlm["On-prem LLM model<br/>local report summaries"]
  end

  subgraph data["Data + Storage"]
    postgres[("PostgreSQL<br/>users, studies, series,<br/>instances, analyses,<br/>predictions, reports")]
    redis[("Redis<br/>RQ queues + job state")]
    media[("Media volume<br/>DICOM files<br/>NIfTI masks<br/>plots<br/>PDF reports")]
    pacs[("PACS DICOM volume<br/>optional import source")]
    modelFiles[("AI model files<br/>checkpoints + plans")]
  end

  user -->|"HTTPS/HTTP app UI<br/>port 3000"| frontend
  apiClient -->|"REST /api/*<br/>Token auth"| backend
  backend -->|"JSON responses<br/>file URLs"| apiClient
  viewers -->|"GET /content/*<br/>media request"| mediaApi
  mediaApi -->|"returns masks,<br/>plots, PDFs"| viewers

  backend -->|"read/write ORM"| postgres
  backend -->|"file storage"| media
  backend -->|"PACS import"| pacs
  backend -->|"enqueue/cancel/status"| redis
  jobApi -->|"fetch RQ job"| redis
  llmApi -->|"POST /api/generate"| onpremLlm

  redis -->|"dispatch jobs"| worker
  worker -->|"read DICOM inputs"| media
  worker -->|"write predictions,<br/>segmentations, artifacts"| postgres
  worker -->|"write masks, plots,<br/>NIfTI, PDF artifacts"| media
  mediaApi -->|"read stored file content"| media
  analysisJobs -->|"base64 DICOM payload"| aiModel
  aiModel -->|"segmented NIfTI/DICOM,<br/>volume CSV, plots"| analysisJobs
  aiModel -->|"load checkpoints"| modelFiles

  classDef actor fill:#162033,stroke:#77b7ff,color:#f7fbff,stroke-width:2px;
  classDef frontend fill:#102a43,stroke:#38bdf8,color:#e8f7ff,stroke-width:2px;
  classDef backend fill:#17321f,stroke:#6ee7a8,color:#effff4,stroke-width:2px;
  classDef worker fill:#3a2a0d,stroke:#f8c14a,color:#fff8df,stroke-width:2px;
  classDef inference fill:#351a38,stroke:#d78bff,color:#fff0ff,stroke-width:2px;
  classDef data fill:#2d2230,stroke:#f29abf,color:#fff5fa,stroke-width:2px;

  class user actor;
  class pages,viewers,apiClient frontend;
  class auth,studyApi,analysisApi,reportApi,jobApi,mediaApi,llmApi backend;
  class rqDefault,rqAi,rqMmap,analysisJobs worker;
  class aiModel,onpremLlm inference;
  class postgres,redis,media,pacs,modelFiles data;
```

## Primary Runtime Flow

```mermaid
sequenceDiagram
  autonumber
  actor User as Clinical User
  participant UI as React Frontend
  participant API as Django REST API
  participant DB as PostgreSQL
  participant FS as Media Volume
  participant Redis as Redis / RQ
  participant Worker as AI Worker
  participant Model as AI model API
  participant LLM as On-prem LLM model

  User->>UI: Upload or import DICOM study
  UI->>API: POST /api/studies/
  API->>FS: Store DICOM instances
  API->>DB: Save Study, Series, Instance metadata

  User->>UI: Start analysis for a series
  UI->>API: POST /api/analysis/?series_id=...
  API->>Redis: Enqueue AI inference or mmap job
  API->>DB: Create Analysis(status=processing)
  UI->>API: GET /api/job-status/?job_id=...
  API->>Redis: Read RQ job state

  Redis->>Worker: Dispatch analysis job
  Worker->>FS: Read DICOM files
  Worker->>Model: POST base64 DICOM payload
  Model-->>Worker: Masks, CSV metrics, plots, source NIfTI
  Worker->>FS: Store masks and artifacts
  Worker->>DB: Save PredictionResult, SegmentationResult, AnalysisArtifact
  Worker->>DB: Mark Analysis completed or failed

  User->>UI: Review result, masks, tables
  UI->>API: GET /api/analysis/{id}/?predictions&segmentations&artifacts
  API-->>UI: Analysis details, artifact_url, segmentation_mask_url
  UI->>API: GET /content/... media files
  API->>FS: Read masks, plots, PDFs
  API-->>UI: Return media content

  User->>UI: Generate summary/report
  UI->>API: GET /api/analysis/generate_summary/
  API->>LLM: POST prompt to /api/generate
  LLM-->>API: Summary text
  API->>DB: Save Summary
  UI->>API: POST /api/reports/body-analysis/
  API->>FS: Store PDF report
  API->>DB: Save Report metadata
```

## Media Return Flow

```mermaid
flowchart LR
  user(["Clinical user"])

  subgraph frontend["Frontend"]
    viewer["Niivue viewer"]
    resultModal["Analysis result modal"]
    reportUi["Reports page"]
  end

  subgraph backend["Django backend"]
    analysisApi["Analysis API"]
    serializers["Serializers"]
    contentEndpoint["Media endpoint"]
    reportApi["Report API"]
  end

  subgraph storage["Media storage"]
    mediaVolume[("Media volume")]
    masks["NIfTI masks"]
    plots["Volume plots"]
    reports["PDF reports"]
  end

  user -->|"Opens analysis"| resultModal
  resultModal -->|"GET analysis detail"| analysisApi
  analysisApi --> serializers
  serializers -->|"Returns artifact_url and segmentation_mask_url"| resultModal
  resultModal -->|"GET /content/* media"| contentEndpoint
  contentEndpoint -->|"Reads files"| mediaVolume
  mediaVolume --> masks
  mediaVolume --> plots
  mediaVolume --> reports
  masks -->|"Mask file"| viewer
  plots -->|"Plot image"| resultModal
  reports -->|"PDF file"| reportUi
  reportUi -->|"Download report"| reportApi
  reportApi -->|"Reads PDF"| mediaVolume

  style frontend fill:#C2E5FF,stroke:#3DADFF
  style backend fill:#CDF4D3,stroke:#66D575
  style storage fill:#FFECBD,stroke:#FFC943
  style contentEndpoint fill:#DCCCFF,stroke:#874FFF
```

## Key Components

| Layer | Component | Responsibility |
| --- | --- | --- |
| UI | `WebGUI/frontend` | React/Vite application for DICOM studies, analysis review, Niivue viewing, segmentation tools, and reports. |
| API | `WebGUI/backend/src/bfitapp` | Django project wiring routes, settings, storage, database, and RQ queue configuration. |
| Domain API | `WebGUI/backend/src/bfitserver` | DRF viewsets and models for users, studies, series, instances, analyses, predictions, segmentations, comments, summaries, and reports. |
| Async processing | `ai_worker` | Runs AI inference, mmap, and default RQ workers under Supervisor. |
| Queue | Redis | Stores RQ queues and job state for async analysis and status polling. |
| Database | PostgreSQL | Stores relational metadata and JSON prediction payloads. |
| File storage | Media volume | Stores uploaded DICOM files, generated NIfTI masks, plots, artifacts, and PDF reports; the backend returns these to the frontend through `/content/*` URLs and serializer fields such as `artifact_url` and `segmentation_mask_url`. |
| Inference | AI model service | Flask API that converts DICOM/NIfTI, runs segmentation, computes volume outputs, and returns base64 artifacts. |
| Local AI summary | On-prem LLM model | Generates analysis summaries from backend-built prompts. |

## Deployment View

The production compose stack in `src/docker-compose.yaml` runs these services:

- `frontend` on port `3000`
- `backend` on port `8000`
- `ai_worker` with Supervisor/RQ dashboard port `9001`
- `redis` on port `6379`
- `postgres` exposed as host port `5433` to container port `5432`
- AI model service on port `5000` with NVIDIA GPU access
- On-prem LLM model on port `11434` with NVIDIA GPU access

The development override in `src/docker-compose.dev.yaml` bind-mounts the frontend, backend, and AI model source directories and adds `ai_worker_mon` on port `9181`.

## User Interaction Flow

```mermaid
flowchart TD
  start([Open BFIT])
  auth{Authenticated?}
  login[Sign in or sign up]
  dashboard[Dashboard shell]

  subgraph studies["Studies workflow"]
    studyList[View DICOM studies]
    chooseSource{Study source?}
    upload[Upload DICOM files]
    importPacs[Import from PACS volume]
    inspectSeries[Inspect study series]
  end

  subgraph analysis["Analysis workflow"]
    startAnalysis[Start analysis]
    poll[Poll job status]
    jobDone{Completed?}
    review[Review masks and metrics]
    editMasks[Update or combine masks]
    comments[Add comments]
    summary[Generate AI summary]
  end

  subgraph reporting["Reporting workflow"]
    capture[Select report sections]
    createPdf[Create body-analysis PDF]
    download[Download report]
  end

  start --> auth
  auth -->|"No"| login
  login --> dashboard
  auth -->|"Yes"| dashboard
  dashboard --> studyList
  studyList --> chooseSource
  chooseSource -->|"Local files"| upload
  chooseSource -->|"PACS"| importPacs
  upload --> inspectSeries
  importPacs --> inspectSeries
  inspectSeries --> startAnalysis
  startAnalysis --> poll
  poll --> jobDone
  jobDone -->|"Still running"| poll
  jobDone -->|"Failed or canceled"| inspectSeries
  jobDone -->|"Completed"| review
  review --> editMasks
  editMasks --> review
  review --> comments
  review --> summary
  review --> capture
  comments --> capture
  summary --> capture
  capture --> createPdf
  createPdf --> download

  style studies fill:#C2E5FF,stroke:#3DADFF
  style analysis fill:#DCCCFF,stroke:#874FFF
  style reporting fill:#CDF4D3,stroke:#66D575
  style jobDone fill:#FFECBD,stroke:#FFC943
```

## Backend Domain Class Diagram

```mermaid
classDiagram
  class User {
    +id
    +username
    +password
  }

  class Study {
    +study_id
    +patient_id
    +patient_name
    +study_date
    +created_at
  }

  class Series {
    +series_id
    +modality
    +anatomy
    +num_frames
    +created_at
  }

  class Instance {
    +instance_id
    +metadata
    +frame_number
    +file
  }

  class Analysis {
    +id
    +queue
    +status
    +created_at
    +ended_at
  }

  class PredictionResult {
    +prediction
    +created_at
    +updated_at
  }

  class SegmentationResult {
    +segmentation_mask
    +mask_type
    +created_at
    +updated_at
  }

  class AnalysisArtifact {
    +artifact
    +artifact_type
    +created_at
    +updated_at
  }

  class Comment {
    +id
    +comment
    +created_at
    +modified_at
  }

  class Summary {
    +id
    +summary
    +created_at
    +modified_at
  }

  class Report {
    +id
    +study
    +patient_id
    +patient_name
    +series
    +status
    +file
    +created_at
  }

  class PACSStudy {
    +study_id
    +patient_id
    +patient_name
    +study_date
  }

  class PACSSeries {
    +series_id
    +modality
    +anatomy
    +num_frames
  }

  class PACSInstance {
    +instance_id
    +location
  }

  User "1" --> "many" Study : owns
  User "1" --> "many" Series : owns
  User "1" --> "many" Instance : owns
  User "1" --> "many" Analysis : owns
  User "1" --> "many" Report : owns
  Study "1" --> "many" Series : contains
  Series "1" --> "many" Instance : contains
  Series "1" --> "many" Analysis : analyzed by
  Analysis "1" --> "many" PredictionResult : stores
  Analysis "1" --> "many" SegmentationResult : outputs
  Analysis "1" --> "many" AnalysisArtifact : outputs
  Analysis "1" --> "0..1" Comment : has
  Analysis "1" --> "0..1" Summary : has
  PACSStudy "1" --> "many" PACSSeries : contains
  PACSSeries "1" --> "many" PACSInstance : contains
```

## API And Frontend Class Diagram

```mermaid
classDiagram
  class ReactApp {
    +routes
    +session
    +navigation
  }

  class StudiesPage {
    +listStudies()
    +uploadStudy()
    +importFromPACS()
  }

  class AnalysisPage {
    +startAnalysis()
    +pollJob()
    +reviewResults()
  }

  class ReportsPage {
    +listReports()
    +createBodyAnalysisReport()
    +downloadReport()
  }

  class AxiosClient {
    +baseURL
    +tokenInterceptor()
  }

  class AuthService {
    +login()
    +logout()
    +verify()
  }

  class StudiesService {
    +getAll()
    +create()
    +createFromPACS()
    +generateReport()
  }

  class AnalysisService {
    +create()
    +cancel()
    +getDetail()
    +generateSummary()
    +updateSegmentation()
  }

  class ReportsService {
    +getAll()
    +createBodyAnalysisReport()
    +download()
  }

  class JobService {
    +getJobStatus()
  }

  class UserViewSet
  class StudyViewSet
  class SeriesViewSet
  class InstanceViewSet
  class AnalysisViewSet
  class ReportViewSet
  class AIWorker
  class AIModelClient
  class OnPremLLMClient

  ReactApp --> StudiesPage
  ReactApp --> AnalysisPage
  ReactApp --> ReportsPage
  ReactApp --> AuthService
  StudiesPage --> StudiesService
  AnalysisPage --> AnalysisService
  AnalysisPage --> JobService
  ReportsPage --> ReportsService
  AuthService --> AxiosClient
  StudiesService --> AxiosClient
  AnalysisService --> AxiosClient
  ReportsService --> AxiosClient
  JobService --> AxiosClient
  AxiosClient --> UserViewSet : /api/users
  AxiosClient --> StudyViewSet : /api/studies
  AxiosClient --> AnalysisViewSet : /api/analysis
  AxiosClient --> ReportViewSet : /api/reports
  StudyViewSet --> SeriesViewSet
  SeriesViewSet --> InstanceViewSet
  AnalysisViewSet --> AIWorker : enqueue jobs
  AIWorker --> AIModelClient : segment scans
  AnalysisViewSet --> OnPremLLMClient : generate summary
```
