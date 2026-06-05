import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

function readProjectFile(path) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

test("NiivueCanvasGrid exposes a camera action on each viewport", () => {
  const source = readProjectFile("src/components/niivue/niivueCanvasGrid.jsx");

  assert.match(source, /PhotoCameraIcon/);
  assert.match(source, /handleCaptureViewport/);
  assert.match(source, /addScreenshotToGallery/);
  assert.match(source, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(source, /Capture \$\{getScreenshotViewLabel\(index\)\}/);
});

test("NiivueCanvasGrid stores view metadata needed by the gallery", () => {
  const source = readProjectFile("src/components/niivue/niivueCanvasGrid.jsx");

  assert.match(source, /dataUrl:/);
  assert.match(source, /viewIndex: viewIdx/);
  assert.match(source, /viewLabel: getScreenshotViewLabel\(viewIdx\)/);
  assert.match(source, /slice: viewIdx === 3 \? null : volIndex\[viewIdx\]/);
  assert.match(source, /totalSlices: viewIdx === 3 \? null : volMax\[viewIdx\]/);
});

test("the left drawer renders the screenshot gallery with count, thumbnail, download, and delete", () => {
  const source = readProjectFile("src/components/analysisResultModal.jsx");

  assert.match(source, /function ScreenshotGallery/);
  assert.match(source, /screenshotGallery\.length/);
  assert.match(source, /component="img"/);
  assert.match(source, /getScreenshotDownloadFilename/);
  assert.match(source, /removeScreenshotFromGallery/);
  assert.match(source, /<ScreenshotGallery \/>/);
});

test("the Niivue store owns gallery add, remove, clear, and reset behavior", () => {
  const source = readProjectFile("src/hooks/niivueStore.jsx");

  assert.match(source, /screenshotGallery: \[\]/);
  assert.match(source, /addScreenshotToGallery/);
  assert.match(source, /createScreenshotGalleryItem\(screenshot\)/);
  assert.match(source, /removeScreenshotFromGallery/);
  assert.match(source, /clearScreenshotGallery/);
  assert.match(source, /screenshotGallery: \[\],\n\s*\}\),/);
});

test("toolbar selected-box screenshots use stable PNG snapshots instead of live WebGL copies", () => {
  const source = readProjectFile("src/components/niivue/niivueToolbar.jsx");

  assert.match(source, /const loadImage = \(src\) =>/);
  assert.match(source, /const getSnapshotTargets = async/);
  assert.match(source, /currentCanvas\.toDataURL\("image\/png"\)/);
  assert.match(source, /ctx\.drawImage\(\n\s*image,/);
});

test("body-analysis summary button is wired to PDF report generation", () => {
  const source = readProjectFile("src/components/analysisResultModal.jsx");

  assert.match(source, /handleGenerateBodyAnalysisReport/);
  assert.match(source, /createBodyAnalysisReport/);
  assert.match(source, /buildOverallVolumeRows/);
  assert.match(source, /onClick=\{handleGenerateBodyAnalysisReport\}/);
  assert.match(source, /disabled=\{reportGenerating \|\| !analysisResult\?\.segmentations\?\.length\}/);
  assert.match(source, /Generating Report\.\.\./);
  assert.doesNotMatch(source, /disabled=\{reportGenerating \|\| !\(analysisResult\?\.analysis\.queue === Queue\.CTCA\)\}/);
});

test("studies-page Generate Report opens frontend PDF generator instead of missing backend endpoint", () => {
  const source = readProjectFile("src/components/paginatedStudyList.jsx");
  const modalSource = readProjectFile("src/components/analysisResultModal.jsx");
  const reportServiceSource = readProjectFile("src/services/reports.js");

  assert.match(source, /autoGenerateReport/);
  assert.match(source, /completedReportAnalyses/);
  assert.match(source, /reportAnalysisQueue/);
  assert.match(source, /key=\{reportAnalysisId\}/);
  assert.match(modalSource, /createBodyAnalysisReport/);
  assert.match(reportServiceSource, /body-analysis/);
  assert.doesNotMatch(modalSource, /frameWindow\.print\(\)/);
  assert.doesNotMatch(source, /window\.open\("", "_blank"\)/);
  assert.doesNotMatch(source, /autoGenerateReportWindow/);
  assert.doesNotMatch(source, /generateReport\(seriesIds\)/);
  assert.doesNotMatch(source, /reportService\.getDetail/);
});
