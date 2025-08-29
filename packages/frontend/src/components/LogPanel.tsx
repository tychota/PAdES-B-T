import { Tabs, Text } from "@mantine/core";
import { IconBug, IconFileText } from "@tabler/icons-react";
import { useAtomValue } from "jotai";

import { logsAtom } from "../store/atoms";

import { DebugInspector } from "./DebugInspector";
import { TerminalLogView } from "./TerminalLogView";

export function LogPanel() {
  const logs = useAtomValue(logsAtom);

  return (
    <Tabs defaultValue="logs">
      <Tabs.List>
        <Tabs.Tab value="logs" leftSection={<IconFileText size={16} />}>
          Log System
        </Tabs.Tab>
        <Tabs.Tab value="debugger" leftSection={<IconBug size={16} />}>
          Debugger
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="logs" pt="xs">
        {logs.length === 0 ? (
          <Text c="dimmed" ta="center" pt="xl">
            Logs will appear here.
          </Text>
        ) : (
          <TerminalLogView />
        )}
      </Tabs.Panel>

      <Tabs.Panel value="debugger" pt="xs">
        <DebugInspector />
      </Tabs.Panel>
    </Tabs>
  );
}
