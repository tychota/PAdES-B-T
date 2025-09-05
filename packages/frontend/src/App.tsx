import { AppShell, Group, Badge, MantineProvider, Title, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { IconHeartbeat } from "@tabler/icons-react";
import { useState, useEffect } from "react";

import { PDFWorkflow } from "./components/PDFWorkflow";
import { SigningMethodToggle } from "./components/SigningMethodToggle";
import { TSAToggle } from "./components/TSAToggle";
import { ApiClient } from "./services/api";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

const theme = createTheme({
  fontFamily: "Inter, sans-serif",
  primaryColor: "blue",
});

function App() {
  const [serverOk, setServerOk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiClient = new ApiClient();
    apiClient
      .checkHealth()
      .then((response) => setServerOk(response.success && response.status === "OK"))
      .catch(() => setServerOk(false))
      .finally(() => setLoading(false));
  }, []);

  const getStatus = () => {
    if (loading) return { label: "Checking...", color: "blue" };
    if (serverOk) return { label: "OK", color: "green" };
    return { label: "Error", color: "red" };
  };

  const status = getStatus();

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications />
      <AppShell header={{ height: 60 }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Group gap="xl">
              <Title order={3}>PAdES POC</Title>
              <SigningMethodToggle />
              <TSAToggle />
            </Group>
            <Badge
              size="lg"
              variant="light"
              color={status.color}
              leftSection={<IconHeartbeat size={16} />}
            >
              SERVER STATUS: {status.label}
            </Badge>
          </Group>
        </AppShell.Header>

        <AppShell.Main>
          <PDFWorkflow />
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}

export default App;
