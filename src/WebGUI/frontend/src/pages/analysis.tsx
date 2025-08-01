import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { PageContainer } from "@toolpad/core/PageContainer";
import { useActivePage } from "@toolpad/core/useActivePage";
import AnalysisDataTable from "../components/analysisDataTable";
import AnalysisResultModal from "../components/analysisResultModal";
import { useLocation, useParams } from "react-router";
import invariant from "invariant";
import analysisService from "../services/analysis";
import { useAlert } from "../hooks/alert";
import { Queue } from "../constants";

export type QueueType = (typeof Queue)[keyof typeof Queue];

export interface Analysis {
  id: string;
  series: string;
  study: string;
  queue: QueueType;
  status: string;
  created_at: string;
  ended_at: string;
}

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

  const title = params.analysisId ? `Analysis ${params.analysisId}` : undefined;
  const path = title ? `${activePage.path}/${params.analysisId}` : undefined;
  const breadcrumbs = title
    ? [...activePage.breadcrumbs, { title, path }]
    : undefined;

  const getAnalysis = () => {
    const queryParams = new URLSearchParams(location.search);
    const studyId: string | null = queryParams.get("studyId");
    const seriesId: string | null = queryParams.get("seriesId");
    analysisService
      .getCompleted(studyId, seriesId)
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

  return (
    <PageContainer title={title} breadcrumbs={breadcrumbs}>
      <AnalysisDataTable
        items={analysisData}
        removeAnalysis={removeAnalysis}
        openResultModal={openResultModal}
      />
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
    </PageContainer>
  );
}
