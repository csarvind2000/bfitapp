import { useState, useCallback, useEffect } from "react";
import * as React from "react";
import { useAlert } from "../hooks/alert";
import { useLocation, useNavigate } from "react-router";
import {
  PageContainer,
  PageHeader,
  PageHeaderToolbar,
} from "@toolpad/core/PageContainer";
import { Button, Box, CircularProgress, Stack, TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { useDialogs } from "@toolpad/core/useDialogs";
import UploadIcon from "@mui/icons-material/Upload";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import RefreshIcon from "@mui/icons-material/Refresh";
import CancelIcon from "@mui/icons-material/Cancel";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import AssignmentIcon from "@mui/icons-material/Assignment";
import TroubleshootIcon from "@mui/icons-material/Troubleshoot";
import PACSImportModal from "../components/pacsImportModal";
import UploadModal from "../components/uploadModal";
import PaginatedStudyList from "../components/paginatedStudyList";
import studyService from "../services/studies";
import analysisService from "../services/analysis";
import AnalysisResultModal from "../components/analysisResultModal";
import { AnalysisStatus } from "../constants";
import {
  clearPersistedStudyFilterState,
  getInitialStudyFilterState,
  getSearchWithStudySearchFilter,
  persistStudyFilterState,
  studySearchFilterKeys,
} from "../components/studyFilterBar";

interface CustomPageToolbarProps {
  setShowUploadModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>;
  getStudy: () => void;
}

interface SearchBarProps {
  searchFilter: SearchFilter;
  setSearchFilter: React.Dispatch<React.SetStateAction<SearchFilter>>;
  sortAZ: boolean;
  setSortAZ: React.Dispatch<React.SetStateAction<boolean>>;
  onGenerateAllReports: () => void;
  onRerunAllAnalysis: () => void;
  bulkReportGenerating: boolean;
  bulkAnalysisRunning: boolean;
  storageKey: string;
}

interface SearchFilter {
  patientId: string;
  patientName: string;
  studyId: string;
  seriesId: string;
}

const initialSearchFilter: SearchFilter = {
  patientId: "",
  patientName: "",
  studyId: "",
  seriesId: "",
};

const studiesFilterStorageKey = "studiesPageStudyFilter";

export interface Series {
  series_id: string;
  modality: string;
  anatomy: string;
  scan_role?: string | null;
  num_frames: number;
}

export interface Study {
  study_id: string;
  series: Series[];
  patient_id: string | null;
  patient_name: string | null;
  study_date: string | null;
  created_at: string;
}

type ApiError = {
  response?: {
    data?: unknown;
  };
};

type CompletedAnalysis = {
  id: string;
  status?: string;
};

const getErrorPayload = (error: unknown) =>
  (error as ApiError)?.response?.data ??
  (error instanceof Error ? error.message : error);

const isVisibleSeries = (series: Series) =>
  !(
    series.anatomy === "thigh" &&
    series.modality === "mr" &&
    ["fat", "water", "fatfraction"].includes(String(series.scan_role || "").toLowerCase())
  );

function CustomPageToolbar({
  setShowUploadModal,
  setShowImportModal,
  getStudy,
}: CustomPageToolbarProps) {
  return (
    <PageHeaderToolbar>
      <Stack direction="row" spacing={1} alignItems={"center"}>
        <Button
          variant="contained"
          color="secondary"
          size="small"
          startIcon={<SaveAltIcon fontSize="inherit" />}
          onClick={() => setShowImportModal(true)}
        >
          Import from PACS
        </Button>
        <Button
          variant="contained"
          color="secondary"
          size="small"
          startIcon={<UploadIcon fontSize="inherit" />}
          onClick={() => setShowUploadModal(true)}
        >
          Upload Study
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          startIcon={<RefreshIcon fontSize="inherit" />}
          onClick={getStudy}
        >
          Refresh Studies
        </Button>
      </Stack>
    </PageHeaderToolbar>
  );
}

function CustomPageHeader({
  setShowUploadModal,
  setShowImportModal,
  getStudy,
}: CustomPageToolbarProps) {
  const CustomPageToolbarComponent = useCallback(
    () => (
      <CustomPageToolbar
        setShowUploadModal={setShowUploadModal}
        setShowImportModal={setShowImportModal}
        getStudy={getStudy}
      />
    ),
    [setShowUploadModal, setShowImportModal]
  );
  return (
    <PageHeader
      slots={{
        toolbar: CustomPageToolbarComponent,
      }}
    />
  );
}

const controlButtonSx: SxProps<Theme> = {
  height: 30,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

// Bulk buttons grow equally to fill left side of the row
const bulkButtonSx: SxProps<Theme> = {
  height: 30,
  whiteSpace: "nowrap",
  flex: "1 1 0",
  minWidth: 160,
  maxWidth: 300,
};

const filterFieldSx: SxProps<Theme> = {
  flex: "1 1 0",
  minWidth: 160,
};

/** Perfectly symmetric decorative divider: line · diamond · dot · diamond · line */
function DecorativeDivider() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        color: "text.disabled",
        mx: 0.5,
      }}
    >
      {/* Left line fills all available space */}
      <Box sx={{ flex: 1, height: "1px", bgcolor: "currentColor", opacity: 0.35 }} />
      {/* Left diamond */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, margin: "0 4px" }}>
        <path d="M6 1 L11 6 L6 11 L1 6 Z" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" fill="none" />
      </svg>
      {/* Centre dot */}
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0, margin: "0 4px" }}>
        <circle cx="4" cy="4" r="3" fill="currentColor" fillOpacity="0.55" />
      </svg>
      {/* Right diamond */}
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, margin: "0 4px" }}>
        <path d="M6 1 L11 6 L6 11 L1 6 Z" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" fill="none" />
      </svg>
      {/* Right line fills all available space */}
      <Box sx={{ flex: 1, height: "1px", bgcolor: "currentColor", opacity: 0.35 }} />
    </Box>
  );
}

function SearchBar({
  searchFilter,
  setSearchFilter,
  sortAZ,
  setSortAZ,
  onGenerateAllReports,
  onRerunAllAnalysis,
  bulkReportGenerating,
  bulkAnalysisRunning,
  storageKey,
}: SearchBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Stack
      spacing={1.25}
      sx={{ mb: 2, maxWidth: 1160, width: "100%" }}
    >
      {/* Row 1 — search fields */}
      <Stack
        direction="row"
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ gap: 1.5 }}
      >
        <TextField
          name="patientId"
          label="Patient ID"
          color="secondary"
          variant="outlined"
          size="small"
          value={searchFilter.patientId}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const name = event.currentTarget.name as keyof SearchFilter;
            const value = event.currentTarget.value;
            const nextSearchFilter = { ...searchFilter, [name]: value };
            setSearchFilter(nextSearchFilter);
            persistStudyFilterState(storageKey, nextSearchFilter, sortAZ);
            navigate({
              search: getSearchWithStudySearchFilter(
                location.search,
                nextSearchFilter
              ),
            });
          }}
          sx={filterFieldSx}
        />
        <TextField
          name="patientName"
          label="Patient Name"
          color="secondary"
          variant="outlined"
          size="small"
          value={searchFilter.patientName}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const name = event.currentTarget.name as keyof SearchFilter;
            const value = event.currentTarget.value;
            const nextSearchFilter = { ...searchFilter, [name]: value };
            setSearchFilter(nextSearchFilter);
            persistStudyFilterState(storageKey, nextSearchFilter, sortAZ);
            navigate({
              search: getSearchWithStudySearchFilter(
                location.search,
                nextSearchFilter
              ),
            });
          }}
          sx={filterFieldSx}
        />
        <TextField
          name="studyId"
          label="Study Instance UID"
          color="secondary"
          variant="outlined"
          size="small"
          value={searchFilter.studyId}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const name = event.currentTarget.name as keyof SearchFilter;
            const value = event.currentTarget.value;
            const nextSearchFilter = { ...searchFilter, [name]: value };
            setSearchFilter(nextSearchFilter);
            persistStudyFilterState(storageKey, nextSearchFilter, sortAZ);
            navigate({
              search: getSearchWithStudySearchFilter(
                location.search,
                nextSearchFilter
              ),
            });
          }}
          sx={filterFieldSx}
        />
        <TextField
          name="seriesId"
          label="Series Instance UID"
          color="secondary"
          variant="outlined"
          size="small"
          value={searchFilter.seriesId}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            const name = event.currentTarget.name as keyof SearchFilter;
            const value = event.currentTarget.value;
            const nextSearchFilter = { ...searchFilter, [name]: value };
            setSearchFilter(nextSearchFilter);
            persistStudyFilterState(storageKey, nextSearchFilter, sortAZ);
            navigate({
              search: getSearchWithStudySearchFilter(
                location.search,
                nextSearchFilter
              ),
            });
          }}
          sx={filterFieldSx}
        />
      </Stack>

      {/* Row 2 — action buttons
          Layout: [bulk btn · bulk btn] [divider] [spacer] [sort] [clear]
          The two bulk buttons share the left with flex grow,
          the divider is fixed-width, the spacer fills the middle gap,
          and the utility buttons are fixed on the right.
      */}
      <Stack
        direction="row"
        alignItems="center"
        flexWrap="nowrap"
        sx={{ gap: 1.5, width: "100%" }}
      >
        <Button
          variant="contained"
          color="secondary"
          size="small"
          startIcon={
            bulkReportGenerating ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <AssignmentIcon fontSize="inherit" />
            )
          }
          disabled={bulkReportGenerating || bulkAnalysisRunning}
          onClick={onGenerateAllReports}
          sx={bulkButtonSx}
        >
          {bulkReportGenerating ? "Generating Reports..." : "Generate All Reports"}
        </Button>

        <Button
          variant="outlined"
          color="secondary"
          size="small"
          startIcon={
            bulkAnalysisRunning ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <TroubleshootIcon fontSize="inherit" />
            )
          }
          disabled={bulkAnalysisRunning || bulkReportGenerating}
          onClick={onRerunAllAnalysis}
          sx={bulkButtonSx}
        >
          {bulkAnalysisRunning ? "Re-running Analysis..." : "Re-run All Analysis"}
        </Button>

        {/* Spacer with divider stretching to fill the middle gap */}
        <Box
          sx={{
            flex: "1 1 0",
            minWidth: 0,
            display: "flex",
            alignItems: "center",
          }}
        >
          <DecorativeDivider />
        </Box>

        <Button
          variant={sortAZ ? "contained" : "outlined"}
          color="secondary"
          size="small"
          startIcon={<SortByAlphaIcon fontSize="inherit" />}
          onClick={() => {
            const nextSortAZ = !sortAZ;
            setSortAZ(nextSortAZ);
            persistStudyFilterState(storageKey, searchFilter, nextSortAZ);
          }}
          sx={controlButtonSx}
        >
          Sort A-Z
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          startIcon={<CancelIcon fontSize="inherit" />}
          onClick={() => {
            setSearchFilter(initialSearchFilter);
            setSortAZ(false);
            clearPersistedStudyFilterState(storageKey);
            const params = new URLSearchParams(location.search);
            studySearchFilterKeys.forEach((key) => params.delete(key));
            navigate({ search: params.toString() });
          }}
          sx={controlButtonSx}
        >
          Clear Filters
        </Button>
      </Stack>
    </Stack>
  );
}

export default function StudiesPage() {
  const location = useLocation();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [studiesData, setStudiesData] = useState<Study[]>([]);
  const [searchFilter, setSearchFilter] = useState<SearchFilter>(
    () =>
      getInitialStudyFilterState(location.search, studiesFilterStorageKey)
        .searchFilter
  );
  const [sortAZ, setSortAZ] = useState(
    () =>
      getInitialStudyFilterState(location.search, studiesFilterStorageKey).sortAZ
  );
  const [bulkReportGenerating, setBulkReportGenerating] = useState(false);
  const [bulkAnalysisRunning, setBulkAnalysisRunning] = useState(false);
  const [analysisStatusRefreshKey, setAnalysisStatusRefreshKey] = useState(0);
  const [reportAnalysisQueue, setReportAnalysisQueue] = useState<string[]>([]);
  const [reportStatusRefreshKey, setReportStatusRefreshKey] = useState(0);
  const reportAnalysisId = reportAnalysisQueue[0] || null;
  const showAlert = useAlert();
  const dialogs = useDialogs();

  const CustomPageHeaderComponent = useCallback(
    () => (
      <CustomPageHeader
        setShowUploadModal={setShowUploadModal}
        setShowImportModal={setShowImportModal}
        getStudy={getStudy}
      />
    ),
    [setShowUploadModal, setShowImportModal]
  );

  const removeStudy = useCallback((id: string) => {
    setStudiesData((prevStudies) =>
      prevStudies.filter((study: Study) => study.study_id !== id)
    );
  }, []);

  const removeSeries = useCallback((studyId: string, seriesId: string) => {
    setStudiesData((prevStudies) => {
      const updatedStudies = prevStudies.map((study: Study) => {
        if (study.study_id === studyId) {
          study.series = study.series.filter(
            (series: Series) => series.series_id !== seriesId
          );
        }
        return study;
      });
      return updatedStudies;
    });
  }, []);

  const getStudy = useCallback(() => {
    studyService
      .getAll()
      .then((data) => {
        console.debug(`Retrieved studies ${JSON.stringify(data)}`);
        setStudiesData(data);
      })
      .catch((error) => {
        showAlert(
          `Failed to retrieve studies ${JSON.stringify(getErrorPayload(error))}`,
          "error"
        );
      });
  }, []);

  const hasSearchFilterApplied = () => {
    return Object.values(searchFilter).some((value) => value !== "");
  };

  useEffect(getStudy, []);

  useEffect(() => {
    const nextFilterState = getInitialStudyFilterState(
      location.search,
      studiesFilterStorageKey
    );
    setSearchFilter(nextFilterState.searchFilter);
    setSortAZ(nextFilterState.sortAZ);
    persistStudyFilterState(
      studiesFilterStorageKey,
      nextFilterState.searchFilter,
      nextFilterState.sortAZ
    );
  }, [location.search]);

  const filteredStudies = () => {
    const studiesWithVisibleSeries = studiesData
      .map((study: Study) => ({
        ...study,
        series: (study.series || []).filter(isVisibleSeries),
      }))
      .filter((study: Study) => study.series.length > 0);

    if (!hasSearchFilterApplied()) {
      return studiesWithVisibleSeries;
    }
    return studiesWithVisibleSeries.filter((study: Study) => {
      return (
        (searchFilter.patientId === "" ||
          study.patient_id
            ?.toLowerCase()
            .includes(searchFilter.patientId.toLowerCase())) &&
        (searchFilter.patientName === "" ||
          study.patient_name
            ?.toLowerCase()
            .includes(searchFilter.patientName.toLowerCase())) &&
        (searchFilter.studyId === "" ||
          study.study_id.includes(searchFilter.studyId)) &&
        (searchFilter.seriesId === "" ||
          study.series.some((series) =>
            series.series_id.includes(searchFilter.seriesId)
          ))
      );
    });
  };

  const getVisibleSeries = useCallback(() => {
    return filteredStudies().flatMap((study: Study) => study.series || []);
  }, [studiesData, searchFilter]);

  const handleGenerateAllReports = useCallback(async () => {
    const visibleSeries = getVisibleSeries();
    if (visibleSeries.length === 0) {
      showAlert("No scans available to generate reports", "error");
      return;
    }

    setBulkReportGenerating(true);
    try {
      const completedAnalyses: CompletedAnalysis[] = [];
      for (const serie of visibleSeries) {
        try {
          const completed = await analysisService.getCompleted(null, serie.series_id);
          const latestCompleted = completed?.[0];
          if (latestCompleted?.status === AnalysisStatus.COMPLETED) {
            completedAnalyses.push(latestCompleted);
          }
        } catch (error) {
          console.error(`Failed to retrieve completed analysis for ${serie.series_id}`, error);
        }
      }

      const uniqueAnalyses = completedAnalyses.filter(
        (analysis, index, analyses) =>
          analyses.findIndex((candidate) => candidate.id === analysis.id) === index
      );

      if (uniqueAnalyses.length === 0) {
        showAlert("No completed analyses are available for report generation", "error");
        setBulkReportGenerating(false);
        return;
      }

      setReportAnalysisQueue(uniqueAnalyses.map((analysis) => analysis.id));
    } catch (error) {
      console.error("Failed to generate all reports", error);
      showAlert("Failed to generate all reports", "error");
      setBulkReportGenerating(false);
    }
  }, [getVisibleSeries, showAlert]);

  const handleRerunAllAnalysis = useCallback(async () => {
    const visibleSeries = getVisibleSeries();
    if (visibleSeries.length === 0) {
      showAlert("No scans available to re-run analysis", "error");
      return;
    }

    const confirmed = await dialogs.confirm(
      "Are you sure you want to re-run analysis for all visible scans? Existing analysis results will be overwritten with the new analysis.",
      {
        title: "Re-run all analysis?",
        okText: "Re-run analysis",
        cancelText: "Cancel",
      }
    );
    if (!confirmed) return;

    setBulkAnalysisRunning(true);
    try {
      let startedCount = 0;
      let failedCount = 0;

      for (const serie of visibleSeries) {
        try {
          const response = await analysisService.create(serie.series_id);
          const jobs = Array.isArray(response?.jobs) ? response.jobs : [];
          if (jobs.some((job: { status?: string }) => job.status === AnalysisStatus.FAILED)) {
            failedCount += 1;
          } else {
            startedCount += 1;
          }
        } catch (error) {
          failedCount += 1;
          console.error(`Failed to re-run analysis for ${serie.series_id}`, error);
        }
      }

      if (startedCount > 0) {
        showAlert(
          `Started analysis for ${startedCount} scan${startedCount === 1 ? "" : "s"}`,
          "success"
        );
      }

      if (failedCount > 0) {
        showAlert(
          `Marked ${failedCount} scan${failedCount === 1 ? "" : "s"} as failed`,
          "error"
        );
      }

      if (startedCount === 0 && failedCount === 0) {
        showAlert("No scans were started", "error");
      }
      getStudy();
      setAnalysisStatusRefreshKey((key) => key + 1);
    } catch (error) {
      console.error("Failed to re-run all analysis", error);
      showAlert(
        `Failed to re-run all analysis ${JSON.stringify(getErrorPayload(error))}`,
        "error"
      );
    } finally {
      setBulkAnalysisRunning(false);
    }
  }, [dialogs, getStudy, getVisibleSeries, showAlert]);

  return (
    <PageContainer
      slots={{
        header: CustomPageHeaderComponent,
      }}
    >
      <SearchBar
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        sortAZ={sortAZ}
        setSortAZ={setSortAZ}
        onGenerateAllReports={handleGenerateAllReports}
        onRerunAllAnalysis={handleRerunAllAnalysis}
        bulkReportGenerating={bulkReportGenerating}
        bulkAnalysisRunning={bulkAnalysisRunning}
        storageKey={studiesFilterStorageKey}
      />
      {reportAnalysisId && (
        <AnalysisResultModal
          key={reportAnalysisId}
          open={Boolean(reportAnalysisId)}
          analysisId={reportAnalysisId}
          autoGenerateReport
          onAutoGenerateReportComplete={() => {
            setReportAnalysisQueue((queue) => {
              const remaining = queue.slice(1);
              if (remaining.length > 0) {
                setTimeout(() => setReportAnalysisQueue(remaining), 3000);
              } else {
                setBulkReportGenerating(false);
                setReportStatusRefreshKey((key) => key + 1);
              }
              return [];
            });
          }}
          onClose={() => {
            setReportAnalysisQueue([]);
            setBulkReportGenerating(false);
          }}
        />
      )}
      <PaginatedStudyList
        items={filteredStudies()}
        removeStudy={removeStudy}
        removeSeries={removeSeries}
        sortAZ={sortAZ}
        reportStatusRefreshKey={reportStatusRefreshKey}
        analysisStatusRefreshKey={analysisStatusRefreshKey}
      />
      {showUploadModal && (
        <UploadModal
          open={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          getStudy={getStudy}
        />
      )}
      {showImportModal && (
        <PACSImportModal
          open={showImportModal}
          onClose={() => setShowImportModal(false)}
          importedStudies={studiesData}
        />
      )}
    </PageContainer>
  );
}
