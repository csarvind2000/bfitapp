import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  Collapse,
  IconButton,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import EditIcon from "@mui/icons-material/Edit";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import TableChartIcon from "@mui/icons-material/TableChart";
import analysisService from "../services/analysis";
import { useAlert } from "../hooks/alert";
import {
  buildOverallVolumeRows,
  buildSubMuscleRows,
  formatPercent,
  formatVolume,
} from "../utils/bodyAnalysisReportUtils";
import { getMaskDisplayName } from "../utils/maskVariantUtils";

const chrome = {
  panelRaised: "#0f172a",
  header: "rgba(15, 23, 42, 0.6)",
  border: "rgba(148, 163, 184, 0.18)",
  borderStrong: "rgba(148, 163, 184, 0.24)",
  muted: "#94a3b8",
  cyan: "#22d3ee",
  cyanDim: "rgba(34, 211, 238, 0.10)",
  cyanGlow: "rgba(34, 211, 238, 0.20)",
};

function InlineBold({ text }) {
  return String(text || "")
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) => (
      <Box key={i} component="span" sx={{ fontWeight: part.startsWith("**") && part.endsWith("**") ? 700 : "inherit" }}>
        {part.startsWith("**") && part.endsWith("**") ? part.slice(2, -2) : part}
      </Box>
    ));
}

function HighlightedSummary({ text }) {
  if (!text) return null;
  const sectionHeadings = new Set([
    "patient analysis report",
    "patient report",
    "introduction",
    "muscle quality",
    "clinical observations",
    "muscle quality interpretation",
    "cardiometabolic risk",
    "cardiometabolic risk interpretation",
    "sub-muscle analysis",
    "muscle analysis",
    "muscle quality and muscle analysis",
    "diagnostic insights based on imf, imat, sat, sub-muscles, and muscle volume",
    "diagnostic insights based on imat, sat, and muscle volume",
    "diagnostic insights based on vat, dsat, and ssat",
    "differential diagnosis",
    "differential diagnosis and clinical risk factors",
    "treatment and management recommendations",
    "recommendations",
    "recommended diagnostic tests",
    "overall risk score",
    "additional notes",
    "conclusion",
  ]);
  const hiddenSections = new Set(["available metrics", "metrics", "raw metrics", "source metrics"]);
  const normalizeHeading = (value) =>
    String(value || "")
      .trim()
      .replace(/^["']+|["']+$/g, "")
      .replace(/\*\*/g, "")
      .replace(/:$/, "")
      .replace(/^\d+\)\s+/, "")
      .trim()
      .toLowerCase();

  const lines = [];
  let skippingHiddenSection = false;
  String(text).split(/\r?\n/).forEach((rawLine) => {
    const t = rawLine.trim();
    const heading = normalizeHeading(t);

    if (hiddenSections.has(heading)) {
      skippingHiddenSection = true;
      return;
    }

    if (skippingHiddenSection) {
      if (!t) return;
      if (sectionHeadings.has(heading) || /^\d+\)\s+/.test(t)) {
        skippingHiddenSection = false;
      } else {
        return;
      }
    }

    lines.push(rawLine);
  });

  let hasIntroductionHeading = false;
  const displayLines = lines.filter((rawLine) => {
    const heading = normalizeHeading(rawLine);
    if (heading !== "introduction") return true;
    if (!hasIntroductionHeading) {
      hasIntroductionHeading = true;
      return true;
    }
    return false;
  });

  return displayLines
    .map((rawLine, i) => {
      const t = rawLine.trim();

      if (/^```/.test(t) || t.toLowerCase() === "json") return null;
      if (!t) return <Box key={i} sx={{ height: "0.35rem" }} />;

      const plainHeading = t
        .replace(/^["']+|["']+$/g, "")
        .replace(/\*\*/g, "")
        .replace(/:$/, "")
        .replace(/^\d+\)\s+/, "")
        .trim();
      const headingKey = normalizeHeading(t);
      const isColonHeading =
        t.endsWith(":") &&
        !/^\d+[\.)]\s/.test(t) &&
        plainHeading.split(/\s+/).length <= 6;
      if (sectionHeadings.has(headingKey) || isColonHeading)
        return (
          <Typography key={i} component="p" sx={{ fontWeight: 700, fontSize: "0.78rem", color: chrome.cyan, mt: 1.4, mb: 0.35, lineHeight: 1.4, borderBottom: `1px solid ${chrome.cyanGlow}`, pb: 0.4 }}>
            {plainHeading}
          </Typography>
        );

      if (t.startsWith("### "))
        return (
          <Typography key={i} component="p" sx={{ fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: chrome.cyan, mt: 1.25, mb: 0.2, lineHeight: 1.4 }}>
            {t.slice(4)}
          </Typography>
        );

      if (t.startsWith("## "))
        return (
          <Typography key={i} component="p" sx={{ fontWeight: 700, fontSize: "0.78rem", color: chrome.cyan, mt: 1.4, mb: 0.35, lineHeight: 1.4, borderBottom: `1px solid ${chrome.cyanGlow}`, pb: 0.4 }}>
            {t.slice(3)}
          </Typography>
        );

      if (t.startsWith("# "))
        return (
          <Typography key={i} component="p" sx={{ fontWeight: 700, fontSize: "0.85rem", color: chrome.cyan, mt: 1.5, mb: 0.4, lineHeight: 1.4 }}>
            {t.slice(2)}
          </Typography>
        );

      const numbered = t.match(/^\d+\)\s+(.+)$/);
      if (numbered)
        return (
          <Typography key={i} component="p" sx={{ fontWeight: 700, fontSize: "0.78rem", color: chrome.cyan, mt: 1.1, mb: 0.3, lineHeight: 1.4 }}>
            <InlineBold text={numbered[1]} />
          </Typography>
        );

      if (/^\*\*[^*]+\*\*/.test(t))
        return (
          <Typography key={i} component="p" sx={{ fontWeight: 600, fontSize: "0.77rem", color: "#e2e8f0", mt: 0.9, mb: 0.2, lineHeight: 1.5 }}>
            <InlineBold text={t} />
          </Typography>
        );

      if (t.startsWith("- ") || t.startsWith("* ") || t.startsWith("+ ") || t.startsWith("• "))
        return (
          <Box key={i} component="p" sx={{ display: "flex", gap: "6px", alignItems: "flex-start", m: 0, mb: 0.35 }}>
            <Box component="span" sx={{ flexShrink: 0, width: 3, height: 3, borderRadius: "50%", bgcolor: chrome.cyan, mt: "7px", opacity: 0.75 }} />
            <Typography component="span" sx={{ fontSize: "0.76rem", color: "#cbd5e1", lineHeight: 1.55 }}>
              <InlineBold text={t.slice(2)} />
            </Typography>
          </Box>
        );

      return (
        <Typography key={i} component="p" sx={{ fontSize: "0.76rem", color: "#cbd5e1", lineHeight: 1.6, m: 0, mb: 0.2 }}>
          <InlineBold text={t} />
        </Typography>
      );
    });
}

function formatGeneratedAt(date) {
  if (!date) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Generated just now";
  return `Generated at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatCompactPercent(value) {
  if (value === null || value === undefined || value === "-") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : "-";
}

const tableHeadCellSx = {
  fontSize: "11px",
  fontWeight: 700,
  color: "rgba(255,255,255,0.95)",
  py: "7px",
  px: "8px",
  borderBottom: "1px solid rgba(0,180,255,0.3)",
  background: "rgba(0,130,255,0.25)",
  whiteSpace: "nowrap",
};

const tableBodyCellSx = {
  fontSize: "11px",
  fontWeight: 600,
  py: "6px",
  px: "8px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
  color: "rgba(255,255,255,0.92)",
};

const compactHeadCellSx = {
  ...tableHeadCellSx,
  px: "5px",
  py: "6px",
};

const compactBodyCellSx = {
  ...tableBodyCellSx,
  px: "5px",
  py: "5px",
};

const compactMutedCellSx = {
  ...compactBodyCellSx,
  color: "rgba(203,213,225,0.68)",
};

const sideDotCellSx = {
  ...compactBodyCellSx,
  width: 14,
  minWidth: 14,
  px: "2px",
};

function inferMaskTypeFromVolumeKey(key) {
  const lower = String(key || "").toLowerCase();
  if (lower.includes("47class") || lower.includes("48class")) return "47class";
  if (lower.includes("5class")) return "5class";
  if (lower.includes("abd_mr") || lower.includes("abdomen") || lower.includes("abdominal") || lower.includes("abd")) {
    return "abd_mr";
  }
  return null;
}

function getAvailableTableMasks(analysisResult) {
  const options = new Map();
  const add = (maskType) => {
    if (!maskType || String(maskType).toUpperCase().includes("4CLASS")) return;
    const normalized = inferMaskTypeFromVolumeKey(maskType) || maskType;
    if (!options.has(normalized)) {
      options.set(normalized, {
        value: normalized,
        label: getMaskDisplayName(normalized),
      });
    }
  };

  (analysisResult?.segmentations || []).forEach((segmentation) => add(segmentation?.mask_type));
  Object.keys(analysisResult?.volume_csv || {}).forEach(add);

  const prediction = analysisResult?.predictions?.[0]?.prediction || {};
  Object.keys(prediction?.volume_csv || {}).forEach(add);
  ["47class", "48class", "5class", "abd_mr", "abdomen", "abd"].forEach((key) => {
    if (prediction?.[key]) add(key);
  });

  return Array.from(options.values());
}

function VolumeReferenceTables({ analysisResult }) {
  const tableMasks = useMemo(() => getAvailableTableMasks(analysisResult), [analysisResult]);
  const [selectedMask, setSelectedMask] = useState("");

  useEffect(() => {
    if (!tableMasks.length) {
      setSelectedMask("");
      return;
    }
    if (!tableMasks.some((option) => option.value === selectedMask)) {
      setSelectedMask(tableMasks[0].value);
    }
  }, [selectedMask, tableMasks]);

  const volumeRows = useMemo(
    () => (selectedMask ? buildOverallVolumeRows(analysisResult, selectedMask) : []),
    [analysisResult, selectedMask]
  );
  const subMuscleRows = useMemo(
    () => (selectedMask ? buildSubMuscleRows(analysisResult, selectedMask) : []),
    [analysisResult, selectedMask]
  );

  if (!tableMasks.length) {
    return (
      <Typography sx={{ fontSize: "0.72rem", color: chrome.muted, lineHeight: 1.5 }}>
        No volumetric tables are available for this analysis.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Select
        size="small"
        value={selectedMask}
        onChange={(event) => setSelectedMask(event.target.value)}
        sx={{
          height: 34,
          color: "#e2e8f0",
          fontSize: "0.72rem",
          bgcolor: "rgba(15,23,42,0.7)",
          borderRadius: "8px",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(148,163,184,0.28)" },
          "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(34,211,238,0.45)" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(34,211,238,0.75)" },
          "& .MuiSvgIcon-root": { color: chrome.muted },
        }}
      >
        {tableMasks.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>

      <TableContainer sx={{ borderRadius: "8px", border: `1px solid ${chrome.border}`, overflow: "hidden" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={tableHeadCellSx}>Tissue</TableCell>
              <TableCell align="right" sx={tableHeadCellSx}>Vol (cc)</TableCell>
              <TableCell align="right" sx={tableHeadCellSx}>Distribution</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {volumeRows.length ? (
              volumeRows.map((row) => (
                <TableRow key={row.key} sx={{ "&:last-child td": { borderBottom: "none" } }}>
                  <TableCell sx={tableBodyCellSx}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <Box
                        sx={{
                          width: 7,
                          height: 7,
                          minWidth: 7,
                          borderRadius: "50%",
                          bgcolor: row.color === "transparent" ? "rgba(255,255,255,0.38)" : row.color,
                        }}
                      />
                      {row.label}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ ...tableBodyCellSx, fontVariantNumeric: "tabular-nums" }}>
                    {formatVolume(row.volume)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...tableBodyCellSx, fontVariantNumeric: "tabular-nums" }}>
                    {formatPercent(row.percent)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ ...tableBodyCellSx, color: chrome.muted, borderBottom: "none" }}>
                  No volume data for this table.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!!subMuscleRows.length && (
        <Box sx={{ borderRadius: "8px", border: `1px solid ${chrome.border}`, overflow: "hidden" }}>
          <Box
            sx={{
              px: 1.25,
              py: 0.9,
              bgcolor: "rgba(15,23,42,0.78)",
              borderBottom: `1px solid ${chrome.border}`,
              fontSize: "0.72rem",
              fontWeight: 800,
              color: "#e2e8f0",
            }}
          >
            Sub-muscles
          </Box>
          <TableContainer>
          <Table size="small" sx={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "30%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2} sx={{ ...compactHeadCellSx, verticalAlign: "middle" }}>Muscle</TableCell>
                <TableCell rowSpan={2} sx={{ ...compactHeadCellSx, px: 0 }} />
                <TableCell colSpan={2} align="center" sx={{ ...compactHeadCellSx, borderLeft: "1px solid rgba(0,180,255,0.2)", borderBottom: "1px solid rgba(0,180,255,0.15)" }}>
                  Left
                </TableCell>
                <TableCell rowSpan={2} sx={{ ...compactHeadCellSx, px: 0, borderLeft: "1px solid rgba(0,180,255,0.2)" }} />
                <TableCell colSpan={2} align="center" sx={{ ...compactHeadCellSx, borderLeft: "1px solid rgba(0,180,255,0.2)", borderBottom: "1px solid rgba(0,180,255,0.15)" }}>
                  Right
                </TableCell>
              </TableRow>
              <TableRow>
                {["Vol", "%", "Vol", "%"].map((label, index) => (
                  <TableCell
                    key={label + index}
                    align="center"
                    sx={{
                      ...compactHeadCellSx,
                      fontSize: "10px",
                      color: "rgba(255,255,255,0.7)",
                      ...(index === 0 || index === 2
                        ? { borderLeft: "1px solid rgba(0,180,255,0.2)" }
                        : {}),
                    }}
                  >
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {subMuscleRows.map((row) => {
                const isTotal = row.key === "total";
                const totalSx = isTotal
                  ? { bgcolor: "rgba(255,255,255,0.06)", "& td": { fontWeight: 800, borderBottom: "none" } }
                  : { "&:hover": { bgcolor: "rgba(255,255,255,0.04)" }, "&:last-child td": { borderBottom: "none" } };

                return (
                  <TableRow key={row.key} sx={totalSx}>
                    <TableCell sx={{ ...compactBodyCellSx, whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.2 }}>
                      {row.label}
                    </TableCell>
                    <TableCell sx={sideDotCellSx}>
                      {row.left && !isTotal && (
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor: row.left.color || "rgba(255,255,255,0.55)",
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ ...compactBodyCellSx, borderLeft: "1px solid rgba(255,255,255,0.06)", fontVariantNumeric: "tabular-nums" }}>
                      {row.left ? formatVolume(row.left.volume) : "-"}
                    </TableCell>
                    <TableCell align="right" sx={{ ...compactMutedCellSx, fontVariantNumeric: "tabular-nums" }}>
                      {row.left ? formatCompactPercent(row.left.percent) : "-"}
                    </TableCell>
                    <TableCell sx={{ ...sideDotCellSx, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                      {row.right && !isTotal && (
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor: row.right.color || "rgba(255,255,255,0.55)",
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ ...compactBodyCellSx, borderLeft: "1px solid rgba(255,255,255,0.06)", fontVariantNumeric: "tabular-nums" }}>
                      {row.right ? formatVolume(row.right.volume) : "-"}
                    </TableCell>
                    <TableCell align="right" sx={{ ...compactMutedCellSx, fontVariantNumeric: "tabular-nums" }}>
                      {row.right ? formatCompactPercent(row.right.percent) : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
}

export default function LlmSummaryPanel({ analysisId, analysisResult, isOpen, onOpenChange }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [copied, setCopied] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenTablesOpen, setFullscreenTablesOpen] = useState(false);
  const scrollRef = useRef(null);
  const showAlert = useAlert();
  const open = typeof isOpen === "boolean" ? isOpen : internalOpen;

  const setOpen = useCallback(
    (nextValue) => {
      const resolvedValue =
        typeof nextValue === "function" ? nextValue(open) : nextValue;
      if (typeof isOpen !== "boolean") {
        setInternalOpen(resolvedValue);
      }
      onOpenChange?.(resolvedValue);
    },
    [isOpen, onOpenChange, open]
  );

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;
    setIsLoading(true);
    analysisService.loadSummary(analysisId)
      .then((data) => { if (!cancelled) setSummary(data.summary || ""); })
      .catch((err) => {
        if (!cancelled)
          showAlert(`Failed to load summary: ${JSON.stringify(err.response?.data || err.message)}`, "error");
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [analysisId, showAlert]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [summary, isGenerating]);

  useEffect(() => {
    if (!fullscreenOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setFullscreenOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreenOpen]);

  const generate = useCallback(() => {
    if (!analysisId || isGenerating) return;
    setOpen(true);
    setIsGenerating(true);
    analysisService.generateSummary(analysisId)
      .then((data) => {
        setSummary(data.summary || "");
        setGeneratedAt(new Date());
      })
      .catch((err) => {
        showAlert(`Failed to generate summary: ${JSON.stringify(err.response?.data || err.message)}`, "error");
      })
      .finally(() => setIsGenerating(false));
  }, [analysisId, isGenerating, setOpen, showAlert]);

  const handlePillClick = () => {
    if (!analysisId || busy) return;
    generate();
  };

  const handleViewClick = () => {
    if (!analysisId) return;
    setOpen(true);
  };

  const handleCopy = useCallback(() => {
    if (!summary) return;
    navigator.clipboard.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [summary]);

  const handleEdit = useCallback(() => {
    setEditDraft(summary || "");
    setIsEditing(true);
  }, [summary]);

  const handleCancelEdit = useCallback(() => {
    setEditDraft("");
    setIsEditing(false);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!analysisId || isSavingEdit) return;
    const formData = new FormData();
    formData.append("analysis_id", analysisId);
    formData.append("contents", editDraft);
    setIsSavingEdit(true);
    analysisService.saveSummary(formData)
      .then((data) => {
        setSummary(data.summary || editDraft);
        setGeneratedAt(new Date());
        setIsEditing(false);
        showAlert("Summary saved", "success");
      })
      .catch((err) => {
        showAlert(`Failed to save summary: ${JSON.stringify(err.response?.data || err.message)}`, "error");
      })
      .finally(() => setIsSavingEdit(false));
  }, [analysisId, editDraft, isSavingEdit, showAlert]);

  const busy = isLoading || isGenerating || isSavingEdit;
  const showHeaderExtras = !busy && summary;
  const canEditSummary = Boolean(summary) && !isGenerating && !isLoading;
  const editFieldSx = {
    width: "100%",
    "& .MuiOutlinedInput-root": {
      color: "#e2e8f0",
      fontSize: "0.76rem",
      lineHeight: 1.55,
      bgcolor: "rgba(15,23,42,0.72)",
      alignItems: "flex-start",
      "& fieldset": { borderColor: chrome.cyanGlow },
      "&:hover fieldset": { borderColor: chrome.cyanGlow },
      "&.Mui-focused fieldset": { borderColor: chrome.cyan },
    },
    "& textarea": {
      fontFamily: "inherit",
    },
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        pb: 1.5,
      }}
    >
      {/* Trigger row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          height: 34,
          borderRadius: "100px",
          bgcolor: chrome.cyanDim,
          border: `1px solid ${chrome.cyanGlow}`,
          px: "5px",
          pl: "12px",
          opacity: analysisId ? 1 : 0.5,
        }}
      >
        <Box
          component="button"
          type="button"
          onClick={handleViewClick}
          disabled={!analysisId}
          sx={{
            appearance: "none",
            border: "none",
            bgcolor: "transparent",
            p: 0,
            m: 0,
            fontWeight: 500,
            fontSize: "0.68rem",
            letterSpacing: "0.01em",
            color: "#cbd5e1",
            userSelect: "none",
            whiteSpace: "nowrap",
            textTransform: "none",
            cursor: analysisId ? "pointer" : "not-allowed",
            textAlign: "left",
            "&:hover": analysisId ? { color: "#f8fafc" } : {},
          }}
        >
          Summary
        </Box>

        <Tooltip title={summary ? "Regenerate summary" : "Generate summary"} placement="top" arrow>
          <span>
            <IconButton
              onClick={handlePillClick}
              disabled={!analysisId || busy}
              aria-label={summary ? "Regenerate summary" : "Generate summary"}
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: "rgba(34,211,238,0.14)",
                border: `1px solid ${chrome.cyan}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background-color 0.18s, border-color 0.18s, box-shadow 0.18s, transform 0.12s",
                "&:hover": {
                  bgcolor: chrome.cyanDim,
                  boxShadow: `0 0 0 1px ${chrome.cyanGlow}`,
                },
                "&:active": { transform: "scale(0.94)" },
                "&.Mui-disabled": {
                  bgcolor: "rgba(148,163,184,0.08)",
                  borderColor: "rgba(148,163,184,0.16)",
                },
              }}
            >
              {busy ? (
                <CircularProgress size={14} thickness={3} sx={{ color: chrome.cyan }} />
              ) : (
                <AutoAwesomeIcon sx={{ fontSize: 15, color: chrome.cyan, transition: "color 0.18s" }} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Summary panel */}
      <Collapse
        in={open}
        timeout={260}
        sx={{
          flex: open ? 1 : 0,
          minHeight: 0,
          "& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner": {
            height: "100%",
          },
        }}
      >
        <Box
          sx={{
            mt: 1,
            height: "calc(100% - 8px)",
            minHeight: 0,
            border: `1px solid ${chrome.borderStrong}`,
            borderRadius: "8px",
            overflow: "hidden",
            bgcolor: chrome.panelRaised,
            backgroundImage: "radial-gradient(rgba(148,163,184,0.09) 1px, transparent 1px)",
            backgroundSize: "14px 14px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header bar */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 1.25,
              py: 0.85,
              borderBottom: `1px solid ${chrome.border}`,
              bgcolor: chrome.header,
              flexShrink: 0,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
              <AutoAwesomeIcon sx={{ fontSize: 14, color: chrome.cyan, flexShrink: 0 }} />
              <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: "#f1f5f9" }}>
                Summary
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
              {showHeaderExtras && (
                <Tooltip title={copied ? "Copied" : "Copy summary"} placement="top" arrow>
                  <IconButton onClick={handleCopy} size="small" aria-label="Copy summary" sx={{ width: 24, height: 24 }}>
                    {copied ? (
                      <CheckIcon sx={{ fontSize: 14, color: chrome.cyan }} />
                    ) : (
                      <ContentCopyIcon sx={{ fontSize: 13, color: chrome.muted }} />
                    )}
                  </IconButton>
                </Tooltip>
              )}
              {canEditSummary && !isEditing && (
                <Tooltip title="Edit summary" placement="top" arrow>
                  <IconButton onClick={handleEdit} size="small" aria-label="Edit summary" sx={{ width: 24, height: 24 }}>
                    <EditIcon sx={{ fontSize: 13, color: chrome.muted }} />
                  </IconButton>
                </Tooltip>
              )}
              {isEditing && (
                <>
                  <Tooltip title="Save summary" placement="top" arrow>
                    <IconButton onClick={handleSaveEdit} size="small" aria-label="Save summary" sx={{ width: 24, height: 24 }}>
                      <SaveIcon sx={{ fontSize: 14, color: chrome.cyan }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Cancel edit" placement="top" arrow>
                    <IconButton onClick={handleCancelEdit} size="small" aria-label="Cancel edit" sx={{ width: 24, height: 24 }}>
                      <CloseIcon sx={{ fontSize: 14, color: chrome.muted }} />
                    </IconButton>
                  </Tooltip>
                </>
              )}
              {showHeaderExtras && (
                <Tooltip title="Open full screen" placement="top" arrow>
                  <IconButton onClick={() => setFullscreenOpen(true)} size="small" aria-label="Open summary full screen" sx={{ width: 24, height: 24 }}>
                    <OpenInFullIcon sx={{ fontSize: 13, color: chrome.muted }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Close" placement="top" arrow>
                <IconButton onClick={() => setOpen(false)} size="small" aria-label="Close summary panel" sx={{ width: 24, height: 24 }}>
                  <CloseIcon sx={{ fontSize: 14, color: chrome.muted }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Content */}
          <Box
            ref={scrollRef}
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              px: 1.5, pt: 1.1, pb: 1.4,
              "&::-webkit-scrollbar": { width: 3 },
              "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
              "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(148,163,184,0.2)", borderRadius: 4 },
            }}
          >
            {(isLoading || (isGenerating && !summary)) && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1.5, px: 0.25 }}>
                <CircularProgress size={14} thickness={4} sx={{ color: chrome.cyan }} />
                <Typography sx={{ fontSize: "0.72rem", color: chrome.muted }}>
                  Generating summary…
                </Typography>
              </Box>
            )}

            {summary ? (
              <>
                <Box sx={{ bgcolor: "rgba(34,211,238,0.04)", border: `1px solid ${chrome.cyanGlow}`, borderRadius: "8px", px: 1.25, py: 1 }}>
                  {isEditing ? (
                    <TextField
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      multiline
                      minRows={12}
                      maxRows={22}
                      variant="outlined"
                      size="small"
                      aria-label="Edit generated summary"
                      sx={editFieldSx}
                    />
                  ) : (
                    <HighlightedSummary text={summary} />
                  )}
                </Box>
                {isGenerating && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75, px: 0.25 }}>
                    <CircularProgress size={12} thickness={4} sx={{ color: chrome.cyan }} />
                    <Typography sx={{ fontSize: "0.68rem", color: chrome.muted }}>
                      Regenerating…
                    </Typography>
                  </Box>
                )}
              </>
            ) : (
              !busy && (
                <Typography variant="caption" sx={{ color: chrome.muted, fontSize: "0.72rem", display: "block", textAlign: "center", py: 1.5 }}>
                  No summary generated yet. Click the sparkle button to generate one.
                </Typography>
              )
            )}
          </Box>

          {/* Footer */}
          {showHeaderExtras && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 1.25,
                py: 0.6,
                borderTop: `1px solid ${chrome.border}`,
                flexShrink: 0,
              }}
            >
              <Typography sx={{ fontSize: "0.62rem", color: chrome.muted }}>
                {formatGeneratedAt(generatedAt)}
              </Typography>
              <Box
                component="button"
                onClick={generate}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "0.66rem",
                  color: "#67e8f9",
                  bgcolor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  px: 0.5,
                  py: 0.25,
                  "&:hover": { color: chrome.cyan },
                }}
              >
                <RefreshIcon sx={{ fontSize: 12 }} />
                Regenerate
              </Box>
            </Box>
          )}
        </Box>
      </Collapse>

      {fullscreenOpen && (
        <Box
          role="presentation"
          onClick={() => setFullscreenOpen(false)}
          sx={{
            position: "fixed",
            inset: 0,
            zIndex: (theme) => theme.zIndex.modal + 20,
            bgcolor: "rgba(2, 6, 23, 0.72)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
          }}
        >
          <Box
            role="dialog"
            aria-modal="true"
            aria-label="Brief Overview full screen"
            onClick={(event) => event.stopPropagation()}
            sx={{
              width: fullscreenTablesOpen
                ? "min(1180px, calc(100vw - 48px))"
                : "min(920px, calc(100vw - 48px))",
              height: "min(760px, calc(100vh - 48px))",
              minHeight: 0,
              border: `1px solid ${chrome.borderStrong}`,
              borderRadius: "10px",
              overflow: "hidden",
              bgcolor: chrome.panelRaised,
              backgroundImage: "radial-gradient(rgba(148,163,184,0.09) 1px, transparent 1px)",
              backgroundSize: "14px 14px",
              boxShadow: "0 24px 80px rgba(0,0,0,0.62)",
              display: "flex",
              flexDirection: "column",
              transition: "width 0.2s ease",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 1.5,
                py: 1,
                borderBottom: `1px solid ${chrome.border}`,
                bgcolor: chrome.header,
                flexShrink: 0,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                <AutoAwesomeIcon sx={{ fontSize: 15, color: chrome.cyan, flexShrink: 0 }} />
                <Typography sx={{ fontSize: "0.82rem", fontWeight: 700, color: "#f1f5f9" }}>
                  Summary
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                <Tooltip title={copied ? "Copied" : "Copy summary"} placement="top" arrow>
                  <IconButton onClick={handleCopy} size="small" aria-label="Copy summary" sx={{ width: 28, height: 28 }}>
                    {copied ? (
                      <CheckIcon sx={{ fontSize: 15, color: chrome.cyan }} />
                    ) : (
                      <ContentCopyIcon sx={{ fontSize: 14, color: chrome.muted }} />
                    )}
                  </IconButton>
                </Tooltip>
                {canEditSummary && !isEditing && (
                  <Tooltip title="Edit summary" placement="top" arrow>
                    <IconButton onClick={handleEdit} size="small" aria-label="Edit summary" sx={{ width: 28, height: 28 }}>
                      <EditIcon sx={{ fontSize: 14, color: chrome.muted }} />
                    </IconButton>
                  </Tooltip>
                )}
                {isEditing && (
                  <>
                    <Tooltip title="Save summary" placement="top" arrow>
                      <IconButton onClick={handleSaveEdit} size="small" aria-label="Save summary" sx={{ width: 28, height: 28 }}>
                        <SaveIcon sx={{ fontSize: 15, color: chrome.cyan }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Cancel edit" placement="top" arrow>
                      <IconButton onClick={handleCancelEdit} size="small" aria-label="Cancel edit" sx={{ width: 28, height: 28 }}>
                        <CloseIcon sx={{ fontSize: 15, color: chrome.muted }} />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                <Tooltip title="Regenerate summary" placement="top" arrow>
                  <IconButton
                    onClick={generate}
                    disabled={!analysisId || busy}
                    size="small"
                    aria-label="Regenerate summary"
                    sx={{ width: 28, height: 28 }}
                  >
                    <RefreshIcon sx={{ fontSize: 14, color: chrome.muted }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={fullscreenTablesOpen ? "Hide tables" : "Show tables"} placement="top" arrow>
                  <IconButton
                    onClick={() => setFullscreenTablesOpen((value) => !value)}
                    size="small"
                    aria-label={fullscreenTablesOpen ? "Hide volumetric tables" : "Show volumetric tables"}
                    sx={{
                      width: 28,
                      height: 28,
                      bgcolor: fullscreenTablesOpen ? chrome.cyanDim : "transparent",
                    }}
                  >
                    <TableChartIcon sx={{ fontSize: 15, color: fullscreenTablesOpen ? chrome.cyan : chrome.muted }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close full screen" placement="top" arrow>
                  <IconButton onClick={() => setFullscreenOpen(false)} size="small" aria-label="Close full screen summary" sx={{ width: 28, height: 28 }}>
                    <CloseIcon sx={{ fontSize: 15, color: chrome.muted }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                gap: 1.5,
                p: 2,
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflowY: "auto",
                  pr: 0.5,
                  "&::-webkit-scrollbar": { width: 5 },
                  "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
                  "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(148,163,184,0.24)", borderRadius: 4 },
                }}
              >
                <Box sx={{ bgcolor: "rgba(34,211,238,0.04)", border: `1px solid ${chrome.cyanGlow}`, borderRadius: "8px", px: 2, py: 1.5 }}>
                  {isEditing ? (
                    <TextField
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      multiline
                      minRows={18}
                      variant="outlined"
                      size="small"
                      aria-label="Edit generated summary"
                      sx={editFieldSx}
                    />
                  ) : (
                    <HighlightedSummary text={summary} />
                  )}
                </Box>
              </Box>
              {fullscreenTablesOpen && (
                <Box
                  sx={{
                    width: "min(360px, 36vw)",
                    minWidth: 300,
                    minHeight: 0,
                    overflowY: "auto",
                    borderLeft: `1px solid ${chrome.border}`,
                    pl: 1.5,
                    pr: 0.5,
                    "&::-webkit-scrollbar": { width: 5 },
                    "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
                    "&::-webkit-scrollbar-thumb": { bgcolor: "rgba(148,163,184,0.24)", borderRadius: 4 },
                  }}
                >
                  <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: chrome.cyan, mb: 1 }}>
                    Volumetric Tables
                  </Typography>
                  <VolumeReferenceTables analysisResult={analysisResult} />
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
