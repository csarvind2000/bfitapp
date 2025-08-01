import { useState, useEffect, useMemo } from "react";
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Modal,
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import { DataGrid } from "@mui/x-data-grid";
import { useAlert } from "../hooks/alert";
import studyService from "../services/studies";

export default function PACSImportModal({ open, onClose, importedStudies }) {
  const [pacsStudies, setPACSStudies] = useState([]);
  const [importedSeries, setImportedSeries] = useState([]);
  const [importing, setImporting] = useState(false);
  const showAlert = useAlert();
  const columns = useMemo(
    () => [
      {
        field: "series_id",
        headerName: "Series UID",
        editable: false,
        flex: 1,
      },
      { field: "study_id", headerName: "Study UID", editable: false, flex: 1 },
      {
        field: "patient_id",
        headerName: "Patient ID",
        editable: false,
        flex: 1,
      },
      {
        field: "patient_name",
        headerName: "Patient Name",
        width: 120,
        editable: false,
      },
      {
        field: "modality",
        headerName: "Modality",
        editable: false,
        width: 120,
        valueGetter: (value, row) =>
          `${row.modality === "ncct" ? "Non-contrast" : "Contrast"}`,
      },
      {
        field: "num_frames",
        headerName: "Instances",
        editable: false,
        flex: 1,
      },
    ],
    []
  );
  const getRowId = useMemo(() => (row) => row.series_id, []);
  const [selectedRows, setSelectedRows] = useState([]);

  const fetchPACSStudies = async () => {
    try {
      const studies = await studyService.getAllFromPACS();
      console.debug(`Got PACS studies ${JSON.stringify(studies)}`);
      setPACSStudies(studies);
    } catch (error) {
      showAlert(
        `Failed to fetch PACS studies ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
  };

  const importSelectedSeries = async () => {
    try {
      console.debug(`Import selected series ${selectedRows}`);
      setImporting(true);
      const response = await studyService.createFromPACS(selectedRows);
      setImportedSeries((prevImportedSeries) => [
        ...prevImportedSeries,
        ...response,
      ]);
      showAlert("Successfully imported selected series", "success");
    } catch (error) {
      showAlert(
        `Failed to import selected series ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
    setImporting(false);
  };

  useEffect(() => {
    fetchPACSStudies();
  }, []);

  useEffect(() => {
    if (importedStudies.length > 0) {
      const data = [];
      importedStudies.forEach((study) => {
        const series = study.series;
        series.forEach((serie) => {
          data.push({
            ...serie,
            study_id: study.study_id,
            patient_id: study.patient_id,
            patient_name: study.patient_name,
          });
        });
      });
      setImportedSeries(data);
    }
  }, [importedStudies]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="pacs-import-modal"
      aria-describedby="pacs-import-modal-detail"
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          bgcolor: "background.paper",
          boxShadow: 24,
          p: 4,
          borderRadius: 2,
          width: "800px",
          minHeight: "50vh",
          maxHeight: "90%",
          display: "flex",
          overflow: "auto",
          flexDirection: "column",
        }}
      >
        <Typography id="pacs-import-modal" variant="h6" component="h2">
          Import DICOM Series
        </Typography>
        <Grid
          container
          spacing={1}
          sx={{ display: "flex", flexDirection: "row", flexGrow: 1 }}
        >
          <Grid key={0} size={12} display="block">
            <Box sx={{ flex: 1, height: "100%" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography
                  variant="subtitle1"
                  sx={{ mt: 2 }}
                  fontWeight="medium"
                >
                  Select series to import
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FormControl sx={{ m: 1, minWidth: 120 }} size="small">
                    <InputLabel id="pacs-import-modal-select-label">
                      Source
                    </InputLabel>
                    <Select
                      id="pacs-import-modal-select"
                      defaultValue="Local DICOM Server"
                      value="Local DICOM Server"
                      label="Source"
                    >
                      <MenuItem value="Local DICOM Server">
                        Local DICOM Server
                      </MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={() => fetchPACSStudies()}
                    startIcon={<RefreshIcon fontSize="inherit" />}
                    size="small"
                  >
                    Refresh Series
                  </Button>
                </Box>
              </Box>
              <Paper sx={{ width: "100%", mb: 2 }}>
                <DataGrid
                  rows={pacsStudies}
                  columns={columns}
                  initialState={{
                    pagination: {
                      paginationModel: {
                        pageSize: 10,
                      },
                    },
                  }}
                  pageSizeOptions={[10, 20, 30]}
                  checkboxSelection
                  getRowId={getRowId}
                  onRowSelectionModelChange={(newRowSelectionModel) =>
                    setSelectedRows(newRowSelectionModel)
                  }
                />
              </Paper>
            </Box>
          </Grid>
          <Grid key={1} size={12} display="block">
            <Box sx={{ flex: 1, height: "100%" }}>
              <Typography
                variant="subtitle1"
                sx={{ mt: 2 }}
                fontWeight="medium"
              >
                Imported series
              </Typography>
              <Paper sx={{ width: "100%", mb: 2, overflow: "auto" }}>
                <DataGrid
                  rows={importedSeries}
                  columns={columns}
                  initialState={{
                    pagination: {
                      paginationModel: {
                        pageSize: 10,
                      },
                    },
                  }}
                  pageSizeOptions={[10, 20, 30]}
                  getRowId={getRowId}
                />
              </Paper>
            </Box>
          </Grid>
        </Grid>
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => importSelectedSeries()}
            startIcon={<SaveAltIcon fontSize="inherit" />}
            disabled={importing || selectedRows.length === 0}
            loading={importing}
          >
            Import Selected Series
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}
