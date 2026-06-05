import {
  getDisplayName,
  getLabelColor,
  getVariantKey,
} from "./maskVariantUtils.js";

export function parseSummaryCSVBase64(b64) {
  if (!b64) return null;

  try {
    const decoded = atob(b64);
    const lines = decoded.split("\n").filter((line) => line.trim() !== "");
    if (lines.length < 2) return null;

    const headers = lines[0].split(",").map((header) => header.trim());
    const values = lines[1].split(",");
    const parsed = {};
    headers.forEach((header, index) => {
      parsed[header] = values[index];
    });
    return parsed;
  } catch (error) {
    console.error("Report CSV parse error:", error);
    return null;
  }
}

function findMatchingVolumeCSV(volumeCsv, variantKey) {
  if (!volumeCsv) return null;
  const csvKeys = Object.keys(volumeCsv);
  const matchingKey = variantKey
    ? csvKeys.find((key) => {
        const lower = key.toLowerCase();
        if (variantKey === "abd_mr") {
          return (
            lower.includes("abd_mr") ||
            lower.includes("abdomen") ||
            lower.includes("abdominal") ||
            lower.includes("abd")
          );
        }
        return lower.includes(variantKey);
      })
    : csvKeys[0];

  return matchingKey ? volumeCsv[matchingKey] : null;
}

export function getPredictionSummaryForMask(analysisResult, maskType) {
  const variantKey = getVariantKey(maskType);

  const resultVolumeCsv = findMatchingVolumeCSV(analysisResult?.volume_csv, variantKey);
  if (resultVolumeCsv?.summary?.b64_data) {
    const parsed = parseSummaryCSVBase64(resultVolumeCsv.summary.b64_data);
    if (parsed) return parsed;
  }

  const prediction = analysisResult?.predictions?.[0]?.prediction;
  if (!prediction) return null;

  const predictionVolumeCsv = findMatchingVolumeCSV(prediction.volume_csv, variantKey);
  if (predictionVolumeCsv?.summary?.b64_data) {
    const parsed = parseSummaryCSVBase64(predictionVolumeCsv.summary.b64_data);
    if (parsed) return parsed;
  }

  if (variantKey === "5class") return prediction["5class"]?.[0] ?? null;
  if (variantKey === "48class") return prediction["48class"]?.[0] ?? null;
  if (variantKey === "abd_mr") {
    return (
      prediction["abd_mr"]?.[0] ??
      prediction["abdomen"]?.[0] ??
      prediction["abd"]?.[0] ??
      null
    );
  }

  return null;
}

function normaliseSimpleLabel(raw) {
  const base = raw.toLowerCase();
  if (base.includes("dsat")) return "dsat";
  if (base.includes("vat") || base.includes("visceral")) return "vat";
  if (base.includes("ssat") || base.includes("sat")) return "ssat";
  if (base.includes("imat")) return "imat";
  if (base.includes("bone")) return "bone";
  if (base.includes("total")) return "Total";
  if (base.includes("organ")) return "organ";
  return "muscle";
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function getSide(raw) {
  const normalized = normalizeKey(raw);
  if (normalized.endsWith("_left")) return "left";
  if (normalized.endsWith("_right")) return "right";
  return null;
}

function stripSide(raw) {
  return String(raw || "")
    .replace(/(?:_|\s)+(left|right)$/i, "")
    .trim();
}

export function buildOverallVolumeRows(analysisResult, maskType) {
  const predictionSummary = getPredictionSummaryForMask(analysisResult, maskType);
  const variantKey = getVariantKey(maskType);

  if (!predictionSummary) return [];

  const isSimpleVariant = variantKey !== "48class";
  const rowsByKey = {};

  Object.keys(predictionSummary).forEach((csvKey) => {
    if (!csvKey.includes("_Volume")) return;

    const raw = csvKey.replace("_Volume", "");
    if (variantKey === "48class" && getSide(raw)) return;

    const volume = Number(predictionSummary[csvKey] || 0);
    const percent = predictionSummary[`${raw}_%`];
    const rowKey = isSimpleVariant
      ? normaliseSimpleLabel(raw)
      : titleCase(raw);

    if (isSimpleVariant) {
      if (!rowsByKey[rowKey]) {
        rowsByKey[rowKey] = { key: rowKey, volume: 0, percent: null };
      }
      rowsByKey[rowKey].volume += volume;
      if (percent !== undefined && percent !== "-") {
        rowsByKey[rowKey].percent = Number(percent || 0);
      }
      return;
    }

    if (rowsByKey[rowKey]) return;
    rowsByKey[rowKey] = {
      key: rowKey,
      volume,
      percent: percent !== undefined && percent !== "-" ? Number(percent || 0) : null,
    };
  });

  const rows = Object.values(rowsByKey).map((row) => {
    const normalized = row.key.toLowerCase().replace(/\s+/g, "_").replace("groin/uterus", "organ");
    return {
      ...row,
      label: row.key === "Total" ? "Total" : getDisplayName(normalized, maskType),
      color: row.key === "Total" ? "transparent" : getLabelColor(normalized, maskType),
    };
  });

  return [
    ...rows.filter((row) => row.key !== "Total"),
    ...rows.filter((row) => row.key === "Total"),
  ];
}

export function buildSubMuscleRows(analysisResult, maskType) {
  const predictionSummary = getPredictionSummaryForMask(analysisResult, maskType);
  const variantKey = getVariantKey(maskType);

  if (!predictionSummary || variantKey !== "48class") return [];

  const rowsByMuscle = {};

  Object.keys(predictionSummary).forEach((csvKey) => {
    if (!csvKey.includes("_Volume")) return;

    const raw = csvKey.replace("_Volume", "");
    const side = getSide(raw);
    if (!side) return;

    const baseRaw = stripSide(raw);
    const baseKey = normalizeKey(baseRaw);
    const normalizedSideLabel = `${baseKey}_${side}`;
    const displayName = getDisplayName(normalizedSideLabel, maskType).replace(/\s+\([LR]\)$/, "");

    if (!rowsByMuscle[baseKey]) {
      rowsByMuscle[baseKey] = {
        key: baseKey,
        label: displayName,
        left: null,
        right: null,
      };
    }

    const percent = predictionSummary[`${raw}_%`];
    rowsByMuscle[baseKey][side] = {
      volume: Number(predictionSummary[csvKey] || 0),
      percent: percent !== undefined && percent !== "-" ? Number(percent || 0) : null,
      color: getLabelColor(normalizedSideLabel, maskType),
    };
  });

  const rows = Object.values(rowsByMuscle);
  if (!rows.length) return [];

  const totals = rows.reduce(
    (acc, row) => {
      ["left", "right"].forEach((side) => {
        const sideData = row[side];
        if (!sideData) return;
        if (Number.isFinite(sideData.volume)) {
          acc[side].volume += sideData.volume;
          acc[side].hasVolume = true;
        }
        if (Number.isFinite(sideData.percent)) {
          acc[side].percent += sideData.percent;
          acc[side].hasPercent = true;
        }
      });
      return acc;
    },
    {
      left: { volume: 0, percent: 0, hasVolume: false, hasPercent: false },
      right: { volume: 0, percent: 0, hasVolume: false, hasPercent: false },
    }
  );

  return [
    ...rows,
    {
      key: "total",
      label: "Total",
      left: totals.left.hasVolume
        ? {
            volume: totals.left.volume,
            percent: totals.left.hasPercent ? totals.left.percent : null,
            color: "transparent",
          }
        : null,
      right: totals.right.hasVolume
        ? {
            volume: totals.right.volume,
            percent: totals.right.hasPercent ? totals.right.percent : null,
            color: "transparent",
          }
        : null,
    },
  ];
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatVolume(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "-";
}

export function formatPercent(value) {
  if (value === null || value === undefined || value === "-") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : "-";
}

function buildImageRow(title, images) {
  return `
    <div class="image-row-block">
      <h3>${escapeHtml(title)}</h3>
      <div class="image-row">
        ${images.map((image) => `
          <figure>
            <img src="${image.dataUrl}" alt="${escapeHtml(image.label)}" />
            <figcaption>${escapeHtml(image.label)}</figcaption>
          </figure>
        `).join("")}
      </div>
    </div>
  `;
}

function buildVolumeTable(rows) {
  if (!rows.length) {
    return `<p class="empty">No overall volume data available for this mask.</p>`;
  }

  return `
    <table class="volume-table">
      <thead>
        <tr>
          <th>Tissue</th>
          <th>Overall Volume (cc)</th>
          <th>Distribution</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => {
          const hasColor = row.color && row.color !== "transparent";
          const swatchStyle = hasColor
            ? `background:${escapeHtml(row.color)}`
            : "background:#ffffff";
          return `
          <tr>
            <td class="tissue-cell">
              <span class="tissue-label">
                <span class="swatch${hasColor ? "" : " swatch-empty"}" style="${swatchStyle}"></span>
                <span>${escapeHtml(row.label)}</span>
              </span>
            </td>
            <td>${formatVolume(row.volume)}</td>
            <td>${formatPercent(row.percent)}</td>
          </tr>
        `;
        }).join("")}
      </tbody>
    </table>
  `;
}

export function buildBodyAnalysisReportHtml({ patientInfo, sections, generatedAt }) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Body Analysis Report</title>
        <style>
          @page { size: A4; margin: 16mm; }
          * { box-sizing: border-box; }
          html {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            margin: 0;
            color: #182235;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.45;
            background: #ffffff;
          }
          h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
          h2 {
            margin: 0 0 12px;
            padding-bottom: 8px;
            border-bottom: 2px solid #19b8cf;
            font-size: 17px;
            page-break-after: avoid;
          }
          h3 { margin: 14px 0 8px; font-size: 13px; color: #26344d; }
          .report-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 16px;
            margin-bottom: 14px;
            padding: 14px 16px;
            border-radius: 8px;
            background: #182235;
            color: #ffffff;
          }
          .report-kicker {
            margin-bottom: 4px;
            color: #8de8f5;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .generated {
            color: #c5d0df;
            font-size: 10px;
            text-align: right;
            white-space: nowrap;
          }
          .patient-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            padding: 10px;
            border: 1px solid #dce3ec;
            background: #f6f9fc;
            border-radius: 8px;
            margin-bottom: 14px;
          }
          .patient-item {
            padding: 8px 9px;
            border: 1px solid #e5eaf1;
            border-radius: 6px;
            background: #ffffff;
          }
          .patient-item span {
            display: block;
            margin-bottom: 3px;
            color: #68768a;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .patient-item strong {
            color: #172033;
            font-size: 12px;
            overflow-wrap: anywhere;
          }
          .mask-section {
            break-inside: auto;
            page-break-inside: auto;
            margin-top: 14px;
            padding-top: 10px;
            border-top: 1px solid #dce3ec;
            background: #ffffff;
          }
          .image-row-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .image-row-block + .image-row-block { margin-top: 10px; }
          .image-row {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }
          figure {
            margin: 0;
            border: 1px solid #d6dde8;
            background: #050505;
            border-radius: 6px;
            overflow: hidden;
          }
          img {
            display: block;
            width: 100%;
            height: 112px;
            object-fit: contain;
            background: #000;
          }
          figcaption {
            padding: 6px;
            background: #f7f9fc;
            color: #26344d;
            font-size: 11px;
            font-weight: 700;
            text-align: center;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            margin-top: 8px;
            break-inside: auto;
            page-break-inside: auto;
          }
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          th, td {
            padding: 8px 9px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
          }
          th {
            background: #26344d;
            color: #fff;
            font-size: 10px;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          tbody tr:nth-child(even) { background: #f7f9fc; }
          th:nth-child(1), td:nth-child(1) { width: 52%; }
          th:nth-child(2), td:nth-child(2) { width: 24%; }
          th:nth-child(3), td:nth-child(3) { width: 24%; }
          td:nth-child(2), td:nth-child(3) { text-align: right; font-variant-numeric: tabular-nums; }
          th:nth-child(2), th:nth-child(3) { text-align: right; }
          .tissue-cell {
            font-weight: 700;
          }
          .tissue-label {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
          }
          .swatch {
            display: inline-flex;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            border: 1px solid rgba(0,0,0,0.24);
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35);
            flex: 0 0 auto;
          }
          .swatch-empty {
            border-color: #9aa8ba;
            box-shadow: none;
          }
          .empty {
            padding: 10px;
            border: 1px dashed #b8c2d0;
            color: #5d6a7f;
            background: #f7f9fc;
          }
        </style>
      </head>
      <body>
        <header class="report-header">
          <div>
            <div class="report-kicker">Body Composition</div>
            <h1>Body Analysis Report</h1>
          </div>
          <div class="generated">Generated<br />${escapeHtml(generatedAt)}</div>
        </header>
        <section class="patient-grid">
          ${patientInfo.map((item) => `
            <div class="patient-item">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value || "-")}</strong>
            </div>
          `).join("")}
        </section>

        ${sections.map((section) => `
          <section class="mask-section">
            <h2>${escapeHtml(section.maskName)}</h2>
            ${buildImageRow("Input Image", section.inputImages)}
            ${buildImageRow("Segmentation Overlay", section.overlayImages)}
            <h3>Overall Volume</h3>
            ${buildVolumeTable(section.volumeRows)}
          </section>
        `).join("")}
      </body>
    </html>
  `;
}
