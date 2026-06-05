import { useState, useEffect } from "react";
import {
  Box,
  Chip,
  Paper,
  Stack,
  Switch,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from "@mui/material";
import { NVImage } from "@niivue/niivue";
import analysisService from "../services/analysis";
import { AnalysisResultTypes } from "../constants";
import useNiivueStore from "../hooks/niivueStore";
import { useLRUCache } from "../hooks/lrucache";
import { useShallow } from "zustand/shallow";
import { base64ToUInt8Array } from "../utils/base64ArrToNVImage";
import CalciumMultiMaskModal from "./calciumMultiMaskModal";
import { getMaskDisplayName } from "../utils/maskVariantUtils";

const isDeprecated4ClassMask = (seg) =>
  String(seg?.mask_type || "").toUpperCase().includes("4CLASS");

export default function SegmentationMaskSelector({ analysisResult, maskOpacity, setMaskOpacity, onHideLabels }) {
  const [segs, setSegs] = useState([]);
  const [displayedMask, setDisplayedMask] = useState(null);
  const [isOpenMultiMask, setIsOpenMultiMask] = useState(false);
  const [tempOpacity, setTempOpacity] = useState(maskOpacity);

  useEffect(() => {
    setTempOpacity(maskOpacity);
  }, [maskOpacity]);

  const {
    nvInstances,
    isVolumeLoaded,
    addedSegmentation,
    segmentationTypeLoaded,
    setSegmentationTypeLoaded,
    setActiveMaskType,
    resetAddedSegmentation,
  } = useNiivueStore(
    useShallow((state) => ({
      nvInstances: state.nvInstances,
      isVolumeLoaded: state.isVolumeLoaded,
      addedSegmentation: state.addedSegmentation,
      segmentationTypeLoaded: state.segmentationTypeLoaded,
      setSegmentationTypeLoaded: state.setSegmentationTypeLoaded,
      setActiveMaskType: state.setActiveMaskType,
      resetAddedSegmentation: state.resetAddedSegmentation,
    }))
  );

  const { get, set, del } = useLRUCache(8);

  const handleSwitch = async (e, seg) => {
    setDisplayedMask(seg.mask_type);
    if (e.target.checked) {
      if (!seg?.segmentation_mask_url) {
        console.warn("Skipping segmentation with empty URL", seg);
        return;
      }
      onHideLabels?.();
      Object.values(nvInstances || {}).forEach((nv) => nv.closeDrawing());
      const url = seg.segmentation_mask_url + "?t=" + Date.now();
      let volume;
      try {
        volume = await NVImage.loadFromUrl({ url });
        set(seg.mask_type, volume);
      } catch (err) {
        console.error("Error loading mask:", err);
        return;
      }
      Object.values(nvInstances || {}).forEach((nv) => {
        nv.loadDrawing(volume);
        nv.setDrawOpacity(maskOpacity);
      });
      setSegmentationTypeLoaded(seg.mask_type);
      setActiveMaskType(seg.mask_type);
    } else {
      unloadMask();
    }
  };

  useEffect(() => {
    if (analysisResult) {
      const visibleSegmentations = (analysisResult?.segmentations || [])
        .filter((seg) => !isDeprecated4ClassMask(seg))
        .sort((s1, s2) => s1.is_custom - s2.is_custom);
      setSegs(visibleSegmentations);
    }
  }, [analysisResult]);

  useEffect(() => {
    if (segmentationTypeLoaded) setDisplayedMask(segmentationTypeLoaded);
  }, [segs, segmentationTypeLoaded]);

  useEffect(() => {
    async function loadSeg(url) {
      if (!url) return;
      Object.values(nvInstances || {}).forEach((nv) => nv.closeDrawing());
      const freshUrl = url + "?t=" + Date.now();
      const volume = await NVImage.loadFromUrl({ url: freshUrl });
      set(addedSegmentation.mask_type, volume);
      Object.values(nvInstances || {}).forEach((nv) => {
        nv.loadDrawing(volume);
        nv.setDrawOpacity(maskOpacity);
      });
      setSegmentationTypeLoaded(addedSegmentation.mask_type);
      setActiveMaskType(addedSegmentation.mask_type);
      resetAddedSegmentation();
    }
    if (addedSegmentation) {
      setDisplayedMask(addedSegmentation.mask_type);
      loadSeg(addedSegmentation.segmentation_mask_url);
    }
  }, [addedSegmentation]);

  const applyOpacityDirect = (value) => {
    (Array.isArray(nvInstances) ? nvInstances : Object.values(nvInstances || {}))
      .forEach((nv) => {
        if (!nv) return;
        nv.setDrawOpacity?.(value);
        (nv.volumes || []).forEach((vol, idx) => {
          if (idx === 0) return;
          vol.opacity = value;
        });
        nv.updateGLVolume?.();
        nv.drawScene?.();
      });
  };

  const loadMultiMask = async (maskTypes) => {
    if (maskTypes.length === 0) return;
    const analysisId = analysisResult.analysis.id;
    const data = await analysisService.getCombinedMask(analysisId, maskTypes);
    const segUInt8Array = base64ToUInt8Array(data.file_data);
    Object.values(nvInstances || {}).forEach((nv) => nv.closeDrawing());
    Object.values(nvInstances || {}).forEach((nv) => {
      nv.loadDrawingFromUrl(segUInt8Array);
      nv.setDrawOpacity(maskOpacity);
    });
    setSegmentationTypeLoaded(maskTypes);
    setActiveMaskType(maskTypes);
    setDisplayedMask(maskTypes);
  };

  const unloadMask = () => {
    onHideLabels?.();
    Object.values(nvInstances || {}).forEach((nv) => nv.closeDrawing());
    setSegmentationTypeLoaded(null);
    setActiveMaskType(null);
    setDisplayedMask(null);
  };

  const isActive = (seg) => displayedMask === seg.mask_type;

  return (
    <Box
      sx={{
        width: "100%",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "linear-gradient(160deg, #0d1521 0%, #0a1018 60%, #080d14 100%)",
        position: "relative",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
          zIndex: 0,
        },
      }}
    >

      {/* ── Mask rows ── */}
      <Box sx={{ position: "relative", zIndex: 1 }}>
        {segs.map((seg, idx) => {
          const active = isActive(seg);
          return (
            <Box
              key={seg.mask_type}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: 2,
                py: 1.25,
                borderBottom:
                  idx < segs.length - 1
                    ? "1px solid rgba(255,255,255,0.05)"
                    : "none",
                background: active
                  ? "linear-gradient(90deg, rgba(56,189,248,0.07) 0%, transparent 100%)"
                  : "transparent",
                transition: "background 0.2s ease",
                "&:hover": {
                  background: active
                    ? "linear-gradient(90deg, rgba(56,189,248,0.1) 0%, transparent 100%)"
                    : "rgba(255,255,255,0.02)",
                },
              }}
            >
              {/* Left accent bar when active */}
              <Box
                sx={{
                  width: 2,
                  height: 28,
                  borderRadius: "2px",
                  bgcolor: active ? "#38bdf8" : "transparent",
                  boxShadow: active ? "0 0 8px rgba(56,189,248,0.6)" : "none",
                  mr: 1.5,
                  flexShrink: 0,
                  transition: "all 0.2s ease",
                }}
              />

              <Typography
                sx={{
                  flex: 1,
                  color: active ? "#fff" : "rgba(255,255,255,0.6)",
                  fontSize: "0.8rem",
                  fontWeight: active ? 700 : 500,
                  letterSpacing: "0.02em",
                  transition: "all 0.2s ease",
                  textTransform: "uppercase",
                }}
              >
                {getMaskDisplayName(seg.mask_type)}
              </Typography>

              <Switch
                disabled={!isVolumeLoaded}
                checked={active}
                onChange={(e) => handleSwitch(e, seg)}
                size="small"
                sx={{
                  "& .MuiSwitch-switchBase.Mui-checked": {
                    color: "#38bdf8",
                    "& + .MuiSwitch-track": {
                      bgcolor: "rgba(56,189,248,0.35)",
                      opacity: 1,
                    },
                  },
                  "& .MuiSwitch-switchBase": {
                    color: "rgba(255,255,255,0.3)",
                  },
                  "& .MuiSwitch-track": {
                    bgcolor: "rgba(255,255,255,0.1)",
                    opacity: 1,
                  },
                  "& .Mui-disabled": {
                    opacity: 0.3,
                  },
                }}
              />
            </Box>
          );
        })}
      </Box>

      {/* ── Opacity slider ── */}
      <Box
        sx={{
          px: 2,
          py: 1.75,
          borderTop: "1px solid rgba(255, 255, 255, 0.18)",
          position: "relative",
          zIndex: 1,
          background: "rgba(0,0,0,0.15)",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} mb={1}>
          <Typography
            sx={{
              color: "rgb(255, 255, 255)",
              fontSize: "0.8rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Opacity
          </Typography>
          <Typography
            sx={{
              ml: "auto !important",
              color: "#fff",
              fontSize: "0.82rem",
              fontWeight: 800,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Math.round(tempOpacity * 100)}%
          </Typography>
        </Stack>

        <Slider
          value={tempOpacity}
          onChange={(_e, value) => {
            setTempOpacity(value);
            applyOpacityDirect(value);
          }}
          onChangeCommitted={(_e, value) => {
            setMaskOpacity(value);
          }}
          min={0}
          max={1}
          step={0.01}
          sx={{
            py: 0.5,
            "& .MuiSlider-thumb": {
              width: 14,
              height: 14,
              bgcolor: "#fff",
              boxShadow: "0 0 0 3px rgba(56,189,248,0.3)",
              "&:hover": { boxShadow: "0 0 0 6px rgba(56,189,248,0.2)" },
            },
            "& .MuiSlider-track": {
              background: "linear-gradient(90deg, #38bdf8, #34d399)",
              borderColor: "transparent",
              height: 4,
            },
            "& .MuiSlider-rail": {
              bgcolor: "rgba(255,255,255,0.1)",
              height: 4,
            },
          }}
        />
      </Box>
    </Box>
  );
}
