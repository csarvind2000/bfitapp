import { useState, useEffect, useMemo } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { Box, Paper, Tooltip, Stack, IconButton } from "@mui/material";
import { useLocation, useNavigate } from "react-router";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import { useAlert } from "../hooks/alert";
import { DateFormatter } from "../constants";
import reportService from "../services/reports";

export default function ReportDataTable({ items, removeReport }) {
  const showAlert = useAlert();
  const columns = useMemo(
    () => [
      { field: "id", headerName: "ID", width: 160, sortable: false },
      {
        field: "patient_name",
        headerName: "Patient Name",
        width: 160,
        flex: 1,
        editable: false,
      },
      {
        field: "patient_id",
        headerName: "Patient ID",
        width: 160,
        flex: 1,
        editable: false,
      },
      {
        field: "study",
        headerName: "Study UID",
        width: 270,
        flex: 1,
        editable: false,
      },
      {
        field: "series",
        headerName: "Series UID",
        width: 270,
        flex: 1,
        editable: false,
        valueFormatter: (value) => {
          return JSON.parse(value).join(", ");
        },
      },
      {
        field: "created_at",
        headerName: "Generated On",
        width: 160,
        editable: false,
        valueGetter: (value, row) => row.created_at,
        valueFormatter: (value) => {
          return `${DateFormatter.format(new Date(value))}`;
        },
        sortComparator: (value1, value2) => {
          const date1 = new Date(value1);
          const date2 = new Date(value2);
          return date1 - date2;
        },
      },
      {
        field: "actions",
        headerName: "Actions",
        width: 100,
        filterable: false,
        sortable: false,
        renderCell: (params) => {
          const downloadReportHandler = async () => {
            const reportId = params.row.id;
            const response = await reportService.download(reportId);
            const url = URL.createObjectURL(response);
            const tab = window.open(url, "_blank");
            if (!tab || tab.closed) {
              showAlert(
                "Popup blocked. Please allow popups to download the report",
                "error"
              );
            }
          };
          const deleteReportHandler = async () => {
            try {
              const reportId = params.row.id;
              await reportService.remove(reportId);
              removeReport(reportId);
            } catch (error) {
              showAlert(
                `Failed to delete report ${JSON.stringify(error.response?.data)}`,
                "error"
              );
            }
          };
          return (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                justifyContent: "center",
                alignItems: "center",
                paddingTop: 0.5,
              }}
            >
              <Tooltip title="Download Report">
                <IconButton
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    borderRadius: 1.5,
                  }}
                  onClick={downloadReportHandler}
                >
                  <DownloadIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    borderRadius: 1.5,
                  }}
                  onClick={deleteReportHandler}
                >
                  <DeleteIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            </Stack>
          );
        },
      },
    ],
    []
  );
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const location = useLocation();
  const navigate = useNavigate();

  const paginationModelHandler = (newPaginationModel, _) => {
    const { page, pageSize } = newPaginationModel;
    setPage(page);
    setPageSize(pageSize);
    const params = new URLSearchParams(location.search);
    params.set("pageIndex", page);
    params.set("rowsPerPage", pageSize);
    navigate({ search: params.toString() });
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const savedPage = params.get("pageIndex");
    const savedPageSize = params.get("rowsPerPage");

    if (savedPage) {
      setPage(parseInt(savedPage));
    }

    if (savedPageSize) {
      setPageSize(parseInt(savedPageSize));
    }
  }, [location.search]);

  return (
    <Box sx={{ flex: 1, height: "100%" }}>
      <Paper sx={{ width: "100%", mb: 2 }}>
        <DataGrid
          rows={items}
          columns={columns}
          paginationModel={{ page, pageSize }}
          pageSizeOptions={[10, 20, 30]}
          onPaginationModelChange={paginationModelHandler}
        />
      </Paper>
    </Box>
  );
}
