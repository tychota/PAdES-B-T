import { Box, Checkbox, Group, ScrollArea, Switch, Text } from "@mantine/core";
import { useAtom, useAtomValue } from "jotai";
import { LogEntry } from "packages/shared/dist/types/common";

import { indentBackendLogsAtom, logsAtom, showLogTimestampsAtom } from "../store/atoms";

const levelColor: Record<LogEntry["level"], string> = {
  error: "var(--mantine-color-red-6)",
  warning: "var(--mantine-color-yellow-6)",
  success: "var(--mantine-color-green-6)",
  info: "var(--mantine-color-blue-6)",
  debug: "var(--mantine-color-gray-6)",
};

function formatLine(log: LogEntry, showTs: boolean): string {
  const ts = showTs ? new Date(log.timestamp).toLocaleTimeString("fr-FR") + " " : "";
  const lvl = (log.level || "info").toUpperCase().padEnd(7, " ");
  const src = `[${(log.source || "app").toUpperCase()}]`;
  return `${ts}${lvl}${src} ${log.message}`;
}

export function TerminalLogView() {
  const logs = useAtomValue(logsAtom);
  const [showTs, setShowTs] = useAtom(showLogTimestampsAtom);
  const [indentBackend, setIndentBackend] = useAtom(indentBackendLogsAtom);

  return (
    <Box>
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <Switch
            size="xs"
            checked={showTs}
            onChange={(e) => setShowTs(e.currentTarget.checked)}
            label="Show timestamps"
          />
          <Checkbox
            size="xs"
            checked={indentBackend}
            onChange={(e) => setIndentBackend(e.currentTarget.checked)}
            label="Indent backend/CPS"
          />
        </Group>
        <Text size="xs" c="dimmed">
          {logs.length} entries
        </Text>
      </Group>

      <ScrollArea h={400} type="auto">
        <Box
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 12,
            lineHeight: 1.4,
            background: "var(--mantine-color-gray-0)",
            padding: 8,
            borderRadius: 8,
          }}
        >
          {logs.map((log: LogEntry, i: number) => {
            const color = levelColor[log.level];
            const indent =
              indentBackend &&
              (log.source === "backend" || log.source === "cps" || log.source === "mock-hsm")
                ? 16
                : 0;
            return (
              <Box key={i} style={{ paddingLeft: indent }}>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    color,
                  }}
                >
                  {formatLine(log, showTs)}
                </pre>
                {log.context ? (
                  <pre
                    style={{
                      margin: 0,
                      color: "var(--mantine-color-gray-7)",
                      paddingLeft: indent + 8,
                    }}
                  >
                    {JSON.stringify(log.context, null, 2)}
                  </pre>
                ) : null}
              </Box>
            );
          })}
        </Box>
      </ScrollArea>
    </Box>
  );
}
