import * as React from "react";
import {
  Alert,
  Button,
  Badge,
  IconButton,
  Snackbar,
  SnackbarContent,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

const TaskAlertContext = React.createContext();

export function useTaskAlert() {
  const context = React.useContext(TaskAlertContext);
  if (!context) {
    throw new Error("useTaskAlert must be used within a TaskAlertProvider");
  }
  return context;
}

function TaskAlerts({ alerts }) {
  const currentAlert = alerts[0] ?? null;
  return currentAlert ? (
    <TaskAlert
      {...currentAlert}
      badge={alerts.length > 1 ? String(alerts.length) : null}
    />
  ) : null;
}

function TaskAlert({
  notificationKey,
  open,
  severity,
  message,
  options,
  badge,
  completed,
}) {
  const { actionText, onAction, autoHideDuration, anchorOrigin } = options;
  const { close } = React.useContext(TaskAlertContext);
  const handleClose = React.useCallback(
    (event, reason) => {
      if (reason === "clickaway") {
        return;
      }
      close(notificationKey);
    },
    [notificationKey, close]
  );
  const action = (
    <>
      {(onAction && completed) ? (
        <Button color="info" size="small" onClick={onAction}>
          {actionText || "Action"}
        </Button>
      ) : null}
      <IconButton
        color="inherit"
        size="small"
        title="Dismiss"
        onClick={handleClose}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </>
  );
  return (
    <Snackbar
      key={notificationKey}
      open={open}
      autoHideDuration={autoHideDuration || null}
      onClose={handleClose}
      anchorOrigin={anchorOrigin || { vertical: "bottom", horizontal: "left" }}
      action
    >
      <Badge badgeContent={badge} color="primary" sx={{ width: "100%" }}>
        {severity ? (
          <Alert
            severity={severity}
            sx={{ width: "100%" }}
            action={action}
          >
            {message}
          </Alert>
        ) : (
          <SnackbarContent
            message={message}
            action={action}
          />
        )}
      </Badge>
    </Snackbar>
  );
}

export function TaskAlertProvider({ children }) {
  const [alerts, setAlerts] = React.useState([]);
  const show = React.useCallback((message, options, props) => {
    const notificationKey = props.taskId;
    setAlerts((prevAlerts) => {
      if (
        prevAlerts.some((alert) => alert.notificationKey === notificationKey)
      ) {
        return prevAlerts;
      }
      return [
        ...prevAlerts,
        {
          message,
          options,
          notificationKey,
          open: true,
          completed: false,
          error: false,
          ...props,
        },
      ];
    });
    return notificationKey;
  }, []);

  const close = React.useCallback((notificationKey) => {
    setAlerts((prevAlerts) =>
      prevAlerts.filter((alert) => alert.notificationKey !== notificationKey)
    );
  }, []);

  React.useEffect(() => {
    const updateTaskStatus = async (taskId, callback) => {
      const response = await callback(taskId);
      if (response.status === "completed" || response.status === "finished") {
        setAlerts((prevAlerts) =>
          prevAlerts.map((alert) =>
            alert.taskId === taskId
              ? { ...alert, completed: true, message: "Task Complete" }
              : alert
          )
        );
      } else if (response.status === "failed") {
        setAlerts((prevAlerts) =>
          prevAlerts.map((alert) =>
            alert.taskId === taskId
              ? {
                  ...alert,
                  error: true,
                  severity: "error",
                  message: "Task Error",
                }
              : alert
          )
        );
      }
    };
    const intervalIds = {};
    alerts.forEach((alert) => {
      // setup interval to update task status
      if (alert.completed || alert.error) {
        clearInterval(intervalIds[alert.taskId]);
        delete intervalIds[alert.taskId];
        return;
      }
      updateTaskStatus(alert.taskId, alert.callback);
      intervalIds[alert.taskId] = setInterval(
        updateTaskStatus,
        alert.pollInterval,
        alert.taskId,
        alert.callback
      );
    });

    // Clear intervals on unmount
    return () => {
      Object.values(intervalIds).forEach((id) => clearInterval(id));
    };
  }, [alerts]);

  const contextValue = React.useMemo(() => ({ show, close }), [show, close]);

  return (
    <TaskAlertContext.Provider value={contextValue}>
      {children}
      <TaskAlerts alerts={alerts} />
    </TaskAlertContext.Provider>
  );
}
