import * as React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { PageContainer } from "@toolpad/core/PageContainer";
import { useActivePage } from "@toolpad/core/useActivePage";
import AnalysisDataTable from "../components/analysisDataTable";
import AnalysisResultModal from "../components/analysisResultModal";
import { useLocation, useParams } from "react-router";
import invariant from "invariant";
import analysisService from "../services/analysis";
import { useAlert } from "../hooks/alert";
import { Queue } from "../constants";
import StudyFilterBar, {
  getInitialStudyFilterState,
  persistStudyFilterState,
} from "../components/studyFilterBar";

export type QueueType = (typeof Queue)[keyof typeof Queue];

export interface Analysis {
  id: string;
  patient_name: string;
  patient_id: string;
  anatomy: string;
  series: string;
  study: string;
  queue: QueueType;
  status: string;
  created_at: string;
  ended_at: string;
}

const analysisFilterStorageKey = "analysisPageStudyFilter";

export default function AnalysisPage() {
  const location = useLocation();
  const params = useParams<{ analysisId: string }>();
  const activePage = useActivePage();
  const showAlert = useAlert();
  invariant(activePage, "No navigation match");
  const [analysisData, setAnalysisData] = useState<Analysis[]>([]);
  const [showResultModal, setShowResultModal] = useState(false);
  const [analysisIdForModal, setAnalysisIdForModal] = useState<string | null>(
    null
  );
  const [searchFilter, setSearchFilter] = useState(() =>
    getInitialStudyFilterState(location.search, analysisFilterStorageKey)
      .searchFilter
  );
  const [tableSortModel, setTableSortModel] = useState([]);

  const title = params.analysisId ? `Analysis ${params.analysisId}` : undefined;
  const path = title ? `${activePage.path}/${params.analysisId}` : undefined;
  const breadcrumbs = title
    ? [...activePage.breadcrumbs, { title, path }]
    : undefined;

  const getAnalysis = () => {
    analysisService
      .getCompleted(null, null)
      .then((data) => {
        console.debug(`Retrieved completed analysis ${JSON.stringify(data)}`);
        setAnalysisData(data);
      })
      .catch((error) => {
        showAlert(
          `Failed to retrieve completed analysis ${JSON.stringify(error.response?.data)}`,
          "error"
        );
      });
  };

  const openResultModal = useCallback((analysisId: string) => {
    setAnalysisIdForModal(analysisId);
    setShowResultModal(true);
  }, []);

  const removeAnalysis = useCallback((id: string) => {
    setAnalysisData((prevAnalysis) =>
      prevAnalysis.filter((analysis: Analysis) => analysis.id !== id)
    );
  }, []);

  useEffect(getAnalysis, []);

  useEffect(() => {
    const nextFilterState = getInitialStudyFilterState(
      location.search,
      analysisFilterStorageKey
    );
    setSearchFilter(nextFilterState.searchFilter);
    persistStudyFilterState(
      analysisFilterStorageKey,
      nextFilterState.searchFilter,
      false
    );
  }, [location.search]);

  const displayedAnalysisData = useMemo(() => {
    const hasSearchFilterApplied = Object.values(searchFilter).some(
      (value) => value !== ""
    );
    const filteredAnalysis = hasSearchFilterApplied
      ? analysisData.filter((analysis: Analysis) => {
          return (
            (searchFilter.patientId === "" ||
              (analysis.patient_id || "")
                .toLowerCase()
                .includes(searchFilter.patientId.toLowerCase())) &&
            (searchFilter.patientName === "" ||
              (analysis.patient_name || "")
                .toLowerCase()
                .includes(searchFilter.patientName.toLowerCase())) &&
            (searchFilter.studyId === "" ||
              analysis.study.includes(searchFilter.studyId)) &&
            (searchFilter.seriesId === "" ||
              analysis.series.includes(searchFilter.seriesId))
          );
        })
      : analysisData;

    return filteredAnalysis;
  }, [analysisData, searchFilter]);

  return (
    <PageContainer title={title} breadcrumbs={breadcrumbs}>
      <StudyFilterBar
        searchFilter={searchFilter}
        setSearchFilter={setSearchFilter}
        storageKey={analysisFilterStorageKey}
        onClearFilters={() => setTableSortModel([])}
      />
      <AnalysisDataTable
        items={displayedAnalysisData}
        removeAnalysis={removeAnalysis}
        openResultModal={openResultModal}
        sortModel={tableSortModel}
        onSortModelChange={setTableSortModel}
      />
      {showResultModal && (
        <AnalysisResultModal
          open={showResultModal}
          onClose={() => {
            setShowResultModal(false);
            setAnalysisIdForModal(null);
          }}
          analysisId={analysisIdForModal}
          onAutoGenerateReportComplete={() => {}}
        />
      )}
    </PageContainer>
  );
}
