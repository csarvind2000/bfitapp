import { useEffect, useState } from "react";
import {
  Box,
  Collapse,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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

export default function PerSliceTable({
  perSliceData,
  selectedVariant,
  analysisResult,
}) {
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
  const [showSubMuscles, setShowSubMuscles] = useState(true);
  const [muscleSearch, setMuscleSearch] = useState("");

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

    if (!rows && variantKey === "47class") {
      const fallbackKey = Object.keys(perSliceData).find((k) => {
        const l = k.toLowerCase();
        return l.includes("47class") || l.includes("48class");
      });
      rows = fallbackKey ? perSliceData[fallbackKey] : null;
    }

    setCsvData(rows?.length ? rows : []);
  }, [perSliceData, selectedVariant, activeMaskType, variantKey]);

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
      if (variantKey !== "47class" && !isMainLabel(norm, activeMaskType)) {
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
  const filteredSubMuscleRows = subMuscleRows.filter(([baseName]) =>
    getDisplayName(baseName, activeMaskType)
      .toLowerCase()
      .includes(muscleSearch.trim().toLowerCase())
  );

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
    fontWeight: 500,
    py: "6px",
    px: "8px",
    borderBottom: BORDER_ROW,
    color: "rgba(255,255,255,1)",
  };

  const numCellSx = {
    ...bodyCellSx,
    fontSize: "11px",
    px: "4px",
    textAlign: "center",
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

  const sectionSx = {
    borderRadius: "10px",
    background: "rgba(255,255,255,0.035)",
    border: "1px solid rgba(148,163,184,0.22)",
    overflow: "hidden",
  };

  const sectionHeaderSx = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 1,
    px: 1.25,
    py: 0.75,
    background: "rgba(15,23,42,0.40)",
  };

  // ── No mask ───────────────────────────────────────────────────────────────
  if (noMaskSelected) {
    return (
      <TableContainer component={Paper} elevation={0} sx={{
        borderRadius: "10px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        overflow: "hidden",
      }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headCellSx}>Tissue</TableCell>
              <TableCell align="right" sx={headCellSx}>Vol (cc)</TableCell>
              <TableCell align="right" sx={headCellSx}>Area (mm²)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell colSpan={3} align="center" sx={{ ...bodyCellSx, color: "rgba(255,255,255,0.3)", borderBottom: "none" }}>
                <Box sx={{ fontStyle: "italic", lineHeight: 1.45 }}>
                  <Typography component="div" sx={{ fontSize: "12px", fontStyle: "italic", color: "rgba(255,255,255,0.38)" }}>
                    No mask selected.
                  </Typography>
                  <Typography component="div" sx={{ fontSize: "12px", fontStyle: "italic", color: "rgba(255,255,255,0.38)" }}>
                    Please select a mask to view the data.
                  </Typography>
                </Box>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 1.5 }}>
      {viewerSlice !== null && (
        <Typography sx={{
          fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.55)", pl: 0.5,
        }}>
          Slice {viewerSlice} — {variantKey}
        </Typography>
      )}

      <TableContainer component={Paper} elevation={0} sx={{
        borderRadius: "10px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        overflow: "hidden",
      }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={headCellSx}>Tissue</TableCell>
              <TableCell align="right" sx={headCellSx}>Vol (cc)</TableCell>
              <TableCell align="right" sx={headCellSx}>Area (mm²)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mainRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center"
                  sx={{ ...bodyCellSx, color: "rgba(255,255,255,0.3)", borderBottom: "none" }}>
                  <Box sx={{ fontStyle: "italic", lineHeight: 1.45 }}>
                    <Typography component="div" sx={{ fontSize: "12px", fontStyle: "italic", color: "rgba(255,255,255,0.38)" }}>
                      No mask selected.
                    </Typography>
                    <Typography component="div" sx={{ fontSize: "12px", fontStyle: "italic", color: "rgba(255,255,255,0.38)" }}>
                      Please select a mask to view the data.
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              mainRows.map((row, idx) => (
                <TableRow key={idx} sx={{
                  "&:last-child td": { borderBottom: "none" },
                  "&:hover": { background: "rgba(255,255,255,0.05)" },
                }}>
                  <TableCell sx={{ ...bodyCellSx, fontWeight: 600 }}>
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
                  <TableCell align="center" sx={{ ...bodyCellSx, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {Number(row.Volume_cc || 0).toFixed(2)}
                  </TableCell>
                  <TableCell align="center" sx={{ ...bodyCellSx, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {Number(row.Area_mm2 || 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {showMuscleSubTable && (
        <Box sx={sectionSx}>
          <Box sx={sectionHeaderSx}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.86)" }}>
              Sub-muscles
            </Typography>
            <Tooltip title={showSubMuscles ? "Collapse sub-muscle table" : "Expand sub-muscle table"}>
              <IconButton
                size="small"
                onClick={() => setShowSubMuscles((value) => !value)}
                aria-label={showSubMuscles ? "Collapse sub-muscle table" : "Expand sub-muscle table"}
                sx={{
                  borderRadius: 1,
                  color: "rgba(255,255,255,0.72)",
                  "&:hover": {
                    color: "secondary.main",
                    backgroundColor: "rgba(0,180,255,0.10)",
                  },
                }}
              >
                {showSubMuscles ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>

          <Collapse in={showSubMuscles} timeout="auto" unmountOnExit>
            <Box sx={{ p: 1, borderTop: "1px solid rgba(148,163,184,0.16)" }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search sub-muscles..."
                value={muscleSearch}
                onChange={(event) => setMuscleSearch(event.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 16, color: "rgba(255,255,255,0.45)" }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  mb: 1,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "8px",
                    bgcolor: "rgba(255,255,255,0.045)",
                    color: "rgba(255,255,255,0.9)",
                    fontSize: "12px",
                    "& fieldset": { borderColor: "rgba(148,163,184,0.28)" },
                    "&:hover fieldset": { borderColor: "rgba(34,211,238,0.45)" },
                    "&.Mui-focused fieldset": { borderColor: "rgba(34,211,238,0.75)" },
                  },
                  "& .MuiInputBase-input::placeholder": {
                    color: "rgba(255,255,255,0.45)",
                    opacity: 1,
                  },
                }}
              />

              <TableContainer component={Paper} elevation={0} sx={{
                borderRadius: "10px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
                overflow: "auto",
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
                    {filteredSubMuscleRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center"
                          sx={{ ...bodyCellSx, color: "rgba(255,255,255,0.3)", borderBottom: "none" }}>
                          No matching sub-muscles for this slice
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSubMuscleRows.map(([baseName, { left, right }], idx) => (
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
            </Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}
