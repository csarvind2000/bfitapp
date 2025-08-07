import { useShallow } from "zustand/shallow";
import React, { useRef, useEffect, useState } from "react";
import { Box, Slider } from "@mui/material";
import Grid from "@mui/material/Grid2";
import useNiivueStore from "../../hooks/niivueStore";

const NVSLICE_TYPES = {
  AXIAL: 0,
  CORONAL: 1,
  SAGITTAL: 2,
  RENDER: 4,
};
/* Niivue Windowing tweaks
 */
const defaultWindowMin = 0;
const defaultWindowMax = 800;

export default function NiivueCanvasGrid({ nvImage }) {
  const {
    selectedCanvasId,
    nvInstances,
    setSelectedCanvasId,
    setIsVolumeLoaded,
    reset,
  } = useNiivueStore(
    useShallow((state) => ({
      selectedCanvasId: state.selectedCanvasId,
      nvInstances: state.nvInstances,
      setSelectedCanvasId: state.setSelectedCanvasId,
      setIsVolumeLoaded: state.setIsVolumeLoaded,
      reset: state.reset,
    }))
  );
  const canvasRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];
  const isNvAttached = useRef(false);
  const [volIndex, setVolIndex] = useState([0, 0, 0, 0]);
  const [volMax, setVolMax] = useState([0, 0, 0, 0]);

  function unloadNVImage() {
    // run cleanup of Niivue webgl context
    if (isNvAttached.current) {
      nvInstances.forEach((nv, index) => {
        for (let i = 0; i < nv.volumes.length; i++) {
          nv.removeVolumeByIndex(i);
        }
        console.debug("Unloaded volume", nv.volumes);
        nv.gl.getExtension("WEBGL_lose_context").loseContext();
        nv.canvas = null;
        canvasRefs[index].current = null;
      });
      console.debug("Cleared Niivue webgl context");
      reset();
      console.debug("Niivue store state reset!");
    }
  }

  useEffect(() => {
    if (!isNvAttached.current) {
      nvInstances.forEach((nv, index) => {
        console.log(`Attaching Niivue to canvas ${index}`);
        nv.attachToCanvas(canvasRefs[index].current);
      });
    }
  }, []);

  useEffect(() => {
    if (nvImage) {
      nvInstances.forEach((nv, index) => {
        nv.addVolume(nvImage);
        nv.volumes[0].cal_min = defaultWindowMin;
        nv.volumes[0].cal_max = defaultWindowMax;
        nv.updateGLVolume();
        console.debug("Loaded volume", nv.volumes);
        if (index !== 3) {
          // Set initial slice counts and slice index for the 2D views
          const [_, nx, ny, nz] = nv.volumes[0].dimsRAS;
          const currVolMax =
            index === NVSLICE_TYPES.AXIAL
              ? nz
              : index === NVSLICE_TYPES.CORONAL
                ? ny
                : nx;
          const currSlicePos =
            index === NVSLICE_TYPES.AXIAL
              ? nv.scene.crosshairPos[2]
              : index === NVSLICE_TYPES.CORONAL
                ? nv.scene.crosshairPos[1]
                : nv.scene.crosshairPos[0];
          setVolMax((prevVolMax) => {
            const newVolMax = [...prevVolMax];
            newVolMax[index] = currVolMax;
            return newVolMax;
          });
          setVolIndex((prevVolIndex) => {
            const newVolIndex = [...prevVolIndex];
            newVolIndex[index] = Math.round(currVolMax * currSlicePos);
            return newVolIndex;
          });
        }
        nv.onLocationChange = (data) =>
          setVolIndex((prevVolIndex) => {
            const newVolIndex = [...prevVolIndex];
            newVolIndex[index] =
              data.vox[
                index === NVSLICE_TYPES.AXIAL
                  ? 2
                  : index === NVSLICE_TYPES.CORONAL
                    ? 1
                    : 0
              ] + 1;
            return newVolIndex;
          });
      });
      isNvAttached.current = true;
      setIsVolumeLoaded(true);
    }
    return () => unloadNVImage();
  }, [nvImage]);

  useEffect(() => {
    // enable bidirectional sync between all views
    nvInstances[0].broadcastTo([
      nvInstances[1],
      nvInstances[2],
      nvInstances[3],
    ]);
    nvInstances[1].broadcastTo([
      nvInstances[0],
      nvInstances[2],
      nvInstances[3],
    ]);
    nvInstances[2].broadcastTo([
      nvInstances[0],
      nvInstances[1],
      nvInstances[3],
    ]);
    nvInstances[3].broadcastTo([
      nvInstances[0],
      nvInstances[1],
      nvInstances[2],
    ]);
  }, []);

  function handleSliceChange(event, viewIdx) {
    const newSliceIdx = event.target.value;
    const vox = [0, 0, 0];
    if (viewIdx === NVSLICE_TYPES.AXIAL) {
      vox[2] =
        newSliceIdx -
        Math.ceil(nvInstances[viewIdx].scene.crosshairPos[2] * volMax[viewIdx]);
    } else if (viewIdx === NVSLICE_TYPES.CORONAL) {
      vox[1] =
        newSliceIdx -
        Math.ceil(nvInstances[viewIdx].scene.crosshairPos[1] * volMax[viewIdx]);
    } else if (viewIdx === NVSLICE_TYPES.SAGITTAL) {
      vox[0] =
        newSliceIdx -
        Math.ceil(nvInstances[viewIdx].scene.crosshairPos[0] * volMax[viewIdx]);
    }
    nvInstances[viewIdx].moveCrosshairInVox(...vox);
    setVolIndex((prevVolIndex) => {
      const newVolIndex = [...prevVolIndex];
      newVolIndex[viewIdx] = newSliceIdx;
      return newVolIndex;
    });
  }

  return (
    <Grid container spacing={0.2} sx={{ flex: 1 }}>
      {canvasRefs.map((ref, index) => (
        <Grid key={index} size={6} display="flex">
          <Box
            height="100%"
            width="100%"
            maxWidth="100%"
            maxHeight="100%"
            bgcolor="black"
            sx={{
              position: "relative",
              border: "2px solid",
              borderColor:
                selectedCanvasId === index ? "secondary.main" : "grey.700",
              borderRadius: 2,
              overflow: "hidden",
              "&:hover": {
                borderColor: "secondary.main",
              },
              "&:focus": {
                borderColor: "secondary.main",
                outline: "none",
              },
            }}
            tabIndex={0}
          >
            <canvas
              id={index}
              ref={ref}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                margin: "auto",
                position: "absolute"
              }}
              onClick={() => {
                console.debug(`Selected canvas ${index}`);
                setSelectedCanvasId(index);
              }}
            />
            {index !== 3 && (
              <>
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
                    onChange={(e) => handleSliceChange(e, index)}
                    sx={{
                      height: "90%",
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
                </div>
                <div
                  style={{
                    position: "absolute",
                    top: "0.2rem",
                    left: "0.2rem",
                    pointerEvents: "none",
                  }}
                >
                  <Box
                    sx={{
                      backgroundColor: "rgba(0, 0, 0, 0.65)",
                      padding: "0.5rem 0.5rem",
                      borderRadius: 2,
                      color: "secondary.main",
                      fontWeight: "500",
                      fontSize: "0.8rem",
                      textShadow: "0.8px 0.8px 0.5px rgba(0, 0, 0, 0.65)",
                    }}
                  >
                    {`I: ${volIndex[index]} (${volIndex[index]}/${volMax[index]})`}
                  </Box>
                </div>
              </>
            )}
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}
