import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBodyAnalysisReportHtml,
  buildOverallVolumeRows,
  escapeHtml,
  formatPercent,
  formatVolume,
  parseSummaryCSVBase64,
} from "../src/utils/bodyAnalysisReportUtils.js";

test("parseSummaryCSVBase64 decodes one-row CSV summaries", () => {
  const b64 = btoa("Total_Volume,Total_%,Muscle_Volume,Muscle_%\n100,100,42.5,42.5");

  assert.deepEqual(parseSummaryCSVBase64(b64), {
    Total_Volume: "100",
    "Total_%": "100",
    Muscle_Volume: "42.5",
    "Muscle_%": "42.5",
  });
});

test("buildOverallVolumeRows returns simple variant rows with total last", () => {
  const summary = btoa("SSAT_Volume,SSAT_%,Muscle_Volume,Muscle_%,Total_Volume,Total_%\n12,30,28,70,40,100");
  const analysisResult = {
    volume_csv: {
      "4class_summary.csv": {
        summary: { b64_data: summary },
      },
    },
  };

  const rows = buildOverallVolumeRows(analysisResult, "4class");

  assert.equal(rows.length, 3);
  assert.equal(rows[0].key, "ssat");
  assert.equal(rows[0].volume, 12);
  assert.equal(rows[0].percent, 30);
  assert.equal(rows[1].key, "muscle");
  assert.equal(rows[2].key, "Total");
});

test("buildOverallVolumeRows falls back to prediction object summaries", () => {
  const analysisResult = {
    predictions: [
      {
        prediction: {
          "5class": [
            {
              Bone_Volume: "10",
              "Bone_%": "25",
              Total_Volume: "40",
              "Total_%": "100",
            },
          ],
        },
      },
    ],
  };

  const rows = buildOverallVolumeRows(analysisResult, "5class");

  assert.equal(rows.length, 2);
  assert.equal(rows[0].key, "bone");
  assert.equal(rows[0].volume, 10);
  assert.equal(rows[0].percent, 25);
  assert.equal(rows[1].key, "Total");
});

test("formatVolume and formatPercent handle missing and numeric values", () => {
  assert.equal(formatVolume(12), "12.00");
  assert.equal(formatVolume("8.2"), "8.20");
  assert.equal(formatVolume(undefined), "-");
  assert.equal(formatPercent(30), "30.00%");
  assert.equal(formatPercent("-"), "-");
  assert.equal(formatPercent(null), "-");
});

test("escapeHtml protects generated report markup", () => {
  assert.equal(
    escapeHtml("<Patient & \"Name\">"),
    "&lt;Patient &amp; &quot;Name&quot;&gt;"
  );
});

test("buildBodyAnalysisReportHtml includes patient info, mask names, image rows, and volume table", () => {
  const html = buildBodyAnalysisReportHtml({
    generatedAt: "5/28/2026, 12:00:00 PM",
    patientInfo: [{ label: "Patient Name", value: "Test Patient" }],
    sections: [
      {
        maskName: "4class",
        inputImages: [
          { label: "Axial", dataUrl: "data:image/png;base64,input1" },
          { label: "Sagittal", dataUrl: "data:image/png;base64,input2" },
          { label: "Coronal", dataUrl: "data:image/png;base64,input3" },
        ],
        overlayImages: [
          { label: "Axial", dataUrl: "data:image/png;base64,overlay1" },
          { label: "Sagittal", dataUrl: "data:image/png;base64,overlay2" },
          { label: "Coronal", dataUrl: "data:image/png;base64,overlay3" },
        ],
        volumeRows: [{ key: "Total", label: "Total", volume: 40, percent: 100, color: "transparent" }],
      },
    ],
  });

  assert.match(html, /Body Analysis Report/);
  assert.match(html, /Test Patient/);
  assert.match(html, /4class/);
  assert.match(html, /Input Image/);
  assert.match(html, /Segmentation Overlay/);
  assert.match(html, /Overall Volume \(cc\)/);
  assert.match(html, /40\.00/);
});
