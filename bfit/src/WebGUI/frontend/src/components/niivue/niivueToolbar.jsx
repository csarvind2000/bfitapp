import { useState, useLayoutEffect, useMemo, useEffect, useRef } from "react";
import {
  Stack,
  IconButton,
  Tooltip,
  Button,
  Divider,
  Box,
  Typography,
} from "@mui/material";
import { useDialogs } from "@toolpad/core/useDialogs";

import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import DrawIcon from "@mui/icons-material/Draw";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import SaveIcon from "@mui/icons-material/Save";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import SpaceDashboardIcon from "@mui/icons-material/SpaceDashboard";
import GridViewIcon from "@mui/icons-material/GridView";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

// ── All label/color/variant logic comes from ONE place ────────────────────────
import {
  getVariantKey,
  getLabelColorByIndex,
  getDisplayName,
  getLabelEntries,
  getGroupedLabels,
} from "../../utils/maskVariantUtils";

import useNiivueStore from "../../hooks/niivueStore";
import { useShallow } from "zustand/shallow";
import { useAlert } from "../../hooks/alert";

// ── Styles (unchanged) ────────────────────────────────────────────────────────

const toolbarSx = {
  px: 2,
  py: 1,
  bgcolor: "#2F343C",
  minHeight: 56,
  overflowX: "auto",
  gap: 0.75,
};

const toolGroupSx = {
  display: "flex",
  alignItems: "center",
  bgcolor: "#1e1e1e",
  borderRadius: "8px",
  border: "0.5px solid rgba(255,255,255,0.1)",
  p: "3px",
  gap: "2px",
};

const toggleBtnSx = (active) => ({
  width: 36,
  height: 32,
  borderRadius: "6px",
  border: "none",
  bgcolor: active ? "#3a3a3a" : "transparent",
  boxShadow: active ? "0 0 0 0.5px rgba(96,165,250,0.4)" : "none",
  color: active ? "#60a5fa" : "rgba(255,255,255,0.45)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.12s",
  "& svg": { fontSize: 18 },
  "&:hover": { bgcolor: "rgba(255,255,255,0.08)", color: "#e2e2e2" },
});

const iconBtnSx = {
  width: 36,
  height: 36,
  color: "rgb(255, 255, 255)",
  borderRadius: "8px",
  "& svg": { fontSize: 20 },
  "&:hover": { bgcolor: "rgba(255,255,255,0.08)", color: "#e2e2e2" },
  "&.Mui-disabled": { color: "rgba(255,255,255,0.18)" },
};

const saveBtnSx = {
  textTransform: "none",
  fontWeight: 500,
  fontSize: 14,
  px: 2,
  py: 0.75,
  borderRadius: "8px",
  bgcolor: "#3b82f6",
  "&:hover": { bgcolor: "#2563eb" },
  "&.Mui-disabled": { bgcolor: "rgba(59,130,246,0.3)", color: "rgba(255,255,255,0.4)" },
};

const labelTriggerSx = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  px: 1.5,
  py: 0.75,
  cursor: "pointer",
  minWidth: 180,
  height: 36,
  userSelect: "none",
  bgcolor: "#1e1e1e",
  borderRadius: "8px",
  border: "0.5px solid rgba(255,255,255,0.15)",
  color: "#e2e2e2",
  "&:hover": { borderColor: "rgba(255,255,255,0.3)" },
};

const maskToggleAllBtnSx = {
  textTransform: "none",
  fontSize: 12,
  px: 1.5,
  py: 0.4,
  borderRadius: "6px",
  borderColor: "rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.6)",
  flex: 1,
  "&:hover": { borderColor: "rgba(255,255,255,0.35)", bgcolor: "rgba(255,255,255,0.05)" },
};

const hoveredLabelChipSx = {
  display: "flex",
  alignItems: "center",
  gap: 0.75,
  px: 1.25,
  py: 0.5,
  bgcolor: "rgba(0,0,0,0.55)",
  border: "0.5px solid rgba(255,255,255,0.15)",
  borderRadius: "20px",
  backdropFilter: "blur(6px)",
  pointerEvents: "none",
  transition: "opacity 0.15s",
};

const screenshotMenuSx = {
  position: "fixed",
  zIndex: 99999,
  width: 260,
  bgcolor: "#2F343C",
  borderRadius: "10px",
  border: "0.5px solid rgba(255,255,255,0.1)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  py: 0.5,
};

const screenshotMenuItemSx = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  px: 1.5,
  py: 1,
  minHeight: 38,
  cursor: "pointer",
  color: "#e2e2e2",
  "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function NiivueToolbar({
  callbacks,
  onBack,
  studyLabel,
  studyId,
  onToggleLabelMask,
  activeLabelMasks = {},
  onShowFullMask,
  onHideAll,
  activePerLabelKey,
  hoveredLabel,
  showHoverLabel,
  onToggleHoverLabel,
}) {
  const { selectedCanvasId, nvInstances, setAddedSegmentation, activeMaskType } =
    useNiivueStore(
      useShallow((state) => ({
        selectedCanvasId: state.selectedCanvasId,
        nvInstances: state.nvInstances,
        setAddedSegmentation: state.setAddedSegmentation,
        activeMaskType: state.activeMaskType,
      }))
    );

  const dialogs = useDialogs();
  const showAlert = useAlert();

  const [loading, setLoading] = useState(false);
  const [activeLabel, setActiveLabel] = useState(0);
  const [drawMode, setDrawMode] = useState(null);
  const [redoStack, setRedoStack] = useState([]);
  const [layout, setLayout] = useState("main-left");
  const [labelMenuAnchor, setLabelMenuAnchor] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [screenshotMenuAnchor, setScreenshotMenuAnchor] = useState(null);
  const [screenshotMenuPos, setScreenshotMenuPos] = useState({ top: 0, left: 0 });
  const [manualSelection, setManualSelection] = useState(null);
  const labelMenuOpen = Boolean(labelMenuAnchor);
  const screenshotMenuOpen = Boolean(screenshotMenuAnchor);
  const dropdownRef = useRef(null);
  const screenshotMenuRef = useRef(null);
  const selectionTargetsRef = useRef([]);
  const manualSelectionRef = useRef(null);
  const finishManualSelectionRef = useRef(null);
  const isDraggingSelectionRef = useRef(false);

  const saveDrawingCallback = callbacks?.saveDrawingCallback;
  const nv =
    nvInstances?.[selectedCanvasId] ||
    Object.values(nvInstances || {}).find(Boolean);

  // ── Derived from maskVariantUtils — no local logic ────────────────────────
  const activeVariant = getVariantKey(activeMaskType);
  const filteredLabels = getLabelEntries(activeMaskType);
  const grouped = getGroupedLabels(activeMaskType);

  // Reset active label whenever the mask type changes
  useEffect(() => {
    setActiveLabel(0);
    if (nv && drawMode !== null && drawMode > 0) {
      nv.setPenValue(0, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMaskType]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!labelMenuOpen) return;
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        labelMenuAnchor &&
        !labelMenuAnchor.contains(e.target)
      ) {
        setLabelMenuAnchor(null);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [labelMenuOpen, labelMenuAnchor]);

  useEffect(() => {
    if (!screenshotMenuOpen) return;
    const handleClickOutside = (e) => {
      const clickedMainMenu = screenshotMenuRef.current?.contains(e.target);
      const clickedTrigger = screenshotMenuAnchor?.contains(e.target);

      if (!clickedMainMenu && !clickedTrigger) {
        closeScreenshotMenus();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [screenshotMenuOpen, screenshotMenuAnchor]);

  useEffect(() => {
    manualSelectionRef.current = manualSelection;
  }, [manualSelection]);

  useEffect(() => {
    if (!manualSelection) return;

    const handleMouseMove = (e) => {
      if (!isDraggingSelectionRef.current) return;
      setManualSelection((prev) => {
        if (!prev?.viewerRect) return prev;
        return {
          ...prev,
          current: clampPointToRect(e.clientX, e.clientY, prev.viewerRect),
        };
      });
    };

    const handleMouseUp = (e) => {
      if (!isDraggingSelectionRef.current) return;
      isDraggingSelectionRef.current = false;

      const currentSelection = manualSelectionRef.current;
      if (!currentSelection?.start || !currentSelection.viewerRect) {
        return;
      }

      finishManualSelectionRef.current?.(
        currentSelection.start,
        clampPointToRect(e.clientX, e.clientY, currentSelection.viewerRect),
        currentSelection.viewerRect
      );
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        isDraggingSelectionRef.current = false;
        setManualSelection(null);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [manualSelection]);

  const handleOpenMenu = (e) => {
    if (!activeMaskType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 - 115 });
    setLabelMenuAnchor(e.currentTarget);
  };

  const handleOpenScreenshotMenu = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setLabelMenuAnchor(null);
    setScreenshotMenuPos({
      top: rect.bottom + 4,
      left: Math.max(8, rect.left + rect.width / 2 - 130),
    });
    setScreenshotMenuAnchor(e.currentTarget);
    setViewMenuOpen(false);
  };

  const closeScreenshotMenus = () => {
    setScreenshotMenuAnchor(null);
  };

  useLayoutEffect(() => {
    if (!nv) return;
    nv.updateGLVolume?.();
    nv.drawScene?.();
  }, [nv]);

  useLayoutEffect(() => {
    if (!nv) return;
    nv.updateGLVolume?.();
    nv.drawScene?.();
  }, [nv, activeMaskType]);

  // ── Label mask helpers ────────────────────────────────────────────────────
  const getMaskKey = (labelName) => {
    if (!activeVariant || !labelName) return null;
    return `${activeVariant}__${labelName}`;
  };

  const handleShowAll = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setLabelMenuAnchor(null);
    onShowFullMask?.(activeVariant ?? "4class");
  };

  const handleHideAll = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setLabelMenuAnchor(null);
    onHideAll?.();
  };

  // ── Draw / erase controls ─────────────────────────────────────────────────
  const activateDraw = () => {
    if (!nv) return;
    nv.setCrosshairWidth(0);
    nv.setDrawingEnabled(true);
    nv.setPenValue(activeLabel, true);
    nv.gl?.canvas && (nv.gl.canvas.style.cursor = "crosshair");
    nv.updateGLVolume?.();
    setDrawMode(activeLabel);
    setRedoStack([]);
  };

  const activateErase = () => {
    if (!nv) return;
    nv.setCrosshairWidth(0);
    nv.setDrawingEnabled(true);
    nv.setPenValue(0, true);
    nv.gl?.canvas && (nv.gl.canvas.style.cursor = "crosshair");
    nv.updateGLVolume?.();
    setDrawMode(0);
    setRedoStack([]);
  };

  const deactivateTools = () => {
    if (!nv) return;
    nv.setPenValue(-1);
    nv.setDrawingEnabled(false);
    nv.setCrosshairWidth(1);
    nv.gl?.canvas && (nv.gl.canvas.style.cursor = "default");
    nv.updateGLVolume?.();
    nv.drawScene?.();
    setDrawMode(null);
  };

  const handleDrawClick = () => {
    if (drawMode !== null && drawMode > 0) deactivateTools();
    else activateDraw();
  };

  const handleEraseClick = () => {
    if (drawMode === 0) deactivateTools();
    else activateErase();
  };

  const handleLabelChange = (labelIdx) => {
    setActiveLabel(labelIdx);
    if (drawMode !== null && drawMode > 0 && nv) nv.setPenValue(labelIdx, true);
    setLabelMenuAnchor(null);
  };

  // ── Undo / redo ───────────────────────────────────────────────────────────
  const handleUndo = () => {
    if (!nv) return;
    try {
      const snap = nv.saveImage({ isSaveDrawing: true });
      if (snap) setRedoStack((prev) => [...prev, snap]);
    } catch { }
    nv.drawUndo();
    nv.updateGLVolume?.();
    nv.drawScene?.();
  };

  const handleRedo = () => {
    if (!nv || redoStack.length === 0) return;
    const snapshot = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    try {
      nv.loadDrawing(snapshot);
      nv.updateGLVolume?.();
      nv.drawScene?.();
    } catch { }
  };

  // ── Zoom / view ───────────────────────────────────────────────────────────
  const handleZoomIn = () => {
    const refNv = nvInstances[selectedCanvasId];
    if (!refNv) return;
    const crosshair = refNv.scene?.crosshairPos || [0, 0, 0];
    Object.values(nvInstances).forEach((nv) => {
      if (!nv) return;
      const s = (nv.scene?.pan2Dxyzmm?.[3] || 1) + 0.2;
      nv.setPan2Dxyzmm([crosshair[0], crosshair[1], crosshair[2], s]);
      nv.updateGLVolume?.();
      nv.drawScene?.();
    });
  };

  const handleZoomOut = () => {
    const refNv = nvInstances[selectedCanvasId];
    if (!refNv) return;
    const crosshair = refNv.scene?.crosshairPos || [0, 0, 0];
    Object.values(nvInstances).forEach((nv) => {
      if (!nv) return;
      const s = Math.max(0.2, (nv.scene?.pan2Dxyzmm?.[3] || 1) - 0.2);
      nv.setPan2Dxyzmm([crosshair[0], crosshair[1], crosshair[2], s]);
      nv.updateGLVolume?.();
      nv.drawScene?.();
    });
  };

  const handleResetView = () => {
    Object.values(nvInstances || {}).forEach((nv) => {
      nv?.setPan2Dxyzmm?.([0, 0, 0, 1]);
      nv?.updateGLVolume?.();
      nv?.drawScene?.();
    });
  };

  const getScreenshotBaseName = () =>
    String(studyId || studyLabel || "niivue").replace(/[^\w.-]+/g, "_");

  const downloadCanvas = (canvas, filePart) => {
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${getScreenshotBaseName()}_${filePart}_screenshot.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCanvasFromNv = (targetNv) => {
    if (!targetNv) return null;
    targetNv.updateGLVolume?.();
    targetNv.drawScene?.();
    return targetNv.gl?.canvas || null;
  };

  const getVisibleCaptureTargets = () => {
    return Object.values(nvInstances || {})
      .map((targetNv, index) => {
        const canvas = getCanvasFromNv(targetNv);
        const rect = canvas?.getBoundingClientRect();
        if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) return null;
        return { canvas, rect, index, nv: targetNv };
      })
      .filter(Boolean);
  };

  const getCaptureBounds = (targets) => {
    const left = Math.min(...targets.map(({ rect }) => rect.left));
    const top = Math.min(...targets.map(({ rect }) => rect.top));
    const right = Math.max(...targets.map(({ rect }) => rect.right));
    const bottom = Math.max(...targets.map(({ rect }) => rect.bottom));

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  };

  const clampPointToRect = (clientX, clientY, rect) => ({
    x: Math.min(Math.max(clientX, rect.left), rect.right),
    y: Math.min(Math.max(clientY, rect.top), rect.bottom),
  });

  const getSelectionRect = (start, end) => {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  };

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

  const getSnapshotTargets = async (targets) => {
    return Promise.all(
      targets.map(async ({ canvas, rect, index, nv }) => {
        nv?.updateGLVolume?.();
        nv?.drawScene?.();

        const currentCanvas = nv?.gl?.canvas || canvas;
        const currentRect = currentCanvas.getBoundingClientRect();
        const image = await loadImage(currentCanvas.toDataURL("image/png"));

        return {
          image,
          rect: currentRect.width > 0 && currentRect.height > 0 ? currentRect : rect,
          index,
        };
      })
    );
  };

  const renderTargetsToCanvas = async (targets, sourceRect = null) => {
    const snapshotTargets = await getSnapshotTargets(targets);
    const drawableTargets = snapshotTargets.filter(({ rect }) => rect.width > 0 && rect.height > 0);

    if (drawableTargets.length === 0) {
      throw new Error("No visible canvases to capture");
    }

    const bounds = sourceRect || getCaptureBounds(drawableTargets);
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(bounds.width * scale));
    output.height = Math.max(1, Math.round(bounds.height * scale));

    const ctx = output.getContext("2d");
    ctx.scale(scale, scale);
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    drawableTargets.forEach(({ image, rect }) => {
      const left = Math.max(bounds.left, rect.left);
      const top = Math.max(bounds.top, rect.top);
      const right = Math.min(bounds.right, rect.right);
      const bottom = Math.min(bounds.bottom, rect.bottom);

      if (right <= left || bottom <= top) return;

      const sourceScaleX = image.width / rect.width;
      const sourceScaleY = image.height / rect.height;
      const sourceX = (left - rect.left) * sourceScaleX;
      const sourceY = (top - rect.top) * sourceScaleY;
      const sourceWidth = (right - left) * sourceScaleX;
      const sourceHeight = (bottom - top) * sourceScaleY;

      ctx.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        left - bounds.left,
        top - bounds.top,
        right - left,
        bottom - top
      );
    });

    return output;
  };

  const handleScreenshotViewer = async () => {
    closeScreenshotMenus();
    const targets = getVisibleCaptureTargets();

    if (targets.length === 0) {
      showAlert("Screenshot failed: viewer not ready", "error");
      return;
    }

    try {
      downloadCanvas(await renderTargetsToCanvas(targets), "viewer");
      showAlert("Viewer screenshot saved", "success");
    } catch (err) {
      console.error("SCREENSHOT ERROR:", err);
      showAlert("Screenshot failed", "error");
    }
  };

  const handleStartManualSelection = () => {
    closeScreenshotMenus();
    const targets = getVisibleCaptureTargets();

    if (targets.length === 0) {
      showAlert("Screenshot failed: viewer not ready", "error");
      return;
    }

    selectionTargetsRef.current = targets;
    setManualSelection({
      viewerRect: getCaptureBounds(targets),
      start: null,
      current: null,
    });
  };

  const handleManualSelectionMouseDown = (e) => {
    if (!manualSelection?.viewerRect) return;
    e.preventDefault();
    const point = clampPointToRect(e.clientX, e.clientY, manualSelection.viewerRect);
    isDraggingSelectionRef.current = true;
    setManualSelection((prev) => ({
      ...prev,
      start: point,
      current: point,
    }));
  };

  const finishManualSelection = async (start, end) => {
    const cropRect = getSelectionRect(start, end);

    if (cropRect.width < 6 || cropRect.height < 6) {
      setManualSelection(null);
      showAlert("Screenshot cancelled: selection too small", "warning");
      return;
    }

    try {
      downloadCanvas(await renderTargetsToCanvas(selectionTargetsRef.current, cropRect), "selection");
      showAlert("Selection screenshot saved", "success");
    } catch (err) {
      console.error("SCREENSHOT SELECTION ERROR:", err);
      showAlert("Screenshot failed", "error");
    } finally {
      setManualSelection(null);
    }
  };
  finishManualSelectionRef.current = finishManualSelection;

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!nv || !activeMaskType || !saveDrawingCallback) return;
    const isIsolated = Boolean(activePerLabelKey);
    const maskFilename = `${activeMaskType.replace(/[^\w.-]+/g, "_")}.nii`;

    const confirmed = await dialogs.confirm(
      isIsolated
        ? `You have label overlays active. The full mask will be saved. Continue?`
        : `Overwrite ${activeMaskType}?`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      if (isIsolated) {
        onShowFullMask?.(activeVariant ?? "4class");
        await new Promise((r) => setTimeout(r, 50));
      }

      const imageData = await nv.saveImage({ isSaveDrawing: true });
      if (!imageData) { showAlert("Save failed: empty drawing", "error"); return; }

      const blob =
        imageData instanceof Blob
          ? imageData
          : new Blob([new Uint8Array(imageData)], { type: "application/octet-stream" });

      if (blob.size === 0) { showAlert("Save failed: empty file", "error"); return; }

      const formData = new FormData();
      formData.append("file", blob, maskFilename);
      formData.append("mask_type", activeMaskType);

      await saveDrawingCallback(activeMaskType, formData);
      showAlert("Mask saved successfully", "success");
    } catch (err) {
      console.error("SAVE ERROR:", err);
      showAlert(err.response?.data?.error || "Save failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleLayoutChange = (val) => {
    setLayout(val);
    window.dispatchEvent(new CustomEvent("set-layout", { detail: val }));
  };

  // ── Render one label row in the dropdown ──────────────────────────────────
  const renderLabelRow = ([key, value]) => {
    const labelIdx = Number(key);
    const isBackground = value.toLowerCase() === "background";
    const maskKey = isBackground ? null : getMaskKey(value);
    const isVisible = Boolean(maskKey && activeLabelMasks[maskKey]);

    return (
      <Box
        key={key}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => { if (!isBackground) handleLabelChange(labelIdx); }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          cursor: "pointer",
          bgcolor: activeLabel === labelIdx ? "rgba(96,165,250,0.1)" : "transparent",
          "&:hover": { bgcolor: "rgba(255,255,255,0.06)" },
        }}
      >
        <Box
          sx={{
            width: 13,
            height: 13,
            borderRadius: "4px",
            bgcolor: getLabelColorByIndex(labelIdx, activeMaskType),
            border: "1px solid rgba(255,255,255,0.15)",
            flexShrink: 0,
          }}
        />
        <Typography sx={{ fontSize: 14, color: "#e2e2e2", flex: 1, lineHeight: 1 }}>
          {getDisplayName(value, activeMaskType)}
        </Typography>

        {!isBackground && (
          <Tooltip title={isVisible ? "Restore full mask" : "Isolate this label"}>
            <IconButton
              size="small"
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onToggleLabelMask?.(activeVariant, value, !isVisible);
              }}
              sx={{
                p: 0.25,
                color: isVisible ? "#60a5fa" : "rgba(255,255,255,0.25)",
                "&:hover": {
                  color: isVisible ? "#93c5fd" : "rgba(255,255,255,0.6)",
                  bgcolor: "transparent",
                },
              }}
            >
              {isVisible ? <VisibilityIcon sx={{ fontSize: 16 }} /> : <VisibilityOffIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const isDraw = drawMode !== null && drawMode > 0;
  const isErase = drawMode === 0;
  const selectedLabelName = filteredLabels.find(([k]) => Number(k) === activeLabel)?.[1];
  const canEdit = Boolean(activeMaskType);
  const canSave = Boolean(activeMaskType) && !loading;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Stack direction="row" alignItems="center" sx={toolbarSx}>
      {onBack && (
        <>
          <Tooltip title="Back">
            <IconButton size="small" onClick={onBack} sx={iconBtnSx}><ArrowBackIcon /></IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: "rgba(255,255,255,0.1)" }} />
        </>
      )}

      {studyLabel && (
        <>
          <Box sx={{ minWidth: 0, maxWidth: 200 }}>
            <Typography variant="body2" fontWeight={500} noWrap sx={{ color: "#e2e2e2", fontSize: 14 }}>
              {studyLabel}
            </Typography>
            {studyId && (
              <Typography variant="caption" noWrap sx={{ display: "block", color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                {studyId}
              </Typography>
            )}
          </Box>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: "rgba(255,255,255,0.1)" }} />
        </>
      )}

      {/* ── Label selector trigger ── */}
      <Tooltip title={!activeMaskType ? "Select a mask first" : ""} disableHoverListener={Boolean(activeMaskType)}>
        <Box
          onClick={handleOpenMenu}
          sx={{ ...labelTriggerSx, opacity: !activeMaskType ? 0.45 : 1, cursor: !activeMaskType ? "not-allowed" : "pointer" }}
        >
          <Box
            sx={{
              width: 13, height: 13, borderRadius: "4px",
              bgcolor: activeLabel === 0 ? "rgba(255,255,255,0.15)" : getLabelColorByIndex(activeLabel, activeMaskType),
              border: "1px solid rgba(255,255,255,0.15)",
              flexShrink: 0,
            }}
          />
          <Typography sx={{ fontSize: 14, color: "#e2e2e2", lineHeight: 1, flex: 1 }}>
            {!activeMaskType
              ? "No mask selected"
              : selectedLabelName
                ? getDisplayName(selectedLabelName, activeMaskType)
                : "Background"}
          </Typography>
          <Typography sx={{ color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1 }}>▾</Typography>
        </Box>
      </Tooltip>

      {/* ── Dropdown ── */}
      {labelMenuOpen && activeMaskType && (
        <Box
          ref={dropdownRef}
          onMouseDown={(e) => e.stopPropagation()}
          sx={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            zIndex: 99999,
            width: 230,
            maxHeight: 420,
            overflowY: "auto",
            bgcolor: "#2F343C",
            borderRadius: "10px",
            border: "0.5px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* Hide all / Show all */}
          <Box
            sx={{
              display: "flex", gap: 1, px: 1.5, py: 0.75,
              borderBottom: "0.5px solid rgba(255,255,255,0.1)",
              position: "sticky", top: 0, bgcolor: "#2F343C", zIndex: 1,
            }}
          >
            <Button size="small" variant="outlined" sx={maskToggleAllBtnSx}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onClick={handleHideAll}>Hide all</Button>
            <Button size="small" variant="outlined" sx={maskToggleAllBtnSx}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
              onClick={handleShowAll}>Show all</Button>
          </Box>

          {filteredLabels.length === 0 ? (
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>No labels available</Typography>
            </Box>
          ) : grouped === null
            ? filteredLabels.map(renderLabelRow)
            : Object.entries(grouped).map(([group, items]) => {
              if (!items || items.length === 0) return null;
              return (
                <Box key={group}>
                  <Typography sx={{
                    px: 1.5, pt: 1, pb: 0.25, fontSize: 11, fontWeight: 600,
                    color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                    {group}
                  </Typography>
                  {items.map(renderLabelRow)}
                </Box>
              );
            })}
        </Box>
      )}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: "rgba(255,255,255,0.1)" }} />

      {/* ── Draw / Erase ── */}
      <Box sx={toolGroupSx}>
        <Tooltip title={!canEdit ? "Load a mask to draw" : "Draw"}>
          <Box component="button" onClick={canEdit ? handleDrawClick : undefined}
            sx={{ ...toggleBtnSx(isDraw), opacity: canEdit ? 1 : 0.35, cursor: canEdit ? "pointer" : "not-allowed" }}>
            <DrawIcon />
          </Box>
        </Tooltip>
        <Tooltip title={!canEdit ? "Load a mask to erase" : "Erase"}>
          <Box component="button" onClick={canEdit ? handleEraseClick : undefined}
            sx={{ ...toggleBtnSx(isErase), opacity: canEdit ? 1 : 0.35, cursor: canEdit ? "pointer" : "not-allowed" }}>
            <AutoFixHighIcon />
          </Box>
        </Tooltip>
      </Box>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: "rgba(255,255,255,0.1)" }} />

      <Tooltip title="Undo">
        <span><IconButton size="small" onClick={handleUndo} disabled={drawMode === null} sx={iconBtnSx}><UndoIcon /></IconButton></span>
      </Tooltip>
      <Tooltip title="Redo">
        <span><IconButton size="small" onClick={handleRedo} disabled={redoStack.length === 0} sx={iconBtnSx}><RedoIcon /></IconButton></span>
      </Tooltip>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: "rgba(255,255,255,0.1)" }} />

      <Tooltip title="Zoom in">
        <IconButton size="small" onClick={handleZoomIn} sx={iconBtnSx}>
          <ZoomInIcon />
        </IconButton>
      </Tooltip>

      <Tooltip title="Zoom out">
        <IconButton size="small" onClick={handleZoomOut} sx={iconBtnSx}>
          <ZoomOutIcon />
        </IconButton>
      </Tooltip>

      <Tooltip title="Reset view">
        <IconButton size="small" onClick={handleResetView} sx={iconBtnSx}>
          <RefreshRoundedIcon />
        </IconButton>
      </Tooltip>

      <Tooltip title="Screenshot">
        <IconButton size="small" onClick={handleOpenScreenshotMenu} sx={iconBtnSx}>
          <PhotoCameraIcon />
        </IconButton>
      </Tooltip>

      {screenshotMenuOpen && (
        <>
          <Box
            ref={screenshotMenuRef}
            onMouseDown={(e) => e.stopPropagation()}
            sx={{
              ...screenshotMenuSx,
              top: screenshotMenuPos.top,
              left: screenshotMenuPos.left,
            }}
          >
            <Box
              onClick={handleScreenshotViewer}
              sx={screenshotMenuItemSx}
            >
              <Typography sx={{ fontSize: 14 }}>Screenshot whole viewer</Typography>
            </Box>
            <Box
              onClick={handleStartManualSelection}
              sx={screenshotMenuItemSx}
            >
              <Typography sx={{ fontSize: 14 }}>Screenshot selected box</Typography>
            </Box>
          </Box>
        </>
      )}

      {manualSelection && (
        <Box
          onMouseDown={handleManualSelectionMouseDown}
          sx={{
            position: "fixed",
            zIndex: 99998,
            top: manualSelection.viewerRect.top,
            left: manualSelection.viewerRect.left,
            width: manualSelection.viewerRect.width,
            height: manualSelection.viewerRect.height,
            cursor: "crosshair",
            bgcolor: "rgba(15,23,42,0.12)",
            border: "1px dashed rgba(96,165,250,0.8)",
            userSelect: "none",
          }}
        >
          {manualSelection.start && manualSelection.current && (
            <Box
              sx={{
                position: "absolute",
                left: Math.min(manualSelection.start.x, manualSelection.current.x) - manualSelection.viewerRect.left,
                top: Math.min(manualSelection.start.y, manualSelection.current.y) - manualSelection.viewerRect.top,
                width: Math.abs(manualSelection.current.x - manualSelection.start.x),
                height: Math.abs(manualSelection.current.y - manualSelection.start.y),
                border: "2px solid #60a5fa",
                bgcolor: "rgba(96,165,250,0.16)",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.18)",
                pointerEvents: "none",
              }}
            />
          )}
        </Box>
      )}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: "rgba(255,255,255,0.1)" }} />

      {/* ── Layout ── */}
      <Box sx={toolGroupSx}>
        <Tooltip title="Grid layout">
          <Box component="button" onClick={() => handleLayoutChange("grid")} sx={toggleBtnSx(layout === "grid")}><GridViewIcon /></Box>
        </Tooltip>
        <Tooltip title="Main + panels">
          <Box component="button" onClick={() => handleLayoutChange("main-left")} sx={toggleBtnSx(layout === "main-left")}><SpaceDashboardIcon /></Box>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1 }} />

      {/* ── Hovered label chip ── */}
      {hoveredLabel && !activePerLabelKey && (
        <Box sx={hoveredLabelChipSx}>
          <Box
            sx={{
              width: 10, height: 10, borderRadius: "3px",
              bgcolor: getLabelColorByIndex(hoveredLabel.index, activeMaskType),
              border: "1px solid rgba(255,255,255,0.2)",
              flexShrink: 0,
            }}
          />
          <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1, whiteSpace: "nowrap" }}>
            {getDisplayName(hoveredLabel.name, activeMaskType)}
          </Typography>
        </Box>
      )}

      {/* ── Save ── */}
      <Tooltip title={
        !activeMaskType ? "Load a mask first"
          : activePerLabelKey ? `Save full mask (all labels) for ${activeMaskType}`
            : `Save ${activeMaskType}`
      }>
        <span>
          <Button size="small" variant="contained" disableElevation
            startIcon={<SaveIcon sx={{ fontSize: 17 }} />}
            onClick={handleSave} disabled={!canSave} sx={saveBtnSx}>
            {loading ? "Saving…" : "Save"}
          </Button>
        </span>
      </Tooltip>
    </Stack>
  );
}
