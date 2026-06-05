import React, { useRef, useEffect, useState } from "react";
import { Box, Slider } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { Niivue } from "@niivue/niivue";

const NVSLICE_TYPES = {
  AXIAL: 0,
  CORONAL: 1,
  SAGITTAL: 2,
  RENDER: 4,
};
/* Niivue Windowing tweaks
 */
const defaultWindowMin = -200;
const defaultWindowMax = 600;

export default function NiivueCPROverlay({ nvImage }) {
  const canvasRefs = [useRef(null), useRef(null), useRef(null)];
  const [nvInstances] = useState(() =>
    Array.from({ length: 3 }, (_, index) => {
      return new Niivue({
        viewModeHotKey: null,
        sliceType:
          index === 0
            ? NVSLICE_TYPES.AXIAL
            : index === 1
              ? NVSLICE_TYPES.CORONAL
              : index === 2
                ? NVSLICE_TYPES.SAGITTAL
                : NVSLICE_TYPES.RENDER,
        isRadiologicalConvention: true,
        sagittalNoseLeft: true,
        show3Dcrosshair: true,
        invertScrollDirection: true,
        crosshairWidth: 0.5,
        crosshairColor: [1, 0, 0, 0.2],
      });
    })
  );
  const isNvAttached = useRef(false);

  function unloadNVImage() {
    // Reusing webgl context, unload old volumes
    if (isNvAttached.current) {
      nvInstances.forEach((nv, index) => {
        for (let i = 0; i < nv.volumes.length; i++) {
          nv.removeVolumeByIndex(i);
        }
        console.debug("Unloaded volume", nv.volumes);
      });
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
      });
      isNvAttached.current = true;
    }
    return () => unloadNVImage();
  }, [nvImage]);

  useEffect(() => {
    // enable bidirectional sync between all views
    nvInstances[0].broadcastTo([nvInstances[1], nvInstances[2]]);
    nvInstances[1].broadcastTo([nvInstances[0], nvInstances[2]]);
    nvInstances[2].broadcastTo([nvInstances[0], nvInstances[1]]);
  }, []);

  useEffect(() => {
    // run cleanup of Niivue webgl context on unmount
    return () => {
      if (isNvAttached.current) {
        nvInstances.forEach((nv, index) => {
          nv?.gl.getExtension("WEBGL_lose_context").loseContext();
          nv.canvas = null;
          canvasRefs[index].current = null;
          isNvAttached.current = false;
        });
        console.debug("Cleared Niivue webgl context");
      }
    };
  }, []);

  return (
    <Grid container columns={9} sx={{ flex: "auto" }}>
      {canvasRefs.map((ref, index) => (
        <Grid key={index} size={3} display="flex">
          <Box
            height="100%"
            width="100%"
            maxWidth="100%"
            maxHeight="100%"
            bgcolor="black"
            sx={{
              position: "relative",
              border: "2px solid",
              borderColor: "grey.700",
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
                position: "absolute",
              }}
            />
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}
