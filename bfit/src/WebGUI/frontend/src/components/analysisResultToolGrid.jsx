import { useState, useCallback, useEffect, useRef } from "react";
import {
  Box,
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import { NVImage } from "@niivue/niivue";
import {
  base64ToUInt8Array,
  base64ArrToNVImage,
} from "../utils/base64ArrToNVImage";
import Grid from "@mui/material/Grid2";
import { Queue } from "../constants";
import useNiivueStore from "../hooks/niivueStore";
import { useTaskAlert } from "../hooks/taskAlert";
import { useAlert } from "../hooks/alert";
import MaskBoundModal from "./maskBoundModal";
import { useShallow } from "zustand/shallow";
import ExpandIcon from "@mui/icons-material/Expand";
import FavoriteTwoToneIcon from "@mui/icons-material/FavoriteTwoTone";
import FavoriteIcon from "@mui/icons-material/Favorite";
import CropIcon from "@mui/icons-material/Crop";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { AnalysisResultTypes } from "../constants";
import analysisService from "../services/analysis";
import jobService from "../services/job";

const BASE_SCAN_OPTIONS = [
  {
    value: "inphase",
    label: "Inphase",
    artifactTypes: [AnalysisResultTypes.ORIGINAL_MR_INPHASE, AnalysisResultTypes.ORIGINAL_MR],
    window: [0, 800],
  },
  {
    value: "water",
    label: "Water",
    artifactTypes: [AnalysisResultTypes.ORIGINAL_MR_WATER],
    window: [0, 800],
  },
  {
    value: "fat",
    label: "Fat",
    artifactTypes: [AnalysisResultTypes.ORIGINAL_MR_FAT],
    window: [0, 800],
  },
  {
    value: "fatfraction",
    label: "Fat fraction",
    artifactTypes: [AnalysisResultTypes.ORIGINAL_MR_FATFRACTION],
    window: [0, 1],
  },
];

const NVSLICE_TYPES = {
  AXIAL: 0,
  CORONAL: 1,
  SAGITTAL: 2,
  RENDER: 4,
};

const VIEW_SLICE_TYPES = [
  NVSLICE_TYPES.AXIAL,
  NVSLICE_TYPES.CORONAL,
  NVSLICE_TYPES.SAGITTAL,
  NVSLICE_TYPES.RENDER,
];

const getArtifactByType = (artifacts, artifactTypes) => {
  const types = artifactTypes.map((type) => type.toUpperCase());
  return artifacts.find((artifact) =>
    types.includes(String(artifact?.artifact_type || "").toUpperCase())
  );
};


export default function AnalysisResultToolGrid({
  analysisResult,
  showHoverLabel,       // ← NEW
  onToggleHoverLabel,   // ← NEW
  onBoundedMaskSaved,
}) {
  const queue = analysisResult?.analysis.queue || null;
  const { nvInstances, isVolumeLoaded, segmentationTypeLoaded, activeMaskType } = useNiivueStore(
    useShallow((state) => ({
      nvInstances: state.nvInstances,
      isVolumeLoaded: state.isVolumeLoaded,
      segmentationTypeLoaded: state.segmentationTypeLoaded,
      activeMaskType: state.activeMaskType,
    }))
  );
  const [isOpenMaskBound, setIsOpenMaskBound] = useState(false);
  const [isTrimmed, setIsTrimmed] = useState(false);
  const [loadingTrimmedVolume, setLoadingTrimmedVolume] = useState(false);
  const [selectedRenderOption, setSelectedRenderOption] = useState(null);
  const [baseScan, setBaseScan] = useState("inphase");
  const [baseScanArtifacts, setBaseScanArtifacts] = useState([]);
  const [loadingBaseScan, setLoadingBaseScan] = useState(false);
  const volumeRef = useRef({ volume: null, trimmedVolume: null });
  const taskAlert = useTaskAlert();
  const showAlert = useAlert();

  const openBoundMask = () => setIsOpenMaskBound(true);
  const closeBoundMask = useCallback(() => setIsOpenMaskBound(false), []);

  useEffect(() => {
    const analysisId = analysisResult?.analysis?.id;
    if (!analysisId || queue !== Queue.NNUNET) return;

    let cancelled = false;
    async function loadBaseScanArtifacts() {
      try {
        const response = await analysisService.getDetail(analysisId, ["artifacts"], {
          artifacts: [AnalysisResultTypes.ORIGINAL_MR],
        });
        if (cancelled) return;
        const artifacts = Array.isArray(response?.artifacts) ? response.artifacts : [];
        setBaseScanArtifacts(artifacts);
        if (!getArtifactByType(artifacts, [AnalysisResultTypes.ORIGINAL_MR_INPHASE, AnalysisResultTypes.ORIGINAL_MR])) {
          const firstAvailable = BASE_SCAN_OPTIONS.find((option) =>
            getArtifactByType(artifacts, option.artifactTypes)
          );
          if (firstAvailable) setBaseScan(firstAvailable.value);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error loading base scan artifacts", error);
        }
      }
    }

    loadBaseScanArtifacts();
    return () => { cancelled = true; };
  }, [analysisResult?.analysis?.id, queue]);

  const applyBoundedMask = useCallback(async (segmentation_mask) => {
    const segUInt8Array = base64ToUInt8Array(segmentation_mask);
    const promises = nvInstances.map((nv, index) =>
      nv.loadDrawingFromUrl(segUInt8Array)
        .then(() => console.debug(`Loaded segmentation on canvas ${index}`, nv.volumes))
    );
    try {
      await Promise.all(promises);
    } catch (error) {
      console.error(`Failed to load segmentation mask ${JSON.stringify(error.response?.data)}`);
      return;
    }

    const anatomy = String(analysisResult?.analysis?.anatomy || "").toLowerCase();
    const maskType = activeMaskType || segmentationTypeLoaded;
    if (!["abd", "abdomen", "abdominal"].includes(anatomy) || !maskType || !nvInstances[0]) {
      return;
    }

    const imageData = await nvInstances[0].saveImage({ isSaveDrawing: true });
    if (!imageData) {
      showAlert("Bounded mask applied, but save failed: empty drawing", "error");
      return;
    }

    const blob =
      imageData instanceof Blob
        ? imageData
        : new Blob([new Uint8Array(imageData)], { type: "application/octet-stream" });
    if (blob.size === 0) {
      showAlert("Bounded mask applied, but save failed: empty file", "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", blob, `${maskType.replace(/[^\w.-]+/g, "_")}.nii`);
    formData.append("mask_type", maskType);

    await analysisService.addSegmentation(analysisResult.analysis.id, maskType, formData);
    await onBoundedMaskSaved?.();
    showAlert("Bounded abdomen mask saved and volumes updated", "success");
  }, [activeMaskType, analysisResult, nvInstances, onBoundedMaskSaved, segmentationTypeLoaded, showAlert]);

  const loadTrimmedVolume = (nv, nvImage) => {
    if (queue === Queue.NNUNET || queue === Queue.MMAP || nv.opts.sliceType === nv.sliceTypeRender) {
      nv.removeVolumeByIndex(0);
      nv.addVolume(nvImage);
      nv.volumes[0].cal_min = -200;
      nv.volumes[0].cal_max = 600;
      nv.updateGLVolume();
    }
  };

  const loadBaseScanVolume = (nv, nvImage, windowRange, viewIndex) => {
    if (!nv || !nvImage) return;
    const crosshairPos = nv.scene?.crosshairPos
      ? Array.from(nv.scene.crosshairPos)
      : null;
    const viewSliceType = VIEW_SLICE_TYPES[viewIndex] ?? NVSLICE_TYPES.AXIAL;
    if (Array.isArray(nv.volumes) && nv.volumes.length > 0) {
      nv.removeVolumeByIndex(0);
    }
    nv.addVolume(nvImage.clone?.() || nvImage);
    nv.setSliceType?.(viewSliceType);
    if (nv.opts) nv.opts.sliceType = viewSliceType;
    if (crosshairPos && nv.scene?.crosshairPos) {
      nv.scene.crosshairPos[0] = crosshairPos[0];
      nv.scene.crosshairPos[1] = crosshairPos[1];
      nv.scene.crosshairPos[2] = crosshairPos[2];
    }
    nv.volumes[0].cal_min = windowRange[0];
    nv.volumes[0].cal_max = windowRange[1];
    nv.updateGLVolume?.();
    nv.drawScene?.();
  };

  const handleBaseScanChange = async (event) => {
    const nextBaseScan = event.target.value;
    const analysisId = analysisResult?.analysis?.id;
    const option = BASE_SCAN_OPTIONS.find((item) => item.value === nextBaseScan);
    let artifact = option ? getArtifactByType(baseScanArtifacts, option.artifactTypes) : null;

    if (!option || !analysisId) {
      showAlert("That scan is not available for this analysis", "warning");
      return;
    }

    try {
      setLoadingBaseScan(true);
      setIsTrimmed(false);
      setSelectedRenderOption(null);

      if (nextBaseScan !== "inphase" || !artifact?.artifact_url) {
        const response = await analysisService.getSourceScan(analysisId, nextBaseScan);
        artifact = response?.artifact;
        if (artifact) {
          setBaseScanArtifacts((prev) => {
            const artifactType = String(artifact.artifact_type || "").toUpperCase();
            const withoutDuplicate = prev.filter(
              (item) => String(item?.artifact_type || "").toUpperCase() !== artifactType
            );
            return [...withoutDuplicate, artifact];
          });
        }
      }

      if (!artifact?.artifact_url) {
        throw new Error(`${option.label} scan is not available`);
      }

      const nvImage = await NVImage.loadFromUrl({
        url: `${artifact.artifact_url}?t=${Date.now()}`,
      });
      nvInstances.forEach((nv, index) => loadBaseScanVolume(nv, nvImage, option.window, index));
      volumeRef.current.volume = nvImage;
      setBaseScan(nextBaseScan);
    } catch (error) {
      console.error("Error loading base scan", error);
      showAlert(`Failed to load scan ${JSON.stringify(error.response?.data || error.message)}`, "error");
    } finally {
      setLoadingBaseScan(false);
    }
  };

  const updateTrimmedVolumeInProgressMessage = (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="common.white">Processing trimmed volume</Typography>
      <CircularProgress size="1rem" thickness={4} />
    </Stack>
  );

  const updateTrimmedVolumeCallback = useCallback(async (taskId) => {
    const response = await jobService.getJobStatus(taskId);
    if (response.status === "finished") {
      const nvImage = await base64ArrToNVImage([response.result], true);
      volumeRef.current.volume = nvInstances[0].volumes[0];
      volumeRef.current.trimmedVolume = nvImage;
      nvInstances.map((nv) => loadTrimmedVolume(nv, nvImage));
      setIsTrimmed(true);
      setLoadingTrimmedVolume(false);
    }
    return response;
  }, [analysisResult]);

  const handleTrimVolume = async (toPreserve) => {
    const analysisId = analysisResult?.analysis.id;
    try {
      if (!isTrimmed) {
        if (volumeRef.current.trimmedVolume) {
          nvInstances.map((nv) => loadTrimmedVolume(nv, volumeRef.current.trimmedVolume));
          setIsTrimmed(true);
        } else {
          setLoadingTrimmedVolume(true);
          const response = await analysisService.getTrimmedVolume(analysisId);
          taskAlert.show(updateTrimmedVolumeInProgressMessage, {}, {
            taskId: response.id,
            callback: updateTrimmedVolumeCallback,
            pollInterval: 5000,
          });
        }
        setSelectedRenderOption(toPreserve);
      } else {
        nvInstances.map((nv) => loadTrimmedVolume(nv, volumeRef.current.volume));
        setIsTrimmed(false);
        setSelectedRenderOption(null);
      }
    } catch (error) {
      console.error("Error getting trimmed volume", error);
      showAlert(`Failed to get trimmed volume ${JSON.stringify(error.response?.data)}`, "error");
    }
  };

  const loadWHSVolume = async () => {
    setIsTrimmed(false);
    if (selectedRenderOption === "WHS") {
      nvInstances[3].removeVolumeByIndex(0);
      nvInstances[3].addVolume(nvInstances[0].volumes[0]);
      nvInstances[3].volumes[0].cal_min = -200;
      nvInstances[3].volumes[0].cal_max = 600;
      nvInstances[3].updateGLVolume();
      setSelectedRenderOption(null);
      return;
    }
    const analysisId = analysisResult?.analysis.id;
    try {
      setLoadingTrimmedVolume(true);
      const response = await analysisService.getDetail(analysisId, ["artifacts"], {
        artifacts: [AnalysisResultTypes.WHS],
      });
      if (response.artifacts.length > 0) {
        nvInstances[3].loadVolumes([{ url: response.artifacts[0].artifact_url }]);
        setSelectedRenderOption("WHS");
      }
    } catch (error) {
      console.error("Error getting WHS", error);
      showAlert(`Failed to load volume ${JSON.stringify(error.response?.data)}`, "error");
    } finally {
      setLoadingTrimmedVolume(false);
    }
  };

  return (
    <>
      {isVolumeLoaded && isOpenMaskBound && (
        <MaskBoundModal
          open={isOpenMaskBound}
          sourceVolume={nvInstances[0].volumes[0] || null}
          sourceMask={nvInstances[0].saveImage({ isSaveDrawing: true, filename: "" }) || null}
          applyBoundedMask={applyBoundedMask}
          closeDialog={closeBoundMask}
        />
      )}

      <Box sx={{ width: "100%", pl: 1, pb: 1 }}>
        <Grid container spacing={1} direction="row" sx={{ justifyContent: "flex-start" }}>

          {/* Bound mask */}
          <Grid size="auto">
            <Tooltip title="Bound mask">
              <span>
                <IconButton
                  size="small"
                  sx={{ borderRadius: 1.5 }}
                  onClick={openBoundMask}
                  disabled={
                    !isVolumeLoaded ||
                    !nvInstances[0]?.saveImage({ isSaveDrawing: true, filename: "" })
                  }
                >
                  <ExpandIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Grid>

          {/* Label tooltip toggle — sits right next to Bound mask */}
          <Grid size="auto">
            <Tooltip title={showHoverLabel ? "Hide label tooltip" : "Show label tooltip"}>
              <IconButton
                size="small"
                onClick={onToggleHoverLabel}
                sx={{
                  borderRadius: 1.5,
                  color: showHoverLabel ? "#60a5fa" : "inherit",
                  bgcolor: showHoverLabel ? "rgba(96,165,250,0.12)" : "transparent",
                  border: showHoverLabel
                    ? "1px solid rgba(96,165,250,0.40)"
                    : "1px solid transparent",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    bgcolor: showHoverLabel ? "rgba(96,165,250,0.22)" : undefined,
                  },
                }}
              >
                {showHoverLabel ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Grid>

          <Grid size="auto">
            <FormControl size="small" disabled={!isVolumeLoaded || loadingBaseScan}>
              <Select
                value={baseScan}
                onChange={handleBaseScanChange}
                displayEmpty
                sx={{
                  minWidth: 126,
                  height: 34,
                  borderRadius: 1.5,
                  color: "rgba(255,255,255,0.86)",
                  fontSize: "0.78rem",
                  backgroundColor: "rgba(15,23,42,0.72)",
                  "& .MuiSelect-select": {
                    py: 0.75,
                    pl: 1,
                  },
                  "& .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(148,163,184,0.35)",
                  },
                  "&:hover .MuiOutlinedInput-notchedOutline": {
                    borderColor: "rgba(96,165,250,0.55)",
                  },
                  "& .MuiSvgIcon-root": {
                    color: "rgba(255,255,255,0.7)",
                  },
                }}
              >
                {BASE_SCAN_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

        </Grid>
      </Box>
    </>
  );
}
