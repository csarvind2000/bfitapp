import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

const ConfirmationModal = ({
  title,
  contents = "",
  closeDialog,
  handleConfirm,
  agreeText = "Yes",
  disagreeText = "No",
  args,
  destructive = false,
}) => {
  const normalizedArgs = Array.isArray(args) ? args : args !== undefined ? [args] : [];

  return (
    <Dialog
      open={true}
      onClose={closeDialog}
      fullWidth
      maxWidth="sm"
      aria-labelledby="confirmation-dialog-title"
      PaperProps={{
        sx: {
          bgcolor: "#1f2630",
          border: "1px solid",
          borderColor: destructive ? "rgba(248,113,113,0.35)" : "divider",
          borderRadius: 2,
          boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
        },
      }}
    >
      <DialogTitle id="confirmation-dialog-title" sx={{ pb: 1.25 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          {destructive && (
            <WarningAmberIcon
              sx={{
                color: "#f87171",
                fontSize: 24,
                flexShrink: 0,
              }}
            />
          )}
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
            {title || "Confirm action"}
          </Typography>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        {contents && (
          <DialogContentText
            sx={{
              color: "text.secondary",
              fontSize: "0.95rem",
              lineHeight: 1.6,
            }}
          >
            {contents}
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1 }}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={closeDialog}
          sx={{ minWidth: 96 }}
        >
          {disagreeText}
        </Button>
        <Button
          variant="contained"
          color={destructive ? "error" : "secondary"}
          onClick={() => {
            handleConfirm(...normalizedArgs);
            closeDialog();
          }}
          sx={{ minWidth: destructive ? 130 : 96, fontWeight: 700 }}
        >
          {agreeText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmationModal;
