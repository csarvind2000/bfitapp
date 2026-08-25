import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  AccordionActions,
  Box,
  Button,
  Chip,
  Checkbox,
  IconButton,
  Stack,
  Menu,
  MenuItem,
  Typography,
  TablePagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Tooltip,
  Paper,
  CircularProgress,
  Divider,
} from "@mui/material";
import { Link } from "react-router";
import Grid from "@mui/material/Grid2";
import ConfirmationModal from "./confirmationModal";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TroubleshootIcon from "@mui/icons-material/Troubleshoot";
import AssignmentIcon from "@mui/icons-material/Assignment";
import PendingIcon from "@mui/icons-material/Pending";
import ErrorIcon from "@mui/icons-material/Error";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteIcon from "@mui/icons-material/Delete";
import { alpha } from "@mui/material/styles";
import NiivuePreviewModal from "./niivue/niivuePreviewModal";
import AnalysisResultModal from "./analysisResultModal";
import Axios from "axios";
import studyService from "../services/studies";
import analysisService from "../services/analysis";
import reportService from "../services/reports";
import { useAlert } from "../hooks/alert";
import { useInterval } from "../hooks/interval";
import { useModal } from "../hooks/modal";
import { useVisibilityChange } from "../hooks/visibility";
import {
  AnalysisStatus,
  DateFormatter,
  getAnalysisTypeShortLabel,
} from "../constants";

function hasCompletedAnalysis(analysisDetail) {
  return Boolean(
    analysisDetail?.some(
      (analysis) => analysis.status === AnalysisStatus.COMPLETED
    )
  );
}

function parseReportSeries(seriesValue) {
  if (Array.isArray(seriesValue)) return seriesValue;
  if (typeof seriesValue !== "string") return [];
  try {
    const parsed = JSON.parse(seriesValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return seriesValue ? [seriesValue] : [];
  }
}

// ─── Ring indicator styles ────────────────────────────────────────────────────

const ringStyle = (color) => ({
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: `1.5px solid ${color}90`,
  bgcolor: `${color}18`,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.15s ease",
  "&:hover": {
    bgcolor: `${color}28`,
  },
});

const dimRingStyle = {
  flexShrink: 0,
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1.5px solid rgba(255,255,255,0.08)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const partialReportRingStyle = {
  ...ringStyle("#93c5fd"),
  position: "relative",
  overflow: "hidden",
  bgcolor: "rgba(147,197,253,0.08)",
  "&::before": {
    content: '""',
    position: "absolute",
    inset: 0,
    bgcolor: "rgba(147,197,253,0.18)",
    clipPath:
      "polygon(0 58%, 14% 50%, 28% 57%, 42% 49%, 56% 56%, 70% 48%, 84% 55%, 100% 48%, 100% 100%, 0 100%)",
  },
};

const getWaveClipPath = (progressPercent) => {
  const progress = Math.max(0, Math.min(100, Number(progressPercent) || 0));
  const base = 100 - progress;
  const crest = Math.max(0, base - 8);
  const trough = Math.min(100, base + 6);
  const midHigh = Math.max(0, base - 3);
  const midLow = Math.min(100, base + 3);

  return `polygon(0 ${base}%, 14% ${crest}%, 28% ${midLow}%, 42% ${midHigh}%, 56% ${trough}%, 70% ${midHigh}%, 84% ${midLow}%, 100% ${crest}%, 100% 100%, 0 100%)`;
};

const partialAnalysisRingStyle = (progressPercent) => ({
  ...ringStyle("#4ade80"),
  position: "relative",
  overflow: "hidden",
  bgcolor: "rgba(74,222,128,0.08)",
  "&::before": {
    content: '""',
    position: "absolute",
    inset: 0,
    bgcolor: "rgba(74,222,128,0.18)",
    clipPath: getWaveClipPath(progressPercent),
  },
});

const seriesUidCellSx = {
  width: "40%",
  pr: 2,
};

const seriesUidTextSx = {
  display: "block",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  wordBreak: "break-all",
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.35,
  fontSize: "0.78rem",
  color: "text.secondary",
  fontFamily: "monospace",
  letterSpacing: "0.01em",
};

const uploadedOnCellSx = {
  whiteSpace: "normal",
  overflowWrap: "break-word",
  lineHeight: 1.35,
  fontSize: "0.8rem",
  color: "text.secondary",
};

// ─── Table header cell style ──────────────────────────────────────────────────

const tableHeadCellSx = {
  fontSize: "0.72rem",
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "text.secondary",
  borderBottom: "1px solid",
  borderColor: "divider",
  py: 1.25,
  whiteSpace: "nowrap",
};

function PartialReportIcon() {
  return (
    <Box sx={{ position: "relative", width: 16, height: 16, display: "inline-flex" }}>
      <AssignmentIcon
        sx={{
          position: "absolute",
          inset: 0,
          fontSize: 16,
          color: "rgba(147,197,253,0.28)",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          clipPath:
            "polygon(0 58%, 14% 50%, 28% 57%, 42% 49%, 56% 56%, 70% 48%, 84% 55%, 100% 48%, 100% 100%, 0 100%)",
        }}
      >
        <AssignmentIcon sx={{ fontSize: 16, color: "#93c5fd" }} />
      </Box>
    </Box>
  );
}

function PartialAnalysisIcon({ progressPercent }) {
  return (
    <Box sx={{ position: "relative", width: 16, height: 16, display: "inline-flex" }}>
      <CheckCircleIcon
        sx={{
          position: "absolute",
          inset: 0,
          fontSize: 16,
          color: "rgba(74,222,128,0.28)",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          clipPath: getWaveClipPath(progressPercent),
        }}
      >
        <CheckCircleIcon sx={{ fontSize: 16, color: "#4ade80" }} />
      </Box>
    </Box>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SerieAnalysisStatus({ analysisDetail }) {
  if (analysisDetail && analysisDetail.length > 0) {
    for (const j of analysisDetail)
      if (j.status === AnalysisStatus.PROCESSING) {
        return (
          <Chip
            icon={<PendingIcon />}
            label="Processing"
            color="secondary"
            size="small"
            sx={{ fontWeight: 500, letterSpacing: "0.02em" }}
          />
        );
      } else if (j.status === AnalysisStatus.FAILED) {
        return (
          <Chip
            icon={<ErrorIcon />}
            label="Failed"
            color="error"
            size="small"
            sx={{ fontWeight: 500, letterSpacing: "0.02em" }}
          />
        );
      } else if (j.status === AnalysisStatus.CANCELED) {
        return (
          <Chip
            icon={<BlockIcon />}
            label="Canceled"
            color="warning"
            size="small"
            sx={{ fontWeight: 500, letterSpacing: "0.02em" }}
          />
        );
      }
    return (
      <Chip
        icon={<CheckCircleIcon />}
        label="Completed"
        color="success"
        size="small"
        sx={{ fontWeight: 500, letterSpacing: "0.02em" }}
      />
    );
  }
  return (
    <Chip
      label="Not Analysed"
      size="small"
      sx={{
        fontWeight: 500,
        letterSpacing: "0.02em",
        bgcolor: "rgba(255,255,255,0.05)",
        color: "text.disabled",
        border: "1px solid",
        borderColor: "divider",
      }}
    />
  );
}

function AnalysisSelector({ analysisDetail }) {
  const [showResultModal, setShowResultModal] = useState(false);
  const [analysisIdForModal, setAnalysisIdForModal] = useState(null);

  const openResultModal = (analysisId) => {
    setAnalysisIdForModal(analysisId);
    setShowResultModal(true);
  };

  if (analysisDetail && analysisDetail.length > 0) {
    return (
      <Stack
        direction="row"
        spacing={0.75}
        alignItems={"center"}
        justifyContent={"center"}
      >
        {analysisDetail.map((e) => {
          const label = getAnalysisTypeShortLabel(e);
          const disabled = e.status !== AnalysisStatus.COMPLETED;
          return (
            <Chip
              key={e.id}
              variant="filled"
              size="small"
              disabled={disabled}
              clickable={true}
              label={label}
              onClick={() => openResultModal(e.id)}
              color="primary"
              sx={{
                minWidth: 32,
                fontWeight: 600,
                fontSize: "0.7rem",
              }}
            />
          );
        })}
        {showResultModal && (
          <AnalysisResultModal
            open={showResultModal}
            onClose={() => {
              setShowResultModal(false);
              setAnalysisIdForModal(null);
            }}
            analysisId={analysisIdForModal}
          />
        )}
      </Stack>
    );
  }
  return (
    <Typography variant="caption" color="text.disabled" sx={{ letterSpacing: "0.05em" }}>
      —
    </Typography>
  );
}

function StudyAccordionTableRowMenu({
  studyId,
  seriesId,
  selectedSeriesId,
  analysisDetail,
  menuAnchorEl,
  handleMenuClose,
  handleRemoveSeries,
  getAnalysisStatus,
}) {
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const showAlert = useAlert();

  const removeSeriesHandler = async () => {
    try {
      await handleRemoveSeries();
      showAlert(`Removed series ${seriesId}`, "success");
    } catch (error) {
      showAlert(
        `Failed to delete series ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
  };
  const [deleteProps, isDeleteOpen, openDelete] = useModal({
    handleConfirm: removeSeriesHandler,
    settings: {
      title: "Are you sure you would like to delete this series?",
      contents:
        "This will permanently remove the selected series and any analysis data linked to it. This action cannot be undone.",
      agreeText: "Delete series",
      disagreeText: "Cancel",
      destructive: true,
    },
  });

  const cancelAnalysisHandler = async () => {
    try {
      for (const j of analysisDetail) {
        if (j.status === AnalysisStatus.PROCESSING) {
          await analysisService.cancel(j.id);
        }
      }
      await getAnalysisStatus();
      showAlert(`Canceled analysis for series ${seriesId}`);
    } catch (error) {
      showAlert(
        `Failed to cancel analysis ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
  };

  const handleClosePreviewModal = useCallback(
    () => setShowPreviewModal(false),
    []
  );

  const isAnalysing =
    analysisDetail &&
      analysisDetail.find(
        (e) => e.series === seriesId && e.status === AnalysisStatus.PROCESSING
      )
      ? true
      : false;

  return (
    <>
      {isDeleteOpen && <ConfirmationModal {...deleteProps} />}
      {showPreviewModal && (
        <NiivuePreviewModal
          studyId={studyId}
          seriesId={seriesId}
          open={showPreviewModal}
          onClose={handleClosePreviewModal}
        />
      )}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl) && selectedSeriesId === seriesId}
        onClose={handleMenuClose}
        slotProps={{
          paper: {
            sx: {
              minWidth: 160,
              "& .MuiMenuItem-root": {
                fontSize: "0.85rem",
                py: 1,
              },
            },
          },
        }}
      >
        <MenuItem onClick={() => setShowPreviewModal(true)}>Preview</MenuItem>
        <MenuItem onClick={cancelAnalysisHandler} disabled={!isAnalysing}>
          Cancel Analysis
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => openDelete()}
          disabled={isAnalysing}
          sx={{ color: "error.main" }}
        >
          Delete Series
        </MenuItem>
      </Menu>
    </>
  );
}

function StudyAccordionTableToolbar({
  selected,
  analysisStatus,
  getAnalysisStatus,
  onReportGenerated,
}) {
  const showAlert = useAlert();
  const [loading, setLoading] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportAnalysisQueue, setReportAnalysisQueue] = useState([]);
  const reportAnalysisId = reportAnalysisQueue[0] || null;

  const startAnalysisHandler = async () => {
    try {
      setLoading(true);
      for (const serie of selected) {
        await analysisService.create(serie.series_id);
      }
      await getAnalysisStatus();
    } catch (error) {
      console.error(
        `Failed to start analysis ${JSON.stringify(error.response?.data)}`
      );
      showAlert(
        `Failed to start analysis ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  const isAnalysing = analysisStatus.some(
    (e) =>
      e.filter(
        (j) =>
          selected.some((serie) => serie.series_id === j.series) &&
          j.status === AnalysisStatus.PROCESSING
      ).length > 0
  );

  const completedReportAnalyses = selected
    .map((serie) =>
      analysisStatus
        .flat()
        .find(
          (analysis) =>
            analysis.series === serie.series_id &&
            analysis.status === AnalysisStatus.COMPLETED
        )
    )
    .filter(Boolean)
    .filter(
      (analysis, index, analyses) =>
        analyses.findIndex((candidate) => candidate.id === analysis.id) === index
    );

  const disableReport =
    selected.length === 0 ||
    isAnalysing ||
    completedReportAnalyses.length === 0 ||
    reportGenerating;

  const handleGenerateReport = async () => {
    setReportGenerating(true);
    try {
      const freshCompletedAnalyses = [];
      for (const serie of selected) {
        try {
          const completed = await analysisService.getCompleted(null, serie.series_id);
          const latestCompleted = completed?.[0];
          if (latestCompleted?.status === AnalysisStatus.COMPLETED) {
            freshCompletedAnalyses.push(latestCompleted);
          }
        } catch (error) {
          console.error(
            `Failed to retrieve completed analysis for ${serie.series_id}`,
            error
          );
        }
      }

      const analysesToReport = freshCompletedAnalyses
        .filter(Boolean)
        .filter(
          (analysis, index, analyses) =>
            analyses.findIndex((candidate) => candidate.id === analysis.id) === index
        );

      if (analysesToReport.length === 0) {
        showAlert(
          "No completed analysis is available for the selected series",
          "error"
        );
        setReportGenerating(false);
        return;
      }

      setReportAnalysisQueue(analysesToReport.map((analysis) => analysis.id));
    } catch (error) {
      console.error("Failed to prepare reports", error);
      showAlert("Failed to prepare reports", "error");
      setReportGenerating(false);
    }
  };

  return (
    <>
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
                setTimeout(() => {
                  setReportAnalysisQueue(remaining);
                }, 3000);
              } else {
                setReportGenerating(false);
                onReportGenerated?.();
              }
              return [];
            });
          }}
          onClose={() => {
            setReportAnalysisQueue([]);
            setReportGenerating(false);
          }}
        />
      )}
      <Toolbar
        sx={{
          pl: { sm: 2 },
          pr: { xs: 1, sm: 1 },
          minHeight: "48px !important",
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: (theme) =>
            alpha(theme.palette.primary.main, theme.palette.action.activatedOpacity),
        }}
      >
        <Typography
          sx={{ flex: "1 1 100%", fontSize: "0.85rem", fontWeight: 500 }}
          color="inherit"
          component="div"
        >
          {selected.length} selected
        </Typography>
        <IconButton
          sx={{
            display: "flex",
            flexDirection: "row",
            gap: 0.5,
            borderRadius: 1,
            px: 1.5,
            py: 0.75,
          }}
          onClick={startAnalysisHandler}
          disabled={isAnalysing}
          loading={loading}
        >
          <TroubleshootIcon fontSize="small" />
          <Typography variant="button" sx={{ display: "block", fontSize: "0.75rem" }}>
            Analyse
          </Typography>
        </IconButton>
        <Tooltip title="Generate a PDF report from the completed analysis of the selected series">
          <span style={{ whiteSpace: "pre", textWrap: "nowrap" }}>
            <IconButton
              sx={{
                display: "flex",
                flexDirection: "row",
                gap: 0.5,
                borderRadius: 1,
                px: 1.5,
                py: 0.75,
              }}
              disabled={disableReport}
              onClick={handleGenerateReport}
            >
              {reportGenerating ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <AssignmentIcon fontSize="small" />
              )}
              <Typography variant="button" sx={{ display: "block", fontSize: "0.75rem" }}>
                {reportGenerating ? "Generating…" : "Generate Report"}
              </Typography>
            </IconButton>
          </span>
        </Tooltip>
      </Toolbar>
    </>
  );
}

function StudyAccordionTable({
  studyId,
  seriesList,
  removeSeries,
  analysisStatus,
  getAnalysisStatus,
  onReportGenerated,
}) {
  const [selected, setSelected] = useState([]);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelected(seriesList);
    } else {
      setSelected([]);
    }
  };

  const handleSelectRow = (event, selectedSeries) => {
    if (event.target.checked) {
      setSelected((prevSelected) => [...prevSelected, selectedSeries]);
    } else {
      setSelected((prevSelected) =>
        prevSelected.filter(
          (series) => series.series_id !== selectedSeries.series_id
        )
      );
    }
  };

  const handleMenuClick = useCallback((event, id) => {
    setMenuAnchorEl(event.currentTarget);
    setSelectedSeriesId(id);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchorEl(null);
    setSelectedSeriesId(null);
  }, []);

  const handleRemoveSeries = useCallback(async (studyId, seriesId) => {
    await studyService.removeSeries(studyId, seriesId);
    removeSeries(studyId, seriesId);
    setSelected((prevSelected) =>
      prevSelected.filter((series) => series.series_id !== seriesId)
    );
  }, [removeSeries]);

  return (
    <Box sx={{ width: "100%" }}>
      <Paper
        sx={{
          width: "100%",
          mb: 2,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
        }}
        elevation={0}
      >
        {selected.length > 0 && (
          <StudyAccordionTableToolbar
            selected={selected}
            analysisStatus={analysisStatus}
            getAnalysisStatus={getAnalysisStatus}
            onReportGenerated={onReportGenerated}
          />
        )}
        <TableContainer sx={{ overflowX: "hidden" }}>
          <Table
            sx={{ width: "100%", minWidth: 0 }}
            aria-label="series table"
            size="small"
          >
            <TableHead>
              <TableRow sx={{ bgcolor: "rgba(255,255,255,0.02)" }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.length === seriesList.length}
                    onChange={handleSelectAll}
                    size="small"
                  />
                </TableCell>
                <TableCell sx={tableHeadCellSx}>Series UID</TableCell>
                <TableCell align="center" sx={tableHeadCellSx}>Anatomy</TableCell>
                <TableCell align="center" sx={tableHeadCellSx}>Modality</TableCell>
                <TableCell align="right" sx={tableHeadCellSx}>Instances</TableCell>
                <TableCell align="center" sx={tableHeadCellSx}>Status</TableCell>
                <TableCell align="center" sx={tableHeadCellSx}>Analysis</TableCell>
                <TableCell align="left" sx={tableHeadCellSx}>Uploaded</TableCell>
                <TableCell padding="none" />
              </TableRow>
            </TableHead>
            <TableBody>
              {seriesList.map((serie, index) => {
                const isItemSelected = selected.some(
                  (e) => e.series_id === serie.series_id
                );
                const analysisDetail = analysisStatus[index];
                return (
                  <TableRow
                    key={serie.series_id}
                    selected={isItemSelected}
                    tabIndex={-1}
                    role="checkbox"
                    aria-checked={isItemSelected}
                    sx={{
                      "&:last-child td, &:last-child th": { border: 0 },
                      "&.Mui-selected": {
                        bgcolor: "rgba(0, 191, 165, 0.06)",
                      },
                      "&:hover": {
                        bgcolor: "rgba(255,255,255,0.03)",
                      },
                      transition: "background-color 0.1s ease",
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        color="primary"
                        checked={isItemSelected}
                        onChange={(e) => handleSelectRow(e, serie)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell component="th" scope="row" sx={seriesUidCellSx}>
                      <Box component="span" sx={seriesUidTextSx}>
                        {serie.series_id}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="caption" sx={{ fontWeight: 500, letterSpacing: "0.02em" }}>
                        {serie.anatomy === "thigh"
                          ? "Thigh"
                          : serie.anatomy === "abd"
                            ? "Abdomen"
                            : "Unknown"}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={serie.modality === "ct" ? "CT" : "MR"}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          bgcolor: serie.modality === "ct"
                            ? "rgba(251, 191, 36, 0.12)"
                            : "rgba(99, 179, 237, 0.12)",
                          color: serie.modality === "ct"
                            ? "#fbbf24"
                            : "#63b3ed",
                          border: "1px solid",
                          borderColor: serie.modality === "ct"
                            ? "rgba(251, 191, 36, 0.3)"
                            : "rgba(99, 179, 237, 0.3)",
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="caption"
                        sx={{
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 500,
                          color: "text.secondary",
                        }}
                      >
                        {serie.num_frames}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <SerieAnalysisStatus analysisDetail={analysisDetail} />
                    </TableCell>
                    <TableCell align="center">
                      <AnalysisSelector analysisDetail={analysisDetail} />
                    </TableCell>
                    <TableCell align="left" sx={uploadedOnCellSx}>
                      {DateFormatter.format(new Date(serie.created_at))}
                    </TableCell>
                    <TableCell padding="none">
                      <IconButton
                        size="small"
                        onClick={(e) => handleMenuClick(e, serie.series_id)}
                        sx={{ opacity: 0.5, "&:hover": { opacity: 1 } }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                      <StudyAccordionTableRowMenu
                        studyId={studyId}
                        seriesId={serie.series_id}
                        selectedSeriesId={selectedSeriesId}
                        analysisDetail={analysisDetail}
                        menuAnchorEl={menuAnchorEl}
                        handleMenuClose={handleMenuClose}
                        handleRemoveSeries={async () =>
                          handleRemoveSeries(studyId, serie.series_id)
                        }
                        getAnalysisStatus={getAnalysisStatus}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

function StudyAccordion({
  study,
  removeStudy,
  removeSeries,
  reportStatusRefreshKey,
  analysisStatusRefreshKey,
}) {
  const showAlert = useAlert();
  const [analysisStatus, setAnalysisStatus] = useState([]);
  const [reports, setReports] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const isVisible = useVisibilityChange();

  const getAnalysisStatus = async () => {
    try {
      const responses = await Axios.all(
        study.series.map((serie) => analysisService.getStatus(serie.series_id))
      ).then((res) => res);
      console.debug(`Got analysis status ${JSON.stringify(responses)}`);
      setAnalysisStatus(responses);
    } catch (error) {
      console.error(
        `Failed to retrieve analysis status ${JSON.stringify(error.response?.data)}`
      );
    }
  };

  const getReportStatus = useCallback(async () => {
    try {
      const studyReports = await reportService.getAll(study.study_id);
      setReports(Array.isArray(studyReports) ? studyReports : []);
    } catch (error) {
      console.error(
        `Failed to retrieve reports ${JSON.stringify(error.response?.data)}`
      );
    }
  }, [study.study_id]);

  useInterval(getAnalysisStatus, isVisible ? 60000 : null);
  useInterval(getReportStatus, isVisible ? 60000 : null);

  useEffect(() => {
    getReportStatus();
  }, [getReportStatus, reportStatusRefreshKey]);

  useEffect(() => {
    getAnalysisStatus();
  }, [analysisStatusRefreshKey]);

  const analysisStatusLoaded = analysisStatus.length === study.series.length;
  const completedSeriesIds = new Set(
    analysisStatus
      .flat()
      .filter((analysis) => analysis.status === AnalysisStatus.COMPLETED)
      .map((analysis) => analysis.series)
  );
  const analysisTotal = study.series?.length || 0;
  const completedAnalysisCount = (study.series || []).filter((serie) =>
    completedSeriesIds.has(serie.series_id)
  ).length;
  const analysisProgressPercent =
    analysisTotal > 0 ? Math.round((completedAnalysisCount / analysisTotal) * 100) : 0;
  const isStudyAnalysed =
    analysisTotal > 0 &&
    analysisStatusLoaded &&
    completedAnalysisCount === analysisTotal;
  const hasPartialAnalysis =
    analysisStatusLoaded && completedAnalysisCount > 0 && completedAnalysisCount < analysisTotal;
  const analysisTooltip = analysisStatusLoaded
    ? completedAnalysisCount === 0
      ? "No scans analysed yet"
      : `${completedAnalysisCount} of ${analysisTotal} scan${analysisTotal === 1 ? "" : "s"} analysed`
    : "Checking analysis status";
  const reportableSeriesIds = analysisStatusLoaded
    ? completedSeriesIds
    : new Set((study.series || []).map((serie) => serie.series_id));
  const reportedSeriesIds = new Set(
    reports.flatMap((report) => parseReportSeries(report.series))
  );
  const reportedReportableSeriesCount = [...reportableSeriesIds].filter((seriesId) =>
    reportedSeriesIds.has(seriesId)
  ).length;
  const reportCoverageTotal = reportableSeriesIds.size;
  const reportStatus =
    reportedReportableSeriesCount === 0
      ? "none"
      : reportCoverageTotal > 0 && reportedReportableSeriesCount >= reportCoverageTotal
        ? "complete"
        : "partial";
  const reportTooltip =
    reportStatus === "complete"
      ? "Reports ready for all completed series"
      : reportStatus === "partial"
        ? `Reports ready for ${reportedReportableSeriesCount} of ${reportCoverageTotal} completed series`
        : "No report yet";

  const handleDeleteStudy = async () => {
    try {
      await studyService.remove(study.study_id);
      removeStudy(study.study_id);
      showAlert(
        `Removed study ${study.patient_name || study.patient_id}`,
        "success"
      );
    } catch (error) {
      showAlert(
        `Failed to delete study: ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
  };

  const [deleteProps, isDeleteOpen, openDelete] = useModal({
    handleConfirm: handleDeleteStudy,
    settings: {
      title: "Are you sure you would like to delete this study?",
      contents:
        "This will permanently remove the study, its series, and related analysis data. This action cannot be undone.",
      agreeText: "Delete study",
      disagreeText: "Cancel",
      destructive: true,
    },
  });

  return (
    <Accordion
      slotProps={{ transition: { unmountOnExit: true } }}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      sx={{
        border: "1px solid",
        borderColor: expanded ? "rgba(0, 191, 165, 0.2)" : "divider",
        borderRadius: "8px !important",
        "&:before": { display: "none" },
        mb: 1,
        transition: "border-color 0.2s ease",
        "&.Mui-expanded": {
          borderLeft: "3px solid",
          borderLeftColor: "primary.main",
        },
      }}
    >
      {isDeleteOpen && <ConfirmationModal {...deleteProps} />}
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ fontSize: 20, opacity: 0.6 }} />}
        sx={{
          px: 2,
          py: 0.5,
          minHeight: "60px",
          "&.Mui-expanded": { minHeight: "60px" },
          "& .MuiAccordionSummary-content": { my: 1 },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          sx={{ width: "100%", pr: 1 }}
        >
          <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600, lineHeight: 1.3 }}>
              {study.patient_name || study.patient_id}
            </Typography>
            <Typography
              variant="caption"
              color="text.disabled"
              noWrap
              sx={{ fontFamily: "monospace", fontSize: "0.7rem", letterSpacing: "0.02em" }}
            >
              {study.study_id}
            </Typography>
          </Stack>

          {/* Series count badge */}
          {study.series?.length > 0 && (
            <Chip
              label={`${study.series.length} series`}
              size="small"
              sx={{
                ml: 1.5,
                height: 20,
                fontSize: "0.68rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
                bgcolor: "rgba(255,255,255,0.05)",
                color: "text.disabled",
                border: "1px solid",
                borderColor: "divider",
              }}
            />
          )}

          {/* Dual ring indicators */}
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0, ml: 1.5 }}>
            <Tooltip title={analysisTooltip} placement="top">
              <Box
                sx={
                  isStudyAnalysed
                    ? ringStyle("#4ade80")
                    : hasPartialAnalysis
                      ? partialAnalysisRingStyle(analysisProgressPercent)
                      : dimRingStyle
                }
              >
                {hasPartialAnalysis ? (
                  <PartialAnalysisIcon progressPercent={analysisProgressPercent} />
                ) : (
                  <CheckCircleIcon
                    sx={{
                      fontSize: 14,
                      color: isStudyAnalysed ? "#4ade80" : "rgba(255,255,255,0.15)",
                    }}
                  />
                )}
              </Box>
            </Tooltip>
            <Tooltip title={reportTooltip} placement="top">
              <Box
                sx={
                  reportStatus === "complete"
                    ? ringStyle("#93c5fd")
                    : reportStatus === "partial"
                      ? partialReportRingStyle
                      : dimRingStyle
                }
              >
                {reportStatus === "partial" ? (
                  <PartialReportIcon />
                ) : (
                  <AssignmentIcon
                    sx={{
                      fontSize: 14,
                      color: reportStatus === "complete" ? "#93c5fd" : "rgba(255,255,255,0.15)",
                    }}
                  />
                )}
              </Box>
            </Tooltip>
          </Stack>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 2, pt: 0, pb: 1 }}>
        <StudyAccordionTable
          studyId={study.study_id}
          seriesList={study.series}
          removeSeries={removeSeries}
          analysisStatus={analysisStatus}
          getAnalysisStatus={getAnalysisStatus}
          onReportGenerated={getReportStatus}
        />
      </AccordionDetails>
      <AccordionActions
        sx={{
          px: 2,
          pb: 1.5,
          pt: 1,
          gap: 1,
          borderTop: "1px solid",
          borderColor: "divider",
          justifyContent: "flex-end",
        }}
      >
        <Button
          variant="contained"
          size="small"
          startIcon={<AssignmentIcon fontSize="inherit" />}
          color="secondary"
          LinkComponent={Link}
          to={`/reports/?studyId=${study.study_id}`}
          sx={{
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          View Reports
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<TroubleshootIcon fontSize="inherit" />}
          color="secondary"
          LinkComponent={Link}
          to={`/analysis/?studyId=${study.study_id}`}
          sx={{
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          View Analysis
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<DeleteIcon fontSize="inherit" />}
          color="error"
          onClick={() => openDelete(study.study_id)}
          sx={{
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          Delete
        </Button>
      </AccordionActions>
    </Accordion>
  );
}

export default function PaginatedStudyList({
  items,
  removeStudy,
  removeSeries,
  sortAZ,
  reportStatusRefreshKey = 0,
  analysisStatusRefreshKey = 0,
}) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const location = useLocation();
  const navigate = useNavigate();

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
    const params = new URLSearchParams(location.search);
    params.set("pageIndex", newPage);
    navigate({ search: params.toString() });
  };

  const handleChangeRowsPerPage = (event) => {
    const newRowsPerPage = parseInt(event.target.value, 10);
    setRowsPerPage(newRowsPerPage);
    setPage(0);
    const params = new URLSearchParams(location.search);
    params.set("rowsPerPage", newRowsPerPage);
    navigate({ search: params.toString() });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const savedPage = params.get("pageIndex");
    const savedRowsPerPage = params.get("rowsPerPage");

    if (savedPage) {
      setPage(parseInt(savedPage));
    }

    if (savedRowsPerPage) {
      setRowsPerPage(parseInt(savedRowsPerPage));
    }
  }, [location.search]);

  const sortedItems = sortAZ
    ? [...items].sort((a, b) => {
        const nameA = (a.patient_name || a.patient_id || "").toLowerCase();
        const nameB = (b.patient_name || b.patient_id || "").toLowerCase();
        return nameA.localeCompare(nameB);
      })
    : items;

  const displayedItems = sortedItems.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box sx={{ flex: 1, height: "100%" }}>
      <Grid container spacing={2}>
        {displayedItems.map((item) => (
          <Grid
            item
            xs={12}
            sm={6}
            md={4}
            key={item.study_id}
            sx={{ width: "100%" }}
          >
            <StudyAccordion
              study={item}
              removeStudy={removeStudy}
              removeSeries={removeSeries}
              reportStatusRefreshKey={reportStatusRefreshKey}
              analysisStatusRefreshKey={analysisStatusRefreshKey}
            />
          </Grid>
        ))}
      </Grid>

      <TablePagination
        rowsPerPageOptions={[10, 20, 30]}
        component="div"
        count={items.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        sx={{
          "& .MuiTablePagination-toolbar": {
            fontSize: "0.8rem",
          },
        }}
      />
    </Box>
  );
}
