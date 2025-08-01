import React, { useEffect, useState, useRef, memo } from "react";
import { Niivue } from "@niivue/niivue";
import { Modal, Box, Slider } from "@mui/material";
import studyService from "../../services/studies";
import { base64ArrToNVImage } from "../../utils/base64ArrToNVImage";

const NIIVUE_PREFS = {
  viewModeHotKey: null,
  crosshairWidth: 0,
  sliceType: 0,
  isRadiologicalConvention: true,
  sagittalNoseLeft: true,
  invertScrollDirection: true,
};

/* Niivue Windowing tweaks
 */
const defaultWindowMin = -200;
const defaultWindowMax = 600;

function NiivueDisplay({ nvImage }) {
  const canvasRef = useRef(null);
  const isNvAttached = useRef(false);
  const [nv] = useState(() => new Niivue(NIIVUE_PREFS));
  const [volIndex, setVolIndex] = useState(0);
  const [volMax, setVolMax] = useState(0);

  function unloadNVImage() {
    // run cleanup of Niivue webgl context
    if (isNvAttached.current) {
      for (let i = 0; i < nv.volumes.length; i++) {
        nv.removeVolumeByIndex(i);
      }
      console.debug("Unloaded volume", nv.volumes);
      nv.gl.getExtension("WEBGL_lose_context").loseContext();
      nv.canvas = null;
      canvasRef.current = null;
      console.debug("Cleared Niivue webgl context");
    }
  }

  useEffect(() => {
    if (!isNvAttached.current) {
      console.log("Attaching Niivue to canvas");
      nv.attachToCanvas(canvasRef.current);
    }
  }, []);

  useEffect(() => {
    if (nvImage) {
      nv.addVolume(nvImage);
      nv.volumes[0].cal_min = defaultWindowMin;
      nv.volumes[0].cal_max = defaultWindowMax;
      nv.graph.autoSizeMultiplanar = true;
      nv.updateGLVolume();
      console.debug("Loaded volume", nv.volumes);
      isNvAttached.current = true;
      const [_, nx, ny, nz] = nv.volumes[0].dimsRAS;
      const currVolIndex = Math.round(nz * nv.scene.crosshairPos[2]);
      setVolIndex(currVolIndex);
      setVolMax(nz);

      nv.onLocationChange = (data) => setVolIndex(data.vox[2] + 1);
    }
    return () => unloadNVImage();
  }, [nvImage]);

  function handleSliceChange(event) {
    const newSliceIdx = event.target.value;
    const vox = [0, 0, 0];
    vox[2] = newSliceIdx - Math.ceil(nv.scene.crosshairPos[2] * volMax);
    nv.moveCrosshairInVox(...vox);
    // console.debug(
    //   `Moved z-index to ${Math.ceil(nv.scene.crosshairPos[2] * volMax)}`
    // );
    setVolIndex(newSliceIdx);
  }

  return (
    <Box
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
    >
      <canvas
        ref={canvasRef}
        height={400}
        style={{
          display: "block",
          maxHeight: "500px",
          objectFit: "contain",
          margin: "auto",
        }}
      />
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
          value={volIndex}
          min={1}
          max={volMax}
          disabled={volMax === 0}
          onChange={handleSliceChange}
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
          {`I: ${volIndex} (${volIndex}/${volMax})`}
        </Box>
      </div>
    </Box>
  );
}

const NiivuePreviewModal = memo(function NiivuePreviewModal({
  studyId,
  seriesId,
  open,
  onClose,
}) {
  const [nvImage, setNvImage] = useState(null);

  async function* getInstancesPaginatedGenerator(studyId, seriesId) {
    let page = null;
    let response;
    do {
      response = await studyService.getInstances(studyId, seriesId, page);
      for (const instance of response.results) {
        yield instance;
      }
      if (response.next) {
        page = new URL(response.next).searchParams.get("page");
      }
    } while (response.next);
  }

  useEffect(() => {
    async function getNVImage() {
      const base64Arr = [];
      for await (const instance of getInstancesPaginatedGenerator(
        studyId,
        seriesId
      )) {
        // console.debug(`Got DICOM instance ${JSON.stringify(instance)}`);
        base64Arr.push(instance.base64_string);
      }
      console.debug(`Got ${base64Arr.length} base64 encoded DICOM instances`);
      const nvImage = base64ArrToNVImage(base64Arr);
      setNvImage(nvImage);
    }
    getNVImage();
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="niivue-preview-modal"
      aria-describedby="niivue-preview-modal-detail"
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          bgcolor: "background.paper",
          p: 4,
          borderRadius: 2,
          width: "600px",
        }}
      >
        <NiivueDisplay nvImage={nvImage} />
      </Box>
    </Modal>
  );
});

export default NiivuePreviewModal;
