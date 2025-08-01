import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import pako from "pako";
import { useAlert } from "../hooks/alert";
import { useDebounce } from "../hooks/debounce";
import { Niivue } from "@niivue/niivue";
import {
  Box,
  Button,
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
import Grid from "@mui/material/Grid2";
import ContrastIcon from "@mui/icons-material/Contrast";
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

const EATBoundModal = ({ closeDialog, EATVolume, EATMask, boundEAT }) => {
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

  const boundChange = (event, newValue) => {
    setBounds(newValue);
  };

  useEffect(() => {
    if (!mounted && canvasRef.current) {
      console.log("Attaching Niivue to canvas");
      nvInstance
        .attachToCanvas(canvasRef.current)
        .then(() => setIsMounted(true))
        .catch((error) => console.error(error));
    }
  });

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
      console.log("Loaded volume");
    }
  }, [EATVolume, mounted]);

  useEffect(() => {
    let isExpired = false; // prevent stale effect updates

    if (nvInstance && isNvAttached.current) {
      nvInstance.loadDrawingFromUrl(EATMask).then(() => {
        if (isExpired) {
          return;
        }
        const lower = bounds[0] - 1;
        const upper = bounds[1] - 1;
        const rows = EATVolume.dims[2];
        const penValue = 2;

        for (let row = 0; row < rows; row++) {
          nvInstance.drawPenLine(
            [0, row, lower],
            [EATVolume.dims[1], row, lower],
            penValue
          );
          nvInstance.drawPenLine(
            [0, row, upper],
            [EATVolume.dims[1], row, upper],
            penValue
          );
        }
        nvInstance.refreshDrawing();
      });
    }

    return () => {
      isExpired = true;
    };
  }, [debouncedBounds]);

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
    const lower = bounds[0];
    const upper = bounds[1];
    try {
      const gzippedData = pako.gzip(EATMask);
      const imageBlob = new Blob([gzippedData], {
        type: "application/octet-stream",
      });

      const formData = new FormData();
      formData.append("mask", imageBlob, "mask.nii.gz");
      formData.append("lower", lower);
      formData.append("upper", upper);
      const boundedEAT = await analysisService.getBounded(formData);
      console.log("Bounding", boundedEAT);
      await boundEAT(boundedEAT.file_data);
    } catch (error) {
      showAlert(
        `Failed to bound EAT: ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    }
  };

  return (
    <Dialog
      open={true}
      onClose={closeDialog}
      maxWidth={"sm"}
      slots={{ transition: undefined }}
      keepMounted={true}
    >
      <DialogTitle>Select Bounds</DialogTitle>
      <DialogContent dividers={true}>
        <Grid
          container
          alignItems={"center"}
          spacing={1}
          sx={{ height: "auto" }}
        >
          <Grid size={11}>
            <Box>
              <Stack spacing={1} direction="column" sx={{ mt: 1, p: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {`Opacity: ${(maskOpacity * 100).toFixed()}%`}
                </Typography>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={maskOpacity}
                  onChange={handleMaskOpacity}
                  aria-label="mask-opacity-slider"
                  valueLabelDisplay="auto"
                  sx={{ width: "100%" }}
                  size="small"
                  disabled={!mounted}
                />
              </Stack>
            </Box>
          </Grid>
          <Grid size={1} sx={{ justifySelf: "center", alignItems: "flex-end" }}>
            <Tooltip title="Reset Window">
              <span>
                <IconButton
                  size="small"
                  sx={{ borderRadius: 1.5 }}
                  onClick={handleResetWindow}
                  disabled={!mounted}
                >
                  <ContrastIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Grid>
          <Grid size={12} sx={{ justifyContent: "center" }}>
            <Box
              bgcolor="black"
              sx={{
                border: "2px solid",
                borderColor: "grey.700",
                borderRadius: 2,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                "&:hover": {
                  borderColor: "secondary.main",
                },
                "&:focus": {
                  borderColor: "secondary.main",
                  outline: "none",
                },
              }}
            >
              <canvas
                id={0}
                ref={canvasRef}
                height={400}
                style={{
                  display: "block",
                  maxHeight: "500px",
                  objectFit: "contain",
                  margin: "auto",
                }}
              />
              <Slider
                style={{
                  marginLeft: "10px",
                  zIndex: 2,
                  height: "400px",
                }}
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
                    width: 16,
                    height: 30,
                    borderRadius: 4,
                    backgroundColor: "grey.600",
                    "&:hover": {
                      backgroundColor: "secondary.main",
                    },
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
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button
          disabled={!mounted}
          onClick={async () => {
            setLoading(true);
            await boundMask();
            setLoading(false);
            closeDialog();
          }}
          loading={loading}
        >
          Bound
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EATBoundModal;
