import { CodeHighlight } from "@mantine/code-highlight";
import { Tabs, ScrollArea, Text } from "@mantine/core";
import { IconBug, IconFileText } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { Virtuoso } from "react-virtuoso";

import { logsAtom, workflowStateAtom } from "../store/atoms";

import { LogEntryView } from "./LogEntryView";

export function LogPanel() {
  const logs = useAtomValue(logsAtom);
  const workflowState = useAtomValue(workflowStateAtom);

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
        <ScrollArea h={400}>
          {logs.length === 0 ? (
            <Text c="dimmed" ta="center" pt="xl">
              Logs will appear here.
            </Text>
          ) : (
            <Virtuoso
              style={{ height: 400 }}
              data={logs}
              itemContent={(index, log) => <LogEntryView log={log} />}
            />
          )}
        </ScrollArea>
      </Tabs.Panel>

      <Tabs.Panel value="debugger" pt="xs">
        <ScrollArea h={400}>
          <CodeHighlight
            language="json"
            code={JSON.stringify(
              workflowState,
              (key: string, value: unknown): unknown => {
                if (typeof value === "string" && value.length > 100) {
                  return `${value.substring(0, 100)}...`;
                }
                return value;
              },
              2,
            )}
          />
        </ScrollArea>
      </Tabs.Panel>
    </Tabs>
  );
}
