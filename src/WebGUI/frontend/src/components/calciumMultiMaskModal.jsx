// import * as React from 'react';
import React, { useState, useEffect } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";

import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import FormGroup from "@mui/material/FormGroup";
import Checkbox from "@mui/material/Checkbox";

const CalciumMultiMaskModal = ({ closeDialog, loadMultiMask, segs }) => {
  const [masks, setMasks] = useState({});

  useEffect(() => {
    let seg_masks = {};

    if (segs) {
      for (let index = 0; index < segs.length; index++) {
        seg_masks[segs[index].mask_type] = false;
      }

      setMasks(seg_masks);
    }
  }, [segs]);

  const maskChange = (event) => {
    setMasks({
      ...masks,
      [event.target.name]: event.target.checked,
    });
  };

  const loadedMasks = () => {
    const arr = [];

    for (const [key, value] of Object.entries(masks)) {
      if (value) arr.push(key);
    }

    return arr;
  };

  return (
    <Dialog
      open={true}
      onClose={closeDialog}
      fullWidth
      maxWidth="sm"
      aria-labelledby="edit-apartment"
    >
      <DialogTitle>Options:</DialogTitle>
      <DialogContent>
        <FormControl style={{ flexDirection: "column", display: "block" }}>
          <FormLabel component="legend">Select Masks</FormLabel>
          <FormGroup>
            {Object.keys(masks).map((key) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={masks[key]}
                    onChange={maskChange}
                    name={key}
                  />
                }
                label={key}
              />
            ))}
          </FormGroup>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            loadMultiMask(loadedMasks());
            closeDialog();
          }}
        >
          Load
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CalciumMultiMaskModal;
