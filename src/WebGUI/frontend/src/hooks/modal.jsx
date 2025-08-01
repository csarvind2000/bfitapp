import { useState } from "react";

export const useModal = ({
  handleConfirm,
  initialArgs = [],
  settings = {},
  onOpen = null,
  onClose = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [args, setArgs] = useState(initialArgs);

  const openDialog = onOpen
    ? onOpen
    : (args = []) => {
        setArgs(args);
        setIsOpen(true);
      };
  const closeDialog = onClose ? onClose : () => setIsOpen(false);

  const modalProps = { handleConfirm, closeDialog, args, ...settings };

  return [modalProps, isOpen, openDialog, setIsOpen, setArgs];
};
