import test from "node:test";
import assert from "node:assert/strict";

import {
  createScreenshotGalleryItem,
  getScreenshotDownloadFilename,
  getScreenshotSliceText,
  getScreenshotViewLabel,
  sanitizeScreenshotFilenamePart,
  screenshotViewLabels,
} from "../src/utils/screenshotGalleryUtils.js";

test("screenshotViewLabels match the four Niivue viewports", () => {
  assert.deepEqual(screenshotViewLabels, ["Axial", "Coronal", "Sagittal", "3D render"]);
});

test("getScreenshotViewLabel returns known view labels", () => {
  assert.equal(getScreenshotViewLabel(0), "Axial");
  assert.equal(getScreenshotViewLabel(1), "Coronal");
  assert.equal(getScreenshotViewLabel(2), "Sagittal");
  assert.equal(getScreenshotViewLabel(3), "3D render");
});

test("getScreenshotViewLabel falls back for unexpected view indexes", () => {
  assert.equal(getScreenshotViewLabel(4), "View 5");
  assert.equal(getScreenshotViewLabel(99), "View 100");
});

test("sanitizeScreenshotFilenamePart replaces unsafe filename characters", () => {
  assert.equal(sanitizeScreenshotFilenamePart("3D render"), "3D_render");
  assert.equal(sanitizeScreenshotFilenamePart("Patient A / Study: 7"), "Patient_A_Study_7");
  assert.equal(sanitizeScreenshotFilenamePart("Axial.view-1"), "Axial.view-1");
});

test("sanitizeScreenshotFilenamePart uses fallback for empty values", () => {
  assert.equal(sanitizeScreenshotFilenamePart(""), "viewport");
  assert.equal(sanitizeScreenshotFilenamePart(null), "viewport");
  assert.equal(sanitizeScreenshotFilenamePart(undefined, "screenshot"), "screenshot");
});

test("getScreenshotDownloadFilename builds a safe png filename", () => {
  assert.equal(
    getScreenshotDownloadFilename({ viewLabel: "3D render", id: "abc/123" }),
    "3D_render_abc_123.png"
  );
});

test("createScreenshotGalleryItem prepends generated metadata while preserving screenshot data", () => {
  const now = new Date("2026-05-28T04:00:00.000Z");
  const item = createScreenshotGalleryItem(
    {
      dataUrl: "data:image/png;base64,abc",
      viewIndex: 0,
      viewLabel: "Axial",
      slice: 12,
      totalSlices: 47,
    },
    now
  );

  assert.match(item.id, /^1779940800000-[a-z0-9]+$/);
  assert.equal(item.createdAt, "2026-05-28T04:00:00.000Z");
  assert.equal(item.dataUrl, "data:image/png;base64,abc");
  assert.equal(item.viewIndex, 0);
  assert.equal(item.viewLabel, "Axial");
  assert.equal(item.slice, 12);
  assert.equal(item.totalSlices, 47);
});

test("createScreenshotGalleryItem allows caller data to override metadata when supplied", () => {
  const now = new Date("2026-05-28T04:00:00.000Z");
  const item = createScreenshotGalleryItem(
    {
      id: "known-id",
      createdAt: "manual-date",
      dataUrl: "data:image/png;base64,abc",
    },
    now
  );

  assert.equal(item.id, "known-id");
  assert.equal(item.createdAt, "manual-date");
});

test("getScreenshotSliceText returns slice copy for 2D screenshots", () => {
  assert.equal(getScreenshotSliceText({ slice: 1, totalSlices: 47 }), "Slice 1/47");
  assert.equal(getScreenshotSliceText({ slice: 0, totalSlices: 47 }), "Slice 0/47");
});

test("getScreenshotSliceText hides slice copy for 3D or incomplete screenshots", () => {
  assert.equal(getScreenshotSliceText({ slice: null, totalSlices: null }), null);
  assert.equal(getScreenshotSliceText({ slice: undefined, totalSlices: 47 }), null);
  assert.equal(getScreenshotSliceText({ slice: 10, totalSlices: 0 }), null);
});
