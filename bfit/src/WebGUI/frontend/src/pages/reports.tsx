import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router";
import { useAlert } from "../hooks/alert";
import { PageContainer } from "@toolpad/core/PageContainer";
import ReportDataTable from "../components/reportDataTable";
import reportService from "../services/reports";
import StudyFilterBar, {
  getInitialStudyFilterState,
  persistStudyFilterState,
} from "../components/studyFilterBar";

export interface Report {
  id: string;
  status: string;
  file: string;
  created_at: string;
  study: string;
  patient_id: string;
  patient_name: string;
  series: string; // JSON array
}

const reportsFilterStorageKey = "reportsPageStudyFilter";

export default function ReportsPage() {
  const [reportData, setReportData] = useState<Report[]>([]);
  const location = useLocation();
  const showAlert = useAlert();
  const [searchFilter, setSearchFilter] = useState(() =>
    getInitialStudyFilterState(location.search, reportsFilterStorageKey)
      .searchFilter
  );
  const [tableSortModel, setTableSortModel] = useState([]);

  const getReports = () => {
    reportService
      .getAll(null)
      .then((data) => {
        console.debug(`Retrieved reports ${JSON.stringify(data)}`);
        setReportData(data);
      })
      .catch((error) => {
        showAlert(
          `Failed to retrieve reports ${JSON.stringify(error.response?.data)}`,
          "error"
        );
      });
  };

  const removeReport = useCallback((id: string) => {
    setReportData((prevReportData) =>
      prevReportData.filter((report) => report.id !== id)
    );
  }, []);

  useEffect(getReports, []);

  useEffect(() => {
    const nextFilterState = getInitialStudyFilterState(
      location.search,
      reportsFilterStorageKey
    );
    setSearchFilter(nextFilterState.searchFilter);
    persistStudyFilterState(
      reportsFilterStorageKey,
      nextFilterState.searchFilter,
      false
    );
  }, [location.search]);

  const displayedReportData = useMemo(() => {
    const hasSearchFilterApplied = Object.values(searchFilter).some(
      (value) => value !== ""
    );
    const filteredReports = hasSearchFilterApplied
      ? reportData.filter((report: Report) => {
          return (
            (searchFilter.patientId === "" ||
              (report.patient_id || "")
                .toLowerCase()
                .includes(searchFilter.patientId.toLowerCase())) &&
            (searchFilter.patientName === "" ||
              (report.patient_name || "")
                .toLowerCase()
                .includes(searchFilter.patientName.toLowerCase())) &&
            (searchFilter.studyId === "" ||
              report.study.includes(searchFilter.studyId)) &&
            (searchFilter.seriesId === "" ||
              report.series.includes(searchFilter.seriesId))
          );
        })
      : reportData;

    return filteredReports;
  }, [reportData, searchFilter]);

  return (
    <PageContainer>
      <StudyFilterBar
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        storageKey={reportsFilterStorageKey}
        onClearFilters={() => setTableSortModel([])}
      />
      <ReportDataTable
        items={displayedReportData}
        removeReport={removeReport}
        sortModel={tableSortModel}
        onSortModelChange={setTableSortModel}
      />
    </PageContainer>
  );
}
