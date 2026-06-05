import React, { useState, useRef, useEffect } from "react";
import pako from "pako";
import { useAlert } from "../hooks/alert";
import { useDebounce } from "../hooks/debounce";
import { Niivue } from "@niivue/niivue";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Slider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ContrastIcon from "@mui/icons-material/Contrast";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import RemoveIcon from "@mui/icons-material/Remove";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import analysisService from "../services/analysis";

const niivueSettings = {
  viewModeHotKey: null,
  crosshairWidth: 0,
  sliceType: 1,
  isRadiologicalConvention: true,
  sagittalNoseLeft: true,
  drawFillOverwrites: false,
  invertScrollDirection: true,
};

const REGIONS = [
  {
    key: "upper",
    label: "Upper",
    icon: <KeyboardArrowUpIcon sx={{ fontSize: 22 }} />,
    description: "Superior third",
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.35)",
    gradient: "linear-gradient(135deg, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0.04) 100%)",
  },
  {
    key: "middle",
    label: "Middle",
    icon: <RemoveIcon sx={{ fontSize: 22 }} />,
    description: "Mid third",
    color: "#34d399",
    glow: "rgba(52,211,153,0.35)",
    gradient: "linear-gradient(135deg, rgba(52,211,153,0.18) 0%, rgba(52,211,153,0.04) 100%)",
  },
  {
    key: "lower",
    label: "Lower",
    icon: <KeyboardArrowDownIcon sx={{ fontSize: 22 }} />,
    description: "Inferior third",
    color: "#fb923c",
    glow: "rgba(251,146,60,0.35)",
    gradient: "linear-gradient(135deg, rgba(251,146,60,0.18) 0%, rgba(251,146,60,0.04) 100%)",
  },
];

const EATBoundModal = ({ open, closeDialog, EATVolume, EATMask, boundEAT }) => {
  const [upperBound, setUpperBound] = useState(1);
  const [bounds, setBounds] = useState([1, 1]);
  const [nvInstance] = useState(() => new Niivue(niivueSettings));
  const [maskOpacity, setMaskOpacity] = useState(1);
  const [mounted, setIsMounted] = useState(false);
  const canvasRef = useRef();
  const isNvAttached = useRef(false);
  const showAlert = useAlert();
  const [debouncedBounds] = useDebounce(bounds, 70);
  const [loading, setLoading] = useState(false);
  const [activeRegion, setActiveRegion] = useState(null);

  const boundChange = (event, newValue) => {
    setBounds(newValue);
    setActiveRegion(null);
  };

  const getRegionBounds = (region) => {
    const third = Math.floor(upperBound / 3);
    switch (region) {
      case "upper": return [Math.floor((upperBound * 2) / 3) + 1, upperBound];
      case "middle": return [third + 1, Math.floor((upperBound * 2) / 3)];
      case "lower": return [1, third];
      default: return [1, upperBound];
    }
  };

  const handleRegionPreset = (region) => {
    setBounds(getRegionBounds(region));
    setActiveRegion(region);
  };

  useEffect(() => {
    if (!mounted && canvasRef.current) {
      nvInstance
        .attachToCanvas(canvasRef.current)
        .then(() => setIsMounted(true))
        .catch(console.error);
    }
  }, [mounted, nvInstance]);

  useEffect(() => {
    if (mounted && EATVolume && !isNvAttached.current) {
      const slices = EATVolume.dims[3];
      setBounds([1, slices]);
      setUpperBound(slices);
      nvInstance.addVolume(EATVolume);
      nvInstance.setDrawingEnabled(true);
      nvInstance.setPenValue(0, true);
      nvInstance.drawFillOverwrites = false;
      nvInstance.updateGLVolume();
      nvInstance.opts.penSize = 1;
      isNvAttached.current = true;
    }
  }, [EATVolume, mounted, nvInstance]);

  const volumeDims = EATVolume?.dims ?? null;

  useEffect(() => {
    let isExpired = false;
    if (nvInstance && isNvAttached.current && EATMask && volumeDims) {
      nvInstance.loadDrawingFromUrl(EATMask).then(() => {
        if (isExpired) return;
        const lower = debouncedBounds[0] - 1;
        const upper = debouncedBounds[1] - 1;
        const rows = volumeDims[2];
        const penValue = 2;
        for (let row = 0; row < rows; row++) {
          nvInstance.drawPenLine([0, row, lower], [volumeDims[1], row, lower], penValue);
          nvInstance.drawPenLine([0, row, upper], [volumeDims[1], row, upper], penValue);
        }
        nvInstance.refreshDrawing();
      });
    }
    return () => { isExpired = true; };
  }, [debouncedBounds, EATMask, volumeDims, nvInstance]);

  const handleMaskOpacity = (e) => {
    setMaskOpacity(e.target.value);
    nvInstance.setDrawOpacity(e.target.value);
  };

  const handleResetWindow = () => {
    nvInstance.volumes[0].cal_min = -200;
    nvInstance.volumes[0].cal_max = 600;
    nvInstance.updateGLVolume();
  };

  const boundMask = async () => {
    try {
      const gzippedData = pako.gzip(EATMask);
      const imageBlob = new Blob([gzippedData], { type: "application/octet-stream" });
      const formData = new FormData();
      formData.append("mask", imageBlob, "mask.nii.gz");
      formData.append("lower", bounds[0]);
      formData.append("upper", bounds[1]);
      const boundedEAT = await analysisService.getBounded(formData);
      await boundEAT(boundedEAT.file_data);
    } catch (error) {
      showAlert(`Failed to bound EAT: ${JSON.stringify(error.response?.data)}`, "error");
    }
  };

  const activeRegionData = REGIONS.find((r) => r.key === activeRegion);
  const sliceRange = bounds[1] - bounds[0] + 1;
  const coverage = upperBound > 1 ? Math.round((sliceRange / upperBound) * 100) : 0;

  const glassCard = {
    borderRadius: "12px",
    border: "1px solid rgba(255, 255, 255, 0.33)",
    background: "linear-gradient(135deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)",
    backdropFilter: "blur(12px)",
  };

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      maxWidth="sm"
      fullWidth
      slots={{ transition: undefined }}
      keepMounted={true}
      disablePortal
      disableScrollLock
      PaperProps={{
        sx: {
          backgroundImage: "none",
          background: "linear-gradient(160deg, #0d1521 0%, #0a1018 60%, #080d14 100%)",
          border: "1px solid rgba(255, 255, 255, 0.5)",
          borderRadius: "16px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04) inset",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            pointerEvents: "none",
            zIndex: 0,
          },
        },
      }}
    >

      {/* ── Header ── */}
      <DialogTitle
        sx={{
          px: 3,
          pt: 2.5,
          pb: 2,
          position: "relative",
          zIndex: 1,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1.5} mb={0.5}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: "#38bdf8",
                boxShadow: "0 0 8px #38bdf8",
              }}
            />
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: "1.15rem",
                color: "#fff",
                letterSpacing: "0.01em",
              }}
            >
              Select Bounds
            </Typography>
            {activeRegionData && (
              <Chip
                label={activeRegionData.label}
                size="small"
                sx={{
                  bgcolor: `${activeRegionData.color}20`,
                  color: activeRegionData.color,
                  border: `1px solid ${activeRegionData.color}50`,
                  fontWeight: 700,
                  fontSize: "0.72rem",
                  height: 22,
                  boxShadow: `0 0 10px ${activeRegionData.glow}`,
                }}
              />
            )}
          </Stack>
          <Typography sx={{ color: "rgba(255,255,255,0.45)", fontSize: "0.82rem", pl: "20px" }}>
            Define the axial slice range for segmentation
          </Typography>
        </Box>

        {/* Stat pills */}
        <Stack direction="row" spacing={1} alignItems="center" flexShrink={0}>
          {[
            { label: "SLICES", value: `${bounds[0]}–${bounds[1]}` },
            { label: "COVERAGE", value: `${coverage}%` },
          ].map(({ label, value }) => (
            <Box key={label} sx={{ ...glassCard, px: 1.75, py: 0.75, textAlign: "center", minWidth: 68 }}>
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.45)",
                  fontSize: "0.58rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  lineHeight: 1,
                  mb: 0.4,
                }}
              >
                {label}
              </Typography>
              <Typography
                sx={{ color: "#fff", fontWeight: 800, fontSize: "0.9rem", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}
              >
                {value}
              </Typography>
            </Box>
          ))}
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ px: 3, py: 2.5, background: "transparent", position: "relative", zIndex: 1 }}>
        <Stack spacing={2.5}>

          {/* ── Opacity card ── */}
          <Box sx={{ ...glassCard, p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  minWidth: 60,
                }}
              >
                Opacity
              </Typography>

              <Slider
                min={0} max={1} step={0.01}
                value={maskOpacity}
                onChange={handleMaskOpacity}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
                size="small"
                disabled={!mounted}
                sx={{
                  flex: 1,
                  "& .MuiSlider-thumb": {
                    width: 14,
                    height: 14,
                    bgcolor: "#fff",
                    boxShadow: "0 0 0 3px rgba(56,189,248,0.3)",
                    "&:hover": { boxShadow: "0 0 0 6px rgba(56,189,248,0.25)" },
                  },
                  "& .MuiSlider-track": {
                    background: "linear-gradient(90deg, #38bdf8, #34d399)",
                    borderColor: "transparent",
                    height: 4,
                  },
                  "& .MuiSlider-rail": { bgcolor: "rgba(255,255,255,0.1)", height: 4 },
                }}
              />

              <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "0.95rem", minWidth: 42, textAlign: "right" }}>
                {Math.round(maskOpacity * 100)}%
              </Typography>

              <Tooltip title="Reset HU window (–200 to 600)">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleResetWindow}
                    disabled={!mounted}
                    sx={{
                      color: "rgba(255,255,255,0.55)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "8px",
                      width: 32,
                      height: 32,
                      transition: "all 0.15s",
                      "&:hover": {
                        color: "#38bdf8",
                        border: "1px solid rgba(56,189,248,0.4)",
                        bgcolor: "rgba(56,189,248,0.08)",
                        boxShadow: "0 0 12px rgba(56,189,248,0.2)",
                      },
                    }}
                  >
                    <ContrastIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Box>

          {/* ── Region buttons ── */}
          <Box>
            <Typography
              sx={{
                color: "rgb(255, 255, 255)",
                fontSize: "0.9rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                mb: 1.25,
                pl: 0.5,
              }}
            >
              Quick Region Select
            </Typography>

            <Stack direction="row" spacing={1.25}>
              {REGIONS.map(({ key, label, icon, description, color, glow, gradient }) => {
                const isActive = activeRegion === key;
                return (
                  <Box
                    key={key}
                    onClick={() => mounted && handleRegionPreset(key)}
                    sx={{
                      flex: 1,
                      py: 2,
                      px: 1,
                      borderRadius: "12px",
                      border: "1px solid",
                      borderColor: isActive ? `${color}60` : "rgba(255, 255, 255, 0.39)",
                      background: isActive
                        ? gradient
                        : "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                      cursor: mounted ? "pointer" : "default",
                      opacity: mounted ? 1 : 0.35,
                      transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                      textAlign: "center",
                      position: "relative",
                      overflow: "hidden",
                      boxShadow: isActive ? `0 0 20px ${glow}, 0 0 40px ${glow.replace("0.35", "0.1")}` : "none",
                      "&:hover": mounted ? {
                        borderColor: `${color}45`,
                        background: gradient,
                        boxShadow: `0 0 16px ${glow}`,
                      } : {},
                    }}
                  >
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        border: `1.5px solid ${isActive ? color : "rgba(255,255,255,0.15)"}`,
                        background: isActive
                          ? `radial-gradient(circle, ${color}25 0%, transparent 70%)`
                          : "rgba(255,255,255,0.04)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        mx: "auto",
                        mb: 1.25,
                        color: isActive ? color : "rgba(255,255,255,0.6)",
                        transition: "all 0.2s ease",
                        boxShadow: isActive ? `0 0 12px ${glow}` : "none",
                      }}
                    >
                      {icon}
                    </Box>

                    <Typography
                      sx={{
                        fontWeight: 700,
                        color: isActive ? color : "#fff",
                        fontSize: "0.92rem",
                        letterSpacing: "0.01em",
                        mb: 0.3,
                        transition: "color 0.2s",
                      }}
                    >
                      {label}
                    </Typography>

                    <Typography
                      sx={{
                        color: isActive ? `${color}bb` : "rgba(255,255,255,0.38)",
                        fontSize: "0.72rem",
                        transition: "color 0.2s",
                      }}
                    >
                      {description}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          {/* ── Canvas viewer ── */}
          <Box
            sx={{
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.39)",
              bgcolor: "#000",
              display: "flex",
              alignItems: "stretch",   // ADD: stretch children to full height
              position: "relative",
              transition: "border-color 0.2s, box-shadow 0.2s",
              "&:hover": {
                borderColor: "rgba(62, 169, 214, 0.62)",
                boxShadow: "0 0 24px rgba(56,189,248,0.08)",
              },
            }}
          >
            <canvas
              id={0}
              ref={canvasRef}
              height={370}
              style={{
                display: "block",
                maxHeight: "400px",
                objectFit: "contain",
                flex: 1,
                minWidth: 0,          // ADD: prevents flex blowout
              }}
            />

            {/* Slider rail */}
            <Box
              sx={{
                width: 48,
                display: "flex",      // REMOVE fixed height: 370 — let it stretch naturally
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                borderLeft: "1px solid rgba(255,255,255,0.06)",  // keep subtle, not 0.83
                background: "linear-gradient(180deg, rgba(56,189,248,0.04) 0%, rgba(0,0,0,0.3) 100%)",
                gap: 0.5,
              }}
            >
              <Typography
                sx={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "0.55rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  writingMode: "vertical-rl",
                  mb: 1,
                }}
              >
                {bounds[1]}
              </Typography>

              <Slider
                orientation="vertical"
                value={bounds}
                min={1}
                max={upperBound}
                shiftStep={1}
                step={1}
                onChange={boundChange}
                disabled={!mounted}
                valueLabelDisplay="auto"
                size="small"
                sx={{
                  height: "70%",
                  "& .MuiSlider-thumb": {
                    width: 20,
                    height: 28,
                    borderRadius: "6px",
                    bgcolor: "#fff",
                    boxShadow: "0 0 10px rgba(56,189,248,0.4), 0 2px 8px rgba(0,0,0,0.5)",
                    "&:hover": {
                      bgcolor: "#e0f2fe",
                      boxShadow: "0 0 16px rgba(56,189,248,0.6)",
                    },
                  },
                  "& .MuiSlider-track": {
                    width: 4,
                    background: "linear-gradient(180deg, #38bdf8, #34d399)",
                    borderColor: "transparent",
                  },
                  "& .MuiSlider-rail": {
                    width: 4,
                    bgcolor: "rgba(255,255,255,0.08)",
                    borderRadius: "4px",
                  },
                }}
              />

              <Typography
                sx={{
                  color: "rgba(255,255,255,0.3)",
                  fontSize: "0.55rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  writingMode: "vertical-rl",
                  mt: 1,
                }}
              >
                {bounds[0]}
              </Typography>
            </Box>
          </Box>

        </Stack>
      </DialogContent>

      {/* ── Footer ── */}
      <DialogActions
        sx={{
          px: 3,
          py: 2,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.2)",
          position: "relative",
          zIndex: 1,
          gap: 1.5,
        }}
      >
        <Button
          onClick={closeDialog}
          sx={{
            color: "rgba(255,255,255,0.45)",
            fontSize: "0.85rem",
            fontWeight: 600,
            px: 2.5,
            borderRadius: "8px",
            letterSpacing: "0.03em",
            "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.06)" },
          }}
        >
          Cancel
        </Button>

        <Button
          disabled={!mounted || !EATMask}
          onClick={async () => {
            if (!EATMask) { showAlert("Mask not selected", "warning"); return; }
            setLoading(true);
            await boundMask();
            setLoading(false);
            closeDialog();
          }}
          loading={loading}
          variant="contained"
          sx={{
            px: 3.5,
            py: 1,
            fontWeight: 700,
            fontSize: "0.85rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #38bdf8 0%, #34d399 100%)",
            color: "#0a1018",
            boxShadow: "0 4px 20px rgba(56,189,248,0.35)",
            transition: "all 0.2s ease",
            "&:hover": {
              background: "linear-gradient(135deg, #7dd3fc 0%, #6ee7b7 100%)",
              boxShadow: "0 6px 28px rgba(56,189,248,0.5)",
            },
            "&:disabled": {
              background: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.25)",
              boxShadow: "none",
            },
          }}
        >
          Apply Bound
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EATBoundModal;