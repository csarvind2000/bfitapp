import { useShallow } from "zustand/shallow";
import React, { useRef, useEffect, useState } from "react";
import { Box, Slider, IconButton, Tooltip } from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import useNiivueStore from "../../hooks/niivueStore";
import { useAlert } from "../../hooks/alert";
import { getScreenshotViewLabel } from "../../utils/screenshotGalleryUtils";

const NVSLICE_TYPES = {
  AXIAL: 0,
  CORONAL: 1,
  SAGITTAL: 2,
  RENDER: 4,
};

const defaultWindowMin = 0;
const defaultWindowMax = 800;

const getSliceAxis = (viewIdx) =>
  viewIdx === NVSLICE_TYPES.AXIAL ? 2 :
  viewIdx === NVSLICE_TYPES.CORONAL ? 1 : 0;

const clampSliceNumber = (slice, max) =>
  Math.min(Math.max(Math.round(slice), 1), max || 1);

const getVoxelSliceNumber = (vox, viewIdx, max) =>
  clampSliceNumber((vox?.[getSliceAxis(viewIdx)] ?? 0) + 1, max);

const getSceneSliceNumber = (nv, viewIdx, max) =>
  clampSliceNumber((nv?.scene?.crosshairPos?.[getSliceAxis(viewIdx)] ?? 0) * max + 1, max);

export default function NiivueCanvasGrid({
  nvImage,
  setCurrentSlice,
  layout,
  onLocationChange,
  reportMode = false,
}) {
  const {
    selectedCanvasId,
    nvInstances,
    setSelectedCanvasId,
    setIsVolumeLoaded,
    addScreenshotToGallery,
    reset,
  } = useNiivueStore(
    useShallow((state) => ({
      selectedCanvasId: state.selectedCanvasId,
      nvInstances: state.nvInstances,
      setSelectedCanvasId: state.setSelectedCanvasId,
      setIsVolumeLoaded: state.setIsVolumeLoaded,
      addScreenshotToGallery: state.addScreenshotToGallery,
      reset: state.reset,
    }))
  );
  const showAlert = useAlert();

  const canvasRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const isNvAttached = useRef(false);
  const attachErrorRef = useRef(null);
  const activeViewIndexes = reportMode ? [0, 1, 2] : [0, 1, 2, 3];

  const [volIndex, setVolIndex] = useState([0, 0, 0, 0]);
  const [volMax, setVolMax] = useState([0, 0, 0, 0]);
  const [layoutState, setLayoutState] = useState("main-left");
  const [expandedCanvasId, setExpandedCanvasId] = useState(null);
  const [isCanvasAttached, setIsCanvasAttached] = useState(false);

  // ─── Listen for external layout changes ──────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (e.detail) setLayoutState(e.detail); };
    window.addEventListener("set-layout", handler);
    return () => window.removeEventListener("set-layout", handler);
  }, []);

  // ─── Attach canvases once on mount, tear down on unmount ─────────────────
  useEffect(() => {
    setIsVolumeLoaded(false);
    let cancelled = false;

    if (!isNvAttached.current) {
      Promise.all(
        activeViewIndexes.map((index) => {
          try {
            const nv = nvInstances[index];
            const canvas = canvasRefs[index].current;
            return nv && canvas ? Promise.resolve(nv.attachToCanvas(canvas)) : Promise.resolve();
          } catch (error) {
            return Promise.reject(error);
          }
        })
      )
        .then(() => {
          if (cancelled) return;
          attachErrorRef.current = null;
          isNvAttached.current = true;
          setIsCanvasAttached(true);
        })
        .catch((error) => {
          if (cancelled) return;
          attachErrorRef.current = error;
          setIsCanvasAttached(false);
          console.error("Failed to attach NiiVue canvas:", error);
          showAlert(
            "Viewer failed to initialize WebGL. Refresh the page and try again.",
            "error"
          );
          setIsVolumeLoaded(false);
        });
    }

    return () => {
      cancelled = true;
      activeViewIndexes.forEach((index) => {
        const nv = nvInstances[index];
        if (!nv) return;
        try {
          if (Array.isArray(nv.volumes)) {
            for (let i = nv.volumes.length - 1; i >= 0; i--) {
              try { nv.removeVolumeByIndex(i); } catch (_) {}
            }
          }
          try { nv.closeDrawing?.(); } catch (_) {}
          try { nv.gl?.getExtension?.("WEBGL_lose_context")?.loseContext(); } catch (_) {}
        } catch (e) {
          console.warn("NiiVue cleanup error:", e);
        }
      });
      reset();
      isNvAttached.current = false;
      attachErrorRef.current = null;
      setIsCanvasAttached(false);
    };
  }, []); // mount/unmount only

  // ─── Load volume when nvImage arrives ────────────────────────────────────
  useEffect(() => {
    if (!nvImage) return;
    if (!isCanvasAttached) return;
    if (attachErrorRef.current) {
      setIsVolumeLoaded(false);
      return;
    }

    try {
      activeViewIndexes.forEach((index) => {
        const nv = nvInstances[index];
        nv.addVolume(nvImage);
        nv.volumes[0].cal_min = defaultWindowMin;
        nv.volumes[0].cal_max = defaultWindowMax;
        nv.updateGLVolume();

        let currentViewMax = 0;
        if (index !== 3) {
          const [, nx, ny, nz] = nv.volumes[0].dimsRAS;

          const currVolMax =
            index === NVSLICE_TYPES.AXIAL ? nz :
            index === NVSLICE_TYPES.CORONAL ? ny : nx;
          currentViewMax = currVolMax;

          setVolMax((prev) => { const a = [...prev]; a[index] = currVolMax; return a; });
          setVolIndex((prev) => { const a = [...prev]; a[index] = getSceneSliceNumber(nv, index, currVolMax); return a; });
        }

        const handleNvLocationChange = (data) => {
          if (!data?.vox) return;

          setVolIndex((prev) => {
            const a = [...prev];
            a[index] = getVoxelSliceNumber(data.vox, index, currentViewMax);
            return a;
          });

          if (index === NVSLICE_TYPES.AXIAL && setCurrentSlice) {
            setCurrentSlice(getVoxelSliceNumber(data.vox, index, currentViewMax));
          }

          onLocationChange?.(data);
        };

        nv.onLocationChange = handleNvLocationChange;
        if (nv.opts) nv.opts.onLocationChange = handleNvLocationChange;
      });

      setIsVolumeLoaded(true);
    } catch (error) {
      console.error("Failed to load volume into NiiVue:", error);
      showAlert(
        "Viewer failed to load the image volume. Refresh the page and try again.",
        "error"
      );
      setIsVolumeLoaded(false);
    }
  }, [nvImage, isCanvasAttached, onLocationChange, setCurrentSlice]);

  // ─── Broadcast crosshair sync between instances ───────────────────────────
  useEffect(() => {
    activeViewIndexes.forEach((index) => {
      const nv = nvInstances[index];
      nv?.broadcastTo(nvInstances.filter((n) => n !== nv));
    });
  }, []);

  // ─── Slice index sync via polling ─────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      activeViewIndexes.forEach((index) => {
        const nv = nvInstances[index];
        if (!nv?.scene) return;

        const max = volMax[index];
        if (max === 0) return;

        const slice = getSceneSliceNumber(nv, index, max);
        setVolIndex((prev) => {
          if (prev[index] === slice) return prev;
          const a = [...prev]; a[index] = slice; return a;
        });
      });
    }, 50);

    return () => clearInterval(interval);
  }, [nvInstances, volMax]);

  // ─── Redraw on layout change ──────────────────────────────────────────────
  useEffect(() => {
    activeViewIndexes.forEach((index) => {
      const nv = nvInstances[index];
      try {
        nv?.resizeListener?.();
        nv?.updateGLVolume?.();
        nv?.drawScene?.();
      } catch (error) {
        console.warn("NiiVue layout redraw skipped:", error);
      }
    });
  }, [layoutState]);

  function handleSliceChange(event, newValue, viewIdx) {
    const vox = [0, 0, 0];
    const currentSlice = getSceneSliceNumber(nvInstances[viewIdx], viewIdx, volMax[viewIdx]);
    if (viewIdx === NVSLICE_TYPES.AXIAL) {
      vox[2] = newValue - currentSlice;
    } else if (viewIdx === NVSLICE_TYPES.CORONAL) {
      vox[1] = newValue - currentSlice;
    } else if (viewIdx === NVSLICE_TYPES.SAGITTAL) {
      vox[0] = newValue - currentSlice;
    }
    nvInstances[viewIdx].moveCrosshairInVox(...vox);
    setVolIndex((prev) => { const a = [...prev]; a[viewIdx] = newValue; return a; });
  }

  const handleCaptureViewport = (event, viewIdx) => {
    event.stopPropagation();
    event.preventDefault();

    const nv = nvInstances?.[viewIdx];
    const canvas = nv?.gl?.canvas;

    if (!nv || !canvas) {
      showAlert("Screenshot failed: viewer not ready", "error");
      return;
    }

    try {
      nv.updateGLVolume?.();
      nv.drawScene?.();

      addScreenshotToGallery({
        dataUrl: canvas.toDataURL("image/png"),
        viewIndex: viewIdx,
        viewLabel: getScreenshotViewLabel(viewIdx),
        slice: viewIdx === 3 ? null : volIndex[viewIdx],
        totalSlices: viewIdx === 3 ? null : volMax[viewIdx],
      });
      showAlert(`${getScreenshotViewLabel(viewIdx)} saved to gallery`, "success");
    } catch (error) {
      console.error("VIEWPORT SCREENSHOT ERROR:", error);
      showAlert("Screenshot failed", "error");
    }
  };

  const gridAreas = ["main", "side1", "side2", "side3"];

  return (
    <Box
      sx={{
        display: expandedCanvasId !== null ? "block" : "grid",
        flex: 1,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
        gap: "4px",
        ...(reportMode
          ? {
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gridTemplateRows: "1fr",
              gridTemplateAreas: `"main side1 side2"`,
            }
          : layoutState === "main-left"
            ? {
                gridTemplateColumns: "2fr 1fr",
                gridTemplateRows: "1fr 1fr 1fr",
                gridTemplateAreas: `"main side1" "main side2" "main side3"`,
              }
            : {
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
                gridTemplateAreas: `"main side1" "side2 side3"`,
              }),
      }}
    >
      {activeViewIndexes.map((index) => {
        const ref = canvasRefs[index];
        return (
        <Box
          key={index}
          sx={{
            gridArea: expandedCanvasId === null ? gridAreas[index] : "1 / 1 / -1 / -1",
            display: expandedCanvasId === null || expandedCanvasId === index ? "block" : "none",
            width: "100%",
            height: "100%",
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <Box
            height="100%"
            width="100%"
            bgcolor="black"
            sx={{
              position: "relative",
              border: "2px solid",
              borderColor: selectedCanvasId === index ? "secondary.main" : "grey.700",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <canvas
              ref={ref}
              style={{ width: "100%", height: "100%", position: "absolute" }}
              onClick={() => setSelectedCanvasId(index)}
              onDoubleClick={() => setExpandedCanvasId(expandedCanvasId === index ? null : index)}
            />

            <Tooltip title={`Capture ${getScreenshotViewLabel(index)}`}>
              <IconButton
                size="small"
                onClick={(event) => handleCaptureViewport(event, index)}
                onDoubleClick={(event) => event.stopPropagation()}
                sx={{
                  position: "absolute",
                  top: 5,
                  left: 5,
                  backgroundColor: "rgba(0,0,0,0.6)",
                  color: "white",
                  zIndex: 10,
                  "&:hover": { backgroundColor: "rgba(0,0,0,0.78)" },
                }}
              >
                <PhotoCameraIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {/* Slice controls — not shown on the 3D render panel */}
            {index !== 3 && (
              <>
                {/* Vertical slice slider */}
                <div
                  style={{
                    position: "absolute",
                    top: "0.2rem",
                    right: "0.2rem",
                    bottom: "0.2rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Slider
                    orientation="vertical"
                    value={volIndex[index]}
                    min={1}
                    max={volMax[index]}
                    disabled={volMax[index] === 0}
                    onChange={(e, val) => handleSliceChange(e, val, index)}
                    sx={{
                      height: "90%",
                      "& .MuiSlider-thumb": {
                        width: 16,
                        height: 30,
                        borderRadius: 4,
                        backgroundColor: "grey.600",
                        "&:hover": { backgroundColor: "secondary.main" },
                      },
                      "& .MuiSlider-track": {
                        width: 6,
                        backgroundColor: "transparent",
                        borderColor: "transparent",
                        borderRadius: 1,
                      },
                      "& .MuiSlider-rail": {
                        width: 6,
                        backgroundColor: "grey.800",
                        borderRadius: 1,
                      },
                    }}
                  />
                </div>

                {/* Slice index badge */}
                <Box
                  sx={{
                    position: "absolute",
                    top: "0.2rem",
                    left: "2.8rem",
                    pointerEvents: "none",
                    backgroundColor: "rgba(0,0,0,0.65)",
                    px: "0.5rem",
                    py: "0.5rem",
                    borderRadius: 2,
                    color: "secondary.main",
                    fontWeight: 500,
                    fontSize: "0.8rem",
                    textShadow: "0.8px 0.8px 0.5px rgba(0,0,0,0.65)",
                  }}
                >
                  {`I: ${volIndex[index]} (${volIndex[index]}/${volMax[index]})`}
                </Box>
              </>
            )}

            {/* Fullscreen toggle */}
            <IconButton
              size="small"
              onClick={() => setExpandedCanvasId(expandedCanvasId === index ? null : index)}
              sx={{
                position: "absolute",
                bottom: 5,
                left: 5,
                backgroundColor: "rgba(0,0,0,0.6)",
                color: "white",
                zIndex: 10,
              }}
            >
              {expandedCanvasId === index ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Box>
        </Box>
        );
      })}
    </Box>
  );
}
