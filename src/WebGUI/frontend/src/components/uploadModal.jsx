import * as React from "react";
import {
  Modal,
  Box,
  Typography,
  Button,
  CircularProgress,
} from "@mui/material";
import { useDropzone } from "react-dropzone";
import { useAlert } from "../hooks/alert";
import studyService from "../services/studies";

export default function UploadModal({ open, onClose, getStudy }) {
  const [files, setFiles] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const showAlert = useAlert();

  const onDrop = React.useCallback(
    (acceptedFiles, fileRejections) => setFiles(acceptedFiles),
    []
  );

  const generateUploadSummaryMessage = (response) => {
    const studyIds = Object.keys(response);
    const numStudies = studyIds.length;
    let html;
    if (numStudies === 0) {
      return "No studies were processed";
    } else {
      html =
        numStudies > 1
          ? `<p><strong>Uploaded ${numStudies} studies</strong></p><ul style="padding-left:1.2em; margin-left: 0;">`
          : `<p><strong>Uploaded 1 study</strong></p><ul style="padding-left:1.2em; margin-left: 0;">`;
    }

    for (const studyId of studyIds) {
      const series = response[studyId];
      const seriesIds = Object.keys(series);
      const instance = series[seriesIds[0]][0];

      const patientId = instance?.metadata["Patient ID"];
      const patientName = instance?.metadata["Patient Name"];
      const studyLabel = patientName || patientId || studyId;
      html += `<li>${studyLabel}<ul style="padding-left:1.2em; margin-left: 0;">`;

      for (const seriesId of seriesIds) {
        const instances = series[seriesId].length;
        html += `<li>Series ${seriesId} (${instances} instance(s))</li>`;
      }
      html += "</ul></li>";
    }
    html += "</ul>";

    return (
      <div
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ textAlign: "left", padding: 0, margin: 0, userSelect: "all" }}
      />
    );
  };

  const handleUpload = React.useCallback(async () => {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    try {
      setUploading(true);
      console.debug("starting file upload");
      const response = await studyService.create(formData);
      console.debug(`file upload response ${JSON.stringify(response)}`);
      if (response) {
        getStudy();
        const message = generateUploadSummaryMessage(response);
        showAlert(message, "info");
      }
    } catch (error) {
      console.error(error);
      showAlert(
        `Failed to upload files ${JSON.stringify(error.response?.data)}`,
        "error"
      );
    } finally {
      setFiles([]);
      setUploading(false);
    }
  });

  const { fileRejections, getRootProps, getInputProps } = useDropzone({
    // accept: { "application/dicom": [] },
    multiple: true,
    onDrop: onDrop,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="upload-study-modal"
      aria-describedby="upload-study-modal-detail"
    >
      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          bgcolor: "background.paper",
          boxShadow: 24,
          p: 4,
          borderRadius: 2,
          width: "400px",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Typography id="upload-study-modal" variant="h6" component="h2">
          Upload Studies
        </Typography>
        <Typography id="upload-study-modal-detail" sx={{ mt: 2 }}>
          Supported file types are .dicom, .dcm
        </Typography>

        <Box
          {...getRootProps()}
          sx={{
            mt: 3,
            border: "2px dashed #1976d2",
            borderRadius: 1,
            p: 3,
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <input {...getInputProps()} disabled={uploading} />
          <Typography variant="body2" color="text.secondary">
            Drag and drop files here or click to select
          </Typography>
        </Box>

        {files.length > 0 && (
          <Box sx={{ mt: 3, maxHeight: "200px", overflowY: "auto" }}>
            <ul style={{ padding: 0, margin: 0, listStyle: "none" }}>
              {files.map((file, index) => (
                <li
                  key={index}
                  style={{
                    display: "inline-block",
                    alignItems: "center",
                    padding: "8px 12px",
                    marginBottom: "8px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    backgroundColor: "background.paper",
                    wordBreak: "break-all",
                    width: "100%",
                  }}
                >
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {file.name}
                  </Typography>
                </li>
              ))}
            </ul>
          </Box>
        )}

        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
          <Button variant="outlined" onClick={onClose} disabled={uploading}>
            Dismiss
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleUpload}
            disabled={uploading || files.length === 0}
          >
            {uploading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Upload Files"
            )}
          </Button>
        </Box>
      </Box>
    </Modal>
  );
}
