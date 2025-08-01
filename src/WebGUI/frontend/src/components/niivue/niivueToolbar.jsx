import { useState } from "react";
import {
  Button,
  Stack,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Divider,
  Menu,
  MenuItem,
  ListItemIcon,
  Typography,
} from "@mui/material";
import { useDialogs } from "@toolpad/core/useDialogs";
import AddIcon from "@mui/icons-material/Add";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DrawIcon from "@mui/icons-material/Draw";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import UndoIcon from "@mui/icons-material/Undo";
import ContrastIcon from "@mui/icons-material/Contrast";
import SaveIcon from "@mui/icons-material/Save";
import { AnalysisResultTypes, Queue } from "../../constants";
import useNiivueStore from "../../hooks/niivueStore";
import { useShallow } from "zustand/shallow";
import { useAlert } from "../../hooks/alert";
import FormatColorFill from "@mui/icons-material/FormatColorFill";
import FormatColorResetIcon from "@mui/icons-material/FormatColorReset";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import CropDinRoundedIcon from "@mui/icons-material/CropDinRounded";

const NIIVUE_DRAGMODES = {
  NONE: 0,
  CONTRAST: 1,
  MEASUREMENT: 2,
  PAN: 3,
  SLICER3D: 4,
  CALLBACKONLY: 5,
  ROISELECTION: 6,
};

const DEFAULT_MASK_TYPES = [
  AnalysisResultTypes.LAD_CALCIUM_MASK,
  AnalysisResultTypes.LCX_CALCIUM_MASK,
  AnalysisResultTypes.LM_CALCIUM_MASK,
  AnalysisResultTypes.RCA_CALCIUM_MASK,
  AnalysisResultTypes.EAT_MASK,
];

/* Niivue Windowing tweaks
 */
const defaultWindowMin = -200;
const defaultWindowMax = 600;

export default function NiivueToolbar({ callbacks, queue }) {
  const {
    selectedCanvasId,
    nvInstances,
    isVolumeLoaded,
    setAddedSegmentation,
    segmentationTypeLoaded,
  } = useNiivueStore(
    useShallow((state) => ({
      selectedCanvasId: state.selectedCanvasId,
      nvInstances: state.nvInstances,
      isVolumeLoaded: state.isVolumeLoaded,
      setAddedSegmentation: state.setAddedSegmentation,
      segmentationTypeLoaded: state.segmentationTypeLoaded,
    }))
  );
  const dialogs = useDialogs();
  const showAlert = useAlert();
  const [drawMode, setDrawMode] = useState([null, null, null, null]);
  const [zoomState, setZoomState] = useState([false, false, false, false]);
  const [crosshairState, setCrosshairState] = useState([1, 1, 1, 1]);
  const [loading, setLoading] = useState(false);
  const [anchorEl1, setAnchorEl1] = useState(null);
  const [anchorEl2, setAnchorEl2] = useState(null);
  const [penState, setPenState] = useState("draw");
  const [eraseState, setEraseState] = useState("erase");
  const { saveDrawingCallback } = callbacks;
  const isPenMenuOpen = Boolean(anchorEl1);
  const isEraseMenuOpen = Boolean(anchorEl2);

  const handleZoom = () => {
    if (zoomState[selectedCanvasId]) {
      nvInstances[selectedCanvasId].opts.dragMode = NIIVUE_DRAGMODES.CONTRAST;
      setZoomState((prevZoomState) => {
        let newZoomState = [...prevZoomState];
        newZoomState[selectedCanvasId] = false;
        return newZoomState;
      });
      console.debug(`Disabled zoom mode on canvas ${selectedCanvasId}`);
    } else {
      nvInstances[selectedCanvasId].opts.dragMode = NIIVUE_DRAGMODES.PAN;
      setZoomState((prevZoomState) => {
        let newZoomState = [...prevZoomState];
        newZoomState[selectedCanvasId] = true;
        return newZoomState;
      });
      console.debug(`Enabled zoom mode on canvas ${selectedCanvasId}`);
    }
  };

  const handleToggleCrosshair = () => {
    if (crosshairState[selectedCanvasId] === 0) {
      nvInstances[selectedCanvasId].setCrosshairWidth(1);
      setCrosshairState((prevCrosshairState) => {
        let newCrosshairState = [...prevCrosshairState];
        newCrosshairState[selectedCanvasId] = 1;
        return newCrosshairState;
      });
      console.debug(`Enabled crosshair on canvas ${selectedCanvasId}`);
    } else {
      nvInstances[selectedCanvasId].setCrosshairWidth(0);
      setCrosshairState((prevCrosshairState) => {
        let newCrosshairState = [...prevCrosshairState];
        newCrosshairState[selectedCanvasId] = 0;
        return newCrosshairState;
      });
      console.debug(`Disabled crosshair on canvas ${selectedCanvasId}`);
    }
  };

  const handleCapture = async () => {
    await nvInstances[selectedCanvasId].saveScene("scene.png");
  };

  const handleDrawMode = (event, newMode) => {
    console.debug(`called handleDrawMode with ${newMode}`);
    if (newMode !== Number.POSITIVE_INFINITY) {
      nvInstances[selectedCanvasId].opts.clickToSegment = false;
    }
    if (newMode === null) {
      nvInstances[selectedCanvasId].setPenValue(-0);
      nvInstances[selectedCanvasId].setDrawingEnabled(false);
      nvInstances[selectedCanvasId].setCrosshairWidth(
        crosshairState[selectedCanvasId]
      );
      setDrawMode((prevDrawMode) => {
        let newDrawMode = [...prevDrawMode];
        newDrawMode[selectedCanvasId] = null;
        return newDrawMode;
      });
    } else {
      nvInstances[selectedCanvasId].setCrosshairWidth(newMode >= 0 ? 0 : 1);
      nvInstances[selectedCanvasId].setDrawingEnabled(newMode >= 0);
      if (newMode === Number.POSITIVE_INFINITY) {
        // flood
        nvInstances[selectedCanvasId].opts.clickToSegment = true;
      }
      if (newMode === 0) {
        // eraser
        nvInstances[selectedCanvasId].setPenValue(newMode, true);
      } else if (newMode > 0) {
        // annotate or fill
        nvInstances[selectedCanvasId].setPenValue(6, true);
      } else {
        nvInstances[selectedCanvasId].setPenValue(-0);
      }
      setDrawMode((prevDrawMode) => {
        let newDrawMode = [...prevDrawMode];
        newDrawMode[selectedCanvasId] = newMode;
        return newDrawMode;
      });
    }
  };

  const handleUndoDraw = () => {
    nvInstances[selectedCanvasId].drawUndo();
  };

  const handleResetWindow = () => {
    nvInstances[selectedCanvasId].volumes[0].cal_min = defaultWindowMin;
    nvInstances[selectedCanvasId].volumes[0].cal_max = defaultWindowMax;
    nvInstances[selectedCanvasId].updateGLVolume();
  };

  const handleSaveDrawing = async () => {
    const label = await dialogs.prompt("Enter a mask label", {
      okText: "Save",
      cancelText: "Cancel",
    });
    if (DEFAULT_MASK_TYPES.includes(label)) {
      dialogs.alert("Label is reserved, please enter another mask label", {
        title: "Forbidden",
      });
      return;
    }
    if (label) {
      setLoading(true);
      try {
        const imageData = nvInstances[0].saveImage({
          isSaveDrawing: true,
          filename: "",
        });
        // const gzippedUint8 = pako.gzip(imageData);
        const imageBlob = new Blob([imageData], {
          type: "application/octet-stream",
        });
        const formData = new FormData();
        formData.append("file", imageBlob, `${label}_niivue.nii`);
        const response = await saveDrawingCallback(label, formData);
        if (response) {
          console.debug("Saved drawing on canvas 0", response);
          setAddedSegmentation(response);
          showAlert(`Saved segmentation ${label}`, "success");
        }
      } catch (error) {
        console.error("Error saving drawing", error);
        showAlert(
          `Failed to save drawing ${JSON.stringify(error.response?.data)}`,
          "error"
        );
      } finally {
        setLoading(false);
      }
    }
  };

  const updateViews = () => {
    const drawBitmap = nvInstances[0].drawBitmap;
    const drawUndoBitmaps = nvInstances[0].drawUndoBitmaps;
    const currentDrawUndoBitmap = nvInstances[0].currentDrawUndoBitmap;
    nvInstances.forEach((nv, idx) => {
      // Refresh drawing on non-axial views after drawing
      if (idx > 0) {
        nv.drawBitmap = drawBitmap;
        nv.drawUndoBitmaps = drawUndoBitmaps;
        nv.currentDrawUndoBitmap = currentDrawUndoBitmap;
        nv.refreshDrawing();
        nv.updateGLVolume();
      }
    });
  };

  const openPenMenu = (e) => {
    setAnchorEl1(e.currentTarget);
  };

  const closePenMenu = () => {
    setAnchorEl1(null);
  };

  const openEraseMenu = (e) => {
    setAnchorEl2(e.currentTarget);
  };

  const closeEraseMenu = (e) => {
    setAnchorEl2(null);
  };

  return (
    <Stack direction="row" spacing={0.5}>
      <Tooltip title="Toggle Zoom">
        <span>
          <ToggleButton
            size="small"
            selected={zoomState[selectedCanvasId]}
            onClick={handleZoom}
            disabled={selectedCanvasId === null}
          >
            <ZoomInIcon />
          </ToggleButton>
        </span>
      </Tooltip>
      <Tooltip title="Toggle Crosshair">
        <span>
          <ToggleButton
            size="small"
            selected={crosshairState[selectedCanvasId]}
            onClick={handleToggleCrosshair}
            disabled={selectedCanvasId === null}
          >
            <AddIcon />
          </ToggleButton>
        </span>
      </Tooltip>
      <Tooltip title="Capture Scene">
        <span>
          <IconButton
            size="small"
            sx={{ borderRadius: 1.5 }}
            onClick={handleCapture}
            disabled={selectedCanvasId === null}
          >
            <CameraAltIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Reset Window">
        <span>
          <IconButton
            size="small"
            sx={{ borderRadius: 1.5 }}
            onClick={handleResetWindow}
            disabled={!isVolumeLoaded || selectedCanvasId === null}
          >
            <ContrastIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Sync Drawing to all views">
        <span>
          <IconButton
            size="small"
            sx={{ borderRadius: 1.5 }}
            onClick={updateViews}
            disabled={!isVolumeLoaded}
          >
            <CropDinRoundedIcon />
            <RefreshRoundedIcon
              sx={{ position: "absolute", fontSize: "0.8rem" }}
            />
          </IconButton>
        </span>
      </Tooltip>
      <Divider orientation="vertical" flexItem />
      <Menu anchorEl={anchorEl1} open={isPenMenuOpen} onClose={closePenMenu}>
        <MenuItem sx={{ padding: 0 }}>
          <Button
            sx={{ width: "100%", justifyContent: "start" }}
            onClick={(e) => {
              setPenState("draw");
              handleDrawMode(e, 6);
              closePenMenu();
            }}
          >
            <ListItemIcon>
              <DrawIcon />
            </ListItemIcon>
            <Typography variant="inherit">Annotate</Typography>
          </Button>
        </MenuItem>
        <MenuItem sx={{ padding: 0 }}>
          <Button
            sx={{ width: "100%" }}
            onClick={(e) => {
              setPenState("flood");
              handleDrawMode(e, Number.POSITIVE_INFINITY);
              closePenMenu();
            }}
          >
            <ListItemIcon>
              <FormatColorFill />
            </ListItemIcon>
            <Typography variant="inherit">Fill Calcium</Typography>
          </Button>
        </MenuItem>
      </Menu>
      <ToggleButtonGroup
        value={drawMode[selectedCanvasId]}
        exclusive
        onChange={handleDrawMode}
        disabled={
          !isVolumeLoaded ||
          selectedCanvasId !== 0 ||
          Array.isArray(segmentationTypeLoaded)
        }
      >
        <Tooltip title="Draw Segmentation">
          <span>
            <ToggleButton
              value={penState === "draw" ? 6 : Number.POSITIVE_INFINITY}
              size="small"
              onClick={queue === Queue.CALCIUM ? openPenMenu : null}
            >
              {penState === "draw" ? (
                <DrawIcon />
              ) : penState === "flood" ? (
                <FormatColorFill />
              ) : null}
            </ToggleButton>
          </span>
        </Tooltip>
        <Menu
          anchorEl={anchorEl2}
          open={isEraseMenuOpen}
          onClose={closeEraseMenu}
        >
          <MenuItem sx={{ padding: 0 }}>
            <Button
              sx={{ width: "100%", justifyContent: "start" }}
              onClick={(e) => {
                setEraseState("erase");
                handleDrawMode(e, 0);
                closeEraseMenu();
              }}
            >
              <ListItemIcon>
                <AutoFixHighIcon />
              </ListItemIcon>
              <Typography variant="inherit">Erase</Typography>
            </Button>
          </MenuItem>
          <MenuItem sx={{ padding: 0 }}>
            <Button
              sx={{ width: "100%" }}
              onClick={(e) => {
                setEraseState("eraseCluster");
                handleDrawMode(e, -0);
                closeEraseMenu();
              }}
            >
              <ListItemIcon>
                <FormatColorResetIcon />
              </ListItemIcon>
              <Typography variant="inherit">Erase Segment</Typography>
            </Button>
          </MenuItem>
        </Menu>
        <Tooltip title="Erase Segmentation">
          <span>
            <ToggleButton
              value={eraseState === "erase" ? 0 : -0}
              size="small"
              onClick={queue === Queue.CALCIUM ? openEraseMenu : null}
            >
              {eraseState === "erase" ? (
                <AutoFixHighIcon />
              ) : eraseState === "eraseCluster" ? (
                <FormatColorResetIcon />
              ) : null}
            </ToggleButton>
          </span>
        </Tooltip>
      </ToggleButtonGroup>
      <Tooltip title="Undo Drawing">
        <span>
          <IconButton
            size="small"
            sx={{ borderRadius: 1.5 }}
            onClick={handleUndoDraw}
            disabled={
              !isVolumeLoaded ||
              selectedCanvasId !== 0 ||
              Array.isArray(segmentationTypeLoaded)
            }
          >
            <UndoIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Save Drawing">
        <span>
          <IconButton
            size="small"
            sx={{ borderRadius: 1.5 }}
            onClick={handleSaveDrawing}
            loading={loading}
            disabled={
              !isVolumeLoaded ||
              selectedCanvasId !== 0 ||
              Array.isArray(segmentationTypeLoaded)
            }
          >
            <SaveIcon />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
