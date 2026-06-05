import { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Typography,
  Collapse,
  IconButton,
  Tooltip,
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
  getLabelIndex,
} from "../utils/maskVariantUtils";

// ─────────────────────────────────────────────────────────────────────────────

export default function AnalysisResultTable({ analysisResult }) {
  const [mainTable, setMainTable] = useState({});
  const [muscleTable, setMuscleTable] = useState({});
  const [muscleSearch, setMuscleSearch] = useState("");
  const [showSubMuscles, setShowSubMuscles] = useState(true);

  const { segmentationTypeLoaded, activeMaskType } = useNiivueStore(
    useShallow((state) => ({
      segmentationTypeLoaded: state.segmentationTypeLoaded,
      activeMaskType: state.activeMaskType,
    }))
  );

  const currentMaskType = activeMaskType || segmentationTypeLoaded || "";
  const variantKey = getVariantKey(currentMaskType);
  const showMuscleTable = shouldShowMuscleSubTable(currentMaskType);

  // ── CSV parser ────────────────────────────────────────────────────────────
  const parseCSV = (b64) => {
    try {
      const decoded = atob(b64);
      const lines = decoded.split("\n").filter((l) => l.trim() !== "");
      const headers = lines[0].split(",");
      const values = lines[1].split(",");
      const obj = {};
      headers.forEach((h, i) => { obj[h.trim()] = values[i]; });
      return obj;
    } catch (err) {
      console.error("CSV parse error:", err);
      return null;
    }
  };

  // ── Build tables from prediction data ─────────────────────────────────────
  useEffect(() => {
    if (!analysisResult) return;

    const key = getVariantKey(currentMaskType);
    let selectedPrediction = null;

    // Try volume_csv first
    if (analysisResult?.volume_csv) {
      const csvKeys = Object.keys(analysisResult.volume_csv);
      const matchingCsvKey = key
        ? csvKeys.find((k) => {
            const lower = k.toLowerCase();
            if (key === "abd_mr")
              return (
                lower.includes("abd_mr") ||
                lower.includes("abdomen") ||
                lower.includes("abdominal") ||
                lower.includes("abd")
              );
            return lower.includes(key);
          })
        : csvKeys[0];

      const summary = matchingCsvKey
        ? analysisResult.volume_csv[matchingCsvKey]?.summary?.b64_data
        : null;
      if (summary) selectedPrediction = parseCSV(summary);
    }

    // Fall back to predictions array
    if (!selectedPrediction && analysisResult?.predictions?.length) {
      const prediction = analysisResult.predictions[0].prediction;
      if (key === "5class") selectedPrediction = prediction["5class"]?.[0];
      else if (key === "48class") selectedPrediction = prediction["48class"]?.[0];
      else if (key === "abd_mr")
        selectedPrediction =
          prediction["abd_mr"]?.[0] ??
          prediction["abdomen"]?.[0] ??
          prediction["abd"]?.[0];
    }

    if (!selectedPrediction) {
      setMainTable({});
      setMuscleTable({});
      return;
    }

    const main = {};
    const muscles = {};
    const isSimpleVariant = key !== "48class";

    Object.keys(selectedPrediction).forEach((csvKey) => {
      if (!csvKey.includes("_Volume")) return;

      const raw = csvKey.replace("_Volume", "");
      const volume = selectedPrediction[csvKey];
      const percent = selectedPrediction[`${raw}_%`] ?? "-";
      const base = raw.toLowerCase();

      if (isSimpleVariant) {
        // Bucket into human-readable keys that getDisplayName can resolve
        let name;
        if (base.includes("dsat")) name = "dsat";
        else if (base.includes("vat") || base.includes("visceral")) name = "vat";
        else if (base.includes("ssat") || base.includes("sat")) name = "ssat";
        else if (base.includes("imat")) name = "imat";
        else if (base.includes("bone")) name = "bone";
        else if (base.includes("total")) name = "Total";
        else if (base.includes("organ")) name = "organ";
        else name = "muscle";

        if (!main[name]) main[name] = [0, 0];
        main[name][0] += Number(volume || 0);
        if (percent !== "-") main[name][1] = Number(percent || 0);
        return;
      }

      // 48-class: split bilateral aggregates vs per-side muscles
      let name = raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const isLeft = name.includes("Left");
      const isRight = name.includes("Right");

      if (!isLeft && !isRight) {
        if (main[name]) return;
        main[name] = [volume, percent];
      } else {
        const muscleName = name.replace(" Left", "").replace(" Right", "");
        if (!muscles[muscleName]) muscles[muscleName] = { left: ["-", "-"], right: ["-", "-"] };
        if (isLeft) muscles[muscleName].left = [volume, percent];
        if (isRight) muscles[muscleName].right = [volume, percent];
      }
    });

    setMainTable(main);
    setMuscleTable(muscles);
  }, [analysisResult, segmentationTypeLoaded, activeMaskType]);

  // ── Search highlight ──────────────────────────────────────────────────────
  const highlight = (text, query) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <span key={i} style={{
          backgroundColor: "rgba(0,229,255,0.15)", color: "#00e5ff",
          fontWeight: 700, padding: "0 2px", borderRadius: "3px",
        }}>
          {part}
        </span>
      ) : part
    );
  };

  const splitMuscleName = (name) => {
    const words = name.trim().split(" ");
    if (words.length === 1) return [name, null];
    return [words[0], words.slice(1).join(" ")];
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const headCellSx = {
    fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.95)",
    py: "7px", px: "8px", borderBottom: "1px solid rgba(0,180,255,0.3)",
    background: "rgba(0,130,255,0.25)", whiteSpace: "nowrap",
  };

  const bodyCellSx = {
    fontSize: "12px", fontWeight: 500, py: "6px", px: "8px",
    borderBottom: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,1)",
  };

  const numCellSx = {
    ...bodyCellSx, fontSize: "11px", px: "4px",
    textAlign: "center", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
  };

  const mutedNumCellSx = { ...numCellSx, color: "rgba(255,255,255,0.55)" };
  const subMuscleCellSx = {
    ...bodyCellSx,
    fontSize: "10.5px",
    px: "4px",
    py: "5px",
    lineHeight: 1.2,
  };
  const subNumCellSx = {
    ...numCellSx,
    fontSize: "10.5px",
    px: "2px",
    py: "5px",
    minWidth: 0,
  };
  const subMutedNumCellSx = { ...subNumCellSx, color: "rgba(255,255,255,0.55)" };

  const subMuscleRows = Object.entries(muscleTable)
    .filter(([m]) => m.toLowerCase().includes(muscleSearch.toLowerCase()))
    .sort(([a], [b]) => getLabelIndex(a, currentMaskType) - getLabelIndex(b, currentMaskType));

  const sumSide = (side, valueIndex) => {
    let total = 0;
    let hasValue = false;
    subMuscleRows.forEach(([, data]) => {
      const value = data?.[side]?.[valueIndex];
      if (value === "-" || value === null || value === undefined || value === "") return;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return;
      total += numeric;
      hasValue = true;
    });
    return hasValue ? total : null;
  };

  const subMuscleTotals = {
    leftVolume: sumSide("left", 0),
    leftPercent: sumSide("left", 1),
    rightVolume: sumSide("right", 0),
    rightPercent: sumSide("right", 1),
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: 1.5 }}>

      {/* ── MAIN TISSUE TABLE ── */}
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
              <TableCell align="right" sx={{ ...headCellSx, width: "100px" }}>Distribution</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Object.keys(mainTable).length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ ...bodyCellSx, color: "rgba(255,255,255,0.3)" }}>
                  No data available
                </TableCell>
              </TableRow>
            ) : (
              [
                ...Object.entries(mainTable).filter(([key]) => key !== "Total"),
                ...(mainTable["Total"] ? [["Total", mainTable["Total"]]] : []),
              ].map(([key, values]) => {
                const isTotal = key === "Total";
                // Normalise key for color lookup — "groin/uterus" → "organ"
                const normalized = key.toLowerCase().replace(/\s+/g, "_").replace("groin/uterus", "organ");
                const color = getLabelColor(normalized, currentMaskType);
                const pctVal = !isTotal && values[1] ? Number(values[1]) : 0;

                return (
                  <TableRow key={key} sx={{
                    "&:last-child td": { borderBottom: "none" },
                    background: isTotal ? "rgba(255,255,255,0.05)" : "transparent",
                    "&:hover": { background: "rgba(255,255,255,0.06)" },
                  }}>
                    <TableCell sx={{ ...bodyCellSx, fontWeight: isTotal ? 700 : 600 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: "7px" }}>
                        <Box sx={{
                          width: 7, height: 7, minWidth: 7, borderRadius: "50%",
                          backgroundColor: isTotal ? "transparent" : color,
                          border: isTotal ? "none" : "1px solid rgba(255,255,255,0.25)",
                        }} />
                        {isTotal ? "Total" : getDisplayName(normalized, currentMaskType)}
                      </Box>
                    </TableCell>
                    <TableCell align="center" sx={{ ...bodyCellSx, fontWeight: isTotal ? 700 : 600, fontVariantNumeric: "tabular-nums" }}>
                      {values[0] ? Number(values[0]).toFixed(2) : "-"}
                    </TableCell>
                    <TableCell align="center" sx={{ ...bodyCellSx, width: "80px", px: "6px", py: "4px", borderBottom: "none" }}>
                      {!isTotal && pctVal ? (
                        <Typography sx={{ ...bodyCellSx, display: "inline-block", fontWeight: 600, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                          {pctVal.toFixed(1)}%
                        </Typography>
                      ) : (
                        <Typography sx={{ ...bodyCellSx, display: "inline-block", color: "rgba(255,255,255,0.2)", textAlign: "center" }}>
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── SUB-MUSCLE TABLE (only when variant config says so) ── */}
      {showMuscleTable && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              px: 0.5,
            }}
          >
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
            <TextField
              fullWidth size="small" placeholder="Search sub-muscles…"
              value={muscleSearch} onChange={(e) => setMuscleSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 15, color: "rgba(255,255,255,0.3)" }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                mb: 1.5,
                "& .MuiOutlinedInput-root": {
                  fontSize: "12px", borderRadius: "8px",
                  background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,1)",
                  "& fieldset": { borderColor: "rgba(255,255,255,0.25)" },
                  "&:hover fieldset": { borderColor: "rgba(255,255,255,0.45)" },
                  "&.Mui-focused fieldset": { borderColor: "rgba(0,180,255,0.7)", borderWidth: "1px" },
                },
                "& input::placeholder": { color: "rgba(255,255,255,0.5)", opacity: 1 },
              }}
            />

            <TableContainer component={Paper} elevation={0} sx={{
              borderRadius: "10px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              overflow: "hidden", mb: 1,
            }}>
              <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
              <colgroup>
                <col style={{ width: "39%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "11%" }} />
              </colgroup>
              <TableHead>
                <TableRow>
                  <TableCell rowSpan={2} sx={{ ...headCellSx, px: "4px", verticalAlign: "middle", borderBottom: "1px solid rgba(0,180,255,0.3)", whiteSpace: "nowrap" }}>
                    Muscle
                  </TableCell>
                  <TableCell rowSpan={2} sx={{ ...headCellSx, px: 0, borderBottom: "1px solid rgba(0,180,255,0.3)", pb: "2px" }} />
                  <TableCell colSpan={2} align="center" sx={{ ...headCellSx, px: "2px", borderLeft: "1px solid rgba(0,180,255,0.2)", borderBottom: "1px solid rgba(0,180,255,0.15)", pb: "2px" }}>
                    Left
                  </TableCell>
                  <TableCell rowSpan={2} sx={{ ...headCellSx, px: 0, borderLeft: "1px solid rgba(0,180,255,0.2)", borderBottom: "1px solid rgba(0,180,255,0.3)", pb: "2px" }} />
                  <TableCell colSpan={2} align="center" sx={{ ...headCellSx, px: "2px", borderLeft: "1px solid rgba(0,180,255,0.2)", borderBottom: "1px solid rgba(0,180,255,0.15)", pb: "2px" }}>
                    Right
                  </TableCell>
                </TableRow>
                <TableRow>
                  {["Vol", "%", "Vol", "%"].map((label, i) => (
                    <TableCell key={i} align="center" sx={{
                      ...headCellSx, px: "2px", pt: "2px", fontSize: "10px", color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap",
                      ...(i === 0 || i === 2 ? { borderLeft: "1px solid rgba(0,180,255,0.2)" } : {}),
                    }}>
                      {label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {subMuscleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ ...bodyCellSx, color: "rgba(255,255,255,0.3)", borderBottom: "none" }}>
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {subMuscleRows.map(([muscle, data]) => {
                      const base = muscle.toLowerCase().replace(/\s+/g, "_");
                      const [firstName, restName] = splitMuscleName(muscle);

                      return (
                        <TableRow key={muscle} sx={{ "&:last-child td": { borderBottom: "none" }, "&:hover": { background: "rgba(255,255,255,0.04)" } }}>
                          <TableCell sx={subMuscleCellSx}>
                            <Box sx={{ display: "flex", alignItems: "flex-start", gap: "4px", minWidth: 0 }}>
                              <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                                <span style={{ fontSize: "10.5px", fontWeight: 500, color: "rgba(255,255,255)", whiteSpace: "normal", overflowWrap: "anywhere" }}>
                                  {highlight(firstName, muscleSearch)}
                                </span>
                                {restName && (
                                  <span style={{ fontSize: "10.5px", fontWeight: 500, color: "rgba(255,255,255)", whiteSpace: "normal", overflowWrap: "anywhere" }}>
                                    {highlight(restName, muscleSearch)}
                                  </span>
                                )}
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={subNumCellSx}>
                            {data.left[0] !== "-" && (
                              <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: getLabelColor(`${base}_left`, currentMaskType), display: "inline-block" }} />
                            )}
                          </TableCell>
                          <TableCell sx={{ ...subNumCellSx, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                            {data.left[0] !== "-" ? Number(data.left[0]).toFixed(2) : "—"}
                          </TableCell>
                          <TableCell sx={subMutedNumCellSx}>
                            {data.left[1] !== "-" ? `${Number(data.left[1]).toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell sx={{ ...subNumCellSx, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                            {data.right[0] !== "-" && (
                              <Box sx={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: getLabelColor(`${base}_right`, currentMaskType), display: "inline-block" }} />
                            )}
                          </TableCell>
                          <TableCell sx={{ ...subNumCellSx, borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                            {data.right[0] !== "-" ? Number(data.right[0]).toFixed(2) : "—"}
                          </TableCell>
                          <TableCell sx={subMutedNumCellSx}>
                            {data.right[1] !== "-" ? `${Number(data.right[1]).toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow sx={{ background: "rgba(255,255,255,0.07)", "& td": { border: 0, fontWeight: 800 } }}>
                      <TableCell sx={{ ...subMuscleCellSx, color: "#fff", border: 0 }}>
                        Total
                      </TableCell>
                      <TableCell sx={{ ...subNumCellSx, border: 0 }} />
                      <TableCell sx={{ ...subNumCellSx, border: 0 }}>
                        {subMuscleTotals.leftVolume !== null ? subMuscleTotals.leftVolume.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell sx={{ ...subMutedNumCellSx, border: 0 }}>
                        {subMuscleTotals.leftPercent !== null ? `${subMuscleTotals.leftPercent.toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell sx={{ ...subNumCellSx, border: 0, borderLeft: "1px solid rgba(255,255,255,0.16)" }} />
                      <TableCell sx={{ ...subNumCellSx, border: 0 }}>
                        {subMuscleTotals.rightVolume !== null ? subMuscleTotals.rightVolume.toFixed(2) : "—"}
                      </TableCell>
                      <TableCell sx={{ ...subMutedNumCellSx, border: 0 }}>
                        {subMuscleTotals.rightPercent !== null ? `${subMuscleTotals.rightPercent.toFixed(1)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
              </Table>
            </TableContainer>
          </Collapse>
        </>
      )}
    </Box>
  );
}
