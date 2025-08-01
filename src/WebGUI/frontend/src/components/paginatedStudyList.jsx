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
  CircularProgress,
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
import { useTaskAlert } from "../hooks/taskAlert";
import { useVisibilityChange } from "../hooks/visibility";
import { Queue, AnalysisStatus, DateFormatter } from "../constants";

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
          />
        );
      } else if (j.status === AnalysisStatus.FAILED) {
        return (
          <Chip
            icon={<ErrorIcon />}
            label="Failed"
            color="error"
            size="small"
          />
        );
      } else if (j.status === AnalysisStatus.CANCELED) {
        return (
          <Chip
            icon={<BlockIcon />}
            label="Canceled"
            color="warning"
            size="small"
          />
        );
      }
    return (
      <Chip
        icon={<CheckCircleIcon />}
        label="Completed"
        color="success"
        size="small"
      />
    );
  }
  return <Chip label="Not Analysed" size="small" />;
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
        spacing={1}
        alignItems={"center"}
        justifyContent={"center"}
      >
        {analysisDetail.map((e) => {
          const label =
            e.queue === Queue.CALCIUM
              ? "C"
              : e.queue === Queue.EAT
                ? "E"
                : e.queue === Queue.CTCA
                  ? "SP"
                  : null;
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
  return "-";
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
      >
        <MenuItem onClick={() => setShowPreviewModal(true)}>Preview</MenuItem>
        <MenuItem onClick={cancelAnalysisHandler} disabled={!isAnalysing}>
          Cancel Analysis
        </MenuItem>
        <MenuItem onClick={() => openDelete()} disabled={isAnalysing}>
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
  generateReport,
}) {
  const showAlert = useAlert();
  const taskAlert = useTaskAlert();
  const [loading, setLoading] = useState(false);
  console.debug(
    `StudyAccordionTableToolbar got selected items ${JSON.stringify(selected)}`
  );
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

  const disableReport =
    selected.length === 0 ||
    selected.length > 2 ||
    isAnalysing ||
    selected.filter((e) => e.modality === "ctca").length > 1 ||
    selected.filter((e) => e.modality === "ncct").length > 1;

  const reportInProgressMessage = (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="common.white">
        Generating report
      </Typography>
      <CircularProgress size="1rem" thickness={4} />
    </Stack>
  );

  const reportSuccessAction = useCallback(async (taskId) => {
    const response = await reportService.download(taskId);
    const url = URL.createObjectURL(response);
    const tab = window.open(url, "_blank");
    if (!tab || tab.closed) {
      showAlert(
        "Popup blocked. Please allow popups to download the report",
        "error"
      );
    }
  }, []);

  const handleGenerateReport = async () => {
    const seriesIds = selected.map((e) => e.series_id);
    try {
      const response = await generateReport(seriesIds);
      taskAlert.show(
        reportInProgressMessage,
        {
          actionText: "View Report",
          onAction: async () => reportSuccessAction(response.id),
        },
        {
          taskId: response.id,
          callback: reportService.getDetail,
          pollInterval: 5000,
        }
      );
    } catch (error) {
      showAlert(
        `Failed to generate report ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
  };

  return (
    <Toolbar
      sx={[
        {
          pl: { sm: 2 },
          pr: { xs: 1, sm: 1 },
          bgcolor: (theme) =>
            alpha(
              theme.palette.primary.main,
              theme.palette.action.activatedOpacity
            ),
        },
      ]}
    >
      <Typography
        sx={{ flex: "1 1 100%" }}
        color="inherit"
        variant="subtitle1"
        component="div"
      >
        {selected.length} selected
      </Typography>
      <IconButton
        sx={{ display: "flex", flexDirection: "row", borderRadius: 1.5 }}
        onClick={startAnalysisHandler}
        disabled={isAnalysing}
        loading={loading}
      >
        <TroubleshootIcon />
        <Typography variant="button" sx={{ display: "block" }}>
          Analyse
        </Typography>
      </IconButton>
      <Tooltip title="Generate a report from the analysis of a Non-contrast and/or Contrast series">
        <span style={{ whiteSpace: "pre", textWrap: "nowrap" }}>
          <IconButton
            sx={{ borderRadius: 1.5 }}
            disabled={disableReport}
            onClick={handleGenerateReport}
          >
            <AssignmentIcon />
            <Typography variant="button" sx={{ display: "block" }}>
              Generate Report
            </Typography>
          </IconButton>
        </span>
      </Tooltip>
    </Toolbar>
  );
}

function StudyAccordionTable({ studyId, seriesList, removeSeries }) {
  const [selected, setSelected] = useState([]);
  const [analysisStatus, setAnalysisStatus] = useState([]);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);
  const isVisible = useVisibilityChange();

  const getAnalysisStatus = async () => {
    try {
      const responses = await Axios.all(
        seriesList.map((serie) => analysisService.getStatus(serie.series_id))
      ).then((res) => res);
      console.debug(`Got analysis status ${JSON.stringify(responses)}`);
      setAnalysisStatus(responses);
    } catch (error) {
      console.error(
        `Failed to retrieve analysis status ${JSON.stringify(error.response?.data)}`
      );
    }
  };

  // Setup interval to poll analysis status every 60s
  useInterval(getAnalysisStatus, isVisible ? 60000 : null);

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
  }, []);

  const generateReport = useCallback(async (seriesIds) => {
    const response = await studyService.generateReport(studyId, seriesIds);
    return response;
  }, []);

  return (
    <Box sx={{ width: "100%" }}>
      <Paper sx={{ width: "100%", mb: 2 }}>
        {selected.length > 0 && (
          <StudyAccordionTableToolbar
            selected={selected}
            analysisStatus={analysisStatus}
            getAnalysisStatus={getAnalysisStatus}
            generateReport={generateReport}
          />
        )}
        <TableContainer>
          <Table sx={{ minWidth: 650 }} aria-label="simple table" size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.length === seriesList.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell>Series UID</TableCell>
                <TableCell align="center">Type</TableCell>
                <TableCell align="center">Instances</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Analysis</TableCell>
                <TableCell align="left">Uploaded On</TableCell>
                <TableCell padding="none"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {seriesList.map((serie, index) => {
                const isItemSelected = selected.some(
                  (e) => e.series_id === serie.series_id
                );
                const analysisDetail = analysisStatus[index]; // List of analysis jobs for this series
                return (
                  <TableRow
                    key={serie.series_id}
                    selected={isItemSelected}
                    tabIndex={-1}
                    role="checkbox"
                    aria-checked={isItemSelected}
                    sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        color="primary"
                        checked={isItemSelected}
                        onChange={(e) => handleSelectRow(e, serie)}
                      />
                    </TableCell>
                    <TableCell component="th" scope="row">
                      {serie.series_id}
                    </TableCell>
                    <TableCell align="center">
                      {serie.modality === "ctca" ? "Contrast" : "Non-contrast"}
                    </TableCell>
                    <TableCell align="right">{serie.num_frames}</TableCell>
                    <TableCell align="center">
                      <SerieAnalysisStatus analysisDetail={analysisDetail} />
                    </TableCell>
                    <TableCell align="center">
                      <AnalysisSelector analysisDetail={analysisDetail} />
                    </TableCell>
                    <TableCell align="left">
                      {DateFormatter.format(new Date(serie.created_at))}
                    </TableCell>
                    <TableCell padding="none">
                      <IconButton
                        onClick={(e) => handleMenuClick(e, serie.series_id)}
                      >
                        <MoreVertIcon />
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

function StudyAccordion({ study, removeStudy, removeSeries }) {
  const showAlert = useAlert();
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
  });

  return (
    <Accordion slotProps={{ transition: { unmountOnExit: true } }}>
      {isDeleteOpen && <ConfirmationModal {...deleteProps} />}
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack spacing={2}>
          <Typography variant="h6">
            {study.patient_name || study.patient_id}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {study.study_id}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <StudyAccordionTable
          studyId={study.study_id}
          seriesList={study.series}
          removeSeries={removeSeries}
        />
      </AccordionDetails>
      <AccordionActions>
        <Button
          variant="contained"
          size="small"
          startIcon={<AssignmentIcon fontSize="inherit" />}
          color="secondary"
          LinkComponent={Link}
          to={`/reports/?studyId=${study.study_id}`}
        >
          View all Reports
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<TroubleshootIcon fontSize="inherit" />}
          color="secondary"
          LinkComponent={Link}
          to={`/analysis/?studyId=${study.study_id}`}
        >
          View all Analysis
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<DeleteIcon fontSize="inherit" />}
          color="error"
          onClick={() => openDelete(study.study_id)}
        >
          Delete Study
        </Button>
      </AccordionActions>
    </Accordion>
  );
}

export default function PaginatedStudyList({
  items,
  removeStudy,
  removeSeries,
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

  const displayedItems = items.slice(
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
      />
    </Box>
  );
}
