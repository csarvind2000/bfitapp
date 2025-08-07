import { useState, useCallback, useRef } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  base64ToUInt8Array,
  base64ArrToNVImage,
} from "../utils/base64ArrToNVImage";
import Grid from "@mui/material/Grid2";
// import { ReactComponent as Bounding } from "../assets/bounding.svg";
import { Queue } from "../constants";
import useNiivueStore from "../hooks/niivueStore";
import { useTaskAlert } from "../hooks/taskAlert";
import { useAlert } from "../hooks/alert";
import EATBoundModal from "./eatBoundModal";
import { useShallow } from "zustand/shallow";
import ExpandIcon from '@mui/icons-material/Expand';
import FavoriteTwoToneIcon from "@mui/icons-material/FavoriteTwoTone";
import FavoriteIcon from "@mui/icons-material/Favorite";
import CropIcon from "@mui/icons-material/Crop";
import { AnalysisResultTypes } from "../constants";
import analysisService from "../services/analysis";
import jobService from "../services/job";

function PericardiumCropIcon() {
  return (
    <div
      style={{
        position: "relative",
        display: "inline-block",
        padding: 0,
        margin: 0,
        lineHeight: 0,
      }}
    >
      <FavoriteTwoToneIcon />
      <CropIcon
        size="small"
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          fontSize: "0.8rem",
        }}
      />
    </div>
  );
}

export default function AnalysisResultToolGrid({ analysisResult }) {
  const queue = analysisResult?.analysis.queue || null;
  const { nvInstances, isVolumeLoaded, segmentationTypeLoaded } =
    useNiivueStore(
      useShallow((state) => ({
        nvInstances: state.nvInstances,
        isVolumeLoaded: state.isVolumeLoaded,
        segmentationTypeLoaded: state.segmentationTypeLoaded,
      }))
    );
  const [isOpenEATBound, setIsOpenEATBound] = useState(false);
  const [isTrimmed, setIsTrimmed] = useState(false);
  const [loadingTrimmedVolume, setLoadingTrimmedVolume] = useState(false);
  const [selectedRenderOption, setSelectedRenderOption] = useState(null);
  const volumeRef = useRef({ volume: null, trimmedVolume: null });
  const taskAlert = useTaskAlert();
  const showAlert = useAlert();

  const openBoundEAT = () => {
    setIsOpenEATBound(true);
  };

  const closeBoundEAT = useCallback(() => {
    setIsOpenEATBound(false);
  }, []);

  const boundEAT = useCallback(async (segmentation_mask) => {
    const segUInt8Array = base64ToUInt8Array(segmentation_mask);
    const promises = nvInstances.map((nv, index) => {
      return nv
        .loadDrawingFromUrl(segUInt8Array)
        .then(() =>
          console.debug(`Loaded segmentation on canvas ${index}`, nv.volumes)
        );
    });
    Promise.all(promises)
      .then(() => {})
      .catch((error) => {
        console.error(
          `Failed to load segmentation mask ${JSON.stringify(error.response?.data)}`
        );
      });
  }, []);

  const loadTrimmedVolume = (nv, nvImage) => {
    /* Loads the trimmed pericardium volume for all viewports
    in Calcium and EAT module, and only the render viewport
    for CTCA module.
    */
    if (
      queue === Queue.EAT ||
      queue === Queue.CALCIUM ||
      nv.opts.sliceType === nv.sliceTypeRender
    ) {
      nv.removeVolumeByIndex(0);
      nv.addVolume(nvImage);
      nv.volumes[0].cal_min = -200;
      nv.volumes[0].cal_max = 600;
      nv.updateGLVolume();
    }
  };

  const updateTrimmedVolumeInProgressMessage = (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="common.white">
        Processing trimmed volume
      </Typography>
      <CircularProgress size="1rem" thickness={4} />
    </Stack>
  );

  const updateTrimmedVolumeCallback = useCallback(
    async (taskId) => {
      const response = await jobService.getJobStatus(taskId);
      console.debug(`Got job status`, response);
      if (response.status === "finished") {
        const nvImage = await base64ArrToNVImage([response.result], true);
        // Cache copy of untrimmed volume and trimmed volume
        volumeRef.current.volume = nvInstances[0].volumes[0];
        volumeRef.current.trimmedVolume = nvImage;
        nvInstances.map((nv) => loadTrimmedVolume(nv, nvImage));
        setIsTrimmed(true);
        setLoadingTrimmedVolume(false);
      }
      return response;
    },
    [analysisResult]
  );

  const handleTrimVolume = async (toPreserve) => {
    const analysisId = analysisResult?.analysis.id;
    try {
      if (!isTrimmed) {
        // Get the trimmed volume from the cache if available
        if (volumeRef.current.trimmedVolume) {
          nvInstances.map((nv) =>
            loadTrimmedVolume(nv, volumeRef.current.trimmedVolume)
          );
          setIsTrimmed(true);
        } else {
          setLoadingTrimmedVolume(true);
          const response = await analysisService.getTrimmedVolume(analysisId);
          taskAlert.show(
            updateTrimmedVolumeInProgressMessage,
            {},
            {
              taskId: response.id,
              callback: updateTrimmedVolumeCallback,
              pollInterval: 5000,
            }
          );
        }
        setSelectedRenderOption(toPreserve);
      } else {
        nvInstances.map((nv) =>
          loadTrimmedVolume(nv, volumeRef.current.volume)
        );
        setIsTrimmed(false);
        setSelectedRenderOption(null);
      }
    } catch (error) {
      console.error("Error getting trimmed volume", error);
      showAlert(
        `Failed to get trimmed volume ${JSON.stringify(error.response?.data)}`,
        "error"
      );
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
      const response = await analysisService.getDetail(
        analysisId,
        ["artifacts"],
        {
          artifacts: [AnalysisResultTypes.WHS],
        }
      );
      if (response.artifacts.length > 0) {
        console.debug("Got WHS artifact", response);
        nvInstances[3].loadVolumes([
          { url: response.artifacts[0].artifact_url },
        ]);
        setSelectedRenderOption("WHS");
      }
    } catch (error) {
      console.error("Error getting WHS", error);
      showAlert(
        `Failed to load volume ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    } finally {
      setLoadingTrimmedVolume(false);
    }
  };

  return (
    <>
      {isVolumeLoaded && isOpenEATBound && (
        <EATBoundModal
          EATVolume={nvInstances[0].volumes[0] || null}
          EATMask={
            nvInstances[0].saveImage({
              isSaveDrawing: true,
              filename: "",
            }) || null
          }
          boundEAT={boundEAT}
          closeDialog={closeBoundEAT}
        />
      )}
      <Box sx={{ width: "100%", pl: 1, pb: 1 }}>
        <Grid
          container
          spacing={1}
          direction="row"
          sx={{ justifyContent: "flex-start" }}
        >
          <Grid size="auto">
            <Tooltip title="Bound EAT mask">
              <span>
                <IconButton
                  size="small"
                  sx={{ borderRadius: 1.5 }}
                  onClick={openBoundEAT}
                  // disabled={queue !== Queue.EAT || !segmentationTypeLoaded}
                >
                  <ExpandIcon />
                </IconButton>
              </span>
            </Tooltip>

            {queue === Queue.CTCA ? (
              <ToggleButtonGroup
                exclusive
                size="small"
                disabled={!isVolumeLoaded || loadingTrimmedVolume}
                sx={{
                  alignItems: "center",
                  justifyContent: "center",
                  justifyItems: "center",
                }}
              >
                <Tooltip title="Render Arteries">
                  <span>
                    <ToggleButton
                      selected={
                        isTrimmed && selectedRenderOption === "arteries"
                      }
                      size="small"
                      onClick={() => handleTrimVolume("arteries")}
                    >
                      <PericardiumCropIcon />
                    </ToggleButton>
                  </span>
                </Tooltip>
                <Tooltip title="Render Whole Heart">
                  <span>
                    <ToggleButton
                      selected={selectedRenderOption === "WHS"}
                      size="small"
                      onClick={loadWHSVolume}
                    >
                      <FavoriteIcon />
                    </ToggleButton>
                  </span>
                </Tooltip>
              </ToggleButtonGroup>
            ) : (
              <Tooltip title="Trim Pericardium">
                <span>
                  <ToggleButton
                    disabled={!isVolumeLoaded || loadingTrimmedVolume}
                    selected={isTrimmed && selectedRenderOption === "heart"}
                    size="small"
                    onClick={() => handleTrimVolume("heart")}
                  >
                    <PericardiumCropIcon />
                  </ToggleButton>
                </span>
              </Tooltip>
            )}
          </Grid>
        </Grid>
      </Box>
    </>
  );
}
