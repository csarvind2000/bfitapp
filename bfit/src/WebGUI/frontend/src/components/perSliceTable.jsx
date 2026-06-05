import { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import useNiivueStore from "../hooks/niivueStore";
import { useShallow } from "zustand/shallow";

// ── All label/color/variant logic comes from ONE place ────────────────────────
import {
  getVariantKey,
  getLabelColor,
  getDisplayName,
  shouldShowMuscleSubTable,
  isMainLabel,
} from "../utils/maskVariantUtils";

// ─────────────────────────────────────────────────────────────────────────────

export default function PerSliceTable({ perSliceData, selectedVariant, analysisResult }) {
  const { nvInstances, isVolumeLoaded, activeMaskType } = useNiivueStore(
    useShallow((state) => ({
      nvInstances: state.nvInstances,
      isVolumeLoaded: state.isVolumeLoaded,
      activeMaskType: state.activeMaskType,
    }))
  );

  const [sliceNumber, setSliceNumber] = useState(null);
  const [viewerSlice, setViewerSlice] = useState(null);
  const [csvData, setCsvData] = useState([]);

  const variantKey = getVariantKey(activeMaskType);
  const noMaskSelected = variantKey === null;
  const showMuscleSubTable = shouldShowMuscleSubTable(activeMaskType);

  // ── Load CSV rows for current variant ─────────────────────────────────────
  useEffect(() => {
    if (!perSliceData || Object.keys(perSliceData).length === 0 || !variantKey) {
      setCsvData([]);
      return;
    }

    let rows = perSliceData[variantKey];

    // Fuzzy fallback for abdomen keys that may be stored under old names
    if (!rows && variantKey === "abd_mr") {
      const fallbackKey = Object.keys(perSliceData).find((k) => {
        const l = k.toLowerCase();
        return l.includes("abd") || l.includes("abdomen");
      });
      rows = fallbackKey ? perSliceData[fallbackKey] : null;
    }

    setCsvData(rows?.length ? rows : []);
  }, [perSliceData, selectedVariant, activeMaskType]);

  // ── Track viewer slice position ───────────────────────────────────────────
  useEffect(() => {
    if (!isVolumeLoaded || !nvInstances?.length) return;
    const nv = nvInstances[0];
    const handler = (data) => {
      const voxZ = Math.round(data.vox?.[2] || 0);
      setViewerSlice(voxZ + 1);
      setSliceNumber(voxZ + 1);
    };
    nv.onLocationChange = handler;
    return () => { nv.onLocationChange = null; };
  }, [isVolumeLoaded, nvInstances]);

  // ── Normalise a raw label string ──────────────────────────────────────────
  const normalizeLabel = (label) =>
    (label ?? "").trim().toLowerCase().replace(/\s+/g, "_");

  const currentSliceData = csvData.filter((row) => Number(row.Slice) === sliceNumber);

  // ── MAIN TABLE ROWS ───────────────────────────────────────────────────────
  const mainRows = currentSliceData
    .map((row) => {
      let norm = normalizeLabel(row.Label);
      if (norm === "groin_uterus") norm = "organ";
      if (variantKey === "5class" && norm === "sat") {
        norm = "ssat";
      }
      // Collapse unknown labels to "muscle" for simple variants
      if (variantKey !== "48class" && !isMainLabel(norm, activeMaskType)) {
        norm = "muscle";
      }
      return { ...row, _normalized: norm };
    })
    .filter((row) => isMainLabel(row._normalized, activeMaskType));

  // ── SUB-MUSCLE ROWS (detailed thigh variant only) ─────────────────────────
  const subMuscleMap = {};
  currentSliceData
    .filter((row) => {
      const norm = normalizeLabel(row.Label);
      const base = norm.replace(/_left$/, "").replace(/_right$/, "");
      return (
        (norm.endsWith("_left") || norm.endsWith("_right")) &&
        !isMainLabel(base, activeMaskType)
      );
    })
    .forEach((row) => {
      const norm = normalizeLabel(row.Label);
      const isLeft = norm.endsWith("_left");
      const baseName = norm.replace(/_left$/, "").replace(/_right$/, "");
      if (!subMuscleMap[baseName]) subMuscleMap[baseName] = { left: null, right: null };
      if (isLeft) subMuscleMap[baseName].left = row;
      else subMuscleMap[baseName].right = row;
    });

  const subMuscleRows = Object.entries(subMuscleMap);

  // ── Shared styles ─────────────────────────────────────────────────────────
  const BORDER_ROW = "1px solid rgba(255,255,255,0.05)";

  const headCellSx = {
    fontSize: "11px",
    fontWeight: 700,
    color: "rgba(255,255,255,0.95)",
    py: "7px",
    px: "8px",
    borderBottom: "1px solid rgba(0,180,255,0.3)",
    background: "rgba(0,130,255,0.25)",
    whiteSpace: "nowrap",
  };

  const bodyCellSx = {
    fontSize: "12px",
    fontWeight: 600,
    py: "6px",
    px: "8px",
    borderBottom: BORDER_ROW,
    color: "rgba(255,255,255,1)",
  };

  const numCellSx = {
    ...bodyCellSx,
    fontSize: "11px",
    px: "6px",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };

  const mutedNumCellSx = { ...numCellSx, color: "rgba(255,255,255,0.45)" };

  const dotCellSx = {
    width: "20px",
    minWidth: "20px",
    p: 0,
    textAlign: "center",
    verticalAlign: "middle",
    borderBottom: BORDER_ROW,
  };

  // ── No mask ───────────────────────────────────────────────────────────────
  if (noMaskSelected) {
    return (
      <Box sx={{ px: 1 }}>
        <Typography sx={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
          No mask selected
        </Typography>
      </Box>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 1.5 }}>

      {/* Slice indicator */}
      {viewerSlice !== null && (
        <Typography sx={{
          fontSize: "13px", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.6)", pl: 0.5,
        }}>
          Slice {viewerSlice} — {variantKey}
        </Typography>
      )}

      {/* ── MAIN TABLE ── */}
      <TableContainer component={Paper} elevation={0} sx={{
        borderRadius: "10px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        overflow: "hidden",
      }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headCellSx}>Label</TableCell>
              <TableCell align="right" sx={headCellSx}>Volume (cc)</TableCell>
              <TableCell align="right" sx={headCellSx}>Area (mm²)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mainRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center"
                  sx={{ ...bodyCellSx, color: "rgba(255,255,255,0.3)", borderBottom: "none" }}>
                  No data for this slice
                </TableCell>
              </TableRow>
            ) : (
              mainRows.map((row, idx) => (
                <TableRow key={idx} sx={{
                  "&:last-child td": { borderBottom: "none" },
                  "&:hover": { background: "rgba(255,255,255,0.05)" },
                }}>
                  <TableCell sx={bodyCellSx}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <Box sx={{
                        width: 7, height: 7, minWidth: 7,
                        borderRadius: "50%",
                        backgroundColor: getLabelColor(row._normalized, activeMaskType),
                        border: "1px solid rgba(255,255,255,0.25)",
                      }} />
                      {getDisplayName(row._normalized, activeMaskType)}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, fontVariantNumeric: "tabular-nums" }}>
                    {Number(row.Volume_cc || 0).toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, fontVariantNumeric: "tabular-nums" }}>
                    {Number(row.Area_mm2 || 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── SUB-MUSCLE TABLE (only when variant config says so) ── */}
      {showMuscleSubTable && (
        <TableContainer component={Paper} elevation={0} sx={{
          borderRadius: "10px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          overflow: "auto",
          mb: 1,
        }}>
          <Table size="small" sx={{ tableLayout: "fixed", width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2} sx={{ ...headCellSx, width: "30%", verticalAlign: "middle", borderBottom: "1px solid rgba(0,180,255,0.3)" }}>
                  Muscle
                </TableCell>
                <TableCell rowSpan={2} sx={{ ...headCellSx, width: "18px", p: 0, verticalAlign: "middle", borderBottom: "1px solid rgba(0,180,255,0.3)", borderRight: "1px solid rgba(0,180,255,0.3)" }} />
                <TableCell colSpan={2} align="center" sx={{ ...headCellSx, borderBottom: "1px solid rgba(0,180,255,0.15)", borderRight: "1px solid rgba(0,180,255,0.3)", pb: "3px" }}>
                  Left
                </TableCell>
                <TableCell rowSpan={2} sx={{ ...headCellSx, width: "18px", p: 0, verticalAlign: "middle", borderBottom: "1px solid rgba(0,180,255,0.3)", borderRight: "1px solid rgba(0,180,255,0.3)" }} />
                <TableCell colSpan={2} align="center" sx={{ ...headCellSx, borderBottom: "1px solid rgba(0,180,255,0.15)", pb: "3px" }}>
                  Right
                </TableCell>
              </TableRow>
              <TableRow>
                {["Area", "Vol", "Area", "Vol"].map((label, i) => (
                  <TableCell key={i} align="right" sx={{
                    ...headCellSx, pt: "3px", fontSize: "10px", color: "rgba(255,255,255,0.6)",
                    borderBottom: "1px solid rgba(0,180,255,0.3)",
                    ...(i === 1 ? { borderRight: "1px solid rgba(0,180,255,0.3)" } : {}),
                  }}>
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {subMuscleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center"
                    sx={{ ...bodyCellSx, color: "rgba(255,255,255,0.3)", borderBottom: "none" }}>
                    No data for this slice
                  </TableCell>
                </TableRow>
              ) : (
                subMuscleRows.map(([baseName, { left, right }], idx) => (
                  <TableRow key={idx} sx={{
                    "&:last-child td": { borderBottom: "none" },
                    "&:hover": { background: "rgba(255,255,255,0.04)" },
                  }}>
                    <TableCell sx={{ ...bodyCellSx, fontSize: "11px", py: "7px", lineHeight: 1.3, whiteSpace: "normal", wordBreak: "break-word" }}>
                      {getDisplayName(baseName, activeMaskType)}
                    </TableCell>
                    <TableCell sx={{ ...dotCellSx, borderRight: "1px solid rgba(0,180,255,0.2)" }}>
                      {left && (
                        <Box sx={{
                          width: 6, height: 6, borderRadius: "50%",
                          backgroundColor: getLabelColor(normalizeLabel(left.Label), activeMaskType),
                          display: "inline-block",
                        }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ ...numCellSx, py: "7px" }}>
                      {left ? Number(left.Area_mm2 || 0).toFixed(1) : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                    </TableCell>
                    <TableCell sx={{ ...mutedNumCellSx, py: "7px", borderRight: "1px solid rgba(0,180,255,0.2)" }}>
                      {left ? Number(left.Volume_cc || 0).toFixed(2) : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                    </TableCell>
                    <TableCell sx={{ ...dotCellSx, borderRight: "1px solid rgba(0,180,255,0.2)" }}>
                      {right && (
                        <Box sx={{
                          width: 6, height: 6, borderRadius: "50%",
                          backgroundColor: getLabelColor(normalizeLabel(right.Label), activeMaskType),
                          display: "inline-block",
                        }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ ...numCellSx, py: "7px" }}>
                      {right ? Number(right.Area_mm2 || 0).toFixed(1) : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                    </TableCell>
                    <TableCell sx={{ ...mutedNumCellSx, py: "7px" }}>
                      {right ? Number(right.Volume_cc || 0).toFixed(2) : <span style={{ color: "rgba(255,255,255,0.2)" }}>—</span>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
