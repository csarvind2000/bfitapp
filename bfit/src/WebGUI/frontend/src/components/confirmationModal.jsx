import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

const ConfirmationModal = ({
  title,
  contents = "",
  closeDialog,
  handleConfirm,
  agreeText = "Yes",
  disagreeText = "No",
  args,
}) => {
  return (
    <Dialog
      open={true}
      onClose={closeDialog}
      fullWidth
      maxWidth="sm"
      aria-labelledby="edit-apartment"
    >
      <DialogTitle>{title ? title : "Are you sure about this?"}</DialogTitle>
      <DialogContent>
        <DialogContentText>{contents}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => {
            handleConfirm(...args);
            closeDialog();
          }}
        >
          {agreeText}
        </Button>
        <Button onClick={closeDialog}>{disagreeText}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmationModal;
