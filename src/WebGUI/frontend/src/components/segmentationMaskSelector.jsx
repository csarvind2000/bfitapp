import { useState, useEffect } from "react";
import {
  Box,
  Chip,
  Paper,
  IconButton,
  Stack,
  Switch,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { NVImage } from "@niivue/niivue";
import DrawIcon from "@mui/icons-material/Draw";
import DeleteIcon from "@mui/icons-material/Delete";
import analysisService from "../services/analysis";
import { AnalysisResultTypes, SegmentationColors } from "../constants";
import useNiivueStore from "../hooks/niivueStore";
import { useLRUCache } from "../hooks/lrucache";
import { useShallow } from "zustand/shallow";
import { base64ToUInt8Array } from "../utils/base64ArrToNVImage";
import CalciumMultiMaskModal from "./calciumMultiMaskModal";

export default function SegmentationMaskSelector({ analysisResult }) {
  const [segs, setSegs] = useState([]);
  const [displayedMask, setDisplayedMask] = useState(null);
  const [isOpenMultiMask, setIsOpenMultiMask] = useState(false);
  const {
    selectedCanvasId,
    nvInstances,
    isVolumeLoaded,
    addedSegmentation,
    segmentationTypeLoaded,
    setSegmentationTypeLoaded,
    resetAddedSegmentation,
  } = useNiivueStore(
    useShallow((state) => ({
      selectedCanvasId: state.selectedCanvasId,
      nvInstances: state.nvInstances,
      isVolumeLoaded: state.isVolumeLoaded,
      addedSegmentation: state.addedSegmentation,
      segmentationTypeLoaded: state.segmentationTypeLoaded,
      setSegmentationTypeLoaded: state.setSegmentationTypeLoaded,
      resetAddedSegmentation: state.resetAddedSegmentation,
    }))
  );
  const [maskOpacity, setMaskOpacity] = useState([1, 1, 1, 1]);
  const { get, set, clear } = useLRUCache(8);

  const handleSwitch = async (e, seg) => {
    setDisplayedMask(seg.mask_type);
    if (e.target.checked) {
      // const segUInt8Array = base64ToUInt8Array(seg.base64_string);
      let volume = get(seg.mask_type);
      if (!volume) {
        volume = await NVImage.loadFromUrl({
          url: seg.segmentation_mask_url,
        });
        set(seg.mask_type, volume);
      }
      const promises = nvInstances.map((nv, index) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            nv.loadDrawing(volume);
            console.debug(`Loaded segmentation on canvas ${index}`, nv.volumes);
            resolve(true);
          }, 0);
        });
      });
      Promise.all(promises)
        .then(() => setSegmentationTypeLoaded(seg.mask_type))
        .catch((error) => {
          console.error(
            `Failed to load segmentation mask ${JSON.stringify(error.response?.data)}`
          );
        });
    } else {
      unloadMask();
    }
  };

  useEffect(() => {
    if (analysisResult) {
      setSegs(
        analysisResult?.segmentations.sort(
          (s1, s2) => s1.is_custom - s2.is_custom
        )
      );
    }
  }, [analysisResult]);

  useEffect(() => {
    async function loadSeg(url) {
      const volume = await NVImage.loadFromUrl({ url });
      set(addedSegmentation.mask_type, volume); // update volume in cache
      const promises = nvInstances.filter((nv, index) => {
        // load added segmentation on rest of canvas views
        if (index !== 0) {
          return new Promise((resolve) => {
            setTimeout(() => {
              nv.loadDrawing(volume);
              console.debug(`Loaded segmentation on canvas ${index}`);
              resolve(true);
            }, 0);
          });
        }
      });
      Promise.all(promises)
        .then(() => setSegmentationTypeLoaded(addedSegmentation.mask_type))
        .catch((error) => console.error(error))
        .finally(() => resetAddedSegmentation());
    }

    if (addedSegmentation) {
      setSegs((prevSegs) => {
        const updatedSegIdx = prevSegs.findIndex(
          ({ mask_type }) => mask_type === addedSegmentation.mask_type
        );
        if (updatedSegIdx !== -1) {
          let newSegs = [...prevSegs];
          newSegs[updatedSegIdx] = addedSegmentation;
          return newSegs;
        }
        return [...prevSegs, addedSegmentation];
      });
      setDisplayedMask(addedSegmentation.mask_type);
      // const segUInt8Array = base64ToUInt8Array(addedSegmentation.base64_string);
      loadSeg(addedSegmentation.segmentation_mask_url);
    }
  }, [addedSegmentation]);

  const handleMaskOpacity = (event, newValue) => {
    setMaskOpacity((prevMaskOpacity) => {
      let newMaskOpacity = [...prevMaskOpacity];
      newMaskOpacity[selectedCanvasId] = newValue;
      return newMaskOpacity;
    });
    nvInstances[selectedCanvasId].setDrawOpacity(newValue);
    console.debug(`Set mask opacity to ${newValue}`);
  };

  const handleDeleteSeg = async (maskType) => {
    const analysisId = analysisResult.analysis.id;
    try {
      await analysisService.removeSegmentation(analysisId, maskType);
      setSegs((prevSegs) =>
        prevSegs.filter((seg) => seg.mask_type !== maskType)
      );
    } catch (error) {
      console.error(
        `Failed to delete segmentation ${maskType} ${JSON.stringify(error.response?.data)}`
      );
    }
  };

  const openMultiMask = () => {
    console.debug("Segmentations", segs);
    console.debug("Displaying segmentation", displayedMask);
    setIsOpenMultiMask(true);
  };

  const closeMultiMask = () => {
    setIsOpenMultiMask(false);
  };

  const loadMultiMask = async (maskTypes) => {
    if (maskTypes.length === 0) {
      return;
    }

    try {
      const analysisId = analysisResult.analysis.id;
      await analysisService
        .getCombinedMask(analysisId, maskTypes)
        .then((data) => {
          setSegmentationTypeLoaded(maskTypes);
          setDisplayedMask(maskTypes);
          const segUInt8Array = base64ToUInt8Array(data.file_data);
          nvInstances.forEach((nv, index) => {
            nv.loadDrawingFromUrl(segUInt8Array).then(() =>
              console.debug(
                `Loaded segmentation on canvas ${index}`,
                nv.volumes
              )
            );
          });
        });
    } catch (error) {
      console.error(
        `Failed to load segmentations ${maskTypes} ${JSON.stringify(error.response?.data)}`
      );
    }
  };

  const unloadMask = () => {
    nvInstances.forEach((nv) => nv.closeDrawing());
    setSegmentationTypeLoaded(null);
    setDisplayedMask(null);
  };

  return (
    <>
      {isOpenMultiMask && (
        <CalciumMultiMaskModal
          closeDialog={closeMultiMask}
          segs={segs}
          loadMultiMask={loadMultiMask}
        />
      )}
      <Box sx={{ width: "100%" }}>
        <TableContainer component={Paper} sx={{ overflow: "hidden" }}>
          <Table
            sx={{ minWidth: 200 }}
            size="small"
            aria-label="segmentation-mask-table-small"
          >
            <TableBody>
              {segs.map((seg) => (
                <TableRow
                  key={seg.mask_type}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell align="left" sx={{ maxWidth: 100 }}>
                    <Chip
                      icon={seg.is_custom ? <DrawIcon /> : null}
                      label={seg.mask_type}
                      size="small"
                      sx={{
                        "& .MuiChip-label": {
                          color: `${
                            seg.mask_type ===
                            AnalysisResultTypes.LAD_CALCIUM_MASK
                              ? SegmentationColors.CALCIUM_LAD
                              : seg.mask_type ===
                                  AnalysisResultTypes.LCX_CALCIUM_MASK
                                ? SegmentationColors.CALCIUM_LCX
                                : seg.mask_type ===
                                    AnalysisResultTypes.LM_CALCIUM_MASK
                                  ? SegmentationColors.CALCIUM_LM
                                  : seg.mask_type ===
                                      AnalysisResultTypes.RCA_CALCIUM_MASK
                                    ? SegmentationColors.CALCIUM_RCA
                                    : seg.mask_type ===
                                        AnalysisResultTypes.EAT_MASK
                                      ? SegmentationColors.EAT
                                      : seg.mask_type ===
                                          AnalysisResultTypes.LUMEN_MASK
                                        ? SegmentationColors.LUMEN
                                        : seg.mask_type ===
                                            AnalysisResultTypes.AORTA_MASK
                                          ? SegmentationColors.AORTA
                                          : seg.mask_type ===
                                              AnalysisResultTypes.VESSEL_MASK
                                            ? SegmentationColors.VESSEL
                                            : SegmentationColors.DEFAULT
                          }}`,
                          textOverflow: "ellipsis",
                        },
                        width: "100%",
                        overflow: "hidden",
                      }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                    {seg.is_custom && (
                      <Tooltip title="Delete">
                        <IconButton
                          sx={{ borderRadius: 1.5 }}
                          onClick={() => handleDeleteSeg(seg.mask_type)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Switch
                      disabled={!isVolumeLoaded}
                      name={seg.mask_type}
                      checked={displayedMask === seg.mask_type}
                      onChange={async (e) => await handleSwitch(e, seg)}
                      inputProps={{ "aria-label": "display mask" }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow
                key="LOAD MULTIPLE MASKS"
                sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
              >
                <TableCell align="left">Load Multi Masks</TableCell>
                <TableCell align="right">
                  <Switch
                    disabled={!isVolumeLoaded || segs.length === 0}
                    name="Load Multi Masks"
                    checked={Array.isArray(segmentationTypeLoaded)}
                    onChange={
                      Array.isArray(segmentationTypeLoaded)
                        ? unloadMask
                        : openMultiMask
                    }
                    inputProps={{ "aria-label": "display mask" }}
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
        <Stack spacing={1} direction="column" sx={{ mt: 1, p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {selectedCanvasId !== null
              ? `Opacity: ${(maskOpacity[selectedCanvasId] * 100).toFixed()}%`
              : "Opacity: -"}
          </Typography>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={
              selectedCanvasId !== null ? maskOpacity[selectedCanvasId] : null
            }
            onChange={handleMaskOpacity}
            aria-label="mask-opacity-slider"
            valueLabelDisplay="auto"
            sx={{ width: "100%" }}
            size="small"
            disabled={!isVolumeLoaded || selectedCanvasId === null}
          />
        </Stack>
      </Box>
    </>
  );
}
