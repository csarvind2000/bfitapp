import { useState, useCallback, useEffect, useMemo } from "react";
import * as React from "react";
import { useAlert } from "../hooks/alert";
import { useLocation, useNavigate } from "react-router";
import {
  PageContainer,
  PageHeader,
  PageHeaderToolbar,
} from "@toolpad/core/PageContainer";
import { Button, Stack, TextField, MenuItem } from "@mui/material";
import UploadIcon from "@mui/icons-material/Upload";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import RefreshIcon from "@mui/icons-material/Refresh";
import CancelIcon from "@mui/icons-material/Cancel";
import PACSImportModal from "../components/pacsImportModal";
import UploadModal from "../components/uploadModal";
import PaginatedStudyList from "../components/paginatedStudyList";
import studyService from "../services/studies";

interface CustomPageToolbarProps {
  setShowUploadModal: React.Dispatch<React.SetStateAction<boolean>>;
  setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>;
  getStudy: () => void;
}

interface SearchBarProps {
  searchFilter: SearchFilter;
  setSearchFilter: React.Dispatch<React.SetStateAction<SearchFilter>>;
}

interface SearchFilter {
  patientId: string;
  patientName: string;
  studyId: string;
  seriesId: string;
  type: string;
}

const initialSearchFilter: SearchFilter = {
  patientId: "",
  patientName: "",
  studyId: "",
  seriesId: "",
  type: "",
};

export interface Series {
  series_id: string;
  modality: string;
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

function SearchBar({ searchFilter, setSearchFilter }: SearchBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
      <TextField
        name="patientId"
        label="Patient ID"
        color="secondary"
        variant="outlined"
        size="small"
        value={searchFilter.patientId}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const { name, value } = event.currentTarget;
          setSearchFilter((prevSearchFilter) => ({
            ...prevSearchFilter,
            [name]: value,
          }));
          const params = new URLSearchParams(location.search);
          params.set("patientId", value);
          navigate({ search: params.toString() });
        }}
        fullWidth
        sx={{ maxWidth: "180px" }}
      />
      <TextField
        name="patientName"
        label="Patient Name"
        color="secondary"
        variant="outlined"
        size="small"
        value={searchFilter.patientName}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const { name, value } = event.currentTarget;
          setSearchFilter((prevSearchFilter) => ({
            ...prevSearchFilter,
            [name]: value,
          }));
          const params = new URLSearchParams(location.search);
          params.set("patientName", value);
          navigate({ search: params.toString() });
        }}
        fullWidth
        sx={{ maxWidth: "180px" }}
      />
      <TextField
        name="studyId"
        label="Study Instance UID"
        color="secondary"
        variant="outlined"
        size="small"
        value={searchFilter.studyId}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const { name, value } = event.currentTarget;
          setSearchFilter((prevSearchFilter) => ({
            ...prevSearchFilter,
            [name]: value,
          }));
          const params = new URLSearchParams(location.search);
          params.set("studyId", value);
          navigate({ search: params.toString() });
        }}
        fullWidth
        sx={{ maxWidth: "180px" }}
      />
      <TextField
        name="seriesId"
        label="Series Instance UID"
        color="secondary"
        variant="outlined"
        size="small"
        value={searchFilter.seriesId}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const { name, value } = event.currentTarget;
          setSearchFilter((prevSearchFilter) => ({
            ...prevSearchFilter,
            [name]: value,
          }));
          const params = new URLSearchParams(location.search);
          params.set("seriesId", value);
          navigate({ search: params.toString() });
        }}
        fullWidth
        sx={{ maxWidth: "180px" }}
      />
      <TextField
        name="type"
        label="Type"
        color="secondary"
        variant="outlined"
        size="small"
        defaultValue={""}
        select
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
          const { name, value } = event.target;
          setSearchFilter((prevSearchFilter) => ({
            ...prevSearchFilter,
            [name]: value,
          }));
          const params = new URLSearchParams(location.search);
          params.set("type", value);
          navigate({ search: params.toString() });
        }}
        fullWidth
        sx={{ maxWidth: "180px" }}
      >
        {[
          { value: "ncct", label: "non-contrast" },
          { value: "ctca", label: "contrast" },
        ].map((type) => (
          <MenuItem key={type.value} value={type.value}>
            {type.label}
          </MenuItem>
        ))}
      </TextField>
      <Button
        variant="outlined"
        color="secondary"
        startIcon={<CancelIcon fontSize="inherit" />}
        onClick={() => {
          setSearchFilter(initialSearchFilter);
          const params = new URLSearchParams(location.search);
          Object.keys(initialSearchFilter).forEach((key) => {
            params.delete(key);
          });
          navigate({ search: params.toString() });
        }}
        size="small"
      >
        Clear Filters
      </Button>
    </Stack>
  );
}

export default function StudiesPage() {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [studiesData, setStudiesData] = useState<Study[]>([]);
  const [searchFilter, setSearchFilter] =
    useState<SearchFilter>(initialSearchFilter);
  const showAlert = useAlert();
  const location = useLocation();

  const CustomPageHeaderComponent = useCallback(
    () => (
      <CustomPageHeader
        setShowUploadModal={setShowUploadModal}
        setShowImportModal={setShowImportModal}
        getStudy={getStudy}
      />
    ),
    [setShowUploadModal, setShowUploadModal]
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
          `Failed to retrieve studies ${JSON.stringify(error.response?.data)}`,
          "error"
        );
      });
  }, []);

  const hasSearchFilterApplied = () => {
    return Object.values(searchFilter).some((value) => value !== "");
  };

  useEffect(getStudy, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const patientId = params.get("patientId") || "";
    const patientName = params.get("patientName") || "";
    const studyId = params.get("studyId") || "";
    const seriesId = params.get("seriesId") || "";
    const type = params.get("type") || "";

    setSearchFilter({
      patientId,
      patientName,
      studyId,
      seriesId,
      type,
    });
  }, [location.search]);

  const filteredStudies = () => {
    if (!hasSearchFilterApplied()) {
      return studiesData;
    }
    return studiesData.filter((study: Study) => {
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
          )) &&
        (searchFilter.type === "" ||
          study.series.some((series) =>
            series.modality.includes(searchFilter.type)
          ))
      );
    });
  };

  return (
    <PageContainer
      slots={{
        header: CustomPageHeaderComponent,
      }}
    >
      <SearchBar
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
      />
      <PaginatedStudyList
        items={filteredStudies()}
        removeStudy={removeStudy}
        removeSeries={removeSeries}
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
