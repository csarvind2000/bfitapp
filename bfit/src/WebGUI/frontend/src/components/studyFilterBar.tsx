import * as React from "react";
import { Button, Stack, TextField } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import CancelIcon from "@mui/icons-material/Cancel";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import { useLocation, useNavigate } from "react-router";

export interface StudySearchFilter {
  patientId: string;
  patientName: string;
  studyId: string;
  seriesId: string;
}

export const initialStudySearchFilter: StudySearchFilter = {
  patientId: "",
  patientName: "",
  studyId: "",
  seriesId: "",
};

interface PersistedStudyFilterState {
  searchFilter: StudySearchFilter;
  sortAZ: boolean;
}

const filterFieldSx: SxProps<Theme> = {
  flex: "1 1 180px",
  minWidth: 160,
};

const controlButtonSx: SxProps<Theme> = {
  height: 30,
  whiteSpace: "nowrap",
  flexShrink: 0,
};

export const studySearchFilterKeys = Object.keys(
  initialStudySearchFilter
) as (keyof StudySearchFilter)[];

export function getStudySearchFilterFromSearch(search: string): StudySearchFilter {
  const params = new URLSearchParams(search);
  return {
    patientId: params.get("patientId") || "",
    patientName: params.get("patientName") || "",
    studyId: params.get("studyId") || "",
    seriesId: params.get("seriesId") || "",
  };
}

export function hasStudySearchFilterApplied(searchFilter: StudySearchFilter) {
  return studySearchFilterKeys.some((key) => searchFilter[key] !== "");
}

export function getSearchWithStudySearchFilter(
  search: string,
  searchFilter: StudySearchFilter
) {
  const params = new URLSearchParams(search);
  studySearchFilterKeys.forEach((key) => {
    const value = searchFilter[key];
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  });
  return params.toString();
}

function getStoredStudyFilterState(
  storageKey: string
): PersistedStudyFilterState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(storageKey);
  if (!storedValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as Partial<PersistedStudyFilterState>;
    return {
      searchFilter: {
        ...initialStudySearchFilter,
        ...parsedValue.searchFilter,
      },
      sortAZ: Boolean(parsedValue.sortAZ),
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function getInitialStudyFilterState(
  search: string,
  storageKey: string
): PersistedStudyFilterState {
  const searchFilter = getStudySearchFilterFromSearch(search);
  const storedState = getStoredStudyFilterState(storageKey);

  return {
    searchFilter: hasStudySearchFilterApplied(searchFilter)
      ? searchFilter
      : storedState?.searchFilter || initialStudySearchFilter,
    sortAZ: storedState?.sortAZ || false,
  };
}

export function persistStudyFilterState(
  storageKey: string,
  searchFilter: StudySearchFilter,
  sortAZ: boolean
) {
  if (typeof window === "undefined") {
    return;
  }

  if (!hasStudySearchFilterApplied(searchFilter) && !sortAZ) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ searchFilter, sortAZ })
  );
}

export function clearPersistedStudyFilterState(storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKey);
}

interface StudyFilterBarProps {
  searchFilter: StudySearchFilter;
  setSearchFilter: React.Dispatch<React.SetStateAction<StudySearchFilter>>;
  sortAZ: boolean;
  setSortAZ: React.Dispatch<React.SetStateAction<boolean>>;
  storageKey: string;
}

export default function StudyFilterBar({
  searchFilter,
  setSearchFilter,
  sortAZ,
  setSortAZ,
  storageKey,
}: StudyFilterBarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleFilterChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const name = event.currentTarget.name as keyof StudySearchFilter;
    const value = event.currentTarget.value;
    const nextSearchFilter = { ...searchFilter, [name]: value };
    setSearchFilter(nextSearchFilter);
    persistStudyFilterState(storageKey, nextSearchFilter, sortAZ);

    navigate({
      search: getSearchWithStudySearchFilter(location.search, nextSearchFilter),
    });
  };

  const handleClearFilters = () => {
    setSearchFilter(initialStudySearchFilter);
    setSortAZ(false);
    clearPersistedStudyFilterState(storageKey);

    const params = new URLSearchParams(location.search);
    studySearchFilterKeys.forEach((key) => params.delete(key));
    navigate({ search: params.toString() });
  };

  return (
    <Stack
      direction="row"
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      sx={{ gap: 1.5, mb: 2, maxWidth: 1160, width: "100%" }}
    >
      <TextField
        name="patientId"
        label="Patient ID"
        color="secondary"
        variant="outlined"
        size="small"
        value={searchFilter.patientId}
        onChange={handleFilterChange}
        sx={filterFieldSx}
      />
      <TextField
        name="patientName"
        label="Patient Name"
        color="secondary"
        variant="outlined"
        size="small"
        value={searchFilter.patientName}
        onChange={handleFilterChange}
        sx={filterFieldSx}
      />
      <TextField
        name="studyId"
        label="Study Instance UID"
        color="secondary"
        variant="outlined"
        size="small"
        value={searchFilter.studyId}
        onChange={handleFilterChange}
        sx={filterFieldSx}
      />
      <TextField
        name="seriesId"
        label="Series Instance UID"
        color="secondary"
        variant="outlined"
        size="small"
        value={searchFilter.seriesId}
        onChange={handleFilterChange}
        sx={filterFieldSx}
      />
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
        onClick={handleClearFilters}
        sx={controlButtonSx}
      >
        Clear Filters
      </Button>
    </Stack>
  );
}
