import * as React from "react";
import { useState } from "react";
import { Box, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { AETitle, ListenerPort, Version } from "../constants";
import { PageContainer } from "@toolpad/core/PageContainer";

interface TabPanelProps {
  children?: React.ReactNode;
  elementIndex: number;
  selectedTab: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, elementIndex, selectedTab } = props;
  return (
    <div
      role="tabpanel"
      hidden={selectedTab !== elementIndex}
      id={`vertical-tabpanel-${elementIndex}`}
      aria-labelledby={`vertical-tab-${elementIndex}`}
    >
      {selectedTab === elementIndex && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function SettingsPage() {
  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <PageContainer>
      <Box
        sx={{
          flexGrow: 1,
          bgcolor: "background.paper",
          display: "flex",
          height: "100%",
        }}
      >
        <Tabs
          orientation="vertical"
          value={selectedTab}
          onChange={(_, newValue) => setSelectedTab(newValue)}
          sx={{
            borderRight: 1,
            borderColor: "divider",
            "& .MuiTab-root": {
              alignItems: "flex-start",
              textAlign: "left",
              justifyContent: "center",
            },
            "& .MuiTabs-indicator": { left: 0, width: "3px" },
          }}
        >
          <Tab
            label="About BFIT"
            id="vertical-tab-0"
            aria-controls="settings-tabpanel-about"
          />
          <Tab
            label="PACS Configuration"
            id="vertical-tab-1"
            aria-controls="settings-tabpanel-pacs"
          />
        </Tabs>
        <TabPanel elementIndex={0} selectedTab={selectedTab}>
          <Typography variant="h6" gutterBottom>
            About BFIT
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            Version
          </Typography>
          <Typography variant="body2" gutterBottom>
            {Version}
          </Typography>
          <Typography variant="body1" gutterBottom>
            Developed by Bioinformatics Institute (BII), A*STAR Research Entities
          </Typography>
          <Typography variant="caption" gutterBottom>
            Strictly for research use only. Not for clinical use.
          </Typography>
        </TabPanel>
        <TabPanel elementIndex={1} selectedTab={selectedTab}>
          <Typography variant="h6" gutterBottom>
            PACS Configuration
          </Typography>
          <Typography variant="body1" fontWeight="medium" gutterBottom>
            Local DICOM Server
          </Typography>
          <Stack direction={"row"} spacing={2} sx={{ mt: 2 }}>
            <TextField
              label="Listener Port"
              color="secondary"
              defaultValue={ListenerPort}
              fullWidth
              variant="outlined"
              margin="normal"
              disabled
              sx={{
                "& .MuiInputBase-input.Mui-disabled": {
                  WebkitTextFillColor: "white",
                },
              }}
            />
            <TextField
              label="AE Title"
              color="secondary"
              defaultValue={AETitle}
              fullWidth
              variant="outlined"
              margin="normal"
              disabled
              sx={{
                "& .MuiInputBase-input.Mui-disabled": {
                  WebkitTextFillColor: "white",
                },
              }}
            />
          </Stack>
          <Typography
            variant="body1"
            fontWeight="medium"
            gutterBottom
            sx={{ mt: 2 }}
          >
            Remote PACS Server
          </Typography>
          <Typography variant="body2" gutterBottom>
            🚧 Feature to be implemented 🚧
          </Typography>
        </TabPanel>
      </Box>
    </PageContainer>
  );
}
