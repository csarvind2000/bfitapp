export const screenshotViewLabels = ["Axial", "Coronal", "Sagittal", "3D render"];

export function getScreenshotViewLabel(viewIndex) {
  return screenshotViewLabels[viewIndex] || `View ${viewIndex + 1}`;
}

export function sanitizeScreenshotFilenamePart(value, fallback = "viewport") {
  const sanitized = String(value || fallback).replace(/[^\w.-]+/g, "_");
  return sanitized || fallback;
}

export function getScreenshotDownloadFilename(screenshot) {
  const safeViewLabel = sanitizeScreenshotFilenamePart(screenshot?.viewLabel);
  const id = sanitizeScreenshotFilenamePart(screenshot?.id, "screenshot");
  return `${safeViewLabel}_${id}.png`;
}

export function createScreenshotGalleryItem(screenshot, now = new Date()) {
  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
    createdAt: now.toISOString(),
    ...screenshot,
  };
}

export function getScreenshotSliceText(screenshot) {
  if (
    screenshot?.slice === null ||
    screenshot?.slice === undefined ||
    !screenshot?.totalSlices
  ) {
    return null;
  }

  return `Slice ${screenshot.slice}/${screenshot.totalSlices}`;
}
