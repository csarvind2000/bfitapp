import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAlert } from "../hooks/alert";
import { DataGrid } from "@mui/x-data-grid";
import { Box, Paper, Tooltip, Stack, IconButton } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import { Queue, DateFormatter } from "../constants";
import analysisService from "../services/analysis";

export default function AnalysisDataTable({
  items,
  removeAnalysis,
  openResultModal,
}) {
  const showAlert = useAlert();
  const columns = useMemo(
    () => [
      { field: "id", headerName: "ID", width: 160, sortable: false },
      {
        field: "queue",
        headerName: "Type",
        width: 130,
        editable: false,
        valueGetter: (value, row) =>
          `${row.queue === Queue.CALCIUM ? "Calcium" : row.queue === Queue.EAT ? "EAT" : "Stenosis/Plaque"}`,
      },
      {
        field: "series",
        headerName: "Series UID",
        width: 270,
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
        field: "ended_at",
        headerName: "Completed On",
        width: 160,
        editable: false,
        valueGetter: (value, row) => row.ended_at,
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
          const deleteAnalysisHandler = async () => {
            try {
              const analysisId = params.row.id;
              await analysisService.remove(analysisId);
              removeAnalysis(analysisId);
            } catch (error) {
              showAlert(
                `Failed to delete analysis ${JSON.stringify(error.response?.data)}`,
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
              <Tooltip title="View Result">
                <IconButton
                  sx={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    borderRadius: 1.5,
                  }}
                  // LinkComponent={Link}
                  // to={`/analysis/${params.row.id}`}
                  onClick={() => openResultModal(params.row.id)}
                >
                  <VisibilityIcon fontSize="inherit" />
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
                  onClick={deleteAnalysisHandler}
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
