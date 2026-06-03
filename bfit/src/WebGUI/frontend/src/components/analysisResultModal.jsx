import React, { useState, useRef, useEffect, useCallback } from "react";
import { NVImage } from "@niivue/niivue";
import {
  Dialog, AppBar, Toolbar, IconButton, Button, Box, Drawer,
  Typography, Paper, Slide, Stack, Divider, Collapse, Chip, Badge,
} from "@mui/material";
import NiivueCanvasGrid from "./niivue/niivueCanvasGrid";
import NiivueToolbar from "./niivue/niivueToolbar";
import { styled } from "@mui/material/styles";
import { ChevronLeft, ChevronRight, DeleteOutline, Download } from "@mui/icons-material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CommentIcon from "@mui/icons-material/Comment";
import { theme } from "../App";
import analysisService from "../services/analysis";
import reportService from "../services/reports";
import useCPRStore from "../hooks/cprStore";
import useNiivueStore from "../hooks/niivueStore";
import { useShallow } from "zustand/shallow";
import AnalysisResultTable from "./analysisResultTable";
import SegmentationMaskSelector from "./segmentationMaskSelector";

// ── All label/color/variant logic comes from ONE place ────────────────────────
import {
  getVariantKey,
  getLabelMap,
  getLabelColorByIndex,
  getDisplayName,
} from "../utils/maskVariantUtils";

import { AnalysisResultTypes, Queue } from "../constants";

import AnalysisResultToolGrid from "./analysisResultToolGrid";
import CommentModal from "./commentModal";
import SummaryModal from "./summaryModal";
import NiivueCPROverlay from "./niivue/niivueCPROverlay";
import PerSliceTable from "./perSliceTable";
import useLabelMaskManager from "./labelMaskManager";
import {
  getScreenshotDownloadFilename,
  getScreenshotSliceText,
} from "../utils/screenshotGalleryUtils";
import {
  buildOverallVolumeRows,
  formatPercent,
  formatVolume,
} from "../utils/bodyAnalysisReportUtils";
import { useAlert } from "../hooks/alert";

const drawerWidth = 310;
const collapsedDrawerWidth = 45;

const DrawerHeader = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  padding: theme.spacing(0, 1),
  ...theme.mixins.toolbar,
  justifyContent: "flex-end",
}));

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="right" ref={ref} {...props} />;
});

// ── CrosshairLabelChip ────────────────────────────────────────────────────────
// Receives activeMaskType so it can resolve colors + names via maskVariantUtils

function CrosshairLabelChip({ label, crosshairScreen, activeMaskType }) {
  if (!label || !crosshairScreen) return null;
  const color = getLabelColorByIndex(label.index, activeMaskType);
  const safeColor = color === "transparent" ? "#60a5fa" : color;

  return (
    <Box
      sx={{
        position: "fixed",
        left: crosshairScreen.x,
        top: crosshairScreen.y,
        transform: "translate(calc(-100% - 8px), calc(-100% - 8px))",
        zIndex: 9999,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: "7px",
        px: "10px",
        py: "6px",
        bgcolor: "rgba(45, 52, 64, 0.6)",
        borderRadius: "10px",
        boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <Box sx={{ width: 10, height: 10, borderRadius: "60%", bgcolor: safeColor, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#fff", lineHeight: 1, whiteSpace: "nowrap", letterSpacing: "0.01em" }}>
        {getDisplayName(label.name, activeMaskType)}
      </Typography>
    </Box>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AnalysisPatientInfo({ patientName, patientID, seriesId }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ textAlign: "left" }}>
        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.2, textWrap: "nowrap" }}>
          {`${patientName} | ${patientID}`}
        </Typography>
        <Typography title={seriesId} variant="caption"
          sx={{ opacity: 0.8, lineHeight: 1.2, textWrap: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {seriesId}
        </Typography>
      </Box>
    </Stack>
  );
}

function NiivueContainer({
  leftDrawerCollapsed, rightDrawerCollapsed, handleGetVolume,
  hoveredLabel, showHoverLabel, crosshairScreen, onLocationChange, activeMaskType,
  reportMode = false,
}) {
  const [nvImage, setNvImage] = useState(null);
  const containerRef = useRef(null);

  const { cprNVImage, reset } = useCPRStore(
    useShallow((state) => ({ cprNVImage: state.cprNVImage, reset: state.reset }))
  );

  useEffect(() => {
    async function getNVImage() {
      const response = await handleGetVolume();
      if (response.artifacts && response.artifacts.length > 0) {
        const nv = await NVImage.loadFromUrl({ url: response.artifacts[0].artifact_url });
        setNvImage(nv);
      } else {
        throw new Error("Volume not found");
      }
    }
    getNVImage();
  }, []);

  useEffect(() => { return () => { reset(); }; }, []);

  return (
    <Box
      ref={containerRef}
      sx={{
        display: "flex",
        height: "100%",
        minHeight: 0,
        width: "auto",
        minWidth: 0,
        transition: "margin 0.3s ease",
        marginLeft: reportMode ? 0 : leftDrawerCollapsed ? `${collapsedDrawerWidth}px` : `${drawerWidth}px`,
        marginRight: reportMode ? 0 : rightDrawerCollapsed ? `${collapsedDrawerWidth}px` : `${drawerWidth}px`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <NiivueCanvasGrid
        nvImage={nvImage}
        containerRef={containerRef}
        onLocationChange={onLocationChange}
        reportMode={reportMode}
      />

      {showHoverLabel && (
        <CrosshairLabelChip
          label={hoveredLabel}
          crosshairScreen={crosshairScreen}
          activeMaskType={activeMaskType}
        />
      )}

      {cprNVImage && (
        <Paper role="dialog" aria-modal="false" variant="outlined"
          sx={{
            position: "absolute", top: 0, right: 0,
            height: "50%", width: "50%",
            backgroundColor: "transparent", boxShadow: "none",
            zIndex: 10, p: 0, margin: "auto", display: "flex", flexDirection: "column",
          }}
        >
          <NiivueCPROverlay nvImage={cprNVImage} />
        </Paper>
      )}
    </Box>
  );
}

function SectionHeader({ title, showActive = false }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", px: 1, py: 0 }}>
      <Typography variant="h6" sx={{ p: 1 }}>{title}</Typography>
      {showActive && (
        <Chip label="Active" size="small" sx={{
          ml: "auto", mr: 1, height: 18, fontSize: "0.6rem", fontWeight: 700,
          letterSpacing: "0.06em", bgcolor: "rgba(56,189,248,0.12)", color: "#38bdf8",
          border: "1px solid rgba(56,189,248,0.3)", boxShadow: "0 0 8px rgba(56,189,248,0.2)",
          "& .MuiChip-label": { px: 0.75 },
        }} />
      )}
    </Box>
  );
}

function ScreenshotGallery() {
  const { screenshotGallery, removeScreenshotFromGallery } = useNiivueStore(
    useShallow((state) => ({
      screenshotGallery: state.screenshotGallery,
      removeScreenshotFromGallery: state.removeScreenshotFromGallery,
    }))
  );

  const handleDownload = (screenshot) => {
    const link = document.createElement("a");
    link.href = screenshot.dataUrl;
    link.download = getScreenshotDownloadFilename(screenshot);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box sx={{ px: 1, pb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", px: 1, py: 0.75 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>Gallery</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
          {screenshotGallery.length} image{screenshotGallery.length === 1 ? "" : "s"}
        </Typography>
      </Box>

      {screenshotGallery.length === 0 ? (
        <Box
          sx={{
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 1,
            px: 1.5,
            py: 2,
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          <Typography variant="body2">No screenshots yet</Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {screenshotGallery.map((screenshot) => (
            <Box
              key={screenshot.id}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                overflow: "hidden",
                bgcolor: "background.paper",
              }}
            >
              <Box
                component="img"
                src={screenshot.dataUrl}
                alt={screenshot.viewLabel || "Screenshot"}
                sx={{
                  display: "block",
                  width: "100%",
                  aspectRatio: "16 / 9",
                  objectFit: "contain",
                  bgcolor: "black",
                }}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1, py: 0.75 }}>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {screenshot.viewLabel || "Viewport"}
                  </Typography>
                  {getScreenshotSliceText(screenshot) && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {getScreenshotSliceText(screenshot)}
                    </Typography>
                  )}
                </Box>
                <IconButton size="small" onClick={() => handleDownload(screenshot)} sx={{ borderRadius: 1 }}>
                  <Download fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => removeScreenshotFromGallery(screenshot.id)} sx={{ borderRadius: 1 }}>
                  <DeleteOutline fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}

function LeftDrawerForSegmentation({
  leftDrawerCollapsed, handleLeftDrawerToggle,
  analysisResult, maskOpacity, setMaskOpacity, nvInstancesRef, onHideLabels,
  showHoverLabel, onToggleHoverLabel,
}) {
  const { segmentationTypeLoaded } = useNiivueStore(
    useShallow((state) => ({ segmentationTypeLoaded: state.segmentationTypeLoaded }))
  );
  const hasMaskActive = !!segmentationTypeLoaded;

  return (
    <Drawer
      sx={{
        flexShrink: 0,
        "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box", display: "flex", flexDirection: "column", height: "100vh" },
        overflow: "hidden",
      }}
      PaperProps={{
        style: {
          transition: theme.transitions.create(["margin", "width"], {
            easing: theme.transitions.easing.easeOut,
            duration: theme.transitions.duration.enteringScreen,
          }),
          width: leftDrawerCollapsed ? collapsedDrawerWidth : drawerWidth,
          height: "100%", overflow: "auto",
        },
      }}
      variant="persistent" anchor="left" open={true}
    >
      <DrawerHeader />
      {leftDrawerCollapsed ? (
        <IconButton onClick={handleLeftDrawerToggle} sx={{ borderRadius: 1.5 }}><ChevronRight /></IconButton>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", flexDirection: "row-reverse" }}>
          <IconButton onClick={handleLeftDrawerToggle} sx={{ borderRadius: 1.5, marginLeft: "auto" }}><ChevronLeft /></IconButton>
          <Typography variant="body2" color="textSecondary" sx={{ marginLeft: "auto" }} fontWeight={500}>
            Segmentations
          </Typography>
        </Box>
      )}
      <Divider />
      <Collapse in={!leftDrawerCollapsed} timeout="auto" sx={{ overflowX: "hidden" }}>
        <SectionHeader title="3D Masks" showActive={hasMaskActive} />
        <SegmentationMaskSelector
          analysisResult={analysisResult}
          maskOpacity={maskOpacity}
          setMaskOpacity={setMaskOpacity}
          nvInstancesRef={nvInstancesRef}
          onHideLabels={onHideLabels}
        />
        <Divider sx={{ mt: 1 }} />
        <SectionHeader title="Tools" />
        <AnalysisResultToolGrid
          analysisResult={analysisResult}
          showHoverLabel={showHoverLabel}
          onToggleHoverLabel={onToggleHoverLabel}
        />
        <Divider sx={{ mt: 1 }} />
        <SectionHeader title="Results" />
        <AnalysisResultTable analysisResult={analysisResult} />
        <Divider sx={{ mt: 1 }} />
        <ScreenshotGallery />
      </Collapse>
    </Drawer>
  );
}

function RightDrawerForCenterline({
  rightDrawerCollapsed, handleRightDrawerToggle,
  analysisResult, analysisId, perSliceData, selectedVariant, activeMaskType,
}) {
  const [centerlineImages, setCenterlineImages] = useState([]);

  const handleGetCenterlineImages = async () => {
    const artifacts = [];
    const anatomy = analysisResult?.analysis.anatomy;
    if (anatomy === "abdomen") {
      artifacts.push(
        AnalysisResultTypes.ABD_DSAT_VOLUME_PLOT,
        AnalysisResultTypes.ABD_SSAT_VOLUME_PLOT,
        AnalysisResultTypes.ABD_VAT_VOLUME_PLOT
      );
    } else if (anatomy === "thigh") {
      artifacts.push(
        AnalysisResultTypes.THIGH_IMAT_VOLUME_PLOT,
        AnalysisResultTypes.THIGH_MUSCLES_VOLUME_PLOT,
        AnalysisResultTypes.THIGH_SSAT_VOLUME_PLOT
      );
    }
    try {
      return await analysisService.getDetail(analysisId, ["artifacts"], { artifacts });
    } catch (error) {
      console.error(`Failed to retrieve centerlines ${JSON.stringify(error.response?.data)}`);
    }
  };

  useEffect(() => {
    async function getPlots() {
      const response = await handleGetCenterlineImages();
      setCenterlineImages(response.artifacts);
    }
    getPlots();
  }, [analysisResult, analysisId]);

  return (
    <Drawer
      sx={{
        flexShrink: 0,
        "& .MuiDrawer-paper": { width: drawerWidth, boxSizing: "border-box", display: "flex", flexDirection: "column", height: "100vh" },
      }}
      PaperProps={{
        style: {
          transition: theme.transitions.create(["margin", "width"], { easing: theme.transitions.easing.easeOut }),
          width: rightDrawerCollapsed ? collapsedDrawerWidth : drawerWidth,
          height: "100%", overflow: "auto",
        },
      }}
      variant="persistent" anchor="right" open={true}
    >
      <DrawerHeader />
      {rightDrawerCollapsed ? (
        <IconButton onClick={handleRightDrawerToggle} sx={{ borderRadius: 1.5 }}><ChevronLeft /></IconButton>
      ) : (
        <Box display="flex">
          <IconButton onClick={handleRightDrawerToggle} sx={{ borderRadius: 1.5, justifyContent: "flex-start" }}><ChevronRight /></IconButton>
          <Typography variant="body2" color="textSecondary" margin="auto" fontWeight={500}>Analysis</Typography>
        </Box>
      )}
      <Divider />
      <Collapse in={!rightDrawerCollapsed} timeout="auto">
        <SectionHeader title="Per Slice Analysis" />
        <Box sx={{ px: 1 }}>
          <PerSliceTable
            analysisResult={analysisResult}
            selectedVariant={selectedVariant}
            perSliceData={perSliceData}
            activeMaskType={activeMaskType}
          />
        </Box>
      </Collapse>
    </Drawer>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AnalysisResultModal({
  open,
  onClose,
  analysisId,
  autoGenerateReport = false,
  onAutoGenerateReportComplete,
}) {
  const [leftDrawerCollapsed, setLeftDrawerCollapsed] = useState(false);
  const [rightDrawerCollapsed, setRightDrawerCollapsed] = useState(true);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [perSliceData, setPerSliceData] = useState({});
  const [selectedVariant, setSelectedVariant] = useState("48class");
  const [isOpenComment, setIsOpenComment] = useState(false);
  const [isOpenSummary, setIsOpenSummary] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [draftComment, setDraftComment] = useState("");
  const [commentCount, setCommentCount] = useState(0);
  const cachedSummaryState = useState("");
  const showAlert = useAlert();

  const [activeLabelMasks, setActiveLabelMasks] = useState({});
  const [hoveredLabel, setHoveredLabel] = useState(null);
  const [crosshairScreen, setCrosshairScreen] = useState(null);
  const [showHoverLabel, setShowHoverLabel] = useState(true);
  const activeDrawingRef = useRef(null);

  const activePerLabelKey = Object.keys(activeLabelMasks)[0] || null;

  const {
    nvInstances, selectedCanvasId, activeMaskType,
    setSegmentationTypeLoaded, setActiveMaskType,
  } = useNiivueStore(
    useShallow((state) => ({
      nvInstances: state.nvInstances,
      selectedCanvasId: state.selectedCanvasId,
      activeMaskType: state.activeMaskType,
      setSegmentationTypeLoaded: state.setSegmentationTypeLoaded,
      setActiveMaskType: state.setActiveMaskType,
    }))
  );
  const autoReportStartedRef = useRef(false);

  useEffect(() => {
    const key = getVariantKey(activeMaskType) ?? getVariantKey(analysisResult?.analysis?.anatomy);
    if (key) setSelectedVariant(key);
  }, [analysisResult, activeMaskType]);

  const nvInstancesRef = useRef(nvInstances);
  useEffect(() => { nvInstancesRef.current = nvInstances; }, [nvInstances]);

  const [maskOpacity, setMaskOpacity] = useState(0.2);
  const { loadMask, removeMask, updateOpacity } = useLabelMaskManager(nvInstancesRef, maskOpacity);

  useEffect(() => {
    Object.values(nvInstances || {}).forEach((nv) => {
      if (!nv) return;
      try {
        nv.setDrawOpacity?.(maskOpacity);
        (nv.volumes || []).forEach((vol, idx) => { if (idx === 0) return; vol.opacity = maskOpacity; });
        nv.updateGLVolume?.();
      } catch (error) {
        console.warn("Mask opacity update skipped:", error);
      }
    });
  }, [maskOpacity]);

  const { segmentationTypeLoaded } = useNiivueStore(
    useShallow((state) => ({ segmentationTypeLoaded: state.segmentationTypeLoaded }))
  );

  useEffect(() => {
    if (!segmentationTypeLoaded || !analysisResult) return;
    const seg = analysisResult.segmentations?.find((s) => s.mask_type === segmentationTypeLoaded);
    if (seg?.segmentation_mask_url) {
      activeDrawingRef.current = { url: seg.segmentation_mask_url, maskType: seg.mask_type };
    }
  }, [segmentationTypeLoaded, analysisResult]);

  const handleHideAll = useCallback(() => {
    const instances = nvInstancesRef.current;
    if (instances) {
      Object.values(instances).forEach((nv) => {
        if (!nv) return;
        nv.setDrawOpacity?.(0);
        nv.updateGLVolume?.();
        nv.drawScene?.();
      });
    }
    setActiveLabelMasks({});
  }, [nvInstancesRef]);

  // ── Refs for hover handler ────────────────────────────────────────────────
  const mousePosRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMouseMove = (e) => { mousePosRef.current = { x: e.clientX, y: e.clientY }; };
    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, []);

  const activeLabelMasksRef = useRef(activeLabelMasks);
  useEffect(() => { activeLabelMasksRef.current = activeLabelMasks; }, [activeLabelMasks]);

  const activePerLabelKeyRef = useRef(activePerLabelKey);
  useEffect(() => { activePerLabelKeyRef.current = activePerLabelKey; }, [activePerLabelKey]);

  // Store activeMaskType in a ref so the memoised handleLocationChange can read it
  const activeMaskTypeRef = useRef(activeMaskType);
  useEffect(() => { activeMaskTypeRef.current = activeMaskType; }, [activeMaskType]);

  // ── Hover / crosshair ─────────────────────────────────────────────────────
  const handleLocationChange = useCallback((e) => {
    const vox = e?.vox;
    if (!vox || vox[0] < 0) { setHoveredLabel(null); setCrosshairScreen(null); return; }

    setCrosshairScreen({ x: mousePosRef.current.x, y: mousePosRef.current.y });

    const nv = Object.values(nvInstancesRef.current || {}).find(
      (n) => n && Array.isArray(n.volumes) && n.volumes.length > 0
    );
    if (!nv) { setHoveredLabel(null); return; }

    try {
      const dims = nv.volumes[0]?.dims;
      if (!dims) { setHoveredLabel(null); return; }

      const nx = dims[1], ny = dims[2], nz = dims[3];
      const i = Math.round(vox[0]), j = Math.round(vox[1]), k = Math.round(vox[2]);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) { setHoveredLabel(null); return; }

      const idx = i + j * nx + k * nx * ny;

      // ── getLabelMap handles ALL variant types automatically ──────────────
      const labelSource = getLabelMap(activeMaskTypeRef.current);

      let labelIndex = 0, labelName = null;

      const drawingValue = Number(nv.drawBitmap?.[idx] || 0);
      if (drawingValue > 0) { labelIndex = drawingValue; labelName = labelSource[drawingValue]; }

      if (!labelName && Array.isArray(nv.volumes)) {
        for (let vi = 1; vi < nv.volumes.length; vi++) {
          const volume = nv.volumes[vi];
          const imageData = volume?.img || volume?.image || volume?.hdr?.img;
          if (!imageData) continue;
          const volumeValue = Number(imageData[idx] || 0);
          if (volumeValue > 0) {
            labelIndex = volumeValue;
            labelName = labelSource[volumeValue];
            if (labelName) break;
          }
        }
      }

      // Fall back to active per-label key
      if (!labelName && activePerLabelKeyRef.current) {
        const parts = activePerLabelKeyRef.current.split("__");
        const activeLabelName = parts.length > 1 ? parts.slice(1).join("__") : null;
        if (activeLabelName) {
          labelName = activeLabelName;
          const matchingEntry = Object.entries(labelSource).find(
            ([, name]) => String(name).toLowerCase() === String(activeLabelName).toLowerCase()
          );
          labelIndex = matchingEntry ? Number(matchingEntry[0]) : 1;
        }
      }

      if (labelName && String(labelName).toLowerCase() !== "background") {
        setHoveredLabel({ index: labelIndex || 1, name: labelName });
      } else {
        setHoveredLabel(null);
      }
    } catch (err) {
      console.warn("Hover label lookup failed:", err);
      setHoveredLabel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Label mask toggle / full mask ─────────────────────────────────────────
  const handleToggleLabelMask = useCallback(
    async (variant, label, visible) => {
      const maskKey = `${variant}__${label}`;
      if (visible) {
        await loadMask(variant, label, undefined);
        setActiveLabelMasks((prev) => ({ ...prev, [maskKey]: true }));
      } else {
        removeMask(variant, label);
        setActiveLabelMasks((prev) => { const next = { ...prev }; delete next[maskKey]; return next; });
      }
    },
    [loadMask, removeMask]
  );

  const handleShowFullMask = useCallback(
    async (variant) => {
      removeMask(null, null);
      setActiveLabelMasks({});
      const drawing = activeDrawingRef.current;
      if (!drawing?.url) return;
      try {
        const res = await fetch(drawing.url + "?t=" + Date.now());
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const uint8 = new Uint8Array(await res.arrayBuffer());
        Object.values(nvInstances || {}).forEach((nv) => {
          if (!nv || !Array.isArray(nv.volumes) || nv.volumes.length === 0) return;
          try { nv.loadDrawing(uint8); nv.setDrawOpacity?.(maskOpacity); nv.updateGLVolume?.(); nv.drawScene?.(); }
          catch (e) { console.warn("loadDrawing skipped:", e?.message); }
        });
        setSegmentationTypeLoaded(drawing.maskType);
      } catch (err) {
        console.error("handleShowFullMask: failed to reload drawing", err);
      }
    },
    [removeMask, nvInstances, maskOpacity, setSegmentationTypeLoaded]
  );

  const handleLeftDrawerToggle = () => setLeftDrawerCollapsed((v) => !v);
  const handleRightDrawerToggle = () => setRightDrawerCollapsed((v) => !v);

  const handleGetVolume = useCallback(async () => {
    try {
      return await analysisService.getDetail(analysisId, ["artifacts"], { artifacts: AnalysisResultTypes.ORIGINAL_MR });
    } catch (error) {
      console.error(`Failed to retrieve volume ${JSON.stringify(error.response?.data)}`);
    }
  }, [analysisId]);

  const waitForViewerRender = () =>
    new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

  const reportViews = [
    { index: 0, label: "Axial" },
    { index: 2, label: "Sagittal" },
    { index: 1, label: "Coronal" },
  ];
  const reportViewIndexes = reportViews.map(({ index }) => index);
  const reportCaptureCrosshair = [0.7, 0.5, 0.5];

  const getReportViewInstances = () =>
    reportViews.map((view) => ({
      ...view,
      nv: nvInstancesRef.current?.[view.index],
    }));

  const canLoadReportDrawing = (nv) => {
    const baseVolume = nv?.volumes?.[0];
    return Boolean(
      nv &&
      typeof nv.loadDrawing === "function" &&
      baseVolume?.dims &&
      baseVolume?.dimsRAS
    );
  };

  const getReportCanvas = (nv) => {
    try {
      return nv?.gl?.canvas || null;
    } catch (error) {
      console.warn("Report viewer WebGL canvas is unavailable:", error);
      return null;
    }
  };

  const safeReportRedraw = (nv, label = "report view") => {
    try {
      nv?.resizeListener?.();
      nv?.updateGLVolume?.();
      nv?.drawScene?.();
      return true;
    } catch (error) {
      console.warn(`${label} redraw skipped:`, error);
      return false;
    }
  };

  const safeCloseReportDrawing = (nv, label = "report view") => {
    try {
      nv?.closeDrawing?.();
    } catch (error) {
      console.warn(`${label} drawing close skipped:`, error);
    }
  };

  const getReportCaptureDelta = (nv) => {
    const dims = nv?.volumes?.[0]?.dimsRAS;
    const crosshair = nv?.scene?.crosshairPos;
    if (!dims || !crosshair) return null;

    const [, nx, ny, nz] = dims;
    const current = [
      Math.ceil(crosshair[0] * nx),
      Math.ceil(crosshair[1] * ny),
      Math.ceil(crosshair[2] * nz),
    ];
    const target = [
      Math.floor(nx * reportCaptureCrosshair[0]),
      Math.floor(ny * reportCaptureCrosshair[1]),
      Math.floor(nz * reportCaptureCrosshair[2]),
    ];

    return target.map((value, index) => value - current[index]);
  };

  const captureReportViewPositions = () =>
    getReportViewInstances().map(({ index, nv }) => ({
      index,
      crosshairPos: nv?.scene?.crosshairPos ? [...nv.scene.crosshairPos] : null,
    }));

  const restoreReportViewPositions = async (positions) => {
    for (const { index, crosshairPos } of positions || []) {
      if (!crosshairPos) continue;
      const nv = nvInstancesRef.current?.[index];
      const dims = nv?.volumes?.[0]?.dimsRAS;
      if (!nv?.moveCrosshairInVox || !dims || !nv?.scene?.crosshairPos) continue;

      const [, nx, ny, nz] = dims;
      const current = nv.scene.crosshairPos;
      const delta = [
        Math.round(crosshairPos[0] * nx) - Math.round(current[0] * nx),
        Math.round(crosshairPos[1] * ny) - Math.round(current[1] * ny),
        Math.round(crosshairPos[2] * nz) - Math.round(current[2] * nz),
      ];

      try {
        if (delta.some((value) => value !== 0)) {
          nv.moveCrosshairInVox(...delta);
        }
        safeReportRedraw(nv, "Restored report view");
      } catch (error) {
        console.warn("Report view position restore skipped:", error);
      }
    }
    await waitForViewerRender();
  };

  const positionReportViewsForCapture = async () => {
    for (const { nv } of getReportViewInstances()) {
      const delta = getReportCaptureDelta(nv);
      if (!delta || !nv?.moveCrosshairInVox) continue;
      try {
        if (delta.some((value) => value !== 0)) {
          nv.moveCrosshairInVox(...delta);
        }
        safeReportRedraw(nv, "Report capture view");
      } catch (error) {
        console.warn("Report capture positioning skipped:", error);
      }
    }
    await waitForViewerRender();
  };

  const isReportViewReady = (viewIndex) => {
    const nv = nvInstancesRef.current?.[viewIndex];
    const canvas = getReportCanvas(nv);
    const baseVolume = nv?.volumes?.[0];

    return Boolean(
      nv &&
      canvas &&
      canvas.width > 0 &&
      canvas.height > 0 &&
      typeof nv.loadDrawing === "function" &&
      typeof nv.moveCrosshairInVox === "function" &&
      baseVolume?.dims &&
      baseVolume?.dimsRAS
    );
  };

  const waitForReportViewsReady = async (timeoutMs = 30000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      getReportViewInstances().forEach(({ label, nv }) => {
        safeReportRedraw(nv, label);
      });

      if (reportViewIndexes.every(isReportViewReady)) {
        await waitForViewerRender();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const missingViews = reportViews
      .filter((view) => !isReportViewReady(view.index))
      .map(({ label, index }) => {
        const nv = nvInstancesRef.current?.[index];
        const canvas = getReportCanvas(nv);
        const baseVolume = nv?.volumes?.[0];
        return `${label} canvas=${Boolean(canvas)} size=${canvas?.width || 0}x${canvas?.height || 0} dims=${Boolean(baseVolume?.dims)} dimsRAS=${Boolean(baseVolume?.dimsRAS)}`;
      })
      .join("; ");

    throw new Error(`viewer images are still loading${missingViews ? `: ${missingViews}` : ""}`);
  };

  const setReportMaskVisibility = async (opacity) => {
    getReportViewInstances().forEach(({ nv }) => {
      if (!nv) return;
      try {
        nv.setDrawOpacity?.(opacity);
        (nv.volumes || []).forEach((vol, idx) => {
          if (idx === 0) return;
          vol.opacity = opacity;
        });
        safeReportRedraw(nv, "Report mask visibility");
      } catch (error) {
        console.warn("Report mask visibility skipped:", error);
      }
    });
    await waitForViewerRender();
  };

  const captureReportViews = async () => {
    await waitForReportViewsReady();

    const captures = [];
    for (const view of reportViews) {
      const nv = nvInstancesRef.current?.[view.index];
      const canvas = getReportCanvas(nv);
      if (!nv || !canvas) throw new Error(`${view.label} viewer is not ready`);

      safeReportRedraw(nv, view.label);
      await waitForViewerRender();
      captures.push({ label: view.label, dataUrl: canvas.toDataURL("image/png") });
    }
    return captures;
  };

  const loadReportSegmentation = async (segmentation) => {
    if (!segmentation?.segmentation_mask_url) {
      throw new Error(`Missing mask URL for ${segmentation?.mask_type || "mask"}`);
    }

    const drawing = await NVImage.loadFromUrl({
      url: `${segmentation.segmentation_mask_url}?t=${Date.now()}`,
    });

    await waitForReportViewsReady();

    let loadedCount = 0;
    for (const { label, nv } of getReportViewInstances()) {
      if (!canLoadReportDrawing(nv)) {
        console.warn(`${label} report view is not ready for drawing`);
        continue;
      }

      try {
        safeCloseReportDrawing(nv, label);
        nv.loadDrawing(drawing);
        nv.setDrawOpacity?.(maskOpacity);
        safeReportRedraw(nv, `${label} report drawing`);
        loadedCount += 1;
      } catch (error) {
        console.warn(`Skipping ${label} report drawing load:`, error);
      }
    }

    if (loadedCount === 0) {
      throw new Error("mask overlay views are not ready");
    }

    await waitForViewerRender();
  };

  const restoreActiveReportMask = async () => {
    const drawing = activeDrawingRef.current;
    if (!drawing?.url) {
      getReportViewInstances().forEach(({ nv }) => {
        safeCloseReportDrawing(nv);
      });
      await setReportMaskVisibility(maskOpacity);
      return;
    }

    try {
      const volume = await NVImage.loadFromUrl({ url: `${drawing.url}?t=${Date.now()}` });
      for (const { label, nv } of getReportViewInstances()) {
        if (!canLoadReportDrawing(nv)) continue;
        try {
          safeCloseReportDrawing(nv, label);
          nv.loadDrawing(volume);
          nv.setDrawOpacity?.(maskOpacity);
          safeReportRedraw(nv, `${label} active mask restore`);
        } catch (error) {
          console.warn(`Skipping ${label} active mask restore:`, error);
        }
      }
      setSegmentationTypeLoaded(drawing.maskType);
      setActiveMaskType(drawing.maskType);
      await waitForViewerRender();
    } catch (error) {
      console.warn("Failed to restore active report mask:", error);
    }
  };

  const handleGenerateBodyAnalysisReport = async () => {
    if (!analysisResult) {
      showAlert("Report failed: analysis result is not loaded", "error");
      return;
    }

    const segmentations = analysisResult.segmentations || [];
    if (segmentations.length === 0) {
      showAlert("Report failed: no masks available", "error");
      return;
    }

    let originalReportViewPositions = [];

    try {
      setReportGenerating(true);
      await waitForReportViewsReady();
      await new Promise((resolve) => setTimeout(resolve, 250));
      originalReportViewPositions = captureReportViewPositions();
      await positionReportViewsForCapture();
      const patient = analysisResult.analysis || {};
      const anatomyLabel = patient.anatomy
        ? String(patient.anatomy).replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
        : "-";
      const patientInfo = [
        { label: "Patient Name", value: patient.patient_name },
        { label: "Patient ID", value: patient.patient_id },
        { label: "Study UID", value: patient.study },
        { label: "Series UID", value: patient.series },
        { label: "Analysis ID", value: patient.id || analysisId },
        { label: "Anatomy", value: anatomyLabel },
      ];

      const sections = [];
      for (const segmentation of segmentations) {
        await setReportMaskVisibility(0);
        const inputImages = await captureReportViews();

        await loadReportSegmentation(segmentation);
        const overlayImages = await captureReportViews();

        sections.push({
          maskName: segmentation.mask_type || "Mask",
          inputImages,
          overlayImages,
          volumeRows: buildOverallVolumeRows(analysisResult, segmentation.mask_type).map((row) => ({
            ...row,
            volume: formatVolume(row.volume),
            percent: formatPercent(row.percent),
          })),
        });
      }

      let comments = [];
      try {
        const commentResponse = await analysisService.loadComment(patient.id || analysisId);
        comments = commentResponse?.comments || [];
      } catch (error) {
        console.warn("Report comments could not be loaded:", error);
      }

      await reportService.createBodyAnalysisReport({
        analysis_id: patient.id || analysisId,
        generated_at: new Date().toLocaleString(),
        patient_info: patientInfo,
        patient_id: patient.patient_id,
        patient_name: patient.patient_name,
        study: patient.study,
        series: patient.series ? [patient.series] : [],
        comments,
        sections,
      });
      showAlert("Report saved. Open View all Reports to view it.", "success");
    } catch (error) {
      console.error("REPORT GENERATION ERROR:", error);
      showAlert(`Report failed: ${error.message || "unknown error"}`, "error");
    } finally {
      try {
        await restoreReportViewPositions(originalReportViewPositions);
      } catch (error) {
        console.warn("Report view position cleanup skipped:", error);
      }
      try {
        await restoreActiveReportMask();
      } catch (error) {
        console.warn("Report mask cleanup skipped:", error);
      }
      setReportGenerating(false);
    }
  };

  // ── CSV parsing ───────────────────────────────────────────────────────────
  const parseCSV = (csvString) => {
    if (!csvString) return [];
    const lines = csvString.trim().split("\n");
    const headers = lines[0].split(",");
    return lines.slice(1).map((line) => {
      const values = line.split(",");
      const obj = {};
      headers.forEach((h, i) => { obj[h.trim()] = values[i]; });
      return obj;
    });
  };

  const extractPerSliceFromPredictions = (response) => {
    const prediction = response?.predictions?.[0]?.prediction || {};
    const volumeCSV = prediction?.volume_csv || {};
    const parsed = {};
    Object.keys(volumeCSV).forEach((csvKey) => {
      // getVariantKey handles all variants automatically
      const canonicalKey = getVariantKey(csvKey) ?? csvKey;
      const perSlice = volumeCSV[csvKey]?.per_slice;
      if (Array.isArray(perSlice) && perSlice.length > 0) {
        parsed[canonicalKey] = perSlice;
      } else if (perSlice?.b64_data) {
        parsed[canonicalKey] = parseCSV(atob(perSlice.b64_data));
      }
    });
    return parsed;
  };

  const refreshAnalysisResult = useCallback(async () => {
    const updatedResult = await analysisService.getDetail(analysisId, ["predictions", "segmentations", "artifacts"]);
    setAnalysisResult(updatedResult);
    const parsed = extractPerSliceFromPredictions(updatedResult);
    if (Object.keys(parsed).length > 0) setPerSliceData((prev) => ({ ...prev, ...parsed }));
    return updatedResult;
  }, [analysisId]);

  const saveDrawingCallback = useCallback(
    async (maskType, formData) => {
      try {
        const saveResponse = await analysisService.addSegmentation(analysisId, maskType, formData);
        if (!maskType) { console.error("maskType is undefined!"); return; }

        const variantKey = getVariantKey(maskType);
        if (variantKey) {
          const volumeCSV = saveResponse?.volume_csv || {};
          const matchingKey = Object.keys(volumeCSV).find((k) => {
            const lower = k.toLowerCase();
            if (variantKey === "abd_mr")
              return lower.includes("abd_mr") || lower.includes("abdomen") || lower.includes("abd");
            return lower.includes(variantKey);
          });
          const directPerSlice = matchingKey ? volumeCSV[matchingKey]?.per_slice : null;
          if (Array.isArray(directPerSlice) && directPerSlice.length > 0)
            setPerSliceData((prev) => ({ ...prev, [variantKey]: directPerSlice }));
        }
        try { return await refreshAnalysisResult(); }
        catch (err) { console.warn("Refresh failed but save succeeded", err); return { success: true }; }
      } catch (error) {
        console.error(`Failed to save drawing ${JSON.stringify(error.response?.data)}`);
        throw error;
      }
    },
    [analysisId, refreshAnalysisResult]
  );

  const savePerLabelCallback = useCallback(
    async (variant, labelName, maskType, formData) => {
      try {
        await analysisService.addSegmentation(analysisId, maskType, formData);
        return await refreshAnalysisResult();
      } catch (error) {
        console.error(`Failed to save per-label mask ${JSON.stringify(error.response?.data)}`);
        throw error;
      }
    },
    [analysisId, refreshAnalysisResult]
  );

  useEffect(() => {
    if (!analysisId) return;
    async function getResult() {
      const response = await analysisService.getDetail(analysisId, ["predictions", "segmentations", "artifacts"]);
      setAnalysisResult(response);
      const parsed = extractPerSliceFromPredictions(response);
      if (Object.keys(parsed).length > 0) setPerSliceData(parsed);
    }
    getResult();
  }, [analysisId]);

  useEffect(() => {
    if (
      !autoGenerateReport ||
      autoReportStartedRef.current ||
      !analysisResult?.segmentations?.length
    ) {
      return;
    }

    autoReportStartedRef.current = true;
    setTimeout(() => {
      handleGenerateBodyAnalysisReport().finally(() => {
        onAutoGenerateReportComplete?.();
      });
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerateReport, analysisResult, nvInstances]);

  useEffect(() => {
    if (!open) { removeMask(null, null); setActiveLabelMasks({}); }
  }, [open]);

  useEffect(() => {
    if (!open || !analysisId || autoGenerateReport) return;
    analysisService.loadComment(analysisId)
      .then((data) => {
        setCommentCount(data.comment_count ?? data.comments?.length ?? 0);
      })
      .catch(() => {
        setCommentCount(0);
      });
  }, [open, analysisId, autoGenerateReport]);

  const handleCommentChange = useCallback((comments) => {
    setCommentCount(Array.isArray(comments) ? comments.length : 0);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {isOpenComment && (
        <CommentModal
          closeDialog={() => setIsOpenComment(false)}
          cachedState={[draftComment, setDraftComment]}
          analysisId={analysisId}
          onCommentChange={handleCommentChange}
        />
      )}
      {isOpenSummary && (
        <SummaryModal closeDialog={() => setIsOpenSummary(false)} cachedState={cachedSummaryState} analysisId={analysisId} />
      )}

      {autoGenerateReport ? (
        <Box
          sx={{
            position: "fixed",
            left: "-1600px",
            top: 0,
            width: "1400px",
            height: "360px",
            opacity: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <NiivueContainer
            leftDrawerCollapsed
            rightDrawerCollapsed
            handleGetVolume={handleGetVolume}
            hoveredLabel={hoveredLabel}
            showHoverLabel={false}
            crosshairScreen={crosshairScreen}
            onLocationChange={handleLocationChange}
            activeMaskType={activeMaskType}
            reportMode
          />
        </Box>
      ) : (
      <Dialog
        fullScreen
        open={open}
        onClose={onClose}
        TransitionComponent={Transition}
        hideBackdrop={autoGenerateReport}
        sx={
          autoGenerateReport
            ? {
                "& .MuiDialog-container": {
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                },
                "& .MuiDialog-paper": {
                  position: "fixed",
                  top: 0,
                  left: "-1600px",
                  width: "1400px",
                  height: "960px",
                  maxWidth: "none",
                  maxHeight: "none",
                  m: 0,
                  opacity: 0,
                  pointerEvents: "none",
                },
              }
            : undefined
        }
      >
        <AppBar sx={{ position: "fixed", zIndex: (theme) => theme.zIndex.drawer + 1 }} color="inherit" enableColorOnDark>
          <Toolbar>
            <IconButton edge="start" color="white" onClick={onClose} aria-label="close"><ArrowBackIcon /></IconButton>
            <Box sx={{ ml: 2, flex: 0 }}>
              <AnalysisPatientInfo
                patientName={analysisResult?.analysis?.patient_name || ""}
                patientID={analysisResult?.analysis?.patient_id || ""}
                seriesId={analysisResult?.analysis?.series || ""}
              />
            </Box>
            <Box sx={{ flexGrow: 1, display: { xs: "none", md: "flex" }, justifyContent: "center" }}>
              {analysisResult && (
                <NiivueToolbar
                  callbacks={{ saveDrawingCallback, savePerLabelCallback }}
                  queue={analysisResult.analysis.queue}
                  activeLabelMasks={activeLabelMasks}
                  onToggleLabelMask={handleToggleLabelMask}
                  activeMaskType={activeMaskType}
                  activePerLabelKey={activePerLabelKey}
                  onHideAll={handleHideAll}
                  onShowFullMask={handleShowFullMask}
                />
              )}
            </Box>
            <Box sx={{ flexGrow: 0, display: { xs: "none", md: "flex" }, marginLeft: "auto" }}>
              <Badge
                badgeContent={commentCount}
                color="secondary"
                overlap="rectangular"
                sx={{ "& .MuiBadge-badge": { right: 2, top: 5, fontWeight: 700 } }}
              >
                <Button autoFocus startIcon={<CommentIcon />} onClick={() => setIsOpenComment(true)}>
                  Comment
                </Button>
              </Badge>
            </Box>
          </Toolbar>
        </AppBar>

        <LeftDrawerForSegmentation
          leftDrawerCollapsed={leftDrawerCollapsed}
          handleLeftDrawerToggle={handleLeftDrawerToggle}
          analysisResult={analysisResult}
          maskOpacity={maskOpacity}
          setMaskOpacity={setMaskOpacity}
          nvInstancesRef={nvInstancesRef}
          onHideLabels={handleHideAll}
          showHoverLabel={showHoverLabel}
          onToggleHoverLabel={() => setShowHoverLabel((v) => !v)}
        />

        <Toolbar />

        <NiivueContainer
          leftDrawerCollapsed={leftDrawerCollapsed}
          rightDrawerCollapsed={rightDrawerCollapsed}
          handleGetVolume={handleGetVolume}
          hoveredLabel={hoveredLabel}
          showHoverLabel={showHoverLabel}
          crosshairScreen={crosshairScreen}
          onLocationChange={handleLocationChange}
          activeMaskType={activeMaskType}
        />

        <RightDrawerForCenterline
          rightDrawerCollapsed={rightDrawerCollapsed}
          analysisResult={analysisResult}
          analysisId={analysisId}
          handleRightDrawerToggle={handleRightDrawerToggle}
          perSliceData={perSliceData}
          selectedVariant={selectedVariant}
          activeMaskType={activeMaskType}
        />
      </Dialog>
      )}
    </>
  );
}
