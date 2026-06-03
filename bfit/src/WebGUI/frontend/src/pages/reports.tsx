import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router";
import { useAlert } from "../hooks/alert";
import { PageContainer } from "@toolpad/core/PageContainer";
import ReportDataTable from "../components/reportDataTable";
import reportService from "../services/reports";

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

export default function ReportsPage() {
  const [reportData, setReportData] = useState<Report[]>([]);
  const location = useLocation();
  const showAlert = useAlert();

  const getReports = () => {
    const queryParams = new URLSearchParams(location.search);
    const studyId: string | null = queryParams.get("studyId");
    reportService
      .getAll(studyId)
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

  return (
    <PageContainer>
      <ReportDataTable items={reportData} removeReport={removeReport} />
    </PageContainer>
  );
}
